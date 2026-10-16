// Launches Electron with ELECTRON_RUN_AS_NODE cleared (some terminals, e.g. inside VS Code, set it,
// which makes Electron behave like plain Node and breaks the app).
const { spawn } = require('child_process');
const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, process.argv.slice(2).length ? process.argv.slice(2) : ['.'], { stdio: 'inherit', env, windowsHide: false });
child.on('close', (code) => process.exit(code ?? 0));
