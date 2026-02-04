import { SponsorTierInput, SponsorInput } from './types'

export interface ValidationError {
  field: string
  message: string
}

export function validateSponsorTier(
  data: SponsorTierInput & { conference?: string },
): ValidationError[] {
  const errors: ValidationError[] = []

  if (!data.title || data.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required' })
  } else if (data.title.length > 100) {
    errors.push({
      field: 'title',
      message: 'Title must be 100 characters or less',
    })
  }

  if (!data.tagline || data.tagline.trim().length === 0) {
    errors.push({ field: 'tagline', message: 'Tagline is required' })
  } else if (data.tagline.length > 200) {
    errors.push({
      field: 'tagline',
      message: 'Tagline must be 200 characters or less',
    })
  }

  if (
    !data.tier_type ||
    !['standard', 'special', 'addon'].includes(data.tier_type)
  ) {
    errors.push({
      field: 'tier_type',
      message: 'Tier type must be standard, special, or addon',
    })
  }

  if (data.tier_type === 'standard' || data.tier_type === 'addon') {
    if (!data.price || data.price.length === 0) {
      errors.push({
        field: 'price',
        message: 'Price is required for standard sponsor tiers',
      })
    } else {
      data.price.forEach((price, index) => {
        if (
          price.amount === undefined ||
          price.amount === null ||
          price.amount < 0
        ) {
          errors.push({
            field: `price.${index}.amount`,
            message: 'Price amount must be 0 or greater',
          })
        }
        if (
          !price.currency ||
          !['NOK', 'USD', 'EUR'].includes(price.currency)
        ) {
          errors.push({
            field: `price.${index}.currency`,
            message: 'Currency must be NOK, USD, or EUR',
          })
        }
      })
    }
  }

  if (data.tier_type === 'standard') {
    if (!data.perks || data.perks.length === 0) {
      errors.push({
        field: 'perks',
        message: 'Perks are required for standard sponsor tiers',
      })
    } else {
      data.perks.forEach((perk, index) => {
        if (!perk.label || perk.label.trim().length === 0) {
          errors.push({
            field: `perks.${index}.label`,
            message: 'Perk label is required',
          })
        }
        if (!perk.description || perk.description.trim().length === 0) {
          errors.push({
            field: `perks.${index}.description`,
            message: 'Perk description is required',
          })
        }
      })
    }
  } else if (data.perks && data.perks.length > 0) {
    data.perks.forEach((perk, index) => {
      if (perk.label && perk.label.trim().length === 0) {
        errors.push({
          field: `perks.${index}.label`,
          message: 'Perk label cannot be empty',
        })
      }
      if (perk.description && perk.description.trim().length === 0) {
        errors.push({
          field: `perks.${index}.description`,
          message: 'Perk description cannot be empty',
        })
      }
    })
  }

  if (
    'conference' in data &&
    (!data.conference || data.conference.trim().length === 0)
  ) {
    errors.push({
      field: 'conference',
      message: 'Conference reference is required',
    })
  }

  return errors
}

export function validateSponsor(data: SponsorInput): ValidationError[] {
  const errors: ValidationError[] = []

  if (!data.name || data.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required' })
  } else if (data.name.length > 100) {
    errors.push({
      field: 'name',
      message: 'Name must be 100 characters or less',
    })
  }

  if (!data.website || data.website.trim().length === 0) {
    errors.push({ field: 'website', message: 'Website is required' })
  } else {
    try {
      new URL(data.website)
    } catch {
      errors.push({ field: 'website', message: 'Website must be a valid URL' })
    }
  }

  if (!data.logo || data.logo.trim().length === 0) {
    errors.push({ field: 'logo', message: 'Logo is required' })
  } else if (!data.logo.trim().toLowerCase().includes('<svg')) {
    errors.push({ field: 'logo', message: 'Logo must be valid SVG content' })
  }

  if (data.contact_persons) {
    data.contact_persons.forEach((contact, index) => {
      if (!contact.name || contact.name.trim().length === 0) {
        errors.push({
          field: `contact_persons.${index}.name`,
          message: 'Contact person name is required',
        })
      }
      if (!contact.email || contact.email.trim().length === 0) {
        errors.push({
          field: `contact_persons.${index}.email`,
          message: 'Contact person email is required',
        })
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(contact.email)) {
          errors.push({
            field: `contact_persons.${index}.email`,
            message: 'Contact person email must be valid',
          })
        }
      }
    })
  }

  if (data.billing) {
    if (!data.billing.email || data.billing.email.trim().length === 0) {
      errors.push({
        field: 'billing.email',
        message: 'Billing email is required when billing info is provided',
      })
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(data.billing.email)) {
        errors.push({
          field: 'billing.email',
          message: 'Billing email must be valid',
        })
      }
    }
  }

  return errors
}
