# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that syncs vault files with Google Drive. The plugin supports two storage modes:
- **appDataFolder**: Files stored in Google Drive's hidden app-specific folder
- **visible**: Files stored in a user-visible Google Drive folder

## Development Commands

- `npm run dev` - Start development mode with file watching (outputs to `build/main.js`)
- `npm run build` - Production build (TypeScript check + esbuild)
- `npm run deploy` - Build and copy plugin files to `~/Documents/Obsidian Vault/.obsidian/plugins/obsidian-drive/`
- `npm run dev-deploy` - Build, deploy, then start dev mode

## Architecture

### Core Components

**ObsidianDrivePlugin** (`main.ts`): Main plugin class with these key responsibilities:
- Google Drive API initialization and OAuth2 authentication
- Vault synchronization logic
- Storage location management (hidden vs visible folders)
- Auto-sync interval management

**ObsidianDriveSettings**: Configuration interface supporting:
- Google Drive API credentials (clientId, clientSecret, refreshToken)
- Storage location choice and visible folder naming
- Sync timing settings (interval, auto-sync toggle)

**ObsidianDriveSettingTab**: Settings UI with dropdowns for storage location and form controls for API credentials

### Google Drive Integration

The plugin uses the `googleapis` library with OAuth2 "out of band" flow:
1. Generate auth URL in settings
2. User visits URL and gets authorization code
3. Exchange code for refresh token
4. Store refresh token for future API calls

### File Synchronization Logic

- **Storage abstraction**: Helper methods (`getParentId()`, `getSearchQuery()`, `getSearchSpace()`) handle differences between appDataFolder and visible folder storage
- **Sync process**: Read all vault files, check if they exist on Drive, update existing or create new files
- **Folder management**: For visible storage, automatically creates named folder in Google Drive root

### Build System

- **esbuild**: Bundles TypeScript to single `main.js` file
- **External dependencies**: Obsidian API and CodeMirror modules marked as external
- **Deploy script**: Copies built files directly to Obsidian plugins directory for testing

### Key Files

- `main.ts` - Plugin implementation
- `manifest.json` - Obsidian plugin metadata
- `esbuild.config.mjs` - Build configuration with watch mode
- `deploy.mjs` - Development deployment script
- `build/main.js` - Built plugin output

## Commit Message Guidelines

- Use conventional commit format (feat:, fix:, refactor:, etc.)
- Write commit messages as a single sentence without bullet points
- Do NOT include co-authors or "Generated with Claude Code" text
- Keep messages concise and descriptive