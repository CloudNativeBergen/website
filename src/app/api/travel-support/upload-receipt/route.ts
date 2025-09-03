import { NextAuthRequest, auth } from '@/lib/auth'
import { uploadReceiptFile } from '@/lib/travel-support/sanity'
import { NextResponse } from 'next/server'

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
    const files = formData.getAll('files') as File[]

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files were uploaded to the server.' },
        { status: 400 },
      )
    }

    const file = files[0]

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type "${file.type}". Please upload PDF, JPG, or PNG files.`,
        },
        { status: 400 },
      )
    }

    // Validate file size (10MB limit)
    if (file.size > 1024 * 1024 * 10) {
      return NextResponse.json(
        { error: 'File size is too large. Maximum file size is 10MB.' },
        { status: 400 },
      )
    }

    const { asset, error } = await uploadReceiptFile(file)

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
    console.error('Upload receipt error:', error)
    return NextResponse.json(
      { error: 'Failed to upload receipt' },
      { status: 500 },
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any
