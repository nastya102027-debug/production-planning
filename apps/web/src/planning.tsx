import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Boxes, CheckCircle2, Factory, GripVertical, Layers3, Play, Plus, Route as RouteIcon, Trash2, X } from "lucide-react";
import "./planning.css";
import { useProductionEvents } from "./production-api";
import type { ProductionRoute } from "./route-graph";

const RouteBuilder=lazy(()=>import("./route-graph").then(module=>({default:module.RouteBuilder})));

type WorkCenter = { id:string; name:string };
type OrderItem = { id:string; name:string; quantity:number; unitPrice:number; launchedQuantity:number };
type Order = { id:string; productionOrderNumber:string; customerOrderNumber?:string; organization?:string; status:string; priority:string; dueDate?:string; items:OrderItem[] };
type Operation = { id:string; title:string; quantity:number; completedQuantity:number; status:string; priority:string; dueDate?:string; workCenter:WorkCenter; predecessors:{predecessor:{id:string;status:string}}[] };
type LaunchItem = { id:string; quantity:number; orderItem:OrderItem; route:ProductionRoute; operations:Operation[] };
type Launch = { id:string; number:string; priority:string; plannedStart?:string; plannedFinish?:string; order:Order; items:LaunchItem[] };
type ItemDraft = { selected:boolean; quantity:number|""; routeId:string };
type RouteTemplate = { id:string; name:string; description?:string|null; category?:string|null; updatedAt:string; steps:{id:string;workCenter:WorkCenter}[]; _count?:{appliedRoutes:number} };


async function api<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`/api${path}`,{...init,credentials:"include",headers:{"Content-Type":"application/json",...init?.headers}});
  if(!response.ok)throw new Error((await response.json()).message||"Ошибка запроса");
  return response.status===204?undefined as T:response.json();
}

const dateLabel=(value?:string)=>value?new Date(value).toLocaleDateString("ru-RU"):"—";
const subtractWorkingDays=(value?:string)=>{if(!value)return "";const date=new Date(`${value.slice(0,10)}T12:00:00Z`);let left=3;while(left){date.setUTCDate(date.getUTCDate()-1);if(date.getUTCDay()!==0&&date.getUTCDay()!==6)left--;}return date.toISOString().slice(0,10);};
const statusLabel:Record<string,string>={DRAFT:"Черновик",PROCUREMENT:"В закупке",READY_FOR_LAUNCH:"Готов к запуску",IN_PRODUCTION:"В производстве",PARTIALLY_READY:"Частично готов",COMPLETED:"Завершён",QUEUED:"К запуску",IN_PROGRESS:"В работе",PAUSED:"Остановлено",CANCELLED:"Отменено"};
const defaultOperationLabels:Record<string,string>={QUEUED:"К запуску",IN_PROGRESS:"В работе",PAUSED:"Остановлено",COMPLETED:"Готово",CANCELLED:"Отменено"};
const priorityLabel:Record<string,string>={LOW:"Низкий",NORMAL:"Обычный",HIGH:"Высокий",CRITICAL:"Критический"};
const workCenterAccent:Record<string,string>={"Лазер":"center-card--laser","Гибка":"center-card--bending","Малярка Порошок":"center-card--powder","Нитрид":"center-card--nitride","Гильотина":"center-card--cutting","Пила":"center-card--saw","Шлиф станок":"center-card--grinding","Шлифовка ручная":"center-card--grinding","Сварка":"center-card--welding","Слесарка":"center-card--metalwork","Фрезер ЧПУ":"center-card--milling","Токарка ЧПУ":"center-card--milling","Фрезер ручной":"center-card--milling","Малярка":"center-card--painting","Патина":"center-card--patina","ОТК":"center-card--quality"};
const searchWords=(value:string)=>[...new Set(value.toLocaleLowerCase("ru").split(/[^\p{L}\p{N}]+/u).filter(word=>word.length>=3))];
function suggestedTemplates(templates:RouteTemplate[], itemName:string, query:string) {
  const typed=searchWords(query), itemWords=searchWords(itemName);
  const score=(template:RouteTemplate)=>{const text=[template.name,template.description??"",template.category??""].join(" ").toLocaleLowerCase("ru");const words=typed.length?typed:itemWords;return words.reduce((sum,word)=>sum+(text.includes(word)?(template.name.toLocaleLowerCase("ru").includes(word)?6:3):0),0);};
  const ranked=[...templates].map(template=>({template,score:score(template)})).sort((a,b)=>b.score-a.score||((b.template._count?.appliedRoutes??0)-(a.template._count?.appliedRoutes??0))||Date.parse(b.template.updatedAt)-Date.parse(a.template.updatedAt));
  const matches=ranked.filter(row=>row.score>0).map(row=>row.template).slice(0,6);
  return matches.length?{title:typed.length?"Поиск по шаблонам":`Подходит к «${itemName}»`,templates:matches}: {title:"Часто используемые",templates:ranked.slice(0,6).map(row=>row.template)};
}

// Операции приходят из базы без гарантированного порядка. Собираем их по
// зависимостям маршрута: один уровень — параллельные этапы, следующий — этапы
// после их завершения. Порядок внутри уровня берём из сохранённого маршрута.
function launchOperationLevels(launchItem:LaunchItem):Operation[][] {
  const routePositions=new Map<string,number>();
  const unassigned=[...launchItem.operations];
  launchItem.route.steps.forEach((step,index)=>{
    const operationIndex=unassigned.findIndex(operation=>operation.title===step.title&&operation.workCenter.id===step.workCenter.id);
    if(operationIndex>=0)routePositions.set(unassigned.splice(operationIndex,1)[0].id,index);
  });
  unassigned.forEach((operation,index)=>routePositions.set(operation.id,launchItem.route.steps.length+index));

  const byId=new Map(launchItem.operations.map(operation=>[operation.id,operation]));
  const pending=new Map(launchItem.operations.map(operation=>[operation.id,new Set(operation.predecessors.map(link=>link.predecessor.id).filter(id=>byId.has(id)))]));
  const remaining=new Set(launchItem.operations.map(operation=>operation.id));
  const levels:Operation[][]=[];
  const compare=(left:Operation,right:Operation)=>(routePositions.get(left.id)??0)-(routePositions.get(right.id)??0);

  while(remaining.size){
    const ready=[...remaining].map(id=>byId.get(id)!).filter(operation=>pending.get(operation.id)?.size===0).sort(compare);
    // Защита от старых маршрутов с ошибочной циклической зависимостью: карточка
    // всё равно остаётся читаемой, а не зависает при показе запуска.
    const level=ready.length?ready:[...remaining].map(id=>byId.get(id)!).sort(compare);
    levels.push(level);
    level.forEach(operation=>{
      remaining.delete(operation.id);
      remaining.forEach(id=>pending.get(id)?.delete(operation.id));
    });
  }
  return levels;
}

export function PlanningScreen({onOpenCenter}:{onOpenCenter:(id:string)=>void;onOpenTemplates:()=>void}){
  const revision=useProductionEvents();
  const [search,setSearch]=useState(""); const [orderPage,setOrderPage]=useState(1); const [orderTotal,setOrderTotal]=useState(0);
  const [centerStats,setCenterStats]=useState<(WorkCenter & {counts:Record<string,number>})[]>([]);
  const [review,setReview]=useState(false); const [editRoute,setEditRoute]=useState<ProductionRoute|undefined>();
  const [launchPage,setLaunchPage]=useState(1);
  const [orders,setOrders]=useState<Order[]>([]);
  const [launches,setLaunches]=useState<Launch[]>([]);
  const [orderLaunches,setOrderLaunches]=useState<Launch[]>([]);
  const [centers,setCenters]=useState<WorkCenter[]>([]);
  const [selectedOrderId,setSelectedOrderId]=useState("");
  const [routes,setRoutes]=useState<Record<string,ProductionRoute[]>>({});
  const [templates,setTemplates]=useState<RouteTemplate[]>([]);
  const [routePicker,setRoutePicker]=useState("");
  const [routeQueries,setRouteQueries]=useState<Record<string,string>>({});
  const [libraryPicker,setLibraryPicker]=useState("");
  const [libraryQuery,setLibraryQuery]=useState("");
  const [drafts,setDrafts]=useState<Record<string,ItemDraft>>({});
  const [routeItem,setRouteItem]=useState<OrderItem|null>(null);
  const [launchRouteEditing,setLaunchRouteEditing]=useState<{launch:Launch;launchItem:LaunchItem}|null>(null);
  const [plannedStart,setPlannedStart]=useState("");
  const [plannedFinish,setPlannedFinish]=useState("");
  const [priority,setPriority]=useState("NORMAL");
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [operationLabels,setOperationLabels]=useState(defaultOperationLabels);

  async function load(){
    const [orderResult,nextLaunches,nextCenters,nextTemplates]=await Promise.all([api<{items:Order[];total:number}>(`/planning/orders?search=${encodeURIComponent(search)}&page=${orderPage}`),api<Launch[]>(`/launches?page=${launchPage}`),api<(WorkCenter & {counts:Record<string,number>})[]>("/planning/centers"),api<RouteTemplate[]>("/route-templates")]);
    const nextOrders=orderResult.items; setOrderTotal(orderResult.total); setCenterStats(nextCenters);
    setOrders(nextOrders);setLaunches(nextLaunches);setCenters(nextCenters);setTemplates(nextTemplates);setSelectedOrderId(current=>nextOrders.some(order=>order.id===current)?current:nextOrders[0]?.id||"");setLoading(false);
  }
  useEffect(()=>{load().catch(error=>{setError(error instanceof Error?error.message:"Ошибка загрузки");setLoading(false);});},[search,orderPage,launchPage,revision]);
  useEffect(()=>{let active=true;api<{code:string;name:string}[]>("/operation-statuses").then(rows=>{if(active)setOperationLabels(current=>({...current,...Object.fromEntries(rows.map(row=>[row.code,row.name]))}));}).catch(()=>{});return()=>{active=false;};},[]);
  useEffect(()=>{let active=true;if(!selectedOrderId){setOrderLaunches([]);return;}api<Launch[]>(`/planning/orders/${selectedOrderId}/launches`).then(rows=>{if(active)setOrderLaunches(rows);}).catch(error=>{if(active)setError(error instanceof Error?error.message:"Ошибка загрузки запусков");});return()=>{active=false;};},[selectedOrderId,revision]);
  const selectedOrder=orders.find(order=>order.id===selectedOrderId);
  const launchedByItem=Object.fromEntries(orders.flatMap(order=>order.items.map(item=>[item.id,item.launchedQuantity])));

  useEffect(()=>{
    if(!selectedOrder)return;
    setPlannedFinish(subtractWorkingDays(selectedOrder.dueDate));
    setDrafts(Object.fromEntries(selectedOrder.items.map(item=>[item.id,{selected:false,quantity:"",routeId:""}])));
    let active=true;
    Promise.all(selectedOrder.items.map(async item=>[item.id,await api<ProductionRoute[]>(`/order-items/${item.id}/routes`)] as const)).then(entries=>{if(active)setRoutes(current=>({...current,...Object.fromEntries(entries)}));}).catch(error=>setError(error instanceof Error?error.message:"Ошибка маршрутов"));
    return()=>{active=false;};
  },[selectedOrderId]);

  const operations=useMemo(()=>launches.flatMap(launch=>launch.items.flatMap(item=>item.operations.map(operation=>({operation,launch,item,order:launch.order})))),[launches]);
  const centersWithTasks=centerStats.filter(center=>["QUEUED","IN_PROGRESS","PAUSED"].some(status=>center.counts[status])).length;
  const availableOrders=orders.filter(order=>order.items.some(item=>(launchedByItem[item.id]||0)<item.quantity)).length;
  const queued=centerStats.reduce((sum,center)=>sum+(center.counts.QUEUED||0),0);
  const stopped=operations.filter(entry=>entry.operation.status==="PAUSED").length;
  const libraryItem=selectedOrder?.items.find(item=>item.id===libraryPicker);
  const libraryNeedle=libraryQuery.trim().toLocaleLowerCase("ru");
  const libraryRecommended=libraryItem?suggestedTemplates(templates,libraryItem.name,libraryQuery):{title:"Шаблоны",templates:[] as RouteTemplate[]};
  const libraryTemplates=libraryItem?(libraryNeedle?[...templates].filter(template=>[template.name,template.description??"",template.category??""].join(" ").toLocaleLowerCase("ru").includes(libraryNeedle)).sort((a,b)=>(b._count?.appliedRoutes??0)-(a._count?.appliedRoutes??0)||Date.parse(b.updatedAt)-Date.parse(a.updatedAt)).slice(0,18):libraryRecommended.templates):[];

  function patchDraft(itemId:string,patch:Partial<ItemDraft>){setDrafts(current=>({...current,[itemId]:{...current[itemId],...patch}}));}
  async function applyTemplate(item:OrderItem,templateId:string){
    if(!templateId)return;
    setError("");setSuccess("");
    try{
      const route=await api<ProductionRoute>(`/order-items/${item.id}/route-templates/${templateId}/apply`,{method:"POST",body:JSON.stringify({})});
      setRoutes(current=>({...current,[item.id]:[route,...(current[item.id]||[])]}));
      patchDraft(item.id,{selected:true,quantity:drafts[item.id]?.quantity||1,routeId:route.id});
      setRoutePicker("");
      setLibraryPicker("");
      setLibraryQuery("");
      setSuccess(`Шаблон «${route.name}» добавлен к позиции. При необходимости откройте маршрут и измените его перед запуском.`);
    }catch(error){setError(error instanceof Error?error.message:"Не удалось применить шаблон маршрута");}
  }
  async function deleteRoute(item:OrderItem,route:ProductionRoute){
    if(!window.confirm(`Удалить сохранённый маршрут «${route.name}»?`))return;
    setError("");setSuccess("");
    try{
      const result=await api<{archived?:boolean}>(`/order-items/${item.id}/routes/${route.id}`,{method:"DELETE"});
      setRoutes(current=>({...current,[item.id]:(current[item.id]||[]).filter(candidate=>candidate.id!==route.id)}));
      if(drafts[item.id]?.routeId===route.id)patchDraft(item.id,{routeId:""});
      setSuccess(result?.archived?"Маршрут скрыт из выбора: он уже используется в созданном запуске.":"Сохранённый маршрут удалён.");
    }catch(error){setError(error instanceof Error?error.message:"Не удалось удалить маршрут");}
  }
  async function replaceLaunchRoute(launch:Launch,launchItem:LaunchItem,route:ProductionRoute){
    if(!window.confirm(`Заменить маршрут «${launchItem.route.name}» на «${route.name}» для ${launchItem.quantity} шт.? Очередные задачи будут перестроены.`))return;
    setError("");setSuccess("");
    try{
      await api<Launch>(`/launches/${launch.id}/items/${launchItem.id}/route`,{method:"PUT",body:JSON.stringify({routeId:route.id})});
      setSuccess(`Маршрут запуска № ${launch.number} исправлен. Задачи заново разложены по участкам.`);
      await load();
    }catch(error){setError(error instanceof Error?error.message:"Не удалось изменить маршрут запуска");}
  }
  async function submitLaunch(confirmed=false){
    setError("");setSuccess("");
    if(!selectedOrder){setError("Выберите заказ");return;}
    const selected=selectedOrder.items.filter(item=>drafts[item.id]?.selected);
    if(selected.length===0){setError("Выберите хотя бы одну позицию");return;}
    const invalid=selected.find(item=>!drafts[item.id].routeId||!drafts[item.id].quantity||Number(drafts[item.id].quantity)<1||Number(drafts[item.id].quantity)>item.quantity-(launchedByItem[item.id]||0));
    if(invalid){setError(`Проверьте количество и маршрут позиции «${invalid.name}»`);return;}
    if(plannedStart&&plannedFinish&&plannedFinish<plannedStart){setError("Плановое завершение не может быть раньше начала");return;}
    if(!confirmed){setReview(true);return;}
    setSubmitting(true);
    try{
      const created=await api<{number:string}>("/launches",{method:"POST",body:JSON.stringify({orderId:selectedOrder.id,priority,plannedStart:plannedStart?new Date(`${plannedStart}T12:00:00`).toISOString():undefined,items:selected.map(item=>({orderItemId:item.id,routeId:drafts[item.id].routeId,quantity:Number(drafts[item.id].quantity)}))})});
      setSuccess(`Запуск № ${created.number} создан. Задачи распределены по участкам.`);setPlannedStart("");setPlannedFinish("");setDrafts({});setReview(false);await load();
    }catch(error){setError(error instanceof Error?error.message:"Не удалось создать запуск");}finally{setSubmitting(false);}
  }

  if(loading)return <div className="content planning-page"><div className="planning-loading">Загрузка планирования…</div></div>;
  return <div className="content planning-page">
    <section className="planning-kpis"><article><Layers3/><div><strong>{availableOrders}</strong><span>доступных заказов на странице</span></div></article><article><Boxes/><div><strong>{launches.length}</strong><span>запусков на странице</span></div></article><article><Play/><div><strong>{queued}</strong><span>задач к запуску</span></div></article><article className={stopped?"alert":""}><Factory/><div><strong>{centersWithTasks}</strong><span>участков загружено</span></div></article></section>
    <div className="planning-heading"><div><p>ПЛАНИРОВАНИЕ</p><h2>Сформировать производственный запуск</h2></div><div className="planning-steps"><span className="active">1 Заказ</span><span>2 Позиции</span><span>3 Маршрут</span><span>4 Запуск</span></div></div>
    <section className="planning-workspace">
      <aside className="planning-orders"><input aria-label="Поиск заказов для планирования" placeholder="Найти заказ или позицию" value={search} onChange={event=>{setSearch(event.target.value);setOrderPage(1);}}/><header><b>Заказы</b><span>{orderTotal}</span></header><div>{orders.map(order=>{
        const remaining=order.items.reduce((sum,item)=>sum+Math.max(0,item.quantity-(launchedByItem[item.id]||0)),0);
        return <button className={selectedOrderId===order.id?"selected":""} key={order.id} onClick={()=>setSelectedOrderId(order.id)}><span><b>№ {order.productionOrderNumber}</b><small>Покупатель № {order.customerOrderNumber||"—"}</small></span><em>{remaining} шт. осталось</em><i className={`order-state ${order.status.toLowerCase()}`}>{statusLabel[order.status]||order.status}</i></button>;
      })}</div><div className="pagination"><button disabled={orderPage===1} onClick={()=>setOrderPage(value=>value-1)}>Назад</button><span>{orderPage}</span><button disabled={orderPage*30>=orderTotal} onClick={()=>setOrderPage(value=>value+1)}>Далее</button></div></aside>
      <main className="launch-editor">{!selectedOrder?<div className="planning-empty"><Boxes/><b>Нет заказов для планирования</b></div>:<>
        <header><div><small>ЗАКАЗ НА ПРОИЗВОДСТВО</small><h3>№ {selectedOrder.productionOrderNumber}</h3><span>Срок: {dateLabel(selectedOrder.dueDate)}</span></div><div><label>Номер запуска<input value="Будет создан автоматически" readOnly/></label><label>Приоритет<select value={priority} onChange={event=>setPriority(event.target.value)}><option value="LOW">Низкий</option><option value="NORMAL">Обычный</option><option value="HIGH">Высокий</option><option value="CRITICAL">Критический</option></select></label></div></header>
        <div className="launch-dates"><label>Плановое начало<input type="date" value={plannedStart} onChange={event=>setPlannedStart(event.target.value)}/></label><label>Плановое завершение<input type="date" value={plannedFinish} readOnly/><small>Крайний срок заказа минус 3 рабочих дня</small></label></div>
        <div className="launch-items"><div className="launch-items-title"><b>Позиции запуска</b><span>Можно выбрать часть заказа или часть количества</span></div>{selectedOrder.items.map(item=>{
          const launched=launchedByItem[item.id]||0;const available=Math.max(0,item.quantity-launched);const draft=drafts[item.id]||{selected:false,quantity:"",routeId:""};const itemRoutes=routes[item.id]||[];const pickerNeedle=(routeQueries[item.id]??"").trim();const templateSuggestions=suggestedTemplates(templates,item.name,pickerNeedle);const matchingRoutes=itemRoutes.filter(route=>route.id===draft.routeId||!pickerNeedle||route.name.toLocaleLowerCase("ru").includes(pickerNeedle.toLocaleLowerCase("ru"))).slice(0,5);const selectedRoute=itemRoutes.find(route=>route.id===draft.routeId);
return <article className={`${draft.selected?"selected":""} ${available===0?"disabled":""}`} key={item.id}><label className="item-check"><input type="checkbox" checked={draft.selected} disabled={available===0} onChange={event=>patchDraft(item.id,{selected:event.target.checked})}/><span/></label><div className="item-name"><b>{item.name}</b><span>Заказано: {item.quantity} · запущено: {launched} · доступно: {available}</span></div><label>Количество<input type="number" min="1" max={available} value={draft.quantity} disabled={!draft.selected} onChange={event=>patchDraft(item.id,{quantity:event.target.value?Number(event.target.value):""})}/></label><div className="route-choice"><span>Маршрут или шаблон</span><div className="route-choice-control"><button type="button" className={`route-choice-toggle ${selectedRoute?"selected":""}`} aria-expanded={routePicker===item.id} onClick={()=>setRoutePicker(current=>current===item.id?"":item.id)} disabled={available===0}><b>{selectedRoute?`${selectedRoute.name} · ${selectedRoute.steps.length} эт.`:"Выберите маршрут или шаблон"}</b></button><button type="button" className="route-library-trigger" aria-label={`Выбрать шаблон для ${item.name}`} title="Выбрать шаблон из библиотеки" disabled={available===0} onClick={()=>{setRoutePicker("");setLibraryQuery("");setLibraryPicker(item.id);}}><ArrowDown size={16}/></button></div>{routePicker===item.id&&<><button type="button" className="route-choice-scrim" aria-label="Закрыть выбор маршрута" onClick={()=>setRoutePicker("")}/><div className="route-choice-menu" role="dialog" aria-label={`Выбор маршрута для ${item.name}`}><div className="route-choice-menu-head"><div><small>МАРШРУТ ДЛЯ ПОЗИЦИИ</small><b>{item.name}</b></div><button type="button" aria-label="Закрыть выбор маршрута" onClick={()=>setRoutePicker("")}><X/></button></div><input aria-label={`Найти маршрут или шаблон для ${item.name}`} autoFocus placeholder="Например: профиль, полоса, зеркало" value={routeQueries[item.id]??""} onChange={event=>setRouteQueries(current=>({...current,[item.id]:event.target.value}))}/><div className="route-choice-results"><section><small>{templateSuggestions.title}</small>{templateSuggestions.templates.map(template=><button type="button" className="route-choice-result" key={template.id} onClick={()=>void applyTemplate(item,template.id)}><span><b>{template.name}</b><small>{template.category||`${template.steps.length} этапов`}</small></span><em>{template._count?.appliedRoutes?`${template._count.appliedRoutes} раз`:"Шаблон"}</em></button>)}</section>{matchingRoutes.length>0&&<section><small>Сохранённые маршруты этой позиции</small>{matchingRoutes.map(route=><button type="button" className="route-choice-result" key={route.id} onClick={()=>{patchDraft(item.id,{selected:true,quantity:drafts[item.id]?.quantity||1,routeId:route.id});setRoutePicker("");}}><span><b>{route.name}</b><small>{route.steps.length} этапов</small></span><em>Маршрут</em></button>)}</section>}</div><button type="button" className="route-library-link" onClick={()=>{setRoutePicker("");setLibraryQuery("");setLibraryPicker(item.id);}}>Все шаблоны для этой позиции</button></div></>}</div><button className="route-button" onClick={()=>{setEditRoute(undefined);setRouteItem(item);}}><RouteIcon/>{itemRoutes.length?"Новый":"Создать"}</button>{selectedRoute&&<button className="route-button" onClick={()=>{setEditRoute(selectedRoute);setRouteItem(item);}}>Изменить</button>}{selectedRoute&&<button className="route-button route-delete" onClick={()=>void deleteRoute(item,selectedRoute)}><Trash2/>Удалить</button>}</article>;
        })}</div>
        {orderLaunches.length>0&&<section className="launched-items-summary" aria-label="Уже созданные запуски"><header><div><small>УЖЕ ЗАПУЩЕНО</small><b>Запущенные части заказа</b></div><span>Маршрут и количество фиксируются для каждого запуска</span></header>{orderLaunches.flatMap(launch=>launch.items.map(launchItem=>{const editable=launchItem.operations.every(operation=>operation.status==="QUEUED");const itemRoutes=routes[launchItem.orderItem.id]||[];const alternatives=itemRoutes.filter(route=>route.id!==launchItem.route.id);const operationLevels=launchOperationLevels(launchItem);return <article key={launchItem.id}><div className="launched-item-head"><span><b>{launchItem.orderItem.name}</b><small>Запуск № {launch.number} · {launchItem.quantity} шт. · {priorityLabel[launch.priority]}</small></span><em className={editable?"ready":"locked"}>{editable?"Можно исправить":"Маршрут уже в работе"}</em></div><div className="launched-route"><strong>{launchItem.route.name}</strong><div className="launched-route-flow">{operationLevels.map((level,index)=><div className={`launched-route-level ${level.length>1?"parallel":""}`} key={level.map(operation=>operation.id).join("-")}>{level.length>1&&<small className="parallel-label">Параллельно</small>}<div className="launched-route-level-stages">{level.map(operation=><button type="button" key={operation.id} onClick={()=>onOpenCenter(operation.workCenter.id)}><b>{operation.workCenter.name}</b><small>{operationLabels[operation.status]||operation.status}</small></button>)}</div>{index<operationLevels.length-1&&<span className="route-flow-arrow" aria-hidden="true">→</span>}</div>)}</div></div>{editable?<div className="launch-route-tools"><button type="button" className="route-button" onClick={()=>{setLaunchRouteEditing({launch,launchItem});setEditRoute(launchItem.route);setRouteItem(launchItem.orderItem);}}><RouteIcon/>Изменить маршрут</button>{alternatives.length>0&&<label><span>или выбрать готовый</span><select defaultValue="" onChange={event=>{const route=alternatives.find(candidate=>candidate.id===event.target.value);if(route)void replaceLaunchRoute(launch,launchItem,route);}}><option value="">Выбрать маршрут…</option>{alternatives.map(route=><option value={route.id} key={route.id}>{route.name}</option>)}</select></label>}</div>:<p className="launch-route-lock">Чтобы сохранить фактическую историю, маршрут нельзя менять после начала работ. Для оставшегося количества можно создать новый запуск с правильным маршрутом.</p>}</article>;}))}</section>}
        {error&&<div className="planning-error">{error}</div>}{success&&<div className="planning-success"><CheckCircle2/>{success}</div>}
        <footer><div><b>{Object.values(drafts).filter(draft=>draft.selected).length}</b><span>позиций выбрано</span></div><button className="primary launch-button" onClick={()=>submitLaunch()} disabled={submitting}><Play/>{submitting?"Создаю запуск…":"Запустить в производство"}</button></footer>
      </>}</main>
    </section>
    <section className="distribution"><div className="board-heading"><div><p className="kicker">РАСПРЕДЕЛЕНИЕ</p><h2>Загрузка производственных участков</h2></div></div><div className="work-center-grid">{centerStats.map(center=>{const active=["QUEUED","IN_PROGRESS","PAUSED"].reduce((sum,status)=>sum+(center.counts[status]||0),0);return <button className={`center-card ${active?"has-load":""} ${workCenterAccent[center.name]||""}`} key={center.id} onClick={()=>onOpenCenter(center.id)}><Factory/><b>{center.name}</b><strong>{active}</strong><span>К запуску: {center.counts.QUEUED||0} · в работе: {center.counts.IN_PROGRESS||0}</span><small>Остановлено: {center.counts.PAUSED||0} · готово: {center.counts.COMPLETED||0}</small></button>;})}</div></section>
    <section className="launch-history"><h2>Производственные запуски</h2>{launches.length===0&&<p>Запусков пока нет</p>}{launches.map(launch=><details key={launch.id}><summary><b>Запуск № {launch.number}</b><span>Заказ № {launch.order.productionOrderNumber} · {dateLabel(launch.plannedStart)} — {dateLabel(launch.plannedFinish)}</span></summary>{launch.items.map(item=><div key={item.id}><b>{item.orderItem.name} · {item.quantity} шт.</b><p>{item.route.name}</p><div className="route-preview">{item.operations.map(operation=><button key={operation.id} onClick={()=>onOpenCenter(operation.workCenter.id)}>{operation.workCenter.name}<small>{operationLabels[operation.status]||statusLabel[operation.status]||operation.status}</small></button>)}</div></div>)}</details>)}<div className="pagination"><button className="secondary" disabled={launchPage===1} onClick={()=>setLaunchPage(value=>value-1)}>Назад</button><span>{launchPage}</span><button className="secondary" disabled={launches.length<30} onClick={()=>setLaunchPage(value=>value+1)}>Далее</button></div></section>
    {libraryItem&&<div className="modal-backdrop route-template-library-backdrop"><section className="route-template-library" role="dialog" aria-modal="true" aria-label="Шаблоны маршрутов для выбранной позиции"><header><div><small>БИБЛИОТЕКА ШАБЛОНОВ</small><h2>Выберите маршрут</h2><p>Шаблон будет добавлен только к позиции «{libraryItem.name}» в заказе № {selectedOrder?.productionOrderNumber}.</p></div><button type="button" aria-label="Закрыть библиотеку шаблонов" onClick={()=>{setLibraryPicker("");setLibraryQuery("");}}><X/></button></header><input className="route-template-library-search" autoFocus aria-label="Поиск шаблона маршрута" placeholder="Найти шаблон: профиль, полоса, зеркало…" value={libraryQuery} onChange={event=>setLibraryQuery(event.target.value)}/><div className="route-template-library-results"><small>{libraryNeedle?"Результаты поиска":libraryRecommended.title}</small>{libraryTemplates.length?libraryTemplates.map(template=><button type="button" key={template.id} onClick={()=>void applyTemplate(libraryItem,template.id)}><span><b>{template.name}</b><em>{template.category||template.steps.length+" этапов"}</em></span><i>{template.steps.map(step=>step.workCenter.name).join(" · ")}</i><strong>{template._count?.appliedRoutes?template._count.appliedRoutes+" раз использован":template.steps.length+" этапов"}</strong></button>):<p>Подходящих шаблонов не найдено. Измените запрос или создайте новый маршрут.</p>}</div><footer><button type="button" className="secondary" onClick={()=>{setLibraryPicker("");setLibraryQuery("");}}>Отмена</button><button type="button" onClick={()=>{setLibraryPicker("");setLibraryQuery("");setEditRoute(undefined);setRouteItem(libraryItem);}}><Plus/>Создать новый маршрут</button></footer></section></div>}
{review&&selectedOrder&&<div className="modal-backdrop"><section className="task-dialog" role="dialog" aria-modal="true" aria-label="Проверка запуска"><header><h2>Новый запуск</h2><button aria-label="Закрыть проверку" disabled={submitting} onClick={()=>setReview(false)}><X/></button></header><p>Заказ № {selectedOrder.productionOrderNumber} · {priorityLabel[priority]}</p><p>{plannedStart||"Начало не задано"} — {plannedFinish||dateLabel(selectedOrder.dueDate)}</p>{selectedOrder.status==="PROCUREMENT"&&<div className="planning-warning">Заказ ещё в закупке. Подтвердите, что выбранные позиции можно запустить.</div>}{selectedOrder.items.filter(item=>drafts[item.id]?.selected).map(item=>{const route=routes[item.id]?.find(route=>route.id===drafts[item.id].routeId);return <div className="review-item" key={item.id}><b>{item.name} · {drafts[item.id].quantity} шт.</b><p>{route?.name}</p>{route?.steps.map((step,index)=><div key={step.id}>{index+1}. {step.workCenter.name} — {step.title}<small>{step.predecessors.length?"После: "+step.predecessors.map(link=>(route.steps.findIndex(candidate=>candidate.id===link.predecessorId)+1)).join(", "):"Без предыдущих этапов"}</small></div>)}</div>;})}{error&&<div className="planning-error">{error}</div>}<footer><button className="secondary" disabled={submitting} onClick={()=>setReview(false)}>Назад</button><button className="primary" disabled={submitting} onClick={()=>submitLaunch(true)}>{submitting?"Создаю…":"Подтвердить запуск"}</button></footer></section></div>}
    {routeItem&&<Suspense fallback={<div className="modal-backdrop"><div className="task-dialog"><p>Открываю конструктор маршрута…</p></div></div>}><RouteBuilder initial={editRoute} item={routeItem} centers={centers} onClose={()=>{setRouteItem(null);setLaunchRouteEditing(null);}} onSaved={route=>{setRoutes(current=>({...current,[routeItem.id]:[route,...(current[routeItem.id]||[])]}));if(launchRouteEditing){void replaceLaunchRoute(launchRouteEditing.launch,launchRouteEditing.launchItem,route);setLaunchRouteEditing(null);}else patchDraft(routeItem.id,{routeId:route.id});setRouteItem(null);}}/></Suspense>}
  </div>;
}
