/**
 * The speaker image read model (#76): the uploaded image's CDN URL, else the
 * OAuth avatar. An uploaded image with a Studio crop or hotspot carries them
 * as Sanity's own `rect` (pixels) and `fp-x`/`fp-y` (0-1) query parameters,
 * so the bare URL already shows the crop and `speakerImageUrl()` can rebuild
 * the crop and hotspot for the image builder. Without either the URL is the
 * plain asset URL, exactly as before.
 */
export const SPEAKER_IMAGE_URL = `coalesce(
  image.asset->url + select(
    defined(image.crop) || defined(image.hotspot) =>
      "?rect=" + string(round(coalesce(image.crop.left, 0) * image.asset->metadata.dimensions.width))
      + "," + string(round(coalesce(image.crop.top, 0) * image.asset->metadata.dimensions.height))
      + "," + string(round((1 - coalesce(image.crop.left, 0) - coalesce(image.crop.right, 0)) * image.asset->metadata.dimensions.width))
      + "," + string(round((1 - coalesce(image.crop.top, 0) - coalesce(image.crop.bottom, 0)) * image.asset->metadata.dimensions.height))
      + "&fp-x=" + string(coalesce(image.hotspot.x, 0.5))
      + "&fp-y=" + string(coalesce(image.hotspot.y, 0.5)),
    ""
  ),
  imageURL
)`
