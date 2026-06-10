import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/**
 * /about — what CouchCircle is, honest limitations, authorized-media note,
 * sesh flavor disclaimer, ephemeral-rooms notice.
 */
export default function AboutPage() {
  return (
    <>
      {/* Page-level grain */}
      <div className="grain-fixed pointer-events-none fixed inset-0 z-0" />

      <main className="relative z-10 mx-auto max-w-2xl px-5 py-14">
        {/* Back link */}
        <Button asChild variant="ghost" size="sm" className="mb-8 -ml-1">
          <Link href="/">← back to the couch</Link>
        </Button>

        <h1 className="font-display text-4xl font-bold text-cream-50 mb-3">
          what is CouchCircle?
        </h1>
        <p className="text-cream-300 text-base leading-relaxed mb-8">
          A cozy, real-time watch-party app. One room, one shared remote, one
          queue — everyone&apos;s in sync. Think movie night over the internet,
          but actually works and doesn&apos;t feel like a corporate Zoom call.
        </p>

        <Separator className="mb-8" />

        {/* What you can watch */}
        <Section title="what you can watch">
          <ul className="list-disc pl-5 space-y-2 text-cream-300 text-sm">
            <li>
              <strong className="text-cream-100">YouTube links</strong> — paste
              a youtube.com or youtu.be URL into the queue. Standard embeds; the
              same video has to be embeddable (most are).
            </li>
            <li>
              <strong className="text-cream-100">Direct media URLs</strong> — MP4,
              WebM, HLS (.m3u8), or any HTTP(S) link your browser can play. The
              server that hosts the file has to send proper CORS headers
              (or a browser extension can bypass it on your own machine).
            </li>
            <li>
              <strong className="text-cream-100">Screen share</strong> — P2P, no
              relay server (STUN only). Works great on a local network or when
              both sides have decent upload. Quality degrades with more viewers.
            </li>
          </ul>
        </Section>

        <Separator className="my-8" />

        {/* Honest limitations */}
        <Section title="the honest limitations">
          <ul className="list-disc pl-5 space-y-2 text-cream-300 text-sm">
            <li>
              <strong className="text-cream-100">Netflix / Disney+ / Hulu / any DRM</strong>{' '}
              won&apos;t work and we&apos;re not pretending otherwise. DRM means
              the browser actively prevents the video from being shared this way.
              No workarounds, no extensions — use screen share if you own a copy.
            </li>
            <li>
              <strong className="text-cream-100">CORS on direct links</strong> —
              if the server doesn&apos;t send <code className="text-ember-300 bg-couch-850 px-1 rounded">Access-Control-Allow-Origin: *</code>,
              your browser will block playback. Only the person hosting the file
              can fix this, or you can use screen share instead.
            </li>
            <li>
              <strong className="text-cream-100">Screen share without TURN</strong>{' '}
              — we only use STUN (Google&apos;s public servers). If two people are
              behind symmetric NATs or certain corporate firewalls, the WebRTC
              connection may fail. No TURN relay is configured yet.
            </li>
            <li>
              <strong className="text-cream-100">Format support</strong> —
              depends entirely on what your browser can play natively. MP4/H.264
              is the safest bet. HEVC and AV1 coverage varies.
            </li>
          </ul>
        </Section>

        <Separator className="my-8" />

        {/* Authorized media only */}
        <Section title="authorized media only">
          <p className="text-cream-300 text-sm leading-relaxed">
            Only share content you have the right to share. That means stuff
            you own, stuff that&apos;s publicly licensed, or stuff the creator
            has explicitly made available for embedding. CouchCircle is a sync
            layer — it doesn&apos;t host or proxy media, but the legal and
            ethical responsibility for what you watch together is yours.
          </p>
        </Section>

        <Separator className="my-8" />

        {/* Sesh mode disclaimer */}
        <Section title="a note on sesh mode 🍃">
          <p className="text-cream-300 text-sm leading-relaxed">
            Sesh Mode is a social-ritual layer — rotation tracking, spark
            countdowns, snack votes. It&apos;s there to add structure and humor
            to group sessions, not to tell anyone what to do or what to consume.{' '}
            <strong className="text-cream-100">
              CouchCircle never gives substance advice, dosing guidance, or
              procurement recommendations. Ever.
            </strong>{' '}
            If you see text that sounds like that, it&apos;s flavor copy only —
            like a movie having a character light a candle.
          </p>
        </Section>

        <Separator className="my-8" />

        {/* Ephemeral */}
        <Section title="everything disappears 💨">
          <p className="text-cream-300 text-sm leading-relaxed">
            Rooms are ephemeral and entirely in-memory on the PartyKit server.
            No accounts, no database, no message history after everyone leaves.
            Once the last person drifts off the couch, the room eventually
            disappears into the haze. Share the join code while the session is
            live — you can&apos;t rejoin a room that&apos;s gone cold.
          </p>
        </Section>

        {/* Footer nav */}
        <div className="mt-12 flex gap-4 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">back to the couch</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/demo">how to demo it</Link>
          </Button>
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Local helper
// ---------------------------------------------------------------------------
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold text-cream-50">
        {title}
      </h2>
      {children}
    </section>
  );
}
