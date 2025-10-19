'use server'

import { getAuthSession } from '@/lib/auth'
import { clientWrite } from '@/lib/sanity/client'

export async function uploadSpeakerImageAsAdmin(
  file: FormData,
): Promise<{
  success: boolean
  assetId?: string
  url?: string
  error?: string
}> {
  try {
    const session = await getAuthSession()
    if (!session?.speaker?.is_organizer) {
      return { success: false, error: 'Unauthorized' }
    }

    const fileField = file.get('file') as File
    if (!fileField) {
      return { success: false, error: 'No file provided' }
    }

    const buffer = await fileField.arrayBuffer()
    const asset = await clientWrite.assets.upload(
      'image',
      Buffer.from(buffer),
      {
        filename: fileField.name,
      },
    )

    return {
      success: true,
      assetId: asset._id,
      url: asset.url,
    }
  } catch (error) {
    console.error('Failed to upload image:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload image',
    }
  }
}
