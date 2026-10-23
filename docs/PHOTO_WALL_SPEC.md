# Photo Wall

Status: **ready for implementation**. This spec is where the wayfinder map
[Photo Wall for attendee photos](https://github.com/CloudNativeBergen/website/issues/1474)
ends up. Every decision below was made on a closed map ticket or by the user
while this spec was written (§3). The spec gathers them and links to the
ticket that holds each one's reasoning; to change a decision, reopen its
ticket.

Two kinds of statement aren't map decisions, and each is marked where it
appears:

- **Refinement (spec):** a rule the decisions left open, settled here because
  an implementer can't build without it. None changes what a decision says.
- **Implementation detail:** an engineering choice that changes nothing an
  attendee or organizer can observe. Named helpers, field names, procedure
  names, tags, routes of API endpoints and file locations are implementation
  details unless marked otherwise; an implementer may pick better ones.

**Deadline.** The **Monday cut** (§13, slices M1–M6) runs at Cloud Native Days
Norway 2026 on **Monday 26 October 2026**, with a trial run on **Sunday 25
October** (§14). The post-event slices follow: the retention cron before **26
November 2026**, everything else before KontainerKonf 2026 on **12 November**.

## 1. What this delivers

Every conference can have a **Photo Wall**. Attendees scan a QR code, take or
pick a photo on their phone, choose a filter, add a short caption and
optionally their name, and post it as a **Wall Post**. Nobody sees it until an
organizer approves it. Approved posts appear on the public **Wall page** and
on the venue screens (**Screen Mode**) within seconds, and a removed post
leaves them just as fast. Contributors see their own posts' status on their
phone and can delete them. Everything is hard-deleted 30 days after the
conference.

### Out of scope

- **Video Wall Posts** and **importing social-media posts or hashtags.**
  Later efforts; nothing here rules them out (§4 keeps the photo in its own
  object).
- **Promoting a Wall Post into the conference photo gallery.** The gallery
  (`sanity/schemaTypes/imageGallery.ts`, `src/lib/gallery/`) is a separate
  system and stays untouched.
- **Moderator Links for volunteers**, a **named moderator role**, and any
  **automatic safety check** (from
  [Decide how organizers moderate Wall Posts](https://github.com/CloudNativeBergen/website/issues/1479)).
- **Editing a Wall Post**, by its contributor or by an organizer. A post is
  approved or rejected exactly as sent.
- **Sign-in for contributors.** Anyone with the link can post.
- **Push delivery** (SSE, WebSockets, Sanity Live). Screens and phones poll a
  cached list (§8).

## 2. Vocabulary

From `CONTEXT.md` (section "Photo Wall", landing in the same PR as this spec):
**Photo Wall**, **Wall Post**, **Screen Mode**, **Wall Look**, **Posting
Window**. Two words are taken: **gallery** is the organizers' official photos,
and **post** alone is what a marketing publishing Task produces. Say
"Wall Post" in code, copy and docs.

Terms used only in this spec:

- **Wall page**: the public page of a Photo Wall, `/wall`, for phones and
  laptops.
- **Composer**: the page where a contributor makes a Wall Post, `/wall/post`.
  The QR code points here.
- **My posts**: the list, on the composer page, of the Wall Posts made from
  this phone.
- **Device key**: the hash of the device cookie's token that a Wall Post
  stores to know which phone made it (§6.1).

`/wall`, `/wall/post` and `/wall/screen` live in `src/app/(public)/wall/`, like
`/f`: no site navigation, each with its own minimal header (Screen Mode with
none). _Implementation detail._

## 3. Decision index

| Topic                                                                 | Decided in                                                                                                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| How vendors do it (reference only)                                    | [Research: how established photo walls work and look](https://github.com/CloudNativeBergen/website/issues/1475)                  |
| Storage, upload path, live delivery facts                             | [Research: storing Wall Post photos and delivering them live](https://github.com/CloudNativeBergen/website/issues/1476)          |
| Composer: Polaroid composer + My posts, 9 baked filters, caption ≤ 80 | [Prototype the phone flow for creating a Wall Post](https://github.com/CloudNativeBergen/website/issues/1477)                    |
| Wall Looks, screen behaviour, whole photo + square crop position      | [Prototype the Photo Wall look: tiled vs polaroid, and Screen Mode](https://github.com/CloudNativeBergen/website/issues/1478)    |
| Moderation                                                            | [Decide how organizers moderate Wall Posts](https://github.com/CloudNativeBergen/website/issues/1479)                            |
| Posting Window, retention, consent, erasure                           | [Decide the Photo Wall window, retention, consent and erasure](https://github.com/CloudNativeBergen/website/issues/1480)         |
| Build, the Monday cut, what follows                                   | [Decide whether to build the Photo Wall or pilot a vendor](https://github.com/CloudNativeBergen/website/issues/1481)             |
| Upload limits and server checks (folded into the spec ticket)         | [Decide upload limits and server-side checks for anonymous Wall Posts](https://github.com/CloudNativeBergen/website/issues/1482) |
| Limits, sponsor strip, flaky Wi-Fi, trial run (user, 2026-10-23)      | [Write the Photo Wall spec and implementation tickets](https://github.com/CloudNativeBergen/website/issues/1483)                 |

Decided by the user while this spec was written (2026-10-23):

- **Limits** exactly as in §6.3 (the "4 MB" cap is taken as 4 MiB, 4,194,304
  bytes).
- **Sponsor strip** on Screen Mode, switchable per wall by an organizer, **in
  the Monday cut** (§9.4).
- **Trial run**: the user runs the checklist in §14 on production on Sunday 25
  October, and again on the venue screen on Monday before the doors open.

## 4. Data model

Two new document types. `conference` is **not** touched (it is append-only,
`AGENTS.md`, and nothing here needs a field on it).

### 4.1 `photoWall` (one per conference)

| Field          | Type                                         | Notes                                                                                                                        |
| -------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `_id`          | `photoWall-<conferenceId>`                   | Deterministic, so a second "Set up" converges (`createIfNotExists`). _Implementation detail._                                |
| `conference`   | reference → `conference`, required           | The tenancy key (`conference._ref == $conferenceId`).                                                                        |
| `postingMode`  | `'open' \| 'paused'` (M1), `'auto'` (P2)     | Monday offers **Open** and **Paused** only; a missing value reads as `paused`. P2 adds `auto` and makes it the default (§7). |
| `sponsorStrip` | boolean, default `false`                     | Screen Mode shows the sponsor strip when true (§9.4).                                                                        |
| `look`         | `'pinboard' \| 'mosaic' \| 'spotlight'` (P3) | Absent until P3; reads as `pinboard`.                                                                                        |
| `closedAt`     | datetime                                     | Set by the retention cron before it deletes anything: the wall is closed to writes (§11.1).                                  |
| `purgedAt`     | datetime                                     | Set by the retention cron when the deletion is done (§11.1).                                                                 |

**A conference without a `photoWall` document has no Photo Wall:** `/wall`,
`/wall/post` and `/wall/screen` return 404, and the upload route refuses. An
organizer creates it with **Set up the Photo Wall** on the admin page (§10),
which creates it paused. _Refinement (spec):_ this keeps the routes from
appearing on every tenant's domain the day this ships.

### 4.2 `wallPost`

| Field              | Type                                                                 | Notes                                                                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_id`              | `wallPost-<uploadId>`                                                | `uploadId` is the UUID v4 in the upload's pathname (§6.2), so a double submit converges on one document.                                                                                                                                                                               |
| `conference`       | reference → `conference`, required                                   |                                                                                                                                                                                                                                                                                        |
| `status`           | `'uploading' \| 'pending' \| 'approved' \| 'notShown' \| 'deleting'` | **Not shown** covers both Reject and Remove (#1479). `uploading` is the reservation Start writes (§6.2); it isn't a Wall Post yet, and no list, count or page shows it except the limits. `deleting` marks a Delete in progress (§12); only its contributor and the admin page see it. |
| `photo`            | object                                                               | `pathname` (private store), `publicUrl` (set only while approved), `width`, `height`, `bytes`. Its own object, so a later video can sit beside it.                                                                                                                                     |
| `crop`             | `{ x: number, y: number }`, each 0–1                                 | The square crop's position (CSS `object-position` semantics) on the whole photo. The square's side is the photo's short edge; there is no zoom.                                                                                                                                        |
| `caption`          | string ≤ 80, optional                                                | Normalised on the server (§6.4).                                                                                                                                                                                                                                                       |
| `name`             | string ≤ 40, optional                                                |                                                                                                                                                                                                                                                                                        |
| `marketingConsent` | boolean                                                              | The optional checkbox (#1480). The contributor can untick it later.                                                                                                                                                                                                                    |
| `deviceKey`        | string                                                               | §6.1. Never the raw cookie token.                                                                                                                                                                                                                                                      |
| `startedAt`        | datetime                                                             | When Start wrote the reservation. Server time.                                                                                                                                                                                                                                         |
| `submittedAt`      | datetime                                                             | When Submit accepted it. Server time.                                                                                                                                                                                                                                                  |
| `approvedAt`       | datetime                                                             | Set on every approval (also re-approval from Not shown). Orders the wall: newest approval first.                                                                                                                                                                                       |
| `decidedAt`        | datetime                                                             | Last Approve, Reject or Remove.                                                                                                                                                                                                                                                        |

Studio shows both types read-only (organizers moderate on the admin page, not
in Studio). _Implementation detail._

**What is never stored:** an unfiltered or uncropped original, EXIF or GPS
data, the contributor's IP address, user agent or email.

## 5. Storage

From [Research: storing Wall Post photos and delivering them live](https://github.com/CloudNativeBergen/website/issues/1476):
a pending photo must never be publicly fetchable by URL, so it can't be a
Sanity asset (public on `cdn.sanity.io` even on a private dataset) or a public
Blob with a secret suffix.

- **Pending photos** go to a **new private Vercel Blob store** (access mode is
  fixed per store). Pathname `photo-wall/<conferenceId>/<deviceKey>/<uploadId>.jpg`.
- **Approval copies** the bytes into the **existing public Blob store**
  (`BLOB_READ_WRITE_TOKEN`) at `photo-wall/<conferenceId>/<uploadId>.jpg` with
  a random suffix and `cacheControlMaxAge: 60` (Vercel's floor; the SDK doesn't check it), and stores
  the URL in `photo.publicUrl`. Blob's `copy()` works within one store only, so
  "copy" means: `get(pathname, { access: 'private', token })`, buffer the
  stream (≤ 4 MiB), `put()` to the public store.
- **Remove deletes exactly the copy it takes down**, the `publicUrl` of the
  revision it is guarded on, and **deletes it before** patching the post
  (§10). A later re-approval's new copy is never touched, and a failed delete
  leaves the post on the wall with an error for the organizer, never a
  silently orphaned public photo.
- **Delete and the cron delete every copy:** in the public store every blob
  under `photo-wall/<conferenceId>/<uploadId>` (the UUID makes the prefix
  unique); in the private store the document's `photo.pathname`, which is
  `photo-wall/<conferenceId>/<deviceKey>/<uploadId>.jpg` (a public-store prefix
  doesn't match it). This runs after the post is marked `deleting`, so no
  approval can start a new copy (§12).
- Removing keeps the private original, so an organizer can approve again from
  Not shown.

Neither copy goes through Sanity's asset pipeline, so the Sanity CDN's missing
CORS for tenant domains never applies.

### 5.1 Showing photos

- **Approved photos** are rendered from `publicUrl` with a plain `<img>`,
  **never `next/image`**: `next.config.ts` allows the Blob host in
  `remotePatterns`, and the image optimizer would keep serving a removed photo
  from `/_next/image` for its `minimumCacheTTL` (4 hours by default in Next 16).
  This holds on the Wall page, Screen Mode, the admin page and My posts.
- **Nor may anyone else send a Wall Post photo through the optimizer.**
  `/_next/image?url=<publicUrl>` works for anyone who knows the URL while the
  Blob host is in `remotePatterns`. Narrow the Blob entry in `next.config.ts`
  with `pathname` globs for the prefixes that existing `next/image` users need,
  so no `photo-wall/` path is eligible, and test that a direct optimizer
  request for one is refused.
- **Pending and Not shown photos** have no public URL. Two route handlers
  stream them from the private store, both checking **before** `get()` and
  answering `Cache-Control: private, no-store`:
  - `/wall/post/photo/<uploadId>` for My posts: the pathname is rebuilt from
    the request's own `konf_wall` cookie (§6.1) and the conference serving the
    request, so a phone only ever sees its own photos.
  - `/api/admin/photo-wall/photo/<uploadId>` for the admin page: an organizer
    of the conference serving the request, and a `wallPost` of that conference.

  A foreign, unknown or still-`uploading` id gets the same 404 from either
  route.

**User prerequisite, the first step of the Monday plan (M3b can't be tried on
a preview, nor the Sunday trial run, without it):** create a
**private** Blob store in the Vercel project (region `fra1` or `arn1`, per the
research), connect it to Production, Preview and Development with the
environment prefix `PHOTO_WALL_PRIVATE`, which should give **`PHOTO_WALL_PRIVATE_READ_WRITE_TOKEN`**, and add it to `fnox.toml` for local runs. Every slice uses that one name; if Vercel names it differently, the user records the real name on the parent issue. Every call against the private store passes
that token explicitly. Production environment changes are the user's call.

**No new subprocessor.** Vercel is already disclosed for file storage; its
wording widens to photos (§12).

## 6. Posting a Wall Post

### 6.1 Device cookie

_Same pattern as Feedback Responses (`src/lib/feedback/device.ts`)._

- Name **`konf_wall`**, `httpOnly`, `secure` outside development,
  `SameSite=Lax`, **`Path=/wall`**. **Everything that needs the cookie lives
  under `/wall`:** the Server Actions of `/wall/post` (they post to the page's
  own path), the upload route `/wall/post/upload` and the photo route
  `/wall/post/photo/<uploadId>`. **Never tRPC:** `/api/trpc` doesn't receive a
  `/wall` cookie (the Feedback precedent, `SPEAKER_FEEDBACK_SPEC.md` §7.3).
- Value: a 16-byte random token plus its issue time, HMAC-SHA256-signed with
  `INVITATION_TOKEN_SECRET`, as `deviceCookie()` does. A cookie whose
  signature doesn't verify is treated as absent.
- **Issued** by the start step (§6.2) when the phone has no valid cookie.
  **Lifetime:** until the end of the wall's deletion date (§11.1); the cookie
  is strictly necessary (#1480).
- **Device key** = the first 32 hex characters of SHA-256 of the token. Posts
  store the key, never the token, so a dataset read can't impersonate a
  phone.

A phone that loses its cookie loses My posts and gets a fresh set of limits.
Accepted: human approval is the gate, the per-wall cap bounds the queue
(§6.3), and one venue IP is shared by everyone, so there is no IP limit (the
Feedback precedent,
[#1417](https://github.com/CloudNativeBergen/website/issues/1417)).

### 6.2 The three steps

A phone photo is 3–12 MB and Vercel Functions accept 4.5 MB at most, so the
JPEG goes straight from the phone to Blob with a server-minted token.

1. **Start** (Server Action `startWallPost()`). Resolves the conference from
   the domain; refuses if there is no wall or posting isn't open (§7); issues
   the cookie if needed; checks the limits (§6.3); then **writes a
   reservation**: a `wallPost-<uploadId>` document with a new UUID v4,
   `status: 'uploading'`, the conference, the device key and `startedAt`. It
   returns the pathname `photo-wall/<conferenceId>/<deviceKey>/<uploadId>.jpg`.
2. **Upload** (client `upload()` from `@vercel/blob/client` with `access:
'private'` and `handleUploadUrl: '/wall/post/upload'`). The route reads the cookie and resolves the conference **before** calling `handleUpload` (`onBeforeGenerateToken` receives only the pathname and client payload, not the request); `onBeforeGenerateToken` closes over them and **throws** to refuse unless:
   - the pathname is exactly `photo-wall/<this conference>/<this cookie's
device key>/<UUID v4>.jpg`;
   - a reservation `wallPost-<uploadId>` exists with that conference and device
     key, `status: 'uploading'`, and `startedAt` less than 10 minutes ago;
   - the wall exists and posting is open.

   The token binds that **pathname**, `allowedContentTypes: ['image/jpeg']`,
   `maximumSizeInBytes: 4 MiB` (4,194,304 bytes), `validUntil: now + 10 min`,
   `addRandomSuffix: false` and `allowOverwrite: false`, and is passed the
   private store's token. `onUploadCompleted` does nothing: it doesn't fire for
   local development, and no rule here depends on it.

   Without a reservation there is no token, and reservations count against the
   limits (§6.3), so a script that skips Start can't mint tokens, and one that
   calls Start can hold at most 3 uploads at a time per cookie.

3. **Submit** (Server Action `submitWallPost({ uploadId, caption, name, crop,
marketingConsent })`). In this order, **guard before fetch**:
   1. a valid cookie, and an `uploadId` that is a UUID v4;
   2. the document `wallPost-<uploadId>` exists, belongs to this conference and
      this cookie's device key; otherwise the generic refusal, the same for a
      foreign and an unknown id;
   3. **already submitted** (any status but `uploading`): return success and do
      nothing else. A retry after a lost response never refuses and never
      touches the photo;
   4. the wall exists, posting is open, and the limits allow it (§6.3, not counting this `uploadId`);
   5. only then read the blob at the pathname rebuilt from **its own cookie's**
      device key and run the checks in §6.4.

   On success it patches the reservation to `status: 'pending'` with the post's
   fields and `submittedAt`, guarded with `ifRevisionId`, and expires the admin
   and device tags (§8). On a refusal at steps 4–5 it deletes the blob and the reservation, but **only
   while the document is still `uploading`**, so it can never destroy a submitted
   post's photo. Sanity has no revision-guarded delete, so this is **one
   transaction**: `patch(id).ifRevisionId(rev).set({ status: 'cleaning' })` plus
   `delete(id)`, which fails as a whole if the document moved since it was read;
   the blob is deleted only after that transaction commits.

**Reads that decide** (the limits, the reservation and revision reads here and
in §10) use the **non-CDN** Sanity client (`src/lib/sanity/client.ts`); a CDN
read lags the previous write.

Reservations whose upload never arrives, or that are never submitted, stop
counting after 10 minutes. The daily sweep (§11.2, slice P1) deletes those
older than 24 hours with their blobs. Until P1 ships they stay, unreachable and
shown nowhere, and the retention cron deletes them with the wall.

### 6.3 Limits

| Limit                                | Value                   | Phone shows                                                                        |
| ------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------- |
| Pending posts per device, at once    | **3**                   | "You have 3 photos waiting for approval. You can post again once one is approved." |
| Posts per device, rolling 60 minutes | **10** (by `startedAt`) | "You've posted 10 photos in the last hour. Try again a bit later."                 |
| Pending posts per wall, at once      | **200**                 | "Lots of photos are waiting right now. Try again in a few minutes."                |
| Posting not open                     | §7                      | "The wall isn't open for photos right now." with a link "See the wall".            |
| Any other refusal or failure         |                         | "Something went wrong. Your photo wasn't posted. Try again."                       |

"Pending" in both pending limits counts `pending` posts **plus**
`uploading` reservations younger than 10 minutes. The hourly limit counts every
document of the device with `startedAt` in the last 60 minutes, whatever its
status (a refused reservation is deleted, so it doesn't count).

The limits are checked at Start (so nobody uploads for nothing) and again at
Submit, there not counting this `uploadId`. Two phones racing the last of the
200 can overshoot by one; accepted.
Organizers don't see refusals; the pending count shows how full the queue is.

### 6.4 What the server checks at Submit

| Check          | Rule                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exists         | The blob at the rebuilt pathname exists in the private store.                                                                                                                 |
| Size           | ≤ 4 MiB, 4,194,304 bytes (the token already caps it; checked again on the bytes read).                                                                                        |
| Type           | The bytes start with the JPEG signature (`sniffImageType()` in `src/lib/marketing-asset/image-type.ts`) and end with an EOI marker.                                           |
| Dimensions     | Read from the JPEG's SOF marker: long edge ≤ **2048 px**, short edge ≥ **320 px**.                                                                                            |
| No metadata    | No APP1 segment (`Exif` or XMP). The composer strips every APPn but APP0 (§6.5), so its presence means the file didn't come from the composer: refused, not stripped.         |
| Caption        | Unicode NFC; control characters removed; any run of whitespace (newlines included) becomes one space; trimmed; empty becomes absent; more than **80** code points is refused. |
| Name           | Same normalisation; more than **40** code points is refused.                                                                                                                  |
| Crop           | `x` and `y` are finite numbers in [0, 1].                                                                                                                                     |
| Marketing      | A boolean; anything else is refused.                                                                                                                                          |
| Posting Window | Open at Submit time (§7), not just at Start.                                                                                                                                  |

_Refinement (spec):_ "it decodes" is checked **structurally** (signature, SOF,
EOI), not by a full decode: the repo has no image decoder dependency (`sharp`
is only Next's optional one), and adding one for this is not worth it on the
Monday timeline. The organizer sees the rendered photo before approving, which
is the real gate.

### 6.5 The composer (`/wall/post`)

From [Prototype the phone flow for creating a Wall Post](https://github.com/CloudNativeBergen/website/issues/1477)
(variant A, plus B's My posts), revised by the look ticket and #1480.

- **Landing:** the conference logo, "Add your photo to the wall", and two
  buttons: **Take a photo** (`<input type="file" accept="image/*"
capture="environment">`) and **Choose from your photos** (no `capture`).
  My posts, if this phone has any, sits below.
- **Composer (one screen):** the polaroid card is the editor. A square photo
  window you drag to reposition (sets `crop`), the **filter strip** below it,
  the caption in the card's handwritten strip (counter, 80 max), and
  **Your name (optional)** (40 max).
- **Filters:** Original, Vivid, Warm, Fade, Fjord, Aurora, Mono, Noir, Retro,
  matching the prototype's look. Baked into the uploaded JPEG.
- **Consent:** a passive line above the button, no checkbox and no gate:

  > Your photo, caption and name are shown on the screens at the venue and on
  > the public wall on this website until <deletion date>. Only post photos
  > the people in them are happy with. [Privacy](/privacy#photo-wall)

- **Marketing:** an optional checkbox, **unticked by default**: "The
  organizers may also use my photo in their own marketing."
- **Post to the wall** runs Start → Upload (with progress) → Submit, then shows
  My posts with the new card on top, "Waiting for approval".
- **Outside the Posting Window** the page shows only "The wall isn't open for
  photos right now." and **See the wall**, plus My posts.

**Photo processing on the phone** (_Implementation detail_, but each point is
checked in §14):

- Decode with `createImageBitmap(file)`, which applies the EXIF orientation.
  A file the browser can't decode (for example HEIC on some Android browsers)
  shows "This photo couldn't be opened. Try another one, or take a new photo."
- Resize so the long edge is ≤ 2048 px. iOS canvases are capped (about 4,096
  px on a side, 16.7 M pixels), so a 24/48 MP photo is downscaled with
  `createImageBitmap` resize options where supported, else in two steps.
- Apply the filter to the resized pixels, then `canvas.toBlob('image/jpeg',
0.85)`; if the result is over 4 MiB, retry at 0.7. The re-encode drops the
  camera's EXIF and GPS and turns HEIC into JPEG.
- **Then strip every APPn segment except APP0 from the encoded bytes** (a
  marker walk, no decoder). Safari's canvas encoder may write a minimal Exif
  APP1 of its own (unverified); without this step the server's no-APP1 rule
  (§6.4) would refuse every iPhone post. M2 inspects a real iPhone's output
  for APP1 and keeps a Safari-made sample as a test fixture.
- The preview runs the **same** filter code on a small copy, so what the
  contributor sees is what is uploaded. Don't rely on
  `CanvasRenderingContext2D.filter` without checking it on iOS Safari; a
  per-pixel colour matrix is the safe implementation.
- The handwritten face is Caveat, as in the prototype.

## 7. Posting Window

- **Monday (M1):** `photoWall.postingMode` is **Open** or **Paused**, set on
  the admin page. A new wall starts Paused. There is no date automation.
- **Later (P2):** adds **Automatic**, the default: open from 00:00 on the
  conference's `startDate` to 23:59:59 on its `endDate`, Europe/Oslo
  (`CONFERENCE_TIME_ZONE` in `src/lib/time.ts`). Open and Paused remain as
  overrides ("open early" and "pause"). P2 also makes a missing `postingMode`
  read as `auto`.
- Every refusal path (Start, the upload route, Submit) uses one function,
  `isPostingOpen(wall, conference, now)`. _Implementation detail._
- Viewing is never gated by the window: the Wall page and Screen Mode show the
  wall until it closes (§11.1).

## 8. Live delivery

From the storage research: polling a `'use cache: remote'` list that is
expired on change costs about 1–4k Sanity reads per edition; polling Sanity
directly would cost about 30% of the monthly quota. **Browsers never query
Sanity.** _Tags and function names below are implementation details._

| Cached read                                                                                                                                                                  | Tag                               | Expired by                                                                                                                                        | Polled by                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `getWall(conferenceId)`: settings + the newest **200** approved posts (`id`, `publicUrl`, `width`, `height`, `crop`, `caption`, `name`, `approvedAt`), newest approval first | `photo-wall:<conferenceId>`       | Approve, Reject/Remove of an approved post, Delete (the contributor's or Delete now) of an approved post, any settings change, the retention cron | Screen Mode every **5 s**, always; the Wall page every **10 s** while visible     |
| `getModerationQueue(conferenceId)`: every post except reservations, with its status, and the pending count                                                                   | `photo-wall-admin:<conferenceId>` | Submit, every moderation action, contributor Delete and marketing change, the cron                                                                | The admin page every **10 s** while visible                                       |
| `getMyPosts(conferenceId, deviceKey)`: this device's posts, except reservations                                                                                              | `photo-wall-device:<deviceKey>`   | Submit, Delete, marketing change by that device; any moderation of a post with that `deviceKey`                                                   | My posts on load, after each action, and every **15 s** while the page is visible |

- **Inside each cached function**, read with the **uncached** Sanity client
  (`clientReadUncached`), never the CDN one: a tag expiry refills from Sanity,
  and the Sanity CDN can still hold the old answer (the
  `src/lib/feedback/attendee.ts` precedent). Use the `default` `cacheLife`
  profile; freshness comes from the tags, not from a short lifetime.
- **Endpoints.** `getWall` and `getModerationQueue` are tRPC queries (public and
  `adminProcedure`), resolving the conference with `resolveConferenceId()` and
  never accepting it from the client. **`getMyPosts` is a Server Action of
  `/wall/post`**, because it needs the `/wall` cookie (§6.1); it reads the
  device key from the cookie on the server.
- **Polling.** **None of these pollers uses `useIdlePolling()`'s idle stop:**
  that hook stops after five minutes without interaction
  (`src/hooks/useIdlePolling.ts`), and nobody touches a venue screen, a
  phone waiting for its post, or an organizer's phone in a pocket. The Wall
  page, the admin page and My posts poll while the page is visible
  (`refetchInterval` paused on `visibilitychange`); Screen Mode polls every 5 s
  for as long as it is open.
- **Expiry call:** Server Actions (Submit, Delete, marketing) use `updateTag`;
  the admin's tRPC mutations run in the `/api/trpc` Route Handler, where
  `updateTag` throws, so they use `revalidateTag(tag, { expire: 0 })`, the
  `src/lib/feedback/cache.ts` precedent.
- **Latency** is the poll interval: a newly approved or removed post reaches
  every screen within about 5 s and every phone within about 10 s. That is
  what "immediate" means here (#1478, #1479).
- A removed post's public URL keeps answering for up to 60 s from the CDN
  (`cacheControlMaxAge`), to anyone who already has it. The wall stops showing
  it on the next poll.

## 9. The wall

Only the **Pinboard** look ships on Monday. Mosaic, Spotlight, look switching
and `?look=` are slices P3–P4 (§13), built to
[Prototype the Photo Wall look](https://github.com/CloudNativeBergen/website/issues/1478)
and its prototype (`Prototypes/PhotoWall/WallLook` on branch
`prototype/photo-wall-look`).

### 9.1 Wall page (`/wall`)

- Follows the visitor's light or dark setting. Conference logo and name at the
  top, then the approved posts as a **two-column grid of slightly tilted
  polaroids** (square crop, handwritten caption and name), newest approval
  first.
- **Add your photo** (to `/wall/post`) while posting is open.
- Footer: "In a photo and want it removed? Contact the organizers at
  <contactEmail>." (`conference.contactEmail`, #1480).
- Empty wall: "No photos yet." and **Add your photo** when open.
- After the wall closes (§11.1): only "This wall has closed."

### 9.2 Screen Mode (`/wall/screen`)

- **Always dark**, fullscreen, no site chrome, cursor hidden after 3 s still,
  and a Screen Wake Lock where the browser supports it.
- **No analytics and no install prompt.** Leaving the site chrome out isn't
  enough: the root layout (`src/app/layout.tsx`) renders `VercelInsights`,
  `TenantAnalytics` and the PWA `InstallPrompt` on every route. Exclude
  `/wall/screen` from all three, the way `/f` is excluded (PostHog's path list
  in `src/lib/posthog/config.ts`, `HiddenOnFeedbackPage`), and test that
  Screen Mode sends no analytics request. _Refinement (spec):_ a venue screen
  polling for days would otherwise count as one endless visit.
- Conference logo (`logoBright`) and brand accents (`theme.primaryColor`,
  falling back to the default theme) from the tenant's branding.
- **Pinboard:** up to **17** tilted polaroids scattered on a dark board, plus a
  **QR polaroid** "Add yours!" pointing at `/wall/post`, always dark code on a
  white card.
- **First load** shows the newest 17 with no "new" marks.
- **A new post** is an `(id, approvedAt)` pair the screen hasn't seen, so a
  post removed and approved again arrives again. It drops in on top,
  replacing the oldest card, and wears its **"new" mark for 6 s**. A burst is
  let in **one post every 2.5 s**, in approval order.
- **Idle:** every **6 s** one card swaps to an older post from the rest of the
  list, when there are more than 17.
- **Removal:** a card whose id is missing from the latest list leaves at once
  (a fade of at most 300 ms) and its slot refills from the rest of the list.
- A post is only shown once its image has loaded; an image that fails to load
  is skipped.
- Fewer than 17 posts: show those. None: a large QR card and "Be the first on
  the wall".
- After the wall closes: "This wall has closed."
- The behaviour above is fixed, with no organizer settings (#1478).

### 9.3 Screens on flaky Wi-Fi

_Decided (spec ticket):_

- A failed poll **keeps the last list**, and the screen keeps cycling through
  it. Polls continue every 5 s.
- After **3** consecutive failures a small dot in a corner marks the screen as
  offline; it goes away on the next success.
- Each successful poll returns the **whole** current list, not changes, so a
  screen that was offline catches up by itself: posts approved meanwhile enter
  as a burst, posts removed meanwhile leave at once.
- Images already loaded stay in the browser's memory and keep showing while
  offline.

### 9.4 Sponsor strip

_Decided by the user (spec ticket), in the Monday cut._

- A strip along the bottom of **Screen Mode only**, showing the conference's
  public sponsors with the existing `SponsorBanner`
  (`src/components/stream/SponsorBanner.tsx`, which scrolls and already
  applies `filterPublicSponsors`). The QR polaroid and the pinboard sit above
  it.
- **On or off per wall** with the **Sponsor strip** switch on the admin page;
  **off** for a new wall. _Refinement (spec):_ off by default so no tenant's
  screen shows logos it hasn't checked. Switching it reaches running screens
  on their next poll.
- Screen Mode loads the sponsors when the page renders; the switch arrives
  with `getWall` on every poll. A sponsor change reaches a running screen on
  its next reload. _Implementation detail._
- No sponsors with a public tier: no strip, even when switched on.
- The logos must read on the dark screen; the slice checks this visually with
  real sponsor logos.

## 10. Admin (`/admin/photo-wall`)

From [Decide how organizers moderate Wall Posts](https://github.com/CloudNativeBergen/website/issues/1479).

- **Access:** organizers of the conference's organization only
  (`denyNonOrganizer()` on the page, `adminProcedure` on every procedure).
- **Nav entry** "Photo Wall" in the admin menu. The pending-count badge on it
  is slice P6.
- **Phone-first.** One column of cards on a phone, a grid on desktop.
- **Before setup:** a short explanation and **Set up the Photo Wall** (§4.1).
- **Settings row:** **Posting** (Open / Paused; Automatic from P2) and
  **Sponsor strip** (on/off).
- **Links:** the posting link with its QR code (PNG download, reusing the
  `qr-code-styling` helper the Feedback Code uses), the Wall page link and the
  Screen Mode link, each with Copy.
- **Live pending count** at the top, from the polled queue.
- **Tabs:** **Pending**, **On the wall**, **Not shown**.
- **Card:** the whole photo with the square crop outlined, caption, name,
  submitted time (`src/lib/time.ts`), and a "Marketing OK" mark when the
  contributor ticked marketing consent.
- **Actions:**
  - Pending: **Approve**, **Reject**.
  - On the wall: **Remove**.
  - Not shown: **Approve**.
  - Every tab: **Delete now** (inline confirm: "Delete this photo for good? It
    can't be undone."), for abusive or illegal content.
  - Pending tab: **Approve all pending (N)** with an inline confirm. It
    approves the posts pending when pressed, four at a time, within a 30 s
    budget, and reports how many it approved; pressing again finishes the
    rest.
- **Every transition is guarded with `ifRevisionId`** against the non-CDN read
  it was decided from, so two organizers (or an organizer and the contributor)
  can't interleave. On a revision conflict the server re-reads once: if the
  post is gone, the card reports "This photo was deleted"; if its status no
  longer allows the action (someone else already removed it), the card
  refreshes with no change; otherwise it retries once, and **only if the post is still in the state the action began from**: Approve if it is still not approved; Remove only if `publicUrl` is still the copy it deleted (a different URL means someone re-approved, and Remove refreshes without acting). A marketing untick is the usual reason to retry.
- **Approve** copies the photo to the public store (§5), then patches the post
  (`status: approved`, `publicUrl`, `approvedAt`, `decidedAt`). If the patch
  fails for good, it deletes the copy it just made.
- **Reject** (from Pending) patches `status: notShown`; there is no public copy.
- **Remove** (from On the wall) deletes the revision's `publicUrl` first
  (retried once), then patches `status: notShown` and unsets `publicUrl`. If
  the delete fails, nothing is patched and the card says "Couldn't remove.
  Try again."; the post stays on the wall until it succeeds. If the patch
  fails after the delete, the post shows as a missing image, which Screen Mode
  skips (§9.2), until the retry. _Refinement (spec):_ this order makes a
  failure visible instead of leaving a public photo nobody can find.
- **Delete now** runs the same Delete as the contributor's (§12).
- The contributor's My posts says **Not shown**, with no reason.

## 11. Retention

From [Decide the Photo Wall window, retention, consent and erasure](https://github.com/CloudNativeBergen/website/issues/1480).

### 11.1 The 30-day deletion (slice P1, before 26 November 2026)

- **Deletion date:** the conference's `endDate` + 30 days (Cloud Native Days
  Norway 2026: **26 November 2026**).
- A daily cron (`vercel.json`, authenticated with `CRON_SECRET` like
  `/api/cron/cleanup-notifications`) finds every `photoWall` whose deletion
  date is today or past and `purgedAt` is unset. For each:
  1. **close it to writes first:** set `closedAt` (if unset) and expire the
     tags. `isPostingOpen` is false and every moderation action refuses once
     `closedAt` is set, whatever `postingMode` says, and Submit and Approve
     re-check it just before their final commit;
  2. wait out in-flight work: run the deletion only when `closedAt` is more
     than 15 minutes old (an upload token lives 10 minutes), so in practice on
     the next day's run;
  3. hard-delete every `wallPost` of the conference (Not shown included) and
     every blob under `photo-wall/<conferenceId>/` in **both** stores;
  4. set `purgedAt`.
- Re-running is safe: an interrupted run leaves `purgedAt` unset, so the next
  run repeats step 3. `closedAt` means "closed to writes", `purgedAt` means
  "deletion done".
- After it runs, the Wall page, the composer and Screen Mode say "This wall has
  closed."

### 11.2 Orphan sweep (slice P1)

The same cron deletes:

- `uploading` reservations older than 24 hours, with their private blob;
- private blobs under `photo-wall/` older than 24 hours with no `wallPost`
  document;
- public blobs under `photo-wall/` **older than an hour** that aren't the
  `photo.publicUrl` of an approved `wallPost`, rechecked on the uncached client
  just before deleting (the hour covers an Approve between its `put()` and its
  patch, the existing sweeper's age gate pattern);
- `deleting` posts older than an hour: finish their Delete (§12).

Extend the existing `/api/cron/cleanup-orphaned-blobs` (`vercel.json`) or sit
beside it; don't duplicate its listing logic.

**Monday risk:** P1 is not in the Monday cut. If it hasn't shipped by 26
November 2026, the deletion is a manual job that day (delete every `wallPost`
of the conference and both stores' `photo-wall/<conferenceId>/` prefix).

## 12. Privacy

- **Display on the wall** rests on **consent**, given by posting after the
  notice and withdrawn by deleting. **Marketing use** rests on separate
  explicit consent, the checkbox, withdrawn by unticking it. The device cookie
  is **strictly necessary**.
- **My posts** (slice M6): each of this phone's posts with its status
  (**Waiting for approval**, **On the wall**, **Not shown**), a **Delete**
  button (inline confirm: "Delete this photo? It's removed from the wall and
  can't be undone.") and a **Marketing** switch.
- **Delete** is permanent and immediate, in three steps:
  1. a revision-guarded patch to `status: 'deleting'`: the post leaves the wall
     on the next poll, and a racing Approve's guarded patch fails and deletes
     its own copy (§10);
  2. delete every blob in both stores under the post's prefix (§5), retried
     once;
  3. delete the document.

  If step 2 fails, the document stays `deleting` and the card (in My posts, and
  on the admin page) says "Couldn't delete. Try again."; Delete accepts a
  `deleting` post, so pressing again finishes it. The sweep (§11.2) also
  finishes `deleting` posts older than an hour.

- **Lost cookie:** contact the organizers, describing the photo. They use
  Delete now.
- **Exported copies** (slice P5) can't be reached by deletion; `/privacy` says
  so.

**New `/privacy` section** (`id="photo-wall"`, in
`src/app/(main)/privacy/page.tsx`), plus a `konf_wall` row in the cookie list,
and the Vercel subprocessor wording in `src/lib/legal/subprocessors.ts`
widened from "file storage for uploaded attachments" to "file storage for
uploaded attachments and photos". Draft copy:

> **Photo Wall.** If you post a photo to a conference's Photo Wall, we store
> the photo (filtered and resized on your phone, with location and other
> camera data removed), your caption, your name if you give one, how the photo
> is cropped on the wall, whether you allow marketing use, and a cookie that
> recognises your phone. Organizers see your post before anyone else; once
> they approve it, anyone can see it on the wall at the venue and on the
> conference website. We show it because you chose to post it, and you can
> withdraw that by deleting it. If you tick the marketing box, the organizers
> may also use your photo in their own marketing; untick it at any time. We
> delete every Photo Wall post 30 days after the conference. Copies the
> organizers downloaded for marketing before you unticked the box or deleted
> the post are theirs and aren't covered by that deletion. To delete a post,
> open the wall's posting page on the same phone and use My posts, or contact
> the organizers. If you are in someone else's photo and want it removed,
> contact the organizers. Photos are stored with our hosting provider, Vercel;
> no other service receives them.

`docs/PRIVACY_OPERATIONS.md` gets a line on handling a Photo Wall removal
request (find the post on the admin page, Delete now).

## 13. Slices

Every slice is filed as an issue labelled `photo-wall`, under the parent
implementation issue, with the dependencies below as native blocking edges.
Every UI slice ships its Storybook stories and is visually checked with
`pnpm shoot` at phone width (and 1920×1080 for Screen Mode, desktop for
admin), light and dark (Screen Mode: dark only), with the story file's
dark-mode mechanism checked, per `AGENTS.md`. Every new tRPC endpoint is mocked
in the affected UI tests and the mutation-surface snapshots are updated.

**Monday cut.** Build order: M1 and M2 at once; then M3a, M4a and M5a; then M3b, M4b
and M5b; then M6. The private Blob store (§5) is the user's step before M3b
can be tried on a preview.

| #   | Slice                                                                                                                                                                                                                                                                                                                                                                                                                               | After    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| M1  | **Wall setup and admin shell.** Both document types (§4); the `src/app/(public)/wall/` route group with its minimal chrome and the 404 rule for conferences without a wall (§4.1); `/admin/photo-wall` with Set up, the Posting (Open/Paused) and Sponsor strip switches, the links with the posting QR (§10); the nav entry; `isPostingOpen` (§7). Demo: an organizer sets up the wall, opens and pauses it, and downloads the QR. | —        |
| M2  | **Composer, phone side only.** `/wall/post` landing and the composer (§6.5) with the 9 baked filters, crop, caption, name, consent line and marketing checkbox, producing the JPEG and fields; no server calls yet (Storybook with mocked actions). Try it on a real iPhone as early as possible (§15). Demo: in Storybook at phone width, a picked photo becomes a filtered ≤ 2048 px JPEG with no EXIF.                           | —        |
| M3a | **Posting rules, server side.** The cookie (§6.1); the reservation write and the limit counts on the non-CDN client (§6.2, §6.3); the JPEG and field checks (§6.4); each a pure, tested module with executed GROQ and real JPEG files (§14). No route or UI.                                                                                                                                                                        | M1       |
| M3b | **Posting path.** Start, the upload route and Submit (§6.2) on M3a's modules, the phone's messages (§6.3), the window-closed page, M2's composer wired to them, and a minimal "Waiting for approval" card showing the local photo. Demo: a phone posts and the post is pending in Sanity, with its photo only in the private store.                                                                                                 | M2, M3a  |
| M4a | **Moderation, read side.** `getModerationQueue` (§8), the admin photo route (§5.1), tabs, cards and the live pending count (§10). Demo: an organizer sees pending posts with the whole photo and the crop outline on a phone.                                                                                                                                                                                                       | M1       |
| M4b | **Moderation actions.** Approve (copy to public), Reject, Remove, Approve all and Delete now with the revision guards, exact-copy and prefix deletes and their failure paths (§5, §10, §12), the tag expiries (§8), the race tests (§14). Demo (with M3b): an organizer approves a post from a phone and its public URL works; Remove makes it 404 within a minute.                                                                 | M3a, M4a |
| M5a | **Wall page.** `getWall` (§8); the Wall page (§9.1) with the plain-`<img>` rule (§5.1). Demo: with fixture posts in Storybook, and with M4b, an approval appears on a phone within 10 s.                                                                                                                                                                                                                                            | M1       |
| M5b | **Screen Mode.** Pinboard with arrivals, bursts, idle swaps and removal (§9.2), always-on polling (§8), flaky Wi-Fi (§9.3), the sponsor strip (§9.4), and the analytics and install-prompt exclusions (§9.2). Demo: an approval appears on a running screen within 5 s and a removal leaves it, after more than five minutes untouched.                                                                                             | M5a      |
| M6  | **My posts and privacy.** `getMyPosts` and the device photo route (§5.1, §8); My posts with statuses, Delete and the marketing switch (§12); the `/privacy` section, cookie row and subprocessor wording; the `PRIVACY_OPERATIONS.md` line. Demo: a contributor deletes their approved post and it leaves the Wall page.                                                                                                            | M3b, M5a |

**After the event:**

| #   | Slice                                                                                                                                                                                                                                                                                                       | After    | Due         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------- |
| P1  | **Retention cron and orphan sweep** (§11), the closed states of every page.                                                                                                                                                                                                                                 | M3b, M4b | 26 Nov 2026 |
| P2  | **Automatic Posting Window** (§7).                                                                                                                                                                                                                                                                          | M1       | 12 Nov 2026 |
| P3  | **Wall Look setting and Mosaic.** `photoWall.look` on the admin page, live on screens; `?look=` on the Screen Mode link; the Mosaic look on the Wall page and Screen Mode, from the prototype (#1478).                                                                                                      | M5b      | 12 Nov 2026 |
| P4  | **Spotlight look**, from the prototype (#1478).                                                                                                                                                                                                                                                             | P3       | 12 Nov 2026 |
| P5  | **Consented ZIP export.** Download approved posts whose contributor ticked marketing consent, as a ZIP. It must not pass through a function response over 4.5 MB: build it in the browser from the public URLs if Blob serves them with CORS, else write it to the private store and hand out a signed URL. | M4a      | 12 Nov 2026 |
| P6  | **Pending-count badge** on the nav entry (`AdminNavEntry.count`, as Feedback's flagged badge).                                                                                                                                                                                                              | M4a      | 12 Nov 2026 |

## 14. Verification

**In every PR** (per `AGENTS.md`, "Agent discipline"):

- **Guards are sabotage-proven:** every refusal in §6.2–6.4, §4.1 and §10
  (organizer only). Remove it, show the specific test fails on a value (the
  write or the token happening), restore.
- **Guard before fetch:** Submit with another device's `uploadId`, or for
  another conference, refuses without reading the blob (assert the read was
  never called) and with the same refusal as an unknown `uploadId`.
- **The token binds what §6.2 says**, shown on the real `handleUpload` from the
  installed `@vercel/blob`, not a mock: pathname, content type, size, expiry,
  no overwrite.
- **JPEG checks** on real files: a canvas-made JPEG (including a Safari-made sample, after the composer's APPn strip) passes; a camera JPEG with
  EXIF, a PNG renamed `.jpg`, a truncated file, a 4096 px image and a 200 px
  image are refused.
- **Executed GROQ, not mocks,** for the limits, `getWall`, the queue and My
  posts, including a post of another conference that must not count.
- **Cookie:** a vitest test asserts the `Set-Cookie` attributes (`Path=/wall`,
  httpOnly, `SameSite=Lax`, expiry on the deletion date) and replays the cookie
  into a second call.
- **Reservations:** the upload route refuses a pathname without a live
  reservation of this device, and a fourth Start from one device is refused
  while three reservations or pending posts are live.
- **Retry after a lost response:** Submit twice for the same `uploadId`, the
  second after pausing posting; the second returns success and the photo still
  exists.
- **Photo routes:** each refuses a foreign, unknown or `uploading` id with the
  same 404, without calling `get()`, and answers `private, no-store`.
- **No `next/image` for Wall Post photos:** a test (or lint rule) fails if a
  Wall Post photo is rendered through `/_next/image`.
- **Moderation races** on the real client: two Removes, Remove followed by a
  re-approval, and Approve racing the contributor's Delete, leave no public
  copy without an approved document, **and** an approved post's `publicUrl` still answers. Include the interleaving: Removes A and B read copy U; A completes; another organizer re-approves (copy V); B's retry must leave V alone.
- **Failure paths:** a Blob delete that fails on Remove leaves the post
  approved with the error; one that fails on Delete leaves it `deleting`, and
  pressing again finishes it.
- **Pollers keep polling:** with fake timers, past five idle minutes, an approval still arrives on Screen Mode and a removal still leaves, and My posts still turns Waiting into On the wall; a removed and re-approved
  post arrives again; Screen Mode sends no analytics request.
- **Visual:** every new component has a story; captures as in §13.

**Sunday 25 October, on production** (the user; each line is ticked on the
trial issue):

1. Admin, on a phone: Set up the Photo Wall, open posting, download the QR.
2. **iPhone, Safari:** scan the QR, **take a photo** (HEIC by default), pick
   Noir, add a caption and a name, tick marketing, post. Check the orientation
   on the admin card.
3. iPhone: **choose a portrait photo** from the library, post.
4. **Android, Chrome:** take a photo, post; choose one from the gallery, post.
5. Admin: all four are pending with the whole photo and the crop outline.
   Approve two, reject one.
6. **Screen:** open `/wall/screen` on a laptop in a private window (no stale
   service worker). The approved posts are there. Approve the rejected one
   from Not shown: it drops in with the "new" mark within about 5 s.
7. **Remove while the screen runs:** it leaves the screen within about 5 s, and
   the Wall page on a phone within about 10 s. Its public URL fails within a
   minute.
8. **Limit:** from one phone, post until the fourth pending is refused with the
   message.
9. **My posts:** statuses are right; Delete an approved post, and it leaves
   the screen.
10. **Pause:** the composer shows the closed page; a post started before the
    pause is refused at Submit.
11. **Flaky Wi-Fi:** switch the laptop's Wi-Fi off for 30 s. The screen keeps
    cycling and shows the offline dot. Remove a post meanwhile. Wi-Fi on: the
    removal catches up.
12. **Sponsor strip:** switch it on; the strip appears on the screen with
    readable logos.
13. **No location:** download an approved photo's public URL and check it has
    no EXIF (for example `exiftool`).
14. **Clean up:** Delete now every trial post, and set posting to Paused.

**Monday 26 October, before the doors open** (the user): open
`/wall/screen` on the **real venue display** in its browser, fullscreen, on
the venue Wi-Fi; check it fills the screen, stays awake and shows the QR; set
posting to Open. **Fallback** if anything fails: Pause posting and take the
screen off; nothing else depends on the wall.

## 15. Known gaps and risks

- **An Approve that loses to a Delete and then fails to delete its own new
  copy** leaves one public photo with no document. Its URL (random suffix) was
  never stored or shown anywhere, so nobody can find it; the sweep (§11.2) or
  the manual purge removes it. Accepted for Monday.
- **The limits are soft against a script.** Concurrent Starts from one cookie
  can each see the same free capacity, and deleting your own posts frees up the
  hourly count. Accepted: clearing the cookie already defeats the per-device
  limits, every post still waits for approval, and an organizer can Pause the
  wall and Delete now. The 200-per-wall cap can overshoot by the number of
  concurrent Starts.

- **Clearing cookies resets the device limits.** Accepted: approval is the gate
  and the 200-pending cap bounds the queue.
- **"Immediate" is up to one poll interval** (about 5 s on screens, 10 s on
  phones), not push.
- **A removed photo's public URL** answers for up to 60 s more to anyone who
  has it (§8).
- **The JPEG check is structural** (§6.4); a crafted file that passes it but
  doesn't render is caught by the organizer's eye.
- **HEIC on Android** depends on the browser's decoder; the phone shows the
  "couldn't be opened" message when it fails.
- **iOS photo handling** (orientation, large photos, what the file input hands
  over for HEIC) was not verified by the research. The Sunday trial is the
  first real check; M2 should try it on a real iPhone as early as possible.
- **The PWA service worker** can serve an old bundle to a screen
  (`public/sw.js`). The trial uses a private window; the venue browser should
  too, or be reloaded after the last deploy.
- **No automatic deletion on Monday.** P1 is due 26 November 2026; §11.2 has
  the manual fallback.
- **Approve all** with many pending posts may need more than one press (30 s
  budget).
- **ZIP export** depends on Blob's CORS behaviour or a server-side ZIP (P5).
