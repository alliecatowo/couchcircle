'use client';

import * as React from 'react';
import { UploadCloud, ChevronDown, ChevronUp, Monitor } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  parseYouTubeUrl,
  youTubeThumbnail,
  classifyDirectUrl,
  isProbablyMediaUrl,
} from '@/lib/media/url-parse';
import { fetchYouTubeMeta } from '@/lib/realtime/connection';
import { HOSTED_UPLOAD_ROADMAP } from '@/lib/media/hosted-upload-stub';

// [sync] ExplorePanel — sibling task; contract: ExploreGrid exported from
// '@/components/room/ExplorePanel' with prop { onPick: () => void }.
// Cast to any so tsc doesn't fail while the sibling file is mid-flight.
export interface ExploreGridProps {
  onPick: () => void;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _exploreMod = (): Promise<any> => import('@/components/room/ExplorePanel' as any);
const ExploreGrid = React.lazy(() =>
  _exploreMod().then((m: { ExploreGrid: React.ComponentType<ExploreGridProps> }) => ({
    default: m.ExploreGrid,
  })),
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive a human-readable title from a URL's last path segment. */
function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    const name = last
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]/g, ' ')
      .trim();
    return name.length > 0 ? name : 'video';
  } catch {
    return 'video';
  }
}

// ---------------------------------------------------------------------------
// Shimmer — placeholder while oEmbed resolves
// ---------------------------------------------------------------------------

function PreviewShimmer() {
  return (
    <div className="flex gap-3 rounded-xl border border-couch-700/60 bg-couch-850/50 p-3 animate-pulse">
      <div className="w-24 h-14 shrink-0 rounded-lg bg-couch-750" />
      <div className="flex-1 flex flex-col gap-2 justify-center">
        <div className="h-3 bg-couch-750 rounded-full w-3/4" />
        <div className="h-2.5 bg-couch-750 rounded-full w-1/2" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// YouTube preview card
// ---------------------------------------------------------------------------

interface YouTubeMeta {
  title: string;
  author: string;
  thumbnail: string;
}

interface YouTubePreviewCardProps {
  meta: YouTubeMeta;
  videoId: string;
}

function YouTubePreviewCard({ meta, videoId }: YouTubePreviewCardProps) {
  const thumb = meta.thumbnail || youTubeThumbnail(videoId);
  return (
    <div className="flex gap-3 rounded-xl border border-couch-650/70 bg-couch-850/60 p-3">
      <div className="relative w-24 h-14 shrink-0 rounded-lg overflow-hidden bg-couch-750 ring-1 ring-couch-650/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt=""
          className="object-cover w-full h-full"
          loading="lazy"
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1 justify-center">
        <p className="text-sm font-medium text-cream-100 line-clamp-2 leading-tight">
          {meta.title}
        </p>
        <p className="text-xs text-cream-400 truncate">{meta.author}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Direct URL kind chip
// ---------------------------------------------------------------------------

type DirectKind = 'hls' | 'mp4' | 'webm' | 'file';

function kindLabel(kind: DirectKind): string {
  if (kind === 'hls') return 'HLS stream';
  if (kind === 'mp4') return 'MP4';
  if (kind === 'webm') return 'WebM';
  return 'video file';
}

function classifyDirect(url: string): DirectKind | null {
  const base = classifyDirectUrl(url);
  if (!base) return null;
  if (base === 'hls') return 'hls';
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.mp4')) return 'mp4';
  if (lower.endsWith('.webm')) return 'webm';
  return 'file';
}

interface DirectKindChipProps {
  kind: DirectKind;
}

function DirectKindChip({ kind }: DirectKindChipProps) {
  const isLive = kind === 'hls';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        isLive
          ? 'bg-coal-red/15 text-coal-red ring-1 ring-coal-red/30'
          : 'bg-ember-500/12 text-ember-300 ring-1 ring-ember-500/25',
      )}
    >
      {kindLabel(kind)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// YouTube tab
// ---------------------------------------------------------------------------

interface YouTubeTabProps {
  canAdd: boolean;
  onAdd: () => void;
}

function YouTubeTab({ canAdd, onAdd }: YouTubeTabProps) {
  const { send } = useRoom();
  const [url, setUrl] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState<YouTubeMeta | null>(null);
  const [metaLoading, setMetaLoading] = React.useState(false);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastVideoIdRef = React.useRef<string | null>(null);

  // Debounce oEmbed lookup when URL changes
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = url.trim();
    const parsed = parseYouTubeUrl(trimmed);

    if (!parsed) {
      setMeta(null);
      setMetaLoading(false);
      lastVideoIdRef.current = null;
      return;
    }

    const { videoId } = parsed;
    if (videoId === lastVideoIdRef.current) return;

    setMetaLoading(true);
    setMeta(null);

    debounceRef.current = setTimeout(async () => {
      lastVideoIdRef.current = videoId;
      const result = await fetchYouTubeMeta(videoId);
      // Only apply if the videoId is still the one we asked for
      if (lastVideoIdRef.current === videoId) {
        setMeta(result);
        setMetaLoading(false);
      }
    }, 400);
  }, [url]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    const parsed = parseYouTubeUrl(trimmed);
    if (!parsed) {
      setError("that doesn't look like a youtube link");
      return;
    }
    setError(null);
    const resolvedTitle = meta?.title ?? 'YouTube video';
    const resolvedThumb = meta?.thumbnail ?? youTubeThumbnail(parsed.videoId);
    send({
      type: 'queue:add',
      item: {
        type: 'youtube',
        source: trimmed,
        title: resolvedTitle,
        thumbnail: resolvedThumb,
      },
    });
    setUrl('');
    setMeta(null);
    setMetaLoading(false);
    lastVideoIdRef.current = null;
    onAdd();
  }

  const parsed = parseYouTubeUrl(url.trim());
  const hasUrl = url.trim() !== '';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="yt-url">youtube url</Label>
        <Input
          id="yt-url"
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          className={cn(error && 'border-coal-red/60 focus-visible:border-coal-red/80')}
          autoComplete="off"
          spellCheck={false}
        />
        {error && (
          <p className="text-xs text-coal-red animate-wiggle" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Preview area */}
      {hasUrl && (
        <div className="min-h-[72px]">
          {metaLoading ? (
            <PreviewShimmer />
          ) : meta && parsed ? (
            <YouTubePreviewCard meta={meta} videoId={parsed.videoId} />
          ) : parsed && !metaLoading ? (
            /* fallback — couldn't load oEmbed, show plain thumb */
            <div className="flex gap-3 rounded-xl border border-couch-700/60 bg-couch-850/50 p-3">
              <div className="relative w-24 h-14 shrink-0 rounded-lg overflow-hidden bg-couch-750 ring-1 ring-couch-650/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={youTubeThumbnail(parsed.videoId)}
                  alt=""
                  className="object-cover w-full h-full"
                  loading="lazy"
                />
              </div>
              <div className="flex-1 flex flex-col gap-1 justify-center">
                <p className="text-sm font-medium text-cream-300">YouTube video</p>
                <p className="text-xs text-cream-400/60">couldn't load details</p>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <DialogFooter>
        {canAdd ? (
          <Button type="submit" variant="accent" size="md" disabled={url.trim() === ''}>
            add to up next
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button
                  type="button"
                  variant="accent"
                  size="md"
                  disabled
                  className="pointer-events-none"
                >
                  add to up next
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>the host turned off guest adds</TooltipContent>
          </Tooltip>
        )}
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Direct link tab
// ---------------------------------------------------------------------------

interface DirectLinkTabProps {
  canAdd: boolean;
  onAdd: () => void;
}

function DirectLinkTab({ canAdd, onAdd }: DirectLinkTabProps) {
  const { send } = useRoom();
  const [url, setUrl] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  // [sync] derive kind on the fly for the chip
  const kind = React.useMemo(() => classifyDirect(url.trim()), [url]);

  // Auto-fill title from filename when URL changes, unless user has overridden it
  const userEditedTitle = React.useRef(false);
  React.useEffect(() => {
    if (!userEditedTitle.current) {
      setTitle(url.trim() ? titleFromUrl(url.trim()) : '');
    }
  }, [url]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!isProbablyMediaUrl(trimmed)) {
      setError("that url doesn't look like a direct media link — try an mp4, webm, or m3u8");
      return;
    }
    setError(null);
    send({
      type: 'queue:add',
      item: {
        type: 'direct-url',
        source: trimmed,
        title: title.trim() || titleFromUrl(trimmed),
      },
    });
    setUrl('');
    setTitle('');
    userEditedTitle.current = false;
    onAdd();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="direct-url">direct media url</Label>
        <Input
          id="direct-url"
          placeholder="https://example.com/video.mp4"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            userEditedTitle.current = false;
            if (error) setError(null);
          }}
          className={cn(error && 'border-coal-red/60 focus-visible:border-coal-red/80')}
          autoComplete="off"
          spellCheck={false}
        />
        {error ? (
          <p className="text-xs text-coal-red animate-wiggle" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-xs text-cream-400">
            direct mp4 / webm / m3u8 links work best — regular webpages won&apos;t
          </p>
        )}
      </div>

      {/* Kind chip + title input — shown once we have a valid URL */}
      {kind !== null && (
        <div className="flex flex-col gap-3 rounded-xl border border-couch-700/50 bg-couch-850/50 p-3">
          <div className="flex items-center gap-2">
            <DirectKindChip kind={kind} />
            {kind === 'hls' && (
              <span className="text-xs text-cream-400">live stream detected</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="direct-title" className="text-xs text-cream-400">
              title
            </Label>
            <Input
              id="direct-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                userEditedTitle.current = true;
              }}
              placeholder="give it a name"
              className="h-8 text-sm"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
      )}

      <DialogFooter>
        {canAdd ? (
          <Button type="submit" variant="accent" size="md" disabled={url.trim() === ''}>
            add to up next
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button
                  type="button"
                  variant="accent"
                  size="md"
                  disabled
                  className="pointer-events-none"
                >
                  add to up next
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>the host turned off guest adds</TooltipContent>
          </Tooltip>
        )}
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Screen share tab
// ---------------------------------------------------------------------------

interface ScreenShareTabProps {
  canAdd: boolean;
  onAdd: () => void;
}

function ScreenShareTab({ canAdd, onAdd }: ScreenShareTabProps) {
  const { send, selfId, self } = useRoom();

  function handleQueue() {
    if (!self || !canAdd) return;
    send({
      type: 'queue:add',
      item: {
        type: 'screen-share',
        source: selfId,
        title: `${self.name}'s screen`,
      },
    });
    onAdd();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-couch-650 bg-couch-850 p-4">
        <div className="flex items-center gap-2 text-cream-200">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-haze-800/60 text-haze-300 shrink-0">
            <Monitor className="size-3.5" />
          </div>
          <span className="text-sm font-medium">share your screen with the room</span>
        </div>
        <p className="text-xs text-cream-400 leading-relaxed">
          queuing your screen adds you to the lineup. when it&apos;s your turn
          to play, you&apos;ll be prompted to share. your couch-mates see your
          screen streamed peer-to-peer.
        </p>
        <p className="text-xs text-cream-400/60 leading-relaxed mt-0.5">
          best for small rooms — quality depends on your upload speed 📶
        </p>
      </div>

      <DialogFooter>
        {canAdd ? (
          <Button
            type="button"
            variant="accent"
            size="md"
            onClick={handleQueue}
            disabled={!self}
          >
            queue my screen
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button
                  type="button"
                  variant="accent"
                  size="md"
                  disabled
                  className="pointer-events-none"
                >
                  queue my screen
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>the host turned off guest adds</TooltipContent>
          </Tooltip>
        )}
      </DialogFooter>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Explore tab — embeds ExploreGrid from sibling ExplorePanel task
// ---------------------------------------------------------------------------

interface ExploreTabProps {
  onPick: () => void;
}

function ExploreTab({ onPick }: ExploreTabProps) {
  return (
    <div className="min-h-[200px]">
      <React.Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-cream-400 text-sm">
            loading channels…
          </div>
        }
      >
        <ExploreGrid onPick={onPick} />
      </React.Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hosted Upload stub card (non-interactive / dimmed)
// ---------------------------------------------------------------------------

function HostedUploadStubCard() {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div
      className={cn(
        'mt-4 rounded-2xl border border-couch-700/60 bg-couch-850/50 p-4',
        'opacity-50 pointer-events-none select-none',
      )}
      aria-disabled="true"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-couch-750/60 text-cream-400 shrink-0 mt-0.5">
          <UploadCloud className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-cream-300">
            hosted upload — coming later
          </p>
          <p className="text-xs text-cream-400 mt-0.5">
            upload a file once, everyone streams it from us
          </p>

          <div className="mt-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-cream-400/60 pointer-events-none"
              tabIndex={-1}
              aria-hidden="true"
            >
              {expanded ? (
                <>
                  hide details <ChevronUp className="size-3" />
                </>
              ) : (
                <>
                  see the plan <ChevronDown className="size-3" />
                </>
              )}
            </button>

            {expanded && (
              <ul className="mt-2 flex flex-col gap-1 list-none pl-0">
                {HOSTED_UPLOAD_ROADMAP.map((item, i) => (
                  <li
                    key={i}
                    className="text-xs text-cream-400/50 pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-cream-400/40"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddToQueueDialog — main export
// ---------------------------------------------------------------------------

export interface AddToQueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddToQueueDialog({ open, onOpenChange }: AddToQueueDialogProps) {
  const { state, canControl } = useRoom();

  const canAdd =
    (state?.settings.guestsCanAddToQueue ?? true) || canControl;

  function handleAdd() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>add to queue</DialogTitle>
          <DialogDescription>
            drop something in the lineup
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="youtube">
          <TabsList className="w-full">
            <TabsTrigger value="youtube" className="flex-1">
              youtube
            </TabsTrigger>
            <TabsTrigger value="direct" className="flex-1">
              direct link
            </TabsTrigger>
            <TabsTrigger value="screen" className="flex-1">
              screen share
            </TabsTrigger>
            <TabsTrigger value="explore" className="flex-1">
              channel surf 📺
            </TabsTrigger>
          </TabsList>

          <TabsContent value="youtube">
            <YouTubeTab canAdd={canAdd} onAdd={handleAdd} />
          </TabsContent>

          <TabsContent value="direct">
            <DirectLinkTab canAdd={canAdd} onAdd={handleAdd} />
          </TabsContent>

          <TabsContent value="screen">
            <ScreenShareTab canAdd={canAdd} onAdd={handleAdd} />
          </TabsContent>

          <TabsContent value="explore">
            <ExploreTab onPick={handleAdd} />
          </TabsContent>
        </Tabs>

        {/* Disabled hosted-upload card — always shown below the tabs */}
        <HostedUploadStubCard />
      </DialogContent>
    </Dialog>
  );
}
