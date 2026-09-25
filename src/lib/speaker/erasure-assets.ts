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
 * saved from a Task with no subject — is linked to nobody and is not found.
 * Nothing can find it: the image itself is the only record of who is in it.
 * The upload form says so beside the subject field, and `/privacy` says so.
 *
 * Pure planner plus one read function, split from `./erasure.ts` so the plan
 * stays readable; the transaction, the file deletes and the verification live
 * there with the rest of the operation.
 */
import { groq } from 'next-sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { COUNT_API_VERSION } from '@/lib/sanity/orphaned-asset'
import type { ErasureDocumentDelete, ErasureDocumentPatch } from './erasure'

type Doc = Record<string, unknown> & { _id: string; _type: string }

/** What {@link planSpeakerAssetErasure} needs. Reads live in {@link fetchSpeakerAssetInputs}. */
export interface SpeakerAssetInputs {
  /** `marketingAsset` and `marketingTask` documents, any version, whose subject is linked. */
  subjectDocs: Doc[]
  /** Every document, any version, that references one of the linked files. */
  fileHolders: Doc[]
  /** `socialPostVariant`s, any version, of the posts among {@link fileHolders}. */
  variants: Doc[]
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

/** Sanity ids and `_key`s are safe to interpolate only if they look like this. */
const SAFE_KEY = /^[A-Za-z0-9._-]+$/

/** `drafts.x` and `versions.<release>.x` both name the published document `x`. */
function publishedId(id: string): string {
  if (id.startsWith('drafts.')) return id.slice('drafts.'.length)
  if (id.startsWith('versions.')) return id.split('.').slice(2).join('.')
  return id
}

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

/**
 * The ids a gallery asset or Task may name as its subject to be linked to the
 * speaker: the speaker, and every talk that lists them in `speakers[]` — a
 * co-speaker's talk included, since an image of the talk shows them. Taken from
 * the erasure's own `references($speakerId)` read, so no second read is needed.
 */
export function speakerSubjectIds(
  speakerId: string,
  referencingDocs: Array<Record<string, unknown>>,
): string[] {
  const talks = referencingDocs
    .filter(
      (doc) =>
        doc._type === 'talk' &&
        Array.isArray(doc.speakers) &&
        doc.speakers.some((s) => refOf(s) === speakerId),
    )
    .map((doc) => publishedId(String(doc._id)))
  return [...new Set([speakerId, ...talks])]
}

/**
 * Every file the subject documents hold. A gallery asset is walked whole for
 * `{ asset: { _ref } }` rather than read from a named field, so a video and
 * its poster (#1167) are linked the day they exist. A Task holds its render in
 * {@link TASK_RENDER_FIELDS} and nothing else of the speaker's.
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
    if (doc._type === 'marketingTask') {
      for (const field of TASK_RENDER_FIELDS) {
        const file = fileRefOf(doc[field])
        if (file) ids.add(file)
      }
    }
  }
  return [...ids]
}

/**
 * What every holder of a linked file loses. Pure; see the module comment.
 *
 *  - a GALLERY ENTRY (any version) is deleted: an asset is its image. One
 *    about the subject is deleted even if it holds no file;
 *  - a POST loses the attachment, and each of its variants the entries that
 *    pick it — the record keeps its text;
 *  - a TASK loses its render (and a pending upload of it), nothing else;
 *  - the SUBJECT speaker needs nothing: its `image` is unset with the rest;
 *  - anything else is REFUSED.
 */
export function planSpeakerAssetErasure(
  speakerId: string,
  fileIds: string[],
  inputs: SpeakerAssetInputs,
): SpeakerAssetPlan {
  const files = new Set(fileIds)
  const patches: ErasureDocumentPatch[] = []
  const deletes: ErasureDocumentDelete[] = []
  const refusals: string[] = []
  /** Published post id → the attachment keys its versions lose. */
  const strippedKeys = new Map<string, Set<string>>()

  const refuse = (doc: Doc, why: string) =>
    refusals.push(
      `${doc._type} ${doc._id} holds an image linked to the subject ${why}; ` +
        'remove it by hand and re-run',
    )

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
    const rev = typeof doc._rev === 'string' ? doc._rev : undefined
    switch (doc._type) {
      case 'marketingAsset':
        deleteAsset(doc, 'gallery entry holding an image linked to the subject')
        break

      case 'socialPost': {
        const held = (Array.isArray(doc.attachments) ? doc.attachments : [])
          .filter((a) =>
            files.has(fileRefOf((a as { image?: unknown }).image) ?? ''),
          )
          .map((a) => (a as { _key?: unknown })._key)
        if (held.length === 0) break
        if (!held.every((k) => typeof k === 'string' && SAFE_KEY.test(k))) {
          refuse(doc, 'in an attachment whose _key cannot be safely selected')
          break
        }
        const keys = held as string[]
        const post = publishedId(doc._id)
        const known = strippedKeys.get(post) ?? new Set<string>()
        keys.forEach((k) => known.add(k))
        strippedKeys.set(post, known)
        patches.push({
          id: doc._id,
          type: doc._type,
          rev,
          unset: keys.map((k) => `attachments[_key=="${k}"]`),
          reason: 'post attachment linked to the subject (the text is kept)',
        })
        break
      }

      case 'marketingTask': {
        const unset = TASK_RENDER_FIELDS.filter((field) =>
          files.has(fileRefOf(doc[field]) ?? ''),
        )
        if (unset.length === 0) break
        patches.push({
          id: doc._id,
          type: doc._type,
          rev,
          unset: [...unset],
          reason: 'Task render linked to the subject',
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

  for (const variant of inputs.variants) {
    const post = refOf(variant.post)
    const keys = post ? strippedKeys.get(post) : undefined
    if (!keys) continue
    const picked = (
      Array.isArray(variant.attachments) ? variant.attachments : []
    )
      .filter((a) => keys.has(String((a as { source?: unknown }).source)))
      .map((a) => (a as { _key?: unknown })._key)
    if (picked.length === 0) continue
    if (!picked.every((k) => typeof k === 'string' && SAFE_KEY.test(k))) {
      refuse(variant, 'in an attachment whose _key cannot be safely selected')
      continue
    }
    patches.push({
      id: variant._id,
      type: variant._type,
      rev: typeof variant._rev === 'string' ? variant._rev : undefined,
      unset: (picked as string[]).map((k) => `attachments[_key=="${k}"]`),
      reason: 'variant attachment picking an image linked to the subject',
    })
  }

  return { fileIds: [...files], patches, deletes, refusals }
}

/**
 * The three reads, in order: what is about the subject, what holds its files,
 * and the variants of the posts among those.
 *
 * All under the `raw` perspective at {@link COUNT_API_VERSION}: `raw` sees
 * drafts, and from that version on it also sees Content Release `versions.**`
 * documents. A release copy of a post or asset is a holder like any other, and
 * a read blind to it would leave the file impossible to delete.
 *
 * @param extraFileIds Files to look for IN ADDITION to what the subject
 *   documents link now. Only verification supplies them: after an erasure
 *   nothing links them any more, so without them a file left behind is
 *   invisible — see `verifySpeakerErasure`.
 */
export async function fetchSpeakerAssetInputs(
  subjectIds: string[],
  extraFileIds: string[] = [],
): Promise<{ fileIds: string[]; inputs: SpeakerAssetInputs }> {
  const client = clientReadUncached.withConfig({
    apiVersion: COUNT_API_VERSION,
  })
  const opts = { cache: 'no-store', perspective: 'raw' } as const

  const subjectDocs = await client.fetch<Doc[]>(
    // groq-global: erasure is a GLOBAL operation on a cross-org person (see
    // `./erasure.ts`). An organization's gallery and Tasks about the speaker
    // are found in every tenant, because the right is the person's.
    groq`*[_type in ["marketingAsset", "marketingTask"] && subject._ref in $subjectIds]`,
    { subjectIds },
    opts,
  )
  const fileIds = [
    ...new Set([...linkedFileIds(subjectDocs ?? []), ...extraFileIds]),
  ]
  if (fileIds.length === 0) {
    return {
      fileIds,
      inputs: { subjectDocs: subjectDocs ?? [], fileHolders: [], variants: [] },
    }
  }

  const fileHolders = await client.fetch<Doc[]>(
    // groq-global: a file is dataset-wide and Sanity deduplicates identical
    // bytes, so a holder may be in any tenant — and the file cannot be deleted
    // while any of them still references it.
    groq`*[references($fileIds)]{ _id, _type, _rev, attachments, asset, pendingStudioAsset }`,
    { fileIds },
    opts,
  )
  const postIds = [
    ...new Set(
      (fileHolders ?? [])
        .filter((d) => d._type === 'socialPost')
        .map((d) => publishedId(d._id)),
    ),
  ]
  const variants =
    postIds.length === 0
      ? []
      : await client.fetch<Doc[]>(
          // groq-global: the variants of posts found above, whatever tenant
          // those posts are in. A variant picks a post attachment by `_key`,
          // so it holds no reference to the file of its own.
          groq`*[_type == "socialPostVariant" && post._ref in $postIds]{ _id, _type, _rev, post, attachments }`,
          { postIds },
          opts,
        )

  return {
    fileIds,
    inputs: {
      subjectDocs: subjectDocs ?? [],
      fileHolders: fileHolders ?? [],
      variants: variants ?? [],
    },
  }
}
