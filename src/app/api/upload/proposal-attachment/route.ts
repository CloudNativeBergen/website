import { NextAuthRequest, auth } from '@/lib/auth'
import { uploadAttachmentFile } from '@/lib/attachment/sanity'
import { validateAttachmentFile } from '@/lib/attachment/validation'
import { clientReadUncached as clientRead } from '@/lib/sanity/client'
import { NextResponse } from 'next/server'

// Configure body size limit - Vercel default is 4.5MB for serverless functions
// This will apply for all Vercel plans, but the actual limit depends on the plan
export const maxDuration = 60 // Maximum allowed for Pro plan

export const POST = auth(async (req: NextAuthRequest) => {
  if (
    !req.auth ||
    !req.auth.user ||
    !req.auth.speaker ||
    !req.auth.speaker._id
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const proposalId = formData.get('proposalId') as string

    if (!file) {
      return NextResponse.json(
        { error: 'No file was uploaded' },
        { status: 400 },
      )
    }

    if (!proposalId) {
      return NextResponse.json(
        { error: 'Proposal ID is required' },
        { status: 400 },
      )
    }

    // Verify proposal ownership (speaker is one of the speakers OR user is organizer)
    const proposal = await clientRead.fetch<{
      _id: string
      speakers: Array<{ _id: string }>
    } | null>(
      `*[_type == "talk" && _id == $proposalId][0] {
        _id,
        speakers[]-> { _id }
      }`,
      { proposalId },
    )

    if (!proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
    }

    const speakerIds = proposal.speakers.map((s) => s._id)
    const isOwner = speakerIds.includes(req.auth.speaker._id)
    const isOrganizer = req.auth.speaker.is_organizer === true

    if (!isOwner && !isOrganizer) {
      return NextResponse.json(
        {
          error:
            'You do not have permission to upload attachments to this proposal',
        },
        { status: 403 },
      )
    }

    const validation = validateAttachmentFile(file)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const { asset, error } = await uploadAttachmentFile(file)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!asset) {
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      asset: {
        _ref: asset._id,
        _type: 'reference',
        url: asset.url,
      },
      filename: file.name,
    })
  } catch (error) {
    console.error('Upload attachment error:', error)
    return NextResponse.json(
      { error: 'Failed to upload attachment' },
      { status: 500 },
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
