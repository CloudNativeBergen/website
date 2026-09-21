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
| `conference`   | Optional reference: the edition this asset is about. A speaker card has one; a logo does not                  |
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

- The token route authorizes an organizer of the current organization, scopes the pathname to a
  `marketing-asset-` prefix, and sets the content types and size per kind.
- **The move to Sanity streams.** The existing transfer reads the whole file into memory, which is
  tolerable at 50 MB of slides and not at 100 MB of video.
- The orphan sweeper cron lists blobs by the `proposal-` prefix. It gains the new prefix, so an
  upload abandoned before the move is cleaned up the same way.

Nothing is kept in Blob. **This reverses what the interview was told** — that video would stay in
file storage by direct upload. A permanent blob would have had no deletion owner: asset delete,
speaker erasure and the sweeper would all have missed it, and its public URL would have outlived
the speaker's erasure (§6). In Sanity, a video is a referenced file asset like any other.

Not verified: Sanity's own per-file size limit on the project's plan. The first slice that uploads
video checks it against a real 100 MB file before anything else is built on it.

### 4.2 From the studio, by choice

Every studio tab gets **"Save to gallery"** beside Download. The studio already routes captures
through one context that a `studioRender` Task fills with "attach to Task"; without a Task it is
empty today. It gains a gallery action that is always present. Saving asks for a title and alt text
(prefilled where the card knows its subject) and records the tab and the speaker or sponsor the
studio was opened on.

**"Open in studio"** on such an asset reopens that tab on that subject. The studio addresses a tab,
a speaker and a sponsor today — not a talk and not a particular card variant — so that is as close
as it lands.

### 4.3 From a render Task, automatically

Attaching a render to a `studioRender` Task also saves it to the gallery, with title, subject,
edition and alt taken from the Task. Rendering the same Task again **replaces** that Task's gallery
entry rather than adding a second one. Posts that already took the old image keep it (§5).

A gallery asset can also **finish a render Task**: beside "render in the studio", the Task offers
"use an asset from the gallery". Attaching accepts only the image this Task uploaded moments ago;
it additionally accepts the image of an `image` asset of the current organization, and from there
the hand-off to the waiting posts is the existing one. GIFs and videos cannot finish a render Task
— the post they would be handed to cannot hold them yet.

## 5. Using an asset in a post

The post editor's image picker gains a **"Marketing assets"** source beside upload and photo
gallery. It lists assets about the post's subject first, then this edition's, then the
organization-wide ones, with the same search.

Picking works exactly as picking a photo does: the image asset REFERENCE and the alt text are copied
into the post's own attachments, with no re-upload, and the alt stays editable per post. So:

- **Deleting an asset never breaks a post.** The post holds its own reference.
- The gallery shows **"used in N posts"**, a tenant-scoped count for display only.
- The picker's long-declared "studio asset" seam is NOT this. It is shaped to render a card and
  upload its bytes on the spot, and nothing has ever supplied it. It stays unused.

GIFs and videos show in the picker marked "can't be attached yet". On the **manual** post view they
can be: the view offers the file to download, and the organizer posts it by hand.

**Deleting the underlying file.** Removing a gallery entry — by delete, or by a re-render replacing
it — deletes the Sanity asset only if NOTHING references it any more, across all document types
and tenants: posts and Tasks reference the same image. The repo has exactly one such check, inside
speaker erasure; it moves somewhere shared and both use it. Without it every replaced render joins
the unreferenced image assets production already has.

## 6. Privacy

- Speaker erasure is one hard-coded plan, not a registry. It gains a branch that deletes the
  `marketingAsset` documents whose subject is the speaker, and their image and file assets go
  through the orphan check. Because video is a Sanity file and not a blob, the existing
  verification step can see it.
- `/privacy` says today that photos are collected and that a speaker can untag themselves from the
  photo gallery. It says nothing about speaker photos being used in generated promotional
  graphics, and untagging does not reach a marketing asset or a post. It gains that text, with
  erasure as the way to remove them.

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
