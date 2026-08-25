'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LogOut,
  MessagesSquare,
  Radar,
  Settings2,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'SOC Overview', icon: Radar, hint: 'Health matrix & telemetry' },
  { href: '/chat', label: 'Command Center', icon: MessagesSquare, hint: 'Live agent inbox' },
  { href: '/api-keys', label: 'API Keys', icon: KeyRound, hint: 'Internal gateway credentials' },
  { href: '/docs', label: 'API Explorer', icon: TerminalSquare, hint: 'OpenAPI 3.0 / try it out' },
  { href: '/settings', label: 'Meta Uplink', icon: Settings2, hint: 'Cloud API credentials' },
] as const;

const STORAGE_KEY = 'sentinelwa:sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Read the stored preference after mount so server and client markup match.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* storage blocked — keep the default */
    }
    setMounted(true);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* non-fatal */
      }
      return next;
    });
  };

  return (
    <aside
      className={cn(
        'relative z-20 flex shrink-0 flex-col border-r border-edge bg-void-900/80 backdrop-blur transition-[width] duration-200',
        collapsed ? 'w-[62px]' : 'w-[224px]',
      )}
    >
      <div className="flex h-12 items-center gap-2 border-b border-edge px-3">
        <ShieldCheck className="h-5 w-5 shrink-0 text-neon animate-pulse-glow" strokeWidth={1.6} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold tracking-[0.22em] text-neon glow-text">
              SENTINEL<span className="text-neon-cyan">WA</span>
            </div>
            <div className="truncate text-2xs uppercase tracking-[0.18em] text-muted">
              wa gateway soc
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-2 no-scrollbar">
        {NAV.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? `${item.label} — ${item.hint}` : undefined}
              className={cn(
                'group relative mx-2 mb-1 flex items-center gap-3 rounded-sm px-2.5 py-2 transition-colors',
                active
                  ? 'bg-neon/10 text-neon'
                  : 'text-muted-foreground hover:bg-white/[0.03] hover:text-neon-cyan',
              )}
            >
              {active && (
                <span className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-neon shadow-neon" />
              )}
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold tracking-wide">
                    {item.label}
                  </span>
                  <span className="block truncate text-2xs text-muted">{item.hint}</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-edge p-2">
        <form action="/api/console/logout" method="post" onSubmit={handleLogout}>
          <button
            type="submit"
            title="End operator session"
            className="flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-muted-foreground transition-colors hover:bg-crit/10 hover:text-crit"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.6} />
            {!collapsed && <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">Sign out</span>}
          </button>
        </form>

        <button
          onClick={toggle}
          className="mt-1 flex w-full items-center gap-3 rounded-sm px-2.5 py-2 text-muted transition-colors hover:bg-white/[0.03] hover:text-neon-cyan"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" strokeWidth={1.6} />
          ) : (
            <ChevronLeft className="h-4 w-4" strokeWidth={1.6} />
          )}
          {!collapsed && <span className="text-2xs uppercase tracking-[0.14em]">Collapse</span>}
        </button>

        {!collapsed && mounted && (
          <div className="mt-2 flex items-center gap-1.5 px-2.5 text-2xs text-muted">
            <Activity className="h-3 w-3" strokeWidth={1.6} />
            <span>v1.0.0 · on-prem</span>
          </div>
        )}
      </div>
    </aside>
  );
}

async function handleLogout(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  await fetch('/api/console/logout', { method: 'POST' });
  window.location.href = '/login';
}
