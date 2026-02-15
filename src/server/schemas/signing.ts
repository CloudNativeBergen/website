import { z } from 'zod'

export const SigningTokenSchema = z.object({
  token: z.string().uuid(),
})

// 500 KB base64 ≈ 375 KB raw PNG — generous for a signature image
const MAX_SIGNATURE_DATA_URL_LENGTH = 500_000

export const SubmitSignatureSchema = z.object({
  token: z.string().uuid(),
  signatureDataUrl: z
    .string()
    .max(MAX_SIGNATURE_DATA_URL_LENGTH, 'Signature image is too large')
    .startsWith('data:image/png;base64,', 'Signature must be a PNG data URL'),
  signerName: z
    .string()
    .min(1, 'Signer name is required')
    .max(200, 'Signer name is too long'),
})
