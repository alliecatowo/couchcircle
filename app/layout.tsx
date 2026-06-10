import type { Metadata } from 'next';
import { Fraunces, Nunito } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar';
import './globals.css';

/**
 * Display face — Fraunces, a soft warm serif with a little wobble. Wired into
 * the --font-display @theme token via the `--font-fraunces` CSS variable.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  weight: 'variable',
  axes: ['opsz', 'SOFT', 'WONK'],
});

/**
 * Body face — Nunito, rounded and friendly. Wired into --font-body via
 * `--font-nunito`.
 */
const nunito = Nunito({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-nunito',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'CouchCircle — watch together, actually together',
  description:
    'Watch YouTube, direct media links, or screen share with friends — synced, cozy, and actually fun.',
  // [sync] pwa §6 — PWA metadata additions
  themeColor: '#e08b34', // ember-500
  appleWebApp: {
    capable: true,
    title: 'CouchCircle',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${nunito.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-couch-900 font-body text-cream-50 antialiased">
        <TooltipProvider delayDuration={250} skipDelayDuration={400}>
          {children}
        </TooltipProvider>
        {/* [sync] pwa §6 — registers sw.js in production */}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
