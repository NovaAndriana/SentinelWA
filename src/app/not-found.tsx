import Link from 'next/link';
import { RadioTower } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <RadioTower className="h-10 w-10 text-muted/40" strokeWidth={1.2} />
      <p className="font-mono text-2xl font-bold text-crit glow-text">404</p>
      <p className="text-[12px] text-muted-foreground">No route matches that path on this gateway.</p>
      <Link href="/" className="btn btn-primary">
        return to soc overview
      </Link>
    </main>
  );
}
