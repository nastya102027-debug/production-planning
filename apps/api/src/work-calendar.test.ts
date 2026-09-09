import {test,expect} from 'vitest';
import {calendarInput,finishInCalendar,type WorkCalendar} from './work-calendar.js';
import {forecast} from './forecast.js';
const calendar:WorkCalendar={utcOffsetMinutes:180,shifts:[1,2,3,4,5].flatMap(day=>[{day,start:540,end:780},{day,start:840,end:1080}]),holidays:[]};
const end=(start:string,hours:number,c=calendar)=>new Date(finishInCalendar(Date.parse(start),hours,c)!).toISOString();
test('Calendar skips lunch, nights and weekends in the selected time zone',()=>{
 expect(end('2026-09-11T09:00:00Z',3)).toBe('2026-09-11T13:00:00.000Z');
 expect(end('2026-09-11T14:00:00Z',3)).toBe('2026-09-14T08:00:00.000Z');
 expect(end('2026-09-12T12:00:00Z',1)).toBe('2026-09-14T07:00:00.000Z');
});
test('Explicit holidays and exact shift boundaries are respected',()=>{
 expect(end('2026-09-11T14:00:00Z',1)).toBe('2026-09-11T15:00:00.000Z');
 expect(end('2026-09-11T15:00:00Z',1,{...calendar,holidays:['2026-09-14']})).toBe('2026-09-15T07:00:00.000Z');
});
test('Overlaps, empty calendars, invalid dates and reversed shifts are rejected',()=>{
 for(const patch of [{shifts:[]},{shifts:[{day:1,start:700,end:600}]},{shifts:[{day:1,start:600,end:800},{day:1,start:700,end:900}]},{holidays:['2026-02-30']}])expect(calendarInput.safeParse({...calendar,...patch}).success).toBe(false);
 expect(calendarInput.safeParse(calendar).success).toBe(true);
});
test('Joined branches use each stage calendar before calculating risk',()=>{
 const base={status:'QUEUED',normHours:3,riskHours:2,workHours:0,start:null,due:new Date('2026-09-14T10:00:00Z'),calendar};
 const rows=[{...base,id:'a',title:'a',predecessors:[]},{...base,id:'b',title:'b',normHours:1,predecessors:[]},{...base,id:'c',title:'c',normHours:1,predecessors:['a','b']}];
 const result=forecast(rows,new Date('2026-09-11T14:00:00Z'));
 expect(result.c.finish).toBe('2026-09-14T09:00:00.000Z');expect(result.c.state).toBe('RISK');
});
