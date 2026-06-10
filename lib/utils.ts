import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with clsx and dedupe conflicting Tailwind utilities.
 * This is the ONE class-merging helper for the whole app — every component in
 * `components/ui/*` forwards its `className` through here.
 *
 * @example cn('px-2', condition && 'px-4') // → 'px-4'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a number of seconds as a clock string.
 * - 1 hour or more → `H:MM:SS` (e.g. `1:23:45`)
 * - under an hour   → `M:SS`    (e.g. `4:20`)
 * - undefined / NaN / negative / Infinity → `–:–` (en-dash placeholder)
 *
 * @example formatDuration(5025)      // '1:23:45'
 * @example formatDuration(260)       // '4:20'
 * @example formatDuration(undefined) // '–:–'
 */
export function formatDuration(seconds?: number): string {
  if (
    seconds == null ||
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return '–:–';
  }

  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hrs > 0) {
    return `${hrs}:${pad(mins)}:${pad(secs)}`;
  }
  return `${mins}:${pad(secs)}`;
}

/**
 * Human, cozy relative-time formatting for a ms-epoch timestamp.
 * Cap-friendly buckets: "just now", "4m ago", "2h ago", "3d ago", then a date.
 * Future timestamps (clock skew) collapse to "just now".
 *
 * @example formatRelativeTime(Date.now() - 4 * 60_000) // '4m ago'
 */
export function formatRelativeTime(ts: number): string {
  if (!Number.isFinite(ts)) return 'just now';

  const deltaMs = Date.now() - ts;
  // Future or sub-30s → "just now"
  if (deltaMs < 30_000) return 'just now';

  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;

  // Older than a week → short calendar date, e.g. "Jun 9"
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
