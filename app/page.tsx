import Link from 'next/link';
import { LandingScene } from '@/components/landing/LandingScene';
import { CreateRoomCard } from '@/components/landing/CreateRoomCard';
import { JoinRoomCard } from '@/components/landing/JoinRoomCard';

/**
 * The CouchCircle landing page.
 *
 * Static shell (no client hooks needed at this level) — client behaviour
 * lives inside CreateRoomCard / JoinRoomCard / LandingScene.
 */
export default function Home() {
  return (
    <>
      {/* Page-level grain texture */}
      <div className="grain-fixed pointer-events-none fixed inset-0 z-0" />

      <main className="relative z-10 flex min-h-dvh flex-col items-center px-4 py-12 sm:py-16">
        {/* ---- Brand wordmark ------------------------------------------------ */}
        <header className="mb-10 flex flex-col items-center gap-3 text-center">
          <h1 className="font-display text-5xl font-bold tracking-tight text-cream-50 sm:text-6xl">
            CouchCircle
          </h1>
          <p className="max-w-lg text-base text-cream-300 sm:text-lg leading-relaxed">
            Watch YouTube, direct media links, or screen share with friends —
            synced, cozy, and actually fun.
          </p>
        </header>

        {/* ---- Animated living-room hero scene ------------------------------- */}
        <div className="mb-8 w-full max-w-2xl animate-pop-in">
          <LandingScene />
        </div>

        {/* ---- Create / Join cards ------------------------------------------ */}
        <section
          className="flex w-full max-w-2xl flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-center"
          aria-label="Get started"
        >
          <CreateRoomCard className="flex-1" />
          <JoinRoomCard className="flex-1" />
        </section>

        {/* ---- Footer -------------------------------------------------------- */}
        <footer className="mt-12 flex flex-wrap items-center justify-center gap-6 text-sm text-cream-400">
          <Link
            href="/about"
            className="transition-colors duration-200 hover:text-cream-200"
          >
            what is this
          </Link>
          <span className="text-couch-600" aria-hidden>·</span>
          <Link
            href="/demo"
            className="transition-colors duration-200 hover:text-cream-200"
          >
            how to demo it
          </Link>
          <span className="text-couch-600" aria-hidden>·</span>
          <span className="text-couch-600">
            rooms are ephemeral — nothing persists 🛋️
          </span>
        </footer>
      </main>
    </>
  );
}
