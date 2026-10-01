/** How many leading bytes {@link pngSize} reads: the signature and IHDR. */
export const PNG_SIZE_BYTES = 24

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const IHDR = [0x49, 0x48, 0x44, 0x52]

/**
 * A PNG's pixel size from its header — the IHDR chunk, which the format
 * requires first — or null for anything that is not a PNG with one. Reads the
 * bytes the client sent, never what it claims.
 */
export function pngSize(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < PNG_SIZE_BYTES) return null
  if (!SIGNATURE.every((b, i) => bytes[i] === b)) return null
  if (!IHDR.every((b, i) => bytes[12 + i] === b)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}
