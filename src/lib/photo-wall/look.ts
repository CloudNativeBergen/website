/**
 * What the Wall Looks share in drawing a post (Photo Wall spec §9). Pure,
 * safe to import on the client.
 */

/** A post's photo described for a screen reader: who posted it, when they said. */
export function photoAlt(post: { name: string | null }): string {
  return post.name ? `Photo by ${post.name}` : 'Photo from the wall'
}

/**
 * Height over width of a Mosaic tile: the photo's own shape within these
 * bounds, which hold a phone's 16:9 and 9:16; beyond them (a panorama, a
 * sliver of a portrait) the whole photo is letterboxed inside the tile,
 * never cropped.
 */
const TILE_SHAPE = { min: 0.5, max: 1.8 }

/** The shape of a Mosaic tile for a photo of this size. */
export function tileShape(photo: { width: number; height: number }): number {
  return Math.min(
    TILE_SHAPE.max,
    Math.max(TILE_SHAPE.min, photo.height / photo.width),
  )
}
