import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { clientWrite } from '@/lib/sanity/client'

export async function POST(request: Request) {
  try {
    const session = await getAuthSession()
    // ORG-SCOPED (CaaS T1-2, #614): organizer of the current domain's org.
    if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Same limits as the speaker's own upload (/api/upload/speaker-image).
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Please upload an image.' },
        { status: 400 },
      )
    }
    if (file.size > 1024 * 1024 * 10) {
      return NextResponse.json(
        { error: 'File size is too large. Maximum file size is 10MB.' },
        { status: 400 },
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
    console.error('Failed to upload image:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to upload image',
      },
      { status: 500 },
    )
  }
}
