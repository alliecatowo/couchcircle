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
          you can run the whole thing locally, in two browser tabs, in about
          two minutes. no accounts, no API keys, no cloud required.
        </p>

        <Separator className="mb-8" />

        {/* Step 1 */}
        <Section title="step 1 — spin up the servers">
          <StepBlock>
            <p className="text-cream-300 text-sm mb-3">
              you need the Next.js frontend and the PartyKit server running at
              the same time. the easiest way:
            </p>
            <CodeBlock>{`npm run dev:all`}</CodeBlock>
            <p className="text-cream-300 text-sm mt-3">
              this runs <code className="code-inline">npm run dev</code> (Next,
              port 3000) and{' '}
              <code className="code-inline">npm run dev:party</code> (PartyKit,
              port 1999) concurrently. keep the terminal open.
            </p>
          </StepBlock>
        </Section>

        <Separator className="my-8" />

        {/* Step 2 */}
        <Section title="step 2 — open two browser tabs">
          <StepBlock>
            <p className="text-cream-300 text-sm">
              open{' '}
              <a
                href="http://localhost:3000"
                className="text-ember-400 hover:text-ember-300 underline underline-offset-2 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                http://localhost:3000
              </a>{' '}
              in two separate tabs (or two different browsers — Chrome + Firefox
              works great for testing multi-creature stuff). they&apos;ll act as
              two separate crew members.
            </p>
          </StepBlock>
        </Section>

        <Separator className="my-8" />

        {/* Step 3 */}
        <Section title="step 3 — roll up a demo couch">
          <StepBlock>
            <p className="text-cream-300 text-sm mb-4">
              use the button below to roll up a couch pre-loaded with sample
              videos. copy the couch code and paste it in your second tab to
              flop on in as a second crew member.
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
                <strong className="text-cream-100">up next panel</strong> (right
                side) — the couch comes with three sample videos in the queue.
                hit ▶ on any item to start playing.
              </li>
              <li>
                <strong className="text-cream-100">the remote</strong>{' '}
                (bottom bar) — play, pause, scrub, rate. the tab that rolled up
                the couch starts as host with the remote. the second tab can
                request it.
              </li>
              <li>
                <strong className="text-cream-100">chat / activity</strong>{' '}
                (right panel tabs) — send messages between tabs. activity shows
                every room event.
              </li>
              <li>
                <strong className="text-cream-100">sesh mode</strong> (top-bar
                toggle, host only) — enables rotation, spark countdown, snack
                votes. try it with both tabs open and watch the crew sync up.
              </li>
              <li>
                <strong className="text-cream-100">screen share</strong> — open
                the add to queue dialog, pick the screen share tab. works best
                when both tabs are in the same browser session (no NAT issues).
              </li>
            </ul>
          </StepBlock>
        </Section>

        <Separator className="my-8" />

        {/* Sample URLs */}
        <Section title="sample video URLs">
          <p className="text-cream-300 text-sm mb-4">
            paste these into the queue&apos;s &quot;direct URL&quot; or
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
              — the PartyKit server isn&apos;t running on port 1999. make sure{' '}
              <code className="code-inline">dev:all</code> is running.
            </li>
            <li>
              <strong className="text-cream-100">direct URL won&apos;t play</strong>{' '}
              — CORS is probably blocking it. the sample URLs above have
              correct headers; random links from the web usually don&apos;t.
            </li>
            <li>
              <strong className="text-cream-100">HLS won&apos;t load</strong>{' '}
              — hls.js loads dynamically; give it a moment on first load.
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
