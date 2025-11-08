import bs58 from 'bs58'
import { EncodingError, ERROR_CODES } from './errors'

export function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== 'string') {
    throw new EncodingError(
      ERROR_CODES.INVALID_HEX,
      'Hex input must be a string',
      { received: typeof hex },
    )
  }

  const cleaned = hex.replace(/^0x/, '').replace(/\s/g, '')

  if (cleaned.length === 0) {
    throw new EncodingError(
      ERROR_CODES.INVALID_HEX,
      'Hex string cannot be empty',
    )
  }

  if (cleaned.length % 2 !== 0) {
    throw new EncodingError(
      ERROR_CODES.INVALID_HEX,
      'Hex string must have even length',
      { length: cleaned.length },
    )
  }

  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16)
    if (isNaN(byte)) {
      throw new EncodingError(
        ERROR_CODES.INVALID_HEX,
        `Invalid hex character at position ${i * 2}`,
        { position: i * 2, characters: cleaned.substring(i * 2, i * 2 + 2) },
      )
    }
    bytes[i] = byte
  }

  return bytes
}

export function bytesToHex(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new EncodingError(
      ERROR_CODES.ENCODING_FAILED,
      'Input must be a Uint8Array',
      { received: typeof bytes },
    )
  }

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function encodeBase58(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) {
    throw new EncodingError(
      ERROR_CODES.ENCODING_FAILED,
      'Input must be a Uint8Array',
      { received: typeof bytes },
    )
  }

  try {
    return bs58.encode(Buffer.from(bytes))
  } catch (error) {
    throw new EncodingError(
      ERROR_CODES.ENCODING_FAILED,
      'Failed to encode to base58',
      { error: error instanceof Error ? error.message : String(error) },
    )
  }
}

export function decodeBase58(encoded: string): Uint8Array {
  if (typeof encoded !== 'string') {
    throw new EncodingError(
      ERROR_CODES.INVALID_BASE58,
      'Base58 input must be a string',
      { received: typeof encoded },
    )
  }

  if (encoded.length === 0) {
    throw new EncodingError(
      ERROR_CODES.INVALID_BASE58,
      'Base58 string cannot be empty',
    )
  }

  // Check for invalid base58 characters (0, O, I, l are not allowed)
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(encoded)) {
    throw new EncodingError(
      ERROR_CODES.INVALID_BASE58,
      'Base58 string contains invalid characters (0, O, I, l not allowed)',
      { input: encoded },
    )
  }

  try {
    return Uint8Array.from(bs58.decode(encoded))
  } catch (error) {
    throw new EncodingError(
      ERROR_CODES.DECODING_FAILED,
      'Failed to decode base58',
      {
        input: encoded,
        error: error instanceof Error ? error.message : String(error),
      },
    )
  }
}

export function encodeMultibase(bytes: Uint8Array): string {
  const base58 = encodeBase58(bytes)
  return 'z' + base58
}

export function decodeMultibase(encoded: string): Uint8Array {
  if (typeof encoded !== 'string') {
    throw new EncodingError(
      ERROR_CODES.INVALID_MULTIBASE,
      'Multibase input must be a string',
      { received: typeof encoded },
    )
  }

  if (!encoded.startsWith('z')) {
    throw new EncodingError(
      ERROR_CODES.INVALID_MULTIBASE,
      'Multibase string must start with "z" (base58btc prefix)',
      { prefix: encoded[0] },
    )
  }

  const base58Part = encoded.substring(1)
  if (base58Part.length === 0) {
    throw new EncodingError(
      ERROR_CODES.INVALID_MULTIBASE,
      'Multibase string cannot be empty after prefix',
    )
  }

  return decodeBase58(base58Part)
}

export function stringToBytes(str: string): Uint8Array {
  if (typeof str !== 'string') {
    throw new EncodingError(
      ERROR_CODES.ENCODING_FAILED,
      'Input must be a string',
      { received: typeof str },
    )
  }

  try {
    return new TextEncoder().encode(str)
  } catch (error) {
    throw new EncodingError(
      ERROR_CODES.ENCODING_FAILED,
      'Failed to encode string to UTF-8',
      { error: error instanceof Error ? error.message : String(error) },
    )
  }
}
