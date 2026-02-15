import { z } from 'zod'

export const ContractTemplateSectionSchema = z.object({
  _key: z.string().optional(),
  heading: z.string().min(1, 'Section heading is required'),
  body: z.array(z.any()).optional(),
})

export const ContractTemplateInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  conference: z.string().min(1, 'Conference ID is required'),
  tier: z.string().optional(),
  language: z.enum(['nb', 'en']),
  currency: z.string().optional(),
  sections: z
    .array(ContractTemplateSectionSchema)
    .min(1, 'At least one section is required'),
  headerText: z.string().optional(),
  footerText: z.string().optional(),
  terms: z.array(z.any()).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export const ContractTemplateUpdateSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  title: z.string().min(1).optional(),
  tier: z.string().nullable().optional(),
  language: z.enum(['nb', 'en']).optional(),
  currency: z.string().nullable().optional(),
  sections: z
    .array(ContractTemplateSectionSchema)
    .min(1, 'At least one section is required')
    .optional(),
  headerText: z.string().nullable().optional(),
  footerText: z.string().nullable().optional(),
  terms: z.array(z.any()).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export const ContractTemplateIdSchema = z.object({
  id: z.string().min(1, 'ID is required'),
})

export const ContractTemplateListSchema = z.object({
  conferenceId: z.string().min(1, 'Conference ID is required'),
})

export const GenerateContractPdfSchema = z.object({
  sponsorForConferenceId: z
    .string()
    .min(1, 'Sponsor relationship ID is required'),
  templateId: z.string().min(1, 'Template ID is required'),
})

export const FindBestContractTemplateSchema = z.object({
  conferenceId: z.string().min(1, 'Conference ID is required'),
  tierId: z.string().optional(),
  language: z.enum(['nb', 'en']).optional(),
})

// 500 KB base64 ≈ 375 KB raw PNG — generous for a signature image
const MAX_SIGNATURE_DATA_URL_LENGTH = 500_000

export const SendContractSchema = z.object({
  sponsorForConferenceId: z
    .string()
    .min(1, 'Sponsor relationship ID is required'),
  templateId: z.string().min(1, 'Template ID is required'),
  signerName: z.string().optional(),
  signerEmail: z.string().email().optional(),
  organizerSignatureDataUrl: z
    .string()
    .max(
      MAX_SIGNATURE_DATA_URL_LENGTH,
      'Organizer signature image is too large',
    )
    .startsWith(
      'data:image/png;base64,',
      'Organizer signature must be a PNG data URL',
    )
    .optional(),
  organizerName: z
    .string()
    .min(1, 'Organizer name is required')
    .max(200, 'Organizer name is too long')
    .optional(),
})

export const PreviewContractPdfSchema = z.object({
  conferenceId: z.string().min(1, 'Conference ID is required'),
  title: z.string().min(1, 'Title is required'),
  language: z.enum(['nb', 'en']),
  currency: z.string().optional(),
  sections: z
    .array(
      z.object({
        _key: z.string().optional(),
        heading: z.string(),
        body: z.array(z.any()).optional(),
      }),
    )
    .min(1),
  headerText: z.string().optional(),
  footerText: z.string().optional(),
  terms: z.array(z.any()).optional(),
  tierId: z.string().optional(),
})
