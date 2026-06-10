/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Security headers for the public deploy. Applied to every route.
   *
   * Deliberately minimal: CouchCircle embeds a third-party YouTube iframe, opens
   * PartyKit WebSockets to another origin, and uses screen-share (display-capture).
   * A heavy-handed CSP would break all three, so we ship the high-value,
   * low-risk headers and document the CSP decision in SECURITY.md instead.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            // Stop browsers from MIME-sniffing a response into an unexpected
            // type (classic vector for "this .txt is actually JS"). Zero downside.
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            // Send only the origin (not the full path/query — which can contain a
            // couch code) when navigating cross-origin; full URL stays same-origin.
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            // Drop powerful features the app never uses, so an injected/embedded
            // script can't reach for them. We explicitly DO leave display-capture
            // alone (no entry here) because screen share depends on getDisplayMedia
            // — listing it as `()` would silently break sharing.
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            // Mitigate clickjacking — nobody should be framing the room UI. (The
            // YouTube iframe is us framing THEM, which this does not affect.)
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
