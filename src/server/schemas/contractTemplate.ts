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

export const SendContractSchema = z.object({
  sponsorForConferenceId: z
    .string()
    .min(1, 'Sponsor relationship ID is required'),
  templateId: z.string().min(1, 'Template ID is required'),
  signerEmail: z.string().email().optional(),
})
