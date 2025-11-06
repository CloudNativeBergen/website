/**
 * OpenBadges 3.0 JSON Schema Validator
 *
 * Validates badge credentials against the official OpenBadges 3.0 JSON schema
 * from 1EdTech: https://purl.imsglobal.org/spec/ob/v3p0/schema/json/
 */

import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import type { BadgeAssertion } from './types'

// Initialize AJV with proper options for OpenBadges 3.0
const ajv = new Ajv({
  strict: false, // OpenBadges uses additional properties
  allErrors: true, // Get all validation errors
  verbose: true, // Include schema and data in errors
})

// Add format validators (date-time, uri, email, etc.)
addFormats(ajv)

/**
 * OpenBadges 3.0 AchievementCredential schema
 * Based on: https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json
 */
const achievementCredentialSchema = {
  type: 'object',
  required: ['@context', 'type', 'credentialSubject', 'issuer', 'validFrom'],
  properties: {
    '@context': {
      type: 'array',
      minItems: 2,
      items: { type: 'string' },
      contains: {
        const: 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
      },
    },
    id: { type: 'string', format: 'uri' },
    type: {
      type: 'array',
      minItems: 2,
      contains: { const: 'VerifiableCredential' },
      items: { type: 'string' },
    },
    name: { type: 'string' },
    credentialSubject: {
      type: 'object',
      required: ['type', 'achievement'],
      properties: {
        id: { type: 'string' },
        type: {
          type: 'array',
          contains: { const: 'AchievementSubject' },
          items: { type: 'string' },
        },
        achievement: {
          type: 'object',
          required: ['id', 'type', 'name', 'criteria'],
          properties: {
            id: { type: 'string', format: 'uri' },
            type: {
              type: 'array',
              contains: { const: 'Achievement' },
              items: { type: 'string' },
            },
            name: { type: 'string' },
            description: { type: 'string' },
            criteria: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uri' },
                narrative: { type: 'string' },
              },
            },
            image: {
              type: 'object',
              required: ['id', 'type'],
              properties: {
                id: { type: 'string', format: 'uri' },
                type: { const: 'Image' },
                caption: { type: 'string' },
              },
            },
            issuer: {
              type: 'object',
              required: ['id', 'type', 'name'],
              properties: {
                id: { type: 'string', format: 'uri' },
                type: {
                  type: 'array',
                  contains: { const: 'Profile' },
                  items: { type: 'string' },
                },
                name: { type: 'string' },
                url: { type: 'string', format: 'uri' },
                email: { type: 'string', format: 'email' },
                description: { type: 'string' },
                image: {
                  type: 'object',
                  required: ['id', 'type'],
                  properties: {
                    id: { type: 'string', format: 'uri' },
                    type: { const: 'Image' },
                  },
                },
              },
            },
          },
        },
      },
    },
    issuer: {
      type: 'object',
      required: ['id', 'type', 'name'],
      properties: {
        id: { type: 'string', format: 'uri' },
        type: {
          type: 'array',
          contains: { const: 'Profile' },
          items: { type: 'string' },
        },
        name: { type: 'string' },
        url: { type: 'string', format: 'uri' },
        description: { type: 'string' },
        image: {
          type: 'object',
          required: ['id', 'type'],
          properties: {
            id: { type: 'string', format: 'uri' },
            type: { const: 'Image' },
          },
        },
      },
    },
    validFrom: { type: 'string', format: 'date-time' },
    validUntil: { type: 'string', format: 'date-time' },
    proof: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: [
          'type',
          'created',
          'verificationMethod',
          'cryptosuite',
          'proofPurpose',
          'proofValue',
        ],
        properties: {
          type: { const: 'DataIntegrityProof' },
          created: { type: 'string', format: 'date-time' },
          verificationMethod: { type: 'string', format: 'uri' },
          cryptosuite: { type: 'string' },
          proofPurpose: { type: 'string' },
          proofValue: { type: 'string' },
        },
      },
    },
  },
  additionalProperties: true,
}

// Compile the schema
const validateSchema = ajv.compile(achievementCredentialSchema)

export interface ValidationResult {
  valid: boolean
  errors?: Array<{
    field: string
    message: string
    value?: unknown
  }>
}

/**
 * Validate a badge assertion against the OpenBadges 3.0 schema
 */
export function validateBadgeSchema(
  assertion: BadgeAssertion,
): ValidationResult {
  const valid = validateSchema(assertion)

  if (valid) {
    return { valid: true }
  }

  const errors = (validateSchema.errors || []).map((error) => ({
    field: error.instancePath || error.schemaPath,
    message: error.message || 'Validation error',
    value: error.data,
  }))

  return { valid: false, errors }
}

/**
 * Validate a badge assertion and throw if invalid
 */
export function assertValidBadge(assertion: BadgeAssertion): void {
  const result = validateBadgeSchema(assertion)

  if (!result.valid) {
    const errorMessages = result.errors
      ?.map((e) => `${e.field}: ${e.message}`)
      .join('\n')
    throw new Error(`Badge validation failed:\n${errorMessages}`)
  }
}

/**
 * Get human-readable validation errors
 */
export function getValidationErrors(assertion: BadgeAssertion): string[] {
  const result = validateBadgeSchema(assertion)

  if (result.valid) {
    return []
  }

  return (
    result.errors?.map((e) => {
      const field = e.field.replace('/credentialSubject/', 'credentialSubject.')
      return `${field}: ${e.message}`
    }) || []
  )
}
