'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Radio,
  Save,
  Satellite,
  ShieldCheck,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const API_VERSIONS = ['v23.0', 'v22.0', 'v21.0', 'v20.0', 'v19.0'] as const;

interface HandshakeReport {
  ok: boolean;
  latencyMs: number;
  phoneNumber?: string;
  verifiedName?: string;
  qualityRating?: string;
  codeVerificationStatus?: string;
  platformType?: string;
  wabaName?: string;
  apiVersion: string;
  error?: string;
  mocked?: boolean;
}

type Form = {
  META_API_VERSION: string;
  META_ACCESS_TOKEN: string;
  META_PHONE_NUMBER_ID: string;
  META_WABA_ID: string;
  META_APP_SECRET: string;
  META_WEBHOOK_VERIFY_TOKEN: string;
  META_OTP_TEMPLATE_NAME: string;
  META_OTP_TEMPLATE_LANG: string;
  APP_PUBLIC_URL: string;
  GLOBAL_IP_WHITELIST: string;
  MOCK_META: string;
};

const EMPTY: Form = {
  META_API_VERSION: 'v21.0',
  META_ACCESS_TOKEN: '',
  META_PHONE_NUMBER_ID: '',
  META_WABA_ID: '',
  META_APP_SECRET: '',
  META_WEBHOOK_VERIFY_TOKEN: '',
  META_OTP_TEMPLATE_NAME: 'otp_verification',
  META_OTP_TEMPLATE_LANG: 'en_US',
  APP_PUBLIC_URL: '',
  GLOBAL_IP_WHITELIST: '',
  MOCK_META: 'false',
};

export function SettingsForm() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [gaps, setGaps] = useState<string[]>([]);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [handshaking, setHandshaking] = useState(false);
  const [report, setReport] = useState<HandshakeReport | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/console/settings', { cache: 'no-store' }).then((r) => r.json());
    if (res.ok) {
      // Secrets come back masked; the fields start blank and an empty submit
      // means "leave the stored value alone".
      setForm({
        ...EMPTY,
        ...res.settings,
        META_ACCESS_TOKEN: '',
        META_APP_SECRET: '',
        META_WEBHOOK_VERIFY_TOKEN: '',
      });
      setPresent(res.present ?? {});
      setGaps(res.gaps ?? []);
      setCallbackUrl(res.callbackUrl ?? '');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/console/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      }).then((r) => r.json());
      if (res.ok) {
        setGaps(res.gaps ?? []);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        await load();
      }
    } finally {
      setSaving(false);
    }
  };

  const handshake = async () => {
    setHandshaking(true);
    setReport(null);
    try {
      const res = await fetch('/api/console/settings/handshake', { method: 'POST' });
      const json = await res.json();
      setReport(json.report as HandshakeReport);
    } finally {
      setHandshaking(false);
    }
  };

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted">
        <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2} />
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-3 p-3 pb-6">
      {gaps.length > 0 && (
        <div className="panel border-warn/40 bg-warn/[0.06] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" strokeWidth={2} />
            <div>
              <p className="text-[12px] font-semibold text-warn">
                Uplink incomplete — {gaps.length} credential{gaps.length > 1 ? 's' : ''} missing
              </p>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                Until these are supplied the gateway accepts internal calls but cannot dispatch to
                Meta: <span className="font-mono text-warn/90">{gaps.join(', ')}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {/* ── Credentials ───────────────────────────────────────────────── */}
        <section className="panel reticle">
          <div className="panel-head">
            <span className="panel-title">
              <Satellite className="h-3.5 w-3.5" strokeWidth={1.6} />
              Cloud API Credentials
            </span>
          </div>
          <div className="space-y-3 px-3 py-3">
            <SecretField
              id="token"
              label="System User Permanent Access Token"
              hint="Business Settings → System Users → Generate token. Needs whatsapp_business_messaging + whatsapp_business_management."
              value={form.META_ACCESS_TOKEN}
              stored={present.META_ACCESS_TOKEN}
              onChange={set('META_ACCESS_TOKEN')}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="phone-id">
                  Phone Number ID
                </label>
                <input
                  id="phone-id"
                  value={form.META_PHONE_NUMBER_ID}
                  onChange={set('META_PHONE_NUMBER_ID')}
                  placeholder="109876543210987"
                  className="field"
                  inputMode="numeric"
                />
              </div>
              <div>
                <label className="label" htmlFor="waba-id">
                  Business Account ID (WABA)
                </label>
                <input
                  id="waba-id"
                  value={form.META_WABA_ID}
                  onChange={set('META_WABA_ID')}
                  placeholder="102938475610293"
                  className="field"
                  inputMode="numeric"
                />
              </div>
            </div>

            <SecretField
              id="app-secret"
              label="App Secret"
              hint="App Dashboard → Settings → Basic. Used to validate the x-hub-signature-256 on every webhook."
              value={form.META_APP_SECRET}
              stored={present.META_APP_SECRET}
              onChange={set('META_APP_SECRET')}
            />

            <div>
              <label className="label" htmlFor="api-version">
                Graph API Version
              </label>
              <select
                id="api-version"
                value={form.META_API_VERSION}
                onChange={set('META_API_VERSION')}
                className="field"
              >
                {API_VERSIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <p className="mt-0.5 text-2xs text-muted">
                Pin this to the version your templates were approved against.
              </p>
            </div>
          </div>
        </section>

        {/* ── Webhook ───────────────────────────────────────────────────── */}
        <section className="panel reticle">
          <div className="panel-head">
            <span className="panel-title">
              <Link2 className="h-3.5 w-3.5" strokeWidth={1.6} />
              Webhook Endpoint
            </span>
          </div>
          <div className="space-y-3 px-3 py-3">
            <div>
              <label className="label" htmlFor="public-url">
                Public HTTPS origin
              </label>
              <input
                id="public-url"
                value={form.APP_PUBLIC_URL}
                onChange={set('APP_PUBLIC_URL')}
                placeholder="https://wa-gateway.corp.example.com"
                className="field"
              />
              <p className="mt-0.5 text-2xs text-muted">
                The address Meta reaches — normally your Nginx reverse proxy, not the Node port.
              </p>
            </div>

            <CallbackUrlField url={callbackUrl} />

            <SecretField
              id="verify-token"
              label="Webhook Verify Token"
              hint="Any string you choose. Paste the identical value into the Meta App Dashboard callback form."
              value={form.META_WEBHOOK_VERIFY_TOKEN}
              stored={present.META_WEBHOOK_VERIFY_TOKEN}
              onChange={set('META_WEBHOOK_VERIFY_TOKEN')}
            />

            <div>
              <label className="label" htmlFor="global-ips">
                Global IP allowlist for /api/v1
              </label>
              <input
                id="global-ips"
                value={form.GLOBAL_IP_WHITELIST}
                onChange={set('GLOBAL_IP_WHITELIST')}
                placeholder="10.0.0.0/8, 192.168.0.0/16"
                className="field"
              />
              <p className="mt-0.5 text-2xs text-muted">
                Applied before per-key allowlists. Blank = any source. Note this is read from the
                environment at request time, so set <span className="font-mono">GLOBAL_IP_WHITELIST</span> in
                <span className="font-mono"> .env</span> for it to take effect on the gateway path.
              </p>
            </div>
          </div>
        </section>

        {/* ── Templates & mode ──────────────────────────────────────────── */}
        <section className="panel reticle">
          <div className="panel-head">
            <span className="panel-title">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.6} />
              Dispatch Defaults
            </span>
          </div>
          <div className="space-y-3 px-3 py-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="otp-template">
                  Default OTP template
                </label>
                <input
                  id="otp-template"
                  value={form.META_OTP_TEMPLATE_NAME}
                  onChange={set('META_OTP_TEMPLATE_NAME')}
                  placeholder="otp_verification"
                  className="field"
                />
              </div>
              <div>
                <label className="label" htmlFor="otp-lang">
                  Template language
                </label>
                <input
                  id="otp-lang"
                  value={form.META_OTP_TEMPLATE_LANG}
                  onChange={set('META_OTP_TEMPLATE_LANG')}
                  placeholder="en_US"
                  className="field"
                />
              </div>
            </div>

            <label
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-sm border px-2.5 py-2 transition-colors',
                form.MOCK_META === 'true'
                  ? 'border-warn/40 bg-warn/[0.07]'
                  : 'border-edge bg-white/[0.01]',
              )}
            >
              <input
                type="checkbox"
                checked={form.MOCK_META === 'true'}
                onChange={(e) => setForm((f) => ({ ...f, MOCK_META: e.target.checked ? 'true' : 'false' }))}
                className="mt-0.5 h-3 w-3 accent-[#ffb020]"
              />
              <span>
                <span className="block text-[11px] font-semibold text-[#dceaf5]">
                  Simulation mode
                </span>
                <span className="block text-2xs text-muted">
                  Dispatches are acknowledged locally with a synthetic wamid and no packet leaves the
                  host. Use it for drills and offline development.
                </span>
              </span>
            </label>
          </div>
        </section>

        {/* ── Handshake ─────────────────────────────────────────────────── */}
        <section className="panel reticle">
          <div className="panel-head">
            <span className="panel-title">
              <Radio className="h-3.5 w-3.5" strokeWidth={1.6} />
              Connection Test
            </span>
          </div>
          <div className="space-y-3 px-3 py-3">
            <p className="text-2xs leading-relaxed text-muted">
              Runs <span className="font-mono text-neon-cyan">GET /{form.META_API_VERSION}/{'{phone-number-id}'}</span> against
              Meta with the stored token. A pass also resets an open circuit breaker.
              Save first — the handshake reads persisted values.
            </p>

            <button
              type="button"
              onClick={handshake}
              disabled={handshaking}
              className="btn btn-primary w-full"
            >
              {handshaking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
              ) : (
                <Radio className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              execute handshake
            </button>

            {report && <HandshakeResult report={report} />}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-edge bg-void-900/90 px-1 py-2 backdrop-blur">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : saved ? (
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
          ) : (
            <Save className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {saved ? 'saved' : 'persist configuration'}
        </button>
        <p className="text-2xs text-muted">
          Secrets are encrypted with AES-256-GCM before they touch the database.
        </p>
      </div>
    </form>
  );
}

function SecretField({
  id,
  label,
  hint,
  value,
  stored,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  stored?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="label" htmlFor={id}>
          {label}
        </label>
        {stored && <span className="chip chip-ok mb-1">stored</span>}
      </div>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={stored ? 'unchanged — type to replace' : 'paste value'}
          autoComplete="off"
          className="field pr-9"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-neon-cyan"
          aria-label={visible ? 'Hide value' : 'Reveal value'}
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" strokeWidth={1.8} /> : <Eye className="h-3.5 w-3.5" strokeWidth={1.8} />}
        </button>
      </div>
      <p className="mt-0.5 text-2xs leading-relaxed text-muted">{hint}</p>
    </div>
  );
}

function CallbackUrlField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <span className="label">Callback URL for the Meta App Dashboard</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 select-all overflow-x-auto rounded-sm border border-edge bg-void-900 px-2 py-1.5 font-mono text-[11px] text-neon-cyan">
          {url || 'set the public origin above'}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* clipboard blocked */
            }
          }}
          disabled={!url}
          className="btn btn-ghost shrink-0"
        >
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}

function HandshakeResult({ report }: { report: HandshakeReport }) {
  if (!report.ok) {
    return (
      <div className="rounded-sm border border-crit/40 bg-crit/[0.07] px-2.5 py-2">
        <p className="text-[11px] font-semibold text-crit">handshake failed</p>
        <p className="mt-0.5 break-words text-2xs text-muted-foreground">{report.error}</p>
      </div>
    );
  }

  const rows: Array<[string, string | undefined]> = [
    ['Display number', report.phoneNumber],
    ['Verified name', report.verifiedName],
    ['Quality rating', report.qualityRating],
    ['Verification', report.codeVerificationStatus],
    ['Platform', report.platformType],
    ['WABA', report.wabaName],
    ['Graph version', report.apiVersion],
    ['Round trip', `${report.latencyMs} ms`],
  ];

  return (
    <div className="rounded-sm border border-neon/40 bg-neon/[0.06] px-2.5 py-2">
      <p className="text-[11px] font-semibold text-neon">
        handshake ok{report.mocked ? ' (simulation mode)' : ''}
      </p>
      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
        {rows
          .filter(([, v]) => Boolean(v))
          .map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="truncate text-2xs uppercase tracking-[0.12em] text-muted">{k}</dt>
              <dd className="truncate font-mono text-[11px] text-[#dceaf5]">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
