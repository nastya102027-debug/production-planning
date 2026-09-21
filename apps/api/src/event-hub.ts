import type { Response } from "express";

// Один поток событий на вкладку: «changed» — обновить производственные экраны, «chat» — пришло сообщение в чат заказа.
// В поток уходит только сигнал; сами данные экран запрашивает заново, и права проверяет сервер.
type EventStream = { res: Response; all: boolean; centers: string[] };

export function createEventHub() {
  const streams = new Set<EventStream>();
  const reaches = (stream: EventStream, centers: string[]) => stream.all || stream.centers.some(id => centers.includes(id));
  return {
    open(res: Response, all: boolean, centers: string[]) {
      const stream = { res, all, centers };
      streams.add(stream);
      return () => { streams.delete(stream); };
    },
    publishChanged(centers: string[] = []) {
      for (const stream of streams) if (reaches(stream, centers)) stream.res.write("event: changed\ndata: {}\n\n");
    },
    publishChat(orderId: string, centers: string[]) {
      for (const stream of streams) if (reaches(stream, centers)) stream.res.write(`event: chat\ndata: ${JSON.stringify({ orderId })}\n\n`);
    }
  };
}
export type EventHub = ReturnType<typeof createEventHub>;
