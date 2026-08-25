'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/console/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Authentication failed.');
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="panel reticle scanlines w-full max-w-sm overflow-hidden">
        <div className="border-b border-edge px-4 py-4 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-neon animate-pulse-glow" strokeWidth={1.4} />
          <h1 className="mt-2 text-[15px] font-bold tracking-[0.24em] text-neon glow-text">
            SENTINEL<span className="text-neon-cyan">WA</span>
          </h1>
          <p className="mt-0.5 text-2xs uppercase tracking-[0.18em] text-muted">
            operator console · restricted
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3 px-4 py-4">
          <div>
            <label className="label" htmlFor="password">
              Console password
            </label>
            <div className="relative">
              <LockKeyhole
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                strokeWidth={1.6}
              />
              <input
                id="password"
                type="password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field pl-7"
                placeholder="••••••••••••"
              />
            </div>
          </div>

          {error && <p className="chip chip-crit w-full justify-start">{error}</p>}

          <button type="submit" disabled={busy} className="btn btn-primary w-full">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            authenticate
          </button>

          <p className="text-2xs leading-relaxed text-muted">
            Set <span className="font-mono text-neon-cyan">CONSOLE_PASSWORD</span> in{' '}
            <span className="font-mono">.env</span> to enable this gate. Leaving it blank disables
            the login entirely — only appropriate on an isolated management network.
          </p>
        </form>
      </div>
    </main>
  );
}
