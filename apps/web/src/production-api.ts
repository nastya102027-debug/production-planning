import { useEffect, useState } from "react";

export async function productionApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error((await response.json()).message || "Ошибка запроса");
  return response.status === 204 ? undefined as T : response.json();
}

// A single authenticated stream invalidates screens; records are fetched with server-side access checks.
let stream: EventSource | null = null;
const listeners = new Set<() => void>();
export function useProductionEvents() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const listener = () => setRevision(value => value + 1);
    listeners.add(listener);
    if (!stream) {
      stream = new EventSource("/api/events", { withCredentials: true });
      stream.addEventListener("changed", () => listeners.forEach(notify => notify()));
    }
    return () => { listeners.delete(listener); if (!listeners.size) { stream?.close(); stream = null; } };
  }, []);
  return revision;
}
