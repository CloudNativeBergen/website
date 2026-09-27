import { z } from 'zod'

/** A published document or asset id: never a draft or a release version. */
const publishedId = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/)

/**
 * Where the studio fetches a video's music track from (studio video spec §6),
 * as the editor asks for it and the track route reads it: a gallery track by
 * its asset, or the file a saved project holds, by the project. Exactly one
 * of the two; strict, so a request naming both is refused, not half-read.
 */
export const trackSourceSchema = z.union([
  z.object({ asset: publishedId }).strict(),
  z.object({ project: publishedId, file: publishedId }).strict(),
])

export type TrackSource = z.infer<typeof trackSourceSchema>

/** The route a track streams from, for a source. */
export const trackUrl = (source: TrackSource) =>
  `/api/admin/studio-track?${new URLSearchParams(source)}`
