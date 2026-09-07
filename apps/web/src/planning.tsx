import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Boxes, CheckCircle2, Factory, GripVertical, Layers3, Play, Plus, Route as RouteIcon, Trash2, X } from "lucide-react";
import "./planning.css";

type WorkCenter = { id:string; name:string };
type OrderItem = { id:string; name:string; quantity:number; unitPrice:number };
type Order = { id:string; productionOrderNumber:string; customerOrderNumber?:string; organization?:string; status:string; priority:string; dueDate?:string; items:OrderItem[] };
type RouteStep = { id:string; title:string; position:number; workCenter:WorkCenter; predecessors:{predecessorId:string;successorId:string}[] };
type ProductionRoute = { id:string; name:string; version:number; steps:RouteStep[] };
type Operation = { id:string; title:string; quantity:number; completedQuantity:number; status:string; priority:string; dueDate?:string; workCenter:WorkCenter; predecessors:{predecessor:{id:string;status:string}}[] };
type LaunchItem = { id:string; quantity:number; orderItem:OrderItem; route:ProductionRoute; operations:Operation[] };
type Launch = { id:string; number:string; priority:string; plannedStart?:string; plannedFinish?:string; order:Order; items:LaunchItem[] };
type ItemDraft = { selected:boolean; quantity:number|""; routeId:string };
type DraftStep = { key:string;workCenterId:string;title:string;predecessorKeys:string[] };

async function api<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(`/api${path}`,{...init,credentials:"include",headers:{"Content-Type":"application/json",...init?.headers}});
  if(!response.ok)throw new Error((await response.json()).message||"Ошибка запроса");
  return response.status===204?undefined as T:response.json();
}

const dateLabel=(value?:string)=>value?new Date(value).toLocaleDateString("ru-RU"):"—";
const statusLabel:Record<string,string>={DRAFT:"Черновик",PROCUREMENT:"В закупке",READY_FOR_LAUNCH:"Готов к запуску",IN_PRODUCTION:"В производстве",PARTIALLY_READY:"Частично готов",COMPLETED:"Завершён",QUEUED:"К запуску",IN_PROGRESS:"В работе",PAUSED:"Остановлено",CANCELLED:"Отменено"};
const priorityLabel:Record<string,string>={LOW:"Низкий",NORMAL:"Обычный",HIGH:"Высокий",CRITICAL:"Критический"};

function RouteBuilder({item,centers,onClose,onSaved}:{item:OrderItem;centers:WorkCenter[];onClose:()=>void;onSaved:(route:ProductionRoute)=>void}){
  const [name,setName]=useState("");
  const [steps,setSteps]=useState<DraftStep[]>([]);
  const [search,setSearch]=useState("");
  const [dragIndex,setDragIndex]=useState<number|null>(null);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const visibleCenters=centers.filter(center=>center.name.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")));

  function addCenter(center:WorkCenter){
    setSteps(current=>{
      const previous=current.at(-1);
      return [...current,{key:crypto.randomUUID(),workCenterId:center.id,title:center.name,predecessorKeys:previous?[previous.key]:[]}];
    });
  }
  function removeStep(key:string){setSteps(current=>current.filter(step=>step.key!==key).map(step=>({...step,predecessorKeys:step.predecessorKeys.filter(value=>value!==key)})));}
  function patchStep(key:string,patch:Partial<DraftStep>){setSteps(current=>current.map(step=>step.key===key?{...step,...patch}:step));}
  function moveStep(from:number,to:number){
    if(to<0||to>=steps.length||from===to)return;
    setSteps(current=>{
      const reordered=[...current];
      const [moved]=reordered.splice(from,1);
      reordered.splice(to,0,moved);
      const positions=new Map(reordered.map((step,index)=>[step.key,index]));
      return reordered.map((step,index)=>({...step,predecessorKeys:step.predecessorKeys.filter(key=>(positions.get(key)??Infinity)<index)}));
    });
  }
  function togglePredecessor(stepKey:string,predecessorKey:string){
    setSteps(current=>current.map(step=>step.key!==stepKey?step:{...step,predecessorKeys:step.predecessorKeys.includes(predecessorKey)?step.predecessorKeys.filter(key=>key!==predecessorKey):[...step.predecessorKeys,predecessorKey]}));
  }
  async function save(){
    setError("");
    if(!name.trim()||steps.length===0){setError("Укажите название маршрута и добавьте хотя бы один участок");return;}
    setSaving(true);
    try{
      const indexByKey=new Map(steps.map((step,index)=>[step.key,index]));
      const route=await api<ProductionRoute>(`/order-items/${item.id}/routes`,{method:"POST",body:JSON.stringify({name,steps:steps.map(step=>({title:step.title,workCenterId:step.workCenterId,predecessorIndexes:step.predecessorKeys.map(key=>indexByKey.get(key)).filter((value):value is number=>value!==undefined)}))})});
      onSaved(route);
    }catch(error){setError(error instanceof Error?error.message:"Не удалось сохранить маршрут");setSaving(false);}
  }

  return <div className="modal-backdrop route-backdrop"><section className="route-builder">
    <header><div><small>КОНСТРУКТОР МАРШРУТА</small><h2>{item.name}</h2></div><button onClick={onClose}><X/></button></header>
    <div className="route-name"><label>Название маршрута<input value={name} onChange={event=>setName(event.target.value)} autoFocus/></label><span>{steps.length} этапов</span></div>
    <div className="route-columns">
      <aside><div><b>Доступные участки</b><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Найти участок"/></div><div className="available-centers">{visibleCenters.map(center=><button key={center.id} onClick={()=>addCenter(center)}><Plus/><span>{center.name}</span></button>)}</div></aside>
      <main><div className="route-title"><div><b>Маршрут</b><span>Перетаскивайте этапы и задавайте зависимости</span></div></div>
        {steps.length===0?<div className="route-empty"><RouteIcon/><b>Маршрут пока пуст</b><span>Добавьте участки из списка слева</span></div>:<div className="route-steps">{steps.map((step,index)=>{
          const center=centers.find(value=>value.id===step.workCenterId);
          const previous=steps.slice(0,index);
          return <article key={step.key} draggable onDragStart={()=>setDragIndex(index)} onDragOver={event=>event.preventDefault()} onDrop={()=>{if(dragIndex!==null)moveStep(dragIndex,index);setDragIndex(null);}}>
            <GripVertical className="grip"/><i>{index+1}</i><div className="route-step-content"><strong>{center?.name}</strong><input value={step.title} onChange={event=>patchStep(step.key,{title:event.target.value})}/>
              {index>0&&<div className="dependency-row"><span>Запуск после:</span>{previous.map((candidate,candidateIndex)=><label key={candidate.key}><input type="checkbox" checked={step.predecessorKeys.includes(candidate.key)} onChange={()=>togglePredecessor(step.key,candidate.key)}/>{candidateIndex+1}</label>)}{step.predecessorKeys.length===0&&<em>параллельно</em>}</div>}
            </div><div className="step-actions"><button disabled={index===0} onClick={()=>moveStep(index,index-1)}><ArrowUp/></button><button disabled={index===steps.length-1} onClick={()=>moveStep(index,index+1)}><ArrowDown/></button><button onClick={()=>removeStep(step.key)}><Trash2/></button></div>
          </article>;
        })}</div>}
      </main>
    </div>
    {error&&<div className="planning-error">{error}</div>}
    <footer><button className="secondary" onClick={onClose}>Отмена</button><button className="primary" onClick={save} disabled={saving}>{saving?"Сохраняю…":"Сохранить маршрут"}</button></footer>
  </section></div>;
}

export function PlanningScreen(){
  const [orders,setOrders]=useState<Order[]>([]);
  const [launches,setLaunches]=useState<Launch[]>([]);
  const [centers,setCenters]=useState<WorkCenter[]>([]);
  const [selectedOrderId,setSelectedOrderId]=useState("");
  const [routes,setRoutes]=useState<Record<string,ProductionRoute[]>>({});
  const [drafts,setDrafts]=useState<Record<string,ItemDraft>>({});
  const [routeItem,setRouteItem]=useState<OrderItem|null>(null);
  const [launchNumber,setLaunchNumber]=useState("");
  const [plannedStart,setPlannedStart]=useState("");
  const [plannedFinish,setPlannedFinish]=useState("");
  const [priority,setPriority]=useState("NORMAL");
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  async function load(){
    const [nextOrders,nextLaunches,nextCenters]=await Promise.all([api<Order[]>("/orders"),api<Launch[]>("/launches"),api<WorkCenter[]>("/work-centers")]);
    setOrders(nextOrders);setLaunches(nextLaunches);setCenters(nextCenters);setSelectedOrderId(current=>current||nextOrders[0]?.id||"");setLoading(false);
  }
  useEffect(()=>{load().catch(error=>{setError(error instanceof Error?error.message:"Ошибка загрузки");setLoading(false);});},[]);
  const selectedOrder=orders.find(order=>order.id===selectedOrderId);
  const launchedByItem=useMemo(()=>{
    const values:Record<string,number>={};
    for(const launch of launches)for(const item of launch.items)values[item.orderItem.id]=(values[item.orderItem.id]||0)+item.quantity;
    return values;
  },[launches]);

  useEffect(()=>{
    if(!selectedOrder)return;
    setDrafts(Object.fromEntries(selectedOrder.items.map(item=>[item.id,{selected:false,quantity:"",routeId:""}])));
    let active=true;
    Promise.all(selectedOrder.items.map(async item=>[item.id,await api<ProductionRoute[]>(`/order-items/${item.id}/routes`)] as const)).then(entries=>{if(active)setRoutes(current=>({...current,...Object.fromEntries(entries)}));}).catch(error=>setError(error instanceof Error?error.message:"Ошибка маршрутов"));
    return()=>{active=false;};
  },[selectedOrderId]);

  const operations=useMemo(()=>launches.flatMap(launch=>launch.items.flatMap(item=>item.operations.map(operation=>({operation,launch,item,order:launch.order})))),[launches]);
  const centersWithTasks=centers.filter(center=>operations.some(entry=>entry.operation.workCenter.id===center.id)).length;
  const availableOrders=orders.filter(order=>order.items.some(item=>(launchedByItem[item.id]||0)<item.quantity)).length;
  const queued=operations.filter(entry=>entry.operation.status==="QUEUED").length;
  const stopped=operations.filter(entry=>entry.operation.status==="PAUSED").length;

  function patchDraft(itemId:string,patch:Partial<ItemDraft>){setDrafts(current=>({...current,[itemId]:{...current[itemId],...patch}}));}
  async function submitLaunch(){
    setError("");setSuccess("");
    if(!selectedOrder||!launchNumber.trim()){setError("Выберите заказ и укажите номер запуска");return;}
    const selected=selectedOrder.items.filter(item=>drafts[item.id]?.selected);
    if(selected.length===0){setError("Выберите хотя бы одну позицию");return;}
    const invalid=selected.find(item=>!drafts[item.id].routeId||!drafts[item.id].quantity||Number(drafts[item.id].quantity)<1||Number(drafts[item.id].quantity)>item.quantity-(launchedByItem[item.id]||0));
    if(invalid){setError(`Проверьте количество и маршрут позиции «${invalid.name}»`);return;}
    if(plannedStart&&plannedFinish&&plannedFinish<plannedStart){setError("Плановое завершение не может быть раньше начала");return;}
    setSubmitting(true);
    try{
      await api("/launches",{method:"POST",body:JSON.stringify({number:launchNumber,orderId:selectedOrder.id,priority,plannedStart:plannedStart?new Date(`${plannedStart}T12:00:00`).toISOString():undefined,plannedFinish:plannedFinish?new Date(`${plannedFinish}T12:00:00`).toISOString():undefined,items:selected.map(item=>({orderItemId:item.id,routeId:drafts[item.id].routeId,quantity:Number(drafts[item.id].quantity)}))})});
      setSuccess(`Запуск № ${launchNumber} создан. Задачи распределены по участкам.`);setLaunchNumber("");setPlannedStart("");setPlannedFinish("");await load();
    }catch(error){setError(error instanceof Error?error.message:"Не удалось создать запуск");}finally{setSubmitting(false);}
  }

  if(loading)return <div className="content planning-page"><div className="planning-loading">Загрузка планирования…</div></div>;
  return <div className="content planning-page">
    <section className="planning-kpis"><article><Layers3/><div><strong>{availableOrders}</strong><span>заказов можно планировать</span></div></article><article><Boxes/><div><strong>{launches.length}</strong><span>производственных запусков</span></div></article><article><Play/><div><strong>{queued}</strong><span>задач к запуску</span></div></article><article className={stopped?"alert":""}><Factory/><div><strong>{centersWithTasks}</strong><span>участков загружено</span></div></article></section>
    <div className="planning-heading"><div><p>ПЛАНИРОВАНИЕ</p><h2>Сформировать производственный запуск</h2></div><div className="planning-steps"><span className="active">1 Заказ</span><span>2 Позиции</span><span>3 Маршрут</span><span>4 Запуск</span></div></div>
    <section className="planning-workspace">
      <aside className="planning-orders"><header><b>Заказы</b><span>{orders.length}</span></header><div>{orders.map(order=>{
        const remaining=order.items.reduce((sum,item)=>sum+Math.max(0,item.quantity-(launchedByItem[item.id]||0)),0);
        return <button className={selectedOrderId===order.id?"selected":""} key={order.id} onClick={()=>setSelectedOrderId(order.id)}><span><b>№ {order.productionOrderNumber}</b><small>Покупатель № {order.customerOrderNumber||"—"}</small></span><em>{remaining} шт. осталось</em><i className={`order-state ${order.status.toLowerCase()}`}>{statusLabel[order.status]||order.status}</i></button>;
      })}</div></aside>
      <main className="launch-editor">{!selectedOrder?<div className="planning-empty"><Boxes/><b>Нет заказов для планирования</b></div>:<>
        <header><div><small>ЗАКАЗ НА ПРОИЗВОДСТВО</small><h3>№ {selectedOrder.productionOrderNumber}</h3><span>Срок: {dateLabel(selectedOrder.dueDate)}</span></div><div><label>Номер запуска<input value={launchNumber} onChange={event=>setLaunchNumber(event.target.value)}/></label><label>Приоритет<select value={priority} onChange={event=>setPriority(event.target.value)}><option value="LOW">Низкий</option><option value="NORMAL">Обычный</option><option value="HIGH">Высокий</option><option value="CRITICAL">Критический</option></select></label></div></header>
        <div className="launch-dates"><label>Плановое начало<input type="date" value={plannedStart} onChange={event=>setPlannedStart(event.target.value)}/></label><label>Плановое завершение<input type="date" value={plannedFinish} onChange={event=>setPlannedFinish(event.target.value)}/></label></div>
        <div className="launch-items"><div className="launch-items-title"><b>Позиции запуска</b><span>Можно выбрать часть заказа или часть количества</span></div>{selectedOrder.items.map(item=>{
          const launched=launchedByItem[item.id]||0;const available=Math.max(0,item.quantity-launched);const draft=drafts[item.id]||{selected:false,quantity:"",routeId:""};const itemRoutes=routes[item.id]||[];
          return <article className={`${draft.selected?"selected":""} ${available===0?"disabled":""}`} key={item.id}><label className="item-check"><input type="checkbox" checked={draft.selected} disabled={available===0} onChange={event=>patchDraft(item.id,{selected:event.target.checked})}/><span/></label><div className="item-name"><b>{item.name}</b><span>Заказано: {item.quantity} · запущено: {launched} · доступно: {available}</span></div><label>Количество<input type="number" min="1" max={available} value={draft.quantity} disabled={!draft.selected} onChange={event=>patchDraft(item.id,{quantity:event.target.value?Number(event.target.value):""})}/></label><label>Маршрут<select value={draft.routeId} disabled={!draft.selected} onChange={event=>patchDraft(item.id,{routeId:event.target.value})}><option value="">Выберите маршрут</option>{itemRoutes.map(route=><option value={route.id} key={route.id}>{route.name} · {route.steps.length} эт.</option>)}</select></label><button className="route-button" onClick={()=>setRouteItem(item)}><RouteIcon/>{itemRoutes.length?"Новый":"Создать"}</button></article>;
        })}</div>
        {error&&<div className="planning-error">{error}</div>}{success&&<div className="planning-success"><CheckCircle2/>{success}</div>}
        <footer><div><b>{Object.values(drafts).filter(draft=>draft.selected).length}</b><span>позиций выбрано</span></div><button className="primary launch-button" onClick={submitLaunch} disabled={submitting}><Play/>{submitting?"Создаю запуск…":"Запустить в производство"}</button></footer>
      </>}</main>
    </section>
    <section className="distribution"><header><div><p>РАСПРЕДЕЛЕНИЕ</p><h2>Загрузка производственных участков</h2></div><span>{operations.length} задач на {centersWithTasks} участках</span></header><div className="work-center-grid">{centers.map(center=>{
      const tasks=operations.filter(entry=>entry.operation.workCenter.id===center.id);const active=tasks.filter(entry=>["QUEUED","IN_PROGRESS","PAUSED"].includes(entry.operation.status));
      return <article className={active.length?"has-load":""} key={center.id}><header><span><Factory/></span><div><b>{center.name}</b><small>{active.length} активных · {tasks.length} всего</small></div><strong>{active.length}</strong></header><div>{active.slice(0,4).map(({operation,launch,item,order})=>{
        const blocked=operation.predecessors.some(link=>link.predecessor.status!=="COMPLETED");
        return <div className="work-task" key={operation.id}><span><b>№ {order.productionOrderNumber}</b><small>{item.orderItem.name} · {item.quantity} шт.</small></span><i className={`task-state ${blocked?"blocked":operation.status.toLowerCase()}`}>{blocked?"Ожидает предыдущий":statusLabel[operation.status]||operation.status}</i><em>Запуск № {launch.number}</em></div>;
      })}{active.length===0&&<div className="center-empty">Нет активных задач</div>}{active.length>4&&<small className="more-tasks">Ещё {active.length-4}</small>}</div></article>;
    })}</div></section>
    {routeItem&&<RouteBuilder item={routeItem} centers={centers} onClose={()=>setRouteItem(null)} onSaved={route=>{setRoutes(current=>({...current,[routeItem.id]:[route,...(current[routeItem.id]||[])]}));patchDraft(routeItem.id,{routeId:route.id});setRouteItem(null);}}/>}
  </div>;
}
