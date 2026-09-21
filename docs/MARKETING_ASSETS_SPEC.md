# Marketing asset gallery

Decided in a design interview on 2026-09-22 and checked against the code before writing (§9). Amends
[`MARKETING_PLAN_SPEC.md`](./MARKETING_PLAN_SPEC.md) §7, where a studio render exists only as one
Task's output and the Task editor's "studio asset" attachment source was never built.

## 1. What changes

Today an image made in the marketing studio is downloaded and gone. The one exception is a render
made for a `studioRender` Task, which is uploaded and handed straight to that Task's post; nothing
lists past renders, and an image made anywhere else reaches a post only by uploading it again.

An organization gets a **marketing asset gallery**: one place holding the studio renders worth
keeping and the images, GIFs and short videos made elsewhere, each with its alt text, ready to be
picked into a LinkedIn or Bluesky post.

Not in this work:

- **Automatic posting of video and GIFs.** It is the stated goal, and it is its own spec and spike
  (§7): nothing in the posting stack handles video at any layer today, Bluesky video is a separate
  asynchronous upload service, and whether LinkedIn video works through Buffer is undocumented.
  Here, video and GIFs live in the gallery and are posted on the manual path.
- **Merging with the photo gallery** (§2).
- **Re-editable designs.** An asset is a finished file; it remembers which studio card made it
  (§4.2), not the editor state.
- **Brand-kit files** (SVG, PDF, design sources). Everything in the gallery can go into a post.

## 2. Two galleries

The **photo gallery** (`imageGallery`, `/admin/marketing/gallery`) stays exactly as it is: conference
photos, owned by one edition, published to attendees, with a speaker's right to untag. The
**marketing asset gallery** is an organizer's toolbox and is never public. Putting graphics into
the public type would be one missed filter away from showing them on the site. The post editor's
image picker offers both (§5).

## 3. The asset

A new document type, `marketingAsset`.

| Field          | Notes                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `organization` | Required reference. The owner, and the tenant boundary: read with the organization filter, like Templates     |
| `scope`        | `organization` or `edition`. Explicit, because "no `conference`" cannot be queried safely (below)             |
| `conference`   | Required when `scope` is `edition`, absent otherwise: the edition this asset is about                         |
| `kind`         | `image`, `gif` or `video`                                                                                     |
| `image`        | For `image` and `gif`: a Sanity image                                                                         |
| `video`        | For `video`: a Sanity file, plus a `poster` image taken from the first frame at upload                        |
| `title`        | Required                                                                                                      |
| `alt`          | **Required.** Copied into a post with the asset, so it is written once                                        |
| `subject`      | Optional weak reference to a speaker, talk or sponsor: who the asset is about                                 |
| `tags`         | Free strings                                                                                                  |
| `credit`       | Optional: who made it                                                                                         |
| `source`       | `upload` or `studio`                                                                                          |
| `studio`       | For studio renders: the studio tab, and the speaker or sponsor it was opened on (§4.2)                        |
| `task`         | For a Task's render: weak reference to the `studioRender` Task, which is what makes "replace" possible (§4.3) |

**Who may do what.** Any organizer of the organization may add, edit and delete any asset,
including another edition's. That is not a choice made here so much as the only permission the
system has: organizer-ness is per organization, and there is no per-edition check anywhere. Ids from
the client pass the usual tenancy guards; the organization is resolved from the request host, never
accepted from the client.

**Reading both scopes.** "This edition's assets plus the organization-wide ones" reads naturally as
`conference._ref == $c || !defined(conference)` — which is exactly the fail-open shape the tenancy
lint exists to refuse, under an organization scope too. Hence the explicit `scope` field: the
organization-wide half is `scope == "organization"`, the edition half is `conference._ref == $c`,
both under the organization filter, as two queries if one does not pass the lint. Never a
`groq-global` annotation to get it through.

**Validated on write.** An edition mark must be an edition of THIS organization. A speaker subject
must have standing in this organization — speakers are documents shared across tenants — and a talk
or sponsor subject must belong to it.

**What the gallery shows.** By default this edition's assets and the organization-wide ones; older
editions behind an "all editions" filter. Filters for kind, subject and tag; search over title and
tags. A new edition therefore starts with the logo and the brand graphics already there, and
without last year's speaker cards.

**Small images.** A short side under 1080 px gets a warning that it may look soft on social. It is a
warning, not a refusal.

## 4. How assets get in

### 4.1 Uploads

PNG, JPEG and WebP images; GIFs up to 10 MB; MP4 video up to 100 MB. MP4 is the one format every
platform we looked at agrees on, and 100 MB sits under every limit we could find, so what is in the
gallery stays postable when automatic video posting arrives.

**One upload path for all three, and it is not the existing image upload.** That route is a
server-side multipart POST, which Vercel cuts off at about 4.5 MB whatever the route's own cap says
— a 10 MB GIF could never arrive. The gallery uses the two-tier pattern proposal attachments
already use: the browser uploads directly to Vercel Blob with a short-lived token, and the server
then moves the file into Sanity and deletes the blob. Three things differ from that precedent:

- The token route authorizes an organizer of the current organization, scopes the pathname to
  `marketing-asset-<organization id>-`, and sets the content types and size per kind.
- **The move never trusts the URL it is given.** The precedent accepts any URL, fetches it
  server-side and then deletes it. Here the URL must be on the Blob store's own host and under the
  caller's organization prefix before anything is fetched, and type and size are checked again on
  the server from the blob itself, not from what the client said.
- **The move to Sanity streams.** The existing transfer reads the whole file into memory, which is
  tolerable at 50 MB of slides and not at 100 MB of video. A fetch body is a web stream and the
  Sanity client takes a Node stream, so it is converted; and the move runs in a route handler with
  an explicit `maxDuration`, not in a tRPC call, which sets none.
- A video's **poster** is drawn from its first frame in the browser before upload and travels the
  same path as a second, image, file.
- The orphan sweeper cron lists blobs by the `proposal-` prefix. It gains the new prefix, so an
  upload abandoned before the move is cleaned up the same way.

Nothing is kept in Blob. **This reverses what the interview was told** — that video would stay in
file storage by direct upload. A permanent blob would have had no deletion owner: asset delete,
speaker erasure and the sweeper would all have missed it, and its public URL would have outlived
the speaker's erasure (§6). In Sanity, a video is a referenced file asset like any other.

Not verified: Sanity's own per-file size limit on the project's plan. The first slice that uploads
video checks it against a real 100 MB file before anything else is built on it.

### 4.2 From the studio, by choice

Every studio tab gets **"Save to gallery"** beside Download. It uploads through §4.1's path, not
the studio's existing multipart route: that route is under the same ~4.5 MB cut, which today's small
cards slip under and §7's full-resolution ones will not. The studio already routes captures
through one context that a `studioRender` Task fills with "attach to Task"; without a Task it is
empty today. It gains a gallery action that is always present. Saving asks for a title and alt text
(prefilled where the card knows its subject) and records the tab and the speaker or sponsor the
studio was opened on.

**"Open in studio"** on such an asset reopens that tab on that subject. The studio addresses a tab,
a speaker and a sponsor today — not a talk and not a particular card variant — so that is as close
as it lands.

### 4.3 From a render Task, automatically

Attaching a render to a `studioRender` Task also saves it to the gallery, with title, subject,
edition and alt taken from the Task. Rendering the same Task again **replaces the image** of that
Task's gallery entry rather than adding a second one — the image only: a title, tags or alt text an
organizer has since edited are kept. Posts that already took the old image keep it (§5).

The gallery save never fails or rolls back the attach: attaching is already save-then-retry with
receipts, and the gallery save joins it as one more idempotent step, found by its `task` reference.
That reference is weak, so a gallery entry survives the deletion of its Task and of the plan.

A gallery asset can also **finish a render Task**: beside "render in the studio", the Task offers
"use an asset from the gallery". Attaching accepts only the image this Task uploaded moments ago;
it additionally accepts the image of an `image` asset of the current organization, and from there
the hand-off to the waiting posts is the existing one. GIFs and videos cannot finish a render Task
— the post they would be handed to cannot hold them yet.

## 5. Using an asset in a post

The post editor's image picker gains a **"Marketing assets"** source beside upload and photo
gallery. It lists assets about the post's subject first, then this edition's, then the
organization-wide ones, with the same search.

Picking works as picking a photo does: the image asset REFERENCE and the alt text are copied into
the post's own attachments, with no re-upload, and the alt stays editable per post. One thing must
change for it to work at all: attaching refuses an image that no document of THIS conference
references, as foreign — and a logo held only by an organization-wide asset is exactly that. An
image belonging to a `marketingAsset` of the current organization becomes attachable, checked on
the server from the asset id, never from a client claim. So:

- **Deleting an asset never breaks a post.** The post holds its own reference.
- The gallery shows **"used in N posts"**, a tenant-scoped count for display only.
- The picker's long-declared "studio asset" seam is NOT this. It is shaped to render a card and
  upload its bytes on the spot, and nothing has ever supplied it. It stays unused.

GIFs and videos show in the picker marked "can't be attached yet", and the server refuses them too
— the attachment schema would accept a GIF's asset id today, so the mark alone would be decoration.
On the **manual** post view they can be used: the view offers the ORIGINAL file to download — not a
rendition, which re-encodes and would freeze a GIF — and the organizer posts it by hand.

A post with no Task has no subject; there the picker lists the edition's assets, then the
organization's.

**Deleting the underlying file.** Removing a gallery entry — by delete, or by a re-render replacing
it — deletes the Sanity asset only if NOTHING references it any more, across all document types
and tenants: posts and Tasks reference the same image. The repo has exactly one such check, inside
speaker erasure; it moves somewhere shared, gains a file-asset twin for video, and both use it. It
fails closed: if the count cannot be read, the file is kept. Without it every replaced render joins
the unreferenced image assets production already has.

## 6. Privacy

**An erasure request means the image goes — everywhere we hold it.** "Deleting an asset never breaks
a post" (§5) is right for an organizer tidying the gallery and wrong for erasure: deleting only the
gallery entry would leave the file stored and publicly addressable for as long as any post or Task
still referenced it, with the erasure reporting clean. Copies inside posts are unreachable today
for the same reason — a post refers to a speaker only as its author — and that gap predates this
work.

Erasure therefore finds every image linked to the speaker:

- gallery assets whose subject is the speaker;
- gallery assets whose subject is a talk the speaker gives;
- the render of any Task whose subject is the speaker or such a talk.

For each, it removes the image from every post, variant and Task that holds it — found by the
file's references, drafts and release versions included — and then deletes the file, image or
video, unconditionally rather than through the orphan check. Our record of a published post keeps
its text and loses its image; the post on Bluesky or LinkedIn is outside our reach either way.

Erasure is one hard-coded plan, not a registry: this is a new branch in it, and its verification
step counts named document types, so it gains a counter for `marketingAsset` and for the files.

**Known hole.** An image with no subject — a group photo, a collage — cannot be found this way. The
upload form says so beside the subject field.

`/privacy` says today that photos are collected and that a speaker can untag themselves from the
photo gallery. It says nothing about speaker photos being used in generated promotional graphics,
and untagging does not reach a marketing asset or a post. It gains that text, with erasure as the
way to remove them.

## 7. Studio cards sized for social

The studio's cards have the shapes they happened to be built in — speaker cards square at 256 px,
sponsor cards 16:9 at 400 px, promos 2:1 — captured at four times their size, so a speaker card is
1024 px: under the 1080 px this spec warns about. LinkedIn wants 1.91:1; Bluesky takes any shape.
Cropping a square card to 1.91:1 cuts off the name or the logo.

Its own follow-up spec, scheduled directly after "Save to gallery" and before the Task and video
work: a format choice — **square, landscape 1.91:1, portrait 4:5** — with each template laid out
for each format at full social resolution, speaker and sponsor cards first.

The second follow-up, **automatic video and GIF posting**, starts with a spike: Bluesky's video
service end to end (service auth, upload, job polling, the email-verified account, a GIF transcoded
to video), and one real LinkedIn video and one GIF through Buffer to learn what it accepts and
whether a GIF animates in a Page post.

## 8. Slices

1. **The gallery** — the type (§3), the page and its filters, the upload path for images (§4.1),
   edit and delete with the shared orphan check (§5), speaker erasure and `/privacy` (§6).
2. **Picking in the post editor** — §5, and "used in N posts".
3. **"Save to gallery" in the studio**, and "Open in studio" — §4.2.
4. **Follow-up spec: studio cards sized for social** — §7.
5. **Render Tasks** — auto-save with replace, and finishing a Task from the gallery — §4.3.
6. **Video and GIFs** — upload with streaming move and poster frame, preview, download on the
   manual post view — §4.1, §5.
7. **Follow-up spec and spike: automatic video and GIF posting** — §7.

## 9. What the code changed before this was written

- **Video does not stay in Blob** (§4.1). No permanent-blob pattern exists; it would have had no
  deletion owner, and erasure would have reported clean while the file stayed public.
- **The existing image upload cannot carry a 10 MB GIF** — Vercel's body limit, not the route's
  cap. Hence one direct-upload path for every kind.
- **The picker's unused slot is the wrong shape** — it re-uploads bytes. The photo-gallery source,
  which copies a reference, is the model.
- **"Used in N posts" cannot gate deletion.** Tasks reference the same image asset, and the only
  safe orphan check is global and lives inside speaker erasure today.
- **A render Task accepts only its own fresh upload**, so finishing one from the gallery means
  relaxing that check deliberately.
- **"Open in studio" cannot address a talk or a card variant** — the studio has no such parameter.
- **Permissions are per organization.** "Any organizer may edit any edition's assets" is the only
  option the system offers.
- **`/privacy` does not cover speaker photos in generated graphics**, and untagging never reaches
  them.
- A review round added: the explicit `scope` field (the natural query is the lint's fail-open
  shape), org-wide assets being refused as foreign by the attach check, the blob move trusting an
  arbitrary URL in the precedent, the studio's own upload route being under the same body limit,
  GIF refusal being server-side, replace keeping organizer edits, write-time validation of the
  edition and the subject — and that erasure as first written would have left the speaker's card
  public (§6), which the organizer decided: the image goes everywhere.
