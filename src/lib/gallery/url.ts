/**
 * Builds a URL to view a specific gallery image
 * @param domain - The domain of the event (without protocol)
 * @param imageId - The ID of the gallery image
 * @returns The full URL to view the image in the gallery
 */
export function buildGalleryImageUrl(domain: string, imageId: string): string {
  // Gallery is displayed on the main page with a hash fragment
  // The ImageGallery component uses this pattern to open specific images
  return `https://${domain}/#gallery?img=${imageId}`
}
