import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FolderOpen, Check, CheckCheck, FileText, MessageCircle, Paperclip, Search, Send, X } from "lucide-react";
import { productionApi, useChatEvents } from "./production-api";
import { OrderFilesDialog } from "./order-files";
import "./chat.css";

type ChatOrder = { id: string; productionOrderNumber: string; customerOrderNumber?: string | null; customer?: string | null; archivedAt?: string | null };
type Author = { id: string; firstName: string; lastName: string };
type ChatFile = { id: string; name: string; mime: string; size: number };
type Message = { id: string; seq: number; text: string; createdAt: string; author: Author; files: ChatFile[] };
type Thread = { order: ChatOrder; total: number; unread: number; mentioned: boolean; last: { text: string; files: number; createdAt: string; author: Author } };
type Person = { id: string; login: string; firstName: string; lastName: string };
type ThreadData = { order: ChatOrder; messages: Message[]; people: Person[]; reads: { lastSeq: number; user: Author }[]; me: string };

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const fileUrl = (id: string) => `/api/chat/files/${id}`;
const shortName = (author: Author) => `${author.firstName} ${author.lastName[0] ?? ""}.`;
const dayKey = (value: string) => new Date(value).toDateString();
const clock = (value: string) => new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
function fileSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`; }
function dayLabel(value: string) {
  const date = new Date(value), today = new Date(), yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Сегодня";
  if (date.toDateString() === yesterday.toDateString()) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }) });
}
function threadTime(value: string) { return dayKey(value) === new Date().toDateString() ? clock(value) : new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }); }

// значок на кнопке «Чат»: сколько непрочитанного и звали ли лично
export function useChatUnread() {
  const revision = useChatEvents();
  const [state, setState] = useState({ unread: 0, mentions: 0 });
  useEffect(() => { productionApi<{ unread: number; mentions: number }>("/chat/unread").then(setState).catch(() => {}); }, [revision]);
  return state;
}

// ссылки и @упоминания — узлами React, без вставки HTML
function RichText({ text, logins }: { text: string; logins: Set<string> }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+|@[\p{L}\p{N}_.-]+)/gu);
  return <>{parts.map((part, index) => {
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
    if (part.startsWith("@") && logins.has(part.slice(1).replace(/[.-]+$/, "").toLowerCase())) return <b key={index} className="chat-mention">{part}</b>;
    return <React.Fragment key={index}>{part}</React.Fragment>;
  })}</>;
}

function Attachment({ file }: { file: ChatFile }) {
  if (IMAGE_MIME.includes(file.mime)) return <a className="chat-image" href={fileUrl(file.id)} target="_blank" rel="noopener noreferrer" title={file.name}><img src={fileUrl(file.id)} alt={file.name} loading="lazy"/></a>;
  return <a className="chat-file" href={fileUrl(file.id)} target="_blank" rel="noopener noreferrer"><FileText/><span><b>{file.name}</b><small>{fileSize(file.size)}</small></span></a>;
}

function ThreadList({ threads, active, onOpen }: { threads: Thread[] | null; active: string; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState(""); const [found, setFound] = useState<ChatOrder[] | null>(null);
  useEffect(() => {
    if (!query.trim()) { setFound(null); return; }
    const timer = setTimeout(() => { productionApi<ChatOrder[]>(`/chat/orders?query=${encodeURIComponent(query.trim())}`).then(setFound).catch(() => setFound([])); }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  const pick = (id: string) => { setQuery(""); onOpen(id); };
  return <aside className="chat-threads">
    <label className="chat-search"><Search/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти заказ и написать" aria-label="Найти заказ"/>{query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery("")}><X/></button>}</label>
    <div className="chat-thread-list">
      {found ? (found.length ? found.map(order => <button key={order.id} type="button" className="chat-thread" onClick={() => pick(order.id)}><span className="chat-thread-top"><b>{order.productionOrderNumber}</b></span><small>{[order.customerOrderNumber && `заказ клиента ${order.customerOrderNumber}`, order.customer].filter(Boolean).join(" · ") || "Открыть переписку"}</small></button>) : <p className="chat-hint">Заказ не найден</p>)
        : !threads ? <p className="chat-hint">Загрузка…</p>
        : threads.length ? threads.map(thread => <button key={thread.order.id} type="button" className={`chat-thread ${thread.order.id === active ? "active" : ""} ${thread.unread ? "unread" : ""}`} onClick={() => pick(thread.order.id)}>
            <span className="chat-thread-top"><b>{thread.order.productionOrderNumber}</b><time>{threadTime(thread.last.createdAt)}</time></span>
            <small><i>{shortName(thread.last.author)}</i> {thread.last.text || (thread.last.files ? "📎 файл" : "")}</small>
            {(thread.unread > 0 || thread.mentioned) && <em className={thread.mentioned ? "mentioned" : ""}>{thread.mentioned ? "@" : ""}{thread.unread || ""}</em>}
          </button>)
        : <p className="chat-hint">Переписок пока нет. Найдите заказ по номеру — и напишите первым.</p>}
    </div>
  </aside>;
}

type Pending = { key: string; name: string; state: "uploading" | "ready" | "error"; file?: ChatFile; error?: string };

// перетаскивание ловит вся панель переписки, а загрузкой владеет поле ввода — отсюда dropRef
function Composer({ orderId, people, me, onSent, dropRef }: { orderId: string; people: Person[]; me: string; onSent: (message: Message) => void; dropRef: React.MutableRefObject<(files: File[]) => void> }) {
  const [text, setText] = useState(""); const [pending, setPending] = useState<Pending[]>([]); const [error, setError] = useState(""); const [sending, setSending] = useState(false);
  const [mention, setMention] = useState<{ start: number; query: string; index: number } | null>(null);
  const area = useRef<HTMLTextAreaElement>(null), picker = useRef<HTMLInputElement>(null);
  useEffect(() => { setText(""); setPending([]); setError(""); setMention(null); }, [orderId]);
  useLayoutEffect(() => { const node = area.current; if (!node) return; node.style.height = "auto"; node.style.height = `${Math.min(node.scrollHeight, 160)}px`; }, [text]);
  const suggestions = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    return people.filter(person => person.id !== me && !/\s/.test(person.login) && (`${person.login} ${person.firstName} ${person.lastName}`).toLowerCase().includes(query)).slice(0, 6);
  }, [mention, people, me]);

  async function upload(files: File[]) {
    setError("");
    for (const file of files) {
      const key = `${Date.now()}-${Math.random()}`;
      const name = /^image\.(png|jpe?g)$/i.test(file.name) ? `Снимок ${new Date().toLocaleString("ru-RU").replace(/[,:]/g, "-").replace(/\s/g, "")}.${file.name.split(".").pop()}` : file.name;
      if (file.size > MAX_FILE_BYTES) { setPending(list => [...list, { key, name, state: "error", error: "больше 10 МБ" }]); continue; }
      setPending(list => [...list, { key, name, state: "uploading" }]);
      try {
        const response = await fetch(`/api/chat/files?name=${encodeURIComponent(name)}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/octet-stream" }, body: file });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "не удалось загрузить");
        setPending(list => list.map(item => item.key === key ? { ...item, state: "ready", file: body as ChatFile } : item));
      } catch (problem) { setPending(list => list.map(item => item.key === key ? { ...item, state: "error", error: problem instanceof Error ? problem.message : "не удалось загрузить" } : item)); }
    }
  }
  useEffect(() => { dropRef.current = files => { void upload(files); }; });
  async function send() {
    const ready = pending.filter(item => item.state === "ready" && item.file);
    if (sending || pending.some(item => item.state === "uploading") || (!text.trim() && !ready.length)) return;
    setSending(true); setError("");
    try {
      onSent(await productionApi<Message>(`/chat/threads/${orderId}/messages`, { method: "POST", body: JSON.stringify({ text: text.trim(), fileIds: ready.map(item => item.file!.id) }) }));
      setText(""); setPending([]); setMention(null);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Сообщение не отправлено"); }
    finally { setSending(false); area.current?.focus(); }
  }
  function track(value: string, caret: number) {
    const match = /(?:^|[\s(])@([\p{L}\p{N}_.-]*)$/u.exec(value.slice(0, caret));
    setMention(match ? { start: caret - match[1].length - 1, query: match[1], index: 0 } : null);
  }
  function insert(person: Person) {
    if (!mention) return;
    const caret = area.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, mention.start)}@${person.login} ${text.slice(caret)}`;
    setText(next); setMention(null);
    requestAnimationFrame(() => { const position = mention.start + person.login.length + 2; area.current?.focus(); area.current?.setSelectionRange(position, position); });
  }
  function keyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && suggestions.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const step = event.key === "ArrowDown" ? 1 : -1; setMention({ ...mention, index: (mention.index + step + suggestions.length) % suggestions.length }); return; }
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); insert(suggestions[Math.min(mention.index, suggestions.length - 1)]); return; }
      if (event.key === "Escape") { setMention(null); return; }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  }
  return <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
    {mention && suggestions.length > 0 && <ul className="chat-suggest" role="listbox">{suggestions.map((person, index) => <li key={person.login} role="option" aria-selected={index === mention.index} className={index === mention.index ? "active" : ""} onMouseDown={event => { event.preventDefault(); insert(person); }}><b>@{person.login}</b> {person.firstName} {person.lastName}</li>)}</ul>}
    {pending.length > 0 && <div className="chat-pending">{pending.map(item => <span key={item.key} className={item.state}><Paperclip/>{item.name}{item.state === "uploading" && <i>загрузка…</i>}{item.state === "error" && <i>{item.error}</i>}<button type="button" aria-label={`Убрать ${item.name}`} onClick={() => setPending(list => list.filter(other => other.key !== item.key))}><X/></button></span>)}</div>}
    {error && <div className="chat-error">{error}</div>}
    <div className="chat-input-row">
      <button type="button" className="chat-attach" aria-label="Прикрепить файл" title="Прикрепить файл" onClick={() => picker.current?.click()}><Paperclip/></button>
      <input ref={picker} type="file" multiple hidden onChange={event => { void upload(Array.from(event.target.files ?? [])); event.target.value = ""; }}/>
      <textarea ref={area} rows={1} value={text} maxLength={2000} placeholder="Сообщение… @ — позвать человека" aria-label="Сообщение"
        onChange={event => { setText(event.target.value); track(event.target.value, event.target.selectionStart); }} onKeyDown={keyDown} onBlur={() => setTimeout(() => setMention(null), 150)}
        onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); void upload(files); } }}/>
      <button type="submit" className="chat-send" aria-label="Отправить" title="Отправить" disabled={sending}><Send/></button>
    </div>
  </form>;
}

function ThreadPane({ orderId, revision, onBack, onChanged }: { orderId: string; revision: number; onBack: () => void; onChanged: () => void }) {
  const [data, setData] = useState<ThreadData | null>(null); const [error, setError] = useState(""); const [dragging, setDragging] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const feed = useRef<HTMLDivElement>(null), marked = useRef(0), stick = useRef(true), dropFiles = useRef<(files: File[]) => void>(() => {});
  useEffect(() => { setData(null); setError(""); marked.current = 0; stick.current = true; }, [orderId]);
  useEffect(() => {
    let cancelled = false;
    productionApi<ThreadData>(`/chat/threads/${orderId}`).then(next => {
      if (cancelled) return;
      setData(next); setError("");
      const lastSeq = next.messages.at(-1)?.seq ?? 0;
      if (lastSeq > marked.current) { marked.current = lastSeq; productionApi(`/chat/threads/${orderId}/read`, { method: "POST" }).then(onChanged).catch(() => {}); }
    }).catch(problem => { if (!cancelled) setError(problem instanceof Error ? problem.message : "Переписка не загрузилась"); });
    return () => { cancelled = true; };
  }, [orderId, revision]);
  useLayoutEffect(() => { const node = feed.current; if (node && stick.current) node.scrollTop = node.scrollHeight; }, [data]);
  const logins = useMemo(() => new Set((data?.people ?? []).map(person => person.login.toLowerCase())), [data?.people]);
  if (error) return <section className="chat-pane"><header className="chat-pane-head"><button type="button" className="chat-back" aria-label="К списку переписок" onClick={onBack}><ArrowLeft/></button><h2>Чат</h2></header><p className="chat-hint">{error}</p></section>;
  if (!data) return <section className="chat-pane"><p className="chat-hint">Загрузка…</p></section>;
  const lastOwn = [...data.messages].reverse().find(message => message.author.id === data.me);
  const readers = lastOwn ? data.reads.filter(read => read.lastSeq >= lastOwn.seq).map(read => shortName(read.user)) : [];
  return <section className={`chat-pane ${dragging ? "dragging" : ""}`}
    onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
    onDrop={event => { event.preventDefault(); setDragging(false); const files = Array.from(event.dataTransfer.files); if (files.length) dropFiles.current(files); }}>
    <header className="chat-pane-head"><button type="button" className="chat-back" aria-label="К списку переписок" onClick={onBack}><ArrowLeft/></button><div><h2>Заказ {data.order.productionOrderNumber}</h2><small>{[data.order.customerOrderNumber && `заказ клиента ${data.order.customerOrderNumber}`, data.order.customer, data.order.archivedAt && "в архиве"].filter(Boolean).join(" · ") || "Переписка по заказу"}</small></div><button type="button" className="chat-files-button" aria-label="Чертежи и файлы заказа" title="Чертежи и файлы заказа" onClick={() => setShowFiles(true)}><FolderOpen/></button></header>
    {showFiles && <OrderFilesDialog orderId={data.order.id} title={`Заказ ${data.order.productionOrderNumber}`} onClose={() => setShowFiles(false)}/>}
    <div className="chat-feed" ref={feed} onLoadCapture={() => { const node = feed.current; if (node && stick.current) node.scrollTop = node.scrollHeight; }} onScroll={event => { const node = event.currentTarget; stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80; }}>
      {!data.messages.length && <p className="chat-hint">Сообщений пока нет. Напишите первым — фото и файлы можно перетащить прямо сюда.</p>}
      {data.messages.map((message, index) => {
        const previous = data.messages[index - 1], own = message.author.id === data.me;
        const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
        const grouped = !newDay && previous.author.id === message.author.id && new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60 * 1000;
        const seen = own && data.reads.some(read => read.lastSeq >= message.seq);
        return <React.Fragment key={message.id}>
          {newDay && <div className="chat-day"><span>{dayLabel(message.createdAt)}</span></div>}
          <article className={`chat-message ${own ? "own" : ""} ${grouped ? "grouped" : ""}`}>
            {!own && !grouped && <b className="chat-author">{message.author.firstName} {message.author.lastName}</b>}
            <div className="chat-bubble">
              {message.files.length > 0 && <div className="chat-files">{message.files.map(file => <Attachment key={file.id} file={file}/>)}</div>}
              {message.text && <p><RichText text={message.text} logins={logins}/></p>}
              <time>{clock(message.createdAt)}{own && (seen ? <CheckCheck aria-label="Прочитано"/> : <Check aria-label="Отправлено"/>)}</time>
            </div>
            {message.id === lastOwn?.id && readers.length > 0 && <small className="chat-readers">Прочитали: {readers.join(", ")}</small>}
          </article>
        </React.Fragment>;
      })}
    </div>
    <Composer orderId={orderId} people={data.people} me={data.me} dropRef={dropFiles} onSent={message => { stick.current = true; marked.current = Math.max(marked.current, message.seq); setData(current => current && !current.messages.some(item => item.id === message.id) ? { ...current, messages: [...current.messages, message] } : current); onChanged(); }}/>
    {dragging && <div className="chat-drop">Отпустите — файл прикрепится к сообщению</div>}
  </section>;
}

export function ChatScreen({ orderId, onOpen }: { orderId: string; onOpen: (orderId: string) => void }) {
  const revision = useChatEvents();
  const [threads, setThreads] = useState<Thread[] | null>(null); const [bump, setBump] = useState(0);
  useEffect(() => { productionApi<{ threads: Thread[] }>("/chat/threads").then(result => setThreads(result.threads)).catch(() => setThreads([])); }, [revision, bump]);
  return <div className={`content chat-screen ${orderId ? "has-thread" : ""}`}>
    <ThreadList threads={threads} active={orderId} onOpen={onOpen}/>
    {orderId ? <ThreadPane key={orderId} orderId={orderId} revision={revision} onBack={() => onOpen("")} onChanged={() => setBump(value => value + 1)}/> : <section className="chat-pane chat-empty"><MessageCircle/><p>Выберите переписку слева или найдите заказ по номеру</p></section>}
  </div>;
}
