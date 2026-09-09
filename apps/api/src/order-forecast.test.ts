import {test,expect} from 'vitest';
import {summarizeOrderForecast} from './order-forecast.js';
const now=new Date('2026-09-09T08:00:00Z');
const item={id:'item',name:'Зеркало',quantity:10,completedQuantity:0,launchItems:[{quantity:10,operations:[{id:'a',status:'QUEUED'},{id:'b',status:'QUEUED'}]}]};
const order={dueDate:new Date('2026-09-09T18:00:00Z'),forecastRiskHours:2,items:[item]};
const estimates={a:{finish:'2026-09-09T12:00:00Z',reserveHours:null,state:'ON_TIME'},b:{finish:'2026-09-09T16:00:00Z',reserveHours:null,state:'ON_TIME'}};
test('Date-only deadlines include the entire due date',()=>{
 expect(summarizeOrderForecast({...order,dueDate:new Date('2026-09-09')},estimates,now).state).toBe('ON_TIME');
});
test('Overall finish waits for all operations and uses order risk threshold',()=>{
 const r=summarizeOrderForecast(order,estimates,now);expect(r.finish).toBe('2026-09-09T16:00:00.000Z');expect(r.reserveHours).toBe(2);expect(r.state).toBe('RISK');
 expect(summarizeOrderForecast({...order,forecastRiskHours:1},estimates,now).state).toBe('ON_TIME');
});
test('Unlaunched quantities prevent a misleading full-order promise',()=>{
 const r=summarizeOrderForecast({...order,items:[{...item,launchItems:[{...item.launchItems[0],quantity:4}]}]},estimates,now);
 expect(r.finish).toBeNull();expect(r.items[0].remaining).toBe(6);expect(r.state).toBe('UNKNOWN');
});
test('Unknown or cancelled operations and empty launches cannot be ignored',()=>{
 expect(summarizeOrderForecast(order,{a:estimates.a},now).state).toBe('UNKNOWN');
 expect(summarizeOrderForecast({...order,items:[{...item,launchItems:[{quantity:10,operations:[]}]}]},estimates,now).finish).toBeNull();
});
test('Completed orders need no forecast; absent threshold and overdue estimates are explicit',()=>{
 expect(summarizeOrderForecast({...order,items:[{...item,completedQuantity:10}]},{},now).state).toBe('COMPLETED');
 expect(summarizeOrderForecast({...order,forecastRiskHours:null},estimates,now).state).toBe('NO_THRESHOLD');
 expect(summarizeOrderForecast({...order,dueDate:now},estimates,now).state).toBe('LATE');
});
