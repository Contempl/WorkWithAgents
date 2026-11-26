import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type State = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
type Project = { id: string; name: string; folder: string; command: string; state: State; output: string; error: string; active: boolean };
const labels: Record<State, string> = { stopped: 'Остановлен', starting: 'Запускается', running: 'Работает', stopping: 'Останавливается', error: 'Ошибка' };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
class PanelConnectionError extends Error {}
async function request<T>(url: string, data?: unknown, method = data === undefined ? 'GET' : 'POST'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { method, signal: AbortSignal.timeout(5000), ...(data === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }) });
  } catch {
    throw new PanelConnectionError('Связь с панелью потеряна. Показано последнее известное состояние; запустите панель в терминале.');
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить запрос');
  return result;
}
function CopyOutput({ output }: { output: string }) {
  const [error, setError] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setError('');
    } catch {
      setError('Не удалось скопировать вывод. Проверьте разрешение браузера на доступ к буферу обмена и повторите попытку.');
    }
  }
  return <>
    <button type="button" className="secondary" disabled={!output} onClick={() => void copy()}>Копировать вывод</button>
    {error && <p role="alert" className="error">{error}</p>}
  </>;
}
function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const unavailable = busy || !!connectionError;
  const modifiable = (project: Project) => !project.active && project.state !== 'starting' && project.state !== 'stopping';
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try { const data = await request<Project[]>('/api/projects'); if (!disposed) { setProjects(data); setConnectionError(''); } }
      catch (e) { if (!disposed) setConnectionError(errorMessage(e)); }
      if (!disposed) timer = setTimeout(refresh, 150);
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    try { const project = await request<Project>('/api/projects', values); setProjects(items => [...items.filter(p => p.id !== project.id), project]); form.reset(); setError(''); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function act(project: Project, action: 'start' | 'stop') {
    setError('');
    // Polling owns lifecycle state and output; a pending request is not confirmation.
    setBusy(true);
    try { await request(`/api/projects/${project.id}/${action}`, {}); }
    catch (e) {
      if (e instanceof PanelConnectionError) setConnectionError(e.message);
      else setError(errorMessage(e));
    } finally { setBusy(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>, project: Project) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true); setError('');
    try {
      const updated = await request<Project>(`/api/projects/${project.id}`, values, 'PUT');
      setProjects(items => items.map(p => p.id === updated.id ? updated : p));
      setEditing(null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function remove(project: Project) {
    if (!window.confirm(`Удалить проект «${project.name}» из списка? Папка и файлы останутся.`)) return;
    setBusy(true); setError('');
    try {
      await request(`/api/projects/${project.id}`, undefined, 'DELETE');
      setProjects(items => items.filter(p => p.id !== project.id));
      if (editing === project.id) setEditing(null);
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <main>
    <header><span className="eyebrow">ЛОКАЛЬНЫЕ ПРОЕКТЫ</span><h1>Панель проектов</h1><p>Запускайте проекты и читайте их вывод в одном окне.</p></header>
    <section aria-labelledby="add-title"><h2 id="add-title">Добавить проект</h2>
      <form onSubmit={add}>
        <label>Название<input name="name" required maxLength={200} placeholder="Учебный сайт" /></label>
        <label>Папка<input name="folder" required placeholder="D:\Projects\my-project" /></label>
        <label>Команда запуска<input name="command" required placeholder="node server.mjs" /></label>
        <button disabled={unavailable}>Добавить</button>
      </form><p className="hint">Список проектов сохраняется между запусками панели. Проекты запускаются вручную.</p>
    </section>
    {error && <p role="alert" className="error">{error}</p>}
    {connectionError && <p role="alert" className="error">{connectionError}</p>}
    <div className="projects">{projects.length === 0 && <p className="empty">Добавьте первый проект, чтобы запустить его.</p>}
      {projects.map(project => <article key={project.id} aria-label={project.name}>
        <div className="project-heading"><h2>{project.name}</h2><span role="status" className={`status ${project.state}`}>{labels[project.state]}</span></div>
        <p className="path">{project.folder}</p><code>{project.command}</code>
        <div className="actions"><button disabled={unavailable || !modifiable(project)} onClick={() => void act(project, 'start')}>Запустить</button>
        <button className="secondary" disabled={unavailable || !project.active || project.state === 'stopping'} onClick={() => void act(project, 'stop')}>Остановить</button>
        <button className="secondary" disabled={unavailable || !modifiable(project) || editing === project.id} onClick={() => { setError(''); setEditing(project.id); }}>Редактировать</button>
        <button className="secondary" disabled={unavailable || !modifiable(project)} onClick={() => void remove(project)}>Удалить</button></div>
        {editing === project.id && <form className="edit-form" aria-label="Редактирование проекта" onSubmit={event => void save(event, project)}>
          <label>Название<input name="name" required maxLength={200} defaultValue={project.name} /></label>
          <label>Папка<input name="folder" required defaultValue={project.folder} /></label>
          <label>Команда запуска<input name="command" required defaultValue={project.command} /></label>
          <div className="actions"><button disabled={unavailable || !modifiable(project)}>Сохранить</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => { setEditing(null); setError(''); }}>Отмена</button></div>
          {!modifiable(project) && <p className="hint">Сначала остановите проект, чтобы сохранить изменения.</p>}
        </form>}
        {project.error && <p role="alert" className="error">{project.error}</p>}
        <h3>Вывод последнего запуска</h3><CopyOutput output={project.output} />
        <pre aria-label="Вывод программы">{project.output || 'Вывод появится после запуска.'}</pre>
      </article>)}
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
