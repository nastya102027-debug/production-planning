import {test,expect} from 'vitest';
import {productionAnalytics} from './analytics.js';
const d=(hour:number)=>new Date(`2026-09-09T${String(hour).padStart(2,'0')}:00:00Z`);
const op={id:'op',title:'Зеркало',orderNumber:'1',workCenter:{id:'center',name:'Сварка'},timeEntries:[] as {startedAt:Date;finishedAt:Date|null}[],statusHistory:[] as {id:string;fromStatus:string|null;toStatus:string;changedAt:Date;reason:string|null}[]};
const event=(id:string,fromStatus:string,toStatus:string,hour:number)=>({id,fromStatus,toStatus,changedAt:d(hour),reason:'Нет материала'});
test('Work is clipped to the period and open intervals stop at report time',()=>{
 const report=productionAnalytics([{...op,timeEntries:[{startedAt:d(6),finishedAt:d(10)},{startedAt:d(11),finishedAt:null}]}],d(8),d(18),d(12));
 expect(report.totals.workSeconds).toBe(3*3600);expect(report.totals.tasks).toBe(1);
});
test('Carried pauses count duration but not new stops; comments do not split a pause',()=>{
 const report=productionAnalytics([{...op,statusHistory:[event('a','IN_PROGRESS','PAUSED',7),event('b','PAUSED','PAUSED',9),event('c','PAUSED','IN_PROGRESS',10)]}],d(8),d(18),d(18));
 expect(report.totals.downtimeSeconds).toBe(7200);expect(report.totals.stops).toBe(0);expect(report.stops).toHaveLength(1);expect(report.stops[0].carried).toBe(true);
});
test('New stops and completed tasks exclude status-preserving comments',()=>{
 const report=productionAnalytics([{...op,statusHistory:[event('a','IN_PROGRESS','PAUSED',9),event('b','PAUSED','IN_PROGRESS',10),event('c','IN_PROGRESS','COMPLETED',11),event('d','COMPLETED','COMPLETED',12)]}],d(8),d(18),d(18));
 expect(report.totals.stops).toBe(1);expect(report.totals.completed).toBe(1);expect(report.totals.downtimeSeconds).toBe(3600);
});
test('Future dates and end-boundary events do not contribute',()=>{
 const report=productionAnalytics([{...op,statusHistory:[event('a','IN_PROGRESS','PAUSED',18)],timeEntries:[{startedAt:d(18),finishedAt:null}]}],d(8),d(18),d(20));
 expect(report.centers).toHaveLength(0);expect(report.stops).toHaveLength(0);
});
