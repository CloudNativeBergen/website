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
- **Photos of a talk** (tagging a Wall Post with a talk, shown on the program
  and speaker pages): [its own spec](PHOTO_WALL_TALK_PHOTOS_SPEC.md).

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
- **Photos are stored in Sanity**, as image assets, decided after the spec's
  review (2026-10-23). This replaces the private-Blob-then-copy storage from
  [Decide whether to build the Photo Wall or pilot a vendor](https://github.com/CloudNativeBergen/website/issues/1481).
  The trade-off, accepted: a Sanity asset is public on `cdn.sanity.io` to
  anyone with its URL, including while it is pending (§5).

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
| `look`         | `'pinboard' \| 'mosaic' \| 'spotlight'` (P3) | The Wall Look (§9). Missing or unknown reads as `pinboard`.                                                                  |
| `closedAt`     | datetime                                     | Set by the retention cron before it deletes anything: the wall is closed to writes (§11.1).                                  |
| `purgedAt`     | datetime                                     | Set by the retention cron when the deletion is done (§11.1).                                                                 |

**A conference without a `photoWall` document has no Photo Wall:** `/wall`,
`/wall/post` and `/wall/screen` return 404, and the submit route refuses. An
organizer creates it with **Set up the Photo Wall** on the admin page (§10),
which creates it paused. _Refinement (spec):_ this keeps the routes from
appearing on every tenant's domain the day this ships.

### 4.2 `wallPost`

| Field              | Type                                                  | Notes                                                                                                                                                                                                            |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_id`              | `wallPost-<uploadId>`                                 | `uploadId` is a UUID v4 the phone picks per post (§6.2), so a retried submit converges on one document.                                                                                                          |
| `conference`       | reference → `conference`, required                    |                                                                                                                                                                                                                  |
| `status`           | `'pending' \| 'approved' \| 'notShown' \| 'deleting'` | **Not shown** covers both Reject and Remove (#1479). `deleting` marks a Delete in progress (§12): the admin page shows it in **Not shown** and My posts shows the card, both with "Couldn't delete. Try again.". |
| `photo`            | `image` (reference to a `sanity.imageAsset`)          | The whole photo, filtered and resized on the phone. Unset by Delete's first step, which keeps the asset id in `deletingAssetId` (§12). A later video would get its own field.                                    |
| `deletingAssetId`  | string                                                | Only while `deleting`: the asset Delete still has to remove (a plain string, so it doesn't block the asset's deletion).                                                                                          |
| `crop`             | `{ x: number, y: number }`, each 0–1                  | The square crop's position (CSS `object-position` semantics) on the whole photo. The square's side is the photo's short edge; there is no zoom.                                                                  |
| `caption`          | string ≤ 80, optional                                 | Normalised on the server (§6.4).                                                                                                                                                                                 |
| `name`             | string ≤ 40, optional                                 |                                                                                                                                                                                                                  |
| `marketingConsent` | boolean                                               | The optional checkbox (#1480). The contributor can untick it later.                                                                                                                                              |
| `deviceKey`        | string                                                | §6.1. Never the raw cookie token.                                                                                                                                                                                |
| `submittedAt`      | datetime                                              | When Submit accepted it. Server time. Drives the hourly limit.                                                                                                                                                   |
| `approvedAt`       | datetime                                              | Set on every approval (also re-approval from Not shown). Orders the wall: newest approval first.                                                                                                                 |
| `decidedAt`        | datetime                                              | Last Approve, Reject or Remove.                                                                                                                                                                                  |

Studio shows both types read-only (organizers moderate on the admin page, not
in Studio). _Implementation detail._

**What is never stored:** an unfiltered or uncropped original, EXIF or GPS
data, the contributor's IP address, user agent or email.

## 5. Storage

**Photos are Sanity image assets** (user, 2026-10-23, §3), in the
conference's existing dataset.

- **Upload.** The submit route (§6.2) uploads the phone's JPEG with
  `client.assets.upload('image', bytes, …)` on the write client, after every
  check has passed. Options: `filename: '<uploadId>.jpg'`, `contentType:
'image/jpeg'`, `source: { name: 'photo-wall', id: <conferenceId> }` (so the
  cron can find a wall's assets), and **`extract: []`**, which the client sends as `meta=none`: no palette, LQIP, blurhash, EXIF or location is stored (dimensions always are; the bytes carry no metadata anyway, §6.4). The JPEG is ≤ 4 MiB, so the whole request fits Vercel's
  4.5 MB body limit.
- **Approve, Reject and Remove only patch the post.** Nothing is copied or
  deleted, so re-approving from Not shown just works.
- **Delete and the cron delete the asset** after the post stops referencing
  it (§12, §11). Sanity refuses to delete an asset another document still references; that refusal counts as done. Identical bytes give one shared asset (Sanity names assets by content hash), **across tenants too**, and the sharer can be any document (a sponsor logo, a gallery image), not only a post. Reuse `src/lib/sanity/orphaned-asset.ts` (`countAssetReferences`, `deleteImageAssetIfOrphaned`), which counts references under `perspective: 'raw'` at a recent API version for exactly this reason (#1160), instead of writing a new count.

**What this costs, accepted (§3):**

- **A photo is public by URL from the moment it is uploaded,** pending and
  Not shown included. The URL is
  `cdn.sanity.io/images/<project>/<dataset>/<sha1>-<w>x<h>.jpg`: not guessable
  by others, but **computable by its uploader** (the SHA-1 of the bytes they
  sent). Someone scripting the submit route could therefore use our CDN to
  host an image an organizer never approves, until it is deleted. The bounds:
  3 pending per cookie and 200 per wall (§6.3), organizers' **Delete now**
  removes the asset (§10), and everything is deleted 30 days after the
  conference (§11).
- **A Not shown photo stays reachable** by anyone who saved its URL while it
  was on the wall, until it is deleted. Reject and Remove hide; Delete now
  removes.
- **After a delete,** Sanity's CDN may keep serving a cached copy for a while
  (how long is **unverified**; §14 measures it on Sunday).
- **Studio's media browser** lists every image asset in the dataset, Wall
  Post photos of every tenant included, to anyone with Studio access.

**No new subprocessor.** Sanity already stores the platform's content and
images.

### 5.1 Showing photos

- Every Wall Post photo is rendered with a **plain `<img>`** from the asset URL
  with Sanity image parameters (`sanityImage()` in `src/lib/sanity/client.ts`):
  - the Pinboard square: `rect=` computed from `crop` and the photo's
    dimensions, plus a width;
  - the Wall page on a phone: about 600 px wide; Screen Mode: about 900 px;
    the admin card's whole photo: about 1200 px with `fit=max`.
- **Never `next/image`** for these photos: the optimizer would keep serving a
  deleted photo from `/_next/image` for its `minimumCacheTTL` (4 hours by
  default in Next 16). `cdn.sanity.io` has to stay in `remotePatterns` for the
  rest of the site, so a deliberate `/_next/image?url=…` request for a known
  photo URL can't be refused; §15 lists it.
- **No proxy routes:** the admin page and My posts use the same asset URLs.
- Sanity's CDN has no CORS for tenant domains; that only matters for canvas
  reads, which nothing here does with a stored photo.

## 6. Posting a Wall Post

### 6.1 Device cookie

_Same pattern as Feedback Responses (`src/lib/feedback/device.ts`)._

- Name **`konf_wall`**, `httpOnly`, `secure` outside development,
  `SameSite=Lax`, **`Path=/wall`**. **Everything that needs the cookie lives under `/wall`:** the submit route `/wall/post/submit` and the Server Actions of `/wall/post` (they post to the page's own path). **Never tRPC:** `/api/trpc` doesn't receive a
  `/wall` cookie (the Feedback precedent, `SPEAKER_FEEDBACK_SPEC.md` §7.3).
- Value: a 16-byte random token plus its issue time, HMAC-SHA256-signed with
  `INVITATION_TOKEN_SECRET`, as `deviceCookie()` does. A cookie whose
  signature doesn't verify is treated as absent.
- **Issued before the first post:** the composer calls a Server Action `ensureDevice()` when it loads and enables **Post to the wall** only once it has answered, so the cookie is already set when a submit runs. _Refinement (spec):_ if the first submit's response (and a `Set-Cookie` on it) were lost, the retry would arrive as a different device and fail the ownership check (§6.2). The submit route refuses a request without a valid cookie.
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

### 6.2 Submit

A phone photo is 3–12 MB, but the composer re-encodes it to a JPEG of at most
4 MiB (§6.5), so it travels in one request through our own route, inside
Vercel's 4.5 MB request limit. It is a **route handler**, `POST
/wall/post/submit` (multipart: the photo, `uploadId`, `caption`, `name`,
`cropX`, `cropY`, `marketingConsent`), not a Server Action, because Server
Actions take 1 MB by default (`serverActions.bodySizeLimit`).

First, a request whose `Content-Length` exceeds 4.5 MB is refused before the body is read (Vercel itself answers 413 above its limit; the composer treats any 413 as a refusal, never as a lost response). Then the multipart body is parsed once, and in this order, **guard before upload** (nothing reaches Sanity's asset store until every check has passed):

1. the conference from the domain; a valid cookie (refused otherwise, §6.1); an `uploadId` that is a UUID v4;
2. if `wallPost-<uploadId>` already exists: success when it belongs to this
   conference and this cookie's device key (**a retry after a lost response**
   never refuses and never uploads again), the generic refusal otherwise;
3. the wall exists, posting is open (§7), and the limits allow it (§6.3);
4. the photo is no bigger than 4 MiB, then the checks in §6.4, on the bytes in memory;
5. upload the asset (§5), then **`create`** (strict, not `createIfNotExists`)
   the `wallPost` (status `pending`, the fields, `submittedAt`) referencing it,
   and expire the admin and device tags with `revalidateTag(tag, { expire: 0 })`
   (a route handler, §8). If the create fails because the id now exists (two
   concurrent submits with one `uploadId`), re-read it: this device's post
   means success, anyone else's the generic refusal. Any failed or lost create deletes the asset just uploaded unless a document references it (§5).

**Reads that decide** (the limits and the existence read here, the revision
reads in §10) use the **non-CDN** Sanity client (`src/lib/sanity/client.ts`); a
CDN read lags the previous write.

A crash between the asset upload and the create leaves an asset no post
references. The daily sweep (§11.2, slice P1) deletes those older than an
hour; until P1 ships, the retention purge does.

### 6.3 Limits

| Limit                                | Value                     | Phone shows                                                                                       |
| ------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------- |
| Pending posts per device, at once    | **3**                     | "You have 3 photos waiting for approval. You can post again once an organizer has looked at one." |
| Posts per device, rolling 60 minutes | **10** (by `submittedAt`) | "You've posted 10 photos in the last hour. Try again a bit later."                                |
| Pending posts per wall, at once      | **200**                   | "Lots of photos are waiting right now. Try again in a few minutes."                               |
| Posting not open                     | §7                        | "The wall isn't open for photos right now." with a link "See the wall".                           |
| Any other refusal or failure         |                           | "Something went wrong. Your photo wasn't posted. Try again."                                      |

Both pending limits count `pending` posts. The hourly limit counts the
device's posts with `submittedAt` in the last 60 minutes, whatever their
status. Two phones racing the last of the 200 can overshoot by one; accepted.
Organizers don't see refusals; the pending count shows how full the queue is.

### 6.4 What the server checks at Submit

| Check          | Rule                                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Present        | The request carries exactly one photo part.                                                                                                                                                                                                                                                                                                                                 |
| Size           | ≤ 4 MiB, 4,194,304 bytes, refused before the body is parsed when `Content-Length` already exceeds 4.5 MB.                                                                                                                                                                                                                                                                   |
| Type           | The bytes start with the JPEG signature (`sniffImageType()` in `src/lib/marketing-asset/image-type.ts`) and end with an EOI marker.                                                                                                                                                                                                                                         |
| Dimensions     | Read from the JPEG's SOF marker: long edge ≤ **2048 px**, short edge ≥ **320 px**.                                                                                                                                                                                                                                                                                          |
| No metadata    | No APPn segment except APP0, and no COM segment: this covers Exif and XMP (APP1) and IPTC (APP13), which can all carry location or creator data. The composer strips them (§6.5), so their presence means the file didn't come from the composer: refused, not stripped.                                                                                                    |
| Caption        | Unicode NFC; control characters removed; any run of whitespace (newlines included) becomes one space; trimmed; empty becomes absent; more than **80** code points is refused. _Refinement (spec):_ the bidi formatting characters U+200E, U+200F, U+202A–U+202E and U+2066–U+2069 are removed with the control characters; U+200D (ZWJ) is kept so emoji sequences survive. |
| Name           | Same normalisation; more than **40** code points is refused.                                                                                                                                                                                                                                                                                                                |
| Crop           | `cropX` and `cropY` parse as finite decimal numbers in [0, 1].                                                                                                                                                                                                                                                                                                              |
| Marketing      | The field is exactly `true` or `false`; anything else is refused.                                                                                                                                                                                                                                                                                                           |
| Posting Window | Open at Submit time (§7).                                                                                                                                                                                                                                                                                                                                                   |

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

  > Your whole photo, caption and name are shown on the screens at the venue
  > and on the public wall on this website until <deletion date>; the square
  > you choose is only how the polaroids frame it. Only post photos the
  > people in them are happy with. [Privacy](/privacy#photo-wall)

  _Decided by the user (2026-10-25, P3):_ the "whole photo" wording, since
  Mosaic and Spotlight show the whole photo (§9), not the square.

- **Marketing:** an optional checkbox, **unticked by default**: "The
  organizers may also use my photo in their own marketing."
- **Post to the wall** sends the one submit request (with upload progress), then shows My posts with the new card on top, "Waiting for approval".
- **Retries on venue Wi-Fi:** a submit whose response was lost (a network
  error, not a refusal) is retried with the same `uploadId`; the route answers
  success if the post already exists (§6.2). A refusal keeps the photo and
  fields on screen with the message, and the next press uses a new `uploadId`.
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
- **Then strip every APPn segment except APP0, and any COM segment, from the encoded bytes** (a marker walk, no decoder), and send `new Blob([bytes], { type: 'image/jpeg' })` as the photo part. Safari's canvas encoder may write a minimal Exif
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
  the admin page. A new wall starts Paused. There is no automatic opening, but
  **posting always closes at the end of the conference's last day**
  (23:59:59 on `endDate`, Europe/Oslo), even when the switch says Open, so a
  wall nobody pauses doesn't keep taking anonymous posts for a month.
  _Refinement (spec):_ the decided window ends with the conference days; this
  enforces its end from day one. Opening early stays the organizer's switch.
- **Later (P2):** adds **Automatic**, the default: open from 00:00 on the
  conference's `startDate` to 23:59:59 on its `endDate`, Europe/Oslo
  (`CONFERENCE_TIME_ZONE` in `src/lib/time.ts`). Open and Paused remain as overrides ("open early" and "pause"); the end-of-last-day close applies to every mode. P2 also makes a missing `postingMode`
  read as `auto`.
- _Refinement (spec, P2):_ an Automatic wall whose conference has no usable
  `startDate` never opens (`noStartDate`), as one with no usable `endDate`
  never does; and a stored `postingMode` the switch does not offer reads as
  Paused, so a stray value never opens posting.
- The submit route uses one function, `isPostingOpen(wall, conference, now)`. _Implementation detail._
- Viewing is never gated by the window: the Wall page and Screen Mode show the
  wall until it closes (§11.1).

## 8. Live delivery

From the storage research: polling a `'use cache: remote'` list that is
expired on change costs about 1–4k Sanity reads per edition; polling Sanity
directly would cost about 30% of the monthly quota. **Browsers never query
Sanity.** _Tags and function names below are implementation details._

| Cached read                                                                                                                                                                    | Tag                               | Expired by                                                                                                                                        | Polled by                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `getWall(conferenceId)`: settings + the newest **200** approved posts (`id`, the asset URL, `width`, `height`, `crop`, `caption`, `name`, `approvedAt`), newest approval first | `photo-wall:<conferenceId>`       | Approve, Reject/Remove of an approved post, Delete (the contributor's or Delete now) of an approved post, any settings change, the retention cron | Screen Mode every **5 s**, always; the Wall page every **10 s** while visible     |
| `getModerationQueue(conferenceId)`: every post with its status and asset URL (none for a `deleting` post, whose card shows no image), and the pending count                    | `photo-wall-admin:<conferenceId>` | Submit, every moderation action, contributor Delete and marketing change, the cron                                                                | The admin page every **10 s** while visible                                       |
| `getMyPosts(conferenceId, deviceKey)`: this device's posts                                                                                                                     | `photo-wall-device:<deviceKey>`   | Submit, Delete, marketing change by that device; any moderation of a post with that `deviceKey`                                                   | My posts on load, after each action, and every **15 s** while the page is visible |

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
- **Expiry call:** the Server Actions (Delete, marketing) use `updateTag`; the submit route and the admin's tRPC mutations are Route Handlers, where `updateTag` throws, so they use `revalidateTag(tag, { expire: 0 })`, the `src/lib/feedback/cache.ts` precedent.
- **Latency** is the poll interval: a newly approved or removed post reaches
  every screen within about 5 s and every phone within about 10 s. That is
  what "immediate" means here (#1478, #1479).
- A removed post leaves the wall on the next poll; its asset URL keeps working until the post is deleted (§5).

## 9. The wall

The **Pinboard** shipped on Monday; **Mosaic** (P3) and **Spotlight** (P4)
followed, built to
[Prototype the Photo Wall look](https://github.com/CloudNativeBergen/website/issues/1478)
and its prototype (`Prototypes/PhotoWall/WallLook` on branch
`prototype/photo-wall-look`).

- An organizer picks the **Wall Look** per wall on the admin page (§10). It is
  the look of the Wall page and of every screen, and running screens switch
  on their next poll: `getWall` carries it, and the change expires
  `photo-wall:<conferenceId>` like every settings change (§8).
- A screen's own link overrides it with `?look=pinboard|mosaic|spotlight`, so
  rooms can differ. Any other value is ignored. Visitors can't switch looks:
  the Wall page has no override.
- Pinboard shows the square crop; Mosaic and Spotlight show the **whole
  photo**, scaled by Sanity with `max-w`/`max-h` (never `w`+`h`, which makes
  the URL builder add a `rect=` that cuts it).
- A screen that switches look starts that look afresh from the latest list,
  with nothing marked new. _Refinement (spec)._

### 9.1 Wall page (`/wall`)

- Follows the visitor's light or dark setting. Conference logo and name at the
  top, then the approved posts in the wall's look, newest approval first:
  on the Pinboard a **two-column grid of slightly tilted polaroids** (square
  crop, handwritten caption and name); Mosaic and Spotlight as in §9.2.
- At most the **200** newest approvals (§8); when a 201st is approved, the
  oldest leaves the Wall page and Screen Mode but stays On the wall in the
  admin queue.
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
  `TenantAnalytics` and the PWA `InstallPrompt` on every route. Four places, each by its own mechanism: in `VercelInsights`, **both** `<Analytics beforeSend>` and `<SpeedInsights beforeSend>` return `null` for `/wall/screen` (on `/f` Analytics only redacts);
  `EXCLUDED_PATH_PREFIXES` in `src/lib/posthog/config.ts` gains
  `/wall/screen`, which also keeps `AnalyticsConsentBar` off the screen;
  `InstallPrompt` is hidden as `HiddenOnFeedbackPage` hides it on `/f`.
  Test that Screen Mode sends no analytics request.
- **No update banner.** `ServiceWorkerRegistrar` (`src/app/layout.tsx`) shows
  `UpdateBanner` after a deploy and waits for a click, which nobody gives a
  venue screen. On `/wall/screen` it accepts the update by itself (post
  `SKIP_WAITING`, then reload), so a screen picks up Monday fixes without anyone touching it. The registrar only checks for updates on focus and visibility changes, which a screen never has, so Screen Mode also calls `registration.update()` every **10 minutes**. A private window doesn't avoid this: the service worker
  registers there too. _Refinement (spec):_ a venue screen
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

**Mosaic** (P3, #1478 variant B):

- Screen Mode: an edge-to-edge masonry of the newest **40** posts' whole
  photos on black, each tile its photo's shape (height over width held
  within 0.5–1.8; beyond that the photo is letterboxed, never cropped). One
  post is **featured** as a two-column tile with its caption and name. The
  feature walks the **6** newest, one every 6 s; a new post takes it at once
  with a "Just posted" mark for 6 s. The logo and a QR card sit over a
  gradient at the bottom.
- Wall page: the same masonry in two columns (three and four on wider
  screens), the caption and name over a gradient.

**Spotlight** (P4, #1478 variant C):

- Screen Mode: one big post at a time over a blurred copy of itself, with
  its caption, name and approval time and a bar for its 6 s turn; a rail
  with the logo, the QR card and **Up next** (4). The big post walks the
  **12** newest. A new post goes **next in line**, first on Up next; a burst
  waits its turns in approval order. _Refinement (spec):_ it wears the "new"
  mark while it waits on Up next and for its 6 s turn as the big post, so a
  burst's later posts still arrive marked.
- Wall page: a single-column feed, each whole photo with the name, the day
  and time, and the caption.

Both: the walk features the post that has waited longest since its last
turn (the newest first among equals), so a quiet walk goes round in order
and an arrival never makes it start over or repeat. _Implementation
detail._ A burst is let in one post every 2.5 s; a removed post leaves at
once, and a featured one hands over to the walk's next; a post is shown
only once its photo has loaded; §9.3 and §9.4 apply as for the Pinboard.

Spotlight only: Up next names exactly the next turns, and a removed big
post hands over to the post Up next named. _Implementation detail._

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
- **Settings row:** **Posting** (Open / Paused; Automatic from P2),
  **Sponsor strip** (on/off) and **Wall Look** (Pinboard / Mosaic /
  Spotlight, P3; §9).
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
  - A card with the Marketing OK mark: **Withdraw marketing OK** (inline
    confirm), for a contributor who asks without the phone's cookie (§12).
    It only ever unticks `marketingConsent`; organizers never tick it.
  - Pending tab: **Approve all pending (N)** with an inline confirm. It works as described below.
- **Allowed from-states:** Approve from `pending` or `notShown`; Reject from
  `pending`; Remove from `approved`; Delete (now) from any status. A
  `deleting` card offers only **Try again** (Delete). Any other combination is refused before any write.
- **Every transition is guarded with `ifRevisionId`** against the non-CDN read
  it was decided from, so two organizers (or an organizer and the contributor)
  can't interleave. On a revision conflict the server re-reads once: if the
  post is gone, the card reports "This photo was deleted"; if its status no
  longer allows the action (someone else already removed it), the card
  refreshes with no change; otherwise it retries once, and **only if no moderation decision happened in between**: the status **and** `decidedAt` are what the action read (a marketing untick changes neither). So an Approve begun on Pending doesn't retry after a rejection, and a Remove doesn't retry after someone removed and re-approved the post. A marketing untick is the usual reason to retry.
- **Approve** patches `status: approved`, `approvedAt` and `decidedAt`.
- **Reject** and **Remove** patch `status: notShown` and `decidedAt`.
- **Approve all pending** approves the posts pending when pressed, one guarded patch per post, four at a time, within a 30 s budget (a transaction is all-or-nothing, so one conflicted post would sink a whole batch). A conflicted post is skipped and stays pending. It reports how many it approved; pressing again picks up the rest.
- **Delete now** runs the same Delete as the contributor's (§12).
- The contributor's My posts says **Not shown**, with no reason.

## 11. Retention

From [Decide the Photo Wall window, retention, consent and erasure](https://github.com/CloudNativeBergen/website/issues/1480).

### 11.1 The 30-day deletion (slice P1, before 26 November 2026)

- **Deletion date:** the conference's `endDate` + 30 days (Cloud Native Days
  Norway 2026: **26 November 2026**).
- A daily cron (`vercel.json`, authenticated with `CRON_SECRET` like
  `/api/cron/cleanup-notifications`) handles every `photoWall` whose deletion date is **tomorrow or earlier** and `purgedAt` is unset:
  1. **close it to writes first:** set `closedAt` (if unset) and expire the
     tags. `isPostingOpen` is false and Approve refuses once `closedAt` is set, whatever `postingMode` says, and Submit and Approve re-check it just before their final commit. **Delete (both kinds) stays allowed**, so an abusive photo can still be taken down. From `closedAt` on, `getWall` returns no posts and the pages show "This wall has closed.";
  2. purge only walls whose deletion date is **today or earlier** and whose `closedAt` is more than 15 minutes old (a submit in flight has finished by then). Closing the day before means the purge runs **on** the deletion date; the wall shows "This wall has closed" from the day before;
  3. read every `wallPost` of the conference with its asset id (and `deletingAssetId`), hard-delete the posts (Not shown included, history purged, §12), then every image asset they referenced and every asset with `source.name == 'photo-wall'` and `source.id == <conferenceId>` that no document references;
  4. set `purgedAt`.
- Re-running is safe: an interrupted run leaves `purgedAt` unset, so the next
  run repeats step 3. `closedAt` means "closed to writes", `purgedAt` means
  "deletion done".
- The closed pages key on `closedAt`, not `purgedAt` (step 1).

### 11.2 Orphan sweep (slice P1)

The same cron deletes:

- image assets with `source.name == 'photo-wall'`, older than an hour, that
  no document references (a crash between upload and create, §6.2), rechecked
  on the uncached client just before deleting;
- `deleting` posts older than an hour: finish their Delete (§12).

**Monday risk:** P1 is not in the Monday cut. If it hasn't shipped by 26 November 2026, the deletion is a manual job that day: first set the wall's `postingMode` to Paused and `closedAt` (posting has already closed at the end of the conference, §7), then delete every `wallPost` of the conference (with history, §12) and the wall's assets (step 3 above), then set `purgedAt`.

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
  1. a revision-guarded patch (on a conflict, re-read once and retry; Delete
     accepts every status): `status: 'deleting'`, unset `photo`, and keep the
     asset id in `deletingAssetId`. The post leaves the wall on the next poll
     and no longer references the asset;
  2. delete the asset (history purged), retried once; "still referenced by
     another post" counts as done;
  3. delete the document (history purged).

  If step 2 fails, the document stays `deleting` and the card (in My posts and
  on the admin page) says "Couldn't delete. Try again."; Delete accepts a
  `deleting` post and resumes from `deletingAssetId`. **One module
  (`deleteWallPost`, slice M4b)** implements this; the organizer's Delete now
  and the contributor's Delete (M6) both call it. The module **never expires
  tags**: each caller does, per §8. The sweep (§11.2) also finishes `deleting`
  posts older than an hour.

- **History.** A plain Sanity delete keeps the document's revisions in its
  history, with the caption, name and consent. Every final delete here (Delete, Delete now, a failed submit's asset, the cron) **purges history**. The client's typed `delete()` and `transaction().delete()` **drop `purge`** (they send only the id), so the delete is a raw mutation, `clientWrite.mutate([{ delete: { id, purge: true } }])`, which passes through as written (the Actions API's `sanity.action.document.delete` also takes `purge`, but only from API version 2024-05-23, while the shared client defaults to 2023-05-03). Purging needs the token's **`editHistory`** permission, which no predefined Sanity role grants, so it means a custom role. On a 403 the delete falls back to a plain delete and logs it, so a photo is never left behind for want of the permission; §14 asserts the serialized mutation carries `purge: true`.
  M4b proves it once on a real document, with the user's go for that
  production write; if the token can't purge, the user decides between
  granting the permission (a custom role with `editHistory`) and adding Sanity's history retention to the
  `/privacy` copy. Until proven, §15 lists it.
- **Lost cookie:** contact the organizers, describing the photo. They use
  Delete now.
- **Exported copies** (slice P5) can't be reached by deletion; `/privacy` says
  so.

**New `/privacy` section** (`id="photo-wall"`, in
`src/app/(main)/privacy/page.tsx`), plus a `konf_wall` row in the cookie list. The subprocessor list doesn't change (Sanity is already on it). Draft copy:

> **Photo Wall.** If you post a photo to a conference's Photo Wall, we store
> the photo (filtered and resized on your phone, with location and other
> camera data removed), your caption, your name if you give one, where the
> square of a polaroid sits on the photo (some walls show the whole photo),
> whether you allow marketing use, and a cookie that
> recognises your phone. Your post appears on the wall at the venue and on the conference website only after an organizer approves it. The photo file itself is stored with an unlisted web address from the moment you post it, so anyone who has that address can open it, even before approval or after it is taken off the wall, until it is deleted; the platform's administrators can also see it. We show it because you chose to post it, and you can
> withdraw that by deleting it. If you tick the marketing box, the organizers
> may also use your photo in their own marketing; untick it at any time. We delete every Photo Wall post 30 days after the conference; a deleted photo can stay in our provider's cache for a short while. Copies the
> organizers downloaded for marketing before you unticked the box or deleted
> the post are theirs and aren't covered by that deletion. To delete a post,
> open the wall's posting page on the same phone and use My posts, or contact
> the organizers. If you are in someone else's photo and want it removed,
> contact the organizers. Photos are stored with our content platform, Sanity; no other service receives them.

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
and M5b; then M6 (after M3b, M4b, M5a).

| #   | Slice                                                                                                                                                                                                                                                                                                                                                                                                                               | After         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| M1  | **Wall setup and admin shell.** Both document types (§4); the `src/app/(public)/wall/` route group with its minimal chrome and the 404 rule for conferences without a wall (§4.1); `/admin/photo-wall` with Set up, the Posting (Open/Paused) and Sponsor strip switches, the links with the posting QR (§10); the nav entry; `isPostingOpen` (§7). Demo: an organizer sets up the wall, opens and pauses it, and downloads the QR. | —             |
| M2  | **Composer, phone side only.** `/wall/post` landing and the composer (§6.5) with the 9 baked filters, crop, caption, name, consent line and marketing checkbox, producing the JPEG and fields; no server calls yet (Storybook with mocked actions). Try it on a real iPhone as early as possible (§15). Demo: in Storybook at phone width, a picked photo becomes a filtered ≤ 2048 px JPEG with no EXIF.                           | —             |
| M3a | **Posting rules, server side.** The cookie (§6.1); the limit counts on the non-CDN client (§6.3); the JPEG and field checks (§6.4); each a pure, tested module with executed GROQ and real JPEG files (§14). No route or UI.                                                                                                                                                                                                        | M1            |
| M3b | **Posting path.** The submit route (§6.2) on M3a's modules with the asset upload (§5), the phone's messages and retries (§6.3, §6.5), the window-closed page, M2's composer wired to it, and a minimal "Waiting for approval" card. Demo: a phone posts and the post is pending in Sanity with its photo as an asset.                                                                                                               | M2, M3a       |
| M4a | **Moderation, read side.** `getModerationQueue` (§8), tabs, cards with the Sanity image URLs (§5.1) and the live pending count (§10). Demo: an organizer sees pending posts with the whole photo and the crop outline on a phone.                                                                                                                                                                                                   | M1            |
| M4b | **Moderation actions.** Approve, Reject, Remove, Approve all and Delete now with the revision guards (§10), the `deleteWallPost` module with its failure path and history purge (§12), the tag expiries (§8), the race tests (§14). Demo (with M3b): an organizer approves a post from a phone and it appears on the Wall page; Delete now removes its asset.                                                                       | M3a, M4a      |
| M5a | **Wall page.** `getWall` (§8); the Wall page (§9.1) with the plain-`<img>` Sanity URLs (§5.1). Demo: with fixture posts in Storybook, and with M4b, an approval appears on a phone within 10 s.                                                                                                                                                                                                                                     | M1            |
| M5b | **Screen Mode.** Pinboard with arrivals, bursts, idle swaps and removal (§9.2), always-on polling (§8), flaky Wi-Fi (§9.3), the sponsor strip (§9.4), and the analytics and install-prompt exclusions (§9.2). Demo: an approval appears on a running screen within 5 s and a removal leaves it, after more than five minutes untouched.                                                                                             | M5a           |
| M6  | **My posts and privacy.** `getMyPosts` (§8); My posts with statuses, Delete (calling M4b's `deleteWallPost`) and the marketing switch (§12); the `/privacy` section and cookie row; the `PRIVACY_OPERATIONS.md` line. Demo: a contributor deletes their approved post and it leaves the Wall page.                                                                                                                                  | M3b, M4b, M5a |

**After the event:**

| #   | Slice                                                                                                                                                                                                                                                                                                                                                                                                  | After    | Due         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- |
| P1  | **Retention cron and orphan sweep** (§11), the closed states of every page.                                                                                                                                                                                                                                                                                                                            | M3b, M4b | 26 Nov 2026 |
| P2  | **Automatic Posting Window** (§7).                                                                                                                                                                                                                                                                                                                                                                     | M1       | 12 Nov 2026 |
| P3  | **Wall Look setting and Mosaic.** `photoWall.look` on the admin page, live on screens; `?look=` on the Screen Mode link; the Mosaic look on the Wall page and Screen Mode, from the prototype (#1478).                                                                                                                                                                                                 | M5b      | 12 Nov 2026 |
| P4  | **Spotlight look**, from the prototype (#1478).                                                                                                                                                                                                                                                                                                                                                        | P3       | 12 Nov 2026 |
| P5  | **Consented ZIP export.** Download approved posts whose contributor ticked marketing consent, as a ZIP. Sanity's CDN has no CORS for tenant domains and a function response is capped at 4.5 MB, so the slice first decides: add the tenant origin to Sanity's CORS list (a user step) and zip in the browser, or stream the ZIP from a route handler (whether streaming lifts the cap is unverified). | M4a      | 12 Nov 2026 |
| P6  | **Pending-count badge** on the nav entry (`AdminNavEntry.count`, as Feedback's flagged badge).                                                                                                                                                                                                                                                                                                         | M4a      | 12 Nov 2026 |

### 13.1 Tickets

Every slice is filed under [Photo Wall: implementation](https://github.com/CloudNativeBergen/website/issues/1485), with the dependencies above as native blocking edges.

| Slice                        | Issue |
| ---------------------------- | ----- |
| M1                           | #1487 |
| M2                           | #1488 |
| M3a                          | #1489 |
| M3b                          | #1490 |
| M4a                          | #1491 |
| M4b                          | #1492 |
| M5a                          | #1493 |
| M5b                          | #1494 |
| M6                           | #1495 |
| P1                           | #1496 |
| P2                           | #1497 |
| P3                           | #1498 |
| P4                           | #1499 |
| P5                           | #1500 |
| P6                           | #1501 |
| Sunday trial run (user, §14) | #1502 |

## 14. Verification

**In every PR** (per `AGENTS.md`, "Agent discipline"):

- **Guards are sabotage-proven:** every refusal in §6.2–6.4, §4.1 and §10
  (organizer only). Remove it, show the specific test fails on a value (the
  write or the asset upload happening), restore.
- **Guard before upload:** every refusal in §6.2 (cookie, foreign `uploadId`, window, limits, size, JPEG and field checks) happens **without** calling `client.assets.upload` (assert it was never called); a foreign existing `uploadId` gets the same refusal as any other failure.
- **Upload options:** the real client's upload request carries `sourceName=photo-wall`, the conference as `sourceId`, the filename and `meta=none` (inspect the request the installed `@sanity/client` builds, not a mock of it).
- **Purge:** the serialized delete mutation carries `purge: true`; a 403 falls back to a plain delete.
- **JPEG checks** on real files: a canvas-made JPEG (including a Safari-made sample, after the composer's APPn strip) passes; a camera JPEG with EXIF, a JPEG with an IPTC APP13 segment, one with a COM segment, a PNG renamed `.jpg`, a truncated file, a 4096 px image and a 200 px
  image are refused.
- **Executed GROQ, not mocks,** for the limits, `getWall`, the queue and My
  posts, including a post of another conference that must not count.
- **Cookie:** a vitest test asserts the `Set-Cookie` attributes (`Path=/wall`,
  httpOnly, `SameSite=Lax`, expiry on the deletion date) and replays the cookie
  into a second call.
- **Limits:** a fourth submit from one device is refused while three of its posts are pending, and the eleventh within an hour.
- **Revision guards** are asserted on the real client's `serialize()` (the `ifRevisionID` is on the patch); conflicts are proven on `__tests__/helpers/versionedSanityStore.ts`, because the installed `@sanity/mutator` ignores `ifRevisionID`.
- **Screen Mode finds and accepts a service-worker update** without a click, focus or visibility change (fake timers past 10 minutes).
- **Retry after a lost response:** submit twice with the same `uploadId`, the second after pausing posting; the second returns success, uploads nothing, and the post still has its photo.
- **No `next/image` for Wall Post photos:** a test (or lint rule) fails if a
  Wall Post photo is rendered through `/_next/image`.
- **Moderation races:** two organizers acting on one post, and Approve racing the contributor's Delete, end in one consistent state; a deleted post can't come back approved. Include: Removes A and B read the same revision; A removes; another organizer re-approves; B's retry must leave the post approved.
- **First post with a lost response:** the cookie is already set by `ensureDevice()`, so the retry is the same device and gets success; a submit without a cookie is refused; two concurrent submits with one `uploadId` from two devices leave one post and one refusal, and no orphan asset.
- **Approve all** with one post changed mid-run approves the others.
- **Failure path:** an asset delete that fails leaves the post `deleting`, and pressing again finishes it from `deletingAssetId`; an asset shared by two posts survives the first post's Delete.
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
6. **Screen:** open `/wall/screen` on a laptop in a private window (no left-over
   service worker). The approved posts are there. Approve the rejected one
   from Not shown: it drops in with the "new" mark within about 5 s.
7. **Remove while the screen runs:** it leaves the screen within about 5 s, and the Wall page on a phone within about 10 s.
8. **Limit:** from one phone, post until the fourth pending is refused with the
   message.
9. **My posts:** statuses are right; Delete an approved post, and it leaves the screen. Note how long its asset URL keeps answering afterwards (Sanity's CDN cache, §5).
10. **Pause:** the composer shows the closed page, and a submit is refused.
11. **Flaky Wi-Fi:** switch the laptop's Wi-Fi off for 30 s. The screen keeps
    cycling and shows the offline dot. Remove a post meanwhile. Wi-Fi on: the
    removal catches up.
12. **Sponsor strip:** switch it on; the strip appears on the screen with
    readable logos.
13. **No location:** download an approved photo's asset URL and check it has no EXIF (for example `exiftool`).
14. **Clean up:** Delete now every trial post, and set posting to Paused.

**Monday 26 October, before the doors open** (the user): open
`/wall/screen` on the **real venue display** in its browser, fullscreen, on
the venue Wi-Fi; check it fills the screen, stays awake and shows the QR; set
posting to Open. **Fallback** if anything fails: Pause posting and take the
screen off; nothing else depends on the wall.

## 15. Known gaps and risks

- **Photos are public by URL from upload** (§5): an uploader can compute their
  own photo's URL and share it before or without approval; a Not shown photo
  stays reachable until deleted. Bounded by the pending caps, Delete now and
  the 30-day purge. Accepted with the choice of Sanity (§3).
- **A deleted photo may linger** in Sanity's CDN cache (duration unverified,
  measured on Sunday) and, if someone deliberately sent it through
  `/_next/image`, in Next's optimizer cache for up to 4 hours (§5.1).
- **Studio's media browser** shows every tenant's Wall Post photos to anyone
  with Studio access (§5).
- **History purge** on delete (§12) is unproven until M4b runs it against the
  real dataset.
- **The limits are soft against a script.** Concurrent submits from one cookie
  can each see the same free capacity, and deleting your own posts frees up
  the hourly count. Accepted: clearing the cookie already defeats the
  per-device limits, every post still waits for approval, and an organizer can
  Pause the wall and Delete now. The 200-per-wall cap can overshoot by the
  number of concurrent submits.
- **Clearing cookies resets the device limits.** Accepted: approval is the gate
  and the 200-pending cap bounds the queue.
- **"Immediate" is up to one poll interval** (about 5 s on screens, 10 s on
  phones), not push.
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
- **Approve all** skips a post that changed while it ran; that post stays pending.
- **ZIP export** needs either Sanity CORS for the tenant origin or a streamed ZIP (P5).
