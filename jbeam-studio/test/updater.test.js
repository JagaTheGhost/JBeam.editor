import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  isNewer,
  findReleaseAssets,
  findAppRootInStaging,
  formatBytes,
  formatSpeed,
  formatETA
} = require('../electron/updater.cjs');

export function runUpdaterTests() {
  console.log('--- Running Universal Auto-Updater & In-Place Self-Patcher Tests ---');

  // Test 1: Version Comparison
  assert.strictEqual(isNewer('0.2.1', '0.2.0'), true, '0.2.1 should be newer than 0.2.0');
  assert.strictEqual(isNewer('v0.3Beta', '0.2.0'), true, 'v0.3Beta should be newer than 0.2.0');
  assert.strictEqual(isNewer('v0.3Beta', '0.3.0'), false, 'v0.3Beta should match 0.3.0 and not loop');
  assert.strictEqual(isNewer('v0.3.1Beta', '0.3.0'), true, 'v0.3.1Beta should be newer than 0.3.0');
  assert.strictEqual(isNewer('1.0.0', '0.9.9'), true, '1.0.0 should be newer than 0.9.9');
  assert.strictEqual(isNewer('0.2.0', '0.2.0'), false, 'Same version should not be newer');
  assert.strictEqual(isNewer('0.1.9', '0.2.0'), false, 'Older version should not be newer');
  console.log('✓ Test 1: Version comparison passed.');

  // Test 2: Asset Discovery (Setup .exe and Standalone .zip)
  const mockAssets = [
    { name: 'JBeam.editor-Setup-v0.2Beta.exe', size: 68500000, browser_download_url: 'https://github.com/downloads/setup.exe' },
    { name: 'jbeam-studio-win-x64-v0.2.zip', size: 75000000, browser_download_url: 'https://github.com/downloads/portable.zip' },
    { name: 'source.tar.gz', size: 1000000, browser_download_url: 'https://github.com/downloads/source.tar.gz' }
  ];

  const { setupAsset, zipAsset } = findReleaseAssets(mockAssets);
  assert(setupAsset, 'Setup asset should be found');
  assert.strictEqual(setupAsset.name, 'JBeam.editor-Setup-v0.2Beta.exe');
  assert.strictEqual(setupAsset.downloadUrl, 'https://github.com/downloads/setup.exe');

  assert(zipAsset, 'Zip asset should be found');
  assert.strictEqual(zipAsset.name, 'jbeam-studio-win-x64-v0.2.zip');
  assert.strictEqual(zipAsset.downloadUrl, 'https://github.com/downloads/portable.zip');
  console.log('✓ Test 2: Asset discovery (Setup & Standalone Zip) passed.');

  // Test 3: In-Place Staging App Root Discovery
  const testTemp = path.join(os.tmpdir(), `test-staging-${Date.now()}`);
  const nestedFolder = path.join(testTemp, 'win-unpacked');
  fs.mkdirSync(nestedFolder, { recursive: true });
  fs.writeFileSync(path.join(nestedFolder, 'JBeam.editor.exe'), 'mock binary');

  const resolvedRoot = findAppRootInStaging(testTemp);
  assert.strictEqual(resolvedRoot, nestedFolder, 'Should resolve nested directory containing JBeam.editor.exe');

  // Clean up
  try {
    fs.rmSync(testTemp, { recursive: true, force: true });
  } catch (e) {}
  console.log('✓ Test 3: Staged app root resolution passed.');

  // Test 4: Formatting Utilities
  assert.strictEqual(formatBytes(10485760), '10.0 MB');
  assert.strictEqual(formatSpeed(2097152), '2.0 MB/s');
  assert.strictEqual(formatETA(45), '45s');
  assert.strictEqual(formatETA(90), '1m 30s');
  console.log('✓ Test 4: Formatting utilities passed.');

  console.log('All Universal Auto-Updater tests passed successfully!');
}

if (process.argv[1] && process.argv[1].endsWith('updater.test.js')) {
  runUpdaterTests();
}
