// Run as a Project: node server.mjs [port]. The HTTP server is a grandchild of cmd.exe.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const port = Number(process.argv[2] || 4100);
if (process.env.PANEL_EXAMPLE_CHILD !== '1') {
  console.log(`Родитель PID=${process.pid}; папка=${process.cwd()}`);
  const child = spawn(process.execPath, [import.meta.filename, String(port)], {
    stdio: 'inherit', env: { ...process.env, PANEL_EXAMPLE_CHILD: '1' }
  });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><html lang="ru"><title>Учебный сайт</title><h1>Учебный сайт работает</h1><p>Этот сервер запущен из панели проектов.</p></html>');
  }).on('error', error => { console.error(error.message); process.exitCode = 1; })
    .listen(port, '127.0.0.1', () => {
      console.log(`Сервер PID=${process.pid}: http://127.0.0.1:${port}`);
      console.error('Диагностика stderr: сервер готов.');
    });
}
