'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCheck,
  Clock,
  Command,
  Loader2,
  MessageSquareDashed,
  Radio,
  Search,
  Send,
  ShieldCheck,
  Timer,
  User,
  Zap,
} from 'lucide-react';

import { useStream } from '@/components/StreamProvider';
import { cn, duration, relativeTime } from '@/lib/utils';

interface ContactRow {
  id: string;
  waId: string;
  name: string;
  profileName: string | null;
  optIn: boolean;
  blocked: boolean;
  note: string | null;
  unreadCount: number;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  windowExpiresAt: string | null;
  preview: { body: string; direction: string; createdAt: string; status: string; channel: string } | null;
}

interface ThreadMessage {
  id: string;
  wamid: string | null;
  direction: string;
  channel: string;
  body: string;
  status: string;
  source: string;
  templateName: string | null;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
}

interface ThreadDetail {
  contact: ContactRow & { windowOpen: boolean; counts: Record<string, number>; createdAt: string };
  messages: ThreadMessage[];
}

interface Canned {
  id: string;
  shortcut: string;
  title: string;
  body: string;
}

export function CommandCenter() {
  const { messages: liveMessages } = useStream();

  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [canned, setCanned] = useState<Canned[]>([]);

  const loadContacts = useCallback(async () => {
    const res = await fetch('/api/console/contacts', { cache: 'no-store' }).then((r) => r.json());
    if (res.ok) setContacts(res.contacts as ContactRow[]);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/console/contacts/${id}`, { cache: 'no-store' }).then((r) => r.json());
      if (res.ok) setThread(res as ThreadDetail);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    void loadContacts();
    void fetch('/api/console/canned', { cache: 'no-store' })
      .then((r) => r.json())
      .then((r) => r.ok && setCanned(r.responses as Canned[]))
      .catch(() => undefined);
  }, [loadContacts]);

  useEffect(() => {
    if (activeId) void loadThread(activeId);
  }, [activeId, loadThread]);

  // A live frame for the open thread appends immediately; anything else just
  // refreshes the triage list so the unread markers stay honest.
  useEffect(() => {
    if (!liveMessages.length) return;
    const latest = liveMessages[0]!;
    void loadContacts();
    if (activeId && latest.contactId === activeId) void loadThread(activeId);
  }, [liveMessages, activeId, loadContacts, loadThread]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.waId.includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.preview?.body ?? '').toLowerCase().includes(q),
    );
  }, [contacts, query]);

  return (
    <div className="grid min-h-0 w-full flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_290px]">
      <ContactList
        contacts={filtered}
        query={query}
        onQuery={setQuery}
        activeId={activeId}
        onSelect={setActiveId}
      />

      <ChatWindow
        thread={thread}
        loading={loadingThread}
        canned={canned}
        onSent={async () => {
          if (activeId) await loadThread(activeId);
          await loadContacts();
        }}
      />

      <Inspector thread={thread} canned={canned} />
    </div>
  );
}

/* ── Column 1 · triage ────────────────────────────────────────────────────── */

function ContactList({
  contacts,
  query,
  onQuery,
  activeId,
  onSelect,
}: {
  contacts: ContactRow[];
  query: string;
  onQuery: (v: string) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const unread = contacts.reduce((n, c) => n + c.unreadCount, 0);

  return (
    <aside className="flex min-h-0 flex-col border-r border-edge bg-void-900/50">
      <div className="border-b border-edge px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="panel-title">
            <Radio className="h-3.5 w-3.5" strokeWidth={1.6} />
            Triage
          </span>
          {unread > 0 && <span className="chip chip-crit">{unread} unread</span>}
        </div>
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted" strokeWidth={1.6} />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="number, name or text…"
            className="field pl-7"
            aria-label="Search conversations"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {contacts.length === 0 ? (
          <p className="px-3 py-8 text-center text-2xs leading-relaxed text-muted">
            No conversations yet. A contact appears here the first time they message the business
            number, or the first time the gateway dispatches to them.
          </p>
        ) : (
          contacts.map((c) => {
            const open = c.windowExpiresAt ? new Date(c.windowExpiresAt).getTime() > Date.now() : false;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  'block w-full border-b border-edge/40 px-3 py-2 text-left transition-colors',
                  activeId === c.id ? 'bg-neon/[0.08]' : 'hover:bg-white/[0.03]',
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                      open ? 'bg-neon' : 'bg-muted/50',
                    )}
                    title={open ? 'Service window open' : 'Service window closed'}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#dceaf5]">
                    {c.name}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="chip chip-crit shrink-0">{c.unreadCount}</span>
                  )}
                </div>
                <div className="mt-0.5 truncate font-mono text-2xs text-muted">+{c.waId}</div>
                {c.preview && (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-2xs text-muted/60">
                      {c.preview.direction === 'inbound' ? '←' : '→'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-2xs text-muted">
                      {c.preview.body}
                    </span>
                    <span className="shrink-0 text-2xs text-muted/50">
                      {relativeTime(c.preview.createdAt)}
                    </span>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

/* ── Column 2 · conversation ──────────────────────────────────────────────── */

function ChatWindow({
  thread,
  loading,
  canned,
  onSent,
}: {
  thread: ThreadDetail | null;
  loading: boolean;
  canned: Canned[];
  onSent: () => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [macroOpen, setMacroOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.messages.length]);

  // Ctrl/Cmd+K opens the macro palette from anywhere in the pane.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setMacroOpen((o) => !o);
      }
      if (e.key === 'Escape') setMacroOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const windowOpen = thread?.contact.windowOpen ?? false;

  const send = async () => {
    if (!thread || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/console/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: thread.contact.waId, message: draft.trim(), type: 'text' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Send failed.');
        return;
      }
      setDraft('');
      await onSent();
    } finally {
      setSending(false);
    }
  };

  const applyMacro = (body: string) => {
    setDraft((d) => (d ? `${d} ${body}` : body));
    setMacroOpen(false);
    input.current?.focus();
  };

  // Typing "/shortcut " expands the macro inline.
  const onDraftChange = (value: string) => {
    const match = value.match(/^(\/[a-z0-9-]+)\s$/i);
    const macro = match ? canned.find((c) => c.shortcut === match[1]!.toLowerCase()) : null;
    setDraft(macro ? macro.body : value);
  };

  if (!thread) {
    return (
      <section className="flex min-h-0 flex-col items-center justify-center gap-2 px-6 text-center">
        <MessageSquareDashed className="h-8 w-8 text-muted/40" strokeWidth={1.2} />
        <p className="text-[12px] font-semibold text-muted-foreground">No conversation selected</p>
        <p className="max-w-sm text-2xs leading-relaxed text-muted">
          Pick a contact from the triage column. Free-form replies are only deliverable inside the
          24-hour customer service window that an inbound message opens.
        </p>
      </section>
    );
  }

  return (
    <section className="relative flex min-h-0 flex-col border-r border-edge">
      <header className="flex items-center gap-2 border-b border-edge px-3 py-2">
        <User className="h-4 w-4 text-neon-cyan" strokeWidth={1.6} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-[#e6f6ff]">{thread.contact.name}</p>
          <p className="truncate font-mono text-2xs text-muted">+{thread.contact.waId}</p>
        </div>
        <WindowBadge expiresAt={thread.contact.windowExpiresAt} open={windowOpen} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex justify-center py-8 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          </div>
        ) : (
          thread.messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
        <div ref={bottom} />
      </div>

      {macroOpen && <MacroPalette canned={canned} onPick={applyMacro} onClose={() => setMacroOpen(false)} />}

      <footer className="border-t border-edge px-3 py-2">
        {!windowOpen && (
          <p className="mb-2 flex items-start gap-1.5 text-2xs text-warn">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2} />
            The 24-hour service window has closed. Meta will reject free-form text — reach this
            contact with an approved template through{' '}
            <span className="font-mono">POST /api/v1/send-message</span>.
          </p>
        )}

        {error && <p className="chip chip-crit mb-2 w-full justify-start">{error}</p>}

        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            rows={2}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={!windowOpen || sending}
            placeholder={
              windowOpen
                ? 'Reply…  Enter to send · Shift+Enter for a newline · /shortcut or Ctrl+K for macros'
                : 'Service window closed'
            }
            className="field min-h-[52px] flex-1 resize-none"
          />
          <button
            type="button"
            onClick={() => setMacroOpen((o) => !o)}
            className="btn btn-ghost h-[52px]"
            title="Canned responses (Ctrl+K)"
          >
            <Command className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
          <button
            onClick={() => void send()}
            disabled={!windowOpen || sending || !draft.trim()}
            className="btn btn-primary h-[52px]"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <Send className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            send
          </button>
        </div>
      </footer>
    </section>
  );
}

function WindowBadge({ expiresAt, open }: { expiresAt: string | null; open: boolean }) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const tick = () =>
      setLeft(expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0);
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (!expiresAt) return <span className="chip chip-idle">no inbound yet</span>;

  return (
    <span className={cn('chip', open ? (left < 3_600_000 ? 'chip-warn' : 'chip-ok') : 'chip-crit')}>
      <Timer className="h-3 w-3" strokeWidth={2} />
      {open ? duration(Math.floor(left / 1000)) : 'window closed'}
    </span>
  );
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  queued: <Clock className="h-3 w-3" strokeWidth={2} />,
  sent: <CheckCheck className="h-3 w-3 opacity-50" strokeWidth={2} />,
  delivered: <CheckCheck className="h-3 w-3" strokeWidth={2} />,
  read: <CheckCheck className="h-3 w-3 text-neon-cyan" strokeWidth={2} />,
  failed: <AlertTriangle className="h-3 w-3 text-crit" strokeWidth={2} />,
};

function Bubble({ message }: { message: ThreadMessage }) {
  const inbound = message.direction === 'inbound';

  return (
    <div className={cn('mb-2 flex', inbound ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[76%] rounded-md border px-2.5 py-1.5',
          inbound
            ? 'border-edge bg-void-700/80'
            : message.status === 'failed'
              ? 'border-crit/40 bg-crit/[0.08]'
              : 'border-neon/25 bg-neon/[0.06]',
        )}
      >
        {message.templateName && (
          <div className="mb-1 flex items-center gap-1 text-2xs text-neon-cyan">
            <ShieldCheck className="h-3 w-3" strokeWidth={2} />
            template · {message.templateName}
          </div>
        )}
        <p className="whitespace-pre-wrap break-words text-[12px] text-[#dbe9f4]">{message.body}</p>
        {message.errorMessage && (
          <p className="mt-1 text-2xs text-crit">{message.errorMessage}</p>
        )}
        <div className="mt-1 flex items-center justify-end gap-1.5 text-2xs text-muted">
          <span>{new Date(message.createdAt).toTimeString().slice(0, 5)}</span>
          {!inbound && (
            <>
              <span className="opacity-40">·</span>
              <span className="flex items-center gap-1">
                {STATUS_ICON[message.status] ?? null}
                {message.status}
              </span>
            </>
          )}
          {message.source === 'api' && <span className="chip chip-idle">api</span>}
        </div>
      </div>
    </div>
  );
}

function MacroPalette({
  canned,
  onPick,
  onClose,
}: {
  canned: Canned[];
  onPick: (body: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-x-3 bottom-[86px] z-10 panel reticle max-h-[240px] overflow-y-auto shadow-cyan">
      <div className="panel-head sticky top-0 bg-void-700">
        <span className="panel-title">
          <Zap className="h-3.5 w-3.5" strokeWidth={1.6} />
          Quick responses
        </span>
        <button onClick={onClose} className="text-2xs text-muted hover:text-neon-cyan">
          esc
        </button>
      </div>
      {canned.length === 0 ? (
        <p className="px-3 py-4 text-center text-2xs text-muted">
          No macros defined. Add them from the inspector panel — each gets a{' '}
          <span className="font-mono">/shortcut</span> that expands as you type.
        </p>
      ) : (
        <ul>
          {canned.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onPick(c.body)}
                className="block w-full border-b border-edge/40 px-3 py-2 text-left last:border-0 hover:bg-white/[0.04]"
              >
                <div className="flex items-center gap-2">
                  <span className="chip chip-info">{c.shortcut}</span>
                  <span className="truncate text-[11px] font-semibold text-[#dceaf5]">{c.title}</span>
                </div>
                <p className="mt-0.5 truncate text-2xs text-muted">{c.body}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Column 3 · inspector ─────────────────────────────────────────────────── */

function Inspector({ thread, canned }: { thread: ThreadDetail | null; canned: Canned[] }) {
  const [macros, setMacros] = useState<Canned[]>(canned);
  const [form, setForm] = useState({ shortcut: '/', title: '', body: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => setMacros(canned), [canned]);

  const addMacro = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/console/canned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const list = await fetch('/api/console/canned').then((r) => r.json());
        if (list.ok) setMacros(list.responses);
        setForm({ shortcut: '/', title: '', body: '' });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-edge bg-void-900/50 xl:flex">
      {thread ? (
        <section className="border-b border-edge px-3 py-3">
          <h2 className="panel-title mb-2">
            <User className="h-3.5 w-3.5" strokeWidth={1.6} />
            Contact
          </h2>
          <dl className="space-y-1.5">
            <Row label="WhatsApp ID" value={`+${thread.contact.waId}`} mono />
            <Row label="Profile name" value={thread.contact.profileName ?? '—'} />
            <Row
              label="Opt-in"
              value={thread.contact.optIn ? 'granted (inbound received)' : 'not established'}
            />
            <Row label="First seen" value={relativeTime(thread.contact.createdAt)} />
            <Row label="Last inbound" value={relativeTime(thread.contact.lastInboundAt)} />
            <Row label="Last outbound" value={relativeTime(thread.contact.lastOutboundAt)} />
            <Row
              label="Service window"
              value={
                thread.contact.windowExpiresAt
                  ? `${thread.contact.windowOpen ? 'expires' : 'expired'} ${relativeTime(thread.contact.windowExpiresAt)}`
                  : 'never opened'
              }
            />
            <Row
              label="Volume"
              value={`${thread.contact.counts.inbound ?? 0} in · ${thread.contact.counts.outbound ?? 0} out`}
            />
          </dl>
        </section>
      ) : (
        <section className="border-b border-edge px-3 py-3">
          <p className="text-2xs text-muted">Select a conversation to inspect its metadata.</p>
        </section>
      )}

      <section className="px-3 py-3">
        <h2 className="panel-title mb-2">
          <Zap className="h-3.5 w-3.5" strokeWidth={1.6} />
          Quick responses
        </h2>

        <ul className="mb-3 space-y-1">
          {macros.length === 0 && (
            <li className="text-2xs text-muted">
              None yet. A macro is recalled by typing its shortcut followed by a space.
            </li>
          )}
          {macros.map((m) => (
            <li key={m.id} className="rounded-sm border border-edge/60 bg-white/[0.015] px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="chip chip-info">{m.shortcut}</span>
                <span className="truncate text-[11px] text-[#dceaf5]">{m.title}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-2xs text-muted">{m.body}</p>
            </li>
          ))}
        </ul>

        <form onSubmit={addMacro} className="space-y-2">
          <input
            required
            pattern="/[a-z0-9-]+"
            value={form.shortcut}
            onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value.toLowerCase() }))}
            placeholder="/greeting"
            className="field"
            aria-label="Macro shortcut"
          />
          <input
            required
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Opening greeting"
            className="field"
            aria-label="Macro title"
          />
          <textarea
            required
            rows={3}
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="Hi! You're through to the service desk. How can I help?"
            className="field resize-none"
            aria-label="Macro body"
          />
          <button type="submit" disabled={busy} className="btn btn-ghost w-full">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : null}
            save macro
          </button>
        </form>
      </section>
    </aside>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-2xs uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className={cn('min-w-0 truncate text-right text-[11px] text-[#dceaf5]', mono && 'font-mono')}>
        {value}
      </dd>
    </div>
  );
}
