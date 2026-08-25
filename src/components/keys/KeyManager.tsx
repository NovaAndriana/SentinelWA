'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldOff,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

import { cn, relativeTime } from '@/lib/utils';

const SCOPES = [
  { id: 'otp.send', label: 'otp.send', hint: 'POST /api/v1/send-otp' },
  { id: 'message.send', label: 'message.send', hint: 'POST /api/v1/send-message' },
  { id: 'status.read', label: 'status.read', hint: 'GET /api/v1/status/{id}' },
  { id: 'health.read', label: 'health.read', hint: 'GET /api/v1/health' },
] as const;

interface KeyRow {
  id: string;
  name: string;
  description: string | null;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  ipWhitelist: string;
  active: boolean;
  requestCount: number;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export function KeyManager() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<{ key: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    scopes: new Set<string>(['otp.send', 'message.send', 'status.read']),
    rateLimitPerMin: 120,
    ipWhitelist: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/console/keys', { cache: 'no-store' }).then((r) => r.json());
    if (res.ok) setKeys(res.keys);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/console/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          scopes: [...form.scopes],
          rateLimitPerMin: Number(form.rateLimitPerMin),
          ipWhitelist: form.ipWhitelist,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not issue the key.');
        return;
      }
      setIssued({ key: json.key, name: form.name });
      setForm((f) => ({ ...f, name: '', description: '', ipWhitelist: '' }));
      await load();
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (row: KeyRow) => {
    await fetch(`/api/console/keys/${row.id}`, { method: 'DELETE' });
    await load();
  };

  const reinstate = async (row: KeyRow) => {
    await fetch(`/api/console/keys/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true }),
    });
    await load();
  };

  const purge = async (row: KeyRow) => {
    await fetch(`/api/console/keys/${row.id}?purge=true`, { method: 'DELETE' });
    await load();
  };

  return (
    <div className="space-y-3 p-3 pb-6">
      {issued && <IssuedKeyBanner issued={issued} onDismiss={() => setIssued(null)} />}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[380px_1fr]">
        {/* ── Issue form ───────────────────────────────────────────────── */}
        <section className="panel reticle self-start">
          <div className="panel-head">
            <span className="panel-title">
              <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
              Issue Credential
            </span>
          </div>
          <form onSubmit={submit} className="space-y-3 px-3 py-3">
            <div>
              <label className="label" htmlFor="key-name">
                Consumer name
              </label>
              <input
                id="key-name"
                required
                minLength={2}
                maxLength={60}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="hris-payroll-service"
                className="field"
              />
            </div>

            <div>
              <label className="label" htmlFor="key-desc">
                Purpose <span className="normal-case tracking-normal text-muted/60">(optional)</span>
              </label>
              <input
                id="key-desc"
                maxLength={240}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Login OTP for the payroll portal"
                className="field"
              />
            </div>

            <fieldset>
              <legend className="label">Scopes</legend>
              <div className="space-y-1">
                {SCOPES.map((scope) => {
                  const checked = form.scopes.has(scope.id);
                  return (
                    <label
                      key={scope.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-sm border px-2 py-1.5 transition-colors',
                        checked
                          ? 'border-neon/40 bg-neon/[0.07]'
                          : 'border-edge bg-white/[0.01] hover:border-neon-cyan/30',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setForm((f) => {
                            const next = new Set(f.scopes);
                            if (next.has(scope.id)) next.delete(scope.id);
                            else next.add(scope.id);
                            return { ...f, scopes: next };
                          })
                        }
                        className="h-3 w-3 accent-[#00ff9d]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-semibold text-[#dceaf5]">{scope.label}</span>
                        <span className="block truncate text-2xs text-muted">{scope.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label" htmlFor="key-rate">
                  Rate limit
                </label>
                <input
                  id="key-rate"
                  type="number"
                  min={1}
                  max={100000}
                  value={form.rateLimitPerMin}
                  onChange={(e) => setForm((f) => ({ ...f, rateLimitPerMin: Number(e.target.value) }))}
                  className="field"
                />
                <p className="mt-0.5 text-2xs text-muted">requests / minute</p>
              </div>
              <div>
                <label className="label" htmlFor="key-ips">
                  IP allowlist
                </label>
                <input
                  id="key-ips"
                  value={form.ipWhitelist}
                  onChange={(e) => setForm((f) => ({ ...f, ipWhitelist: e.target.value }))}
                  placeholder="10.20.0.0/16, 192.168.1.44"
                  className="field"
                />
                <p className="mt-0.5 text-2xs text-muted">blank = any source</p>
              </div>
            </div>

            {error && <p className="chip chip-crit w-full justify-start">{error}</p>}

            <button type="submit" disabled={creating || form.scopes.size === 0} className="btn btn-primary w-full">
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              generate key
            </button>
            <p className="text-2xs leading-relaxed text-muted">
              The plaintext key is displayed once and never stored — only a SHA-256 digest is kept.
              Lose it and you issue a new one.
            </p>
          </form>
        </section>

        {/* ── Existing keys ────────────────────────────────────────────── */}
        <section className="panel reticle min-w-0">
          <div className="panel-head">
            <span className="panel-title">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.6} />
              Issued Credentials
            </span>
            <span className="text-2xs text-muted">{keys.length} total</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            </div>
          ) : keys.length === 0 ? (
            <p className="px-3 py-10 text-center text-2xs text-muted">
              No credentials issued yet. Every internal service that calls the gateway needs its own
              key, so revoking one never takes the others down.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[11px]">
                <thead>
                  <tr className="border-b border-edge/70 text-2xs uppercase tracking-[0.14em] text-muted">
                    <th className="px-3 py-2 text-left font-semibold">Consumer</th>
                    <th className="px-3 py-2 text-left font-semibold">Scopes</th>
                    <th className="px-3 py-2 text-right font-semibold">Limit</th>
                    <th className="px-3 py-2 text-right font-semibold">Calls</th>
                    <th className="px-3 py-2 text-left font-semibold">Last used</th>
                    <th className="px-3 py-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((row) => (
                    <tr key={row.id} className="border-b border-edge/40 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className={cn('chip', row.active ? 'chip-ok' : 'chip-crit')}>
                            {row.active ? 'active' : 'revoked'}
                          </span>
                          <span className="font-semibold text-[#dceaf5]">{row.name}</span>
                        </div>
                        <div className="mt-0.5 font-mono text-2xs text-muted">
                          {row.keyPrefix}
                          <span className="opacity-50">…</span>
                        </div>
                        {row.description && (
                          <div className="mt-0.5 max-w-[240px] truncate text-2xs text-muted/70">
                            {row.description}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {row.scopes.map((s) => (
                            <span key={s} className="chip chip-idle">
                              {s}
                            </span>
                          ))}
                        </div>
                        {row.ipWhitelist && (
                          <div className="mt-1 truncate text-2xs text-muted">ip: {row.ipWhitelist}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                        {row.rateLimitPerMin}/m
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-[#dceaf5]">
                        {row.requestCount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {relativeTime(row.lastUsedAt)}
                        {row.lastUsedIp && (
                          <div className="text-2xs text-muted/60">{row.lastUsedIp}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          {row.active ? (
                            <button onClick={() => revoke(row)} className="btn btn-danger" title="Revoke this key">
                              <ShieldOff className="h-3 w-3" strokeWidth={2} />
                              revoke
                            </button>
                          ) : (
                            <>
                              <button onClick={() => reinstate(row)} className="btn btn-ghost" title="Re-enable">
                                <ShieldCheck className="h-3 w-3" strokeWidth={2} />
                                enable
                              </button>
                              <button onClick={() => purge(row)} className="btn btn-danger" title="Delete permanently">
                                <Trash2 className="h-3 w-3" strokeWidth={2} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function IssuedKeyBanner({
  issued,
  onDismiss,
}: {
  issued: { key: string; name: string };
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the value is selectable on screen */
    }
  };

  return (
    <div className="panel reticle border-neon/40 bg-neon/[0.06] px-3 py-3 shadow-neon">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-neon" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-neon">
            Key issued for “{issued.name}” — copy it now
          </p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            This is the only time the plaintext value is shown. Store it in your service&apos;s secret
            manager, then send it as the <code className="text-neon-cyan">x-api-key</code> header.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all overflow-x-auto rounded-sm border border-edge bg-void-900 px-2 py-1.5 font-mono text-[11px] text-neon-cyan">
              {issued.key}
            </code>
            <button onClick={copy} className="btn btn-primary shrink-0">
              {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
              {copied ? 'copied' : 'copy'}
            </button>
          </div>
        </div>
        <button onClick={onDismiss} className="btn btn-ghost shrink-0" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
