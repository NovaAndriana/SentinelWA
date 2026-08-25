'use client';

import { AppShell } from '@/components/shell/AppShell';
import { KeyManager } from '@/components/keys/KeyManager';

export default function ApiKeysPage() {
  return (
    <AppShell
      title="Internal Gateway Credentials"
      subtitle="Issue, scope, throttle and revoke the x-api-key tokens used by internal services"
    >
      <KeyManager />
    </AppShell>
  );
}
