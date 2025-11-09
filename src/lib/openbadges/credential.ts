import { ConfigurationError } from './errors'
import { OB_CONTEXT } from './types'
import type {
  Credential,
  CredentialConfig,
  IssuerProfile,
  Achievement,
  AchievementSubject,
  IssuerProfileConfig,
  AchievementConfig,
  SubjectProfile,
} from './types'

function validateIssuerProfile(config: IssuerProfileConfig): void {
  if (!config.id || typeof config.id !== 'string') {
    throw new ConfigurationError('Issuer ID is required', {
      field: 'issuer.id',
      value: config.id,
    })
  }

  try {
    new URL(config.id)
  } catch {
    throw new ConfigurationError('Issuer ID must be a valid URL', {
      field: 'issuer.id',
      value: config.id,
    })
  }

  if (
    !config.name ||
    typeof config.name !== 'string' ||
    config.name.trim().length === 0
  ) {
    throw new ConfigurationError('Issuer name is required', {
      field: 'issuer.name',
      value: config.name,
    })
  }

  if (!config.url || typeof config.url !== 'string') {
    throw new ConfigurationError('Issuer URL is required', {
      field: 'issuer.url',
      value: config.url,
    })
  }

  try {
    new URL(config.url)
  } catch {
    throw new ConfigurationError('Issuer URL must be a valid URL', {
      field: 'issuer.url',
      value: config.url,
    })
  }

  if (config.email && typeof config.email !== 'string') {
    throw new ConfigurationError('Issuer email must be a string', {
      field: 'issuer.email',
      value: config.email,
    })
  }

  if (config.image) {
    if (!config.image.id || typeof config.image.id !== 'string') {
      throw new ConfigurationError(
        'Issuer image ID is required when image is provided',
        { field: 'issuer.image.id', value: config.image.id },
      )
    }
    try {
      new URL(config.image.id)
    } catch {
      throw new ConfigurationError('Issuer image ID must be a valid URL', {
        field: 'issuer.image.id',
        value: config.image.id,
      })
    }
  }
}

function validateAchievementConfig(config: AchievementConfig): void {
  if (!config.id || typeof config.id !== 'string') {
    throw new ConfigurationError('Achievement ID is required', {
      field: 'achievement.id',
      value: config.id,
    })
  }

  try {
    new URL(config.id)
  } catch {
    throw new ConfigurationError('Achievement ID must be a valid URL', {
      field: 'achievement.id',
      value: config.id,
    })
  }

  if (
    !config.name ||
    typeof config.name !== 'string' ||
    config.name.trim().length === 0
  ) {
    throw new ConfigurationError('Achievement name is required', {
      field: 'achievement.name',
      value: config.name,
    })
  }

  if (
    !config.description ||
    typeof config.description !== 'string' ||
    config.description.trim().length === 0
  ) {
    throw new ConfigurationError('Achievement description is required', {
      field: 'achievement.description',
      value: config.description,
    })
  }

  if (
    !config.criteria ||
    !config.criteria.narrative ||
    config.criteria.narrative.trim().length === 0
  ) {
    throw new ConfigurationError('Achievement criteria narrative is required', {
      field: 'achievement.criteria.narrative',
      value: config.criteria?.narrative,
    })
  }

  if (!config.image || !config.image.id) {
    throw new ConfigurationError('Achievement image is required', {
      field: 'achievement.image',
      value: config.image,
    })
  }

  try {
    new URL(config.image.id)
  } catch {
    throw new ConfigurationError('Achievement image ID must be a valid URL', {
      field: 'achievement.image.id',
      value: config.image.id,
    })
  }

  if (config.evidence) {
    config.evidence.forEach((evidence, index) => {
      if (!evidence.id || typeof evidence.id !== 'string') {
        throw new ConfigurationError(`Evidence[${index}] ID is required`, {
          field: `achievement.evidence[${index}].id`,
          value: evidence.id,
        })
      }
      if (
        !evidence.type ||
        !Array.isArray(evidence.type) ||
        evidence.type.length === 0
      ) {
        throw new ConfigurationError(
          `Evidence[${index}] type array is required`,
          {
            field: `achievement.evidence[${index}].type`,
            value: evidence.type,
          },
        )
      }
      if (!evidence.name || typeof evidence.name !== 'string') {
        throw new ConfigurationError(`Evidence[${index}] name is required`, {
          field: `achievement.evidence[${index}].name`,
          value: evidence.name,
        })
      }
    })
  }
}

function validateSubjectProfile(config: SubjectProfile): void {
  if (!config.id || typeof config.id !== 'string') {
    throw new ConfigurationError('Subject ID is required', {
      field: 'subject.id',
      value: config.id,
    })
  }

  if (!config.type || !Array.isArray(config.type) || config.type.length === 0) {
    throw new ConfigurationError('Subject type array is required', {
      field: 'subject.type',
      value: config.type,
    })
  }

  if (!config.type.includes('AchievementSubject')) {
    throw new ConfigurationError(
      'Subject type must include "AchievementSubject"',
      { field: 'subject.type', value: config.type },
    )
  }
}

function validateCredentialConfig(config: CredentialConfig): void {
  if (!config.credentialId || typeof config.credentialId !== 'string') {
    throw new ConfigurationError('Credential ID is required', {
      field: 'credentialId',
      value: config.credentialId,
    })
  }

  try {
    new URL(config.credentialId)
  } catch {
    throw new ConfigurationError('Credential ID must be a valid URL', {
      field: 'credentialId',
      value: config.credentialId,
    })
  }

  if (!config.validFrom || typeof config.validFrom !== 'string') {
    throw new ConfigurationError('validFrom timestamp is required', {
      field: 'validFrom',
      value: config.validFrom,
    })
  }

  try {
    const date = new Date(config.validFrom)
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date')
    }
  } catch {
    throw new ConfigurationError(
      'validFrom must be a valid ISO 8601 timestamp',
      { field: 'validFrom', value: config.validFrom },
    )
  }

  if (config.validUntil) {
    try {
      const date = new Date(config.validUntil)
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date')
      }
    } catch {
      throw new ConfigurationError(
        'validUntil must be a valid ISO 8601 timestamp',
        { field: 'validUntil', value: config.validUntil },
      )
    }
  }

  validateIssuerProfile(config.issuer)
  validateSubjectProfile(config.subject)
  validateAchievementConfig(config.achievement)
}

function buildIssuerProfile(config: IssuerProfileConfig): IssuerProfile {
  const profile: IssuerProfile = {
    id: config.id,
    type: ['Profile'],
    name: config.name,
    url: config.url,
  }

  if (config.email) {
    profile.email = config.email
  }

  if (config.description) {
    profile.description = config.description
  }

  if (config.image) {
    profile.image = {
      id: config.image.id,
      type: 'Image',
    }
  }

  return profile
}

function buildAchievement(
  config: AchievementConfig,
  issuer: IssuerProfile,
): Achievement {
  const achievement: Achievement = {
    id: config.id,
    type: ['Achievement'],
    name: config.name,
    description: config.description,
    criteria: {
      narrative: config.criteria.narrative,
    },
    image: {
      id: config.image.id,
      type: 'Image',
      caption: config.image.caption,
    },
    creator: issuer, // Per OpenBadges 3.0 spec: Achievement uses "creator", not "issuer"
  }

  if (config.criteria.id) {
    achievement.criteria.id = config.criteria.id
  }

  if (config.evidence && config.evidence.length > 0) {
    achievement.evidence = config.evidence
  }

  return achievement
}

export function createCredential(config: CredentialConfig): Credential {
  validateCredentialConfig(config)

  const issuer = buildIssuerProfile(config.issuer)
  const achievement = buildAchievement(config.achievement, issuer)

  const credentialSubject: AchievementSubject = {
    id: config.subject.id,
    type: config.subject.type,
    achievement,
  }

  const credential: Credential = {
    '@context': [...OB_CONTEXT],
    id: config.credentialId,
    type: ['VerifiableCredential', 'AchievementCredential'],
    name: config.name || `${config.achievement.name}`,
    credentialSubject,
    issuer,
    validFrom: config.validFrom,
  }

  if (config.validUntil) {
    credential.validUntil = config.validUntil
  }

  return credential
}
