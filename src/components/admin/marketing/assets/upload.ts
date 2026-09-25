import { upload } from '@vercel/blob/client'
import { marketingAssetPathname } from '@/lib/marketing-asset'

const GENERIC_FAILURE = 'The image could not be added. Try again.'

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * The filename with an extension taken from the file's type, so the blob's
 * last segment always has one: where Vercel adds its random suffix then never
 * depends on a dot elsewhere in the path (an organization id may hold one).
 */
function withTypeExtension(file: File): string {
  const base = file.name.replace(/\.[^./]*$/, '')
  const ext = EXTENSIONS[file.type]
  return ext ? `${base}.${ext}` : file.name
}

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
    let blob: { url: string }
    try {
      blob = await upload(
        marketingAssetPathname(orgId, withTypeExtension(file), Date.now()),
        file,
        {
          access: 'public',
          handleUploadUrl: '/api/admin/marketing-assets/upload-token',
          contentType: file.type,
        },
      )
    } catch (error) {
      // The library's text (token, network, Blob API) is not for organizers.
      console.error('Marketing asset: upload to Blob failed', error)
      throw new Error(GENERIC_FAILURE)
    }
    let response: Response
    try {
      response = await fetch('/api/admin/marketing-assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: blob.url, ...details }),
      })
    } catch (error) {
      // "Failed to fetch" / "Load failed" is not for organizers either.
      console.error('Marketing asset: move request failed', error)
      throw new Error(GENERIC_FAILURE)
    }
    const body = (await response.json().catch(() => null)) as {
      _id?: string
      softOnSocial?: boolean
      error?: string
    } | null
    if (!response.ok || !body?._id) {
      throw new Error(body?.error ?? GENERIC_FAILURE)
    }
    return { _id: body._id, softOnSocial: Boolean(body.softOnSocial) }
  }
}
