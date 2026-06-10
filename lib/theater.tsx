'use client';

/**
 * theater — the "chrome melts away, the TV goes full-bleed" mode (SPRINT2 §2)
 * plus the tiny cross-component store that coordinates the projector handoff
 * (SPRINT2 §1/§9).
 *
 * Two pieces live here:
 *
 *  1. {@link TheaterProvider} / {@link useTheater} — React context owning the
 *     theater toggle, the idle-driven `chromeVisible` flag (chrome fades after
 *     3s without input while theater && playing), and the peanut-gallery toggle
 *     (`galleryVisible`, §9). RoomShell consumes this to hide TopBar / panels /
 *     seating in theater mode; MediaStage consumes it to letterbox + vignette
 *     and to mount the gallery.
 *
 *  2. {@link useProjectorOpen} / {@link setProjectorOpen} — a module-level store
 *     (no provider needed) that says whether THIS window's projector popup is
 *     open. TopBar flips it on/off; MediaStage subscribes so it can swap the
 *     player for the "🎬 rolling on the projector" placeholder and drop the
 *     adapter (no double audio).
 *
 * The `useTheater()` value intentionally also surfaces `projectorOpen` +
 * `setProjectorOpen` so a single hook satisfies the SPRINT2 export contract:
 *   { theater, toggle, chromeVisible, galleryVisible, toggleGallery,
 *     projectorOpen, setProjectorOpen }.
 */

import * as React from 'react';
import { useSyncStatus } from '@/lib/sync/sync-engine';

// ---------------------------------------------------------------------------
// Projector-open store (module-level, no provider)
// ---------------------------------------------------------------------------

let _projectorOpen = false;
const projectorListeners = new Set<() => void>();

/**
 * Flip whether this window's companion projector popup is open. Called by TopBar
 * when it opens / closes (or polls closed) the big-screen window. Notifies every
 * subscriber (MediaStage) so they can swap to the handoff placeholder.
 */
export function setProjectorOpen(open: boolean): void {
  if (_projectorOpen === open) return;
  _projectorOpen = open;
  projectorListeners.forEach((l) => l());
}

function subscribeProjectorOpen(cb: () => void): () => void {
  projectorListeners.add(cb);
  return () => projectorListeners.delete(cb);
}

function getProjectorOpenSnapshot(): boolean {
  return _projectorOpen;
}

/** Subscribe a component to the projector-open store (useSyncExternalStore). */
export function useProjectorOpen(): boolean {
  return React.useSyncExternalStore(
    subscribeProjectorOpen,
    getProjectorOpenSnapshot,
    // server snapshot: a projector popup can never be open during SSR
    () => false,
  );
}

// ---------------------------------------------------------------------------
// Theater context
// ---------------------------------------------------------------------------

/** How long without pointer/touch input before chrome melts away (§2). */
const CHROME_IDLE_MS = 3_000;

export interface TheaterContextValue {
  /** True when theater mode is on (chrome hidden, TV full-bleed). */
  theater: boolean;
  /** Toggle theater mode on/off. */
  toggle: () => void;
  /**
   * False after 3s without mousemove/touch while theater && playing — drives the
   * floating remote pill / chat toasts fading away. The peanut gallery (§9) is
   * NEVER hidden by this.
   */
  chromeVisible: boolean;
  /** Whether the §9 peanut gallery (the back row) is shown. */
  galleryVisible: boolean;
  /** Toggle the peanut gallery (lives in the floating remote pill, §9). */
  toggleGallery: () => void;
  /** Whether this window's projector popup is open (mirror of the store). */
  projectorOpen: boolean;
  /** Flip the projector-open store (proxy to {@link setProjectorOpen}). */
  setProjectorOpen: (open: boolean) => void;
}

const TheaterContext = React.createContext<TheaterContextValue | null>(null);

/**
 * Provides theater mode + chrome-idle tracking + the gallery toggle. Mount once,
 * high in the room tree (RoomShell wraps the room; ProjectorView wraps its
 * stage). Reads the live sync health so chrome only melts while actually playing.
 */
export function TheaterProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [theater, setTheater] = React.useState(false);
  const [chromeVisible, setChromeVisible] = React.useState(true);
  const [galleryVisible, setGalleryVisible] = React.useState(true);

  const projectorOpen = useProjectorOpen();

  // mediaStatus tells us when we're actually playing — chrome only hides then.
  const { mediaStatus } = useSyncStatus();
  const playing = mediaStatus === 'playing' || mediaStatus === 'live';

  const toggle = React.useCallback(() => {
    setTheater((t) => {
      const next = !t;
      // Leaving theater always restores chrome so we never strand the user in a
      // controls-less room.
      if (!next) setChromeVisible(true);
      return next;
    });
  }, []);

  const toggleGallery = React.useCallback(() => {
    setGalleryVisible((g) => !g);
  }, []);

  // ---- chrome idle timer (§2): hide chrome after 3s of no input while playing
  React.useEffect(() => {
    if (!theater || !playing) {
      // Not in the "immersive" condition — keep chrome up and don't arm a timer.
      setChromeVisible(true);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const arm = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setChromeVisible(false), CHROME_IDLE_MS);
    };

    const wake = (): void => {
      setChromeVisible(true);
      arm();
    };

    // Start hidden-countdown immediately; any input wakes + re-arms.
    arm();
    window.addEventListener('mousemove', wake, { passive: true });
    window.addEventListener('touchstart', wake, { passive: true });
    window.addEventListener('keydown', wake);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [theater, playing]);

  const value = React.useMemo<TheaterContextValue>(
    () => ({
      theater,
      toggle,
      chromeVisible,
      galleryVisible,
      toggleGallery,
      projectorOpen,
      setProjectorOpen,
    }),
    [theater, toggle, chromeVisible, galleryVisible, toggleGallery, projectorOpen],
  );

  return <TheaterContext.Provider value={value}>{children}</TheaterContext.Provider>;
}

/**
 * Read the theater context. Safe to call outside a {@link TheaterProvider}: it
 * falls back to an inert default (theater off, chrome always visible, gallery on)
 * so components that may render in either tree — e.g. MediaStage in the main
 * window vs. ProjectorView — never crash. The projector-open fields always
 * reflect the live module store even in the fallback.
 */
export function useTheater(): TheaterContextValue {
  const ctx = React.useContext(TheaterContext);
  // Hooks must be called unconditionally — read the store regardless so the
  // fallback path stays reactive.
  const projectorOpen = useProjectorOpen();
  if (ctx) return ctx;
  return {
    theater: false,
    toggle: () => {},
    chromeVisible: true,
    galleryVisible: true,
    toggleGallery: () => {},
    projectorOpen,
    setProjectorOpen,
  };
}
