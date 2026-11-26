import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
if (process.platform !== 'win32') throw new Error('Первая версия панели поддерживает Windows.');
const build = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm run build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
const panel = spawn('bin/panel.exe', { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => panel.kill());
panel.on('error', error => { console.error(error.message); process.exitCode = 1; });
panel.on('exit', code => { process.exitCode = code ?? 1; });
