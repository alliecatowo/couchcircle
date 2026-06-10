import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

/**
 * /about — what CouchCircle is, honest limitations, authorized-media note,
 * sesh flavor disclaimer, ephemeral-rooms notice. Canon voice throughout.
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
          a cozy, real-time watch-party app. one couch, one shared remote, one
          queue — the crew stays in sync. think movie night over the internet,
          but actually together and nothing like a corporate video call.
        </p>

        <Separator className="mb-8" />

        {/* What you can watch */}
        <Section title="what you can watch">
          <ul className="list-disc pl-5 space-y-2 text-cream-300 text-sm">
            <li>
              <strong className="text-cream-100">YouTube links</strong> — paste
              a youtube.com or youtu.be URL into the queue. standard embeds; the
              video needs to be embeddable (most are).
            </li>
            <li>
              <strong className="text-cream-100">direct media URLs</strong> — MP4,
              WebM, HLS (.m3u8), or any HTTP(S) link your browser can play. the
              server hosting the file needs proper CORS headers
              (or a browser extension can bypass it on your own machine).
            </li>
            <li>
              <strong className="text-cream-100">screen share</strong> — P2P, no
              relay server (STUN only). great on a local network or when both
              sides have decent upload. quality dips with more of the crew watching.
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
              no workarounds, no extensions — use screen share if you own a copy.
            </li>
            <li>
              <strong className="text-cream-100">CORS on direct links</strong> —
              if the server doesn&apos;t send <code className="text-ember-300 bg-couch-850 px-1 rounded">Access-Control-Allow-Origin: *</code>,
              your browser blocks playback. only the person hosting the file
              can fix that, or use screen share instead.
            </li>
            <li>
              <strong className="text-cream-100">screen share without TURN</strong>{' '}
              — only STUN (Google&apos;s public servers). if two people are
              behind symmetric NATs or certain corporate firewalls, the WebRTC
              connection may not make it. no TURN relay yet.
            </li>
            <li>
              <strong className="text-cream-100">format support</strong> —
              depends entirely on what your browser can play natively. MP4/H.264
              is the safest bet. HEVC and AV1 coverage varies.
            </li>
          </ul>
        </Section>

        <Separator className="my-8" />

        {/* Authorized media only */}
        <Section title="authorized media only">
          <p className="text-cream-300 text-sm leading-relaxed">
            only share content you have the right to share — stuff you own,
            stuff that&apos;s publicly licensed, or stuff the creator has
            explicitly made available for embedding. CouchCircle is a sync
            layer; it doesn&apos;t host or proxy media, but the legal and
            ethical responsibility for what the crew watches together is yours.
          </p>
        </Section>

        <Separator className="my-8" />

        {/* Sesh mode disclaimer */}
        <Section title="a note on sesh mode 🍃">
          <p className="text-cream-300 text-sm leading-relaxed">
            sesh mode is a social-ritual layer — rotation tracking, spark
            countdowns, snack votes. it&apos;s there to add structure and a bit
            of humor to the session, not to tell anyone what to do or consume.{' '}
            <strong className="text-cream-100">
              CouchCircle never gives substance advice, dosing guidance, or
              procurement recommendations. ever.
            </strong>{' '}
            if you see text that sounds like that, it&apos;s flavor copy only —
            like a movie having a character light a candle.
          </p>
        </Section>

        <Separator className="my-8" />

        {/* Ephemeral */}
        <Section title="everything dissolves into the haze 💨">
          <p className="text-cream-300 text-sm leading-relaxed">
            couches are ephemeral, entirely in-memory on the PartyKit server.
            no accounts, no database, no history after the crew drifts off.
            once the last person leaves, the couch dissolves into the haze.
            share the couch code while the sesh is live — you can&apos;t
            rejoin a couch that&apos;s already gone cold.
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
