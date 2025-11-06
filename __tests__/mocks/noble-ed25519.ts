/**
 * Mock for @noble/ed25519
 *
 * Provides mock implementations of the cryptographic functions
 * used by the badge system for testing purposes.
 */

// Store signatures for verification
const signatureStore = new Map<string, string>()

function hashData(data: Uint8Array): string {
  return Array.from(data).join(',')
}

export const utils = {
  randomPrivateKey: () => {
    const bytes = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
    return bytes
  },
  bytesToHex: (bytes: Uint8Array) => {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  },
  hexToBytes: (hex: string) => {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
    }
    return bytes
  },
}

export const getPublicKey = async (privateKey: Uint8Array | string) => {
  const mockPublicKey = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    mockPublicKey[i] = i
  }
  return mockPublicKey
}

export const sign = async (
  message: Uint8Array,
  privateKey: Uint8Array | string,
) => {
  const mockSignature = new Uint8Array(64)
  for (let i = 0; i < 64; i++) {
    mockSignature[i] = i % 256
  }

  // Store the message hash with this signature for verification
  const messageHash = hashData(message)
  const signatureHash = hashData(mockSignature)
  signatureStore.set(signatureHash, messageHash)

  return mockSignature
}

export const signAsync = sign

export const verify = async (
  signature: Uint8Array | string,
  message: Uint8Array,
  publicKey: Uint8Array | string,
) => {
  const sigBytes =
    typeof signature === 'string' ? utils.hexToBytes(signature) : signature
  const signatureHash = hashData(sigBytes)
  const messageHash = hashData(message)

  // Check if this signature matches this message
  const storedMessageHash = signatureStore.get(signatureHash)
  return storedMessageHash === messageHash
}

export const verifyAsync = verify
