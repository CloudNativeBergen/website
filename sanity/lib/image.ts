import createImageUrlBuilder from '@sanity/image-url'
import type { Image } from 'sanity'

import { dataset, projectId } from '../env'

const imageBuilder = createImageUrlBuilder({
  projectId: projectId || '',
  dataset: dataset || '',
})

export const urlForImage = (source: Image, width?: number) => {
  let builder = imageBuilder?.image(source).auto('format').fit('max')

  if (width) {
    builder = builder.width(width)
  }

  // Quality 85 is a good balance between file size and visual quality
  return builder.quality(85).url()
}
