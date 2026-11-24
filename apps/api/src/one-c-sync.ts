import type { PrismaClient } from "@prisma/client";
import { OneCClient } from "./one-c-client.js";
import { businessDays, customerOrderNumberFromOneC, mapOneCOrganization, mapOneCStatus, selectChangedOrders } from "./one-c-mapping.js";
import { syncOneCAttachments } from "./one-c-attachments.js";

const COMPLETED_STATE = "5ceff41a-ad01-11e6-95fb-005056010be4";
type Header = { Ref_Key:string; DataVersion:string; Number:string; Date:string; СостояниеЗаказа_Key:string; ЗаказПокупателя_Key:string; Организация_Key:string; Комментарий:string; Старт:string; Финиш:string; Стоимость:number };
type Product = { Ref_Key:string; LineNumber:number; Номенклатура_Key:string; Количество:number };
type Named = { Ref_Key:string; Description:string; Code?:string; Number?:string };
type CustomerOrder = Named & { НомерПоДаннымКлиента?:string; НомерЗаказаКлиента?:string; НомерЗаказаПокупателя?:string };
type Price = { Ref_Key:string; Номенклатура:string; Цена:number };

const guidFilter = (field:string, ids:string[]) => ids.map(id => `${field} eq guid'${id}'`).join(" or ");
const validGuid = (value:string) => value && value !== "00000000-0000-0000-0000-000000000000";
const validDate = (value:string) => value && Number(value.slice(0,4)) >= 2000;

async function byRefs<T>(client:OneCClient, entity:string, field:string, ids:string[], select?:string):Promise<T[]> {
  const rows:T[]=[];
  for(let index=0;index<ids.length;index+=12){
    const chunk=ids.slice(index,index+12); if(!chunk.length)continue;
    rows.push(...await client.list<T>(entity,{$filter:guidFilter(field,chunk),...(select?{$select:select}:{})}));
  }
  return rows;
}

export async function syncOneCOrders(prisma:PrismaClient, client:OneCClient, actorId:string) {
  const from=(process.env.ONE_C_SYNC_FROM||"2026-03-01").slice(0,10);
  const headers=await client.list<Header>("Document_ЗаказНаПроизводство",{
    $filter:`Date ge datetime'${from}T00:00:00' and СостояниеЗаказа_Key ne guid'${COMPLETED_STATE}' and DeletionMark eq false`,
    $orderby:"Date desc",$select:"Ref_Key,DataVersion,Number,Date,СостояниеЗаказа_Key,ЗаказПокупателя_Key,Организация_Key,Комментарий,Старт,Финиш,Стоимость"
  });
  const known=await prisma.order.findMany({where:{externalSource:"1C"},select:{externalId:true,externalVersion:true,sourceCreatedAt:true}});
  const versions=new Map(known.flatMap(row=>row.externalId?[[row.externalId,row.sourceCreatedAt?row.externalVersion:null]]:[]));
  const changed=selectChangedOrders(headers,versions).slice(0,100);
  if(!changed.length){
    const files=await syncOneCAttachments(prisma,client,headers);
    return {scanned:headers.length,created:0,updated:0,unchanged:headers.length,files};
  }

  const refs=changed.map(row=>row.Ref_Key);
  const customerRefs=[...new Set(changed.map(row=>row.ЗаказПокупателя_Key).filter(validGuid))];
  const orgRefs=[...new Set(changed.map(row=>row.Организация_Key).filter(validGuid))];
  const stateRefs=[...new Set(changed.map(row=>row.СостояниеЗаказа_Key).filter(validGuid))];
  const products=await byRefs<Product>(client,"Document_ЗаказНаПроизводство_Продукция","Ref_Key",refs,"Ref_Key,LineNumber,Номенклатура_Key,Количество");
  const nomenclatureRefs=[...new Set(products.map(row=>row.Номенклатура_Key).filter(validGuid))];
  const [names,customers,organizations,states,prices]=await Promise.all([
    byRefs<Named>(client,"Catalog_Номенклатура","Ref_Key",nomenclatureRefs,"Ref_Key,Code,Description"),
    byRefs<CustomerOrder>(client,"Document_ЗаказПокупателя","Ref_Key",customerRefs),
    byRefs<Named>(client,"Catalog_Организации","Ref_Key",orgRefs,"Ref_Key,Description"),
    byRefs<Named>(client,"Catalog_СостоянияЗаказовНаПроизводство","Ref_Key",stateRefs,"Ref_Key,Description"),
    byRefs<Price>(client,"Document_ЗаказПокупателя_Запасы","Ref_Key",customerRefs,"Ref_Key,Номенклатура,Цена")
  ]);
  const nameMap=new Map(names.map(row=>[row.Ref_Key,row]));
  const customerMap=new Map(customers.map(row=>[row.Ref_Key,customerOrderNumberFromOneC(row)]));
  const orgMap=new Map(organizations.map(row=>[row.Ref_Key,row.Description]));
  const stateMap=new Map(states.map(row=>[row.Ref_Key,row.Description]));
  const priceMap=new Map(prices.map(row=>[`${row.Ref_Key}:${row.Номенклатура}`,Number(row.Цена)||0]));
  let created=0,updated=0;

  for(const header of changed){
    const remoteItems=products.filter(row=>row.Ref_Key===header.Ref_Key&&row.Количество>0);
    if(!remoteItems.length)continue;
    const totalQuantity=remoteItems.reduce((sum,row)=>sum+row.Количество,0);
    const items=remoteItems.map(row=>({
      externalId:`${row.Номенклатура_Key}:${row.LineNumber}`,
      name:nameMap.get(row.Номенклатура_Key)?.Description||`Позиция 1С ${row.LineNumber}`,
      article:nameMap.get(row.Номенклатура_Key)?.Code||null,
      quantity:Math.max(1,Math.round(row.Количество)),
      unitPrice:priceMap.get(`${header.ЗаказПокупателя_Key}:${row.Номенклатура_Key}`)??(Number(header.Стоимость)||0)/Math.max(1,totalQuantity)
    }));
    const existing=await prisma.order.findFirst({where:{OR:[{externalSource:"1C",externalId:header.Ref_Key},{productionOrderNumber:header.Number}]},include:{items:{include:{launchItems:{select:{quantity:true}}}}}});
    const finish=validDate(header.Финиш)?header.Финиш:header.Date;
    const initialComment=[header.Комментарий,"Источник: 1С"].filter(Boolean).join("\n");
    const data={productionOrderNumber:header.Number,customerOrderNumber:customerMap.get(header.ЗаказПокупателя_Key)||null,organization:mapOneCOrganization(orgMap.get(header.Организация_Key)||""),status:mapOneCStatus(stateMap.get(header.СостояниеЗаказа_Key)||""),drawingApprovalDate:new Date(header.Date),productionLeadDays:businessDays(header.Date,finish),dueDate:validDate(header.Финиш)?new Date(header.Финиш):null,externalSource:"1C",externalId:header.Ref_Key,externalVersion:header.DataVersion,lastSyncedAt:new Date(),sourceCreatedAt:new Date(header.Date)};
    await prisma.$transaction(async tx=>{
      let orderId:string;
      if(!existing){const order=await tx.order.create({data:{...data,comment:initialComment||null,items:{create:items}}});orderId=order.id;created+=1;}
      else{
        orderId=existing.id;await tx.order.update({where:{id:orderId},data:{...data,...(!existing.externalId?{comment:initialComment||null}:{})}});
        for(const item of items){const current=existing.items.find(row=>row.externalId===item.externalId||(!row.externalId&&row.name===item.name));const minimum=current?Math.max(current.completedQuantity,current.launchItems.reduce((sum,row)=>sum+row.quantity,0)):0;
          if(current)await tx.orderItem.update({where:{id:current.id},data:{...item,quantity:Math.max(item.quantity,minimum)}});
          else await tx.orderItem.create({data:{...item,orderId}});
        }updated+=1;
      }
      await tx.auditLog.create({data:{actorId,action:"ORDER_SYNCED_FROM_1C",entityType:"Order",entityId:orderId,after:{externalId:header.Ref_Key,version:header.DataVersion,itemCount:items.length}}});
    });
  }
  const files=await syncOneCAttachments(prisma,client,headers);
  return {scanned:headers.length,created,updated,unchanged:headers.length-changed.length,files};
}

