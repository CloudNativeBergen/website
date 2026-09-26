import { NextResponse } from 'next/server'
import { TRPCError } from '@trpc/server'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { clientWrite } from '@/lib/sanity/client'
import {
  recordReplacedRender,
  retireReplacedRenders,
} from '@/lib/marketing/replaced-renders'
import { requireDocumentInCurrentConference } from '@/server/tenancy'
import { TaskIdSchema } from '@/server/schemas/marketing'
import { getStudioTask } from '@/lib/marketing/render-sanity'

export async function POST(request: Request) {
  try {
    const session = await getAuthSession()
    if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const form = await request.formData()
    const parsed = TaskIdSchema.safeParse({ taskId: form.get('taskId') })
    const file = form.get('file')
    if (
      !parsed.success ||
      !(file instanceof File) ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 20 * 1024 * 1024
    ) {
      return NextResponse.json(
        { error: 'A Task and a raster image up to 20 MB are required.' },
        { status: 400 },
      )
    }
    const { taskId } = parsed.data
    const conferenceId = await requireDocumentInCurrentConference(
      taskId,
      'marketingTask',
    )
    const task = await getStudioTask(taskId, conferenceId)
    if (!task)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    if (task.kind !== 'studioRender')
      return NextResponse.json(
        { error: 'Only studio render Tasks accept a render.' },
        { status: 400 },
      )
    const asset = await clientWrite.assets.upload(
      'image',
      Buffer.from(await file.arrayBuffer()),
      { filename: file.name },
    )
    // The upload this one REPLACES is recorded in the binding's own patch
    // (#1162) — not the saved render, and not when Sanity handed back the
    // same bytes — so nothing between the two can lose it.
    const replaced =
      task.pendingAssetId &&
      task.pendingAssetId !== asset._id &&
      task.pendingAssetId !== task.assetId
        ? task.pendingAssetId
        : null
    const binding = clientWrite
      .patch(taskId)
      .ifRevisionId(task._rev)
      .set({
        pendingStudioAsset: {
          _type: 'image',
          asset: { _type: 'reference', _ref: asset._id },
        },
      })
    const saved = await (
      replaced ? recordReplacedRender(binding, replaced) : binding
    ).commit()
    // Then every recorded render goes, through the shared orphan check; one
    // that cannot go stays recorded. Never fails the upload.
    await retireReplacedRenders(taskId, [
      ...(task.replacedRenders ?? []),
      ...(replaced ? [replaced] : []),
    ])
    return NextResponse.json({
      assetId: asset._id,
      url: asset.url,
      taskRev: saved._rev,
    })
  } catch (error) {
    const status =
      error instanceof TRPCError && error.code === 'NOT_FOUND'
        ? 404
        : (error as { statusCode?: number })?.statusCode === 409
          ? 409
          : 500
    console.error('Studio upload failed', error)
    return NextResponse.json(
      {
        error:
          status === 409
            ? 'The Task changed. Upload again.'
            : 'Could not upload the render.',
      },
      { status },
    )
  }
}
