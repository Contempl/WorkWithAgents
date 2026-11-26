import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
if (process.platform !== 'win32') throw new Error('Первая версия панели поддерживает Windows.');
try {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen({ host: '127.0.0.1', port: 4000, exclusive: true }, () => {
      probe.close(error => error ? reject(error) : resolve());
    });
  });
} catch (error) {
  console.error(`Не удалось запустить панель на 127.0.0.1:4000: ${error.code === 'EADDRINUSE' ? 'адрес уже занят' : error.message}`);
  process.exit(1);
}
const build = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm run build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);
const panel = spawn('bin/panel.exe', { stdio: 'inherit' });
let shutdownTimer;
// Windows broadcasts Ctrl+C to the shared console, including the Go server.
// Give its handler time to confirm cleanup before using a forced-stop fallback.
process.on('SIGINT', () => {
  if (shutdownTimer) { panel.kill(); return; }
  shutdownTimer = setTimeout(() => panel.kill(), 10_000);
});
process.on('SIGTERM', () => panel.kill());
panel.on('error', error => { console.error(error.message); process.exitCode = 1; });
panel.on('exit', code => { clearTimeout(shutdownTimer); process.exitCode = code ?? 1; });
