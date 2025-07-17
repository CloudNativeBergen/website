import { SponsorTierInput, SponsorTierValidationError } from './types'

export function validateSponsorTier(
  data: SponsorTierInput & { conference?: string },
): SponsorTierValidationError[] {
  const errors: SponsorTierValidationError[] = []

  // Validate title
  if (!data.title || data.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required' })
  } else if (data.title.length > 100) {
    errors.push({
      field: 'title',
      message: 'Title must be 100 characters or less',
    })
  }

  // Validate tagline
  if (!data.tagline || data.tagline.trim().length === 0) {
    errors.push({ field: 'tagline', message: 'Tagline is required' })
  } else if (data.tagline.length > 200) {
    errors.push({
      field: 'tagline',
      message: 'Tagline must be 200 characters or less',
    })
  }

  // Validate price
  if (!data.price || data.price.length === 0) {
    errors.push({ field: 'price', message: 'At least one price is required' })
  } else {
    data.price.forEach((price, index) => {
      if (!price.amount || price.amount <= 0) {
        errors.push({
          field: `price.${index}.amount`,
          message: 'Price amount must be greater than 0',
        })
      }
      if (!price.currency || !['NOK', 'USD', 'EUR'].includes(price.currency)) {
        errors.push({
          field: `price.${index}.currency`,
          message: 'Currency must be NOK, USD, or EUR',
        })
      }
    })
  }

  // Validate perks
  if (!data.perks || data.perks.length === 0) {
    errors.push({ field: 'perks', message: 'At least one perk is required' })
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

  // Validate conference reference for new sponsor tiers
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
