import { z } from 'zod'

export const SigningTokenSchema = z.object({
  token: z.string().uuid(),
})

export const SubmitSignatureSchema = z.object({
  token: z.string().uuid(),
  signatureDataUrl: z
    .string()
    .startsWith('data:image/png;base64,', 'Signature must be a PNG data URL'),
  signerName: z.string().min(1, 'Signer name is required'),
})
