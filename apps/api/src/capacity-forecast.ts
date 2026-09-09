import {forecast,type Stage,type Result} from './forecast.js';
type Task=Stage&{workCenterId:string;parallelSlots:number|null;queueOrder:number;priority:string};
type Scheduled=Result&{queueHours?:number;afterTask?:string};
const priorities:Record<string,number>={CRITICAL:0,HIGH:1,NORMAL:2,LOW:3};
// Schedule only the component connected through dependencies or shared work centers.
export function relatedTasks(tasks:Task[],target:string):Task[]{
  const ids=new Set([target]),centers=new Set<string>();let changed=true;
  while(changed){changed=false;for(const task of tasks){if(ids.has(task.id)||centers.has(task.workCenterId)||task.predecessors.some(id=>ids.has(id))){
    if(!ids.has(task.id)){ids.add(task.id);changed=true;}
    if(!centers.has(task.workCenterId)){centers.add(task.workCenterId);changed=true;}
    for(const id of task.predecessors)if(!ids.has(id)){ids.add(id);changed=true;}
  }}}
  return tasks.filter(task=>ids.has(task.id));
}
export function capacityForecast(tasks:Task[],now:Date):Record<string,Scheduled>{
  const result:Record<string,Scheduled>={},pending=new Map(tasks.map(t=>[t.id,t]));
  const slots=new Map<string,{time:number;title?:string}[]>(),blocked=new Map<string,string>();
  for(const task of tasks){
    if(task.status==='COMPLETED'){result[task.id]={finish:now.toISOString(),reserveHours:null,state:'COMPLETED'};pending.delete(task.id);}
    if(task.parallelSlots&&!slots.has(task.workCenterId))slots.set(task.workCenterId,Array.from({length:task.parallelSlots},()=>({time:now.getTime()})));
  }
  for(const [center,places] of slots)if(tasks.filter(t=>t.workCenterId===center&&t.status==='IN_PROGRESS').length>places.length)blocked.set(center,'В работе больше задач, чем указано одновременных мест на участке');
  const unknown=(reason:string):Scheduled=>({finish:null,reserveHours:null,state:'UNKNOWN',reason});
  while(pending.size){
    const ready=[...pending.values()].filter(t=>t.predecessors.every(id=>result[id]||!pending.has(id)));
    if(!ready.length){for(const task of pending.values())result[task.id]=unknown('Цикл в зависимостях маршрута');break;}
    const earliest=(task:Task)=>Math.max(now.getTime(),task.start?.getTime()??0,...task.predecessors.map(id=>result[id]?.finish?Date.parse(result[id].finish!):now.getTime()),...(slots.get(task.workCenterId)?[Math.min(...slots.get(task.workCenterId)!.map(s=>s.time))]:[]));
    ready.sort((a,b)=>Number(b.status==='IN_PROGRESS')-Number(a.status==='IN_PROGRESS')||earliest(a)-earliest(b)||a.queueOrder-b.queueOrder||(priorities[a.priority]??2)-(priorities[b.priority]??2)||(a.due?.getTime()??Infinity)-(b.due?.getTime()??Infinity)||a.id.localeCompare(b.id));
    const task=ready[0];pending.delete(task.id);
    const parent=task.predecessors.find(id=>!result[id]?.finish);
    if(parent){result[task.id]=unknown(result[parent]?.reason??'Нет данных предыдущего этапа');if(task.parallelSlots)blocked.set(task.workCenterId,result[task.id].reason!);continue;}
    if(blocked.has(task.workCenterId)){result[task.id]=unknown(blocked.get(task.workCenterId)!);continue;}
    const base=Math.max(now.getTime(),task.start?.getTime()??0,...task.predecessors.map(id=>Date.parse(result[id].finish!)));
    const places=slots.get(task.workCenterId),place=places?.reduce((best,slot)=>slot.time<best.time?slot:best);
    const start=Math.max(base,place?.time??0);
    const estimate=forecast([{...task,start:new Date(start),predecessors:[]}],now)[task.id];
    result[task.id]={...estimate,queueHours:(start-base)/3600000,...(place?.title&&start>base?{afterTask:place.title}:{})};
    if(!estimate.finish){if(task.parallelSlots)blocked.set(task.workCenterId,estimate.reason??'Неизвестно время освобождения участка');}
    else if(place){place.time=Date.parse(estimate.finish);place.title=task.title;}
  }
  return result;
}
