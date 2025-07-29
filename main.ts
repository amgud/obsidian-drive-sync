import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder } from 'obsidian';
import { google } from 'googleapis';

interface ObsidianDriveSettings {
	googleDriveClientId: string;
	googleDriveClientSecret: string;
	refreshToken: string;
	syncInterval: number;
	autoSync: boolean;
	syncOnSave: boolean;
	manualSync: boolean;
	storageLocation: 'appDataFolder' | 'visible';
	visibleFolderName: string;
}

const DEFAULT_SETTINGS: ObsidianDriveSettings = {
	googleDriveClientId: '',
	googleDriveClientSecret: '',
	refreshToken: '',
	syncInterval: 300000, // 5 minutes
	autoSync: false,
	syncOnSave: false,
	manualSync: true,
	storageLocation: 'appDataFolder',
	visibleFolderName: 'Obsidian Vault'
};

export default class ObsidianDrivePlugin extends Plugin {
	settings: ObsidianDriveSettings;
	drive: any;
	oauth2Client: any;
	syncInterval: NodeJS.Timer | null = null;
	visibleFolderId: string | null = null;

	async onload() {
		await this.loadSettings();

		// Initialize Google Drive API
		this.initializeGoogleDrive();

		// Add ribbon icon and command if manual sync is enabled
		if (this.settings.manualSync) {
			this.addRibbonIcon('cloud', 'Sync with Google Drive', async () => {
				await this.syncVault();
			});

			this.addCommand({
				id: 'sync-vault',
				name: 'Sync vault with Google Drive',
				callback: async () => {
					await this.syncVault();
				}
			});
		}

		this.addCommand({
			id: 'authenticate-drive',
			name: 'Authenticate Google Drive',
			callback: async () => {
				await this.authenticateGoogleDrive();
			}
		});

		// Add settings tab
		this.addSettingTab(new ObsidianDriveSettingTab(this.app, this));

		// Add file change listener for sync on save
		if (this.settings.syncOnSave) {
			this.registerEvent(
				this.app.vault.on('modify', async (file) => {
					if (file instanceof TFile && this.drive) {
						await this.syncFile(file);
					}
				})
			);
		}

		// Start auto-sync if enabled
		if (this.settings.autoSync) {
			this.startAutoSync();
		}
	}

	onunload() {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	initializeGoogleDrive() {
		if (!this.settings.googleDriveClientId || !this.settings.googleDriveClientSecret) {
			return;
		}

		this.oauth2Client = new google.auth.OAuth2(
			this.settings.googleDriveClientId,
			this.settings.googleDriveClientSecret,
			'urn:ietf:wg:oauth:2.0:oob'
		);

		if (this.settings.refreshToken) {
			this.oauth2Client.setCredentials({
				refresh_token: this.settings.refreshToken
			});
		}

		this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
	}

	async authenticateGoogleDrive(): Promise<void> {
		if (!this.settings.googleDriveClientId || !this.settings.googleDriveClientSecret) {
			new Notice('Please configure Google Drive API credentials in settings first.');
			return;
		}

		const authUrl = this.oauth2Client.generateAuthUrl({
			access_type: 'offline',
			scope: ['https://www.googleapis.com/auth/drive.file']
		});

		// Copy URL to clipboard and show notice
		await navigator.clipboard.writeText(authUrl);
		new Notice('Authentication URL copied to clipboard! Paste it in your browser to authorize.', 8000);
	}

	async setAuthCode(code: string): Promise<void> {
		try {
			const { tokens } = await this.oauth2Client.getToken(code);
			this.settings.refreshToken = tokens.refresh_token;
			await this.saveSettings();
			this.initializeGoogleDrive();
			new Notice('Google Drive authentication successful!');
		} catch (error) {
			console.error('Error during authentication:', error);
			new Notice('Authentication failed. Please check the authorization code.');
		}
	}

	async syncVault(): Promise<void> {
		if (!this.drive) {
			new Notice('Please authenticate with Google Drive first.');
			return;
		}

		try {
			new Notice('Starting vault sync...');

			// Ensure visible folder exists if using visible storage
			if (this.settings.storageLocation === 'visible') {
				await this.ensureVisibleFolderExists();
			}

			// Get all files in the vault
			const files = this.app.vault.getFiles();

			for (const file of files) {
				await this.syncFile(file);
			}

			new Notice('Vault sync completed!');
		} catch (error) {
			console.error('Sync error:', error);
			new Notice('Sync failed. Check console for details.');
		}
	}

	async syncFile(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file);
			const fileName = file.path;

			// Check if file exists on Google Drive
			const listOptions: any = {
				q: this.getSearchQuery(fileName)
			};
			
			const searchSpace = this.getSearchSpace();
			if (searchSpace) {
				listOptions.spaces = searchSpace;
			}

			const response = await this.drive.files.list(listOptions);

			if (response.data.files && response.data.files.length > 0) {
				// Update existing file
				const fileId = response.data.files[0].id;
				await this.drive.files.update({
					fileId: fileId,
					media: {
						mimeType: 'text/plain',
						body: content
					}
				});
			} else {
				// Create new file
				await this.drive.files.create({
					requestBody: {
						name: fileName,
						parents: this.getParentId()
					},
					media: {
						mimeType: 'text/plain',
						body: content
					}
				});
			}
		} catch (error) {
			console.error(`Error syncing file ${file.path}:`, error);
		}
	}

	startAutoSync(): void {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
		}

		this.syncInterval = setInterval(async () => {
			await this.syncVault();
		}, this.settings.syncInterval);
	}

	stopAutoSync(): void {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
	}

	async ensureVisibleFolderExists(): Promise<void> {
		if (this.visibleFolderId) {
			return;
		}

		try {
			// Check if folder already exists
			const response = await this.drive.files.list({
				q: `name='${this.settings.visibleFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
			});

			if (response.data.files && response.data.files.length > 0) {
				this.visibleFolderId = response.data.files[0].id;
			} else {
				// Create the folder
				const folderResponse = await this.drive.files.create({
					requestBody: {
						name: this.settings.visibleFolderName,
						mimeType: 'application/vnd.google-apps.folder'
					}
				});
				this.visibleFolderId = folderResponse.data.id;
			}
		} catch (error) {
			console.error('Error ensuring visible folder exists:', error);
			throw error;
		}
	}

	getParentId(): string[] {
		if (this.settings.storageLocation === 'visible' && this.visibleFolderId) {
			return [this.visibleFolderId];
		}
		return ['appDataFolder'];
	}

	getSearchQuery(fileName: string): string {
		if (this.settings.storageLocation === 'visible' && this.visibleFolderId) {
			return `name='${fileName}' and parents in '${this.visibleFolderId}'`;
		}
		return `name='${fileName}' and parents in 'appDataFolder'`;
	}

	getSearchSpace(): string | undefined {
		if (this.settings.storageLocation === 'visible') {
			return undefined;
		}
		return 'appDataFolder';
	}
}

class ObsidianDriveSettingTab extends PluginSettingTab {
	plugin: ObsidianDrivePlugin;

	constructor(app: App, plugin: ObsidianDrivePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Obsidian Drive Sync Settings' });

		new Setting(containerEl)
			.setName('Google Drive Client ID')
			.setDesc('Your Google Drive API Client ID')
			.addText(text => text
				.setPlaceholder('Enter your Client ID')
				.setValue(this.plugin.settings.googleDriveClientId)
				.onChange(async (value) => {
					this.plugin.settings.googleDriveClientId = value;
					await this.plugin.saveSettings();
					this.plugin.initializeGoogleDrive();
				}));

		new Setting(containerEl)
			.setName('Google Drive Client Secret')
			.setDesc('Your Google Drive API Client Secret')
			.addText(text => text
				.setPlaceholder('Enter your Client Secret')
				.setValue(this.plugin.settings.googleDriveClientSecret)
				.onChange(async (value) => {
					this.plugin.settings.googleDriveClientSecret = value;
					await this.plugin.saveSettings();
					this.plugin.initializeGoogleDrive();
				}));

		new Setting(containerEl)
			.setName('Authenticate')
			.setDesc('Authenticate with Google Drive')
			.addButton(button => button
				.setButtonText('Get Auth URL')
				.onClick(async () => {
					await this.plugin.authenticateGoogleDrive();
				}));

		new Setting(containerEl)
			.setName('Authorization Code')
			.setDesc('Enter the authorization code from Google')
			.addText(text => text
				.setPlaceholder('Enter authorization code')
				.onChange(async (value) => {
					if (value.trim()) {
						await this.plugin.setAuthCode(value.trim());
					}
				}));

		new Setting(containerEl)
			.setName('Storage Location')
			.setDesc('Choose where to store files in Google Drive')
			.addDropdown(dropdown => dropdown
				.addOption('appDataFolder', 'Hidden (App Data Folder)')
				.addOption('visible', 'Visible (Custom Folder)')
				.setValue(this.plugin.settings.storageLocation)
				.onChange(async (value: 'appDataFolder' | 'visible') => {
					this.plugin.settings.storageLocation = value;
					await this.plugin.saveSettings();
					// Reset folder ID when switching storage types
					this.plugin.visibleFolderId = null;
				}));

		new Setting(containerEl)
			.setName('Visible Folder Name')
			.setDesc('Name of the folder in Google Drive (only used for visible storage)')
			.addText(text => text
				.setPlaceholder('Obsidian Vault')
				.setValue(this.plugin.settings.visibleFolderName)
				.onChange(async (value) => {
					this.plugin.settings.visibleFolderName = value || 'Obsidian Vault';
					await this.plugin.saveSettings();
					// Reset folder ID when changing folder name
					this.plugin.visibleFolderId = null;
				}));

		new Setting(containerEl)
			.setName('Manual Sync')
			.setDesc('Enable manual sync button and command')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.manualSync)
				.onChange(async (value) => {
					this.plugin.settings.manualSync = value;
					await this.plugin.saveSettings();
					
					// Restart plugin to register/unregister ribbon button and command
					new Notice('Please restart Obsidian to apply manual sync setting.');
				}));

		new Setting(containerEl)
			.setName('Sync on Save')
			.setDesc('Automatically sync files when they are saved')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncOnSave)
				.onChange(async (value) => {
					this.plugin.settings.syncOnSave = value;
					await this.plugin.saveSettings();
					
					// Restart plugin to register/unregister event listener
					new Notice('Please restart Obsidian to apply sync on save setting.');
				}));

		new Setting(containerEl)
			.setName('Auto Sync')
			.setDesc('Automatically sync vault at regular intervals')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSync)
				.onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();

					if (value) {
						this.plugin.startAutoSync();
					} else {
						this.plugin.stopAutoSync();
					}
				}));

		new Setting(containerEl)
			.setName('Sync Interval')
			.setDesc('Time between automatic syncs (in minutes)')
			.addSlider(slider => slider
				.setLimits(1, 60, 1)
				.setValue(this.plugin.settings.syncInterval / 60000)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.syncInterval = value * 60000;
					await this.plugin.saveSettings();

					if (this.plugin.settings.autoSync) {
						this.plugin.startAutoSync();
					}
				}));
	}
}
