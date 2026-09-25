import { upload } from '@vercel/blob/client'
import { marketingAssetPathname } from '@/lib/marketing-asset'

export interface AssetDetails {
  title: string
  alt: string
}

/** Uploads one image and adds it to the gallery, or throws a message to show. */
export type AssetUploader = (
  file: File,
  details: AssetDetails,
) => Promise<{ _id: string; softOnSocial: boolean }>

/**
 * The real path (docs/MARKETING_ASSETS_SPEC.md §4.1): the browser uploads the
 * file straight to Vercel Blob with a short-lived token, then asks the server
 * to move it into Sanity. The organization id only NAMES the pathname; the
 * token route and the move each resolve the organization themselves and refuse
 * any other prefix.
 */
export function blobAssetUploader(orgId: string): AssetUploader {
  return async (file, details) => {
    const blob = await upload(
      marketingAssetPathname(orgId, file.name, Date.now()),
      file,
      {
        access: 'public',
        handleUploadUrl: '/api/admin/marketing-assets/upload-token',
        contentType: file.type,
      },
    )
    const response = await fetch('/api/admin/marketing-assets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: blob.url, ...details }),
    })
    const body = (await response.json().catch(() => null)) as {
      _id?: string
      softOnSocial?: boolean
      error?: string
    } | null
    if (!response.ok || !body?._id) {
      throw new Error(body?.error ?? 'The image could not be added. Try again.')
    }
    return { _id: body._id, softOnSocial: Boolean(body.softOnSocial) }
  }
}
