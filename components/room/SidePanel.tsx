'use client';

import * as React from 'react';
import { useRoom } from '@/lib/realtime/room-context';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ChatPanel } from './ChatPanel';
import { EventLog } from './EventLog';

// ─── Component ───────────────────────────────────────────────────────────────

export function SidePanel() {
  const { state } = useRoom();

  const [activeTab, setActiveTab] = React.useState<'chat' | 'activity'>('chat');

  // Track last-seen counts to drive the unread dot on the inactive tab
  const lastSeenChatCountRef = React.useRef(state?.chat.length ?? 0);
  const lastSeenEventCountRef = React.useRef(state?.events.length ?? 0);
  const [unreadChat, setUnreadChat] = React.useState(0);
  const [unreadActivity, setUnreadActivity] = React.useState(0);

  const chatCount = state?.chat.length ?? 0;
  const eventCount = state?.events.length ?? 0;

  // Sync unread counts whenever messages arrive
  React.useEffect(() => {
    if (activeTab !== 'chat') {
      const diff = chatCount - lastSeenChatCountRef.current;
      if (diff > 0) setUnreadChat((n) => n + diff);
    } else {
      lastSeenChatCountRef.current = chatCount;
      setUnreadChat(0);
    }
  }, [chatCount, activeTab]);

  React.useEffect(() => {
    if (activeTab !== 'activity') {
      const diff = eventCount - lastSeenEventCountRef.current;
      if (diff > 0) setUnreadActivity((n) => n + diff);
    } else {
      lastSeenEventCountRef.current = eventCount;
      setUnreadActivity(0);
    }
  }, [eventCount, activeTab]);

  // When user switches tab, clear that tab's unread count and sync last-seen
  function handleTabChange(tab: 'chat' | 'activity') {
    setActiveTab(tab);
    if (tab === 'chat') {
      lastSeenChatCountRef.current = chatCount;
      setUnreadChat(0);
    } else {
      lastSeenEventCountRef.current = eventCount;
      setUnreadActivity(0);
    }
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-2xl border-couch-650 shadow-[var(--shadow-lifted)]">
      {/* Cozy segmented-control tab bar */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-couch-700">
        <div className="flex gap-1 rounded-xl bg-couch-850/80 border border-couch-700/60 p-1">
          <SegmentButton
            active={activeTab === 'chat'}
            onClick={() => handleTabChange('chat')}
            label="chat"
            unread={unreadChat > 0 && activeTab !== 'chat'}
          />
          <SegmentButton
            active={activeTab === 'activity'}
            onClick={() => handleTabChange('activity')}
            label="activity"
            unread={unreadActivity > 0 && activeTab !== 'activity'}
          />
        </div>
      </div>

      {/* Tab content — each fills remaining space */}
      <div
        className={cn(
          'flex-1 overflow-hidden',
          activeTab === 'chat' ? 'flex flex-col' : 'hidden',
        )}
      >
        <ChatPanel />
      </div>

      <div
        className={cn(
          'flex-1 overflow-hidden',
          activeTab === 'activity' ? 'flex flex-col' : 'hidden',
        )}
      >
        <EventLog />
      </div>
    </Card>
  );
}

// ─── SegmentButton ────────────────────────────────────────────────────────────

interface SegmentButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  unread: boolean;
}

function SegmentButton({ active, onClick, label, unread }: SegmentButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex-1 rounded-lg py-1.5 text-sm font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-500',
        active
          ? 'bg-couch-750 text-cream-100 shadow-[inset_0_0_0_1px_rgba(240,139,52,0.18)] shadow-[var(--shadow-couch)]'
          : 'text-cream-400 hover:text-cream-200 hover:bg-couch-750/40',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <span className="relative inline-flex items-center gap-1">
        {label}
        {unread && <UnreadDot />}
      </span>
    </button>
  );
}

// ─── UnreadDot ────────────────────────────────────────────────────────────────

function UnreadDot() {
  return (
    <span
      className={cn(
        'h-1.5 w-1.5 rounded-full bg-ember-400',
        'shadow-[0_0_4px_1px_rgba(242,168,80,0.7)]',
        'animate-pulse-glow',
      )}
      aria-hidden
    />
  );
}
