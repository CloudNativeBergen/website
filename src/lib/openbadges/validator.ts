import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { ValidationError } from './errors'
import type { Credential, SignedCredential, ValidationResult } from './types'

const ajv = new Ajv({
  strict: false,
  allErrors: true,
  verbose: true,
})

addFormats(ajv)

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
              required: ['narrative'],
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
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'type', 'name'],
                properties: {
                  id: { type: 'string', format: 'uri' },
                  type: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  name: { type: 'string' },
                  description: { type: 'string' },
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

const validateSchema = ajv.compile(achievementCredentialSchema)

export function validateCredential(
  credential: Credential | SignedCredential,
): ValidationResult {
  const valid = validateSchema(credential)

  if (valid) {
    return { valid: true }
  }

  const errors = (validateSchema.errors || []).map((error) => {
    const field = error.instancePath || error.schemaPath
    const message = error.message || 'Validation error'

    return {
      field: field.replace(/^\//, '').replace(/\//g, '.'),
      message,
      value: error.data,
    }
  })

  return { valid: false, errors }
}

export function assertValidCredential(
  credential: Credential | SignedCredential,
): void {
  const result = validateCredential(credential)

  if (!result.valid) {
    const errorMessages = result.errors
      ?.map((e) => `${e.field}: ${e.message}`)
      .join('\n')

    throw new ValidationError(
      `Credential validation failed:\n${errorMessages}`,
      { errors: result.errors },
    )
  }
}
