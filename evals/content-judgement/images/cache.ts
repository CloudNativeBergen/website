import { readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const imageCacheDirectory = fileURLToPath(
  new URL('../.image-cache/', import.meta.url),
)

export async function fetchedImageFiles(
  id: string,
  directory: string,
): Promise<string[]> {
  return (await readdir(directory)).filter((name) =>
    new RegExp(`^${id}\\.(jpg|jpeg|png|webp|avif|gif|tiff|heif)$`).test(name),
  )
}
