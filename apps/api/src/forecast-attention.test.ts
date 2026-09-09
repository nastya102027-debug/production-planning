import {test,expect} from 'vitest';
import {forecastAttention} from './forecast-attention.js';
const row=(id:string,state:string)=>({id,number:id,dueDate:null,items:[{quantity:10,completedQuantity:4,unitPrice:10.1}],forecast:{state,finish:null,reserveHours:null,reasons:['Нет норматива']}});
test('Risk, late and missing data form distinct groups, completed and on-time orders are excluded',()=>{
 const result=forecastAttention(['RISK','LATE','UNKNOWN','NO_THRESHOLD','NO_DEADLINE','COMPLETED','ON_TIME'].map(s=>row(s,s)));
 expect(result.RISK).toHaveLength(1);expect(result.LATE).toHaveLength(1);expect(result.DATA).toHaveLength(3);
 expect(result.RISK[0].amountCents).toBe(6060);expect(result.DATA.find(r=>r.id==='NO_THRESHOLD')!.reason).toContain('порог');
});
test('All records are retained for pagination and zero-price work still counts',()=>{
 const result=forecastAttention(Array.from({length:61},(_,i)=>({...row(String(i),'RISK'),items:[{quantity:1,completedQuantity:0,unitPrice:0}]})));
 expect(result.RISK).toHaveLength(61);expect(result.RISK[0].amountCents).toBe(0);
});
