import { TaskForecast } from "./task-forecast";
import { useEffect, useState } from "react";
import { AlertTriangle, Bell, Check, Clock, Factory, MessageSquare, Pause, Play, Search, X } from "lucide-react";
import { productionApi as api, useProductionEvents } from "./production-api";
import "./planning.css";

type Assignee = { id:string; firstName:string; lastName:string; active?:boolean };
type Operation = { normHours?:number|null; riskHours?:number|null; assignee?:Assignee|null; id: string; title: string; quantity: number; status: string; priority: string; dueDate?: string; plannedStart?: string; stagePlannedStart?:string; plannedFinish?:string; actualStart?:string;actualFinish?:string;queueOrder:number; planVersion:number; comment?: string; stopReason?: string;
  workCenter: { id: string; name: string }; orderNumber: string; itemId:string; itemQuantity:number; itemName: string; launchNumber: string; route:{id:string;name:string;steps:{id:string;title:string;workCenter:string;material?:string|null;quantity?:number|null;unit?:string|null;components:{name:string;material:string;quantity:number;unit:string}[]}[]}; routeOperations:{id:string;status:string;workCenter:string;predecessorIds:string[]}[]; predecessors: { id: string; title: string; status: string; workCenter:{name:string} }[];
  workSeconds: number; downtimeSeconds: number; serverNow: string; history: { id: string; at: string; actor: string; status: string; reason?: string }[] };
const defaultLabels: Record<string, string> = { QUEUED: "К запуску", IN_PROGRESS: "В работе", PAUSED: "Остановлено", COMPLETED: "Готово", CANCELLED: "Отменено" };
const defaultColors: Record<string,string> = { QUEUED:"#7195b3", IN_PROGRESS:"#3f8062", PAUSED:"#bc7939", COMPLETED:"#596a60", CANCELLED:"#9b5a5a" };
const priorities: Record<string, string> = { LOW: "Низкий", NORMAL: "Обычный", HIGH: "Высокий", CRITICAL: "Критический" };
const workCenterTone:Record<string,string>={"Лазер":"laser","Гибка":"bending","Малярка Порошок":"powder","Нитрид":"nitride","Гильотина":"cutting","Пила":"saw","Шлиф станок":"grinding","Шлифовка ручная":"grinding","Сварка":"welding","Слесарка":"metalwork","Фрезер ЧПУ":"milling","Токарка ЧПУ":"milling","Фрезер ручной":"milling","Малярка":"painting","Патина":"patina","ОТК":"quality"};
const date = (value?: string) => value ? new Date(value).toLocaleDateString("ru-RU") : "—";
const dateTime = (value?: string) => value ? new Date(value).toLocaleString("ru-RU",{dateStyle:"short",timeStyle:"short"}) : "—";
const duration = (seconds: number) => `${Math.floor(seconds / 3600)} ч ${Math.floor(seconds % 3600 / 60)} мин ${Math.floor(seconds % 60)} с`;

function TaskCard({ task, onAction, onOpen, now, labels, canCancel = false }: { task: Operation; onAction: (task: Operation, action: string) => void; onOpen: () => void; now: number; labels:Record<string,string>; canCancel?: boolean }) {
  const blocked = task.predecessors.some(step => step.status !== "COMPLETED");
  const delta = Math.max(0, (now - new Date(task.serverNow).getTime()) / 1000);
  return <article className={`kanban-task ${task.status.toLowerCase()} work-center--${workCenterTone[task.workCenter.name]||"default"}`}>
    <button className="task-title" onClick={onOpen}><small>Заказ № {task.orderNumber} · {task.workCenter.name}</small><b>{task.itemName}</b><span>{task.title} · {task.quantity} шт.</span></button>
    <div className="task-meta"><span className={task.dueDate && new Date(task.dueDate).getTime() < now && task.status !== "COMPLETED" ? "late" : ""}>Срок: {date(task.dueDate)}</span><span>{priorities[task.priority]}</span></div>
    <dl className="task-dates"><div><dt>Плановое начало</dt><dd>{dateTime(task.plannedStart)}</dd></div><div><dt>Плановое завершение</dt><dd>{dateTime(task.dueDate)}</dd></div>{task.actualStart&&<div><dt>Фактическое начало</dt><dd>{dateTime(task.actualStart)}</dd></div>}{task.actualFinish&&<div><dt>Фактическое завершение</dt><dd>{dateTime(task.actualFinish)}</dd></div>}</dl>
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
      {canCancel && !["COMPLETED", "CANCELLED"].includes(task.status) && <button className="danger" onClick={() => onAction(task, "cancel")}>Отменить</button>}
      <button aria-label="Комментарий" title="Комментарий" onClick={() => onAction(task, "comment")}><MessageSquare size={14}/></button>
      {task.status !== "COMPLETED" && <button aria-label="Сообщить о проблеме" title="Сообщить о проблеме" onClick={() => onAction(task, "problem")}><AlertTriangle size={14}/></button>}
    </div>
  </article>;
}

type PositionGroup={id:string;tasks:Operation[]};
const positionStatus=(tasks:Operation[])=>tasks.some(task=>task.status==="PAUSED")?"PAUSED":tasks.some(task=>task.status==="IN_PROGRESS")?"IN_PROGRESS":tasks.every(task=>task.status==="COMPLETED"||task.status==="CANCELLED")?"COMPLETED":"QUEUED";
function routeOrder(tasks:Operation[]){
  const byId=new Map(tasks.map(task=>[task.id,task]));
  const pending=new Map(tasks.map(task=>[task.id,new Set(task.predecessors.map(step=>step.id).filter(id=>byId.has(id)))]));
  const orderHint=(task:Operation)=>{const index=task.route.steps.findIndex(step=>step.title===task.title&&step.workCenter===task.workCenter.name);return index<0?Number.MAX_SAFE_INTEGER:index;};
  const compare=(left:Operation,right:Operation)=>orderHint(left)-orderHint(right)||left.workCenter.name.localeCompare(right.workCenter.name,"ru")||left.id.localeCompare(right.id);
  const ready=tasks.filter(task=>pending.get(task.id)?.size===0).sort(compare),ordered:Operation[]=[];
  while(ready.length){
    const task=ready.shift()!;ordered.push(task);
    for(const candidate of tasks){const dependencies=pending.get(candidate.id);if(!dependencies?.delete(task.id)||dependencies.size)continue;ready.push(candidate);}
    ready.sort(compare);
  }
  return ordered.length===tasks.length?ordered:[...ordered,...tasks.filter(task=>!ordered.includes(task)).sort(compare)];
}
function PositionCard({group,onOpen,labels,colors,mobilePrimary=false}:{group:PositionGroup;onOpen:(task:Operation)=>void;labels:Record<string,string>;colors:Record<string,string>;mobilePrimary?:boolean}) {
  const orderedTasks=routeOrder(group.tasks), status=positionStatus(orderedTasks), active=orderedTasks.filter(task=>["IN_PROGRESS","PAUSED"].includes(task.status));
  const current=active.length?active:orderedTasks.filter(task=>task.status==="QUEUED");
  const completed=group.tasks.filter(task=>task.status==="COMPLETED").length;
  const next=orderedTasks.find(task=>task.status==="QUEUED");
  const routeOperations=group.tasks[0]?.routeOperations??[];
  const byOperationId=new Map(routeOperations.map(stage=>[stage.id,stage]));
  const activeRouteStages=routeOperations.filter(stage=>["IN_PROGRESS","PAUSED"].includes(stage.status));
  const readyRouteStages=routeOperations.filter(stage=>stage.status==="QUEUED"&&stage.predecessorIds.every(id=>byOperationId.get(id)?.status==="COMPLETED"));
  const uniqueCenters=(stages:{workCenter:string}[])=>[...new Set(stages.map(stage=>stage.workCenter))];
  const activeCenters=uniqueCenters(activeRouteStages),readyCenters=uniqueCenters(readyRouteStages);
  const detail=(task:Operation)=>task.route.steps.find(step=>step.title===task.title&&step.workCenter===task.workCenter.name);
  return <article className={`position-card ${status.toLowerCase()} work-center--${workCenterTone[group.tasks[0]?.workCenter.name]||"default"}`} style={{borderTopColor:colors[status]}}>
    <button className="position-card-title" onClick={()=>onOpen(group.tasks[0])}><small>Заказ № {group.tasks[0].orderNumber} · запуск № {group.tasks[0].launchNumber}</small><b>{group.tasks[0].itemName}</b><span>{group.tasks[0].quantity} шт. · {completed} из {group.tasks.length} операций завершено</span></button>
    <div className="position-progress"><i style={{width:`${group.tasks.length?completed/group.tasks.length*100:0}%`}}/></div>
    {activeCenters.length>0&&<p className="position-location">Сейчас на участке{activeCenters.length>1?"ах":""}: <b>{activeCenters.join(", ")}</b></p>}
    {!activeCenters.length&&readyCenters.length>0&&<p className="position-location pending">Должна поступить на участок{readyCenters.length>1?"и":""}: <b>{readyCenters.join(", ")}</b></p>}
    <section className="position-stages"><h4>{active.length?"Выполняется на участке":"Задача этого участка"}</h4>{current.map(task=>{const stage=detail(task);return <button key={task.id} onClick={()=>onOpen(task)}><span><b>{task.workCenter.name}</b><small>{task.title} · {labels[task.status]||task.status}</small>{stage?.material&&<em>{stage.material.split("\n").filter(Boolean).join(" · ")}{stage.quantity?` · ${stage.quantity} ${stage.unit||"шт."}`:""}</em>}</span><i className={`stage-status ${task.status.toLowerCase()}`} style={{backgroundColor:colors[task.status],color:"#fff"}}>{labels[task.status]||task.status}</i></button>;})}</section>
    {next&&active.length>0&&<p className="position-next">Следующий этап: <b>{next.workCenter.name}</b></p>}
    <div className="position-route" aria-label="Маршрут позиции">{orderedTasks.map(task=><span className={task.status.toLowerCase()} key={task.id}>{task.workCenter.name}</span>)}</div>
    {mobilePrimary&&<button className="position-open" onClick={()=>onOpen(current[0]??group.tasks[0])}>Открыть задачу</button>}
  </article>;
}

export function OperationsScreen({ planner = false, initialCenter = "", focusId = "", initialStatus = "" }: { planner?: boolean; initialCenter?: string; focusId?: string; initialStatus?:string }) {
  const revision = useProductionEvents();
  const [centers, setCenters] = useState<{ id: string; name: string }[]>([]), [center, setCenter] = useState(initialCenter);
  const [search, setSearch] = useState(""), [status, setStatus] = useState(initialStatus), [assignee, setAssignee] = useState(""), [priorityFilter, setPriorityFilter] = useState(""), [deadline,setDeadline]=useState(""), [page, setPage] = useState(1), [assignees,setAssignees]=useState<Assignee[]>([]);
  const [data, setData] = useState<{ items: Operation[]; total: number; counts: Record<string, number> }>({ items: [], total: 0, counts: {} });
  const [summary,setSummary]=useState<{counts:Record<string,number>;completedToday:number}>({counts:{},completedToday:0});
  const [error, setError] = useState(""), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{ task: Operation; action: string } | null>(null), [opened, setOpened] = useState<Operation | null>(null);
  const [reason, setReason] = useState(""), [comment, setComment] = useState(""), [now, setNow] = useState(Date.now());
  const [stopReasons,setStopReasons]=useState<{id:string;name:string}[]>([]);
  const [labels,setLabels]=useState(defaultLabels);
  const [colors,setColors]=useState(defaultColors);
  const [refresh, setRefresh] = useState(0), [view, setView] = useState<"board"|"timeline">("board");
  const [planning, setPlanning] = useState<Operation|null>(null);
  useEffect(() => { api<typeof centers>("/work-centers").then(setCenters).catch(error => setError(error.message)); }, []);
  useEffect(()=>{api<{id:string;name:string}[]>("/stop-reasons").then(setStopReasons).catch(()=>{});},[]);
  useEffect(()=>{api<{code:string;name:string;color:string}[]>("/operation-statuses").then(rows=>{setLabels(current=>({...current,...Object.fromEntries(rows.map(row=>[row.code,row.name]))}));setColors(current=>({...current,...Object.fromEntries(rows.map(row=>[row.code,row.color]))}));}).catch(()=>{});},[]);
  useEffect(() => { if(planner) api<(Assignee&{active:boolean})[]>("/staff").then(rows=>setAssignees(rows.filter(row=>row.active))).catch(error=>setError(error.message)); }, [planner]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ search, page: String(page), ...(center ? { workCenterId: center } : {}), ...(status ? { status } : {}), ...(assignee&&assignee!=="UNASSIGNED"?{assigneeId:assignee}:{}), ...(assignee==="UNASSIGNED"?{unassigned:"true"}:{}), ...(priorityFilter?{priority:priorityFilter}:{}), ...(deadline?{deadline}:{}) });
      api<typeof data>(`/operations?${query}`).then(next => { if (active) { setData(next); setError(""); setOpened(current => current ? next.items.find(item => item.id === current.id) ?? current : null); } }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [center, search, page, status, assignee, priorityFilter, deadline, revision, refresh]);
  useEffect(()=>{let active=true;api<typeof summary>(`/operations/summary${center?`?workCenterId=${center}`:""}`).then(next=>{if(active)setSummary(next);}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[center,revision,refresh]);
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
  const actionLabels: Record<string, string> = { start: "Начать работу", pause: "Остановить работу", resume: "Продолжить работу", complete: "Завершить работу", cancel: "Отменить операцию", comment: "Добавить комментарий", problem: "Сообщить о проблеме" };
  const positions=Object.values(data.items.reduce<Record<string,PositionGroup>>((groups,task)=>{const key=task.itemId;(groups[key]??={id:key,tasks:[]}).tasks.push(task);return groups;},{}));
  return <div className="content production-board">
    <div className="board-heading"><div><p className="kicker">{planner ? "ПРОИЗВОДСТВЕННЫЕ УЧАСТКИ" : "МОИ ЗАДАЧИ"}</p><h2>{center ? centers.find(item => item.id === center)?.name : planner ? "Задачи производства" : centers.length===1 ? `Мой участок — ${centers[0].name}` : "Мои участки"}</h2></div><span>{data.total} задач</span></div>
    <section className="operations-summary" aria-label="Сводка задач"><span><b>{summary.counts.QUEUED||0}</b>{labels.QUEUED}</span><span><b>{summary.counts.IN_PROGRESS||0}</b>{labels.IN_PROGRESS}</span><span><b>{summary.counts.PAUSED||0}</b>{labels.PAUSED}</span><span><b>{summary.completedToday}</b>{labels.COMPLETED} сегодня</span></section>
    {!planner&&<div className="mobile-task-tabs" role="group" aria-label="Фильтр задач по статусу"><button className={!status?"selected":""} onClick={()=>{setStatus("");setPage(1);}}>Все</button>{Object.entries(labels).filter(([key])=>key!=="CANCELLED").map(([key,label])=><button className={status===key?"selected":""} key={key} onClick={()=>{setStatus(key);setPage(1);}}>{label}</button>)}</div>}
    {planner&&<div className="board-filters"><label><Factory size={16}/><select aria-label="Участок" value={center} onChange={event => { setCenter(event.target.value); setPage(1); }}><option value="">Все участки</option>{centers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><Search size={16}/><input aria-label="Поиск задач" placeholder="Заказ, позиция или запуск" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}/></label><select aria-label="Статус задач" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Все статусы</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="Исполнитель задач" value={assignee} onChange={event=>{setAssignee(event.target.value);setPage(1);}}><option value="">Все исполнители</option><option value="UNASSIGNED">Не назначен</option>{assignees.map(person=><option key={person.id} value={person.id}>{person.lastName} {person.firstName}</option>)}</select><select aria-label="Приоритет задач" value={priorityFilter} onChange={event=>{setPriorityFilter(event.target.value);setPage(1);}}><option value="">Все приоритеты</option>{Object.entries(priorities).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><select aria-label="Срок задач" value={deadline} onChange={event=>{setDeadline(event.target.value);setPage(1);}}><option value="">Все сроки</option><option value="TODAY">На сегодня</option><option value="OVERDUE">Просрочено</option></select></div>}
    {error && <div role="alert" className="planning-error">{error}</div>}
    {planner&&<div className="view-switch" role="group" aria-label="Представление задач"><button className={view==="board"?"selected":"secondary"} onClick={()=>setView("board")}>Kanban</button><button className={view==="timeline"?"selected":"secondary"} onClick={()=>setView("timeline")}>Timeline</button></div>}
    {loading ? <p>Загрузка задач…</p> : view === "timeline" && planner ? <Timeline tasks={data.items} now={now} labels={labels} colors={colors} onOpen={task=>setOpened(task)}/> : <div className="kanban">{Object.entries(labels).filter(([key])=>planner||!status||key===status).map(([key, label]) => {const rows=positions.filter(group=>positionStatus(group.tasks)===key);return <section className={`kanban-column ${key.toLowerCase()}`} style={{borderTopColor:colors[key]}} key={key}><h3>{label}<span>{rows.length}</span></h3>{rows.map(group=><PositionCard key={group.id} group={group} labels={labels} colors={colors} onOpen={setOpened} mobilePrimary={!planner}/>)}{!rows.length && <p className="column-empty">Нет позиций</p>}</section>;})}</div>}
    <div className="pagination"><button className="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Назад</button><span>Страница {page} из {Math.max(1, Math.ceil(data.total / 40))}</span><button className="secondary" disabled={page * 40 >= data.total} onClick={() => setPage(value => value + 1)}>Далее</button></div>
    {opened && <div className="modal-backdrop"><section className="task-dialog" role="dialog" aria-modal="true" aria-label="Карточка задачи"><header><h2>{opened.itemName}</h2><button aria-label="Закрыть карточку" onClick={() => setOpened(null)}><X/></button></header><p>Заказ № {opened.orderNumber} · запуск № {opened.launchNumber}</p><TaskCard task={opened} onAction={action} onOpen={() => {}} now={now} labels={labels} canCancel={planner}/>{opened.comment && <p>{opened.comment}</p>}{planner&&!["COMPLETED","CANCELLED"].includes(opened.status)&&<button className="primary" onClick={()=>setPlanning(opened)}>Сроки и очередь</button>}{planner&&<TaskForecast centerId={opened.workCenter.id} id={opened.id} version={opened.planVersion} revision={revision}/>}<h3>История</h3><ol className="task-history">{opened.history.map(event => <li key={event.id}><time>{new Date(event.at).toLocaleString("ru-RU")}</time><b>{labels[event.status]||event.status} · {event.actor}</b>{event.reason && <span>{event.reason}</span>}</li>)}</ol></section></div>}
    {planning&&<TaskPlan task={planning} onClose={()=>setPlanning(null)} onSaved={task=>{setOpened(task);setPlanning(null);setRefresh(v=>v+1);}}/>}
    {modal && <div className="modal-backdrop action-backdrop"><form className="task-dialog" role="dialog" aria-modal="true" aria-label={actionLabels[modal.action]} onSubmit={event => { event.preventDefault(); submit(); }}><header><h2>{actionLabels[modal.action]}</h2><button type="button" aria-label="Закрыть действие" disabled={saving} onClick={() => setModal(null)}><X/></button></header><p>{modal.task.itemName} · {modal.task.quantity} шт.</p>{["pause", "cancel"].includes(modal.action) && <label>{modal.action === "cancel" ? "Причина отмены" : "Причина остановки"}{stopReasons.length?<select autoFocus required value={reason} onChange={event=>setReason(event.target.value)}><option value="">Выберите причину</option>{stopReasons.map(item=><option key={item.id} value={item.name}>{item.name}</option>)}<option value="Другая причина">Другая причина</option></select>:<input autoFocus required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)}/>}</label>}{reason==="Другая причина"&&<label>Укажите причину<input required maxLength={1000} onChange={event=>setReason(event.target.value)}/></label>}{["pause", "comment", "problem"].includes(modal.action) && <label>Комментарий<textarea required={modal.action !== "pause"} maxLength={2000} value={comment} onChange={event => setComment(event.target.value)}/></label>}{error && <div role="alert" className="planning-error">{error}</div>}<footer><button type="button" className="secondary" disabled={saving} onClick={() => setModal(null)}>Отмена</button><button className="primary" disabled={saving}>{saving ? "Сохраняю…" : actionLabels[modal.action]}</button></footer></form></div>}
  </div>;
}

function Timeline({tasks,now,labels,colors,onOpen}:{tasks:Operation[];now:number;labels:Record<string,string>;colors:Record<string,string>;onOpen:(task:Operation)=>void}) {
  const rows=tasks.filter(task=>task.status!=="COMPLETED").map(task=>{const start=new Date(task.plannedStart??task.stagePlannedStart??task.serverNow).getTime();const end=new Date(task.plannedFinish??task.dueDate??new Date(start+(task.normHours??1)*3600000)).getTime();return {...task,start,end:Math.max(end,start+3600000)};});
  if(!rows.length)return <div className="timeline-empty">Нет незавершённых задач для таймлайна.</div>;
  const min=Math.min(now,...rows.map(row=>row.start)),max=Math.max(now+86400000,...rows.map(row=>row.end)),span=max-min;
  return <div className="timeline" aria-label="Timeline задач"><div className="timeline-scale"><span>{new Date(min).toLocaleDateString("ru-RU")}</span><span>{new Date(max).toLocaleDateString("ru-RU")}</span></div>{rows.map(row=><button className={`timeline-row ${row.status.toLowerCase()}`} key={row.id} onClick={()=>onOpen(row)}><span className="timeline-label"><b>{row.title}</b><small>{row.orderNumber} · {row.workCenter.name}</small></span><span className="timeline-track"><i style={{left:`${Math.max(0,(row.start-min)/span*100)}%`,width:`${Math.max(2,(row.end-row.start)/span*100)}%`,backgroundColor:colors[row.status]}}/><em>{labels[row.status]||row.status}</em></span></button>)}</div>;
}

function TaskPlan({task,onClose,onSaved}:{task:Operation;onClose:()=>void;onSaved:(task:Operation)=>void}) {
  const local=(value?:string)=>{if(!value)return "";const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  const [start,setStart]=useState(local(task.stagePlannedStart)),[finish,setFinish]=useState(local(task.plannedFinish)),[priority,setPriority]=useState(task.priority),[queue,setQueue]=useState(task.queueOrder),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [norm,setNorm]=useState<number|"">(task.normHours??""),[risk,setRisk]=useState<number|"">(task.riskHours??"");
  const [assignee,setAssignee]=useState(task.assignee?.id??""),[people,setPeople]=useState<Assignee[]>([]),[loadingPeople,setLoadingPeople]=useState(true);
  useEffect(()=>{let active=true;api<Assignee[]>(`/operations/${task.id}/assignees`).then(rows=>{if(active)setPeople(rows);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoadingPeople(false);});return()=>{active=false;};},[task.id]);
  async function save(){if(busy)return;setBusy(true);setError("");try{onSaved(await api<Operation>(`/operations/${task.id}/plan`,{method:"PATCH",body:JSON.stringify({normHours:norm===""?null:norm,riskHours:risk===""?null:risk,plannedStart:start?new Date(start).toISOString():null,plannedFinish:finish?new Date(finish).toISOString():null,priority,queueOrder:queue,planVersion:task.planVersion,...(assignee!==(task.assignee?.id??"")?{assigneeId:assignee||null}:{})})}));}catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить план");}finally{setBusy(false);}}
  return <div className="modal-backdrop action-backdrop"><form className="task-dialog" role="dialog" aria-modal="true" aria-label="Планирование задачи" onSubmit={e=>{e.preventDefault();void save();}}><header><h2>Сроки и очередь</h2><button type="button" aria-label="Закрыть планирование" disabled={busy} onClick={onClose}><X/></button></header><p>{task.itemName} · {task.workCenter.name}</p><label>Исполнитель<select aria-label="Исполнитель" value={assignee} disabled={loadingPeople} onChange={e=>setAssignee(e.target.value)}><option value="">Не назначен</option>{task.assignee&&!people.some(p=>p.id===task.assignee!.id)&&<option value={task.assignee.id}>{task.assignee.lastName} {task.assignee.firstName} (текущее назначение)</option>}{people.map(p=><option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}</select></label><label>Плановое начало<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Плановое завершение<input type="datetime-local" value={finish} onChange={e=>setFinish(e.target.value)}/></label><p>Пустые даты наследуются от запуска и заказа. Время указано в часовом поясе этого компьютера.</p><label>Норматив на всю партию, ч<input type="number" min="0.01" max="100000" step="any" value={norm} onChange={e=>setNorm(e.target.value===""?"":Number(e.target.value))}/></label><label>Порог риска, ч<input type="number" min="0" max="100000" step="any" value={risk} onChange={e=>setRisk(e.target.value===""?"":Number(e.target.value))}/></label><p>Введите норматив на всё количество задачи. Фактически отработанное время вычитается из норматива. Риск возникает, когда резерв не превышает указанный порог.</p><label>Порядок в очереди<input type="number" min={-1000000} max={1000000} required value={queue} onChange={e=>setQueue(Number(e.target.value))}/></label><p>Меньшее число — выше в списке. При одинаковом числе учитывается приоритет.</p><label>Приоритет<select value={priority} onChange={e=>setPriority(e.target.value)}>{Object.entries(priorities).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{error&&<p className="planning-error" role="alert">{error}</p>}<footer><button type="button" className="secondary" disabled={busy} onClick={onClose}>Отмена</button><button className="primary" disabled={busy}>{busy?"Сохраняю…":"Сохранить план"}</button></footer></form></div>;
}

export function Notifications({ onOpen, compact = false }: { onOpen: (id: string) => void; compact?: boolean }) {
  const revision = useProductionEvents();
  const [page, setPage] = useState(1), [error, setError] = useState("");
  const [data, setData] = useState<{ unread: number; total: number; items: { readAt?: string; notification: { id: string; title: string; message: string; entityId: string; createdAt: string } }[] }>({ unread: 0, total: 0, items: [] });
  useEffect(() => { let active = true; api<typeof data>(`/notifications?page=${page}`).then(next => { if (active) setData(next); }).catch(error => { if (active) setError(error.message); }); return () => { active = false; }; }, [revision, page]);
  if (compact) return <button className="notification-bell" aria-label={`Уведомления: ${data.unread}`} onClick={() => onOpen("")}><Bell size={18}/>{data.unread > 0 && <b>{data.unread}</b>}</button>;
  return <section className="content notifications"><div className="board-heading"><h2>Требует внимания</h2><span>{data.unread} непрочитанных</span></div>{error && <div className="planning-error">{error}</div>}{!data.items.length && <div className="planning-empty"><Bell/><b>Нет уведомлений</b></div>}{data.items.map(({ notification, readAt }) => <article className={readAt ? "read" : "unread"} key={notification.id}><button onClick={() => onOpen(notification.entityId)}><small>{new Date(notification.createdAt).toLocaleString("ru-RU")}</small><b>{notification.title}</b><span>{notification.message}</span></button>{!readAt && <button className="secondary" onClick={async () => { try { await api(`/notifications/${notification.id}/read`, { method: "POST" }); } catch (error) { setError((error as Error).message); } }}>Прочитано</button>}</article>)}<div className="pagination"><button className="secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Назад</button><span>{page}</span><button className="secondary" disabled={page * 30 >= data.total} onClick={() => setPage(value => value + 1)}>Далее</button></div></section>;
}
