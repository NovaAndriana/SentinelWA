'use client';

import { AppShell } from '@/components/shell/AppShell';
import { CommandCenter } from '@/components/chat/CommandCenter';

export default function ChatPage() {
  return (
    <AppShell
      title="CS Command Center"
      subtitle="Live agent inbox · 24h service window tracking · quick response macros"
      scroll={false}
    >
      <CommandCenter />
    </AppShell>
  );
}
