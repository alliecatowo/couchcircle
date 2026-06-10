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

      <main className="px-safe relative z-10 flex min-h-dvh flex-col items-center px-4 pb-12 pt-10 sm:py-16">
        {/* ---- Brand wordmark ------------------------------------------------ */}
        <header className="mb-8 flex flex-col items-center gap-3 text-center sm:mb-10">
          <h1 className="font-display text-[clamp(2.75rem,12vw,3.75rem)] font-bold tracking-tight text-cream-50">
            CouchCircle
          </h1>
          <p className="max-w-lg text-pretty px-2 text-base leading-relaxed text-cream-300 sm:text-lg">
            Watch YouTube, direct media links, or screen share with friends —
            synced, cozy, and actually fun.
          </p>
        </header>

        {/* ---- Animated living-room hero scene ------------------------------- */}
        <div className="mb-8 w-full max-w-2xl animate-pop-in">
          <LandingScene />
        </div>

        {/* ---- Create / Join cards ------------------------------------------
            Stack on phones (each card centers itself via max-w-sm + mx-auto);
            split side-by-side from sm up. */}
        <section
          className="flex w-full max-w-2xl flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-center"
          aria-label="Get started"
        >
          <CreateRoomCard className="mx-auto flex-1 sm:mx-0" />
          <JoinRoomCard className="mx-auto flex-1 sm:mx-0" />
        </section>

        {/* ---- Footer -------------------------------------------------------- */}
        <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 px-2 text-center text-sm text-cream-400 sm:mt-12 sm:gap-6">
          <Link
            href="/about"
            className="inline-flex min-h-11 items-center rounded-xl px-2 transition-colors duration-200 hover:text-cream-200"
          >
            what is this
          </Link>
          <span className="text-couch-600" aria-hidden>·</span>
          <Link
            href="/demo"
            className="inline-flex min-h-11 items-center rounded-xl px-2 transition-colors duration-200 hover:text-cream-200"
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
