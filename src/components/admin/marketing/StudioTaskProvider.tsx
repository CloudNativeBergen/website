'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/trpc/client'
import { ImageAttachmentContext } from '@/components/common/image-capture'

/** Provides attachment controls to every studio renderer, including subjectless Tasks. */
/** What the studio's multipart attach route can carry (Vercel's body cut). */
const ATTACH_MAX_BYTES = 4 * 1024 * 1024

export function StudioTaskProvider({
  taskId,
  children,
}: {
  taskId?: string
  children: React.ReactNode
}) {
  if (!taskId) return children
  return (
    <ConnectedStudioTask key={taskId} taskId={taskId}>
      {children}
    </ConnectedStudioTask>
  )
}

function ConnectedStudioTask({
  taskId,
  children,
}: {
  taskId: string
  children: React.ReactNode
}) {
  const query = api.marketing.task.get.useQuery({ taskId })
  const mutation = api.marketing.task.attachAsset.useMutation()
  const utils = api.useUtils()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState<{
    taskId: string
    taskRev: string
    assetId: string
  } | null>(null)

  async function save(input: {
    taskId: string
    taskRev: string
    assetId: string
  }) {
    const result = await mutation.mutateAsync(input)
    const handoffIncomplete = result.handoffFailures.length > 0
    const galleryFailed = result.galleryFailed === true
    // The gallery's lists are refreshed on EVERY answer, as the studio's
    // own "Save to gallery" does: even a reported failure may have changed
    // the gallery (the entry landed, a later step failed).
    void utils.marketingAsset.list.invalidate()
    void utils.marketingAsset.filters.invalidate()
    const incomplete = handoffIncomplete || galleryFailed
    setFailed(incomplete)
    setMessage(
      incomplete
        ? [
            'The render is done and saved.',
            ...(handoffIncomplete
              ? [
                  'The image has not reached all publishing Tasks yet. Prerequisites are advisory, so they can publish without it.',
                ]
              : []),
            ...(galleryFailed
              ? ['It has not been saved to the asset gallery yet.']
              : []),
            'Retry here or from the Task editor.',
            ...(result.handoffIssues ?? []),
          ].join(' ')
        : // Only an answer that saved the render claims the gallery: a
          // handoff-only retry leaves it as the organizer left it.
          result.gallerySaved
          ? 'Image attached and saved to the asset gallery. This Task is complete.'
          : 'Image attached. This Task is complete.',
    )
    setPending(incomplete ? input : null)
    await query.refetch()
  }

  async function retry() {
    if (!pending) return
    setBusy(true)
    try {
      const current = await query.refetch()
      if (current.error) throw current.error
      const taskRev = current.data?.task?._rev
      if (!taskRev)
        throw new Error('Unable to load the current Task. Please retry.')
      await save({ ...pending, taskRev })
    } catch (error) {
      setFailed(true)
      setMessage(
        error instanceof Error
          ? error.message
          : 'Attachment failed. Please retry.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function attach(capture: () => Promise<Blob>, filename: string) {
    setBusy(true)
    setMessage('')
    setFailed(false)
    setPending(null)
    try {
      const blob = await capture()
      // The multipart route is cut by Vercel at about 4.5 MB before the
      // server sees it (docs/MARKETING_ASSETS_SPEC.md §4.2): a Format-sized
      // card with a photo can reach that. Say so, rather than an opaque 413.
      if (blob.size > ATTACH_MAX_BYTES)
        throw new Error(
          `This image is ${(blob.size / 1024 / 1024).toFixed(1)} MB, over the 4 MB "Attach to Task" can send. Save it to the gallery and finish the Task with it from there.`,
        )
      const form = new FormData()
      form.set('taskId', taskId)
      form.set('file', blob, `${filename}.png`)
      const response = await fetch('/api/admin/marketing-studio-image', {
        method: 'POST',
        body: form,
      })
      const upload = await response.json()
      if (!response.ok) throw new Error(upload.error || 'Image upload failed')
      const input = {
        taskId,
        taskRev: upload.taskRev as string,
        assetId: upload.assetId as string,
      }
      setPending(input)
      await save(input)
    } catch (error) {
      setFailed(true)
      setMessage(
        error instanceof Error
          ? error.message
          : 'Attachment failed. Please retry.',
      )
    } finally {
      setBusy(false)
    }
  }

  const task = query.data?.task
  return (
    <ImageAttachmentContext.Provider
      value={task?.kind === 'studioRender' ? { busy, attach } : null}
    >
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-gray-800 dark:border-blue-800 dark:bg-blue-950 dark:text-gray-100">
        <p className="font-semibold">
          {task ? `Render for Task: ${task.title}` : 'Loading Task…'}
        </p>
        {task?.kind === 'studioRender' && (
          <p className="mt-1">
            Choose a render below and attach it to this Task.
          </p>
        )}
        {task && task.kind !== 'studioRender' && (
          <p role="alert">This Task does not use the promo studio.</p>
        )}
        {query.error && <p role="alert">{query.error.message}</p>}
        {message && (
          <p role={failed ? 'alert' : 'status'} className="mt-2">
            {message}
          </p>
        )}
        {pending && failed && (
          <button
            onClick={retry}
            disabled={busy}
            className="mt-2 mr-4 font-semibold underline disabled:opacity-50"
          >
            Retry attachment / handoff
          </button>
        )}
        <Link
          className="mt-2 inline-block font-semibold underline"
          href={`/admin/marketing/tasks/${encodeURIComponent(taskId)}`}
        >
          Back to Task
        </Link>
      </div>
      {children}
    </ImageAttachmentContext.Provider>
  )
}
