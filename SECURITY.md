# Security Policy

## Reporting

If you discover a security issue in `gametrackdaily`, please report it privately first.

Until a dedicated security inbox is published, do not open a public issue containing:

- secrets
- private workspace paths
- internal operational notes
- unpublished editorial content or manager-only data

## Scope

The most important security rule in this project is data separation:

- public content output must only come from allowlisted public-safe fields
- internal runtime data must not leak into committed public assets
- third-party content referenced in editorial coverage must respect the source's terms

## GitHub Pages host boundary

The live source is legacy Pages from main. The host supplies HTTPS/HSTS; repository files cannot configure CSP, X-Frame-Options, X-Content-Type-Options or Referrer-Policy HTTP response headers. Built HTML supplies a browser CSP and referrer meta policy, not response headers. Inline styles remain allowed for the current rendering; scripts stay self-only, objects are disabled and base/form destinations are restricted. Meta cannot enforce frame-ancestors or MIME sniffing protection. Those limitations require launch-owner acceptance or a separately approved host change; acceptance is not recorded by this code.

CI checks browser policies on built indexable routes. Run node scripts/host-security.mjs --live after building for current HSTS readback and an explicit list of unavailable response headers. No _headers file or host-setting change is claimed. No forms, payment, newsletter or Worker/API journey is shipped; contact routing awaits the approved domain, with the existing Contact Kol fallback. Dependency and redacted secret checks remain in the existing Security workflow.

The same redacted scanner also checks the built public directory after the allowlisted build. Both scan stages suppress raw logs and emit finding counts and exit status only.
