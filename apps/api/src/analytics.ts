type Operation={id:string;title:string;workCenter:{id:string;name:string};orderNumber:string;timeEntries:{startedAt:Date;finishedAt:Date|null}[];statusHistory:{id:string;fromStatus:string|null;toStatus:string;changedAt:Date;reason:string|null}[]};
export function productionAnalytics(operations:Operation[],from:Date,to:Date,now:Date){
 const start=from.getTime(),end=Math.min(to.getTime(),now.getTime());
 const overlap=(a:Date,b:Date|null)=>Math.max(0,Math.min(b?.getTime()??end,end)-Math.max(a.getTime(),start));
 const inPeriod=(at:Date)=>at.getTime()>=start&&at.getTime()<end;
 const centers=new Map<string,{id:string;name:string;workMs:number;downtimeMs:number;stops:number;completed:number;tasks:number}>();
 const stops:{id:string;operationId:string;title:string;center:string;orderNumber:string;reason:string;startedAt:Date;finishedAt:Date|null;seconds:number;carried:boolean}[]=[];
 for(const operation of operations){
  let workMs=0,downtimeMs=0,newStops=0,completed=0;
  for(const entry of operation.timeEntries)workMs+=overlap(entry.startedAt,entry.finishedAt);
  let paused:Operation['statusHistory'][number]|null=null;
  function closePause(finishedAt:Date|null){if(!paused)return;const ms=overlap(paused.changedAt,finishedAt);downtimeMs+=ms;if(ms>0)stops.push({id:paused.id,operationId:operation.id,title:operation.title,center:operation.workCenter.name,orderNumber:operation.orderNumber,reason:paused.reason||'Причина не указана',startedAt:paused.changedAt,finishedAt,seconds:ms/1000,carried:paused.changedAt.getTime()<start});paused=null;}
  const history=[...operation.statusHistory].sort((a,b)=>a.changedAt.getTime()-b.changedAt.getTime()||a.id.localeCompare(b.id));
  for(const event of history){
   if(event.changedAt.getTime()>=end)break;
   if(event.fromStatus===event.toStatus)continue; // Comments and problem reports are not new transitions.
   if(event.toStatus==='PAUSED'&&!paused){paused=event;if(inPeriod(event.changedAt))newStops++;}
   else if(event.toStatus!=='PAUSED'&&paused)closePause(event.changedAt);
   if(event.toStatus==='COMPLETED'&&inPeriod(event.changedAt))completed++;
  }
  closePause(null);
  if(workMs||downtimeMs||newStops||completed){
   let center=centers.get(operation.workCenter.id);if(!center){center={...operation.workCenter,workMs:0,downtimeMs:0,stops:0,completed:0,tasks:0};centers.set(center.id,center);}
   center.workMs+=workMs;center.downtimeMs+=downtimeMs;center.stops+=newStops;center.completed+=completed;center.tasks++;
  }
 }
 const rows=[...centers.values()].sort((a,b)=>b.downtimeMs-a.downtimeMs||a.name.localeCompare(b.name)).map(({workMs,downtimeMs,...row})=>({...row,workSeconds:workMs/1000,downtimeSeconds:downtimeMs/1000}));
 const totals=rows.reduce((sum,row)=>({workSeconds:sum.workSeconds+row.workSeconds,downtimeSeconds:sum.downtimeSeconds+row.downtimeSeconds,stops:sum.stops+row.stops,completed:sum.completed+row.completed,tasks:sum.tasks+row.tasks}),{workSeconds:0,downtimeSeconds:0,stops:0,completed:0,tasks:0});
 stops.sort((a,b)=>b.startedAt.getTime()-a.startedAt.getTime()||a.id.localeCompare(b.id));
 return {centers:rows,totals,stops};
}
