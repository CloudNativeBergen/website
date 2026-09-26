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
 *     image or video, a Task's render;
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
}

/** The Task fields that hold a render. */
const TASK_RENDER_FIELDS = ['asset', 'pendingStudioAsset'] as const

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
 */
export function linkedFileIds(subjectDocs: Doc[]): string[] {
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
      taskRenderIds(doc).forEach((id) => ids.add(id))
  }
  return [...ids]
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

  const refuse = (doc: Doc, why: string) =>
    refusals.push(
      `${doc._type} ${doc._id} holds an image linked to the subject ${why}; ` +
        'remove it by hand and re-run',
    )

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
          unset: [...unset, ...unrecord(doc)],
          reason: 'Task render linked to the subject',
        })
        patchedTasks.add(doc._id)
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

  return { fileIds: [...files], patches, deletes, refusals }
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
  const fileIds = [
    ...new Set([...linkedFileIds(subjectDocs ?? []), ...extraFileIds]),
  ]
  const empty = { fileHolders: [], variants: [], publishedPosts: [] }
  if (fileIds.length === 0) {
    return { fileIds, inputs: { subjectDocs: subjectDocs ?? [], ...empty } }
  }

  const fileHolders = await client.fetch<Doc[]>(
    // groq-global: a file is dataset-wide and Sanity deduplicates identical
    // bytes, so a holder may be in any tenant — and the file cannot be deleted
    // while any of them still references it.
    // WHOLE documents: the planner refuses a holder that would still
    // reference a file after the fields it strips, which a projection hides.
    groq`*[references($fileIds)]`,
    { fileIds },
    opts,
  )
  const postIds = [
    ...new Set(
      (fileHolders ?? [])
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
        fileHolders: fileHolders ?? [],
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
      fileHolders: fileHolders ?? [],
      variants: variants ?? [],
      publishedPosts: publishedPosts ?? [],
    },
  }
}
