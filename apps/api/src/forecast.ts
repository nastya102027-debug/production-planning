import {finishInCalendar,type WorkCalendar} from "./work-calendar.js";
export type Stage={calendar?:WorkCalendar|null;id:string;title:string;status:string;normHours:number|null;riskHours:number|null;workHours:number;start:Date|null;due:Date|null;predecessors:string[]};
export type Result={finish:string|null;reserveHours:number|null;state:string;reason?:string};
export function forecast(rows:Stage[],now:Date):Record<string,Result>{
  const results:Record<string,Result>={},visiting=new Set<string>(),byId=new Map(rows.map(row=>[row.id,row]));
  function visit(id:string):Result{
    if(results[id])return results[id];
    const row=byId.get(id);
    const unknown=(reason:string):Result=>({finish:null,reserveHours:null,state:'UNKNOWN',reason});
    if(!row||visiting.has(id))return unknown('Некорректные связи маршрута');
    if(row.status==='COMPLETED')return results[id]={finish:now.toISOString(),reserveHours:null,state:'COMPLETED'};
    if(row.status==='PAUSED'||row.status==='CANCELLED')return results[id]=unknown('Остановка или отмена этапа: '+row.title);
    if(row.normHours===null)return results[id]=unknown('Не задан норматив: '+row.title);
    const remaining=row.normHours-row.workHours;
    if(remaining<=0)return results[id]=unknown('Норматив исчерпан, уточните длительность: '+row.title);
    visiting.add(id);
    const parents=row.predecessors.map(visit);visiting.delete(id);
    const missing=parents.find(p=>!p.finish);
    if(missing)return results[id]=unknown(missing.reason??'Недостаточно данных предыдущего этапа');
    const start=Math.max(now.getTime(),row.start?.getTime()??0,...parents.map(p=>new Date(p.finish!).getTime()));
    const finish=row.calendar?finishInCalendar(start,remaining,row.calendar):start+remaining*3600000;
    if(finish===null)return results[id]=unknown("Прогноз превышает горизонт календаря: "+row.title);
    const reserveHours=row.due?(row.due.getTime()-finish)/3600000:null;
    const state=reserveHours===null?'NO_DEADLINE':reserveHours<0?'LATE':row.riskHours===null?'NO_THRESHOLD':reserveHours<=row.riskHours?'RISK':'ON_TIME';
    return results[id]={finish:new Date(finish).toISOString(),reserveHours,state};
  }
  for(const row of rows)visit(row.id);
  return results;
}
