'use client';

import { AppShell } from '@/components/shell/AppShell';
import { SettingsForm } from '@/components/settings/SettingsForm';

export default function SettingsPage() {
  return (
    <AppShell
      title="Meta Uplink Configuration"
      subtitle="WhatsApp Cloud API credentials, webhook endpoint and dispatch defaults"
    >
      <SettingsForm />
    </AppShell>
  );
}
