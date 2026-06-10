'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Lock, Unlock, Copy, Check } from 'lucide-react';
import { useRoom } from '@/lib/realtime/room-context';
import type { RemoteMode } from '@/shared/protocol';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * RoomSettings — controlled dialog for room configuration.
 *
 * Host can edit:
 * - Room name (text input, commit on blur/Enter)
 * - Remote mode (segmented control)
 * - Guests can add to queue (switch)
 * - Rotation auto-advance (segmented control: off / 15s / 30s / 60s)
 *
 * All participants see:
 * - Room code badge with copy button
 * - Password status
 * - Current mode highlighted (read-only for non-host)
 */
export function RoomSettings({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, isHost, send } = useRoom();

  // Guard state null
  if (!state) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent hideClose>
          <DialogHeader>
            <DialogTitle>room settings</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-cream-400">loading…</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <RoomSettingsContent
      open={open}
      onClose={onClose}
      state={state}
      isHost={isHost}
      send={send}
    />
  );
}

function RoomSettingsContent({
  open,
  onClose,
  state,
  isHost,
  send,
}: {
  open: boolean;
  onClose: () => void;
  state: NonNullable<ReturnType<typeof useRoom>['state']>;
  isHost: boolean;
  send: ReturnType<typeof useRoom>['send'];
}) {
  const settings = state.settings;
  const remote = state.remote;

  // Local edit state for room name
  const [roomNameEdit, setRoomNameEdit] = useState(settings.roomName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Reset edit state when dialog opens
  useEffect(() => {
    if (open) {
      setRoomNameEdit(settings.roomName);
    }
  }, [open, settings.roomName]);

  const commitRoomName = useCallback(() => {
    const trimmed = roomNameEdit.trim();
    if (trimmed && trimmed !== settings.roomName) {
      send({ type: 'settings:update', settings: { roomName: trimmed } });
    } else {
      // Revert to server state if empty or unchanged
      setRoomNameEdit(settings.roomName);
    }
  }, [roomNameEdit, settings.roomName, send]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitRoomName();
      }
    },
    [commitRoomName],
  );

  const handleRemoteMode = useCallback(
    (mode: RemoteMode) => {
      if (!isHost) return;
      send({
        type: 'settings:update',
        settings: { remoteMode: mode },
      });
    },
    [isHost, send],
  );

  const handleGuestsCanAdd = useCallback(
    (value: boolean) => {
      if (!isHost) return;
      send({
        type: 'settings:update',
        settings: { guestsCanAddToQueue: value },
      });
    },
    [isHost, send],
  );

  const handleRotationAdvance = useCallback(
    (seconds: number | null) => {
      if (!isHost) return;
      send({
        type: 'settings:update',
        settings: { rotationAutoAdvanceSec: seconds },
      });
    },
    [isHost, send],
  );

  // Copy invite link
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const copyInvite = useCallback(() => {
    const link = `${location.origin}/r/${state.joinCode}`;
    void navigator.clipboard?.writeText(link).catch(() => {
      /* clipboard may be blocked; intent is clear */
    });
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }, [state.joinCode]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>room settings</DialogTitle>
          <DialogDescription>
            {isHost ? 'tweak the vibe' : 'view settings'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── the room ─────────────────────────────────────────── */}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-cream-400/60">the room</p>

          {/* Room name */}
          <div className="space-y-2">
            <Label htmlFor="room-name">room name</Label>
            {isHost ? (
              <Input
                ref={nameInputRef}
                id="room-name"
                value={roomNameEdit}
                onChange={(e) => setRoomNameEdit(e.currentTarget.value)}
                onBlur={commitRoomName}
                onKeyDown={handleNameKeyDown}
                maxLength={40}
                placeholder="the couch"
              />
            ) : (
              <div className="rounded-xl border border-couch-700 bg-couch-850 px-3.5 py-2 text-sm text-cream-100">
                {settings.roomName || 'the couch'}
              </div>
            )}
          </div>

          <Separator />

          {/* ── the remote ───────────────────────────────────────── */}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-cream-400/60">the remote</p>

          {/* who can drive */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>who can drive</Label>
              {!isHost && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-cream-400">
                      host only
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    only the host can change this
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <SegmentedControl
              options={[
                { value: 'host-only', label: 'host only' },
                { value: 'request', label: 'ask first' },
                { value: 'chaos', label: 'chaos 🐒' },
              ] satisfies Array<{ value: RemoteMode; label: string }>}
              value={remote.mode}
              onChange={(val) => handleRemoteMode(val)}
              disabled={!isHost}
            />
          </div>

          {/* guests can queue stuff */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="mb-0">guests can queue stuff</Label>
              <p className="text-xs text-cream-400">
                {isHost ? 'let the crew add to up next' : 'current setting'}
              </p>
            </div>
            {isHost ? (
              <Switch
                checked={settings.guestsCanAddToQueue}
                onCheckedChange={handleGuestsCanAdd}
              />
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Switch
                      checked={settings.guestsCanAddToQueue}
                      disabled
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  only the host can change this
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* auto-pass the rotation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>auto-pass the rotation</Label>
              {!isHost && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-cream-400">
                      host only
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    only the host can change this
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <SegmentedControl
              options={[
                { value: null, label: 'manual' },
                { value: 15, label: '15s' },
                { value: 30, label: '30s' },
                { value: 60, label: '60s' },
              ] satisfies Array<{ value: number | null; label: string }>}
              value={settings.rotationAutoAdvanceSec}
              onChange={(val) => handleRotationAdvance(val)}
              disabled={!isHost}
            />
          </div>

          <Separator />

          {/* ── share ────────────────────────────────────────────── */}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-cream-400/60">share</p>

          {/* Room code & invite link */}
          <div className="space-y-2">
            <Label>copy invite</Label>
            <div className="flex gap-2">
              <Badge variant="outline" className="flex-1 justify-center font-mono tracking-widest">
                {state.joinCode}
              </Badge>
              <Button
                variant="default"
                size="icon"
                onClick={copyInvite}
                aria-label={copied ? 'copied' : 'copy invite link'}
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Password status */}
          <div className="flex items-center gap-2 text-sm text-cream-300">
            {state.passwordEnabled ? (
              <>
                <Lock className="size-3.5 text-ember-300" />
                <span>password required to join</span>
              </>
            ) : (
              <>
                <Unlock className="size-3.5 text-moss-400" />
                <span>open couch — no password</span>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * SegmentedControl — a group of buttons where exactly one is selected.
 * Styled as raised pills with active state = ember tint.
 */
function SegmentedControl<T extends string | number | null>({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1.5 rounded-xl bg-couch-850 p-1.5">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          disabled={disabled}
          className={cn(
            'flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500 focus-visible:ring-offset-1 focus-visible:ring-offset-couch-900',
            'disabled:cursor-not-allowed disabled:opacity-50',
            value === opt.value
              ? 'bg-ember-500/20 text-ember-300 border border-ember-500/30'
              : 'text-cream-300 hover:text-cream-100',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
