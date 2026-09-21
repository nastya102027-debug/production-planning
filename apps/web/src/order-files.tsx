import { useEffect, useRef, useState } from "react";
import { FileText, FolderOpen, Image as ImageIcon, Paperclip, Trash2, Upload, X } from "lucide-react";
import { productionApi, useChatEvents } from "./production-api";
import "./order-files.css";

type OrderFile = { id: string; source: "rkd" | "calculator" | "1c" | "chat"; title: string; name: string; mime: string; size: number; url: string; createdAt: string };
type FilesData = { files: OrderFile[]; canUploadRkd: boolean };
const sourceLabels: Record<OrderFile["source"], string> = { rkd: "РКД заказа", calculator: "из калькулятора", "1c": "из 1С", chat: "из чата" };
const fileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`;

function FileRow({ file, canManage, onDelete }: { file: OrderFile; canManage: boolean; onDelete: (file: OrderFile) => void }) {
  const Icon = file.mime.startsWith("image/") ? ImageIcon : FileText;
  return <div className={`order-file ${file.source}`}><a href={file.url} target="_blank" rel="noopener noreferrer" title={`Открыть: ${file.name}`}><Icon/><span><b>{file.title}</b><small>{sourceLabels[file.source]} · {fileSize(file.size)}</small></span></a>{canManage && file.source === "rkd" && <button type="button" className="order-file-delete" aria-label={`Удалить ${file.name}`} title="Удалить файл" onClick={() => onDelete(file)}><Trash2/></button>}</div>;
}

// Чертежи и файлы заказа: PDF из калькулятора, присланное из 1С и вложения чата.
export function OrderFiles({ orderId }: { orderId: string }) {
  const [data, setData] = useState<FilesData | null>(null), [error, setError] = useState(""), [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const revision = useChatEvents();
  async function load() {
    const next = await productionApi<FilesData>(`/orders/${orderId}/files`); setData(next); setError("");
  }
  useEffect(() => {
    let active = true;
    productionApi<FilesData>(`/orders/${orderId}/files`).then(next => { if (active) { setData(next); setError(""); } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Не удалось загрузить файлы"); });
    return () => { active = false; };
  }, [orderId, revision]);
  async function upload(files: File[]) {
    if (!files.length || uploading) return;
    setUploading(true); setError("");
    try {
      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name}: файл больше 25 МБ`);
        const response = await fetch(`/api/orders/${orderId}/rkd?name=${encodeURIComponent(file.name)}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/octet-stream" }, body: file });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || `Не удалось загрузить ${file.name}`);
      }
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить РКД"); }
    finally { setUploading(false); }
  }
  async function remove(file: OrderFile) {
    if (!window.confirm(`Удалить «${file.name}» из РКД заказа?`)) return;
    try { await productionApi(`/orders/${orderId}/rkd/${file.id}`, { method: "DELETE" }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось удалить файл"); }
  }
  const files = data?.files ?? [], rkd = files.filter(file => file.source === "rkd"), drawings = files.filter(file => file.source === "calculator" || file.source === "1c"), fromChat = files.filter(file => file.source === "chat");
  return <section className="order-files" aria-label="Чертежи и файлы заказа">
    <div className="order-files-heading"><h3><FolderOpen/>РКД и файлы заказа</h3>{data?.canUploadRkd && <><button type="button" className="order-rkd-upload" disabled={uploading} onClick={() => picker.current?.click()}><Upload/>{uploading ? "Загрузка…" : "Добавить РКД"}</button><input ref={picker} type="file" hidden multiple accept=".pdf,.xls,.xlsx,.csv,.dwg,.dxf,.doc,.docx,.zip,.rar,.7z" onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ""; }}/></>}</div>
    {data?.canUploadRkd && <p className="order-rkd-note"><Paperclip/>PDF, Excel, DWG/DXF и архивы до 25 МБ. PDF открывается в браузере, остальные файлы скачиваются.</p>}
    {error ? <p className="order-files-hint">{error}</p> : !data ? <p className="order-files-hint">Загружаю…</p> : !files.length ? <p className="order-files-hint">РКД к заказу пока не прикреплена.</p> : <>
      {rkd.length > 0 && <><h4>РКД</h4><div className="order-files-list">{rkd.map(file => <FileRow key={file.id} file={file} canManage={data.canUploadRkd} onDelete={remove}/>)}</div></>}
      {drawings.length > 0 && <><h4>Полученные чертежи</h4><div className="order-files-list">{drawings.map(file => <FileRow key={file.id} file={file} canManage={false} onDelete={remove}/>)}</div></>}
      {fromChat.length > 0 && <><h4>Из переписки по заказу</h4><div className="order-files-list">{fromChat.map(file => <FileRow key={file.id} file={file} canManage={false} onDelete={remove}/>)}</div></>}
    </>}
  </section>;
}

export function OrderFilesDialog({ orderId, title, onClose }: { orderId: string; title: string; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="task-dialog order-files-dialog" role="dialog" aria-modal="true" aria-label="Файлы заказа"><header><h2>{title}</h2><button type="button" aria-label="Закрыть файлы" onClick={onClose}><X/></button></header><OrderFiles orderId={orderId}/></section></div>;
}
