import type { Conference } from '@/lib/conference/types'
import { createPublicKey } from 'crypto'

/**
 * Signing configuration for OpenBadges credentials
 *
 * @see https://www.imsglobal.org/spec/ob/v3p0/impl/#proof-formats
 */
export interface SigningConfiguration {
  /** RSA private key in PEM format (PKCS#8) */
  privateKey: string
  /** RSA public key in PEM format */
  publicKey: string
  /** Signing algorithm - must be RS256 for 1EdTech validator compliance */
  algorithm: 'RS256' | 'EdDSA'
  /**
   * Verification method URL (kid) - must be a dereferenceable HTTP URL
   * pointing to a JWK endpoint, not a fragment identifier
   *
   * @example "https://cloudnativeday.no/api/badge/keys/key-1"
   * @see https://www.imsglobal.org/spec/ob/v3p0/impl/#external-proof-jwt-proof
   */
  verificationMethod: string
}

/**
 * Issuer profile configuration
 *
 * @see https://www.imsglobal.org/spec/ob/v3p0/impl/#issuer-profile
 */
export interface IssuerConfiguration {
  /** Issuer profile ID (must be dereferenceable URL) */
  id: string
  /** Organization name */
  name: string
  /** Organization website URL */
  url: string
  /** Contact email address */
  email?: string
  /** Organization description */
  description?: string
  /** Organization logo/image URL */
  imageUrl?: string
}

/**
 * Complete badge configuration for generating OpenBadges 3.0 credentials
 *
 * This configuration object encapsulates all required data for badge generation,
 * making the badge generation functions pure and testable without environment
 * variable dependencies.
 *
 * @see https://www.imsglobal.org/spec/ob/v3p0/
 */
export interface BadgeConfiguration {
  /** Base URL for all generated URLs (e.g., https://cloudnativeday.no) */
  baseUrl: string
  /** Issuer profile configuration */
  issuer: IssuerConfiguration
  /** Signing configuration for JWT credentials */
  signing: SigningConfiguration
}

/**
 * Create badge configuration from environment variables and conference data
 *
 * This factory function isolates all side effects (environment variable access,
 * conference data loading) to enable pure function testing of badge generation.
 *
 * @param conference - Conference data from Sanity CMS
 * @param domain - Domain name for the conference (e.g., "cloudnativeday.no")
 * @returns BadgeConfiguration object for badge generation
 * @throws Error if required environment variables are missing or invalid
 *
 * @example
 * ```typescript
 * const config = await createBadgeConfiguration(conference, 'cloudnativeday.no')
 * const badge = await generateBadgeCredential(params, config)
 * ```
 */
export async function createBadgeConfiguration(
  conference: Conference,
  domain: string,
): Promise<BadgeConfiguration> {
  // Load RSA keys from environment
  const privateKey = process.env.BADGE_ISSUER_RSA_PRIVATE_KEY
  const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY
  const rsaOnly = process.env.BADGE_ISSUER_RSA_ONLY === 'true'

  if (!privateKey || !publicKey) {
    throw new Error(
      'Badge issuer RSA keys must be set in environment. ' +
        'Set BADGE_ISSUER_RSA_PRIVATE_KEY and BADGE_ISSUER_RSA_PUBLIC_KEY. ' +
        'See: https://github.com/cloudnativebergen/website/blob/main/docs/OPENBADGES_IMPLEMENTATION.md#key-management',
    )
  }

  // Validate that keys are RSA format (PEM with BEGIN/END markers)
  const isRSA =
    privateKey.includes('BEGIN') &&
    privateKey.includes('PRIVATE KEY') &&
    publicKey.includes('BEGIN') &&
    publicKey.includes('PUBLIC KEY')

  if (rsaOnly && !isRSA) {
    throw new Error(
      'BADGE_ISSUER_RSA_ONLY is enabled but RSA keys are not provided. ' +
        'Ensure keys are in PEM format (BEGIN RSA PRIVATE KEY / BEGIN PUBLIC KEY). ' +
        'See: https://github.com/cloudnativebergen/website/blob/main/docs/OPENBADGES_IMPLEMENTATION.md#rs256-requirement',
    )
  }

  // Validate RSA public key can be parsed
  try {
    createPublicKey(publicKey)
  } catch (error) {
    throw new Error(
      `Invalid RSA public key format: ${error instanceof Error ? error.message : String(error)}. ` +
        'Ensure BADGE_ISSUER_RSA_PUBLIC_KEY is a valid PEM-encoded RSA public key. ' +
        'See: https://github.com/cloudnativebergen/website/blob/main/docs/OPENBADGES_IMPLEMENTATION.md#key-generation',
    )
  }

  // Normalize base URL (ensure https:// protocol)
  const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`

  // Build issuer configuration
  const issuerEmail =
    conference.contact_email ||
    (conference.domains?.[0]
      ? `contact@${conference.domains[0]}`
      : 'contact@cloudnativedays.no')

  const issuerDescription =
    conference.description ||
    `${conference.organizer} hosts ${conference.title}, bringing together the cloud native community in ${conference.city}, ${conference.country}.`

  return {
    baseUrl,
    issuer: {
      id: `${baseUrl}/api/badge/issuer`,
      name: conference.organizer,
      url: baseUrl,
      email: issuerEmail,
      description: issuerDescription,
      imageUrl: `${baseUrl}/og/base.png`,
    },
    signing: {
      privateKey,
      publicKey,
      algorithm: isRSA ? 'RS256' : 'EdDSA',
      // CRITICAL: Use /keys/ endpoint, not fragment identifier
      // Fragments don't work in HTTP requests (stripped by clients)
      // See: https://github.com/1EdTech/digital-credentials-public-validator/blob/main/inspector-vc/src/main/java/org/oneedtech/inspect/vc/probe/ExternalProofProbe.java#L63
      verificationMethod: `${baseUrl}/api/badge/keys/key-1`,
    },
  }
}

/**
 * Create test configuration using test environment keys
 *
 * This helper function loads keys from .env.test for use in test suites,
 * enabling pure function testing without mocking environment variables.
 *
 * @param overrides - Optional configuration overrides for testing specific scenarios
 * @returns BadgeConfiguration object with test keys
 *
 * @example
 * ```typescript
 * // In tests
 * const config = createTestConfiguration()
 * const badge = await generateBadgeCredential(params, config)
 * expect(badge.assertion).toBeDefined()
 * ```
 */
export function createTestConfiguration(
  overrides?: Partial<BadgeConfiguration>,
): BadgeConfiguration {
  const privateKey =
    process.env.BADGE_ISSUER_RSA_PRIVATE_KEY || process.env.TEST_RSA_PRIVATE_KEY
  const publicKey =
    process.env.BADGE_ISSUER_RSA_PUBLIC_KEY || process.env.TEST_RSA_PUBLIC_KEY

  if (!privateKey || !publicKey) {
    throw new Error(
      'Test keys not found. Ensure .env.test defines TEST_RSA_PRIVATE_KEY and TEST_RSA_PUBLIC_KEY, ' +
        'or run tests with BADGE_ISSUER_RSA_PRIVATE_KEY and BADGE_ISSUER_RSA_PUBLIC_KEY set.',
    )
  }

  const baseUrl = 'https://test.cloudnativedays.no'

  const defaultConfig: BadgeConfiguration = {
    baseUrl,
    issuer: {
      id: `${baseUrl}/api/badge/issuer`,
      name: 'Test Organization',
      url: baseUrl,
      email: 'test@cloudnativedays.no',
      description: 'Test organization for OpenBadges compliance testing',
      imageUrl: `${baseUrl}/og/base.png`,
    },
    signing: {
      privateKey,
      publicKey,
      algorithm: 'RS256',
      verificationMethod: `${baseUrl}/api/badge/keys/key-1`,
    },
  }

  return {
    ...defaultConfig,
    ...overrides,
    issuer: {
      ...defaultConfig.issuer,
      ...overrides?.issuer,
    },
    signing: {
      ...defaultConfig.signing,
      ...overrides?.signing,
    },
  }
}
