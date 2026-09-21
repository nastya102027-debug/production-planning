import { useEffect, useState } from "react";

export async function productionApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error((await response.json()).message || "Ошибка запроса");
  return response.status === 204 ? undefined as T : response.json();
}

// A single authenticated stream invalidates screens; records are fetched with server-side access checks.
// «changed» — производственные экраны, «chat» — чат заказов.
type Channel = "changed" | "chat";
let stream: EventSource | null = null;
const listeners: Record<Channel, Set<() => void>> = { changed: new Set(), chat: new Set() };
function useChannel(channel: Channel) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const listener = () => setRevision(value => value + 1);
    listeners[channel].add(listener);
    if (!stream) {
      stream = new EventSource("/api/events", { withCredentials: true });
      for (const name of ["changed", "chat"] as const) stream.addEventListener(name, () => listeners[name].forEach(notify => notify()));
      // «changed» сервер шлёт сам при каждом подключении; чат после обрыва связи перечитываем по открытию потока
      stream.addEventListener("open", () => listeners.chat.forEach(notify => notify()));
    }
    return () => { listeners[channel].delete(listener); if (!listeners.changed.size && !listeners.chat.size) { stream?.close(); stream = null; } };
  }, [channel]);
  return revision;
}
export function useProductionEvents() { return useChannel("changed"); }
export function useChatEvents() { return useChannel("chat"); }
