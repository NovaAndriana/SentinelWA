'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { BookOpenCheck, KeyRound, Loader2, Terminal } from 'lucide-react';
import Link from 'next/link';

import 'swagger-ui-react/swagger-ui.css';
import { AppShell } from '@/components/shell/AppShell';

// Swagger UI touches `window` on import, so it can only be loaded client-side.
const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center gap-2 py-16 text-muted">
      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
      <span className="text-2xs uppercase tracking-[0.16em]">loading api explorer…</span>
    </div>
  ),
});

export default function DocsPage() {
  const [origin, setOrigin] = useState('');

  useEffect(() => setOrigin(window.location.origin), []);

  return (
    <AppShell
      title="API Explorer"
      subtitle="OpenAPI 3.0 · interactive contract for every internal gateway endpoint"
    >
      <div className="space-y-3 p-3 pb-8">
        <section className="panel reticle px-3 py-3">
          <div className="flex flex-wrap items-start gap-3">
            <BookOpenCheck className="mt-0.5 h-4 w-4 shrink-0 text-neon" strokeWidth={1.8} />
            <div className="min-w-0 flex-1">
              <h2 className="text-[12px] font-semibold text-[#e6f6ff]">
                Authorise before using “Try it out”
              </h2>
              <p className="mt-1 text-2xs leading-relaxed text-muted">
                Click <span className="text-neon-cyan">Authorize</span> below and paste an{' '}
                <span className="font-mono text-neon-cyan">x-api-key</span> issued from the
                credentials console. Requests fire against this gateway for real — in production
                that means messages actually leave for Meta, so use a key scoped to a test consumer
                or switch on simulation mode in the uplink settings first.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link href="/api-keys" className="btn btn-primary">
                  <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
                  issue a key
                </Link>
                <a href="/api/openapi" target="_blank" rel="noreferrer" className="btn btn-ghost">
                  <Terminal className="h-3.5 w-3.5" strokeWidth={2} />
                  raw openapi.json
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="panel swagger-soc overflow-hidden">
          <div className="panel-head">
            <span className="panel-title">
              <Terminal className="h-3.5 w-3.5" strokeWidth={1.6} />
              SentinelWA Internal Gateway
            </span>
            <span className="truncate text-2xs text-muted">{origin}</span>
          </div>
          <div className="px-1 py-1">
            <SwaggerUI
              url="/api/openapi"
              docExpansion="list"
              defaultModelsExpandDepth={-1}
              persistAuthorization
              tryItOutEnabled
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
