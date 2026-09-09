import type {Prisma} from '@prisma/client';
import {summarizeOrderForecast} from './order-forecast.js';
import {remainingPlanInput,remainingTasks} from './remaining-plan.js';
import {capacityForecast,relatedTasks} from './capacity-forecast.js';
import {calendarInput} from './work-calendar.js';
import {elapsedSeconds} from './production-rules.js';
export const forecastOrderInclude={procurement:true,items:{include:{routes:{include:{steps:{include:{workCenter:true,predecessors:true}}}},launchItems:{include:{operations:{select:{id:true,status:true}}}}}}} as const;
export const forecastOperationsInclude={workCenter:true,timeEntries:true,predecessors:{include:{predecessor:{select:{status:true}}}},launchItem:{select:{launch:{select:{plannedStart:true}},orderItem:{select:{order:{select:{id:true,procurement:true}}}}}}} as const;
export function calculateOrderForecast(order:Prisma.OrderGetPayload<{include:typeof forecastOrderInclude}>,rows:Prisma.OperationGetPayload<{include:typeof forecastOperationsInclude}>[],now:Date){
    const procurementBlocks=new Map<string,string>();
    const tasks:Parameters<typeof capacityForecast>[0]=rows.map(row=>{
      const procurement=row.launchItem.orderItem.order.procurement;
      const waiting=row.status==='QUEUED'&&procurement&&!['READY','NOT_REQUIRED'].includes(procurement.status);
      if(waiting&&(!procurement.expectedAt||procurement.expectedAt<=now))procurementBlocks.set(row.id,'Уточните ожидаемую дату готовности закупки');
      const start=row.plannedStart??row.launchItem.launch.plannedStart;
      return {id:row.id,title:row.title,workCenterId:row.workCenterId,parallelSlots:row.workCenter.parallelSlots,queueOrder:row.queueOrder,priority:row.priority,calendar:row.workCenter.calendar?calendarInput.parse(row.workCenter.calendar):null,status:row.status,normHours:procurementBlocks.has(row.id)?null:row.normHours,riskHours:row.riskHours,workHours:elapsedSeconds(row.timeEntries,now)/3600,start:waiting&&procurement.expectedAt?new Date(Math.max(start?.getTime()??0,procurement.expectedAt.getTime())):start,due:row.plannedFinish??row.dueDate,predecessors:row.predecessors.filter(p=>p.predecessor.status!=='COMPLETED').map(p=>p.predecessorId)};
    });
    const remainingOperations:Record<string,{id:string;status:string}[]>={};
    const virtualCenters:{id:string;name:string;calendar:unknown;parallelSlots:number|null}[]=[];
    for(const item of order.items){
      const quantity=Math.max(0,item.quantity-item.launchItems.reduce((sum,l)=>sum+l.quantity,0));
      if(!quantity)continue;
      const plan=remainingPlanInput.safeParse(item.remainingPlan);
      const route=plan.success?item.routes.find(route=>route.id===plan.data.routeId):undefined;
      const waiting=order.procurement&&!['READY','NOT_REQUIRED'].includes(order.procurement.status);
      const virtual=remainingTasks(item,route,quantity,waiting?order.procurement!.expectedAt:null,order.priority,order.dueDate);
      if(!virtual)continue;
      for(const task of virtual){if(waiting&&(!order.procurement!.expectedAt||order.procurement!.expectedAt<=now)){task.normHours=0;procurementBlocks.set(task.id,'Уточните ожидаемую дату готовности закупки');}}
      tasks.push(...virtual);remainingOperations[item.id]=virtual.map(task=>({id:task.id,status:task.status}));
      for(const step of route!.steps)virtualCenters.push({...step.workCenter});
    }
    const targetIds=new Set(order.items.flatMap(item=>item.launchItems.flatMap(launch=>launch.operations.map(op=>op.id))));
    for(const ops of Object.values(remainingOperations))for(const op of ops)targetIds.add(op.id);
    const relevantIds=new Set<string>();for(const target of targetIds)for(const task of relatedTasks(tasks,target))relevantIds.add(task.id);
    const relevant=tasks.filter(task=>relevantIds.has(task.id));
    const estimates=capacityForecast(relevant,now);
    for(const [id,reason] of procurementBlocks)if(estimates[id])estimates[id]={finish:null,reserveHours:null,state:'UNKNOWN',reason};
    return {...summarizeOrderForecast(order,estimates,now,remainingOperations),dueDate:order.dueDate,riskHours:order.forecastRiskHours,updatedAt:order.updatedAt,asOf:now,procurement:order.procurement?{status:order.procurement.status,expectedAt:order.procurement.expectedAt}:null,continuousCenters:[...new Set([...rows.filter(row=>relevantIds.has(row.id)&&!row.workCenter.calendar).map(row=>row.workCenter.name),...virtualCenters.filter(c=>!c.calendar).map(c=>c.name)])],unlimitedCenters:[...new Set([...rows.filter(row=>relevantIds.has(row.id)&&!row.workCenter.parallelSlots).map(row=>row.workCenter.name),...virtualCenters.filter(c=>!c.parallelSlots).map(c=>c.name)])]};
}
