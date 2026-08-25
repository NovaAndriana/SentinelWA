'use client';

import { StreamProvider } from '@/components/StreamProvider';
import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';

export function AppShell({
  title,
  subtitle,
  children,
  scroll = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Disable page scrolling for panes that manage their own overflow (the inbox). */
  scroll?: boolean;
}) {
  return (
    <StreamProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar title={title} subtitle={subtitle} />
          <main className={scroll ? 'flex-1 overflow-y-auto' : 'flex min-h-0 flex-1 overflow-hidden'}>
            {children}
          </main>
        </div>
      </div>
    </StreamProvider>
  );
}
