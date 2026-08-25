'use client';

import { useEffect } from 'react';
import { AlertOctagon } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[sentinelwa] render error', error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <AlertOctagon className="h-10 w-10 text-crit" strokeWidth={1.2} />
      <p className="text-[13px] font-semibold text-crit">Console fault</p>
      <p className="max-w-md text-2xs leading-relaxed text-muted">
        {error.message || 'An unexpected error interrupted this view.'}
        {error.digest && <span className="block mt-1 font-mono opacity-60">digest {error.digest}</span>}
      </p>
      <button onClick={reset} className="btn btn-primary">
        retry
      </button>
    </main>
  );
}
