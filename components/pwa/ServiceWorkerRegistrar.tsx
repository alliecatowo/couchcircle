'use client';

// [sync] pwa §6 — registers sw.js in production only (skip localhost to avoid
// fighting Next.js HMR during development)

import { useEffect } from 'react';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    // skip on localhost / 127.* to keep HMR interference-free
    const host = window.location.hostname;
    const isDev =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('192.168.') ||
      process.env.NODE_ENV === 'development';

    if (!('serviceWorker' in navigator) || isDev) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        // silent — a missing SW is never fatal
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[couchcircle:sw] registration failed', err);
        }
      });
  }, []);

  // renders nothing — pure side-effect component
  return null;
}
