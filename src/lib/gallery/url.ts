/**
 * Builds a URL to view a specific gallery image
 * @param origin - The conference origin, e.g. from conferenceBaseUrl
 * @param imageId - The ID of the gallery image
 * @returns The full URL to view the image in the gallery
 */
export function buildGalleryImageUrl(origin: string, imageId: string): string {
  // Gallery is displayed on the main page with a hash fragment
  // The ImageGallery component uses this pattern to open specific images
  return `${origin}/#gallery?img=${imageId}`
}
