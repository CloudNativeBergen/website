import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createGalleryImage } from '@/lib/gallery/sanity'
import { getSpeakerByEmail } from '@/lib/sanity/speaker'
import { galleryImageCreateSchema } from '@/server/schemas/gallery'
import type { GalleryImageWithSpeakers } from '@/lib/gallery/types'

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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const speaker = await getSpeakerByEmail(session.user.email)
    if (!speaker?.is_organizer) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const metadataString = formData.get('metadata') as string

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      )
    }

    let metadata: Record<string, unknown> = {}
    if (metadataString) {
      try {
        metadata = JSON.parse(metadataString)
      } catch {
        return NextResponse.json(
          { error: 'Invalid metadata format' },
          { status: 400 }
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
        // Validate and parse metadata using schema
        const validatedMetadata = galleryImageCreateSchema.parse({
          photographer: metadata.photographer || 'Unknown',
          date: metadata.date || new Date().toISOString().split('T')[0],
          location: metadata.location || 'Unknown',
          conference: metadata.conference, // Required field - will throw if missing
          featured: metadata.featured || false,
          speakers: metadata.speakers || [],
          imageAlt: metadata.imageAlt || fileName,
        })
        
        const res = await createGalleryImage({
          file,
          ...validatedMetadata,
        })

        results.push({
          success: !!res.image,
          image: res.image,
          error: res.error,
          fileName,
        })
      } catch (error) {
        console.error(`Failed to upload ${fileName}:`, error)
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed',
          fileName,
        })
      }
    }

    const successfulResults = results.filter(r => r.success)
    const successful = successfulResults.length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      results,
      summary: {
        total: files.length,
        successful,
        failed,
      },
      // Include successful images for client convenience
      successful: successfulResults.map(r => r.image).filter(Boolean) as GalleryImageWithSpeakers[],
    })
  } catch (error) {
    console.error('Gallery upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}