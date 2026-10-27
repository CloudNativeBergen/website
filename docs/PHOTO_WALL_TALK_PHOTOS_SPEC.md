# Photo Wall: photos of my talk

Status: **draft**. Extends the [Photo Wall spec](PHOTO_WALL_SPEC.md): a
contributor may tag a Wall Post with the talk it shows, and approved tagged
posts appear with that talk on the program, on its speakers' public pages and
on their speaker dashboard. Everything not said here works as in the Photo
Wall spec: same data, same moderation, same cookie, same 30-day deletion.

Field names, helpers, tags and file locations are _implementation details_
(Photo Wall spec, preamble); an implementer may pick better ones.

## 1. What this delivers

On `/wall/post` the composer suggests the talk running now in a room the
contributor picks; they keep it, pick another talk of this conference, or
post untagged. An organizer can set, change or clear the tag on
`/admin/photo-wall`. Once a tagged post is approved it shows:

- on the talk's card in the program (at most 6 photos and a link to `/wall`);
- under that talk on each of its speakers' public pages (`/speaker/[slug]`);
- in **Photos of your talks** on the speaker dashboard (`/cfp/list`).

A speaker can opt out. If **any** speaker of a talk has opted out, that
talk's photos leave the program and every speaker page (§7.4). They stay on
the Photo Wall, and the talk's speakers still see them on their own dashboard,
marked as hidden (§7.3).

### Out of scope

- **Accounts for contributors.** A Wall Post still belongs to a phone (the
  `konf_wall` device cookie, Photo Wall spec §6.1, §12), not to a signed-in
  person. Nothing here asks a contributor to sign in or links a post to an
  attendee record.
- **Changing the tag after posting, by the contributor.** A contributor who
  tagged the wrong talk deletes the post in My posts and posts again, or asks
  an organizer (§6).
- **Promoting Wall Posts into the conference gallery**
  (`sanity/schemaTypes/imageGallery.ts`, `src/lib/gallery/`), as in the Photo
  Wall spec §1.
- **Face recognition or any automatic tagging.**
- **A per-talk filter on `/wall`** and **push delivery.** Talk surfaces read a
  cached list expired by tags (§8), like the wall.

## 2. Vocabulary

Builds on `CONTEXT.md` ("Photo Wall") and the Photo Wall spec §2.

- **Talk tag**: the optional reference from a Wall Post to one talk of the
  same conference.
- **Room**: a track of the day's schedule (`ScheduleTrack.trackTitle`,
  `src/lib/conference/types.ts`). The composer calls it a room.
- **Running talk**: a talk in the chosen room whose status is `happening-now`
  or `happening-soon` (`getTalkStatus`, `src/lib/program/time-utils.ts`).
- **Recent talk**: a talk in the chosen room that ended at most 30 minutes ago.
- **Talk photo opt-out**: a speaker's choice that attendee photos of their
  talks are not shown on the program or on speaker pages.

## 3. Decision index

Decided by the user while this spec was written (2026-10-27):

- **Co-speaker opt-out:** if any speaker of a talk opts out, the talk card
  hides its photos, and so do the pages of **all** that talk's speakers.
- **What can be tagged:** any talk of this conference, on any day. The
  suggestion defaults to the running (or recent) talk in the chosen room; the
  picker also offers earlier days.
- **Talk card:** at most 6 photos, plus a link to the full wall.
- **Organizer tag changes:** an organizer may set, change or clear a post's
  talk tag (§6.3). It is the one named exception to "organizers never edit a
  Wall Post": the tag is metadata, not content, and nothing else on the post
  changes. `CONTEXT.md` and the Photo Wall spec §1 record the exception.
- **Dashboard:** a speaker still sees their own talk's photos when a
  co-speaker opted out, marked as hidden from public pages (§7.3).
- **Opt-out scope:** the opt-out hides talk galleries only (talk card, speaker
  pages). `/wall` and Screen Mode are unchanged (§7.4).

Settled in this spec without asking:

| Topic         | Rule                                                            |
| ------------- | --------------------------------------------------------------- |
| Reference     | Weak reference, so deleting a talk never blocks on posts        |
| Tenant check  | Server checks the talk's conference before any upload           |
| Photo URLs    | `squareSrc` / `wholeSrc` with plain `<img>`, never `next/image` |
| Opt-out field | On `speaker`, outside `consent`, like `socialTagOptOut`         |
| Marketing     | A tag never changes `marketingConsent` or the export            |
| Deletion      | Unchanged: Delete, Delete now and the 30-day cron remove it     |

## 4. Data model

`conference` is not touched (append-only, `AGENTS.md`).

### 4.1 `wallPost.talk`

One optional field on `wallPost` (`sanity/schemaTypes/wallPost.ts`):

```ts
defineField({
  name: 'talk',
  title: 'Talk',
  description: 'The talk this photo shows, if the contributor tagged one.',
  type: 'reference',
  to: [{ type: 'talk' }],
  weak: true,
})
```

- The document type is already read-only in Studio (`readOnly: true` on the
  type), so the field needs no `readOnly` of its own.
- **Weak**, because a strong reference would stop an organizer deleting a talk
  that has tagged posts. A dangling or absent reference reads as `null`, and
  the post is simply untagged.
- Existing posts have no `talk` and stay valid; nothing is migrated.

### 4.2 `speaker.talkPhotosOptOut`

Two fields on `speaker` (`sanity/schemaTypes/speaker.ts`), copied from
`socialTagOptOut` / `socialTagOptOutAt` and their rules there: boolean, no
`initialValue`, absent means not opted out, read-only in Studio, timestamp
stamped by the server, and an organizer may **set** the opt-out for a speaker
but never clear it. It lives outside `consent` for the same reason
`socialTagOptOut` does: it records a permission withheld.

## 5. Showing photos

As the Photo Wall spec §5.1: plain `<img>`, URLs from `squareSrc` and
`wholeSrc` (`src/lib/photo-wall/square.ts`), never `next/image`
(`src/components/photo-wall/no-next-image.test.ts` covers the new
components). Thumbnails are the stored square crop; a tap opens the whole
photo with its caption and name, in a dialog with focus trap and Escape.

## 6. Posting and moderation

### 6.1 Composer (`/wall/post`)

A **Talk** row in `WallComposer`
(`src/components/photo-wall/composer/WallComposer.tsx`), below the filter
strip and above the consent note.

1. `ComposerPage` (`src/app/(public)/wall/post/page.tsx`) passes the
   conference's published schedule days and their talks (id, title, speaker
   names, room, start, end). It is public program data.
2. **Room:** chips of the current day's tracks. With one track there is no
   choice. The last room chosen is kept in `sessionStorage` for the next post.
3. **Suggestion:** for the chosen room and `getCurrentConferenceTime()`
   (`src/lib/program/time-utils.ts`, which follows the dev time simulation in
   `src/lib/program/dev-time.ts`), the running talk; else the recent talk;
   else none. Shown as "Tag: _title_
   (now in _room_)", preselected.
4. **Change talk:** a list with today's talks in the chosen room first, then
   the other rooms, then earlier days, newest first. Any talk of this
   conference can be picked.
5. **No talk** clears the tag. Tagging is never required.

### 6.2 Submit

The multipart body of `POST /wall/post/submit` gains an optional `talkId`.

- `checkWallFields` (`src/lib/photo-wall/fields.ts`): empty means none;
  anything else must look like a Sanity document id, or the submit is refused
  `failed`.
- `submitWallPost` (`src/lib/photo-wall/submit.ts`), in step 4, before the
  upload in step 5 (guard before upload, Photo Wall spec §6.2): read the talk
  on the uncached client and refuse `failed` unless it exists, is published
  and has `conference._ref` equal to this conference.
- Step 5 writes `talk: { _type: 'reference', _ref, _weak: true }` with the
  create.
- A refusal says nothing about why, as for every other `failed`.

### 6.3 Moderation (`/admin/photo-wall`)

`WallPostCard` (`src/components/photo-wall/admin/WallPostCard.tsx`) shows the
tag (talk title, speakers) or **Add talk** on every tab, and **Change** /
**Remove tag**. Change opens a searchable list of this conference's talks.

A new `photoWall.setTalkTag` mutation (`adminProcedure`,
`src/server/routers/photoWall.ts`) takes the post id, the `shown` incarnation
(as `approve` and `remove` do), and `talkId` or `null`. It checks the talk's
conference as Submit does (`BAD_REQUEST` otherwise), patches with
`ifRevisionId` against the read (re-read and retry once on a conflict, as
`moderateWallPost` in `src/lib/photo-wall/moderate.ts`), and expires the tags
in §8. It leaves `status`, `approvedAt` and `decidedAt` alone, so fixing the
tag of a post on the wall doesn't take it off.

## 7. Where tagged photos show

Only **approved** posts, newest approval first. The public surfaces (§7.1,
§7.2) also require that no speaker of the talk has opted out; the dashboard
(§7.3) does not.

### 7.1 Program talk card

`TalkCard` (`src/components/program/TalkCard.tsx`) is a client component used
by every program view. When its description is expanded
(`isDescriptionExpanded`), it loads the talk's photos and shows **Photos from
this talk (N)**: up to 6 square thumbnails, then **See all on the Photo
Wall**, a link to `/wall`. No photos, no row. The read is public and needs no
cookie, so it can be a Server Action or a route handler outside `/wall`
(_implementation detail_); it returns at most 6 posts and the count.

### 7.2 Speaker public page

`/speaker/[slug]` (`src/app/(main)/speaker/[slug]/page.tsx`, cached with
`'use cache'` and `content:speaker-detail`) lists the speaker's talks. Under
each talk with photos, a strip of up to 6 thumbnails and the same link. It
stays separate from the organizers' gallery (`PhotoGallerySection`).

### 7.3 Speaker dashboard

On `/cfp/list` (`src/app/(cfp)/cfp/list/page.tsx`), the conference card
(`CompactConferenceCard`, next to `CompactPhotoStrip`) gets **Photos of your
talks (N)** for the speaker's talks at that conference, each photo with a
link to the whole image. Below it, the opt-out switch (§7.4). The speaker
sees their talks' photos here even when a co-speaker opted out, with a line
saying they are hidden from public pages, so they can see what the opt-out
hides. This read therefore skips the opt-out condition of §8; whether that is
a flag on `getTalkPhotos` or a second function is an _implementation detail_.

### 7.4 Opt-out

A speaker sets or clears it on the dashboard and in the profile
(`CFPProfilePage`, where `socialTagOptOut` already sits), through a self-only
mutation that writes just that field, as `setSocialTagOptOut` does
(`src/server/routers/speaker.ts`). An organizer can set it in
`SpeakerManagementModal`, never clear it.

A talk's photos are hidden on the talk card and on **every** speaker page for
that talk when any of its speakers (`talk.speakers`) has opted out. The rule
is one GROQ condition in the shared read (§8), so no surface can forget it:
`count(talk->speakers[@->talkPhotosOptOut == true]) == 0`.

The opt-out doesn't touch the Photo Wall: the posts stay on `/wall` and
Screen Mode, where they were approved as photos of the event. A speaker who
wants a specific photo gone asks the organizers, who use Delete now (§9).

## 8. Caching

The public surfaces share one read, `getTalkPhotos(conferenceId, talkId)` in
`src/lib/photo-wall/cache.ts`, `'use cache: remote'` over the uncached client,
`default` life, tagged `photo-wall-talk:<talkId>` (`photoWallTalkTag` in
`src/lib/cache/tags.ts`) and `photo-wall:<conferenceId>`.

Expired with `revalidateTag(tag, { expire: 0 })` as the rest of the Photo Wall
(Photo Wall spec §8). `expireWallPost` and `updateWallPostTags` gain an optional talk id
(both the old and new one on a tag change):

| Write                                     | Also expires                                      |
| ----------------------------------------- | ------------------------------------------------- |
| Submit (pending, never shown)             | nothing new                                       |
| Approve, reject, remove, Approve all      | the post's talk tag                               |
| Delete, Delete now, sweep, retention cron | the post's talk tag                               |
| `setTalkTag`                              | old and new talk tags                             |
| Speaker sets or clears the opt-out        | tags of all their talks, `content:speaker-detail` |

Reject of a pending post changes nothing public, but expiring is cheap and
keeps the rule simple. The retention cron deletes whole walls, so it expires
`photo-wall:<conferenceId>`, which every talk read also carries.

## 9. Privacy

- **Basis unchanged.** Display rests on the contributor's consent given by
  posting (Photo Wall spec §12). The composer's notice gets one clause: a
  tagged photo is also shown with the talk on the program and its speakers'
  pages.
- **Marketing unchanged.** A tag never sets `marketingConsent`, and the
  consented export (`src/lib/photo-wall/export.ts`) is not changed.
- **Removal.** Delete, Delete now (`deleteWallPost`, `src/lib/photo-wall/delete.ts`)
  and the 30-day cron (`runPhotoWallRetention`,
  `src/lib/photo-wall/retention.ts`) remove the post and with it the tag; the
  talk surfaces follow on the next read after their tags expire.
- **People in a photo**, speakers included, ask the organizers as today
  (`docs/PRIVACY_OPERATIONS.md`, "Photo Wall removal requests"). That section
  gets a line on the speaker opt-out: it hides talk photos, it doesn't delete
  them.
- `/privacy` (`id="photo-wall"`) gets the same clause as the composer notice.

## 10. Slices

Each slice is one PR. UI slices ship Storybook stories and are checked with
`pnpm shoot` at phone width (admin and dashboard: desktop), light and dark,
with the story file's dark-mode mechanism checked (`AGENTS.md`). New tRPC
endpoints are mocked in UI tests and the mutation-surface snapshots updated.

Order: T1 first; then T2, T4 and T5 at once; then T3 after T2, T6 and T7 after
T5; T8 last.

- **T1 Schema and Submit.** `wallPost.talk` (§4.1); `talkId` in
  `checkWallFields` and `submitWallPost` with the tenant check before upload
  (§6.2).
- **T2 Suggestion helper.** A pure function in `src/lib/photo-wall/` from
  schedule days, room and time to the suggested talk and the ordered list
  (§6.1). Tests: before the first talk, between talks, 2 minutes before a
  start, 30 and 31 minutes after an end, parallel rooms, a later day, after
  the conference.
- **T3 Composer.** The Talk row in `WallComposer`, `talkId` through
  `WallPoster` into the submit body, `ComposerPage` passing the schedule, the
  notice clause (§9).
- **T4 Moderation.** `setTalkTag` and the tag on `WallPostCard` (§6.3).
- **T5 Read and tags.** `photoWallTalkTag`, `getTalkPhotos` with the opt-out
  condition, the talk id through `expireWallPost` / `updateWallPostTags` and
  their callers (§8).
- **T6 Talk card.** The photo row and dialog (§7.1).
- **T7 Speaker page and dashboard.** §7.2, §7.3 without the switch.
- **T8 Opt-out.** `speaker.talkPhotosOptOut` (§4.2), the switch on the
  dashboard, profile and admin modal, its expiry (§8), the
  `PRIVACY_OPERATIONS.md` and `/privacy` lines (§9).

T8 can ship before T6 and T7 to have the opt-out in place before any photo is
public; otherwise T5's condition reads an absent field as "not
opted out" and is already correct.

## 11. Verification

As the Photo Wall spec §14, plus:

- **Guard before upload:** with `clientWrite.assets.upload` mocked, a submit
  with another conference's talk, an unknown id or a malformed id is refused
  `failed` and `upload` is never called.
- **Untagged still works:** a submit without `talkId` creates the post as
  today.
- **Opt-out:** a talk with two speakers, one opted out, returns no photos from
  `getTalkPhotos`. Sabotage-prove it by dropping the condition.
- **Status:** a tagged post that is Pending, Not shown or Deleting is never
  returned.
- **Concurrency:** `setTalkTag` against a changed revision, using
  `__tests__/helpers/versionedSanityStore.ts`.
- **Tags:** each write in §8 expires the listed tags, including both on a tag
  change.
- **No `next/image`:** `no-next-image.test.ts` covers the new components.

## 12. Open questions

1. **Room QR codes.** Should signs in each room carry a link like
   `/wall/post?room=<track>` that preselects the room? Needs a stable room key
   (track titles can change) and the same param on the talk card's link.
2. **Dashboard download.** Is a link to the whole image enough, or does a
   speaker want the stored original? Wall Posts are re-encoded on the phone,
   so the original is at most 2048 px.
3. **After the conference.** All Wall Posts are deleted 30 days after the
   conference, so the talk photos vanish from the program and speaker pages
   then. Is that what speakers should be told on the dashboard?
