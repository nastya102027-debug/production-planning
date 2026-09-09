import {test,expect} from 'vitest';
import {capacityForecast,relatedTasks} from './capacity-forecast.js';
const now=new Date('2026-09-09T08:00:00Z');
const task=(id:string,center='a')=>({id,title:id,workCenterId:center,parallelSlots:1,queueOrder:0,priority:'NORMAL',status:'QUEUED',normHours:2,riskHours:1,workHours:0,start:null,due:null,predecessors:[] as string[]});
test('Orders on the same center wait in the configured queue',()=>{
 const r=capacityForecast([{...task('later'),queueOrder:10},task('first')],now);
 expect(r.first.finish).toBe('2026-09-09T10:00:00.000Z');expect(r.later.finish).toBe('2026-09-09T12:00:00.000Z');expect(r.later.queueHours).toBe(2);
});
test('Multiple slots and independent centers run concurrently',()=>{
 const r=capacityForecast([{...task('a'),parallelSlots:2},{...task('b'),parallelSlots:2},task('c','b')],now);
 expect(new Set(Object.values(r).map(r=>r.finish)).size).toBe(1);
});
test('Running work precedes queued work even with lower priority',()=>{
 const r=capacityForecast([{...task('queued'),queueOrder:-10},{...task('working'),status:'IN_PROGRESS',workHours:1}],now);
 expect(r.working.finish).toBe('2026-09-09T09:00:00.000Z');expect(r.queued.finish).toBe('2026-09-09T11:00:00.000Z');
});
test('Dependencies win over queue order and do not create artificial cycles',()=>{
 const r=capacityForecast([{...task('join'),queueOrder:-5,predecessors:['root']},task('root')],now);
 expect(r.join.finish).toBe('2026-09-09T12:00:00.000Z');
});
test('Unknown duration and inconsistent capacity do not produce optimistic dates',()=>{
 expect(capacityForecast([{...task('a'),normHours:null},task('b')],now).b.state).toBe('UNKNOWN');
 expect(capacityForecast([{...task('a'),status:'IN_PROGRESS'},{...task('b'),status:'IN_PROGRESS'}],now).a.state).toBe('UNKNOWN');
});
test('Future work does not block an available earlier task; higher priority breaks a tie',()=>{
 const r=capacityForecast([{...task('future'),start:new Date('2026-09-10T08:00:00Z'),queueOrder:-100},task('today'),{...task('urgent'),priority:'HIGH'}],now);
 expect(r.urgent.finish).toBe('2026-09-09T10:00:00.000Z');expect(r.today.finish).toBe('2026-09-09T12:00:00.000Z');
});
test('Relevant tasks include other orders and their upstream stages but not isolated centers',()=>{
 const tasks=[task('target'),{...task('competitor'),predecessors:['upstream']},task('upstream','b'),task('isolated','c')];
 expect(relatedTasks(tasks,'target').map(t=>t.id)).toEqual(['target','competitor','upstream']);
});
