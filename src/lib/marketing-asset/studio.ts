import { z } from 'zod'
import { publishedDocumentId } from './details'
import { studioFormatSchema, type StudioFormat } from './format'
import { VIDEO_PROJECT_MAX_SCENES } from '@/lib/video-project/format'

/**
 * The studio's tabs (docs/MARKETING_ASSETS_SPEC.md §4.2), in the order the
 * studio shows them. The studio page's `?tab=` and a saved asset's
 * `studio.tab` are the same value, which is what "Open in studio" relies on.
 */
export const STUDIO_TABS = [
  'meme-generator',
  'conference',
  'photo-gallery',
  'speakers',
  'sponsors',
] as const
export type StudioTab = (typeof STUDIO_TABS)[number]

/** The tabs whose cards come in a Format (the promo joins in slice 4). */
const FORMAT_TABS: ReadonlySet<StudioTab> = new Set(['speakers', 'sponsors'])

/** A Sanity image asset id: `image-<hash>-<w>x<h>-<ext>`. */
const IMAGE_ASSET_ID = /^image-[A-Za-z0-9]+-\d+x\d+-[a-z0-9]+$/

/**
 * A video has at most `VIDEO_PROJECT_MAX_SCENES` backgrounds, and a current
 * export names each once as exported and once as a save recorded it since
 * (the entry's image replaced in between): two per scene, never more.
 */
export const MAX_EXPORT_SOURCES = 2 * VIDEO_PROJECT_MAX_SCENES

/**
 * One background an exported video showed, as the editor knew it at export
 * time: the gallery asset it was picked from, and the file once a save has
 * recorded it. Client claims, resolved and proven on the server; a local
 * upload that was never kept has neither and is not named.
 */
export const exportSourceSchema = z.object({
  fileId: z.string().regex(IMAGE_ASSET_ID).optional(),
  galleryAssetId: publishedDocumentId.optional(),
})
export type ExportSourceInput = z.output<typeof exportSourceSchema>

/**
 * Which studio tab made an asset, as the save request names it — and, for a
 * video exported from a saved studio video (#1182), the project it came
 * from and what it showed, which only the meme generator has. Client claims
 * the server proves this organization's before anything moves.
 */
export const studioOriginSchema = z
  .object({
    tab: z.enum(STUDIO_TABS),
    /**
     * The Format the card was captured in (docs/MARKETING_STUDIO_FORMATS_
     * SPEC.md §4). Absent for anything saved before Formats, which reads as
     * square (§6).
     */
    format: studioFormatSchema.optional(),
    projectId: publishedDocumentId.optional(),
    sources: z.array(exportSourceSchema).max(MAX_EXPORT_SOURCES).optional(),
  })
  .refine(
    (origin) =>
      (origin.projectId === undefined && origin.sources === undefined) ||
      origin.tab === 'meme-generator',
    { message: 'Only the meme generator makes videos' },
  )
  .refine(
    (origin) => origin.format === undefined || FORMAT_TABS.has(origin.tab),
    { message: 'Only a speaker or sponsor card has a Format' },
  )
export type StudioOriginInput = z.output<typeof studioOriginSchema>

/**
 * The studio card a render Task's render was attached from: a tab with a
 * Format switch and the Format it showed (docs/MARKETING_STUDIO_FORMATS_SPEC.md
 * §4), recorded on the Task's gallery entry as "Save to gallery" records it.
 */
export const taskRenderCardSchema = z
  .object({
    tab: z.enum(['speakers', 'sponsors']),
    format: studioFormatSchema,
  })
  .strict()
export type TaskRenderCard = z.output<typeof taskRenderCardSchema>

/**
 * Where a studio-made asset came from, as the gallery reads it: the tab, and
 * the speaker or sponsor the studio was opened on. Only the tab is stored; the
 * speaker or sponsor is the asset's SUBJECT when it matches the tab, so an
 * edited or erased subject never leaves a stale copy behind. The studio cannot
 * address a talk or a card variant, so that is as close as "Open in studio"
 * lands.
 */
export interface MarketingAssetStudioOrigin {
  tab: StudioTab
  /** The Format it was captured in; square where none was recorded (§6). */
  format: StudioFormat
  speakerId: string | null
  sponsorId: string | null
  /**
   * The saved studio video an exported video was made from (#1182), or
   * null: for anything but a video from the meme generator, and for a video
   * saved before its project was. The reference is weak, so `exists` says
   * whether the project can still be opened.
   */
  project: { _id: string; exists: boolean } | null
}

/** Whether the asset was made from a project that has since been deleted. */
export function projectDeleted(origin: MarketingAssetStudioOrigin): boolean {
  return (
    origin.tab === 'meme-generator' &&
    origin.project !== null &&
    !origin.project.exists
  )
}

/** The project "Open in studio" reopens, if there is one to reopen. */
function openableProject(origin: MarketingAssetStudioOrigin): string | null {
  return origin.tab === 'meme-generator' && origin.project?.exists
    ? origin.project._id
    : null
}

/**
 * Whether "Open in studio" lands on the thing itself: a speaker or sponsor
 * card on its subject, the conference promo, which the studio renders from
 * the edition alone, or a video on the saved project it was exported from
 * (#1182). The free-form editor without a project, and the photo collage,
 * open empty, so their link says it opens the tab.
 */
export function opensTheCard(origin: MarketingAssetStudioOrigin): boolean {
  return (
    origin.tab === 'conference' ||
    (origin.tab === 'speakers' && Boolean(origin.speakerId)) ||
    (origin.tab === 'sponsors' && Boolean(origin.sponsorId)) ||
    openableProject(origin) !== null
  )
}

/**
 * The studio page, on the tab and the speaker, sponsor or project an asset
 * names. A deleted project is left off: the page would only say it is gone.
 */
export function openInStudioHref(origin: MarketingAssetStudioOrigin): string {
  const params = new URLSearchParams({ tab: origin.tab })
  if (origin.tab === 'speakers' && origin.speakerId)
    params.set('speaker', origin.speakerId)
  if (origin.tab === 'sponsors' && origin.sponsorId)
    params.set('sponsor', origin.sponsorId)
  // The shape it was saved in; square is the switch's default anyway.
  if (FORMAT_TABS.has(origin.tab) && origin.format !== 'square')
    params.set('format', origin.format)
  const project = openableProject(origin)
  if (project) params.set('project', project)
  return `/admin/marketing/studio?${params.toString()}`
}
