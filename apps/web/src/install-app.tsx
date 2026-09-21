/// <reference types="vite/client" />
import { Smartphone } from "lucide-react";
import "./install-app.css";

// Подсказка на экране входа: как поставить CRM на телефон. Внутри уже установленного приложения не показываем.
const installed = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

export function InstallApp() {
  if (installed()) return null;
  return <details className="install-app">
    <summary><Smartphone/>Установить приложение на телефон</summary>
    <dl>
      <dt>Android</dt>
      <dd><a href="/latuning-crm.apk" download>Скачать приложение</a>, открыть скачанный файл и разрешить установку.</dd>
      <dt>iPhone</dt>
      <dd>Открыть этот сайт в Safari, нажать «Поделиться» и выбрать «На экран „Домой“».</dd>
    </dl>
  </details>;
}

// Сервис-воркер нужен только ради страницы «нет связи»; в разработке он мешал бы Vite.
export function registerServiceWorker() {
  if (import.meta.env.PROD && "serviceWorker" in navigator) window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    navigator.serviceWorker.addEventListener("message", event => { if (event.data?.type === "notification-click" && typeof event.data.href === "string") window.location.hash = event.data.href; });
  });
}
