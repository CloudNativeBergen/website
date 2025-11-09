import Ajv2019 from 'ajv/dist/2019'
import addFormats from 'ajv-formats'
import { ValidationError } from './errors'
import type { Credential, SignedCredential, ValidationResult } from './types'
import officialSchema from './schema/json/ob_v3p0_achievementcredential_schema.json'

/**
 * OpenBadges 3.0 Credential Schema Validator
 *
 * Validates credentials against the official OpenBadges 3.0 JSON Schema from 1EdTech:
 * https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json
 *
 * Uses Ajv2019 to support JSON Schema Draft 2019-09 (required by official schema)
 */

const ajv = new Ajv2019({
  strict: false,
  allErrors: true,
  verbose: true,
})

addFormats(ajv)

const validateSchema = ajv.compile(officialSchema)

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
