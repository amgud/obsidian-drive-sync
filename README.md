# 🌟 Obsidian Drive Sync

Keep your Obsidian vault synchronized with Google Drive automatically! ☁️ This plugin allows you to backup and sync your notes to Google Drive in two modes: hidden app-specific storage or a visible folder you can access directly.

## ✨ Features

- 🔄 **Automatic Sync**: Set up automatic syncing at regular intervals
- 🔒 **Two Storage Options**: Choose between hidden app-specific storage or visible Google Drive folder
- 🚀 **One-Click Sync**: Manual sync with ribbon icon or command palette
- 📱 **Cross-Platform**: Works on desktop and mobile Obsidian apps
- 🔐 **Secure Authentication**: Uses OAuth2 for secure Google Drive access

## 📁 Storage Options

### 🔒 Hidden Storage (App Data Folder)
- 📂 Files are stored in Google Drive's hidden app-specific folder
- 🧹 Files won't clutter your main Google Drive
- 🔐 Only accessible through this plugin
- ⭐ **Recommended for most users**

### 👀 Visible Storage (Custom Folder)
- 📂 Files are stored in a folder you can see in your Google Drive
- 📝 Default folder name: "Obsidian Vault" (customizable)
- 🔍 You can access and manage files directly from Google Drive
- 🤝 Good for sharing or manual file management

## 📥 Installation

### Method 1: Manual Installation (Recommended)

1. Download the latest release from the [Releases page](../../releases)
2. Extract the files to your vault's plugin folder:
   ```
   VaultFolder/.obsidian/plugins/obsidian-drive-sync/
   ```
3. Enable the plugin in Obsidian Settings → Community Plugins

### Method 2: Building from Source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run build` to build the plugin
4. Copy `main.js`, `manifest.json`, and `styles.css` to your plugin folder

## 🔧 Google Drive API Setup

Before using the plugin, you need to set up Google Drive API access:

### 🚀 Step 1: Create a Google Cloud Project

1. 🌐 Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. 📂 Click "Select a project" → "New Project"
3. ✏️ Enter a project name (e.g., "Obsidian Drive Sync")
4. ✅ Click "Create"

### 🔌 Step 2: Enable Google Drive API

1. 📚 In your project, go to "APIs & Services" → "Library"
2. 🔍 Search for "Google Drive API"
3. 📁 Click on "Google Drive API" and then "Enable"

### 🗝️ Step 3: Create OAuth2 Credentials

1. 🛠️ Go to "APIs & Services" → "Credentials"
2. ➕ Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. ⚙️ If prompted, configure the OAuth consent screen:
   - 🌍 Choose "External" user type
   - 📝 Fill in required fields (App name, User support email, Developer email)
   - 👤 Add your email to "Test users" if in testing mode
   - 💾 Save and continue through all steps
4. 💻 For Application type, select "Desktop application"
5. 🏷️ Enter a name (e.g., "Obsidian Drive Sync")
6. ✨ Click "Create"
7. 📋 **Copy and save** the Client ID and Client Secret - you'll need these!

### 🛡️ Step 4: Configure OAuth Consent Screen (Important)

1. ⚙️ Go to "APIs & Services" → "OAuth consent screen"
2. 🔑 Add the following scope:
   - `https://www.googleapis.com/auth/drive.file`
3. 👤 Add your email address to "Test users"
4. 💾 Save the configuration

## ⚙️ Plugin Configuration

### 🔑 Step 1: Enter API Credentials

1. 🔧 Open Obsidian Settings → Community Plugins → Obsidian Drive Sync
2. 📋 Enter your **Client ID** and **Client Secret** from Google Cloud Console

### 🔐 Step 2: Authenticate with Google Drive

1. 🔗 Click "Get Auth URL" button
2. 📋 The authentication URL will be copied to your clipboard automatically
3. 🌐 Paste the URL in your browser and sign in to Google
4. ✅ Grant permissions to access Google Drive
5. 📄 Copy the authorization code from the browser
6. 📋 Paste the authorization code in the plugin settings
7. 🎉 You should see a success message

### 📂 Step 3: Configure Storage Options

**📍 Storage Location:**
- 🔒 **Hidden (App Data Folder)**: Recommended - files stored in hidden app folder
- 👀 **Visible (Custom Folder)**: Files stored in a visible Google Drive folder

**📝 Visible Folder Name:** (Only for visible storage)
- 📂 Default: "Obsidian Vault"
- ✏️ Change this to customize your folder name

**⏰ Auto Sync:**
- 🔄 Toggle automatic syncing on/off
- ⏱️ Set sync interval (1-60 minutes)

## 🎯 Usage

### 👆 Manual Sync
- ☁️ Click the cloud icon in the ribbon (left sidebar)
- 🎨 Or use Command Palette: "Sync vault with Google Drive"

### 🤖 Automatic Sync
- ⚡ Enable "Auto Sync" in settings
- ⏰ Choose sync interval (default: 5 minutes)
- 🔄 Plugin will sync automatically in the background

### 🔐 Authentication Issues
- 🔄 Use Command Palette: "Authenticate Google Drive" to re-authenticate
- ✅ Check that your OAuth consent screen is properly configured
- 🔑 Ensure you're using the correct Client ID and Secret

## 🛠️ Troubleshooting

### ❌ "Authentication failed" Error
1. 🔍 Double-check your Client ID and Client Secret
2. ✅ Make sure you've enabled Google Drive API in Google Cloud Console
3. 🛡️ Verify OAuth consent screen is configured with correct scopes
4. 🔄 Try generating a new authorization code

### 🚫 "Please authenticate with Google Drive first" Error
1. ✅ Complete the authentication process in plugin settings
2. 📋 Make sure the authorization code was entered correctly
3. 🌐 Check that you have internet connectivity

### 📁 Files Not Syncing
1. 🔍 Check Obsidian's console (Ctrl/Cmd + Shift + I) for error messages
2. 💾 Verify your Google Drive has sufficient storage space
3. 👆 Try manual sync first before enabling auto-sync
4. 🔐 Ensure you have the necessary permissions in Google Drive

### 🔍 Can't Find Synced Files in Google Drive
- 🔒 If using "Hidden" storage, files are in the app-specific folder and not visible in your regular Google Drive
- 👀 If using "Visible" storage, look for the folder name you specified (default: "Obsidian Vault")

## 🔒 Privacy & Security

- 🏠 **Your data stays yours**: Files are stored in your Google Drive account
- 🚫 **No third-party servers**: Direct connection between Obsidian and Google Drive
- 🛡️ **Secure authentication**: Uses OAuth2 standard with refresh tokens
- 🎯 **Minimal permissions**: Only requests access to files created by the app

## 🆘 Support

If you encounter issues:

1. 📖 Check the troubleshooting section above
2. 🔍 Look for error messages in Obsidian's developer console
3. 🐛 Create an issue on GitHub with:
   - ❗ Error messages from the console
   - 🔄 Steps to reproduce the problem
   - 📊 Your Obsidian and plugin versions

## 📄 License

MIT License - see LICENSE file for details.