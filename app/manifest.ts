// [sync] pwa §6 — Next.js metadata route for web app manifest
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CouchCircle',
    short_name: 'CouchCircle',
    description:
      'watch together, actually together — synced media with the crew',
    start_url: '/',
    display: 'standalone',
    background_color: '#181210', // couch-900
    theme_color: '#e08b34', // ember-500
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
