import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SentinelWA :: WhatsApp Gateway SOC',
  description:
    'On-premise WhatsApp Business API gateway - internal messaging, delivery telemetry and a live operations console.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  width: 'device-width',
  initialScale: 1,
};

/**
 * Fonts are declared as a CSS stack rather than fetched through next/font, so
 * that an air-gapped on-premise build never blocks on a Google Fonts request.
 * Install JetBrains Mono or Fira Code on the host for the intended look; the
 * stack degrades to the platform monospace face otherwise.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body
        style={
          {
            '--font-mono':
              "'JetBrains Mono', 'Fira Code', 'IBM Plex Mono', 'Cascadia Mono', 'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
