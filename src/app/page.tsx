'use client';

import { AppShell } from '@/components/shell/AppShell';
import { DashboardView } from '@/components/dashboard/DashboardView';

export default function DashboardPage() {
  return (
    <AppShell
      title="SOC Overview"
      subtitle="Service health matrix · gateway telemetry · live event stream"
    >
      <DashboardView />
    </AppShell>
  );
}
