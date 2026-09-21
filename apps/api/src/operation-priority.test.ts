import {expect,test} from "vitest";
import {sortOperationsByPriority} from "./operation-priority.js";

const row=(id:string,priority="NORMAL",dueDate:Date|null=null,queueOrder=0)=>({id,priority,dueDate,plannedFinish:null,queueOrder});
const now=new Date("2026-09-21T10:00:00.000Z");

test("overdue work always goes first",()=>{
  expect(sortOperationsByPriority([row("future","CRITICAL",new Date("2026-10-10")),row("late","LOW",new Date("2026-09-20"))],now).map(item=>item.id)).toEqual(["late","future"]);
});
test("priority orders urgent work before its due date",()=>{
  expect(sortOperationsByPriority([row("normal","NORMAL",new Date("2026-09-22")),row("critical","CRITICAL",new Date("2026-09-23"))],now).map(item=>item.id)).toEqual(["critical","normal"]);
});
test("later work follows the nearest shipment deadline",()=>{
  expect(sortOperationsByPriority([row("later","HIGH",new Date("2026-10-05")),row("nearer","LOW",new Date("2026-09-28"))],now).map(item=>item.id)).toEqual(["nearer","later"]);
});
