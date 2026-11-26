import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, writeFile, rename, rmdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

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

async function startPanel() {
  panelOutput = '';
  panel = spawn(resolve('bin/panel-test-controller.exe'), [resolve('bin/panel.exe')], {
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, PROCESS_PANEL_DATA_DIR: join(scratch, 'data') }
  });
  panel.stdout.on('data', data => { panelOutput += data; }); panel.stderr.on('data', data => { panelOutput += data; });
  await expect.poll(() => {
    if (panel.exitCode !== null) throw new Error(`Panel не запущена: ${panelOutput}`);
    return panelOutput.includes('http://127.0.0.1:4000');
  }).toBe(true);
}
async function stopPanel(mode = 'crash') {
  if (panel && panel.exitCode === null && panel.signalCode === null) {
    const exited = once(panel, 'exit'); panel.stdin.end(`${mode}\n`);
    const [code] = await exited;
    if (mode === 'stop') expect(code, panelOutput).toBe(0);
  }
}
test.beforeEach(async ({ page }) => {
  await mkdir(resolve('test-results/fixtures'), { recursive: true });
  scratch = await mkdtemp(resolve('test-results/fixtures/panel проверка '));
  await startPanel();
  await page.goto('/');
});
test.afterEach(async () => {
  await stopPanel();
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
  await stopPanel();
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

test('регистрации можно менять и удалять; штатный перезапуск сохраняет настройки без вывода и автозапуска', async ({ page }) => {
  const port = await unusedPort();
  const project = await add(page, { cmd: command(await unusedPort()) });
  const script = await readFile(join(example, 'server.mjs'), 'utf8');
  await writeFile(join(scratch, 'server.mjs'), script);
  await project.getByRole('button', { name: 'Редактировать', exact: true }).click();
  await project.getByLabel('Название', { exact: true }).fill('Изменённый сайт');
  await project.getByLabel('Папка', { exact: true }).fill(scratch);
  await project.getByLabel('Команда запуска', { exact: true }).fill(command(port));
  await project.getByRole('button', { name: 'Сохранить', exact: true }).click();
  const edited = page.getByRole('article', { name: 'Изменённый сайт', exact: true });
  await expect(edited).toContainText(scratch);
  await expect(edited).toContainText(command(port));
  await edited.getByRole('button', { name: 'Запустить', exact: true }).click();
  await expect(edited.getByLabel('Вывод программы')).toContainText('сервер готов');
  await expect(edited.getByLabel('Вывод программы')).toContainText(`папка=${scratch}`);
  const pids = [...(await edited.getByLabel('Вывод программы').innerText()).matchAll(/PID=(\d+)/g)].map(m => Number(m[1]));
  await stopPanel('stop');
  await expect.poll(() => responds(port)).toBe(false);
  for (const pid of pids) await expect.poll(() => alive(pid)).toBe(false);
  await startPanel(); await page.reload();
  await expect(edited.getByRole('status')).toHaveText('Остановлен');
  await expect(edited).toContainText(scratch);
  await expect(edited).toContainText(command(port));
  await expect(edited.getByLabel('Вывод программы')).toHaveText('Вывод появится после запуска.');
  expect(await responds(port)).toBe(false);
  await edited.getByRole('button', { name: 'Запустить', exact: true }).click();
  await expect(edited.getByLabel('Вывод программы')).toContainText('сервер готов');
  await edited.getByRole('button', { name: 'Остановить', exact: true }).click();
  await expect(edited.getByRole('status')).toHaveText('Остановлен');
  page.once('dialog', dialog => dialog.accept());
  await edited.getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(edited).toHaveCount(0);
  expect(await readFile(join(scratch, 'server.mjs'), 'utf8')).toBe(script);
  await stopPanel('stop'); await startPanel(); await page.reload();
  await expect(page.getByRole('article')).toHaveCount(0);
  expect(await readFile(join(scratch, 'server.mjs'), 'utf8')).toBe(script);
});

test('два Project работают независимо; интерфейс и API запрещают менять активные регистрации', async ({ page, request }) => {
  const portA = await unusedPort(), portB = await unusedPort();
  const a = await add(page, { name: 'Сайт А', cmd: command(portA) });
  const b = await add(page, { name: 'Сайт Б', cmd: command(portB) });
  await a.getByRole('button', { name: 'Запустить', exact: true }).click();
  await b.getByRole('button', { name: 'Запустить', exact: true }).click();
  for (const project of [a, b]) {
    await expect(project.getByRole('status')).toHaveText('Работает');
    await expect(project.getByLabel('Вывод программы')).toContainText('сервер готов');
    await expect(project.getByRole('button', { name: 'Редактировать', exact: true })).toBeDisabled();
    await expect(project.getByRole('button', { name: 'Удалить', exact: true })).toBeDisabled();
  }
  expect(await responds(portA)).toBe(true); expect(await responds(portB)).toBe(true);
  await expect(a.getByLabel('Вывод программы')).toContainText(`:${portA}`);
  await expect(a.getByLabel('Вывод программы')).not.toContainText(`:${portB}`);
  await expect(b.getByLabel('Вывод программы')).toContainText(`:${portB}`);
  await expect(b.getByLabel('Вывод программы')).not.toContainText(`:${portA}`);
  const registrations = await (await request.get('/api/projects')).json();
  for (const p of registrations) {
    expect((await request.put(`/api/projects/${p.id}`, { data: { name: 'Изменено', folder: scratch, command: 'echo changed' } })).status()).toBe(409);
    expect((await request.delete(`/api/projects/${p.id}`, { data: {} })).status()).toBe(409);
    expect((await request.post(`/api/projects/${p.id}/start`, { data: {} })).status()).toBe(409);
  }
  const bOutput = await b.getByLabel('Вывод программы').innerText();
  const aOutput = await a.getByLabel('Вывод программы').innerText();
  await a.getByRole('button', { name: 'Остановить', exact: true }).click();
  await expect(a.getByRole('status')).toHaveText('Остановлен');
  await expect.poll(() => responds(portA)).toBe(false);
  expect(await responds(portB)).toBe(true);
  await expect(b.getByRole('status')).toHaveText('Работает');
  await expect(b.getByLabel('Вывод программы')).toHaveText(bOutput);
  await expect(a.getByLabel('Вывод программы')).toHaveText(aOutput);
  await a.getByRole('button', { name: 'Запустить', exact: true }).click();
  await expect(a.getByLabel('Вывод программы')).toContainText('сервер готов');
  for (const match of aOutput.matchAll(/PID=(\d+)/g)) await expect(a.getByLabel('Вывод программы')).not.toContainText(`PID=${match[1]}`);
  expect(await responds(portA)).toBe(true); expect(await responds(portB)).toBe(true);
  for (const project of [a, b]) {
    await project.getByRole('button', { name: 'Остановить', exact: true }).click();
    await expect(project.getByRole('status')).toHaveText('Остановлен');
  }
});

test('отказ записи не меняет список и не подтверждает сохранение или удаление', async ({ page }) => {
  const project = await add(page, { name: 'Сохранённый проект', cmd: 'echo hello' });
  const path = join(scratch, 'data', 'projects.json');
  const original = await readFile(path, 'utf8');
  // Block replacement of this test's own file without relying on administrator ACLs.
  await rename(path, `${path}.backup`); await mkdir(path);
  try {
    await page.getByLabel('Название', { exact: true }).fill('Несохранённый проект');
    await page.getByLabel('Папка', { exact: true }).fill(example);
    await page.getByLabel('Команда запуска', { exact: true }).fill('echo lost');
    await page.getByRole('button', { name: 'Добавить', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Не удалось сохранить проект');
    await expect(page.getByRole('article')).toHaveCount(1);
    await project.getByRole('button', { name: 'Редактировать', exact: true }).click();
    await project.getByLabel('Название', { exact: true }).fill('Несохранённое имя');
    await project.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Не удалось сохранить изменения');
    await expect(project.getByRole('heading', { level: 2 })).toHaveText('Сохранённый проект');
    await project.getByRole('button', { name: 'Отмена', exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await project.getByRole('button', { name: 'Удалить', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Не удалось удалить регистрацию');
    await expect(project).toBeVisible();
  } finally {
    await rmdir(path); await rename(`${path}.backup`, path);
  }
  expect(await readFile(path, 'utf8')).toBe(original);
  await stopPanel('stop'); await startPanel(); await page.reload();
  await expect(project).toBeVisible(); await expect(page.getByRole('article')).toHaveCount(1);
});

test('повреждённое хранилище останавливает запуск, сохраняя исходный файл', async () => {
  await stopPanel('stop');
  await mkdir(join(scratch, 'data'), { recursive: true });
  const path = join(scratch, 'data', 'projects.json');
  await writeFile(path, '{ повреждённый JSON');
  const broken = spawn(resolve('bin/panel.exe'), {
    stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
    env: { ...process.env, PROCESS_PANEL_DATA_DIR: join(scratch, 'data') }
  });
  let error = ''; broken.stderr.on('data', data => { error += data; });
  const [code] = await once(broken, 'exit');
  expect(code).toBe(1); expect(error).toContain('Не удалось загрузить регистрации проектов');
  expect(await readFile(path, 'utf8')).toBe('{ повреждённый JSON');
});
