import { del } from '@vercel/blob'
import { clientWrite } from '@/lib/sanity/client'

export interface BlobTransferResult {
  asset: { _id: string; url: string } | null
  error: Error | null
}

/**
 * Transfers a file from Vercel Blob to Sanity and deletes the temporary blob.
 * This function is used in the upload handler to move files from temporary
 * Blob storage to permanent Sanity storage.
 *
 * @param blobUrl - The URL of the blob in Vercel Blob storage
 * @param filename - The original filename to use in Sanity
 * @returns Object containing the Sanity asset or error
 */
export async function transferBlobToSanity(
  blobUrl: string,
  filename: string,
): Promise<BlobTransferResult> {
  try {
    const response = await fetch(blobUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`)
    }

    const blob = await response.blob()
    const file = new File([blob], filename, { type: blob.type })

    const asset = await clientWrite.assets.upload('file', file, {
      filename,
    })

    try {
      await del(blobUrl)
      console.log(`Successfully deleted temporary blob: ${blobUrl}`)
    } catch (deleteError) {
      console.error(`Failed to delete temporary blob ${blobUrl}:`, deleteError)
    }

    return { asset, error: null }
  } catch (error) {
    console.error('Error during blob transfer:', error)

    try {
      await del(blobUrl)
    } catch (deleteError) {
      console.error('Failed to delete temporary blob after error:', deleteError)
    }

    return { asset: null, error: error as Error }
  }
}

/**
 * Safely deletes an orphaned blob from Vercel Blob storage.
 * Used by the cleanup cron job to remove temporary blobs that were not
 * properly cleaned up during the upload process.
 *
 * @param blobUrl - The URL of the blob to delete
 * @returns Boolean indicating success
 */
export async function cleanupOrphanedBlob(blobUrl: string): Promise<boolean> {
  try {
    await del(blobUrl)
    return true
  } catch (error) {
    console.error(`Failed to cleanup orphaned blob ${blobUrl}:`, error)
    return false
  }
}
