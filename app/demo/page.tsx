import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SAMPLE_VIDEOS } from '@/shared/constants';
import { DemoRoomButton } from '@/components/landing/DemoRoomButton';

/**
 * /demo — local demo guide: how to run two-tab sessions, sample video URLs,
 * and a shortcut button that spins up a pre-seeded demo room.
 */
export default function DemoPage() {
  return (
    <>
      {/* Page-level grain */}
      <div className="grain-fixed pointer-events-none fixed inset-0 z-0" />

      <main className="relative z-10 mx-auto max-w-2xl px-5 py-14">
        {/* Back */}
        <Button asChild variant="ghost" size="sm" className="mb-8 -ml-1">
          <Link href="/">← back to the couch</Link>
        </Button>

        <h1 className="font-display text-4xl font-bold text-cream-50 mb-3">
          how to demo CouchCircle
        </h1>
        <p className="text-cream-300 text-base leading-relaxed mb-8">
          You can run the whole thing locally, in two browser tabs, in about
          two minutes. No accounts, no API keys, no cloud required.
        </p>

        <Separator className="mb-8" />

        {/* Step 1 */}
        <Section title="step 1 — spin up the servers">
          <StepBlock>
            <p className="text-cream-300 text-sm mb-3">
              You need the Next.js frontend and the PartyKit server running at
              the same time. The easiest way:
            </p>
            <CodeBlock>{`npm run dev:all`}</CodeBlock>
            <p className="text-cream-300 text-sm mt-3">
              This runs <code className="code-inline">npm run dev</code> (Next,
              port 3000) and{' '}
              <code className="code-inline">npm run dev:party</code> (PartyKit,
              port 1999) concurrently. Keep the terminal open.
            </p>
          </StepBlock>
        </Section>

        <Separator className="my-8" />

        {/* Step 2 */}
        <Section title="step 2 — open two browser tabs">
          <StepBlock>
            <p className="text-cream-300 text-sm">
              Open{' '}
              <a
                href="http://localhost:3000"
                className="text-ember-400 hover:text-ember-300 underline underline-offset-2 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                http://localhost:3000
              </a>{' '}
              in two separate tabs (or two different browsers — Chrome + Firefox
              works great for testing multi-user stuff). They&apos;ll act as
              two separate viewers.
            </p>
          </StepBlock>
        </Section>

        <Separator className="my-8" />

        {/* Step 3 */}
        <Section title="step 3 — roll up a demo room">
          <StepBlock>
            <p className="text-cream-300 text-sm mb-4">
              Use the button below to create a room pre-loaded with sample
              videos. Copy the join code from the room and paste it in your
              second tab to join as a second viewer.
            </p>
            {/* Client component — button that calls createRoom() with seedDemo */}
            <DemoRoomButton />
          </StepBlock>
        </Section>

        <Separator className="my-8" />

        {/* Step 4 */}
        <Section title="step 4 — what to click">
          <StepBlock>
            <ul className="list-disc pl-5 space-y-2 text-cream-300 text-sm">
              <li>
                <strong className="text-cream-100">Queue panel</strong> (right
                side) — the room comes with three sample videos already in the
                queue. Click ▶ on any item to start playing.
              </li>
              <li>
                <strong className="text-cream-100">Remote Controls</strong>{' '}
                (bottom bar) — play, pause, scrub, rate. The tab that created
                the room starts as host+controller. The second tab can request
                the remote.
              </li>
              <li>
                <strong className="text-cream-100">Chat / Activity</strong>{' '}
                (right panel tabs) — send messages between tabs. Activity shows
                every room event.
              </li>
              <li>
                <strong className="text-cream-100">Sesh Mode</strong> (top-bar
                toggle, host only) — enables rotation, spark countdown, snack
                votes. Try it with both tabs open and watch the sync.
              </li>
              <li>
                <strong className="text-cream-100">Screen share</strong> — open
                the Add to Queue dialog, pick the Screen Share tab. Works best
                when both tabs are in the same browser session (no NAT issues).
              </li>
            </ul>
          </StepBlock>
        </Section>

        <Separator className="my-8" />

        {/* Sample URLs */}
        <Section title="sample video URLs">
          <p className="text-cream-300 text-sm mb-4">
            Copy these into the queue&apos;s &quot;direct URL&quot; or
            &quot;YouTube&quot; tab to test different adapters:
          </p>
          <div className="space-y-3">
            <SampleUrl label="MP4 (Big Buck Bunny)" url={SAMPLE_VIDEOS.mp4} />
            <SampleUrl label="HLS stream (Mux test)" url={SAMPLE_VIDEOS.hls} />
            <SampleUrl label="YouTube" url={SAMPLE_VIDEOS.youtube} />
          </div>
        </Section>

        <Separator className="my-8" />

        {/* Troubleshooting */}
        <Section title="if something&apos;s broken">
          <ul className="list-disc pl-5 space-y-2 text-cream-300 text-sm">
            <li>
              <strong className="text-cream-100">
                &quot;the room service is asleep&quot;
              </strong>{' '}
              — the PartyKit server isn&apos;t running on port 1999. Make sure{' '}
              <code className="code-inline">dev:all</code> is running.
            </li>
            <li>
              <strong className="text-cream-100">Direct URL won&apos;t play</strong>{' '}
              — CORS is probably blocking it. The sample URLs above have
              correct headers; random links from the web usually don&apos;t.
            </li>
            <li>
              <strong className="text-cream-100">HLS won&apos;t load</strong>{' '}
              — hls.js is loaded dynamically; give it a moment on first load.
            </li>
          </ul>
        </Section>

        {/* Footer nav */}
        <div className="mt-12 flex gap-4 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">back to the couch</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/about">about</Link>
          </Button>
        </div>
      </main>
    </>
  );
}

// ---------------------------------------------------------------------------
// Local helpers (static, no client needed)
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

function StepBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-couch-700 bg-couch-800/70 p-4">
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-couch-850 border border-couch-700 px-4 py-3 text-sm font-mono text-ember-300">
      <code>{children}</code>
    </pre>
  );
}

function SampleUrl({ label, url }: { label: string; url: string }) {
  return (
    <div className="rounded-xl border border-couch-700 bg-couch-850 px-4 py-3">
      <p className="text-xs text-cream-400 mb-1.5">{label}</p>
      <code className="text-xs text-ember-300 break-all">{url}</code>
    </div>
  );
}
