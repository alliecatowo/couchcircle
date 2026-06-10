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
  isProbablyMediaUrl,
} from '@/lib/media/url-parse';
import { HOSTED_UPLOAD_ROADMAP } from '@/lib/media/hosted-upload-stub';

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    const parsed = parseYouTubeUrl(trimmed);
    if (!parsed) {
      setError("that doesn't look like a youtube link");
      return;
    }
    setError(null);
    send({
      type: 'queue:add',
      item: {
        type: 'youtube',
        source: trimmed,
        title: 'YouTube video',
        thumbnail: youTubeThumbnail(parsed.videoId),
      },
    });
    setUrl('');
    onAdd();
  }

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

      <DialogFooter>
        {canAdd ? (
          <Button type="submit" variant="accent" size="md" disabled={url.trim() === ''}>
            add to queue
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
                  add to queue
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
  const [error, setError] = React.useState<string | null>(null);

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
        title: titleFromUrl(trimmed),
      },
    });
    setUrl('');
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

      <DialogFooter>
        {canAdd ? (
          <Button type="submit" variant="accent" size="md" disabled={url.trim() === ''}>
            add to queue
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
                  add to queue
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
      <DialogContent className="max-w-md">
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
        </Tabs>

        {/* Disabled hosted-upload card — always shown below the tabs */}
        <HostedUploadStubCard />
      </DialogContent>
    </Dialog>
  );
}
