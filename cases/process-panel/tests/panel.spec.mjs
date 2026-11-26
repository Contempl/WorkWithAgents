import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

let panel;
let panelOutput;
let scratch;
const example = resolve('examples/learning-site');
const shellQuote = value => `"${value}"`;
const command = port => `${shellQuote(process.execPath)} server.mjs ${port}`;

async function unusedPort() {
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(done => listener.close(done)); return port;
}
async function responds(port) {
  try { const response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(400) }); await response.text(); return response.ok; }
  catch { return false; }
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } }
async function terminateOwned(child) {
  if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
}
async function add(page, { name = 'Учебный сайт', folder = example, cmd } = {}) {
  await page.getByLabel('Название', { exact: true }).fill(name);
  await page.getByLabel('Папка', { exact: true }).fill(folder);
  await page.getByLabel('Команда запуска', { exact: true }).fill(cmd);
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  const project = page.getByRole('article', { name, exact: true }); await expect(project).toBeVisible(); return project;
}

test.beforeEach(async ({ page }) => {
  scratch = await mkdtemp(join(tmpdir(), 'panel проверка '));
  panelOutput = '';
  panel = spawn(resolve('bin/panel.exe'), { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  panel.stdout.on('data', data => { panelOutput += data; }); panel.stderr.on('data', data => { panelOutput += data; });
  await expect.poll(() => {
    if (panel.exitCode !== null) throw new Error(`Panel не запущена: ${panelOutput}`);
    return panelOutput.includes('http://127.0.0.1:4000');
  }).toBe(true);
  await page.goto('/');
});
test.afterEach(async () => {
  await terminateOwned(panel);
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

test('регистрация, реальные потомки, вывод, повторный запуск, обновление и остановка', async ({ page, request }, info) => {
  const port = await unusedPort();
  expect(await responds(port)).toBe(false);
  const project = await add(page, { cmd: command(port) });
  await expect(project.getByRole('status')).toHaveText('Остановлен');
  const startResponse = page.waitForResponse(response => response.url().endsWith('/start'));
  await project.getByRole('button', { name: 'Запустить', exact: true }).click();
  expect((await (await startResponse).json()).state).toBe('starting');
  await expect(project.getByRole('status')).toHaveText('Работает');
  await expect(project.getByLabel('Вывод программы')).toContainText('Диагностика stderr: сервер готов.');
  await expect(project.getByLabel('Вывод программы')).toContainText(`папка=${example}`);
  await expect.poll(() => responds(port)).toBe(true);
  const site = await page.context().newPage(); await site.goto(`http://127.0.0.1:${port}`);
  await expect(site.getByRole('heading')).toHaveText('Учебный сайт работает'); await site.close();
  const output = await project.getByLabel('Вывод программы').innerText();
  const pids = [...output.matchAll(/PID=(\d+)/g)].map(match => Number(match[1])); expect(pids).toHaveLength(2);
  const [registration] = await (await request.get('/api/projects')).json();
  const duplicates = await Promise.all(Array.from({ length: 5 }, () => request.post(`/api/projects/${registration.id}/start`, { data: {} })));
  expect(duplicates.map(response => response.status())).toEqual([409, 409, 409, 409, 409]);
  await expect(project.getByRole('button', { name: 'Запустить', exact: true })).toBeDisabled();
  await page.reload(); await expect(project.getByRole('status')).toHaveText('Работает');
  expect(await responds(port)).toBe(true);
  await page.screenshot({ path: info.outputPath('panel-running.png'), fullPage: true });
  const stopResponse = page.waitForResponse(response => response.url().endsWith('/stop'));
  await project.getByRole('button', { name: 'Остановить', exact: true }).click();
  expect((await (await stopResponse).json()).state).toBe('stopping');
  await expect(project.getByRole('status')).toHaveText('Остановлен');
  await expect.poll(() => responds(port)).toBe(false);
  for (const pid of pids) await expect.poll(() => alive(pid)).toBe(false);
  await expect(project.getByLabel('Вывод программы')).toHaveText(output);
  await page.reload(); await expect(project.getByRole('status')).toHaveText('Остановлен');
  await expect(project.getByLabel('Вывод программы')).toHaveText(output);
  await project.getByRole('button', { name: 'Запустить', exact: true }).click();
  await expect(project.getByLabel('Вывод программы')).toContainText('сервер готов');
  for (const pid of pids) await expect(project.getByLabel('Вывод программы')).not.toContainText(`PID=${pid}`);
  await project.getByRole('button', { name: 'Остановить', exact: true }).click();
  await expect(project.getByRole('status')).toHaveText('Остановлен');
});

test('одновременные запросы запуска создают одно дерево; авария Panel его завершает', async ({ page, request }) => {
  const port = await unusedPort();
  const project = await add(page, { cmd: command(port) });
  const [registration] = await (await request.get('/api/projects')).json();
  const results = await Promise.all(Array.from({ length: 8 }, () => request.post(`/api/projects/${registration.id}/start`, { data: {} })));
  expect(results.filter(response => response.status() === 202)).toHaveLength(1);
  expect(results.filter(response => response.status() === 409)).toHaveLength(7);
  await expect(project.getByLabel('Вывод программы')).toContainText('сервер готов');
  const pids = [...(await project.getByLabel('Вывод программы').innerText()).matchAll(/PID=(\d+)/g)].map(match => Number(match[1]));
  await terminateOwned(panel);
  await expect.poll(() => responds(port)).toBe(false);
  for (const pid of pids) await expect.poll(() => alive(pid)).toBe(false);
});

test('ошибки запуска сохраняют вывод, а чужой сервер остаётся работать', async ({ page }) => {
  const port = await unusedPort();
  const control = spawn(process.execPath, ['-e', `require('http').createServer((q,s)=>s.end('control')).listen(${port},'127.0.0.1')`], { windowsHide: true, stdio: 'ignore' });
  try {
    await expect.poll(() => responds(port)).toBe(true);
    const project = await add(page, { cmd: command(port) });
    await project.getByRole('button', { name: 'Запустить', exact: true }).click();
    await expect(project.getByRole('status')).toHaveText('Ошибка');
    await expect(project.getByLabel('Вывод программы')).toContainText('EADDRINUSE');
    expect(await responds(port)).toBe(true);
    const failed = await add(page, { name: 'Ошибка команды', cmd: 'panel_nonexistent_command_8675309' });
    await failed.getByRole('button', { name: 'Запустить', exact: true }).click();
    await expect(failed.getByRole('status')).toHaveText('Ошибка');
    await expect(failed.getByRole('alert')).toContainText('кодом');
    await expect(failed.getByLabel('Вывод программы')).not.toHaveText('Вывод появится после запуска.');
    await page.getByLabel('Название', { exact: true }).fill('Несуществующая папка');
    await page.getByLabel('Папка', { exact: true }).fill(join(scratch, 'missing'));
    await page.getByLabel('Команда запуска', { exact: true }).fill('echo hello');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    const validation = page.getByRole('alert').filter({ hasText: 'Папка проекта не найдена' });
    await expect(validation).toBeVisible();
    // Successful background refreshes must not erase a rejected operation's explanation.
    for (let i = 0; i < 3; i++) await page.waitForResponse(r => r.url().endsWith('/api/projects') && r.request().method() === 'GET');
    await expect(validation).toBeVisible();
  } finally { await terminateOwned(control); }
});

test('команда из папки с пробелами и кириллицей, естественное завершение и новый вывод', async ({ page }) => {
  await writeFile(join(scratch, 'hello.mjs'), "console.log('Привет из ' + process.cwd()); console.error('Вывод stderr');");
  const project = await add(page, { folder: scratch, cmd: `${shellQuote(process.execPath)} hello.mjs` });
  await project.getByRole('button', { name: 'Запустить', exact: true }).click();
  await expect(project.getByLabel('Вывод программы')).toContainText(`Привет из ${scratch}`);
  await expect(project.getByRole('status')).toHaveText('Остановлен');
  await expect(project.getByLabel('Вывод программы')).toContainText('Вывод stderr');
  await writeFile(join(scratch, 'hello.mjs'), "console.log('Второй запуск');");
  await project.getByRole('button', { name: 'Запустить', exact: true }).click();
  await expect(project.getByLabel('Вывод программы')).toHaveText('Второй запуск\r\n');
  await expect(project.getByRole('status')).toHaveText('Остановлен');
});

test('занятый порт Panel не затрагивает запущенный экземпляр; чужой Origin отклоняется', async ({ request }) => {
  const second = spawn(resolve('bin/panel.exe'), { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let error = ''; second.stderr.on('data', data => { error += data; });
  const [code] = await once(second, 'exit'); expect(code).toBe(1); expect(error).toContain('127.0.0.1:4000');
  expect((await request.get('/')).status()).toBe(200);
  const denied = await request.post('/api/projects', { headers: { Origin: 'https://unrelated.example' }, data: { name: 'чужой', folder: example, command: 'echo bad' } });
  expect(denied.status()).toBe(403);expect(await (await request.get('/api/projects')).json()).toEqual([]);
});
