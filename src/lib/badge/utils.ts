/**
 * Badge Utility Functions
 *
 * Shared utility functions used across badge operations
 */

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/^0x/, '').replace(/\s/g, '')
  if (cleaned.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }

  const bytes = new Uint8Array(cleaned.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16)
    if (isNaN(byte)) {
      throw new Error(`Invalid hex character at position ${i * 2}`)
    }
    bytes[i] = byte
  }
  return bytes
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Canonicalize data for signing/verification
 * Uses JSON stringify with sorted keys as per RDF canonicalization for simple objects
 */
export function canonicalizeData(data: unknown): string {
  return JSON.stringify(data, Object.keys(data as object).sort())
}

/**
 * Generate a unique badge ID
 * Format: badge-{timestamp}-{random}
 */
export function generateBadgeId(): string {
  return `badge-${Date.now()}-${Math.random().toString(36).substring(7)}`
}

/**
 * Validate issuer URL format
 */
export function validateIssuerUrl(url: string): {
  valid: boolean
  error?: string
} {
  if (!url) {
    return { valid: false, error: 'Issuer URL is required' }
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return {
      valid: false,
      error: 'Issuer URL must start with http:// or https://',
    }
  }

  try {
    new URL(url)
    return { valid: true }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}

/**
 * Build issuer URL from conference domains
 */
export function buildIssuerUrl(conferenceDomains?: string[]): string {
  if (!conferenceDomains || conferenceDomains.length === 0) {
    throw new Error(
      'Conference domains must be provided. ' +
        'Use getConferenceForCurrentDomain() to get the conference context.',
    )
  }

  const domain = conferenceDomains[0]

  if (domain.includes('*')) {
    throw new Error(
      `Cannot use wildcard domain "${domain}" as issuer URL. ` +
        'Ensure a specific domain is configured for the conference.',
    )
  }

  return domain.startsWith('http') ? domain : `https://${domain}`
}

/**
 * Get key ID from public key hex
 */
export function getKeyIdFromPublicKey(publicKeyHex: string): string {
  return `key-${publicKeyHex.substring(0, 8)}`
}
