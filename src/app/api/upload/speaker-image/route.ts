import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { clientWrite } from '@/lib/sanity/client'

export async function POST(request: Request) {
  try {
    const session = await getAuthSession()
    if (!session?.speaker) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let formData
    try {
      formData = await request.formData()
    } catch (error) {
      // Body size limit exceeded (4.5MB for serverless functions)
      if (error instanceof Error && error.message.includes('body')) {
        return NextResponse.json(
          {
            error:
              'File is too large to upload. Maximum file size is 10MB. Please compress or resize your image and try again.',
          },
          { status: 413 },
        )
      }
      throw error
    }

    const file = formData.get('file') as File
    const speakerId = formData.get('speakerId') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        {
          error: `Invalid file type "${file.type}". Please upload an image.`,
        },
        { status: 400 },
      )
    }

    if (file.size > 1024 * 1024 * 10) {
      return NextResponse.json(
        { error: 'File size is too large. Maximum file size is 10MB.' },
        { status: 400 },
      )
    }

    // Verify authorization: user must be uploading their own image OR be an organizer
    const isOwnProfile = !speakerId || speakerId === session.speaker._id
    const isOrganizer = session.speaker.is_organizer === true

    if (!isOwnProfile && !isOrganizer) {
      return NextResponse.json(
        { error: 'Unauthorized to upload image for this speaker' },
        { status: 403 },
      )
    }

    const buffer = await file.arrayBuffer()
    const asset = await clientWrite.assets.upload(
      'image',
      Buffer.from(buffer),
      {
        filename: file.name,
      },
    )

    return NextResponse.json({
      assetId: asset._id,
      url: asset.url,
    })
  } catch (error) {
    console.error('Failed to upload speaker image:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to upload image',
      },
      { status: 500 },
    )
  }
}
