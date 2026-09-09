import type {Result} from './forecast.js';
type Item={id:string;name:string;quantity:number;completedQuantity:number;launchItems:{quantity:number;operations:{id:string;status:string}[]}[]};
export function summarizeOrderForecast(order:{dueDate:Date|null;forecastRiskHours:number|null;items:Item[]},results:Record<string,Result>,now:Date,remainingOperations:Record<string,{id:string;status:string}[]>={}){
  const reasons:string[]=[],items=order.items.map(item=>{
    const remaining=Math.max(0,item.quantity-item.launchItems.reduce((sum,launch)=>sum+launch.quantity,0));
    const unfinished=item.completedQuantity<item.quantity;
    const blockers:string[]=[];
    const plannedRemaining=remaining>0&&!!remainingOperations[item.id]?.length;
    if(unfinished&&remaining>0&&!plannedRemaining)blockers.push(`Не запущено: ${remaining} шт. Нет плана изготовления оставшегося количества`);
    let latest=now.getTime();
    if(unfinished)for(const launch of [...item.launchItems,...(plannedRemaining?[{quantity:remaining,operations:remainingOperations[item.id]}]:[])]){
      if(!launch.operations.length)blockers.push('В запуске отсутствуют производственные задачи');
      for(const operation of launch.operations){
        if(operation.status==='COMPLETED')continue;
        const result=results[operation.id];
        if(!result?.finish)blockers.push(result?.reason??'Недостаточно данных производственной задачи');
        else latest=Math.max(latest,Date.parse(result.finish));
      }
    }
    const unique=[...new Set(blockers)];for(const reason of unique)reasons.push(`${item.name}: ${reason}`);
    return {id:item.id,name:item.name,remaining,plannedRemaining,completed:!unfinished,finish:unique.length||!unfinished?null:new Date(latest).toISOString(),reasons:unique};
  });
  if(!items.length)reasons.push('В заказе нет позиций');
  const completed=items.length>0&&items.every(item=>item.completed);
  const finish=completed||reasons.length?null:new Date(Math.max(now.getTime(),...items.filter(i=>i.finish).map(i=>Date.parse(i.finish!)))).toISOString();
  // Date-only order deadlines remain valid through the end of that UTC date.
  const deadline=order.dueDate?order.dueDate.getTime()+(order.dueDate.toISOString().endsWith('T00:00:00.000Z')?86400000-1:0):null;
  const reserveHours=finish&&deadline!==null?(deadline-Date.parse(finish))/3600000:null;
  const state=completed?'COMPLETED':!finish?'UNKNOWN':reserveHours===null?'NO_DEADLINE':reserveHours<0?'LATE':order.forecastRiskHours===null?'NO_THRESHOLD':reserveHours<=order.forecastRiskHours?'RISK':'ON_TIME';
  return {finish,reserveHours,state,reasons,items};
}
