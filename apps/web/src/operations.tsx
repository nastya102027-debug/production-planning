import { useEffect, useState } from "react";
import { AlertTriangle, Bell, Check, Clock, Factory, MessageSquare, Pause, Play, Search, X } from "lucide-react";
import { productionApi as api, useProductionEvents } from "./production-api";
import "./planning.css";

type Assignee = { id:string; firstName:string; lastName:string; active?:boolean };
type Operation = { assignee?:Assignee|null; id: string; title: string; quantity: number; status: string; priority: string; dueDate?: string; plannedStart?: string; stagePlannedStart?:string; plannedFinish?:string; queueOrder:number; planVersion:number; comment?: string; stopReason?: string;
  workCenter: { id: string; name: string }; orderNumber: string; itemName: string; launchNumber: string; predecessors: { id: string; title: string; status: string }[];
  workSeconds: number; downtimeSeconds: number; serverNow: string; history: { id: string; at: string; actor: string; status: string; reason?: string }[] };
const labels: Record<string, string> = { QUEUED: "К запуску", IN_PROGRESS: "В работе", PAUSED: "Остановлено", COMPLETED: "Готово" };
const priorities: Record<string, string> = { LOW: "Низкий", NORMAL: "Обычный", HIGH: "Высокий", CRITICAL: "Критический" };
const date = (value?: string) => value ? new Date(value).toLocaleDateString("ru-RU") : "—";
const duration = (seconds: number) => `${Math.floor(seconds / 3600)} ч ${Math.floor(seconds % 3600 / 60)} мин ${Math.floor(seconds % 60)} с`;

function TaskCard({ task, onAction, onOpen, now }: { task: Operation; onAction: (task: Operation, action: string) => void; onOpen: () => void; now: number }) {
  const blocked = task.predecessors.some(step => step.status !== "COMPLETED");
  const delta = Math.max(0, (now - new Date(task.serverNow).getTime()) / 1000);
  return <article className={`kanban-task ${task.status.toLowerCase()}`}>
    <button className="task-title" onClick={onOpen}><small>Заказ № {task.orderNumber} · {task.workCenter.name}</small><b>{task.itemName}</b><span>{task.title} · {task.quantity} шт.</span></button>
    <div className="task-meta"><span className={task.dueDate && new Date(task.dueDate).getTime() < now && task.status !== "COMPLETED" ? "late" : ""}>Срок: {date(task.dueDate)}</span><span>{priorities[task.priority]}</span></div>
    <small>Очередь: {task.queueOrder} · Запуск № {task.launchNumber}{task.plannedStart ? ` · начало ${date(task.plannedStart)}` : ""}</small>
    <small>Исполнитель: {task.assignee?`${task.assignee.lastName} ${task.assignee.firstName}${task.assignee.active===false?" (доступ отключён)":""}`:"Не назначен"}</small>
    {blocked && task.status === "QUEUED" && <p className="dependency-note">Ожидает: {task.predecessors.filter(step => step.status !== "COMPLETED").map(step => step.title).join(", ")}</p>}
    {task.stopReason && <p className="stop-note">{task.stopReason}</p>}
    <div className="task-time"><Clock size={14}/><span>Работа: {duration(task.workSeconds + (task.status === "IN_PROGRESS" ? delta : 0))}</span></div>
    {(task.downtimeSeconds > 0 || task.status === "PAUSED") && <div className="task-time paused">Простой: {duration(task.downtimeSeconds + (task.status === "PAUSED" ? delta : 0))}</div>}
    <div className="task-actions">
      {task.status === "QUEUED" && <button disabled={blocked} onClick={() => onAction(task, "start")}><Play size={14}/>Начать</button>}
      {task.status === "IN_PROGRESS" && <><button onClick={() => onAction(task, "pause")}><Pause size={14}/>Остановить</button><button onClick={() => onAction(task, "complete")}><Check size={14}/>Завершить</button></>}
      {task.status === "PAUSED" && <button onClick={() => onAction(task, "resume")}><Play size={14}/>Продолжить</button>}
      <button aria-label="Комментарий" title="Комментарий" onClick={() => onAction(task, "comment")}><MessageSquare size={14}/></button>
      {task.status !== "COMPLETED" && <button aria-label="Сообщить о проблеме" title="Сообщить о проблеме" onClick={() => onAction(task, "problem")}><AlertTriangle size={14}/></button>}
    </div>
  </article>;
}

export function OperationsScreen({ planner = false, initialCenter = "", focusId = "" }: { planner?: boolean; initialCenter?: string; focusId?: string }) {
  const revision = useProductionEvents();
  const [centers, setCenters] = useState<{ id: string; name: string }[]>([]), [center, setCenter] = useState(initialCenter);
  const [search, setSearch] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Operation[]; total: number; counts: Record<string, number> }>({ items: [], total: 0, counts: {} });
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{ task: Operation; action: string } | null>(null), [opened, setOpened] = useState<Operation | null>(null);
  const [reason, setReason] = useState(""), [comment, setComment] = useState(""), [now, setNow] = useState(Date.now());
  const [refresh, setRefresh] = useState(0);
  const [planning, setPlanning] = useState<Operation|null>(null);
  useEffect(() => { api<typeof centers>("/work-centers").then(setCenters).catch(error => setError(error.message)); }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ search, page: String(page), ...(center ? { workCenterId: center } : {}), ...(status ? { status } : {}) });
      api<typeof data>(`/operations?${query}`).then(next => { if (active) { setData(next); setError(""); setOpened(current => current ? next.items.find(item => item.id === current.id) ?? current : null); } }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [center, search, page, status, revision, refresh]);
  useEffect(() => {
    let active = true;
    if (focusId) api<Operation>(`/operations/${focusId}`).then(task => { if (active) setOpened(task); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [focusId]);
  useEffect(() => {
    const id = opened?.id; let active = true;
    if (id) api<Operation>(`/operations/${id}`).then(task => { if (active) setOpened(current => current?.id === id ? task : current); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [opened?.id, revision]);
  function action(task: Operation, action: string) { setModal({ task, action }); setReason(""); setComment(""); setError(""); }
  async function submit() {
    if (!modal || saving) return;
    setSaving(true); setError("");
    try { await api(`/operations/${modal.task.id}/actions`, { method: "POST", body: JSON.stringify({ action: modal.action, reason, comment }) }); setModal(null); setRefresh(value => value + 1); }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось изменить задачу"); } finally { setSaving(false); }
  }
  const actionLabels: Record<string, string> = { start: "Начать работу", pause: "Остановить работу", resume: "Продолжить работу", complete: "Завершить работу", comment: "Добавить комментарий", problem: "Сообщить о проблеме" };
  return <div className="content production-board">
    <div className="board-heading"><div><p className="kicker">{planner ? "ПРОИЗВОДСТВЕННЫЕ УЧАСТКИ" : "МОИ ЗАДАЧИ"}</p><h2>{center ? centers.find(item => item.id === center)?.name : planner ? "Задачи производства" : "Мой участок"}</h2></div><span>{data.total} задач</span></div>
    <div className="board-filters"><label><Factory size={16}/><select aria-label="Участок" value={center} onChange={event => { setCenter(event.target.value); setPage(1); }}><option value="">{planner ? "Все участки" : "Мои участки"}</option>{centers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><Search size={16}/><input aria-label="Поиск задач" placeholder="Заказ, позиция или запуск" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}/></label><select aria-label="Статус задач" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Все статусы</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    {error && <div role="alert" className="planning-error">{error}</div>}
    {loading ? <p>Загрузка задач…</p> : <div className="kanban">{Object.entries(labels).map(([key, label]) => <section className={`kanban-column ${key.toLowerCase()}`} key={key}><h3>{label}<span>{data.counts[key] ?? 0}</span></h3>{data.items.filter(task => task.status === key).map(task => <TaskCard key={task.id} task={task} onAction={action} onOpen={() => setOpened(task)} now={now}/>)}{!data.items.some(task => task.status === key) && <p className="column-empty">{data.counts[key] ? "Задачи на другой странице" : "Нет задач"}</p>}</section>)}</div>}
    <div className="pagination"><button className="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Назад</button><span>Страница {page} из {Math.max(1, Math.ceil(data.total / 40))}</span><button className="secondary" disabled={page * 40 >= data.total} onClick={() => setPage(value => value + 1)}>Далее</button></div>
    {opened && <div className="modal-backdrop"><section className="task-dialog" role="dialog" aria-modal="true" aria-label="Карточка задачи"><header><h2>{opened.itemName}</h2><button aria-label="Закрыть карточку" onClick={() => setOpened(null)}><X/></button></header><p>Заказ № {opened.orderNumber} · запуск № {opened.launchNumber}</p><TaskCard task={opened} onAction={action} onOpen={() => {}} now={now}/>{opened.comment && <p>{opened.comment}</p>}{planner&&!["COMPLETED","CANCELLED"].includes(opened.status)&&<button className="primary" onClick={()=>setPlanning(opened)}>Сроки и очередь</button>}<h3>История</h3><ol className="task-history">{opened.history.map(event => <li key={event.id}><time>{new Date(event.at).toLocaleString("ru-RU")}</time><b>{labels[event.status]} · {event.actor}</b>{event.reason && <span>{event.reason}</span>}</li>)}</ol></section></div>}
    {planning&&<TaskPlan task={planning} onClose={()=>setPlanning(null)} onSaved={task=>{setOpened(task);setPlanning(null);setRefresh(v=>v+1);}}/>}
    {modal && <div className="modal-backdrop action-backdrop"><form className="task-dialog" role="dialog" aria-modal="true" aria-label={actionLabels[modal.action]} onSubmit={event => { event.preventDefault(); submit(); }}><header><h2>{actionLabels[modal.action]}</h2><button type="button" aria-label="Закрыть действие" disabled={saving} onClick={() => setModal(null)}><X/></button></header><p>{modal.task.itemName} · {modal.task.quantity} шт.</p>{modal.action === "pause" && <label>Причина остановки<input autoFocus required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/></label>}{["pause", "comment", "problem"].includes(modal.action) && <label>Комментарий<textarea required={modal.action !== "pause"} maxLength={2000} value={comment} onChange={event => setComment(event.target.value)}/></label>}{error && <div role="alert" className="planning-error">{error}</div>}<footer><button type="button" className="secondary" disabled={saving} onClick={() => setModal(null)}>Отмена</button><button className="primary" disabled={saving}>{saving ? "Сохраняю…" : actionLabels[modal.action]}</button></footer></form></div>}
  </div>;
}

function TaskPlan({task,onClose,onSaved}:{task:Operation;onClose:()=>void;onSaved:(task:Operation)=>void}) {
  const local=(value?:string)=>{if(!value)return "";const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  const [start,setStart]=useState(local(task.stagePlannedStart)),[finish,setFinish]=useState(local(task.plannedFinish)),[priority,setPriority]=useState(task.priority),[queue,setQueue]=useState(task.queueOrder),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [assignee,setAssignee]=useState(task.assignee?.id??""),[people,setPeople]=useState<Assignee[]>([]),[loadingPeople,setLoadingPeople]=useState(true);
  useEffect(()=>{let active=true;api<Assignee[]>(`/operations/${task.id}/assignees`).then(rows=>{if(active)setPeople(rows);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoadingPeople(false);});return()=>{active=false;};},[task.id]);
  async function save(){if(busy)return;setBusy(true);setError("");try{onSaved(await api<Operation>(`/operations/${task.id}/plan`,{method:"PATCH",body:JSON.stringify({plannedStart:start?new Date(start).toISOString():null,plannedFinish:finish?new Date(finish).toISOString():null,priority,queueOrder:queue,planVersion:task.planVersion,...(assignee!==(task.assignee?.id??"")?{assigneeId:assignee||null}:{})})}));}catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить план");}finally{setBusy(false);}}
  return <div className="modal-backdrop action-backdrop"><form className="task-dialog" role="dialog" aria-modal="true" aria-label="Планирование задачи" onSubmit={e=>{e.preventDefault();void save();}}><header><h2>Сроки и очередь</h2><button type="button" aria-label="Закрыть планирование" disabled={busy} onClick={onClose}><X/></button></header><p>{task.itemName} · {task.workCenter.name}</p><label>Исполнитель<select aria-label="Исполнитель" value={assignee} disabled={loadingPeople} onChange={e=>setAssignee(e.target.value)}><option value="">Не назначен</option>{task.assignee&&!people.some(p=>p.id===task.assignee!.id)&&<option value={task.assignee.id}>{task.assignee.lastName} {task.assignee.firstName} (текущее назначение)</option>}{people.map(p=><option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}</select></label><label>Плановое начало<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Плановое завершение<input type="datetime-local" value={finish} onChange={e=>setFinish(e.target.value)}/></label><p>Пустые даты наследуются от запуска и заказа. Время указано в часовом поясе этого компьютера.</p><label>Порядок в очереди<input type="number" min={-1000000} max={1000000} required value={queue} onChange={e=>setQueue(Number(e.target.value))}/></label><p>Меньшее число — выше в списке. При одинаковом числе учитывается приоритет.</p><label>Приоритет<select value={priority} onChange={e=>setPriority(e.target.value)}>{Object.entries(priorities).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{error&&<p className="planning-error" role="alert">{error}</p>}<footer><button type="button" className="secondary" disabled={busy} onClick={onClose}>Отмена</button><button className="primary" disabled={busy}>{busy?"Сохраняю…":"Сохранить план"}</button></footer></form></div>;
}

export function Notifications({ onOpen, compact = false }: { onOpen: (id: string) => void; compact?: boolean }) {
  const revision = useProductionEvents();
  const [page, setPage] = useState(1), [error, setError] = useState("");
  const [data, setData] = useState<{ unread: number; total: number; items: { readAt?: string; notification: { id: string; title: string; message: string; entityId: string; createdAt: string } }[] }>({ unread: 0, total: 0, items: [] });
  useEffect(() => { let active = true; api<typeof data>(`/notifications?page=${page}`).then(next => { if (active) setData(next); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [revision, page]);
  if (compact) return <button className="notification-bell" aria-label={`Уведомления: ${data.unread}`} onClick={() => onOpen("")}><Bell size={18}/>{data.unread > 0 && <b>{data.unread}</b>}</button>;
  return <section className="content notifications"><div className="board-heading"><h2>Требует внимания</h2><span>{data.unread} непрочитанных</span></div>{error && <div className="planning-error">{error}</div>}{!data.items.length && <div className="planning-empty"><Bell/><b>Нет уведомлений</b></div>}{data.items.map(({ notification, readAt }) => <article className={readAt ? "read" : "unread"} key={notification.id}><button onClick={() => onOpen(notification.entityId)}><small>{new Date(notification.createdAt).toLocaleString("ru-RU")}</small><b>{notification.title}</b><span>{notification.message}</span></button>{!readAt && <button className="secondary" onClick={async () => { try { await api(`/notifications/${notification.id}/read`, { method: "POST" }); } catch (error) { setError((error as Error).message); } }}>Прочитано</button>}</article>)}<div className="pagination"><button className="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Назад</button><span>{page}</span><button className="secondary" disabled={page * 30 >= data.total} onClick={() => setPage(value => value + 1)}>Далее</button></div></section>;
}
