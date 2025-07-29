import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const obsidianPluginPath = join(homedir(), 'Documents', 'Obsidian Vault', '.obsidian', 'plugins', 'obsidian-drive-sync');

try {
  // Create the plugin directory if it doesn't exist
  mkdirSync(obsidianPluginPath, { recursive: true });
  
  // Copy the built files
  copyFileSync('build/main.js', join(obsidianPluginPath, 'main.js'));
  copyFileSync('manifest.json', join(obsidianPluginPath, 'manifest.json'));
  
  console.log('✅ Plugin deployed to Obsidian vault successfully!');
  console.log(`📁 Location: ${obsidianPluginPath}`);
} catch (error) {
  console.error('❌ Failed to deploy plugin:', error.message);
  process.exit(1);
}