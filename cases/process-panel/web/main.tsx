import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type State = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
type Project = { id: string; name: string; folder: string; command: string; state: State; output: string; error: string; active: boolean };
const labels: Record<State, string> = { stopped: 'Остановлен', starting: 'Запускается', running: 'Работает', stopping: 'Останавливается', error: 'Ошибка' };
async function request<T>(url: string, data?: unknown): Promise<T> {
  const response = await fetch(url, data === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Не удалось выполнить запрос');
  return result;
}
function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try { const data = await request<Project[]>('/api/projects'); if (!disposed) { setProjects(data); setConnectionError(''); } }
      catch (e) { if (!disposed) setConnectionError(String(e)); }
      if (!disposed) timer = setTimeout(refresh, 150);
    }
    void refresh();
    return () => { disposed = true; clearTimeout(timer); };
  }, []);
  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    setBusy(true);
    try { const project = await request<Project>('/api/projects', values); setProjects(items => [...items.filter(p => p.id !== project.id), project]); form.reset(); setError(''); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  async function act(project: Project, action: 'start' | 'stop') {
    setError('');
    setProjects(items => items.map(p => p.id === project.id ? { ...p, state: action === 'start' ? 'starting' : 'stopping', ...(action === 'start' ? { output: '', error: '' } : {}) } : p));
    try { await request(`/api/projects/${project.id}/${action}`, {}); }
    catch (e) { setError(String(e)); }
  }
  return <main>
    <header><span className="eyebrow">ЛОКАЛЬНЫЕ ПРОЕКТЫ</span><h1>Панель проектов</h1><p>Запускайте проекты и читайте их вывод в одном окне.</p></header>
    <section aria-labelledby="add-title"><h2 id="add-title">Добавить проект</h2>
      <form onSubmit={add}>
        <label>Название<input name="name" required maxLength={200} placeholder="Учебный сайт" /></label>
        <label>Папка<input name="folder" required placeholder="D:\Projects\my-project" /></label>
        <label>Команда запуска<input name="command" required placeholder="node server.mjs" /></label>
        <button disabled={busy}>Добавить</button>
      </form><p className="hint">Список проектов хранится до выключения панели.</p>
    </section>
    {error && <p role="alert" className="error">{error}</p>}
    {connectionError && <p role="alert" className="error">{connectionError}</p>}
    <div className="projects">{projects.length === 0 && <p className="empty">Добавьте первый проект, чтобы запустить его.</p>}
      {projects.map(project => <article key={project.id} aria-label={project.name}>
        <div className="project-heading"><h2>{project.name}</h2><span role="status" className={`status ${project.state}`}>{labels[project.state]}</span></div>
        <p className="path">{project.folder}</p><code>{project.command}</code>
        <div className="actions"><button disabled={project.active || project.state === 'starting' || project.state === 'stopping'} onClick={() => void act(project, 'start')}>Запустить</button>
        <button className="secondary" disabled={!project.active || project.state === 'stopping'} onClick={() => void act(project, 'stop')}>Остановить</button></div>
        {project.error && <p role="alert" className="error">{project.error}</p>}
        <h3>Вывод последнего запуска</h3><pre aria-label="Вывод программы">{project.output || 'Вывод появится после запуска.'}</pre>
      </article>)}
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
