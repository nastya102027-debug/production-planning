import argon2 from "argon2";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();
const workCenters = [
  "Лазер", "Гибка", "Малярка Порошок", "Гильотина", "Пила",
  "Шлиф станок", "Шлифовка ручная", "Сварка", "Слесарка",
  "Фрезер ЧПУ", "Токарка ЧПУ", "Фрезер ручной", "Малярка", "Патина", "ОТК"
];

async function main() {
  const plannerPassword=process.env.PLANNER_INITIAL_PASSWORD;
  const employeePassword=process.env.EMPLOYEE_INITIAL_PASSWORD;
  if(!plannerPassword || plannerPassword.length<7 || !employeePassword || employeePassword.length<10){
    throw new Error("Задайте PLANNER_INITIAL_PASSWORD (минимум 7 символов) и EMPLOYEE_INITIAL_PASSWORD (минимум 10 символов)");
  }
  const centers=[];
  for(const name of workCenters) centers.push(await prisma.workCenter.upsert({where:{name},update:{},create:{name}}));
  await prisma.user.upsert({where:{login:"Козыренко"},update:{},create:{login:"Козыренко",passwordHash:await argon2.hash(plannerPassword),firstName:"Анастасия",lastName:"Козыренко",role:UserRole.PLANNER}});
  const employee=await prisma.user.upsert({where:{login:"employee.gibka"},update:{},create:{login:"employee.gibka",passwordHash:await argon2.hash(employeePassword),firstName:"Тестовый",lastName:"Сотрудник",role:UserRole.EMPLOYEE}});
  const bending=centers.find(x=>x.name==="Гибка")!;
  await prisma.userWorkCenter.upsert({where:{userId_workCenterId:{userId:employee.id,workCenterId:bending.id}},update:{},create:{userId:employee.id,workCenterId:bending.id}});
}

main().finally(()=>prisma.$disconnect());
