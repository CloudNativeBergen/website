# PWA System

## Overview

Cloud Native Days ships as an installable **Progressive Web App**: a web app
manifest, a hand-rolled service worker, a role-aware launcher, web-push
notifications, the app-icon badge, and a standalone notification history. The
pieces are deliberately explicit — there is no Serwist / next-pwa, because those
need a webpack build (this app builds with Turbopack) and their default runtime
caching would cache authenticated HTML in a multi-user, JWT-cookie app, which is
an auth leak. This document maps the surfaces and their contracts.

Key files: `src/app/manifest.ts`, `src/app/launch/route.ts`, `public/sw.js`,
`scripts/stamp-sw.mjs`, `src/components/pwa/*` (`AppBadgeSync`,
`NotificationClickSync`), and `src/app/(cfp)/notifications/page.tsx`.

## The manifest

`src/app/manifest.ts` is a Next metadata route → `/manifest.webmanifest` (Next
injects `<link rel="manifest">` automatically). `name`/`id` are kept **stable
across tenants** so the installed app identity never changes; `id` stays `/`.
Icons resolve **per host** via the dynamic `/pwa/icon/*` routes (each
conference's own `logomarkBright`, with a static fallback), in `any` and
`maskable` purposes at 192/512. `display: standalone`. `start_url` points at
`/launch` — moving the start page did not change `id`, so the installed identity
is unchanged.

## `/launch` — the role-aware start page

The installed app opens `/launch` on every fresh launch. `src/app/launch/route.ts`
is a **UI-less Route Handler** that renders nothing: it resolves the signed-in
speaker server-side (`getAuthSession()` — the same source `/admin` trusts) and
issues a per-request **307 redirect** to the right home:

| Session state                                      | Redirect target |
| -------------------------------------------------- | --------------- |
| Organizer (`session.speaker.isOrganizer === true`) | `/admin`        |
| Signed-in speaker (has session, not organizer)     | `/cfp/list`     |
| No session (attendee / logged out)                 | `/program`      |

The logged-out branch **must** land on the public `/program`, never a login wall.
The redirect carries `Cache-Control: no-store` and reads the request session, so
it is inherently dynamic and evaluated fresh every request — the service worker
treats it as a document navigation (network-first, never cached), so `/launch`
always reaches the server. It is purely a dispatcher: no data is read or
rendered, so an unauthenticated hit leaks nothing. Impersonation (dev only) is
transparent — `getAuthSession()` already swaps in the impersonated (non-organizer)
speaker, so an organizer previewing as a speaker is sent to `/cfp/list`.

## The service worker (`public/sw.js`)

Hand-rolled, minimal, explicit. Its caching contract mirrors
`src/lib/pwa/request-classification.ts`:

- **Never cache authenticated HTML/data** (`/cfp/*`, `/admin/*`, `/stream/*`,
  `/api/*`) — per-user content; a violation is an auth leak.
- **Navigations** (document requests) are **network-first**, falling back to the
  precached `/offline` shell only on network failure. Live HTML is never cached,
  so fresh HTML always references current hashed chunks → this kills post-deploy
  `ChunkLoadError`.
- **Static, content-hashed assets** (`/_next/static/*`, `/fonts/*`, `/pwa/icon/*`,
  image/font files) are **stale-while-revalidate**.
- The precache is a tiny shell only: the `/offline` page and the PWA icons.

### CACHE_VERSION stamping & the update lifecycle

`sw.js` lives at the stable URL `/sw.js`, served with `Cache-Control: no-cache`.
The browser installs a **new** worker only when the **bytes** of `/sw.js` change —
so with a hardcoded `CACHE_VERSION` the file never changes and the update
lifecycle never runs. `scripts/stamp-sw.mjs` **stamps `CACHE_VERSION` with the
deploy's commit SHA** at build time (from `VERCEL_GIT_COMMIT_SHA` /
`GITHUB_SHA`), so `/sw.js` differs every deploy and the browser installs a fresh
worker. Builds without a SHA (local dev) keep the committed `cndn-dev` default,
so the working tree stays clean. **Do not hardcode `CACHE_VERSION`** — the stamp
is what makes updates actually run. The worker does **not** call `skipWaiting()`
on install: the new worker waits until the user clicks "Reload" in the update
banner (which posts `{ type: 'SKIP_WAITING' }`). To see the latest before
reloading, a Private/Incognito tab bypasses the installed SW.

### Web push & `notificationclick`

On a `push`, the worker shows a notification with a **stable `tag`** so
successive pushes for the same subject replace each other on the device (rather
than stacking) and stores the deep link in `notification.data.url` (a sanitized,
same-origin app-relative path). On `notificationclick` it:

1. re-validates the resolved origin (belt-and-braces, falling back to `/` if it
   lands off-origin);
2. `postMessage`s `{ type: 'notification-click', url }` to every open client (so
   the in-app `NotificationClickSync` can mark the matching hub item read);
3. **focuses** a tab already on the target URL, else focuses+navigates an open
   window, else opens a new one. Routing uses `data.url`; the `tag` only drives
   OS-level collapse/replacement, never the tap target.

## `AppBadgeSync` — the app-icon badge

`src/components/pwa/AppBadgeSync.tsx` keeps the PWA app-icon badge (Badging API)
in sync with the signed-in speaker's unread notification count. It reads the
**same** `notification.unreadCount` query the bell uses (react-query dedupes it —
no extra network) and only when signed in, so signed-out public pages never fire
the protected request. `setAppBadge(count)` when count > 0, else
`clearAppBadge()`. It is **feature-detected** (a no-op where the API is absent),
**never throws** (the API can reject; every call catches), and clears the badge on
sign-out and on unmount. It renders nothing and is mounted **once app-wide** (see
`SessionProviderWrapper`).

## `NotificationClickSync` — read-on-open for every type

`src/components/pwa/NotificationClickSync.tsx` closes a gap: opening a message
thread self-clears its notification (`ConversationThread` fires `markReadByLink`
on mount), but a proposal-decision / travel / sponsor / system push lands on a
resource page that does **not**, so the bell stayed lit. It listens for the
service worker's `notification-click` message and calls
`notification.markReadByLink` with the clicked url. That mutation is
recipient-guarded, link-matched and app-relative-validated **server-side**, so it
can only ever clear the **caller's own** notification whose link equals that url —
and it is idempotent, so double-handling a message click is harmless. Also
mounted once app-wide.

## The `/notifications` page

`src/app/(cfp)/notifications/page.tsx` is the standalone notification history at
the **top-level** path `/notifications`. It lives in the `(cfp)` route group but
**outside** its `cfp/` segment, so it resolves to `/notifications` (not
`/cfp/notifications`) while inheriting the group's auth guard — any signed-in
speaker is admitted; a signed-out visitor is redirected to sign-in. It is
deliberately **not** admin-gated (the bell is cross-cutting and organizers are
speakers too), and its audience-aware Messages/settings links adapt per user. It
renders `NotificationInbox`.

## Related documents

- **`ADMIN_NOTIFICATION_SYSTEM.md`** / **`AGENTS.md` → "In-app notifications"** —
  the hub the badge and push mirror.
- **`MESSAGING_SYSTEM.md`** — the push `tag`/`url` contract for message
  notifications and the service-worker tap-through.
- **`AUTH.md`** — the session `/launch` resolves the launch role from.
