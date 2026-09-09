import {z} from 'zod';
import {isDateOnly} from './working-days.js';
export const calendarInput=z.object({
  utcOffsetMinutes:z.number().int().min(-720).max(840),
  shifts:z.array(z.object({day:z.number().int().min(0).max(6),start:z.number().int().min(0).max(1439),end:z.number().int().min(1).max(1440)}).strict().refine(s=>s.end>s.start,'Конец смены должен быть позже начала')).min(1).max(28),
  holidays:z.array(z.string().refine(isDateOnly,'Некорректная дата выходного')).max(1000)
}).strict().refine(c=>c.shifts.every((s,i)=>c.shifts.every((other,j)=>i===j||s.day!==other.day||s.end<=other.start||other.end<=s.start)),'Смены одного дня не должны пересекаться');
export type WorkCalendar=z.infer<typeof calendarInput>;
// Shift times are wall-clock minutes in the explicitly selected fixed UTC offset.
export function finishInCalendar(start:number,hours:number,calendar:WorkCalendar):number|null{
  const offset=calendar.utcOffsetMinutes*60000,local=start+offset;
  let day=Math.floor(local/86400000)*86400000,remaining=hours*3600000;
  const holidays=new Set(calendar.holidays);
  for(let count=0;count<36600;count++,day+=86400000){
    const date=new Date(day);
    if(holidays.has(date.toISOString().slice(0,10)))continue;
    const shifts=calendar.shifts.filter(s=>s.day===date.getUTCDay()).sort((a,b)=>a.start-b.start);
    for(const shift of shifts){
      const begin=Math.max(start,day+shift.start*60000-offset),end=day+shift.end*60000-offset;
      if(end<=begin)continue;
      if(remaining<=end-begin)return begin+remaining;
      remaining-=end-begin;
    }
  }
  return null;
}
