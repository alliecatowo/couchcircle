/**
 * lib/explore/registry.ts — the channel surf catalog (SPRINT2 §3).
 *
 * A hand-curated, **strictly legal** lineup of free sources you can throw on the
 * TV. Every `source` URL in here was personally curl-verified at authoring time
 * (HTTP 200 + a `video/*` content-type for films, or an HLS manifest for live
 * channels). No scraping, no DRM, nothing gray — open-licensed films, public-
 * domain classics, and broadcasters who publish their own free 24/7 streams.
 *
 * Verification (2026-06): all film URLs resolve to `200 video/mp4`; archive.org
 * entries use direct `download/<item>/<file>.mp4` paths whose CDN redirects
 * resolve; live channels return a `#EXTM3U` manifest. Posters are archive.org
 * service images or Wikimedia Commons hotlinks, all verified `200 image/*`.
 *
 * Channels map onto the existing queue protocol: `type` is a {@link QueueItemType}
 * subset (`'direct-url' | 'youtube'`), `source` is the media URL, and `poster`
 * (when present) feeds `thumbnail` on `queue:add`. The whole file is pure data —
 * no runtime deps — so it imports cleanly anywhere.
 */

/** One thing you can put on the TV. `type`/`source` line up with the queue protocol. */
export interface Channel {
  id: string;
  /** lowercase, room-voice title shown on the tile + sent as the queue title */
  title: string;
  /** one short, sly line of flavor (canon voice) */
  blurb: string;
  /** film (a fixed-length feature) vs live (an always-on stream) */
  kind: 'film' | 'live';
  /** which media adapter plays it — a subset of QueueItemType */
  type: 'direct-url' | 'youtube';
  /** the media URL (direct mp4/hls) — curl-verified 200 + video/* or HLS manifest */
  source: string;
  /** poster art URL (verified 200 image/*); omit → the grid renders a title-card tile */
  poster?: string;
  /** runtime in minutes (films only) — drives the runtime chip */
  runtimeMin?: number;
  /** the license / source-of-truth string, shown as a footnote (required on every channel) */
  license: string;
}

/** A titled, tagline'd row of channels in the grid. */
export interface ExploreSection {
  id: string;
  title: string;
  /** a one-line canon-voice tagline under the section title */
  tagline: string;
  channels: Channel[];
}

// ---------------------------------------------------------------------------
// open movies — Blender Foundation open-licensed shorts/features (CC-BY).
// Direct mp4s from download.blender.org (rock-solid) and archive.org mirrors.
// ---------------------------------------------------------------------------

const OPEN_MOVIES: Channel[] = [
  {
    id: 'bbb',
    title: 'big buck bunny',
    blurb: 'a chunky rabbit, three bullies, sweet revenge',
    kind: 'film',
    type: 'direct-url',
    source: 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
    runtimeMin: 10,
    license: 'CC-BY 3.0 · Blender Foundation (Peach project)',
  },
  {
    id: 'sintel',
    title: 'sintel',
    blurb: 'a girl, a baby dragon, and a heartbreak you saw coming',
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/Sintel/sintel-2048-surround_512kb.mp4',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg',
    runtimeMin: 15,
    license: 'CC-BY 3.0 · Blender Foundation (Durian project)',
  },
  {
    id: 'tos',
    title: 'tears of steel',
    blurb: 'amsterdam, robots, and a whole lot of compositing',
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/tears-of-steel_202504/Tears%20of%20Steel.mp4',
    poster: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Tos-poster.png',
    runtimeMin: 12,
    license: 'CC-BY 3.0 · Blender Foundation (Mango project)',
  },
  {
    id: 'elephants-dream',
    title: 'elephants dream',
    blurb: 'the first open movie — a strange machine, two men, no exit',
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/ElephantsDream/ed_1024_512kb.mp4',
    poster: 'https://archive.org/services/img/ElephantsDream',
    runtimeMin: 11,
    license: 'CC-BY 2.5 · Blender Foundation (Orange project)',
  },
  {
    id: 'cosmos-laundromat',
    title: 'cosmos laundromat',
    blurb: 'a suicidal sheep gets a second chance, then a third',
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/cosmos-laundromat/Cosmos%20Laundromat.mp4',
    poster: 'https://archive.org/services/img/cosmos-laundromat',
    runtimeMin: 12,
    license: 'CC-BY 4.0 · Blender Foundation (Gooseberry project)',
  },
];

// ---------------------------------------------------------------------------
// midnight classics — public-domain features from the Internet Archive.
// Direct mp4 file URLs; posters via archive.org service images.
// ---------------------------------------------------------------------------

const MIDNIGHT_CLASSICS: Channel[] = [
  {
    id: 'notld',
    title: 'night of the living dead',
    blurb: "they're coming to get you, barbara — romero, 1968",
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/notld_201610/notld.mp4',
    poster: 'https://archive.org/services/img/notld_201610',
    runtimeMin: 96,
    license: 'public domain · Internet Archive',
  },
  {
    id: 'nosferatu',
    title: 'nosferatu',
    blurb: 'the original vampire, all shadow and long fingers — 1922',
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/Nosferatu1922/Nosferatu.mp4',
    poster: 'https://archive.org/services/img/Nosferatu1922',
    runtimeMin: 94,
    license: 'public domain · Internet Archive',
  },
  {
    id: 'the-general',
    title: 'the general',
    blurb: 'buster keaton vs a stolen train, every gag done for real',
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/TheGeneral/The_General_512kb.mp4',
    poster: 'https://archive.org/services/img/TheGeneral',
    runtimeMin: 67,
    license: 'public domain · Internet Archive',
  },
  {
    id: 'plan-9',
    title: 'plan 9 from outer space',
    blurb: 'the best worst movie ever made — wobbly graves and all',
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/plan-9-from-outer-space/plan-9-from-outer-space.mp4',
    poster: 'https://archive.org/services/img/plan-9-from-outer-space',
    runtimeMin: 79,
    license: 'public domain · Internet Archive',
  },
  {
    id: 'his-girl-friday',
    title: 'his girl friday',
    blurb: 'screwball newsroom banter at 200 words a second — 1940',
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/his_girl_friday/his_girl_friday_512kb.mp4',
    poster: 'https://archive.org/services/img/his_girl_friday',
    runtimeMin: 92,
    license: 'public domain · Internet Archive',
  },
  {
    id: 'detour',
    title: 'detour',
    blurb: 'a hitchhike to nowhere — the leanest noir ever shot, 1945',
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/detour_1945/detour_4k.mp4',
    poster: 'https://archive.org/services/img/detour_1945',
    runtimeMin: 68,
    license: 'public domain · Internet Archive',
  },
  {
    id: 'charade',
    title: 'charade',
    blurb: 'cary grant, audrey hepburn, and nobody is who they say — 1963',
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/charade_202604/Charade.mp4',
    poster: 'https://archive.org/services/img/charade_202604',
    runtimeMin: 113,
    license: 'public domain · Internet Archive',
  },
  {
    id: 'carnival-of-souls',
    title: 'carnival of souls',
    blurb: 'a drowned organist drifts toward a ghost-town pavilion — 1962',
    kind: 'film',
    type: 'direct-url',
    source: 'https://archive.org/download/carnival_of_souls/carnival_of_souls_512kb.mp4',
    poster: 'https://archive.org/services/img/carnival_of_souls',
    runtimeMin: 78,
    license: 'public domain · Internet Archive',
  },
];

// ---------------------------------------------------------------------------
// live channels — broadcasters who publish their own free, always-on HLS feeds.
// No runtime chip (they never end). All return a verified #EXTM3U manifest.
// ---------------------------------------------------------------------------

const LIVE_CHANNELS: Channel[] = [
  {
    id: 'dw-news',
    title: 'dw news',
    blurb: "germany's english news desk, live around the clock",
    kind: 'live',
    type: 'direct-url',
    source: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8',
    license: 'free official stream · Deutsche Welle',
  },
  {
    id: 'red-bull-tv',
    title: 'red bull tv',
    blurb: 'extreme sports, music, and beautiful people falling off things',
    kind: 'live',
    type: 'direct-url',
    source: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
    license: 'free official stream · Red Bull Media House',
  },
  {
    id: 'bipbop',
    title: 'test pattern',
    blurb: "apple's bip-bop reference loop — for when you just want bars",
    kind: 'live',
    type: 'direct-url',
    source:
      'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
    license: 'free public sample · Apple HLS examples',
  },
];

/** The whole channel surf lineup, in display order. */
export const EXPLORE_SECTIONS: ExploreSection[] = [
  {
    id: 'open-movies',
    title: 'open movies',
    tagline: 'open-licensed shorts the internet made together 🎬',
    channels: OPEN_MOVIES,
  },
  {
    id: 'midnight-classics',
    title: 'midnight classics',
    tagline: 'old enough to be free, good enough to stay up for',
    channels: MIDNIGHT_CLASSICS,
  },
  {
    id: 'live-channels',
    title: 'live channels',
    tagline: 'always on — flip it on and see what the world is doing',
    channels: LIVE_CHANNELS,
  },
];
