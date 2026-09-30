import { upload } from '@vercel/blob/client'
import {
  MARKETING_ASSET_GIF_TYPE,
  MARKETING_ASSET_VIDEO_TYPE,
  audioTypeForFile,
  motionKindForFile,
  marketingAssetPathname,
  type ExportSourceInput,
  type MarketingAssetDetails,
  type StudioFormat,
  type StudioTab,
} from '@/lib/marketing-asset'

const FAILURE = {
  image: 'The image could not be added. Try again.',
  gif: 'The GIF could not be added. Try again.',
  video: 'The video could not be added. Try again.',
  audio: 'The track could not be added. Try again.',
} as const

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
}

/**
 * The type the upload is sent as: a track's is one name per format (browsers
 * say `audio/x-m4a`, `audio/x-wav` or nothing), which is what the upload token
 * allows. The server sniffs the bytes either way.
 */
function uploadType(file: File): string {
  const motion = motionKindForFile(file)
  if (motion === 'gif') return MARKETING_ASSET_GIF_TYPE
  if (motion === 'video') return MARKETING_ASSET_VIDEO_TYPE
  return audioTypeForFile(file) ?? file.type
}

/**
 * The filename with an extension taken from the file's type, so the blob's
 * last segment always has one: where Vercel adds its random suffix then never
 * depends on a dot elsewhere in the path (an organization id may hold one).
 */
function withTypeExtension(file: File): string {
  const base = file.name.replace(/\.[^./]*$/, '')
  const ext = EXTENSIONS[uploadType(file)]
  return ext ? `${base}.${ext}` : file.name
}

/** What an audio track adds to its upload: the organizer's confirmation. */
export interface AudioUploadOptions {
  kind: 'audio'
  rightsConfirmed: boolean
}

/** A GIF: kept apart from images, since it cannot go into a post yet. */
export interface GifUploadOptions {
  kind: 'gif'
}

/**
 * A video and the poster drawn from its first frame, which is uploaded the
 * same way as a second, image, file (spec §4.1).
 */
export interface VideoUploadOptions {
  kind: 'video'
  poster: Blob
  /**
   * Set by "Save to gallery" on an export (#1182): the meme generator, and
   * the saved project the video came from, when it has one.
   */
  studio?: {
    tab: 'meme-generator'
    projectId?: string
    sources?: ExportSourceInput[]
  }
}

/**
 * What "Save to gallery" in the studio adds: the tab it saved from (§4.2) and,
 * on a tab with a Format switch, the Format the card was captured in.
 */
export interface StudioUploadOptions {
  kind: 'image'
  studio: { tab: StudioTab; format?: StudioFormat }
}

export type AssetUploadOptions =
  | AudioUploadOptions
  | StudioUploadOptions
  | GifUploadOptions
  | VideoUploadOptions

/**
 * Uploads one file of any kind (an image unless `options` says otherwise) and
 * adds it to the gallery, or throws a message to show.
 */
export type AssetUploader = (
  file: File,
  details: MarketingAssetDetails,
  options?: AssetUploadOptions,
  /** How much of the file has reached Blob, 0 to 1; a video can take a while. */
  onProgress?: (fraction: number) => void,
) => Promise<{
  _id: string
  softOnSocial: boolean
  /** An image's file, as stored; an export's lineage names it (#1182). */
  imageAssetId?: string
  /** A video's project no longer resolved: saved without it (#1182). */
  projectDropped?: boolean
}>

/** One file straight to Vercel Blob, under this organization's folder. */
function toBlob(
  orgId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<{ url: string }> {
  return upload(
    marketingAssetPathname(orgId, withTypeExtension(file), Date.now()),
    file,
    {
      access: 'public',
      handleUploadUrl: '/api/admin/marketing-assets/upload-token',
      contentType: uploadType(file),
      // In parts, retried one by one, for anything past a few MB.
      multipart: file.size > MULTIPART_FROM_BYTES,
      ...(onProgress
        ? { onUploadProgress: ({ percentage }) => onProgress(percentage / 100) }
        : {}),
    },
  )
}

/** Above this a file goes up in parts (Vercel suggests it for large files). */
const MULTIPART_FROM_BYTES = 20 * 1024 * 1024

/** The poster as a file with a name the pathname can take. */
function posterFile(video: File, poster: Blob): File {
  const base = video.name.replace(/\.[^./]*$/, '')
  return new File([poster], `${base}-poster.jpg`, { type: 'image/jpeg' })
}

/**
 * The real path (docs/MARKETING_ASSETS_SPEC.md §4.1): the browser uploads the
 * file straight to Vercel Blob with a short-lived token, then asks the server
 * to move it into Sanity. The organization id only NAMES the pathname; the
 * token route and the move each resolve the organization themselves and refuse
 * any other prefix.
 */
export function blobAssetUploader(orgId: string): AssetUploader {
  return async (file, details, options, onProgress) => {
    const failure = FAILURE[options?.kind ?? 'image']
    let blob: { url: string }
    let posterUrl: string | undefined
    try {
      // The poster first: small, and a refusal of it wastes no video upload.
      if (options?.kind === 'video')
        posterUrl = (await toBlob(orgId, posterFile(file, options.poster))).url
      blob = await toBlob(orgId, file, onProgress)
    } catch (error) {
      // The library's text (token, network, Blob API) is not for organizers.
      console.error('Marketing asset: upload to Blob failed', error)
      throw new Error(failure)
    }
    // The poster travels as its URL; the move checks it like any upload.
    const sent =
      options?.kind === 'video'
        ? {
            kind: 'video',
            posterUrl,
            ...(options.studio ? { studio: options.studio } : {}),
          }
        : options
    let response: Response
    try {
      response = await fetch('/api/admin/marketing-assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: blob.url, ...details, ...sent }),
      })
    } catch (error) {
      // "Failed to fetch" / "Load failed" is not for organizers either.
      console.error('Marketing asset: move request failed', error)
      throw new Error(failure)
    }
    const body = (await response.json().catch(() => null)) as {
      _id?: string
      softOnSocial?: boolean
      imageAssetId?: string
      projectDropped?: boolean
      error?: string
    } | null
    if (!response.ok || !body?._id) {
      throw new Error(body?.error ?? failure)
    }
    return {
      _id: body._id,
      softOnSocial: Boolean(body.softOnSocial),
      ...(body.imageAssetId ? { imageAssetId: body.imageAssetId } : {}),
      ...(body.projectDropped ? { projectDropped: true } : {}),
    }
  }
}
