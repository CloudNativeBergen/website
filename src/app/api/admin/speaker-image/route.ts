import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import { clientWrite } from '@/lib/sanity/client'

export async function POST(request: Request) {
  try {
    const session = await getAuthSession()
    if (!session?.speaker?.is_organizer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
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
