/**
 * CouchCircle — YouTube URL parsing + direct-URL classification helpers.
 *
 * Handles all common YouTube URL forms:
 *   https://www.youtube.com/watch?v=dQw4w9WgXcW
 *   https://youtu.be/dQw4w9WgXcW
 *   https://www.youtube.com/shorts/dQw4w9WgXcW
 *   https://www.youtube.com/embed/dQw4w9WgXcW
 *   https://www.youtube.com/live/dQw4w9WgXcW
 *
 * Video IDs must be exactly 11 chars of [A-Za-z0-9_-].
 * All parse failures are swallowed and return null.
 */

/** Matches a valid YouTube video ID: exactly 11 URL-safe base64 chars. */
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Parse any common YouTube URL form and return the video ID, or null if the
 * URL is unrecognised or the extracted ID is invalid.
 */
export function parseYouTubeUrl(url: string): { videoId: string } | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '');

    let videoId: string | null = null;

    if (host === 'youtu.be') {
      // https://youtu.be/dQw4w9WgXcW[?...]
      videoId = parsed.pathname.replace(/^\//, '').split('/')[0] ?? null;
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      const path = parsed.pathname;

      if (path.startsWith('/watch')) {
        // /watch?v=ID
        videoId = parsed.searchParams.get('v');
      } else if (path.startsWith('/shorts/')) {
        // /shorts/ID
        videoId = path.slice('/shorts/'.length).split('/')[0] ?? null;
      } else if (path.startsWith('/embed/')) {
        // /embed/ID
        videoId = path.slice('/embed/'.length).split('/')[0] ?? null;
      } else if (path.startsWith('/live/')) {
        // /live/ID
        videoId = path.slice('/live/'.length).split('/')[0] ?? null;
      } else if (path.startsWith('/v/')) {
        // legacy /v/ID
        videoId = path.slice('/v/'.length).split('/')[0] ?? null;
      }
    }

    if (videoId && VIDEO_ID_RE.test(videoId)) {
      return { videoId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Return the standard hqdefault thumbnail URL for a YouTube video ID.
 * No validation — callers should only pass IDs from parseYouTubeUrl.
 */
export function youTubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Classify a URL as an HLS stream, a generic playable file, or null (not
 * an http(s) URL at all — e.g. blob:, data:, or unparseable).
 *
 * - '.m3u8' → 'hls'
 * - '.mp4' | '.webm' | '.ogv' | '.mov' OR any other http(s) URL → 'file'
 * - non-http(s) → null
 */
export function classifyDirectUrl(url: string): 'hls' | 'file' | null {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    // Strip query/hash and lowercase the path extension
    const pathLower = parsed.pathname.toLowerCase();
    if (pathLower.endsWith('.m3u8')) {
      return 'hls';
    }

    // All http(s) URLs that aren't HLS are treated as 'file' (browser decides
    // if it can actually play them — not our job here).
    return 'file';
  } catch {
    return null;
  }
}

/**
 * Quick heuristic: is this URL plausibly a playable media resource or a
 * YouTube video? Used by AddToQueueDialog to validate user input before
 * sending a queue:add.
 */
export function isProbablyMediaUrl(url: string): boolean {
  if (parseYouTubeUrl(url) !== null) return true;
  return classifyDirectUrl(url) !== null;
}
