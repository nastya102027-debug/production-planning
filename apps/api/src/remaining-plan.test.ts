import {test,expect} from 'vitest';
import {remainingTasks} from './remaining-plan.js';
import {capacityForecast} from './capacity-forecast.js';
import {summarizeOrderForecast} from './order-forecast.js';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const steps=[1,2,3].map(n=>({id:id(n),title:`Этап ${n}`,workCenterId:id(n+10),workCenter:{name:`Участок ${n}`,calendar:null,parallelSlots:1},predecessors:n===3?[{predecessorId:id(1)},{predecessorId:id(2)}]:[]}));
const route={id:id(20),steps};
const item={id:id(30),name:'Зеркало',remainingPlan:{routeId:route.id,start:null,steps:steps.map((s,i)=>({stepId:s.id,hoursPerUnit:i===0?2:1}))}};
const now=new Date('2026-09-09T08:00:00Z');
test('Per-unit norms scale only the remaining quantity and preserve graph joins',()=>{
 const tasks=remainingTasks(item,route,3,null,'NORMAL',null)!;
 expect(tasks[0].normHours).toBe(6);expect(tasks[2].predecessors).toHaveLength(2);
 const result=capacityForecast(tasks,now);expect(result[tasks[2].id].finish).toBe('2026-09-09T17:00:00.000Z');
 expect(remainingTasks(item,route,1,null,'NORMAL',null)![0].normHours).toBe(2);
});
test('Procurement and user start both constrain the preview',()=>{
 const tasks=remainingTasks({...item,remainingPlan:{...item.remainingPlan,start:'2026-09-10T08:00:00Z'}},route,1,new Date('2026-09-11T08:00:00Z'),'NORMAL',null)!;
 expect(tasks[0].start!.toISOString()).toBe('2026-09-11T08:00:00.000Z');
});
test('Incomplete norms or unrelated routes do not create a forecast',()=>{
 expect(remainingTasks({...item,remainingPlan:{...item.remainingPlan,steps:[]}},route,1,null,'NORMAL',null)).toBeNull();
 expect(remainingTasks(item,{...route,id:id(90)},1,null,'NORMAL',null)).toBeNull();
});
test('Preview completes the overall calculation without changing real launch quantities',()=>{
 const tasks=remainingTasks(item,route,3,null,'NORMAL',null)!;
 const result=summarizeOrderForecast({dueDate:null,forecastRiskHours:null,items:[{id:item.id,name:item.name,quantity:3,completedQuantity:0,launchItems:[]}]},capacityForecast(tasks,now),now,{[item.id]:tasks.map(t=>({id:t.id,status:t.status}))});
 expect(result.finish).toBe('2026-09-09T17:00:00.000Z');expect(result.items[0].remaining).toBe(3);expect(result.items[0].plannedRemaining).toBe(true);
});
