type Item={quantity:number;completedQuantity:number;unitPrice:unknown;launchItems:{quantity:number}[]};
type Order={id:string;productionOrderNumber:string;status:string;dueDate:Date|null;procurement:{status:string}|null;items:Item[]};
export type Stage='procurement'|'ready'|'production'|'completed'|'unplanned'|'overdue';
export function dashboardTotals(orders:Order[],now=new Date()){
  const stages:Stage[]=['procurement','ready','production','completed','unplanned','overdue'];
  const groups=Object.fromEntries(stages.map(stage=>[stage,{count:0,amount:0,orders:[] as {id:string;number:string;dueDate:Date|null;amount:number}[]}])) as Record<Stage,{count:number;amount:number;orders:{id:string;number:string;dueDate:Date|null;amount:number}[]}>;
  for(const order of orders){
    const cents:Record<Stage,number>={procurement:0,ready:0,production:0,completed:0,unplanned:0,overdue:0};
    const quantities:Record<Stage,number>={...cents};
    for(const item of order.items){
      const price=Math.round(Number(item.unitPrice)*100),done=Math.min(item.quantity,item.completedQuantity),launched=Math.min(item.quantity,item.launchItems.reduce((sum,row)=>sum+row.quantity,0)),remaining=Math.max(0,item.quantity-launched);
      const pendingStage:Stage=order.procurement&&!['READY','NOT_REQUIRED'].includes(order.procurement.status)?'procurement':order.status==='READY_FOR_LAUNCH'||order.procurement&&['READY','NOT_REQUIRED'].includes(order.procurement.status)?'ready':'unplanned';
      const add=(stage:Stage,quantity:number)=>{quantities[stage]+=quantity;cents[stage]+=quantity*price;};
      add('completed',done);add('production',Math.max(0,launched-done));add(pendingStage,remaining);
      // An order deadline is a date: it becomes overdue on the following UTC date.
      if(order.dueDate&&order.dueDate.toISOString().slice(0,10)<now.toISOString().slice(0,10))add('overdue',Math.max(0,item.quantity-done));
    }
    for(const stage of stages)if(quantities[stage]>0){const group=groups[stage];group.count++;group.amount+=cents[stage];group.orders.push({id:order.id,number:order.productionOrderNumber,dueDate:order.dueDate,amount:cents[stage]/100});}
  }
  for(const group of Object.values(groups)){group.amount/=100;group.orders.sort((a,b)=>(a.dueDate?.getTime()??Infinity)-(b.dueDate?.getTime()??Infinity));group.orders=group.orders.slice(0,100);}
  return groups;
}
