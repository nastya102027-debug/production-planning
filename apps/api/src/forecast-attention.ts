type Row={id:string;number:string;dueDate:Date|null;items:{quantity:number;completedQuantity:number;unitPrice:unknown}[];forecast:{state:string;finish:string|null;reserveHours:number|null;reasons:string[]}};
export function forecastAttention(rows:Row[]){
 const groups:{RISK:Entry[];LATE:Entry[];DATA:Entry[]}={RISK:[],LATE:[],DATA:[]};
 type Entry={id:string;number:string;dueDate:Date|null;finish:string|null;reserveHours:number|null;amountCents:number;reason:string};
 for(const row of rows){
  const state=row.forecast.state;
  const key=state==='RISK'?'RISK':state==='LATE'?'LATE':['UNKNOWN','NO_THRESHOLD','NO_DEADLINE'].includes(state)?'DATA':null;
  if(!key)continue;
  const reason=state==='NO_THRESHOLD'?'Не задан порог риска заказа':state==='NO_DEADLINE'?'Не задан срок заказа':state==='UNKNOWN'?row.forecast.reasons.join('; '):state==='LATE'?'Прогноз позже срока заказа':'Резерв не превышает порог риска';
  groups[key].push({id:row.id,number:row.number,dueDate:row.dueDate,finish:row.forecast.finish,reserveHours:row.forecast.reserveHours,amountCents:row.items.reduce((sum,item)=>sum+Math.max(0,item.quantity-item.completedQuantity)*Math.round(Number(item.unitPrice)*100),0),reason});
 }
 for(const group of Object.values(groups))group.sort((a,b)=>(a.dueDate?.getTime()??Infinity)-(b.dueDate?.getTime()??Infinity)||a.number.localeCompare(b.number)||a.id.localeCompare(b.id));
 return groups;
}
