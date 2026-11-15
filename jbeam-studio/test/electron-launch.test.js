import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronPath = path.resolve(__dirname, '../node_modules/electron/dist/electron.exe');
const mainPath = path.resolve(__dirname, '../electron/main.cjs');

console.log('Testing Electron Launch...');
console.log('Electron binary:', electronPath);

const env = { ...process.env, ELECTRON_LOAD_DIST: '1', NODE_ENV: 'production' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electronPath, [mainPath, '--no-sandbox', '--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage'], { env });

let hasOutput = false;
let exited = false;

child.stdout?.on('data', (data) => {
  hasOutput = true;
  console.log(`[Electron stdout] ${data}`);
});

child.stderr?.on('data', (data) => {
  console.error(`[Electron stderr] ${data}`);
});

child.on('error', (err) => {
  console.error('Electron launch error:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  exited = true;
  console.log(`Electron process exited with code ${code}`);
});

// Allow electron 4 seconds to spin up and load the window
setTimeout(() => {
  if (!exited) {
    console.log('✓ Electron successfully launched and window is running steadily!');
    child.kill('SIGINT');
    process.exit(0);
  }
}, 4000);
