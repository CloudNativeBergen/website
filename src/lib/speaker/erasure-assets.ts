/**
 * Erasure's marketing-image branch (#1162, `docs/MARKETING_ASSETS_SPEC.md` §6).
 *
 * AN ERASURE REQUEST MEANS THE IMAGE GOES — EVERYWHERE WE HOLD IT. "Deleting an
 * asset never breaks a post" is right for an organizer tidying the gallery and
 * wrong here: deleting only the gallery entry would leave the file stored and
 * publicly addressable on `cdn.sanity.io` for as long as any post or Task held
 * it, with the erasure reporting clean.
 *
 * So the branch:
 *  1. finds what is ABOUT the speaker ({@link speakerSubjectIds}): gallery
 *     assets and Tasks whose subject is the speaker or a talk they give;
 *  2. collects every file those hold ({@link linkedFileIds}) — a gallery asset's
 *     image or video, a Task's render — and every file a saved video holds
 *     under a subject it copied from the gallery ({@link projectSubjectFileIds}),
 *     and — through each saved video holding one — the files of every gallery
 *     video exported from it (#1182, see {@link fetchSpeakerAssetInputs});
 *  3. finds every document holding one of those files by the FILE's references,
 *     drafts and release versions included, and plans what each loses
 *     ({@link planSpeakerAssetErasure});
 *  4. and, after the transaction, deletes the files UNCONDITIONALLY — not through
 *     the orphan check, which would keep a file any stray document still held.
 *
 * A holder this branch does not know how to strip is REFUSED before anything is
 * written (fail closed, as the rest of the plan): the file cannot be deleted
 * while that document references it, and reporting clean over it is the
 * failure this whole operation is built to avoid.
 *
 * KNOWN HOLE. An image with NO SUBJECT — a group photo, a collage, a render
 * saved from a Task with no subject, or an image an organizer attached by
 * hand to a post about the speaker — is linked to nobody and is not found.
 * Nothing can find it: the image itself is the only record of who is in it,
 * and deleting every image of a post about the speaker would take sponsor
 * graphics and co-speakers' photos with it.
 * The upload form says so beside the subject field, and `/privacy` says so.
 *
 * Pure planner plus one read function, split from `./erasure.ts` so the plan
 * stays readable; the transaction, the file deletes and the verification live
 * there with the rest of the operation.
 */
import { getPublishedId } from '@sanity/client/csm'
import { groq } from 'next-sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { COUNT_API_VERSION } from '@/lib/sanity/orphaned-asset'
import type { ErasureDocumentDelete, ErasureDocumentPatch } from './erasure'

type Doc = Record<string, unknown> & { _id: string; _type: string }

/** An array entry as far as this branch reads one: a post or variant attachment. */
interface Entry {
  _key?: unknown
  image?: unknown
  source?: unknown
}

/** What {@link planSpeakerAssetErasure} needs. Reads live in {@link fetchSpeakerAssetInputs}. */
export interface SpeakerAssetInputs {
  /** `marketingAsset` and `marketingTask` documents, any version, whose subject is linked. */
  subjectDocs: Doc[]
  /** Every document, any version, that references one of the linked files. */
  fileHolders: Doc[]
  /** `socialPostVariant`s, any version, of the posts among {@link fileHolders}. */
  variants: Doc[]
  /**
   * The PUBLISHED version of each of those posts, whether or not it holds a
   * file: a variant resolves its attachments against it, so it decides what a
   * variant entry picks (see {@link planSpeakerAssetErasure}).
   */
  publishedPosts: Doc[]
}

/** The branch's share of the erasure plan. */
export interface SpeakerAssetPlan {
  /** Image and file asset ids to delete unconditionally after the transaction. */
  fileIds: string[]
  patches: ErasureDocumentPatch[]
  deletes: ErasureDocumentDelete[]
  refusals: string[]
  /**
   * The document behind each refusal, in the same order — what a counter
   * reads, never the refusal's wording.
   */
  refused: { id: string; type: string }[]
}

/** The Task fields that hold a render. */
const TASK_RENDER_FIELDS = ['asset', 'pendingStudioAsset'] as const

/** What a Task records of the gallery image it was finished with (#1166). */
const TASK_GALLERY_FIELDS = [
  'galleryAsset',
  'galleryAlt',
  'galleryHotspot',
  'galleryCrop',
] as const

/**
 * Every render a Task names: its render, its pending upload, and the renders
 * it replaced that could not be deleted yet (`replacedRenders`, plain asset
 * ids written by `retireReplacedRenders`) — a post may still hold one of
 * those, and nothing else records that it came from this Task.
 */
function taskRenderIds(doc: Doc): string[] {
  const ids = TASK_RENDER_FIELDS.map((f) => fileRefOf(doc[f])).filter(
    (id): id is string => id !== null,
  )
  if (Array.isArray(doc.replacedRenders))
    for (const id of doc.replacedRenders)
      if (typeof id === 'string') ids.push(id)
  return ids
}

/** Sanity `_key`s are safe to interpolate only if they look like this. */
const SAFE_KEY = /^[A-Za-z0-9._-]+$/

function refOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const ref = (value as { _ref?: unknown })._ref
  return typeof ref === 'string' ? ref : null
}

/** The asset id of an image or file field, `{ asset: { _ref } }`. */
function fileRefOf(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  return refOf((value as { asset?: unknown }).asset)
}

/** A video project scene's background image, `{ background: { image } }`. */
function backgroundImageOf(scene: Entry): unknown {
  const background = (scene as { background?: unknown }).background
  return typeof background === 'object' && background !== null
    ? (background as { image?: unknown }).image
    : undefined
}

function entries(value: unknown): Entry[] {
  return Array.isArray(value)
    ? value.filter((e): e is Entry => typeof e === 'object' && e !== null)
    : []
}

/** Every `_ref` anywhere inside `value`. */
function refsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => refsIn(v, out))
  else if (typeof value === 'object' && value !== null) {
    const ref = refOf(value)
    if (ref) out.add(ref)
    Object.values(value).forEach((v) => refsIn(v, out))
  }
  return out
}

function revOf(doc: Doc): string | undefined {
  return typeof doc._rev === 'string' ? doc._rev : undefined
}

/**
 * The ids a gallery asset or Task may name as its subject to be linked to the
 * speaker: the speaker, and every talk that lists them in `speakers[]` — a
 * co-speaker's talk included, since an image of the talk shows them. Draft and
 * release copies of a talk name the same published id.
 */
export function speakerSubjectIds(speakerId: string, talks: Doc[]): string[] {
  const given = talks
    .filter(
      (doc) =>
        Array.isArray(doc.speakers) &&
        doc.speakers.some((s) => refOf(s) === speakerId),
    )
    .map((doc) => getPublishedId(doc._id))
  return [...new Set([speakerId, ...given])]
}

/**
 * Every file the subject documents hold. A gallery asset is walked whole for
 * `{ asset: { _ref } }` rather than read from a named field, so a video and
 * its poster (#1167) are linked the day they exist. A Task holds its renders
 * ({@link taskRenderIds}) and nothing else of the speaker's.
 *
 * A Task's file that a gallery asset still holds, in any version —
 * `galleryHeld`, see {@link readGalleryHeldFiles} — is the GALLERY's
 * (#1166): the asset's own subject decides, as for a saved video (#1181),
 * so a Task about the speaker holding the organization's logo must
 * not cost the logo. That holds for the image it was finished with and for
 * one it recorded as replaced (a gallery copy the re-render could not guard
 * may hold it). An asset about the speaker is among `subjectDocs` and takes
 * its file with it. Once no such asset holds the file, the Task's subject
 * decides again.
 */
export function linkedFileIds(
  subjectDocs: Doc[],
  galleryHeld: ReadonlySet<string> = new Set(),
): string[] {
  const ids = new Set<string>()
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (typeof value !== 'object' || value === null) return
    const file = fileRefOf(value)
    if (file) ids.add(file)
    Object.values(value).forEach(walk)
  }
  for (const doc of subjectDocs) {
    if (doc._type === 'marketingAsset') walk(doc)
    if (doc._type === 'marketingTask')
      taskRenderIds(doc)
        .filter((id) => !galleryHeld.has(id))
        .forEach((id) => ids.add(id))
  }
  return [...ids]
}

/** A saved video's file with the subject it copied, as erasure reads it. */
export interface ProjectFileSubject {
  fileId: string | null
  subjectId: string | null
  /** Its gallery asset still exists: then the gallery's subject decides. */
  live: boolean | null
  /** That asset's subjects NOW, one per version, where it still exists. */
  liveSubjectIds?: string[]
}

/**
 * The files a saved video (#1181) or an exported one (#1182) holds under a
 * subject copied from the gallery asset, where that subject is linked to
 * the speaker. While the asset exists its own, possibly corrected, subject
 * decides — applied to THIS file, which may be an older image the entry has
 * since replaced and so is not the entry's to link any more. Once the asset
 * is gone, the copy is all that is left, and it decides.
 */
export function projectSubjectFileIds(
  files: ProjectFileSubject[],
  subjectIds: string[],
): string[] {
  const subjects = new Set(subjectIds)
  const linked = (f: ProjectFileSubject) =>
    f.live
      ? (f.liveSubjectIds ?? []).some((id) => subjects.has(id))
      : !!f.subjectId && subjects.has(f.subjectId)
  return [
    ...new Set(
      files.filter((f) => f.fileId && linked(f)).map((f) => f.fileId as string),
    ),
  ]
}

/**
 * What every holder of a linked file loses. Pure; see the module comment.
 *
 *  - a GALLERY ENTRY (any version) is deleted: an asset is its image. One
 *    about the subject is deleted even if it holds no file;
 *  - a POST loses the attachment, and each of its variants the entries that
 *    pick it — the record keeps its text. A variant picks by `_key` from the
 *    PUBLISHED post, so an entry is kept when the published post's attachment
 *    under that key is a different image: a draft reusing the key for the
 *    subject's image must not cost the live variant its own;
 *  - a TASK loses its render (and a pending upload of it), nothing else;
 *  - a VIDEO PROJECT loses the background of each scene that shows the file
 *    (by scene key; the scene falls back to its colour) and a linked track;
 *  - the SUBJECT speaker needs nothing: its `image` is unset with the rest;
 *  - anything else — another type, or a post or Task holding the file where
 *    this branch does not look — is REFUSED, so the file delete is never
 *    reached with a holder left.
 */
export function planSpeakerAssetErasure(
  speakerId: string,
  fileIds: string[],
  inputs: SpeakerAssetInputs,
): SpeakerAssetPlan {
  const files = new Set(fileIds)
  const isLinked = (value: unknown) => files.has(fileRefOf(value) ?? '')
  const patches: ErasureDocumentPatch[] = []
  const deletes: ErasureDocumentDelete[] = []
  const refusals: string[] = []
  /** Published post id → the attachment keys its versions lose. */
  const strippedKeys = new Map<string, Set<string>>()

  /**
   * Whether `doc` would still reference a linked file once `without` is gone:
   * a post or Task holding the file somewhere this branch does not strip (an
   * Open Graph image, a nested block). Such a holder is refused BEFORE
   * anything is written, or the file delete would fail after the commit.
   */
  const stillHolds = (doc: Doc, without: (copy: Doc) => void) => {
    const copy = structuredClone(doc)
    without(copy)
    return [...refsIn(copy)].some((ref) => files.has(ref))
  }

  const refused: SpeakerAssetPlan['refused'] = []
  const refuse = (doc: Doc, why: string) => {
    refused.push({ id: doc._id, type: doc._type })
    refusals.push(
      `${doc._type} ${doc._id} holds an image linked to the subject ${why}; ` +
        'remove it by hand and re-run',
    )
  }

  /** Unset the entries with these keys, or refuse the document. */
  const unsetEntries = (doc: Doc, keys: unknown[], reason: string) => {
    if (!keys.every((k) => typeof k === 'string' && SAFE_KEY.test(k))) {
      refuse(doc, 'in an attachment whose _key cannot be safely selected')
      return false
    }
    patches.push({
      id: doc._id,
      type: doc._type,
      rev: revOf(doc),
      unset: keys.map((k) => `attachments[_key=="${String(k)}"]`),
      reason,
    })
    return true
  }

  /**
   * The `replacedRenders` entries of a Task that this erasure deletes. Plain
   * asset ids, so `references()` never finds them: unset here, or a re-run
   * would find them again and the plan would never reach its fixed point.
   * An id that cannot be put in a selector is left; the record's only harm
   * is a re-run retrying a delete that is already done.
   */
  const unrecord = (doc: Doc): string[] =>
    (Array.isArray(doc.replacedRenders) ? doc.replacedRenders : [])
      .filter(
        (id): id is string =>
          typeof id === 'string' && files.has(id) && SAFE_KEY.test(id),
      )
      .map((id) => `replacedRenders[@=="${id}"]`)
  /** Tasks already given a patch, so each gets ONE (one revision guard). */
  const patchedTasks = new Set<string>()

  const deleted = new Set<string>()
  const deleteAsset = (doc: Doc, reason: string) => {
    if (deleted.has(doc._id)) return
    deleted.add(doc._id)
    deletes.push({ id: doc._id, type: doc._type, reason })
  }

  // A gallery entry ABOUT the subject goes whether or not it holds a file
  // (a draft saved before its upload finished holds none): verification
  // counts every one, so leaving it would never report clean.
  for (const doc of inputs.subjectDocs) {
    if (doc._type === 'marketingAsset') {
      deleteAsset(doc, 'gallery entry about the subject')
    }
  }

  for (const doc of inputs.fileHolders) {
    switch (doc._type) {
      case 'marketingAsset':
        deleteAsset(doc, 'gallery entry holding an image linked to the subject')
        break

      case 'socialPost': {
        const keys = entries(doc.attachments)
          .filter((a) => isLinked(a.image))
          .map((a) => a._key)
        const stripped = new Set(keys)
        if (
          keys.length === 0 ||
          stillHolds(doc, (copy) => {
            copy.attachments = entries(copy.attachments).filter(
              (a) => !stripped.has(a._key),
            )
          })
        ) {
          refuse(doc, 'outside its attachments')
          break
        }
        const ok = unsetEntries(
          doc,
          keys,
          'post attachment linked to the subject (the text is kept)',
        )
        if (!ok) break
        const post = getPublishedId(doc._id)
        const known = strippedKeys.get(post) ?? new Set<string>()
        keys.forEach((k) => known.add(String(k)))
        strippedKeys.set(post, known)
        break
      }

      case 'marketingTask': {
        const unset = TASK_RENDER_FIELDS.filter((f) => isLinked(doc[f]))
        if (
          unset.length === 0 ||
          stillHolds(doc, (copy) => unset.forEach((f) => delete copy[f]))
        ) {
          refuse(doc, 'outside its render')
          break
        }
        patches.push({
          id: doc._id,
          type: doc._type,
          rev: revOf(doc),
          // Where a gallery image came from (#1166), and the alt and framing
          // it was picked with, go with it.
          unset: [
            ...unset,
            ...(unset.includes('asset')
              ? TASK_GALLERY_FIELDS.filter((f) => doc[f] !== undefined)
              : []),
            ...unrecord(doc),
          ],
          reason: 'Task render linked to the subject',
        })
        patchedTasks.add(doc._id)
        break
      }

      case 'videoProject': {
        // A studio video (#1181): each scene whose background is the file
        // loses the image — a nested removal by scene key — and falls back
        // to its colour; a linked track goes too. Everything else stays.
        const keys = entries(doc.scenes)
          .filter((scene) => isLinked(backgroundImageOf(scene)))
          .map((scene) => scene._key)
        const track = isLinked(
          (doc.track as { file?: unknown } | undefined)?.file,
        )
        const stripped = new Set(keys)
        if (
          (keys.length === 0 && !track) ||
          stillHolds(doc, (copy) => {
            for (const scene of entries(copy.scenes))
              if (stripped.has(scene._key))
                delete (
                  (scene as { background?: { image?: unknown } }).background ??
                  {}
                ).image
            if (track) delete copy.track
          })
        ) {
          refuse(doc, 'outside its scene backgrounds and track')
          break
        }
        if (!keys.every((k) => typeof k === 'string' && SAFE_KEY.test(k))) {
          refuse(doc, 'in a scene whose _key cannot be safely selected')
          break
        }
        patches.push({
          id: doc._id,
          type: doc._type,
          rev: revOf(doc),
          unset: [
            ...keys.map((k) => `scenes[_key=="${String(k)}"].background.image`),
            ...(track ? ['track'] : []),
          ],
          reason:
            'video project scene background linked to the subject (the scene keeps its colour)',
        })
        break
      }

      case 'speaker':
        // The subject's own `image` is in ERASURE_UNSET_FIELDS. Any other
        // speaker — a draft of the subject included — is not ours to strip.
        if (doc._id === speakerId) break
        refuse(doc, 'as its profile image')
        break

      default:
        refuse(doc, 'and erasure does not know how to remove it from there')
    }
  }

  for (const doc of inputs.subjectDocs) {
    if (doc._type !== 'marketingTask' || patchedTasks.has(doc._id)) continue
    const unset = unrecord(doc)
    if (unset.length === 0) continue
    patches.push({
      id: doc._id,
      type: doc._type,
      rev: revOf(doc),
      unset,
      reason: 'replaced render of a Task about the subject, now deleted',
    })
  }

  /** Published post id → attachment key → the file it holds there. */
  const published = new Map(
    inputs.publishedPosts.map((post) => [
      post._id,
      new Map(
        entries(post.attachments).map((a) => [
          String(a._key),
          fileRefOf(a.image),
        ]),
      ),
    ]),
  )

  for (const variant of inputs.variants) {
    const post = refOf(variant.post)
    const keys = post ? strippedKeys.get(post) : undefined
    if (!post || !keys) continue
    const live = published.get(post)
    const picks = (source: string) => {
      if (!keys.has(source)) return false
      const file = live?.get(source)
      return file === undefined || file === null || files.has(file)
    }
    const picked = entries(variant.attachments)
      .filter((a) => picks(String(a.source)))
      .map((a) => a._key)
    if (picked.length === 0) continue
    unsetEntries(
      variant,
      picked,
      'variant attachment picking an image linked to the subject',
    )
  }

  return { fileIds: [...files], patches, deletes, refusals, refused }
}

/** A document's published id: a Studio draft's or a release copy's. */
function publishedId(id: string): string {
  return id.replace(/^drafts\./, '').replace(/^versions\.[^.]+\./, '')
}

/**
 * Which of the subject Tasks' files a gallery asset holds, in ANY version
 * (published, a Studio draft, a Content Release copy) (#1166). Spared on the
 * Task's side only: an asset ABOUT the subject is among `subjectDocs`, and
 * {@link linkedFileIds} takes its file through it all the same. A Task's own
 * render entry (#1165) is the Task's render, not the gallery's, even with
 * its subject left out: it never spares the render.
 */
async function readGalleryHeldFiles(
  client: { fetch: typeof clientReadUncached.fetch },
  subjectDocs: Doc[],
): Promise<Set<string>> {
  const tasks = subjectDocs.filter((doc) => doc._type === 'marketingTask')
  const files = [...new Set(tasks.flatMap(taskRenderIds))]
  if (files.length === 0) return new Set()
  const held =
    (await client.fetch<(string | null)[]>(
      // groq-global: by file, the gallery assets that hold a subject Task's
      // image, in every tenant — the right is the person's, and a holder
      // anywhere keeps the file.
      groq`*[_type == "marketingAsset" && image.asset._ref in $files && !(task._ref in $taskIds)].image.asset._ref`,
      {
        files,
        taskIds: [...new Set(tasks.map((doc) => publishedId(doc._id)))],
      },
      { cache: 'no-store', perspective: 'raw' },
    )) ?? []
  return new Set(held.filter((id): id is string => !!id))
}

/**
 * The reads, in order: the talks the speaker gives, what is about the subject,
 * what holds its files, and the posts and variants among those.
 *
 * All under the `raw` perspective at {@link COUNT_API_VERSION}: `raw` sees
 * drafts, and from that version on it also sees Content Release `versions.**`
 * documents. A release copy of a talk, post or asset counts like any other,
 * and a read blind to it would leave the file impossible to delete.
 *
 * @param extraFileIds Files to look for IN ADDITION to what the subject
 *   documents link now: the ones an earlier run recorded on the erased speaker
 *   and did not manage to delete, and the ones a verification is handed. After
 *   an erasure nothing links them any more, so without them a file left behind
 *   is invisible — see `verifySpeakerErasure`.
 */
export async function fetchSpeakerAssetInputs(
  speakerId: string,
  extraFileIds: string[] = [],
): Promise<{ fileIds: string[]; inputs: SpeakerAssetInputs }> {
  const client = clientReadUncached.withConfig({
    apiVersion: COUNT_API_VERSION,
  })
  const opts = { cache: 'no-store', perspective: 'raw' } as const

  const talks = await client.fetch<Doc[]>(
    // groq-global: erasure is a GLOBAL operation on a cross-org person (see
    // `./erasure.ts`); the talks they give are found in every tenant.
    groq`*[_type == "talk" && $speakerId in speakers[]._ref]{ _id, _type, speakers }`,
    { speakerId },
    opts,
  )
  const subjectIds = speakerSubjectIds(speakerId, talks ?? [])

  const subjectDocs = await client.fetch<Doc[]>(
    // groq-global: an organization's gallery and Tasks about the speaker are
    // found in every tenant, because the right is the person's.
    groq`*[_type in ["marketingAsset", "marketingTask"] && subject._ref in $subjectIds]`,
    { subjectIds },
    opts,
  )
  // The gallery entries ABOUT the subject, in any version: a file held
  // under one of them — a saved video's background or track, an export's
  // source — is read whatever subject was copied with it, so the entry's
  // subject NOW decides (a version naming the person counts), and the copy
  // only once the entry is gone. Never a deref: `->` follows the published
  // document alone, blind to a draft or release copy that names the person.
  const linkedAssetIds = [
    ...new Set(
      (subjectDocs ?? [])
        .filter((d) => d._type === 'marketingAsset')
        .map((d) => publishedId(d._id)),
    ),
  ]
  type Held = {
    fileId: string | null
    subjectId: string | null
    assetId: string | null
  }
  const [sceneFiles, trackFiles, exportSources] = await Promise.all([
    client.fetch<Held[]>(
      // groq-global: a saved video (#1181) keeps a gallery image's subject
      // with the file, so the file is found after its gallery asset is
      // deleted — in every tenant, because the right is the person's.
      groq`*[_type == "videoProject" && count(scenes[background.image.subject._ref in $subjectIds || background.image.galleryAsset._ref in $linkedAssetIds]) > 0].scenes[background.image.subject._ref in $subjectIds || background.image.galleryAsset._ref in $linkedAssetIds]{ "fileId": background.image.asset._ref, "subjectId": background.image.subject._ref, "assetId": background.image.galleryAsset._ref }`,
      { subjectIds, linkedAssetIds },
      opts,
    ),
    client.fetch<Held[]>(
      // groq-global: the same, for a saved video's music track.
      groq`*[_type == "videoProject" && (track.file.subject._ref in $subjectIds || track.file.galleryAsset._ref in $linkedAssetIds)]{ "fileId": track.file.asset._ref, "subjectId": track.file.subject._ref, "assetId": track.file.galleryAsset._ref }`,
      { subjectIds, linkedAssetIds },
      opts,
    ),
    client.fetch<Held[]>(
      // groq-global: an exported gallery video (#1182) copies, with each
      // file it showed, who the file's gallery asset said it showed — so
      // the file is found after that asset is deleted and the project has
      // moved on. In every tenant, because the right is the person's.
      groq`*[_type == "marketingAsset" && count(sources[subject._ref in $subjectIds || galleryAsset._ref in $linkedAssetIds]) > 0].sources[subject._ref in $subjectIds || galleryAsset._ref in $linkedAssetIds]{ fileId, "subjectId": subject._ref, "assetId": galleryAsset._ref }`,
      { subjectIds, linkedAssetIds },
      opts,
    ),
  ])
  const held = [
    ...(sceneFiles ?? []),
    ...(trackFiles ?? []),
    ...(exportSources ?? []),
  ]
  const assetIds = [
    ...new Set(held.flatMap((f) => (f.assetId ? [f.assetId] : []))),
  ]
  // Live in ANY version — published, a Studio draft or a Content Release
  // copy: while one exists, the gallery's own subject NOW decides, for the
  // held file too. Every version's subject counts: one naming the person
  // links the file, whatever another version says.
  const liveAssets = new Map<string, string[]>()
  if (assetIds.length > 0) {
    const rows =
      (await client.fetch<{ _id: string; subjectId: string | null }[]>(
        // groq-global: which of those gallery assets still exist, by id,
        // in any version, and who each says it shows — an asset's own
        // subject decides while it does.
        groq`*[_type == "marketingAsset" && (_id in $assetIds || _id in $draftIds || (_id in path("versions.**") && string::split(_id, ".")[2] in $assetIds))]{ _id, "subjectId": subject._ref }`,
        { assetIds, draftIds: assetIds.map((id) => `drafts.${id}`) },
        opts,
      )) ?? []
    for (const row of rows) {
      const id = row._id.split('.').pop() as string
      const known = liveAssets.get(id) ?? []
      if (row.subjectId && !known.includes(row.subjectId))
        known.push(row.subjectId)
      liveAssets.set(id, known)
    }
  }
  const projectFiles: ProjectFileSubject[] = held.map((f) => ({
    fileId: f.fileId,
    subjectId: f.subjectId,
    live: !!f.assetId && liveAssets.has(f.assetId),
    liveSubjectIds: f.assetId ? (liveAssets.get(f.assetId) ?? []) : [],
  }))
  const fileIds = [
    ...new Set([
      ...linkedFileIds(
        subjectDocs ?? [],
        await readGalleryHeldFiles(client, subjectDocs ?? []),
      ),
      ...projectSubjectFileIds(projectFiles ?? [], subjectIds),
      ...extraFileIds,
    ]),
  ]
  const empty = { fileHolders: [], variants: [], publishedPosts: [] }
  if (fileIds.length === 0) {
    return { fileIds, inputs: { subjectDocs: subjectDocs ?? [], ...empty } }
  }

  const readHolders = async (ids: string[]) =>
    (await client.fetch<Doc[]>(
      // groq-global: a file is dataset-wide and Sanity deduplicates identical
      // bytes, so a holder may be in any tenant — and the file cannot be
      // deleted while any of them still references it.
      // WHOLE documents: the planner refuses a holder that would still
      // reference a file after the fields it strips, which a projection hides.
      groq`*[references($ids)]`,
      { ids },
      opts,
    )) ?? []
  const fileHolders = await readHolders(fileIds)

  // A gallery video EXPORTED from a saved video (#1182) may show the file in
  // any frame, and records its project (a weak `project` reference). So the
  // chain is followed: from the file to the projects that hold it, to the
  // gallery videos those projects made — every version of each — and to
  // every file those hold (their MP4 and poster), whose holders are read in
  // turn. The planner then deletes each video like any gallery entry holding
  // a linked file, and its files go with the rest.
  // DELIBERATE OVER-REACH: the file alone decides, not what a frame shows —
  // a project holding it only as its TRACK, or in a scene cut from the
  // export, still takes its exported videos.
  // KNOWN HOLE: a video that was only downloaded, or one made from a project
  // deleted since, records nothing that leads here and is out of reach.
  // TO A FIXED POINT: an export's poster can itself become a background of
  // another project (Studio's image picker takes any image), and that
  // project's exports show it in turn. Each pass takes the projects among
  // the holders found so far, the exports made from them or naming a
  // linked file, and every file those exports hold; it ends when a pass
  // finds no new file. Bounded, since every pass adds a file or stops.
  const known = new Set(fileIds)
  const holderIds = new Set(fileHolders.map((d) => d._id))
  const projectsSeen = new Set<string>()
  const expanded = new Set<string>()
  const addHolders = (docs: Doc[]) => {
    for (const d of docs) {
      if (holderIds.has(d._id)) continue
      holderIds.add(d._id)
      fileHolders.push(d)
    }
  }
  for (;;) {
    const projectIds = [
      ...new Set(
        fileHolders
          .filter((d) => d._type === 'videoProject')
          .map((d) => publishedId(d._id))
          .filter((id) => !projectsSeen.has(id)),
      ),
    ]
    projectIds.forEach((id) => projectsSeen.add(id))
    // Two ways to a gallery video: through the project it records, and by
    // its own lineage — the files it showed (`sources[].fileId`, plain
    // ids). The lineage holds up once the project has been edited to drop
    // the photo, or deleted, where the project no longer leads here.
    const [throughProjects, byLineage] = await Promise.all([
      projectIds.length === 0
        ? []
        : client.fetch<Doc[]>(
            // groq-global: the gallery videos made from the projects found
            // above, whatever tenant they are in — the right is the person's.
            groq`*[_type == "marketingAsset" && project._ref in $projectIds]`,
            { projectIds },
            opts,
          ),
      client.fetch<Doc[]>(
        // groq-global: the gallery videos whose recorded lineage names a
        // linked file, in every tenant — the right is the person's.
        groq`*[_type == "marketingAsset" && count(sources[fileId in $fileIds]) > 0]`,
        { fileIds },
        opts,
      ),
    ])
    // The exported videos themselves are holders even with no file stored yet.
    addHolders([...(throughProjects ?? []), ...(byLineage ?? [])])
    // EVERY gallery entry among the holders gives up EVERY file it holds —
    // an entry found by its poster alone still has an MP4 that shows the
    // person, and the entry is deleted either way, which would leave that
    // file stored and reachable on the CDN. Each entry is expanded once.
    const entries = fileHolders.filter(
      (d) => d._type === 'marketingAsset' && !expanded.has(d._id),
    )
    entries.forEach((d) => expanded.add(d._id))
    const exportFileIds = linkedFileIds(entries).filter((id) => !known.has(id))
    if (exportFileIds.length === 0) break
    exportFileIds.forEach((id) => known.add(id))
    fileIds.push(...exportFileIds)
    addHolders(await readHolders(exportFileIds))
  }
  const postIds = [
    ...new Set(
      fileHolders
        .filter((d) => d._type === 'socialPost')
        .map((d) => getPublishedId(d._id)),
    ),
  ]
  if (postIds.length === 0) {
    return {
      fileIds,
      inputs: {
        subjectDocs: subjectDocs ?? [],
        ...empty,
        fileHolders,
      },
    }
  }

  const [variants, publishedPosts] = await Promise.all([
    client.fetch<Doc[]>(
      // groq-global: the variants of posts found above, whatever tenant those
      // posts are in. A variant picks a post attachment by `_key`, so it
      // holds no reference to the file of its own.
      groq`*[_type == "socialPostVariant" && post._ref in $postIds]{ _id, _type, _rev, post, attachments }`,
      { postIds },
      opts,
    ),
    client.fetch<Doc[]>(
      // groq-global: the published versions of the same posts, by id.
      groq`*[_type == "socialPost" && _id in $postIds]{ _id, _type, attachments }`,
      { postIds },
      opts,
    ),
  ])

  return {
    fileIds,
    inputs: {
      subjectDocs: subjectDocs ?? [],
      fileHolders,
      variants: variants ?? [],
      publishedPosts: publishedPosts ?? [],
    },
  }
}
