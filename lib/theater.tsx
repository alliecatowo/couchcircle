'use client';

/**
 * the view system (SPRINT2 §13) — supersedes the older §1/§2 theater/projector
 * naming. Four orthogonal view states + per-panel visibility, all driven from
 * one place so keyboard, fullscreen, and persisted panel prefs never disagree.
 *
 * Three pieces live here:
 *
 *  1. {@link ViewProvider} / {@link useView} — the React context owning:
 *       - `mode`: 'default' | 'theater' | 'fullscreen' (orthogonal page states).
 *         • theater (`t`)     → side column collapses, seating slims, sesh stays
 *           slim, the TV gets big. NORMAL page chrome (top bar stays).
 *         • fullscreen (`f`)  → real browser fullscreen on the stage element;
 *           auto-hiding overlay controls; the peanut gallery lives here.
 *       - `chromeVisible`: false after 3s idle while (theater|fullscreen) && playing.
 *       - `panels`: per-panel visibility (queue / chat / seating / sesh), persisted
 *         to localStorage `couchcircle:panels`; `togglePanel(key)` flips one.
 *       - keyboard (t / f / esc) is wired ONCE here — no component duplicates it.
 *       - fullscreen is requested on the stage element registered via
 *         `setStageEl(el)` (MediaStage calls it); Esc / leaving the mode exits.
 *
 *  2. {@link usePopoutOpen} / {@link setPopoutOpen} — a module-level store (no
 *     provider) saying whether THIS window's popout-player window is open. TopBar
 *     flips it; MediaStage subscribes so it can swap the player for the
 *     "video popped out ⧉" placeholder and drop the adapter (no double audio).
 *     The underlying machinery is the old projector role; the user-facing concept
 *     is now a plain popout player (§13 — "the projector" is dead as a concept).
 *
 *  3. {@link useTheater} — a DEPRECATED back-compat alias over {@link useView} so
 *     siblings written against the §2 contract keep compiling:
 *       theater === (mode === 'theater' || mode === 'fullscreen').
 *     Prefer useView() in new code.
 */

import * as React from 'react';
import { useSyncStatus } from '@/lib/sync/sync-engine';

// ===========================================================================
// Popout-open store (module-level, no provider) — formerly the projector store
// ===========================================================================

let _popoutOpen = false;
const popoutListeners = new Set<() => void>();

/**
 * Flip whether this window's popout-player window is open. Called by TopBar when
 * it opens / closes (or polls closed) the bare-video window. Notifies every
 * subscriber (MediaStage) so they can swap to the handoff placeholder.
 */
export function setPopoutOpen(open: boolean): void {
  if (_popoutOpen === open) return;
  _popoutOpen = open;
  popoutListeners.forEach((l) => l());
}

function subscribePopoutOpen(cb: () => void): () => void {
  popoutListeners.add(cb);
  return () => popoutListeners.delete(cb);
}

function getPopoutOpenSnapshot(): boolean {
  return _popoutOpen;
}

/** Subscribe a component to the popout-open store (useSyncExternalStore). */
export function usePopoutOpen(): boolean {
  return React.useSyncExternalStore(
    subscribePopoutOpen,
    getPopoutOpenSnapshot,
    // server snapshot: a popout window can never be open during SSR
    () => false,
  );
}

// ---- back-compat aliases (the old "projector" names) ----
/** @deprecated use {@link setPopoutOpen}. */
export const setProjectorOpen = setPopoutOpen;
/** @deprecated use {@link usePopoutOpen}. */
export const useProjectorOpen = usePopoutOpen;

// ===========================================================================
// View context
// ===========================================================================

/** How long without pointer/touch input before chrome melts away (§13). */
const CHROME_IDLE_MS = 3_000;

/** The four-but-three page view states (popout is a separate window, not a mode). */
export type ViewMode = 'default' | 'theater' | 'fullscreen';

/** The individually-collapsible panels (§13). `true` = visible. */
export type PanelKey = 'queue' | 'chat' | 'seating' | 'sesh';
export type PanelVisibility = Record<PanelKey, boolean>;

const PANEL_KEYS: PanelKey[] = ['queue', 'chat', 'seating', 'sesh'];
const PANELS_STORAGE_KEY = 'couchcircle:panels';
const DEFAULT_PANELS: PanelVisibility = {
  queue: true,
  chat: true,
  seating: true,
  sesh: true,
};

function readStoredPanels(): PanelVisibility {
  if (typeof window === 'undefined') return DEFAULT_PANELS;
  try {
    const raw = window.localStorage.getItem(PANELS_STORAGE_KEY);
    if (!raw) return DEFAULT_PANELS;
    const parsed = JSON.parse(raw) as Partial<PanelVisibility>;
    // merge over defaults so a partial / older payload never strands a panel
    const merged = { ...DEFAULT_PANELS };
    for (const key of PANEL_KEYS) {
      if (typeof parsed[key] === 'boolean') merged[key] = parsed[key] as boolean;
    }
    return merged;
  } catch {
    return DEFAULT_PANELS;
  }
}

export interface ViewContextValue {
  /** The current page view mode (popout is a separate window, not a mode). */
  mode: ViewMode;
  /** Set the view mode directly. */
  setMode: (mode: ViewMode) => void;
  /** Convenience: jump to a mode, or back to default if already there. */
  toggleMode: (mode: Exclude<ViewMode, 'default'>) => void;
  /**
   * False after 3s without mousemove/touch while (theater | fullscreen) && playing
   * — drives the floating remote pill / overlay controls fading away. The peanut
   * gallery (§9) is NEVER hidden by this.
   */
  chromeVisible: boolean;
  /** Per-panel visibility (queue / chat / seating / sesh). `true` = visible. */
  panels: PanelVisibility;
  /** Flip one panel's visibility (persists to localStorage). */
  togglePanel: (key: PanelKey) => void;
  /** Whether the §9 peanut gallery (the back row) is shown in fullscreen. */
  galleryVisible: boolean;
  /** Toggle the peanut gallery (lives in the floating overlay pill, §9). */
  toggleGallery: () => void;
  /** Register the stage element fullscreen is requested on (MediaStage calls it). */
  setStageEl: (el: HTMLElement | null) => void;
  /** Whether this window's popout-player window is open (mirror of the store). */
  popoutOpen: boolean;
  /** Flip the popout-open store (proxy to {@link setPopoutOpen}). */
  setPopoutOpen: (open: boolean) => void;
}

const ViewContext = React.createContext<ViewContextValue | null>(null);

/**
 * Provides the view system: mode + chrome-idle tracking + per-panel visibility +
 * single-source keyboard handling + fullscreen on the registered stage element.
 * Mount once, high in the room tree (RoomShell wraps the room; the popout window
 * wraps its own stage).
 */
export function ViewProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [mode, setModeState] = React.useState<ViewMode>('default');
  const [chromeVisible, setChromeVisible] = React.useState(true);
  const [galleryVisible, setGalleryVisible] = React.useState(true);

  // Panels: hydrate from localStorage AFTER mount so SSR + first client render
  // agree (defaults), then snap to the stored prefs.
  const [panels, setPanels] = React.useState<PanelVisibility>(DEFAULT_PANELS);
  React.useEffect(() => {
    setPanels(readStoredPanels());
  }, []);

  const popoutOpen = usePopoutOpen();

  // mediaStatus tells us when we're actually playing — chrome only hides then.
  const { mediaStatus } = useSyncStatus();
  const playing = mediaStatus === 'playing' || mediaStatus === 'live';

  // ---- the stage element fullscreen is requested on (registered by MediaStage)
  const stageElRef = React.useRef<HTMLElement | null>(null);
  const setStageEl = React.useCallback((el: HTMLElement | null) => {
    stageElRef.current = el;
  }, []);

  const immersive = mode === 'theater' || mode === 'fullscreen';

  const setMode = React.useCallback((next: ViewMode) => {
    setModeState((prev) => {
      if (prev === next) return prev;
      // Leaving an immersive mode always restores chrome so we never strand the
      // user in a controls-less room.
      if (next === 'default') setChromeVisible(true);
      return next;
    });
  }, []);

  const toggleMode = React.useCallback(
    (target: Exclude<ViewMode, 'default'>) => {
      setModeState((prev) => {
        const next = prev === target ? 'default' : target;
        if (next === 'default') setChromeVisible(true);
        return next;
      });
    },
    [],
  );

  const togglePanel = React.useCallback((key: PanelKey) => {
    setPanels((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(PANELS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // private browsing / SSR — preference just won't persist this session
      }
      return next;
    });
  }, []);

  const toggleGallery = React.useCallback(() => {
    setGalleryVisible((g) => !g);
  }, []);

  // ---- keyboard (§13), wired ONCE: t theater, f fullscreen, esc back ----
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // ignore while typing in a field
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable);
      if (typing) return;
      // ignore modified chords (let browser shortcuts through)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        toggleMode('theater');
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleMode('fullscreen');
      } else if (e.key === 'Escape') {
        // Esc exits to default from any immersive mode.
        setMode('default');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleMode, setMode]);

  // ---- chrome idle timer (§13): hide chrome after 3s of no input while playing
  React.useEffect(() => {
    if (!immersive || !playing) {
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
  }, [immersive, playing]);

  // ---- browser Fullscreen API on the registered stage element (§13) ----
  // Only the `fullscreen` mode drives real browser fullscreen; theater stays
  // inside the normal page. Best-effort — if the request is refused the mode
  // still applies the in-page big-TV layout.
  React.useEffect(() => {
    const el = stageElRef.current;
    if (mode === 'fullscreen') {
      if (el && !document.fullscreenElement) {
        el.requestFullscreen?.().catch(() => {
          /* best-effort; the in-page fullscreen layout still applies */
        });
      }
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [mode]);

  // ---- keep mode in sync when the user leaves browser fullscreen via the OS
  // (Esc handled by the browser itself, or the F11 chrome) ----
  React.useEffect(() => {
    const onFsChange = (): void => {
      if (!document.fullscreenElement) {
        // dropped out of real fullscreen — fall back to default unless we're
        // already there (avoid clobbering theater, which never enters real FS).
        setModeState((prev) => (prev === 'fullscreen' ? 'default' : prev));
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const value = React.useMemo<ViewContextValue>(
    () => ({
      mode,
      setMode,
      toggleMode,
      chromeVisible,
      panels,
      togglePanel,
      galleryVisible,
      toggleGallery,
      setStageEl,
      popoutOpen,
      setPopoutOpen,
    }),
    [
      mode,
      setMode,
      toggleMode,
      chromeVisible,
      panels,
      togglePanel,
      galleryVisible,
      toggleGallery,
      setStageEl,
      popoutOpen,
    ],
  );

  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

/**
 * Read the view context. Safe to call outside a {@link ViewProvider}: it falls
 * back to an inert default (default mode, chrome always visible, all panels
 * visible) so components that may render in either tree never crash. The
 * popout-open fields always reflect the live module store even in the fallback.
 */
export function useView(): ViewContextValue {
  const ctx = React.useContext(ViewContext);
  // Hooks must be called unconditionally — read the store regardless so the
  // fallback path stays reactive.
  const popoutOpen = usePopoutOpen();
  if (ctx) return ctx;
  return {
    mode: 'default',
    setMode: () => {},
    toggleMode: () => {},
    chromeVisible: true,
    panels: DEFAULT_PANELS,
    togglePanel: () => {},
    galleryVisible: true,
    toggleGallery: () => {},
    setStageEl: () => {},
    popoutOpen,
    setPopoutOpen,
  };
}

// ===========================================================================
// Back-compat: TheaterProvider / useTheater (DEPRECATED — prefer useView)
// ===========================================================================

/** @deprecated use {@link ViewProvider}. Kept so §2-era siblings compile. */
export const TheaterProvider = ViewProvider;

/**
 * Value shape returned by the deprecated {@link useTheater} alias. Mirrors the
 * old §2 contract so existing siblings (MediaStage, ProjectorView, …) keep
 * compiling: `theater` is true whenever the TV is "big" (theater OR fullscreen).
 */
export interface TheaterContextValue {
  /** True when the TV is big — theater OR fullscreen (§13 generalization). */
  theater: boolean;
  /** Toggle theater mode on/off (back-compat: cycles default ↔ theater). */
  toggle: () => void;
  /** False after 3s idle while immersive && playing (§13). */
  chromeVisible: boolean;
  /** Whether the §9 peanut gallery (the back row) is shown. */
  galleryVisible: boolean;
  /** Toggle the peanut gallery. */
  toggleGallery: () => void;
  /** Whether this window's popout window is open (mirror of the store). */
  projectorOpen: boolean;
  /** Flip the popout-open store. */
  setProjectorOpen: (open: boolean) => void;
}

/**
 * @deprecated use {@link useView}. A thin compatibility shim that maps the new
 * view system onto the old §2 `useTheater()` shape so siblings written against
 * that contract keep compiling. `theater === (mode === 'theater' ||
 * mode === 'fullscreen')`; `toggle()` cycles default ↔ theater.
 */
export function useTheater(): TheaterContextValue {
  const view = useView();
  const theater = view.mode === 'theater' || view.mode === 'fullscreen';
  return {
    theater,
    toggle: () => view.toggleMode('theater'),
    chromeVisible: view.chromeVisible,
    galleryVisible: view.galleryVisible,
    toggleGallery: view.toggleGallery,
    projectorOpen: view.popoutOpen,
    setProjectorOpen: view.setPopoutOpen,
  };
}
