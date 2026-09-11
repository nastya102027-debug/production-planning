type Operation={id:string;title:string;normHours?:number|null;workCenter:{id:string;name:string};orderNumber:string;timeEntries:{startedAt:Date;finishedAt:Date|null;user?:{id:string;firstName:string;lastName:string}}[];statusHistory:{id:string;fromStatus:string|null;toStatus:string;changedAt:Date;reason:string|null}[]};
export function productionAnalytics(operations:Operation[],from:Date,to:Date,now:Date){
 const start=from.getTime(),end=Math.min(to.getTime(),now.getTime());
 const overlap=(a:Date,b:Date|null)=>Math.max(0,Math.min(b?.getTime()??end,end)-Math.max(a.getTime(),start));
 const inPeriod=(at:Date)=>at.getTime()>=start&&at.getTime()<end;
 const centers=new Map<string,{id:string;name:string;workMs:number;downtimeMs:number;plannedMs:number;missingPlan:number;stops:number;completed:number;tasks:number}>();
 const employees=new Map<string,{id:string;name:string;workMs:number;completed:number;tasks:number}>();
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
  for(const entry of operation.timeEntries){const ms=overlap(entry.startedAt,entry.finishedAt);if(!ms||!entry.user)continue;let employee=employees.get(entry.user.id);if(!employee){employee={id:entry.user.id,name:`${entry.user.lastName} ${entry.user.firstName}`,workMs:0,completed:0,tasks:0};employees.set(employee.id,employee);}employee.workMs+=ms;}
  if(workMs||downtimeMs||newStops||completed){
   let center=centers.get(operation.workCenter.id);if(!center){center={...operation.workCenter,workMs:0,downtimeMs:0,plannedMs:0,missingPlan:0,stops:0,completed:0,tasks:0};centers.set(center.id,center);}
   if(operation.normHours==null)center.missingPlan++;else center.plannedMs+=operation.normHours*3600000;
   center.workMs+=workMs;center.downtimeMs+=downtimeMs;center.stops+=newStops;center.completed+=completed;center.tasks++;
   const activeEntries=operation.timeEntries.filter(entry=>entry.user&&overlap(entry.startedAt,entry.finishedAt)>0);
   const uniqueEmployees=[...new Map(activeEntries.map(entry=>[entry.user!.id,entry.user!])).values()];
   for(const user of uniqueEmployees){const employee=employees.get(user.id);if(employee){employee.tasks++;if(completed)employee.completed++;}}
  }
 }
 const rows=[...centers.values()].sort((a,b)=>b.downtimeMs-a.downtimeMs||a.name.localeCompare(b.name)).map(({workMs,downtimeMs,plannedMs,...row})=>({...row,workSeconds:workMs/1000,downtimeSeconds:downtimeMs/1000,plannedSeconds:plannedMs/1000,planKnown:row.missingPlan===0}));
 const employeeRows=[...employees.values()].sort((a,b)=>b.workMs-a.workMs||a.name.localeCompare(b.name)).map(({workMs,...row})=>({...row,workSeconds:workMs/1000,averageSeconds:row.tasks?workMs/1000/row.tasks:0}));
 const totals=rows.reduce((sum,row)=>({workSeconds:sum.workSeconds+row.workSeconds,downtimeSeconds:sum.downtimeSeconds+row.downtimeSeconds,plannedSeconds:sum.plannedSeconds+row.plannedSeconds,missingPlan:sum.missingPlan+row.missingPlan,stops:sum.stops+row.stops,completed:sum.completed+row.completed,tasks:sum.tasks+row.tasks}),{workSeconds:0,downtimeSeconds:0,plannedSeconds:0,missingPlan:0,stops:0,completed:0,tasks:0});
 stops.sort((a,b)=>b.startedAt.getTime()-a.startedAt.getTime()||a.id.localeCompare(b.id));
 const orderProblems=new Map<string,{number:string;count:number;downtimeSeconds:number}>();
 for(const stop of stops){if(stop.carried)continue;const row=orderProblems.get(stop.orderNumber)??{number:stop.orderNumber,count:0,downtimeSeconds:0};row.count++;row.downtimeSeconds+=stop.seconds;orderProblems.set(stop.orderNumber,row);}
 const resolved=stops.filter(stop=>stop.finishedAt);
 return {centers:rows,employees:employeeRows,totals,stops,problems:{averageResolutionSeconds:resolved.length?resolved.reduce((sum,stop)=>sum+stop.seconds,0)/resolved.length:0,frequentCenters:rows.filter(row=>row.stops>0).sort((a,b)=>b.stops-a.stops||b.downtimeSeconds-a.downtimeSeconds).slice(0,5).map(row=>({id:row.id,name:row.name,stops:row.stops,downtimeSeconds:row.downtimeSeconds})),orders:[...orderProblems.values()].sort((a,b)=>b.count-a.count||b.downtimeSeconds-a.downtimeSeconds||a.number.localeCompare(b.number)).slice(0,5)}};
}
