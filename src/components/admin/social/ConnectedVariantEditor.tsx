'use client'

import { useState } from 'react'
import { useNotification } from '@/components/admin/NotificationProvider'
import { richTextImageUrl } from '@/lib/homepage/richTextImage'
import { getPlatformConstraints } from '@/lib/social/provider/constraints'
import type { SocialVariantEditorData } from '@/lib/social/types'
import { api } from '@/lib/trpc/client'
import type { GalleryPick, ShareCardSource } from './AttachmentSlot'
import { VariantEditor } from './VariantEditor'
import {
  editorValueFrom,
  toUpdateInput,
  type VariantEditorValue,
} from './variant-editor-model'
import { useCeilingWarningToast } from '@/components/admin/marketing/useCeilingWarningToast'
import {
  TagPanel,
  useTagWarningToast,
  type TagLookup,
} from '@/components/admin/marketing/tagging'
import type { MentionRecord } from '@/lib/marketing/tagging/body'
import {
  tagName,
  untagHandle,
  type MentionIssue,
  type TagIssue,
  type TaggablePerson,
} from '@/lib/marketing/tagging/checks'
import { clientTagIssues } from '@/lib/trpc/errors'

/** The organizer image upload route; returns the asset id of our dataset. */
const UPLOAD_ROUTE = '/api/admin/rich-text-image'

async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(UPLOAD_ROUTE, { method: 'POST', body: form })
  const json = (await res.json().catch(() => null)) as {
    assetId?: string
    error?: string
  } | null
  if (!res.ok || !json?.assetId) {
    throw new Error(json?.error ?? 'Upload failed.')
  }
  return json.assetId
}

/**
 * The Marketing Task the variant belongs to (#1012, spec §3.4): the link is
 * DERIVED from the picked page and locked in the form, and the save carries
 * the page so the router writes both in one transaction.
 */
export interface VariantTaskContext {
  taskId: string
  /** The Task revision the editor loaded; the page patch is compare-and-set on it. */
  rev: string
  /** The picked site path, or null while none is picked. */
  targetPage: string | null
  /** The tagged link derived from it, or null while none is picked. */
  taggedLink: string | null
}

/**
 * A Bluesky post of a Marketing Task (tagging spec §2, §4.4): the people it
 * is about, for the tag button, the recorded mentions, and the tag issues a
 * refused save or approval carried. The issues live with the caller, since
 * an approval refused in the header lands here too.
 */
export interface VariantTagging {
  taskId: string
  people: TaggablePerson[]
  mentions: MentionRecord[]
  issues: TagIssue[]
  onIssuesChange: (issues: TagIssue[]) => void
  /** The host is approving or scheduling: tag edits wait for it. */
  busy?: boolean
  /** A tag lookup is in flight: the host holds Approve until it lands. */
  onPendingChange?: (pending: boolean) => void
}

/**
 * `VariantEditor` wired to the `social.*` procedures: loads from the data
 * the caller fetched, saves with compare-and-set on the revision the FORM
 * was built from, and feeds the attachment slot from an upload and the
 * conference gallery. Share cards are an injection point for the studio
 * (spec §7). The dialog and the Task editor both host it.
 */
export function ConnectedVariantEditor({
  data,
  onSaved,
  onDirtyChange,
  shareCards,
  task,
  tagging: taggingProp,
}: {
  data: SocialVariantEditorData
  onSaved?: () => void
  onDirtyChange?: (dirty: boolean) => void
  shareCards?: ShareCardSource[]
  task?: VariantTaskContext
  tagging?: VariantTagging
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const variantId = data.variant._id
  const postId = data.variant.postId
  const [value, setValueState] = useState<VariantEditorValue>(() =>
    editorValueFrom(data),
  )
  // The revision the FORM was built from. A refetch after an image is added
  // refreshes `data.variant._rev`, but the form still holds the original
  // load, so the save must compare-and-set against this one — otherwise a
  // colleague's edit in between would be overwritten instead of conflicting.
  const [loadedRev, setLoadedRev] = useState(data.variant._rev)
  const [dirty, setDirtyState] = useState(false)
  const setDirty = (next: boolean) => {
    setDirtyState(next)
    onDirtyChange?.(next)
  }
  // A CLEAN form follows the document: after our own save, an approval, a
  // re-timing or a colleague's edit, the refetched revision is adopted and
  // the form rebuilt from it. A dirty form keeps its edits and reports the
  // change instead, so nothing typed is ever silently replaced.
  if (!dirty && data.variant._rev !== loadedRev) {
    setLoadedRev(data.variant._rev)
    setValueState(editorValueFrom(data))
  }
  const changedUnderneath = data.variant._rev !== loadedRev
  const [error, setError] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const gallery = api.gallery.admin.list.useQuery(
    { limit: 100 },
    { enabled: galleryOpen },
  )

  // In a Task, the link is whatever the page picker derives right now.
  const shown: VariantEditorValue = task
    ? { ...value, link: task.taggedLink ?? '' }
    : value

  const setValue = (next: VariantEditorValue) => {
    setValueState(next)
    setDirty(true)
  }

  // Tags are a Bluesky thing only (tagging spec §1).
  const tagging = data.variant.platform === 'bluesky' ? taggingProp : undefined
  const [pendingTag, setPendingTag] = useState<string | null>(null)
  const setPending = (speakerId: string | null) => {
    setPendingTag(speakerId)
    tagging?.onPendingChange?.(speakerId !== null)
  }
  const [lookups, setLookups] = useState<Record<string, TagLookup>>({})
  const resolveTag = api.marketing.task.resolveTag.useMutation()
  /** A tag-button or fix edit of the body: an organizer edit like any other. */
  const editBody = (edit: (body: string) => string) => {
    setValueState((current) => ({ ...current, body: edit(current.body) }))
    setDirty(true)
  }
  const tag = (person: TaggablePerson) => {
    if (!tagging) return
    // Save and Approve wait for the answer, so neither can commit the body
    // this lookup is about to change.
    setError(null)
    setPending(person.speakerId)
    resolveTag.mutate(
      { taskId: tagging.taskId, speakerId: person.speakerId },
      {
        onSuccess: ({ handle, result }) => {
          setLookups((current) => {
            const next = { ...current }
            if (result === 'resolved') delete next[person.speakerId]
            else next[person.speakerId] = result
            return next
          })
          if (result === 'resolved')
            editBody((body) => tagName(body, { ...person, handle }) ?? body)
        },
        onError: (err) =>
          setError(err.message || 'Could not check the handle.'),
        onSettled: () => setPending(null),
      },
    )
  }
  const untag = (person: TaggablePerson, handle: string) =>
    editBody((body) => untagHandle(body, handle, person.name))
  const fix = (issue: MentionIssue) => {
    if (!tagging) return
    const { handle, name } = issue
    editBody((body) => untagHandle(body, handle, name))
    tagging.onIssuesChange(tagging.issues.filter((i) => i !== issue))
  }

  const warnCeilings = useCeilingWarningToast()
  const warnTags = useTagWarningToast()
  const update = api.social.updateVariant.useMutation({
    onSuccess: (result) => {
      void utils.social.listVariants.invalidate()
      void utils.social.getVariantEditor.invalidate({ variantId })
      if (task) {
        void utils.marketing.task.get.invalidate({ taskId: task.taskId })
        void utils.marketing.plan.get.invalidate()
      }
      showNotification({ type: 'success', title: 'Variant saved' })
      warnCeilings(result)
      warnTags(result)
      tagging?.onIssuesChange([])
      setDirty(false)
      onSaved?.()
    },
    onError: (err) => {
      const issues = clientTagIssues(err)
      if (tagging && issues.length > 0) {
        tagging.onIssuesChange(issues)
        setError('Not saved. Fix the tag problems above first.')
        return
      }
      setError(err.message || 'Could not save.')
    },
  })
  const addAttachment = api.social.addPostAttachment.useMutation()

  /** Put an asset on the post, then select it on this variant. */
  const attachAsset = async (input: {
    assetId: string
    alt: string
    hotspot?: GalleryPick['hotspot']
    crop?: GalleryPick['crop']
  }) => {
    const { key } = await addAttachment.mutateAsync({ postId, ...input })
    await utils.social.getVariantEditor.invalidate({ variantId })
    if (task) {
      await utils.marketing.task.get.invalidate({ taskId: task.taskId })
    }
    setValueState((current) => ({
      ...current,
      attachments: [
        ...current.attachments,
        { source: key, crop: null, altOverride: null },
      ],
    }))
    setDirty(true)
  }

  const galleryPicks: GalleryPick[] = (gallery.data ?? []).flatMap((image) => {
    const assetId = image.image?.asset?._ref
    if (!assetId) return []
    return [
      {
        id: image._id,
        assetId,
        alt: image.image.alt ?? image.imageAlt ?? '',
        hotspot: image.image.hotspot ?? null,
        crop: image.image.crop ?? null,
        thumbnailSrc: richTextImageUrl(assetId, 300),
      },
    ]
  })

  return (
    <div className="space-y-4">
      {tagging && (
        <TagPanel
          body={shown.body}
          people={tagging.people}
          mentions={tagging.mentions}
          issues={tagging.issues}
          pending={pendingTag}
          lookups={lookups}
          disabled={update.isPending || !!tagging.busy}
          onTag={tag}
          onUntag={untag}
          onFix={fix}
        />
      )}
      <VariantEditor
        platform={data.variant.platform}
        constraints={getPlatformConstraints(data.variant.platform)}
        conferenceDomains={data.conferenceDomains}
        platformZone={data.platformZone ?? null}
        postAttachments={data.post.attachments}
        postDefaultScheduledAt={data.post.defaultScheduledAt}
        value={shown}
        onChange={setValue}
        linkLocked={task !== undefined}
        saving={update.isPending || pendingTag !== null}
        error={
          error ??
          (changedUnderneath
            ? 'The variant changed while you were editing. Reload and retry.'
            : null)
        }
        onSave={() => {
          setError(null)
          if (task && (!task.targetPage || !task.taggedLink)) {
            setError('Pick a target page for the link first.')
            return
          }
          const input = toUpdateInput(
            { _id: variantId, _rev: loadedRev },
            shown,
          )
          if (!input) {
            setError('Pick a date and time for the custom time.')
            return
          }
          update.mutate(
            task && task.targetPage
              ? {
                  ...input,
                  task: {
                    taskId: task.taskId,
                    rev: task.rev,
                    targetPage: task.targetPage,
                  },
                }
              : input,
          )
        }}
        sources={{
          onUpload: async (file, alt) => {
            const assetId = await uploadImage(file)
            await attachAsset({ assetId, alt })
          },
          gallery: {
            images: galleryPicks,
            isLoading: gallery.isLoading,
            onOpen: () => setGalleryOpen(true),
            onPick: async (image) => {
              // Alt text is the platform's, not a placeholder of ours.
              if (!image.alt.trim()) {
                throw new Error(
                  'This gallery image has no alt text. Add one in the gallery first.',
                )
              }
              await attachAsset({
                assetId: image.assetId,
                alt: image.alt,
                hotspot: image.hotspot,
                crop: image.crop,
              })
            },
          },
          shareCards,
          onAttachShareCard: shareCards
            ? async (card) => {
                const { blob, alt } = await card.render()
                const file = new File([blob], `${card.id}.png`, {
                  type: blob.type || 'image/png',
                })
                const assetId = await uploadImage(file)
                await attachAsset({ assetId, alt })
              }
            : undefined,
        }}
      />
    </div>
  )
}
