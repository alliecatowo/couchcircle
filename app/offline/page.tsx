// [sync] pwa §6 — offline fallback page served by the service worker

export const metadata = {
  title: 'CouchCircle — offline',
};

export default function OfflinePage() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-6 bg-couch-900 px-6 text-center">
      <span className="text-6xl" aria-hidden>
        🛋️
      </span>
      <h1 className="font-display text-3xl font-bold text-cream-50">
        the couch needs wifi
      </h1>
      <p className="max-w-xs text-sm text-cream-400">
        you drifted somewhere without signal. reconnect and the crew will still
        be there.
      </p>
      <a
        href="/"
        className="mt-2 rounded-xl bg-ember-500 px-6 py-2 text-sm font-semibold text-couch-950 transition-colors duration-200 hover:bg-ember-400 active:scale-[0.97]"
      >
        try again
      </a>
    </main>
  );
}
