import { App, Plugin, PluginSettingTab, Setting, Notice, TFile, TFolder } from 'obsidian';

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
	accessToken: string | null = null;
	syncInterval: number | null = null;
	visibleFolderId: string | null = null;

	async onload() {
		await this.loadSettings();

		// Initialize Google Drive API
		await this.initializeGoogleDrive();

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
					if (file instanceof TFile && this.accessToken) {
						await this.syncFile(file);
					}
				})
			);

			// Handle file renames
			this.registerEvent(
				this.app.vault.on('rename', async (file, oldPath) => {
					if (file instanceof TFile && this.accessToken) {
						await this.handleFileRename(file, oldPath);
					}
				})
			);

			// Handle file deletions
			this.registerEvent(
				this.app.vault.on('delete', async (file) => {
					if (file instanceof TFile && this.accessToken) {
						await this.handleFileDelete(file);
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
			window.clearInterval(this.syncInterval);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async initializeGoogleDrive() {
		if (!this.settings.googleDriveClientId || !this.settings.googleDriveClientSecret || !this.settings.refreshToken) {
			return;
		}

		try {
			await this.refreshAccessToken();
		} catch (error) {
			console.error('Failed to initialize Google Drive:', error);
		}
	}

	async authenticateGoogleDrive(): Promise<void> {
		if (!this.settings.googleDriveClientId || !this.settings.googleDriveClientSecret) {
			new Notice('Please configure Google Drive API credentials in settings first.');
			return;
		}

		const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
			`client_id=${encodeURIComponent(this.settings.googleDriveClientId)}&` +
			`redirect_uri=${encodeURIComponent('urn:ietf:wg:oauth:2.0:oob')}&` +
			`response_type=code&` +
			`scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.file')}&` +
			`access_type=offline`;

		// Copy URL to clipboard and show notice
		await navigator.clipboard.writeText(authUrl);
		new Notice('Authentication URL copied to clipboard! Paste it in your browser to authorize.', 8000);
	}

	async setAuthCode(code: string): Promise<void> {
		try {
			const response = await fetch('https://oauth2.googleapis.com/token', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					client_id: this.settings.googleDriveClientId,
					client_secret: this.settings.googleDriveClientSecret,
					code: code,
					grant_type: 'authorization_code',
					redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const tokens = await response.json();
			this.settings.refreshToken = tokens.refresh_token;
			this.accessToken = tokens.access_token;
			await this.saveSettings();
			await this.initializeGoogleDrive();
			new Notice('Google Drive authentication successful!');
		} catch (error) {
			console.error('Error during authentication:', error);
			new Notice('Authentication failed. Please check the authorization code.');
		}
	}

	async refreshAccessToken(): Promise<void> {
		if (!this.settings.refreshToken) {
			throw new Error('No refresh token available');
		}

		const response = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				client_id: this.settings.googleDriveClientId,
				client_secret: this.settings.googleDriveClientSecret,
				refresh_token: this.settings.refreshToken,
				grant_type: 'refresh_token'
			})
		});

		if (!response.ok) {
			throw new Error(`Failed to refresh token: ${response.status}`);
		}

		const tokens = await response.json();
		this.accessToken = tokens.access_token;
	}

	async getDriveFile(fileId: string, options: RequestInit={}): Promise<any> {
		if (!this.accessToken) {
			await this.refreshAccessToken();
		}

		const response = await fetch(`https://www.googleapis.com/drive/v3/${fileId}`, {
			...options,
			headers: {
				'Authorization': `Bearer ${this.accessToken}`,
				'Content-Type': 'application/json',
				...options.headers
			}
		});

		if (response.status === 401) {
			// Token expired, refresh and retry
			await this.refreshAccessToken();
			return this.driveApiRequest(fileId, options);
		}

		if (!response.ok) {
			throw new Error(`Drive API error: ${response.status}`);
		}

		return response.json();
	}

	async driveApiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
		if (!this.accessToken) {
			await this.refreshAccessToken();
		}

		const headers: Record<string, string> = {
			'Authorization': `Bearer ${this.accessToken}`,
			...(options.headers as Record<string, string> || {})
		};

		// Only set Content-Type to application/json if not already specified
		if (!headers['Content-Type']) {
			headers['Content-Type'] = 'application/json';
		}

		const response = await fetch(`https://www.googleapis.com/drive/v3/${endpoint}`, {
			...options,
			headers
		});

		if (response.status === 401) {
			// Token expired, refresh and retry
			await this.refreshAccessToken();
			return this.driveApiRequest(endpoint, options);
		}

		if (!response.ok) {
			throw new Error(`Drive API error: ${response.status}`);
		}

		return response.json();
	}

	async driveUploadRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
		if (!this.accessToken) {
			await this.refreshAccessToken();
		}

		const headers: Record<string, string> = {
			'Authorization': `Bearer ${this.accessToken}`,
			...(options.headers as Record<string, string> || {})
		};

		const response = await fetch(`https://www.googleapis.com/upload/drive/v3/${endpoint}`, {
			...options,
			headers
		});

		if (response.status === 401) {
			// Token expired, refresh and retry
			await this.refreshAccessToken();
			return this.driveUploadRequest(endpoint, options);
		}

		if (!response.ok) {
			throw new Error(`Drive Upload API error: ${response.status}`);
		}

		return response.json();
	}

	async syncVault(): Promise<void> {
		if (!this.accessToken) {
			new Notice('Please authenticate with Google Drive first.');
			return;
		}

		try {
			new Notice('Starting vault sync...');

			// Ensure visible folder exists if using visible storage
			if (this.settings.storageLocation === 'visible') {
				await this.ensureVisibleFolderExists();
			}

			// First, download files from Google Drive that don't exist locally
			await this.downloadMissingFiles();

			// Then, upload/update local files to Google Drive
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

	async downloadMissingFiles(): Promise<void> {
		try {
			// Get all files from Google Drive
			const queryParams = new URLSearchParams();
			
			if (this.settings.storageLocation === 'visible' && this.visibleFolderId) {
				queryParams.set('q', `parents in '${this.visibleFolderId}' and mimeType != 'application/vnd.google-apps.folder' and trashed=false`);
			} else {
				queryParams.set('q', `parents in 'appDataFolder' and mimeType != 'application/vnd.google-apps.folder' and trashed=false`);
				queryParams.set('spaces', 'appDataFolder');
			}

			const response = await this.getDriveFile(`files?${queryParams}`);

			if (response.files && response.files.length > 0) {
				for (const driveFile of response.files) {
					const fileName = driveFile.name;
					
					// Check if file exists locally
					const existingFile = this.app.vault.getAbstractFileByPath(fileName);
					if (!existingFile) {
						// Download the file from Google Drive
						await this.downloadFile(driveFile.id, fileName);
					}
				}
			}
		} catch (error) {
			console.error('Error downloading missing files:', error);
		}
	}

	async downloadFile(fileId: string, fileName: string): Promise<void> {
		try {
			// Download file content from Google Drive
			const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
				headers: {
					'Authorization': `Bearer ${this.accessToken}`
				}
			});

			if (!response.ok) {
				throw new Error(`Failed to download file: ${response.status}`);
			}

			const content = await response.text();
			
			// Create the file in Obsidian vault
			await this.app.vault.create(fileName, content);
			console.log(`Downloaded file: ${fileName}`);
		} catch (error) {
			console.error(`Error downloading file ${fileName}:`, error);
		}
	}

	async syncFile(file: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(file);
			const fileName = file.path;

			// Ensure visible folder exists if using visible storage
			if (this.settings.storageLocation === 'visible') {
				await this.ensureVisibleFolderExists();
			}

			// Check if file exists on Google Drive
			const listOptions: any = {
				q: this.getSearchQuery(fileName)
			};

			const searchSpace = this.getSearchSpace();
			if (searchSpace) {
				listOptions.spaces = searchSpace;
			}

			const queryParams = new URLSearchParams({
				q: listOptions.q
			});
			if (listOptions.spaces) {
				queryParams.append('spaces', listOptions.spaces);
			}
			const response = await this.getDriveFile(`files?${queryParams}`);

			if (response.files && response.files.length > 0) {
				// Update existing file
				const fileId = response.files[0].id;
				await this.driveUploadRequest(`files/${fileId}?uploadType=media`, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'text/plain'
					},
					body: content
				});
			} else {
				// Create new file
				const metadata = {
					name: fileName,
					parents: this.getParentId()
				};

				const form = new FormData();
				form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
				form.append('file', new Blob([content], {type: 'text/plain'}));

				await this.driveUploadRequest('files?uploadType=multipart', {
					method: 'POST',
					headers: {},
					body: form
				});
			}
		} catch (error) {
			console.error(`Error syncing file ${file.path}:`, error);
		}
	}

	async handleFileRename(file: TFile, oldPath: string): Promise<void> {
		try {
			// Ensure visible folder exists if using visible storage
			if (this.settings.storageLocation === 'visible') {
				await this.ensureVisibleFolderExists();
			}

			// Find the old file on Google Drive
			const oldQueryParams = new URLSearchParams({
				q: this.getSearchQuery(oldPath)
			});
			const searchSpace = this.getSearchSpace();
			if (searchSpace) {
				oldQueryParams.append('spaces', searchSpace);
			}
			const oldFileResponse = await this.getDriveFile(`files?${oldQueryParams}`);

			if (oldFileResponse.files && oldFileResponse.files.length > 0) {
				const fileId = oldFileResponse.files[0].id;
				
				// Update the file name on Google Drive
				await this.driveApiRequest(`files/${fileId}`, {
					method: 'PATCH',
					body: JSON.stringify({
						name: file.path
					})
				});

				// Also update the content in case it changed
				const content = await this.app.vault.read(file);
				await this.driveUploadRequest(`files/${fileId}?uploadType=media`, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'text/plain'
					},
					body: content
				});
			} else {
				// Old file not found, treat as new file
				await this.syncFile(file);
			}
		} catch (error) {
			console.error(`Error handling file rename from ${oldPath} to ${file.path}:`, error);
		}
	}

	async handleFileDelete(file: TFile): Promise<void> {
		try {
			// Ensure visible folder exists if using visible storage
			if (this.settings.storageLocation === 'visible') {
				await this.ensureVisibleFolderExists();
			}

			// Find the file on Google Drive
			const queryParams = new URLSearchParams({
				q: this.getSearchQuery(file.path)
			});
			const searchSpace = this.getSearchSpace();
			if (searchSpace) {
				queryParams.append('spaces', searchSpace);
			}
			const response = await this.getDriveFile(`files?${queryParams}`);

			if (response.files && response.files.length > 0) {
				const fileId = response.files[0].id;
				
				// Delete the file from Google Drive
				await this.driveApiRequest(`files/${fileId}`, {
					method: 'DELETE'
				});
				
				console.log(`Deleted file ${file.path} from Google Drive`);
			} else {
				console.log(`File ${file.path} not found on Google Drive, nothing to delete`);
			}
		} catch (error) {
			console.error(`Error deleting file ${file.path} from Google Drive:`, error);
		}
	}

	startAutoSync(): void {
		if (this.syncInterval) {
			window.clearInterval(this.syncInterval);
		}

		this.syncInterval = window.setInterval(async () => {
			await this.syncVault();
		}, this.settings.syncInterval);
	}

	stopAutoSync(): void {
		if (this.syncInterval) {
			window.clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
	}

	async ensureVisibleFolderExists(): Promise<void> {
		if (this.visibleFolderId) {
			return;
		}

		try {
			// Check if folder already exists
			const queryParams = new URLSearchParams({
				q: `name='${this.settings.visibleFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
			});
			const response = await this.getDriveFile(`files?${queryParams}`);

			if (response.files && response.files.length > 0) {
				this.visibleFolderId = response.files[0].id;
			} else {
				// Create the folder
				const folderResponse = await this.driveApiRequest('files', {
					method: 'POST',
					body: JSON.stringify({
						name: this.settings.visibleFolderName,
						mimeType: 'application/vnd.google-apps.folder'
					})
				});
				this.visibleFolderId = folderResponse.id;
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
					await this.plugin.initializeGoogleDrive();
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
					await this.plugin.initializeGoogleDrive();
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
