import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createGalleryImage } from '@/lib/gallery/sanity'
import { getSpeakerByEmail } from '@/lib/sanity/speaker'
import { galleryImageCreateSchema } from '@/server/schemas/gallery'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'
import { getCurrentDateTime } from '@/lib/time'

interface UploadResult {
  success: boolean
  image?: GalleryImageWithSpeakers
  error?: string
  fileName?: string
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const speaker = await getSpeakerByEmail(session.user.email)
    if (!speaker?.is_organizer) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 },
      )
    }

    const { conference } = await getConferenceForCurrentDomain({
      revalidate: 0,
    })
    if (!conference) {
      return NextResponse.json(
        { error: 'Conference not found for current domain' },
        { status: 404 },
      )
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
              'One or more files are too large. Maximum file size per upload is 10MB. Please resize your images and try again.',
          },
          { status: 413 },
        )
      }
      throw error
    }

    const files = formData.getAll('files') as File[]
    const metadataString = formData.get('metadata') as string

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 })
    }

    let metadata: Record<string, unknown> = {}
    if (metadataString) {
      try {
        metadata = JSON.parse(metadataString)
      } catch {
        return NextResponse.json(
          { error: 'Invalid metadata format' },
          { status: 400 },
        )
      }
    }

    const results: UploadResult[] = []

    for (const file of files) {
      const fileName = file.name

      if (!file.type.startsWith('image/')) {
        results.push({
          success: false,
          error: 'Invalid file type. Only images are allowed.',
          fileName,
        })
        continue
      }

      if (file.size > 10 * 1024 * 1024) {
        results.push({
          success: false,
          error: 'File too large. Maximum size is 10MB.',
          fileName,
        })
        continue
      }

      try {
        if (!metadata.photographer || !metadata.location) {
          results.push({
            success: false,
            error: 'Photographer and location are required',
            fileName,
          })
          continue
        }

        const validatedMetadata = galleryImageCreateSchema.parse({
          photographer: metadata.photographer,
          date: metadata.date || getCurrentDateTime(),
          location: metadata.location,
          conference: conference._id,
          featured: metadata.featured || false,
          speakers: metadata.speakers || [],
          imageAlt: metadata.imageAlt || fileName,
        })

        const res = await createGalleryImage({
          file,
          ...validatedMetadata,
        })

        if (!res.image && res.error) {
          console.error(`Failed to create gallery image for ${fileName}:`, {
            error: res.error,
            status: res.status,
          })
        }

        results.push({
          success: !!res.image,
          image: res.image,
          error: res.error,
          fileName,
        })
      } catch (error) {
        console.error(`Failed to upload ${fileName}:`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        })
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed',
          fileName,
        })
      }
    }

    const successfulResults = results.filter((r) => r.success)
    const successful = successfulResults.length
    const failed = results.filter((r) => !r.success).length

    return NextResponse.json({
      results,
      summary: {
        total: files.length,
        successful,
        failed,
      },
      successful: successfulResults
        .map((r) => r.image)
        .filter(Boolean) as GalleryImageWithSpeakers[],
    })
  } catch (error) {
    console.error('Gallery upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
