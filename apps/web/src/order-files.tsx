import { useEffect, useState } from "react";
import { FileText, FolderOpen, Image as ImageIcon, X } from "lucide-react";
import { productionApi, useChatEvents } from "./production-api";
import "./order-files.css";

type OrderFile = { id: string; source: "calculator" | "1c" | "chat"; title: string; name: string; mime: string; size: number; url: string; createdAt: string };
const sourceLabels: Record<OrderFile["source"], string> = { calculator: "из калькулятора", "1c": "из 1С", chat: "из чата" };
const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;

function FileRow({ file }: { file: OrderFile }) {
  const Icon = file.mime.startsWith("image/") ? ImageIcon : FileText;
  return <a className={`order-file ${file.source}`} href={file.url} target="_blank" rel="noopener noreferrer" title={file.name}><Icon/><span><b>{file.title}</b><small>{sourceLabels[file.source]} · {fileSize(file.size)}</small></span></a>;
}

// Чертежи и файлы заказа: PDF из калькулятора, присланное из 1С и вложения чата.
export function OrderFiles({ orderId }: { orderId: string }) {
  const [files, setFiles] = useState<OrderFile[] | null>(null), [error, setError] = useState("");
  const revision = useChatEvents();
  useEffect(() => {
    let active = true;
    productionApi<{ files: OrderFile[] }>(`/orders/${orderId}/files`).then(data => { if (active) { setFiles(data.files); setError(""); } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить файлы"); });
    return () => { active = false; };
  }, [orderId, revision]);
  const drawings = files?.filter(file => file.source !== "chat") ?? [], fromChat = files?.filter(file => file.source === "chat") ?? [];
  return <section className="order-files" aria-label="Чертежи и файлы заказа">
    <h3><FolderOpen/>Чертежи и файлы</h3>
    {error ? <p className="order-files-hint">{error}</p> : !files ? <p className="order-files-hint">Загружаю…</p> : !files.length ? <p className="order-files-hint">По этому заказу файлов пока нет. Чертежи появятся здесь, когда их выпустят в калькуляторе или пришлют из 1С.</p> : <>
      {drawings.length > 0 && <div className="order-files-list">{drawings.map(file => <FileRow key={file.id} file={file}/>)}</div>}
      {fromChat.length > 0 && <><h4>Из переписки по заказу</h4><div className="order-files-list">{fromChat.map(file => <FileRow key={file.id} file={file}/>)}</div></>}
    </>}
  </section>;
}

export function OrderFilesDialog({ orderId, title, onClose }: { orderId: string; title: string; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="task-dialog order-files-dialog" role="dialog" aria-modal="true" aria-label="Файлы заказа"><header><h2>{title}</h2><button type="button" aria-label="Закрыть файлы" onClick={onClose}><X/></button></header><OrderFiles orderId={orderId}/></section></div>;
}
