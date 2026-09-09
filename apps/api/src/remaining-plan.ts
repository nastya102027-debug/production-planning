import {z} from 'zod';
import {calendarInput} from './work-calendar.js';
export const remainingPlanInput=z.object({routeId:z.string().uuid(),start:z.string().datetime().nullable(),steps:z.array(z.object({stepId:z.string().uuid(),hoursPerUnit:z.number().finite().positive().max(100000)}).strict()).min(1).max(100)}).strict();
type Route={id:string;steps:{id:string;title:string;workCenterId:string;predecessors:{predecessorId:string}[];workCenter:{name:string;calendar:unknown;parallelSlots:number|null}}[]};
export function remainingTasks(item:{id:string;name:string;remainingPlan:unknown},route:Route|undefined,quantity:number,start:Date|null,priority:string,due:Date|null){
 const parsed=remainingPlanInput.safeParse(item.remainingPlan);
 if(!parsed.success||!route||route.id!==parsed.data.routeId||!route.steps.length)return null;
 const plan=parsed.data,norms=new Map(plan.steps.map(s=>[s.stepId,s.hoursPerUnit]));
 if(norms.size!==plan.steps.length||norms.size!==route.steps.length||route.steps.some(s=>!norms.has(s.id)))return null;
 const key=(id:string)=>`remaining:${item.id}:${id}`;
 const planned=plan.start?new Date(plan.start):null;
 const baseline=start||planned?new Date(Math.max(start?.getTime()??0,planned?.getTime()??0)):null;
 return route.steps.map(step=>({id:key(step.id),title:`${item.name} — ${step.title||step.workCenter.name} (остаток)`,workCenterId:step.workCenterId,parallelSlots:step.workCenter.parallelSlots,queueOrder:1000001,priority,status:'QUEUED',normHours:norms.get(step.id)!*quantity,riskHours:null,workHours:0,start:baseline,due,calendar:step.workCenter.calendar?calendarInput.parse(step.workCenter.calendar):null,predecessors:step.predecessors.map(link=>key(link.predecessorId))}));
}
