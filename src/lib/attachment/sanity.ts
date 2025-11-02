import { clientWrite } from '@/lib/sanity/client'

export async function uploadAttachmentFile(file: File): Promise<{
  asset: { _id: string; url: string } | null
  error: Error | null
}> {
  try {
    const asset = await clientWrite.assets.upload('file', file, {
      filename: file.name,
    })
    return { asset, error: null }
  } catch (error) {
    return { asset: null, error: error as Error }
  }
}
