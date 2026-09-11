import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertTriangle, Boxes, ClipboardList, Factory, LogOut, PackageCheck, Plus, Search, X, Clock, Route as RouteIcon } from "lucide-react";
import "./styles.css";
import "./interaction.css";
import "./latuning-theme.css";
import "./orders.css";
import "./procurement.css";
import { StaffScreen } from "./staff";
import { PlanningScreen } from "./planning";
import { OperationsScreen, Notifications } from "./operations";
import { useProductionEvents } from "./production-api";
import { Dashboard } from "./dashboard";
import { OrderForecast } from "./order-forecast";
import { Analytics } from "./analytics";
import { IntegrationMapping } from "./integration-mapping";
import { RouteTemplates } from "./route-templates";
import "./responsive-design.css";

type User = { firstName:string; lastName:string; role:"PLANNER"|"EMPLOYEE"; workCenters:{workCenter:{id:string;name:string}}[] };
type Summary = { orders:number; inProcurement:number; operations:number; stopped:number };
type Organization = "IP_VETROV"|"LATUNING"|"ECONTRID";
type OrderItem = { archivedAt?:string; comment?:string; id:string; name:string; quantity:number; completedQuantity:number; unitPrice:number; total:number; updatedAt:string };
type Order = { updatedAt:string; archivedAt?:string; id:string; productionOrderNumber:string; customerOrderNumber?:string; organization?:Organization; drawingApprovalDate?:string; productionLeadDays?:number; status:string; priority:string; dueDate?:string; items:OrderItem[]; total:number; completedTotal:number };
type Procurement = { id:string; status:string; startedAt:string; expectedAt?:string; readyAt?:string; deadlineState:string; comment?:string; responsible?:{id:string;firstName:string;lastName:string}; order:Order };
type UserOption = { id:string; firstName:string; lastName:string; role:string };
type DraftItem = { id?:string; updatedAt?:string; comment?:string; name:string; quantity:number|""; unitPrice:number };
type Page = "overview"|"orders"|"procurement"|"launches"|"templates"|"problems"|"centers"|"staff"|"analytics"|"integration";
const pages:Page[]=["overview","orders","procurement","launches","templates","problems","centers","staff","analytics","integration"];

async function api<T>(path:string, init?:RequestInit):Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials:"include", headers:{"Content-Type":"application/json",...init?.headers} });
  if (!response.ok) throw new Error((await response.json()).message || "Ошибка запроса");
  return response.status === 204 ? undefined as T : response.json();
}
const money = (value:number) => new Intl.NumberFormat("ru-RU", { style:"currency", currency:"RUB", maximumFractionDigits:0 }).format(value);
const statusLabel:Record<string,string> = { DRAFT:"Черновик", PROCUREMENT:"В закупке", READY_FOR_LAUNCH:"Готов к запуску", IN_PRODUCTION:"В производстве", PARTIALLY_READY:"Частично готов", COMPLETED:"Готов" };
const priorityLabel:Record<string,string> = { LOW:"Низкий", NORMAL:"Обычный", HIGH:"Высокий", CRITICAL:"Критический" };
const organizationOptions:{value:Organization;label:string}[] = [
  {value:"IP_VETROV",label:"ИП Ветров"},
  {value:"LATUNING",label:"Латунинг"},
  {value:"ECONTRID",label:"Эконтрид"}
];
const organizationLabel:Record<Organization,string> = {IP_VETROV:"ИП Ветров",LATUNING:"Латунинг",ECONTRID:"Эконтрид"};

function calculateDueDate(startValue:string, workingDaysValue:number|string):string {
  const workingDays=Number(workingDaysValue);
  if(!startValue || !Number.isInteger(workingDays) || workingDays<1)return "";
  const [year,month,day]=startValue.split("-").map(Number);
  const date=new Date(year,month-1,day,12);
  let remaining=workingDays;
  while(remaining>0){date.setDate(date.getDate()+1);const weekday=date.getDay();if(weekday!==0&&weekday!==6)remaining-=1;}
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function displayDate(value?:string):string {
  if(!value)return "—";
  const date=value.length===10?new Date(`${value}T12:00:00`):new Date(value);
  return date.toLocaleDateString("ru-RU");
}

function Login({onLogin}:{onLogin:(user:User)=>void}) {
  const [login,setLogin]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState("");
  async function submit(event:React.FormEvent) { event.preventDefault(); setError(""); try { await api("/auth/login",{method:"POST",body:JSON.stringify({login,password})}); onLogin(await api<User>("/me")); } catch(error) { setError(error instanceof Error?error.message:"Ошибка входа"); } }
  return <main className="login"><form onSubmit={submit}><div className="brand-mark">К</div><h1>LATUNING</h1><p>Управление производством</p><label>Логин<input value={login} onChange={e=>setLogin(e.target.value)} autoFocus/></label><label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div className="error">{error}</div>}<button>Войти</button></form></main>;
}

function Metric({icon:Icon,value,label,tone=""}:{icon:typeof Factory;value:number;label:string;tone?:string}) { return <article className={`metric ${tone}`}><Icon/><div><strong>{value}</strong><span>{label}</span></div></article>; }

function PlannerOverview() {
  const [summary,setSummary]=useState<Summary|null>(null); const revision=useProductionEvents();
  useEffect(()=>{api<Summary>("/planner/summary").then(setSummary).catch(()=>{});},[revision]);
  return <div className="content"><section className="metrics"><Metric icon={ClipboardList} value={summary?.orders??0} label="активных заказов"/><Metric icon={PackageCheck} value={summary?.inProcurement??0} label="в закупке"/><Metric icon={Factory} value={summary?.operations??0} label="операций в работе"/><Metric icon={AlertTriangle} value={summary?.stopped??0} label="остановлено" tone="danger"/></section><OperationsScreen planner/></div>;
}

function EmptyPanel({eyebrow,title,icon:Icon,text}:{eyebrow:string;title:string;icon:typeof Factory;text:string}) { return <article className="panel"><div className="panel-title"><div><small>{eyebrow}</small><h2>{title}</h2></div></div><div className="empty"><Icon/><b>{text}</b><span>Данные появятся после создания рабочих задач</span></div></article>; }

function OrderForm({onClose,onCreated,existing}:{onClose:()=>void;onCreated:(order:Order)=>void;existing?:Order}) {
  const [productionOrderNumber,setProductionOrderNumber]=useState(existing?.productionOrderNumber??"");
  const [customerOrderNumber,setCustomerOrderNumber]=useState(existing?.customerOrderNumber??"");
  const [organization,setOrganization]=useState<Organization|"">(existing?.organization??"");
  const [drawingApprovalDate,setDrawingApprovalDate]=useState(existing?.drawingApprovalDate?.slice(0,10)??"");
  const [productionLeadDays,setProductionLeadDays]=useState<number|"">(existing?.productionLeadDays??"");
  const [priority,setPriority]=useState(existing?.priority??"NORMAL");
  const [error,setError]=useState("");
  const [items,setItems]=useState<DraftItem[]>(existing?.items.map(i=>({id:i.id,updatedAt:i.updatedAt,name:i.name,quantity:i.quantity,unitPrice:i.unitPrice,comment:i.comment}))??[{name:"",quantity:"",unitPrice:0}]);
  const [archivedItems,setArchivedItems]=useState<OrderItem[]>([]);
  const total=items.reduce((sum,item)=>sum+(Number(item.quantity)||0)*(Number(item.unitPrice)||0),0);
  const dueDate=calculateDueDate(drawingApprovalDate,productionLeadDays);
  function patchItem(index:number, patch:Partial<DraftItem>) { setItems(current=>current.map((item,i)=>i===index?{...item,...patch}:item)); }
  async function loadItems() {
    if(!existing)return;
    const order=await api<Order>(`/orders/${existing.id}?items=all`);
    setItems(order.items.filter(item=>!item.archivedAt).map(item=>({id:item.id,updatedAt:item.updatedAt,name:item.name,quantity:item.quantity,unitPrice:item.unitPrice,comment:item.comment})));
    setArchivedItems(order.items.filter(item=>item.archivedAt));
  }
  useEffect(()=>{void loadItems().catch(error=>setError(error instanceof Error?error.message:"Не удалось загрузить позиции"));},[existing?.id]);
  async function setItemArchived(item:{id?:string;updatedAt?:string;name:string}, archived:boolean) {
    if(!existing||!item.id||!item.updatedAt)return;
    if(!window.confirm(archived?`Переместить «${item.name}» в архив? Маршруты и запуски сохранятся.`:`Восстановить «${item.name}» в заказ?`))return;
    setError("");
    try { await api(`/orders/${existing.id}/items/${item.id}/archive`,{method:"PATCH",body:JSON.stringify({archived,updatedAt:item.updatedAt})}); await loadItems(); }
    catch(error) { setError(error instanceof Error?error.message:"Не удалось изменить архив позиции"); }
  }
  async function submit(event:React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const order=await api<Order>(existing?`/orders/${existing.id}`:"/orders",{method:existing?"PUT":"POST",body:JSON.stringify({
        ...(existing?{updatedAt:existing.updatedAt}:{}),
        productionOrderNumber,
        customerOrderNumber:customerOrderNumber||undefined,
        organization,
        drawingApprovalDate,
        productionLeadDays:Number(productionLeadDays),
        priority,
        items:items.map(item=>({...item,quantity:Number(item.quantity)}))
      })});
      onCreated(order);
    } catch(error) {
      setError(error instanceof Error?error.message:"Не удалось создать заказ");
    }
  }
  return <div className="modal-backdrop">
    <form className="order-form" onSubmit={submit}>
      <div className="form-head"><div><small>{existing?"РЕДАКТИРОВАНИЕ":"НОВЫЙ ЗАКАЗ"}</small><h2>{existing?"Изменить заказ":"Создание заказа"}</h2></div><button type="button" className="close" onClick={onClose}><X/></button></div>
      <div className="form-grid order-identifiers">
        <label>Заказ на производство №<input value={productionOrderNumber} onChange={e=>setProductionOrderNumber(e.target.value)} required autoFocus/></label>
        <label>Заказ покупателя №<input value={customerOrderNumber} onChange={e=>setCustomerOrderNumber(e.target.value)}/></label>
        <label>Приоритет<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="LOW">Низкий</option><option value="NORMAL">Обычный</option><option value="HIGH">Высокий</option><option value="CRITICAL">Критический</option></select></label>
      </div>
      <fieldset className="organization-picker">
        <legend>Организация</legend>
        <div>{organizationOptions.map(option=><label className={`organization-option org-${option.value.toLowerCase()} ${organization===option.value?"selected":""}`} key={option.value}>
          <input type="radio" name="organization" value={option.value} checked={organization===option.value} onChange={()=>setOrganization(option.value)} required/>
          <i/><span><b>{option.label}</b></span><em>✓</em>
        </label>)}</div>
      </fieldset>
      <div className="form-grid schedule-grid">
        <label>Дата согласования чертежей<input type="date" value={drawingApprovalDate} onChange={e=>setDrawingApprovalDate(e.target.value)} required/></label>
        <label>Срок производства, рабочих дней<input type="number" min="1" max="3650" value={productionLeadDays} onChange={e=>setProductionLeadDays(e.target.value?Number(e.target.value):"")} placeholder="Например, 10" required/></label>
        <div className={`due-preview ${dueDate?"ready":""}`}><span>Конечный срок</span><strong>{dueDate?displayDate(dueDate):"Рассчитается автоматически"}</strong></div>
      </div>
      <div className="items-head"><h3>Продукция / номенклатура</h3><button type="button" onClick={()=>setItems([...items,{name:"",quantity:"",unitPrice:0}])}><Plus/> Добавить позицию</button></div>
      <div className="draft-items">{items.map((item,index)=><div className="draft-item" key={index}>
        <label>Номенклатура<input value={item.name} onChange={e=>patchItem(index,{name:e.target.value})} required/></label>
        <label>Количество, шт.<input type="number" min="1" value={item.quantity} onChange={e=>patchItem(index,{quantity:e.target.value?Number(e.target.value):""})} required/></label>
        <label>Цена за единицу, ₽<input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e=>patchItem(index,{unitPrice:Number(e.target.value)})} required/></label>
        <strong>{money(Number(item.quantity)*item.unitPrice)}</strong>
        {existing&&item.id&&<button type="button" className="archive-item" title="В архив" onClick={()=>void setItemArchived(item,true)}>В архив</button>}
        {items.length>1&&<button type="button" className="remove" onClick={()=>{if(!item.id||window.confirm("Удалить позицию из заказа?"))setItems(items.filter((_,i)=>i!==index));}}><X/></button>}
      </div>)}</div>
      {existing&&archivedItems.length>0&&<section className="archived-items"><h3>Архив позиций</h3>{archivedItems.map(item=><div key={item.id}><span><b>{item.name}</b><small>{item.quantity} шт. · {money(item.unitPrice*item.quantity)}</small></span><button type="button" className="secondary" onClick={()=>void setItemArchived(item,false)}>Восстановить</button></div>)}</section>}
      {error&&<div className="error">{error}</div>}
      <footer><div><span>Итого по заказу</span><strong>{money(total)}</strong></div><button type="button" className="secondary" onClick={onClose}>Отмена</button><button className="primary">{existing?"Сохранить изменения":"Создать заказ"}</button></footer>
    </form>
  </div>;
}

function OrdersScreen() {
  const [forecastOrder,setForecastOrder]=useState<Order|null>(null);
  const [clearing,setClearing]=useState(false),[importBusy,setImportBusy]=useState(false),[notice,setNotice]=useState(""); const importInput=useRef<HTMLInputElement>(null);
  const [orders,setOrders]=useState<Order[]>([]); const [loading,setLoading]=useState(true); const [search,setSearch]=useState(""); const [showForm,setShowForm]=useState(false); const [editing,setEditing]=useState<Order>(); const [archived,setArchived]=useState(false); const [error,setError]=useState("");
  const load=()=>{setLoading(true);return api<Order[]>(`/orders?archived=${archived}&search=${encodeURIComponent(search)}`).then(setOrders).catch(e=>setError(e.message)).finally(()=>setLoading(false));};
  async function archive(order:Order){if(!window.confirm(archived?"Вернуть заказ в работу?":"Переместить заказ в архив? Существующие производственные задачи продолжат выполняться."))return;try{await api(`/orders/${order.id}/archive`,{method:"PATCH",body:JSON.stringify({archived:!archived,updatedAt:order.updatedAt})});await load();}catch(e){setError(e instanceof Error?e.message:"Ошибка сохранения");}}
  async function clearArchive(order?:Order){
    if(clearing||!window.confirm(order?`Очистить запись «Производство № ${order.productionOrderNumber}»? Она исчезнет из архива, восстановление из списка станет недоступно. Производственные задачи и история сохранятся.`:"Очистить весь архив, включая записи вне текущего поиска? Восстановление из списка станет недоступно. Производственные задачи и история сохранятся."))return;
    setClearing(true);setError("");setNotice("");try{const result=await api<{count:number}>("/archive/clear",{method:"POST",body:JSON.stringify(order?{id:order.id,updatedAt:order.updatedAt}:{all:true})});setNotice(`Очищено записей: ${result.count}`);await load();}catch(e){setError((e as Error).message);}finally{setClearing(false);}
  }
  async function previewImport(file:File){setImportBusy(true);setError("");setNotice("");try{const csv=await file.text();const result=await api<{rows:number;errors:string[]}>("/orders/import/preview",{method:"POST",body:JSON.stringify({csv})});if(result.errors.length){setNotice(`Проверено строк: ${result.rows}. Ошибки: ${result.errors.join("; ")}`);return;}if(!window.confirm(`Проверено строк: ${result.rows}. Импортировать новые заказы? Существующие заказы не будут изменены.`)){setNotice("CSV проверен. Импорт отменён.");return;}const imported=await api<{orders:number;items:number}>("/orders/import",{method:"POST",body:JSON.stringify({csv})});setNotice(`Импортировано заказов: ${imported.orders}, позиций: ${imported.items}.`);await load();}catch(e){setError(e instanceof Error?e.message:"Не удалось импортировать CSV");}finally{setImportBusy(false);if(importInput.current)importInput.current.value="";}}
  useEffect(()=>{void load();},[archived]);
  return <div className="content orders-page">
    <div className="page-actions"><div><p className="kicker">ЗАКАЗЫ</p><h2>Портфель заказов</h2></div><div><label className="order-search"><Search/><input placeholder="Номер производства или покупателя" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&load()}/></label><a className="secondary" href={`/api/orders/export?archived=${archived}&search=${encodeURIComponent(search)}`} download="production-orders.csv">Экспорт CSV</a><button className="secondary" disabled={importBusy} onClick={()=>importInput.current?.click()}>Проверить CSV</button><input ref={importInput} hidden type="file" accept=".csv,text/csv" onChange={e=>{const file=e.target.files?.[0];if(file)void previewImport(file);}}/><button className="primary" onClick={()=>{setEditing(undefined);setShowForm(true);}}><Plus/> Новый заказ</button></div></div>
    <div className="page-actions"><button className="secondary" disabled={clearing} onClick={()=>{setArchived(!archived);setNotice("");}}>{archived?"Показать активные заказы":"Открыть архив"}</button><button className="secondary" onClick={()=>void load()}>Обновить список</button>{archived&&<button className="secondary" disabled={clearing||loading} onClick={()=>void clearArchive()}>{clearing?"Очищаю…":"Очистить всё"}</button>}</div>{notice&&<p role="status">{notice}</p>}{error&&<p className="error" role="alert">{error}</p>}
    <div className="order-table">
      <div className="order-row heading"><span>Заказ / организация</span><span>Срок</span><span>Статус</span><span>Позиции</span><span>Готово</span><span>Стоимость</span></div>
      {loading?<div className="table-empty">Загрузка…</div>:orders.length===0?<div className="table-empty"><ClipboardList/><b>{archived?"Архив пуст":"Заказов пока нет"}</b><span>{archived?"Нет записей по текущему поиску":"Создайте первый заказ вручную"}</span></div>:orders.map(order=><div className="order-row" key={order.id}>
        <span><b>Производство № {order.productionOrderNumber}</b><small>Заказ покупателя № {order.customerOrderNumber||"—"}</small>{order.organization&&<i className={`organization-badge org-${order.organization.toLowerCase()}`}>{organizationLabel[order.organization]}</i>}</span>
        <span><b>{displayDate(order.dueDate)}</b>{order.drawingApprovalDate&&<small>Согласовано: {displayDate(order.drawingApprovalDate)} · {order.productionLeadDays} раб. дн.</small>}</span>
        <span><i className={`status ${order.status.toLowerCase()}`}>{statusLabel[order.status]||order.status}</i><small>{priorityLabel[order.priority]}</small></span>
        <span>{order.items.length}</span><span>{money(order.completedTotal)}</span><span><b>{money(order.total)}</b>{!archived&&<button className="secondary" onClick={()=>{setEditing(order);setShowForm(true);}}>Изменить</button>}{!archived&&<button className="secondary" onClick={()=>setForecastOrder(order)}>Прогноз</button>}<button className="secondary" disabled={clearing} onClick={()=>void archive(order)}>{archived?"Восстановить":"В архив"}</button>{archived&&<button className="secondary" disabled={clearing} onClick={()=>void clearArchive(order)}>Очистить</button>}</span>
      </div>)}
    </div>
    {forecastOrder&&<div className="modal-backdrop"><section className="task-dialog" role="dialog" aria-modal="true" aria-label="Прогноз заказа"><header><h2>Заказ № {forecastOrder.productionOrderNumber}</h2><button aria-label="Закрыть прогноз" onClick={()=>{setForecastOrder(null);void load();}}>×</button></header><OrderForecast id={forecastOrder.id}/></section></div>}
    {showForm&&<OrderForm existing={editing} onClose={()=>setShowForm(false)} onCreated={()=>{setShowForm(false);void load();}}/>}
  </div>;
}

function ProcurementScreen() {
  const [records,setRecords]=useState<Procurement[]>([]); const [orders,setOrders]=useState<Order[]>([]); const [users,setUsers]=useState<UserOption[]>([]);
  const [orderId,setOrderId]=useState(""); const [expectedAt,setExpectedAt]=useState(""); const [responsibleId,setResponsibleId]=useState(""); const [error,setError]=useState("");
  const load=()=>Promise.all([api<Procurement[]>("/procurement"),api<Order[]>("/orders"),api<UserOption[]>("/users")]).then(([p,o,u])=>{setRecords(p);setOrders(o);setUsers(u);});
  useEffect(()=>{load();},[]);
  async function add(event:React.FormEvent){event.preventDefault();setError("");try{await api(`/orders/${orderId}/procurement`,{method:"POST",body:JSON.stringify({expectedAt:expectedAt?new Date(`${expectedAt}T12:00:00`).toISOString():undefined,responsibleId:responsibleId||undefined,status:"WAITING"})});setOrderId("");setExpectedAt("");await load();}catch(error){setError(error instanceof Error?error.message:"Ошибка закупки");}}
  const stateLabel:Record<string,string>={UNKNOWN:"Срок не задан",SCHEDULED:"По плану",OVERDUE:"Поступление просрочено",LATE_FOR_ORDER:"Позже срока заказа",READY:"Закупка готова"};
  return <div className="content procurement-page"><div className="page-actions"><div><p className="kicker">ЗАКУПКА</p><h2>Готовность материалов</h2></div></div><form className="procurement-add" onSubmit={add}><label>Заказ<select value={orderId} onChange={e=>setOrderId(e.target.value)} required><option value="">Выберите заказ</option>{orders.filter(o=>!records.some(r=>r.order.id===o.id)).map(o=><option value={o.id} key={o.id}>Производство № {o.productionOrderNumber} · покупатель № {o.customerOrderNumber||"—"}</option>)}</select></label><label>Ожидаемая дата<input type="date" value={expectedAt} onChange={e=>setExpectedAt(e.target.value)}/></label><label>Ответственный<select value={responsibleId} onChange={e=>setResponsibleId(e.target.value)}><option value="">Не назначен</option>{users.map(u=><option value={u.id} key={u.id}>{u.lastName} {u.firstName}</option>)}</select></label><button className="primary">Передать в закупку</button></form>{error&&<div className="error">{error}</div>}<div className="procurement-list">{records.length===0?<div className="table-empty"><PackageCheck/><b>В закупке пока ничего нет</b><span>Выберите заказ выше</span></div>:records.map(record=><article className="procurement-card" key={record.id}><div><small>ЗАКАЗ НА ПРОИЗВОДСТВО</small><h3>№ {record.order.productionOrderNumber}</h3><span>Заказ покупателя № {record.order.customerOrderNumber||"—"}</span></div><div><small>ОЖИДАЕМ</small><b>{record.expectedAt?new Date(record.expectedAt).toLocaleDateString("ru-RU"):"Дата не задана"}</b><span>Срок заказа: {record.order.dueDate?new Date(record.order.dueDate).toLocaleDateString("ru-RU"):"—"}</span></div><div><small>ОТВЕТСТВЕННЫЙ</small><b>{record.responsible?`${record.responsible.lastName} ${record.responsible.firstName}`:"Не назначен"}</b><span>{record.order.items.length} поз. · {money(record.order.total)}</span></div><i className={`deadline ${record.deadlineState.toLowerCase()}`}>{stateLabel[record.deadlineState]}</i><select value={record.status} onChange={async e=>{await api(`/procurement/${record.id}`,{method:"PATCH",body:JSON.stringify({status:e.target.value})});await load();}}><option value="WAITING">Ожидаем</option><option value="ORDERED">Заказано</option><option value="PARTIALLY_RECEIVED">Частично получено</option><option value="READY">Готово</option></select></article>)}</div></div>;
}

type SearchResult={type:"order"|"launch"|"operation"|"employee";id:string;centerId?:string;title:string;detail:string};
function GlobalSearch({onSelect}:{onSelect:(item:SearchResult)=>void}){
 const [q,setQ]=useState(""),[items,setItems]=useState<SearchResult[]>([]),[open,setOpen]=useState(false);
 useEffect(()=>{if(q.trim().length<2){setItems([]);return;}let active=true;const timer=setTimeout(()=>api<{items:SearchResult[]}>(`/planner/search?q=${encodeURIComponent(q)}`).then(data=>{if(active)setItems(data.items);}).catch(()=>{if(active)setItems([]);}),180);return()=>{active=false;clearTimeout(timer);};},[q]);
 return <div className="global-search" style={{display:"flex",alignItems:"center",gap:7,position:"relative",width:220,padding:"8px 10px",border:"1px solid #d7dcd8"}}><Search size={16}/><input aria-label="Глобальный поиск" placeholder="Поиск" style={{width:"100%",minWidth:0,border:0,outline:0}} value={q} onFocus={()=>setOpen(true)} onChange={e=>{setQ(e.target.value);setOpen(true);}}/>{open&&q.trim().length>=2&&<div className="global-results" style={{position:"absolute",zIndex:30,top:"calc(100% + 4px)",right:0,width:360,maxHeight:330,overflow:"auto",background:"#fff",border:"1px solid #d7dcd8",boxShadow:"0 12px 30px #1d2a2230"}}>{items.length?items.map(item=><button key={`${item.type}-${item.id}`} style={{display:"grid",width:"100%",gap:3,padding:"10px 12px",textAlign:"left",border:0,borderBottom:"1px solid #edf0ed",background:"#fff"}} onMouseDown={e=>e.preventDefault()} onClick={()=>{onSelect(item);setQ("");setOpen(false);}}><b>{item.title}</b><small>{item.detail}</small></button>):<span style={{display:"block",padding:12}}>Ничего не найдено</span>}</div>}</div>;
}

function Shell({user,onLogout}:{user:User;onLogout:()=>void}) {
  const employee=user.role==="EMPLOYEE";
  const locationState=()=>{const params=new URLSearchParams(window.location.hash.slice(1));const requested=params.get("page");const page=pages.includes(requested as Page)&&(!employee||requested==="overview")?requested as Page:"overview";return {page,center:page==="centers"?params.get("center")||"":"",focus:page==="centers"?params.get("task")||"":""};};
  const initialLocation=locationState();
  const [page,setPage]=useState<Page>(initialLocation.page); const [center,setCenter]=useState(initialLocation.center); const [focus,setFocus]=useState(initialLocation.focus);
  const navigate=(nextPage:Page,nextCenter="",nextFocus="")=>{const safePage=employee?"overview":nextPage;setPage(safePage);setCenter(safePage==="centers"?nextCenter:"");setFocus(safePage==="centers"?nextFocus:"");const params=new URLSearchParams({page:safePage});if(safePage==="centers"&&nextCenter)params.set("center",nextCenter);if(safePage==="centers"&&nextFocus)params.set("task",nextFocus);window.history.pushState(null,"",`#${params.toString()}`);};
  useEffect(()=>{const restore=()=>{const saved=locationState();setPage(saved.page);setCenter(saved.center);setFocus(saved.focus);};window.addEventListener("popstate",restore);window.addEventListener("hashchange",restore);return()=>{window.removeEventListener("popstate",restore);window.removeEventListener("hashchange",restore);};},[]);
  const titles:Record<Page,string>={overview:employee?`Мой участок — ${user.workCenters[0]?.workCenter.name??"не назначен"}`:"Производство сегодня",orders:"Заказы",procurement:"Закупка",launches:"Производственные запуски",templates:"Шаблоны маршрутов",problems:"Уведомления Планеру",staff:"Сотрудники",analytics:"Аналитика",centers:"Производственные участки",integration:"Настройки"};
  const openCenter=(id:string)=>navigate("centers",id);
  const openTask=(id:string)=>navigate(id?"centers":"problems","",id);
  const openSearch=(item:SearchResult)=>{if(item.type==="operation")navigate("centers",item.centerId||"",item.id);else if(item.type==="employee")navigate("staff");else if(item.type==="launch")navigate("launches");else navigate("orders");};
  const nav=(target:Page,Icon:typeof Factory,label:string)=><button className={page===target?"active":""} onClick={()=>navigate(target)}><Icon/> {label}</button>;
  return <div className="shell"><aside><div className="logo"><span>К</span><b>LATUNING</b></div><nav>{nav("overview",Factory,employee?"Мой участок":"Обзор")}{!employee&&<>{nav("orders",ClipboardList,"Заказы")}{nav("procurement",PackageCheck,"Закупка")}{nav("launches",Boxes,"Запуски")}{nav("templates",RouteIcon,"Шаблоны")}{nav("centers",Factory,"Участки")}{nav("problems",AlertTriangle,"Уведомления")}{nav("staff",Factory,"Сотрудники")}{nav("analytics",Clock,"Аналитика")}{nav("integration",PackageCheck,"Настройки")}</>}</nav><button className="logout" onClick={onLogout}><LogOut/> Выйти</button></aside><main><header><div><p>{employee?"РАБОЧЕЕ МЕСТО":"ЦЕНТР УПРАВЛЕНИЯ"}</p><h1>{titles[page]}</h1></div><div className="header-tools">{!employee&&<GlobalSearch onSelect={openSearch}/>} {!employee&&<Notifications compact onOpen={openTask}/>}<span className="avatar">{user.firstName[0]}{user.lastName[0]}</span><div><b>{user.firstName} {user.lastName}</b><small>{employee?"Сотрудник участка":"Планер"}</small></div></div></header>{employee?<OperationsScreen/>:page==="integration"?<IntegrationMapping/>:page==="analytics"?<Analytics onOpenTask={openTask}/>:page==="staff"?<StaffScreen/>:page==="orders"?<OrdersScreen/>:page==="procurement"?<ProcurementScreen/>:page==="overview"?<Dashboard onOpenTask={openTask}/>:page==="launches"?<PlanningScreen onOpenCenter={openCenter} onOpenTemplates={()=>navigate("templates")}/>:page==="templates"?<RouteTemplates/>:page==="centers"?<OperationsScreen key={center} planner initialCenter={center} focusId={focus}/>:page==="problems"?<Notifications onOpen={openTask}/>:<div className="content"><EmptyPanel eyebrow="РАЗДЕЛ" title={titles[page]} icon={Factory} text="Раздел готовится"/></div>}</main></div>;
}

function App() { const [user,setUser]=useState<User|null>(null); const [loading,setLoading]=useState(true); useEffect(()=>{api<User>("/me").then(setUser).catch(()=>{}).finally(()=>setLoading(false));},[]); if(loading)return <div className="splash">LATUNING</div>; if(!user)return <Login onLogin={setUser}/>; return <Shell user={user} onLogout={async()=>{await api("/auth/logout",{method:"POST"});setUser(null);}}/>; }

createRoot(document.getElementById("root")!).render(<App/>);
