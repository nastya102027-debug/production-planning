import { useEffect, useRef, useState } from "react";
import { Bell, MessageCircle, Volume2, X } from "lucide-react";
import { productionApi, useChatEvents, useProductionEvents } from "./production-api";
import "./live-notifications.css";

type Toast={id:string;kind:"chat"|"attention";title:string;text:string;href:string};
type PlannerNotice={readAt?:string;notification:{id:string;title:string;message:string;entityId?:string;createdAt:string}};
type Thread={order:{id:string;productionOrderNumber:string};unread:number;last:{text:string;files:number;author:{firstName:string;lastName:string}}};
const storageKey="latuning-notification-prompt";

function chime(){
  try{const AudioContextCtor=window.AudioContext||((window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext);if(!AudioContextCtor)return;const context=new AudioContextCtor(),now=context.currentTime;for(const [at,freq] of [[0,660],[.12,880]] as const){const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type="sine";oscillator.frequency.value=freq;gain.gain.setValueAtTime(.0001,now+at);gain.gain.exponentialRampToValueAtTime(.09,now+at+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+at+.16);oscillator.connect(gain).connect(context.destination);oscillator.start(now+at);oscillator.stop(now+at+.18);}setTimeout(()=>void context.close(),500);}catch{}
}
async function systemNotice(toast:Toast){
  if(!("Notification" in window)||Notification.permission!=="granted")return;
  try{if("serviceWorker" in navigator){const registration=await navigator.serviceWorker.ready;await registration.showNotification(toast.title,{body:toast.text,icon:"/icons/icon-192.png",badge:"/icons/icon-192.png",tag:toast.id,data:{href:toast.href}});return;}new Notification(toast.title,{body:toast.text,icon:"/icons/icon-192.png"});}catch{}
}

export function LiveNotifications({planner}:{planner:boolean}){
  const productionRevision=useProductionEvents(),chatRevision=useChatEvents();
  const [toasts,setToasts]=useState<Toast[]>([]),[askPermission,setAskPermission]=useState(false);
  const seededNotices=useRef(false),seededThreads=useRef(false),noticeIds=useRef(new Set<string>()),threadMarkers=useRef(new Set<string>()),unlocked=useRef(false);
  const dismiss=(id:string)=>setToasts(rows=>rows.filter(row=>row.id!==id));
  const show=(toast:Toast)=>{setToasts(rows=>[toast,...rows.filter(row=>row.id!==toast.id)].slice(0,3));window.setTimeout(()=>dismiss(toast.id),5000);if(unlocked.current)chime();if(document.hidden)void systemNotice(toast);};
  useEffect(()=>{const unlock=()=>{unlocked.current=true;};window.addEventListener("pointerdown",unlock,{once:true});window.addEventListener("keydown",unlock,{once:true});return()=>{window.removeEventListener("pointerdown",unlock);window.removeEventListener("keydown",unlock);};},[]);
  useEffect(()=>{if("Notification" in window&&Notification.permission==="default"&&!localStorage.getItem(storageKey)){const timer=window.setTimeout(()=>setAskPermission(true),1200);return()=>clearTimeout(timer);}},[]);
  useEffect(()=>{if(!planner)return;let active=true;productionApi<{items:PlannerNotice[]}>("/notifications?page=1").then(data=>{if(!active)return;const unread=data.items.filter(item=>!item.readAt);if(!seededNotices.current){unread.forEach(item=>noticeIds.current.add(item.notification.id));seededNotices.current=true;return;}for(const item of unread.filter(item=>!noticeIds.current.has(item.notification.id))){noticeIds.current.add(item.notification.id);show({id:`notice-${item.notification.id}`,kind:"attention",title:item.notification.title,text:item.notification.message.replace(/\n/g," · "),href:`#page=problems`});}}).catch(()=>{});return()=>{active=false;};},[planner,productionRevision]);
  useEffect(()=>{let active=true;productionApi<{threads:Thread[]}>("/chat/threads").then(data=>{if(!active)return;const unread=data.threads.filter(thread=>thread.unread>0);const key=(thread:Thread)=>`${thread.order.id}:${thread.last.text}:${thread.last.author.firstName}:${thread.last.author.lastName}`;if(!seededThreads.current){unread.forEach(thread=>threadMarkers.current.add(key(thread)));seededThreads.current=true;return;}for(const thread of unread.filter(thread=>!threadMarkers.current.has(key(thread)))){threadMarkers.current.add(key(thread));show({id:`chat-${key(thread)}`,kind:"chat",title:`Новое сообщение · заказ № ${thread.order.productionOrderNumber}`,text:thread.last.text||`${thread.last.author.firstName} ${thread.last.author.lastName} прикрепил(а) файл`,href:`#page=chat&order=${thread.order.id}`});}}).catch(()=>{});return()=>{active=false;};},[chatRevision]);
  async function enable(){localStorage.setItem(storageKey,"enabled");setAskPermission(false);if(!("Notification" in window))return;try{await Notification.requestPermission();}catch{}}
  function later(){localStorage.setItem(storageKey,"later");setAskPermission(false);}
  return <aside className="live-notifications" aria-live="polite">{askPermission&&<section className="notification-permission"><Bell/><div><b>Включить оповещения?</b><span>Сообщения и важные события будут приходить поверх сайта, а при свёрнутом приложении — системным уведомлением.</span><footer><button onClick={()=>void enable()}><Volume2/>Включить</button><button className="later" onClick={later}>Позже</button></footer></div></section>}{toasts.map(toast=><button className={`live-toast ${toast.kind}`} key={toast.id} onClick={()=>{dismiss(toast.id);window.location.hash=toast.href;}}><span className="live-toast-icon">{toast.kind==="chat"?<MessageCircle/>:<Bell/>}</span><span><small>{toast.kind==="chat"?"СООБЩЕНИЕ":"ТРЕБУЕТ ВНИМАНИЯ"}</small><b>{toast.title}</b><em>{toast.text}</em></span><i aria-label="Закрыть" onClick={event=>{event.stopPropagation();dismiss(toast.id);}}><X/></i></button>)}</aside>;
}
