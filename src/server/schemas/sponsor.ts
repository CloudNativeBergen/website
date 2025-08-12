/**
 * Zod schemas for sponsor-related data validation
 * Based on existing TypeScript types in /lib/sponsor/types.ts
 */

import { z } from 'zod'

// Contact person schema
export const ContactPersonSchema = z.object({
  _key: z.string(),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  role: z.string().optional(),
})

// Billing info schema
export const BillingInfoSchema = z.object({
  email: z.string().email('Valid billing email is required'),
  reference: z.string().optional(),
  comments: z.string().optional(),
})

// Sponsor input schema for creation/updates
export const SponsorInputSchema = z.object({
  name: z.string().min(1, 'Sponsor name is required'),
  website: z.string().url('Valid website URL is required'),
  logo: z.string().min(1, 'Logo is required'),
  org_number: z.string().optional(),
  contact_persons: z.array(ContactPersonSchema).optional(),
  billing: BillingInfoSchema.optional(),
  tierId: z.string().optional(), // For tier assignment
})

// Sponsor tier price schema
export const SponsorTierPriceSchema = z.object({
  _key: z.string().optional(),
  amount: z.number().min(0, 'Amount must be positive'),
  currency: z.string().min(1, 'Currency is required'),
})

// Sponsor tier perk schema
export const SponsorTierPerkSchema = z.object({
  _key: z.string().optional(),
  label: z.string().min(1, 'Perk label is required'),
  description: z.string().min(1, 'Perk description is required'),
})

// Sponsor tier input schema
export const SponsorTierInputSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  tagline: z.string().min(1, 'Tagline is required'),
  tier_type: z.enum(['standard', 'special']),
  price: z.array(SponsorTierPriceSchema).optional(),
  perks: z.array(SponsorTierPerkSchema).optional(),
  sold_out: z.boolean(),
  most_popular: z.boolean(),
})

// Conference sponsor assignment schema
export const ConferenceSponsorInputSchema = z.object({
  sponsorId: z.string().min(1, 'Sponsor ID is required'),
  tierId: z.string().min(1, 'Tier ID is required'),
})

// Sponsor tier assignment schema
export const SponsorTierAssignmentSchema = z.object({
  sponsorName: z.string().min(1, 'Sponsor name is required'),
  tierId: z.string().min(1, 'Tier ID is required'),
})

// Search/query schemas
export const SponsorSearchSchema = z.object({
  query: z.string().optional(),
  includeContactInfo: z.boolean().default(false),
})

// Update schemas (for partial updates)
export const SponsorUpdateSchema = SponsorInputSchema.partial()
export const SponsorTierUpdateSchema = SponsorTierInputSchema.partial()

// ID parameter schemas
export const IdParamSchema = z.object({
  id: z.string().min(1, 'ID is required'),
})
