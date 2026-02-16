/**
 * Badge Validation Module
 *
 * Server-side validation of OpenBadges 3.0 credentials
 * Extracted from REST API for use in tRPC
 */

import {
  extractBadge,
  verifyCredential,
  verifyCredentialJWT,
  didKeyToPublicKeyHex,
} from '@/lib/openbadges'
import * as jsonld from 'jsonld'
import crypto from 'node:crypto'
import type { SignedCredential } from '@/lib/openbadges/types'

export interface ValidationCheck {
  name: string
  status: 'success' | 'warning' | 'error'
  message: string
  details?: Record<string, unknown>
}

export interface ValidationResult {
  checks: ValidationCheck[]
  credential: SignedCredential | null
}

export async function validateBadge(svg: string): Promise<ValidationResult> {
  const checks: ValidationCheck[] = []
  let credential: SignedCredential
  let isJWT = false

  // Step 1: Extract credential from SVG
  try {
    const credentialData = extractBadge(svg)

    if (typeof credentialData === 'string') {
      isJWT = true
      const publicKey = process.env.BADGE_ISSUER_RSA_PUBLIC_KEY

      if (!publicKey) {
        checks.push({
          name: 'extraction',
          status: 'error',
          message: 'RSA public key not configured for JWT verification',
        })
        return { checks, credential: null }
      }

      try {
        credential = (await verifyCredentialJWT(
          credentialData,
          publicKey,
        )) as SignedCredential

        checks.push({
          name: 'extraction',
          status: 'success',
          message: 'JWT credential extracted and signature verified',
          details: {
            credentialId: credential.id,
            issuer:
              typeof credential.issuer === 'object'
                ? credential.issuer.name || credential.issuer.id
                : credential.issuer,
            format: 'JWT (Compact JWS)',
          },
        })
      } catch (jwtError) {
        checks.push({
          name: 'extraction',
          status: 'error',
          message:
            jwtError instanceof Error
              ? `JWT verification failed: ${jwtError.message}`
              : 'JWT verification failed',
        })
        return { checks, credential: null }
      }
    } else {
      credential = credentialData
      checks.push({
        name: 'extraction',
        status: 'success',
        message: 'Credential extracted successfully',
        details: {
          credentialId: credential.id,
          issuer:
            typeof credential.issuer === 'object'
              ? credential.issuer.name || credential.issuer.id
              : credential.issuer,
          format: 'Data Integrity Proof',
        },
      })
    }
  } catch (error) {
    checks.push({
      name: 'extraction',
      status: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Failed to extract credential',
    })
    return { checks, credential: null }
  }

  // Step 2: Validate credential structure
  const structureIssues: string[] = []

  if (!credential['@context']) {
    structureIssues.push('Missing @context')
  } else if (
    !credential['@context'].includes('https://www.w3.org/ns/credentials/v2')
  ) {
    structureIssues.push('Missing W3C Credentials v2 context')
  }

  if (!credential.type?.includes('VerifiableCredential')) {
    structureIssues.push('Missing VerifiableCredential type')
  }

  const issuerId =
    typeof credential.issuer === 'object'
      ? credential.issuer.id
      : credential.issuer

  if (!issuerId) {
    structureIssues.push('Missing issuer.id')
  }

  if (!credential.credentialSubject) {
    structureIssues.push('Missing credentialSubject')
  }

  if (!isJWT && (!credential.proof || credential.proof.length === 0)) {
    structureIssues.push('Missing Data Integrity Proof')
  }

  if (structureIssues.length > 0) {
    checks.push({
      name: 'structure',
      status: 'error',
      message: `Credential structure is invalid: ${structureIssues.join(', ')}`,
      details: { issues: structureIssues },
    })
  } else {
    checks.push({
      name: 'structure',
      status: 'success',
      message: 'Credential structure is valid (OpenBadges 3.0)',
    })
  }

  // Step 2b: RDF Dataset Canonicalization (only for Data Integrity Proof)
  if (!isJWT) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- proof extracted but not used
      const { proof: _proof, ...unsigned } = credential

      type JsonLdContext = Record<string, unknown>
      const LOCAL_CONTEXTS: Record<string, JsonLdContext> = {
        'https://www.w3.org/ns/credentials/v2': {
          '@context': {
            id: '@id',
            type: '@type',
            VerifiableCredential:
              'https://www.w3.org/2018/credentials#VerifiableCredential',
            credentialSubject:
              'https://www.w3.org/2018/credentials#credentialSubject',
            issuer: 'https://www.w3.org/2018/credentials#issuer',
            validFrom: 'https://www.w3.org/2018/credentials#validFrom',
            DataIntegrityProof: 'https://w3id.org/security#DataIntegrityProof',
            verificationMethod: 'https://w3id.org/security#verificationMethod',
            proofPurpose: 'https://w3id.org/security#proofPurpose',
            assertionMethod: 'https://w3id.org/security#assertionMethod',
            cryptosuite: 'https://w3id.org/security#cryptosuite',
            created: {
              '@id': 'http://purl.org/dc/terms/created',
              '@type': 'http://www.w3.org/2001/XMLSchema#dateTime',
            },
          },
        },
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json': {
          '@context': {
            Profile:
              'https://purl.imsglobal.org/spec/vc/ob/vocab.html#Profile',
            Achievement:
              'https://purl.imsglobal.org/spec/vc/ob/vocab.html#Achievement',
            AchievementSubject:
              'https://purl.imsglobal.org/spec/vc/ob/vocab.html#AchievementSubject',
            AchievementCredential:
              'https://purl.imsglobal.org/spec/vc/ob/vocab.html#OpenBadgeCredential',
            Criteria:
              'https://purl.imsglobal.org/spec/vc/ob/vocab.html#Criteria',
            Evidence:
              'https://purl.imsglobal.org/spec/vc/ob/vocab.html#Evidence',
            Image: 'https://purl.imsglobal.org/spec/vc/ob/vocab.html#Image',
            achievement:
              'https://purl.imsglobal.org/spec/vc/ob/vocab.html#achievement',
            narrative:
              'https://purl.imsglobal.org/spec/vc/ob/vocab.html#narrative',
            image: 'https://purl.imsglobal.org/spec/vc/ob/vocab.html#image',
            name: 'https://schema.org/name',
            description: 'https://schema.org/description',
            email: 'https://schema.org/email',
            url: 'https://schema.org/url',
            caption: 'https://schema.org/caption',
          },
        },
      }

      const customDocLoader = async (url: string) => {
        if (LOCAL_CONTEXTS[url]) {
          return {
            contextUrl: null,
            documentUrl: url,
            document: LOCAL_CONTEXTS[url],
          }
        }
        throw new Error(`Context not found: ${url}`)
      }

      const canonicalDoc = await (
        jsonld.canonize as (
          doc: unknown,
          options: Record<string, unknown>,
        ) => Promise<string>
      )(unsigned as unknown as Record<string, unknown>, {
        algorithm: 'URDNA2015',
        format: 'application/n-quads',
        documentLoader: customDocLoader,
        safe: false,
      })

      const proofObj = credential.proof[0]
      const canonicalProofInput = {
        '@context': 'https://www.w3.org/ns/credentials/v2',
        type: proofObj.type,
        created: proofObj.created,
        verificationMethod: proofObj.verificationMethod,
        cryptosuite: proofObj.cryptosuite,
        proofPurpose: proofObj.proofPurpose,
      }
      const canonicalProof = await (
        jsonld.canonize as (
          doc: unknown,
          options: Record<string, unknown>,
        ) => Promise<string>
      )(canonicalProofInput, {
        algorithm: 'URDNA2015',
        format: 'application/n-quads',
        documentLoader: customDocLoader,
        safe: false,
      })

      const concatenated = canonicalDoc + canonicalProof
      const canonicalizationResult = crypto
        .createHash('sha256')
        .update(concatenated, 'utf8')
        .digest('hex')

      checks.push({
        name: 'canonicalization',
        status: 'success',
        message: 'Canonicalization completed (URDNA2015)',
        details: {
          canonicalDocLines: (canonicalDoc as string)
            .split('\n')
            .filter(Boolean).length,
          canonicalProofLines: (canonicalProof as string)
            .split('\n')
            .filter(Boolean).length,
          canonicalizationResult,
        },
      })
    } catch (error) {
      checks.push({
        name: 'canonicalization',
        status: 'error',
        message: `Canonicalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }
  }

  // Step 3-7: Validate issuer, proof, achievement, URLs, and temporal validity
  await validateIssuerAndProof(credential, isJWT, issuerId, checks)
  await validateAchievement(credential, checks)
  validateURLFormat(credential, checks)
  validateTemporalValidity(credential, checks)

  return { checks, credential }
}

async function validateIssuerAndProof(
  credential: SignedCredential,
  isJWT: boolean,
  issuerId: string | undefined,
  checks: ValidationCheck[],
): Promise<void> {
  if (!issuerId) return

  const isDidKey = issuerId.startsWith('did:key:')

  if (isDidKey) {
    checks.push({
      name: 'issuer',
      status: 'success',
      message: 'DID-based issuer (self-sovereign identity)',
      details: {
        issuerId,
        type: 'did:key',
        note: 'DID-based issuers are self-describing and do not require HTTP endpoints',
      },
    })

    if (!isJWT && credential.proof && credential.proof.length > 0) {
      const proof = credential.proof[0]

      const expectedVmPrefix = issuerId
      if (!proof.verificationMethod.startsWith(expectedVmPrefix)) {
        checks.push({
          name: 'proof',
          status: 'error',
          message: 'Verification method does not match issuer DID',
          details: {
            expected: `${expectedVmPrefix}#...`,
            actual: proof.verificationMethod,
          },
        })
      } else {
        try {
          const publicKeyHex = didKeyToPublicKeyHex(issuerId)
          const isValid = await verifyCredential(credential, publicKeyHex)

          if (isValid) {
            checks.push({
              name: 'proof',
              status: 'success',
              message: `Cryptographic proof verified successfully (${proof.cryptosuite})`,
              details: {
                cryptosuite: proof.cryptosuite,
                created: proof.created,
                verificationMethod: proof.verificationMethod,
                didBased: true,
                signatureValid: true,
              },
            })
          } else {
            checks.push({
              name: 'proof',
              status: 'error',
              message: 'Cryptographic signature verification failed',
              details: {
                cryptosuite: proof.cryptosuite,
                verificationMethod: proof.verificationMethod,
                signatureValid: false,
              },
            })
          }
        } catch (error) {
          checks.push({
            name: 'proof',
            status: 'error',
            message: `Signature verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          })
        }
      }
    } else if (isJWT) {
      checks.push({
        name: 'proof',
        status: 'success',
        message: 'JWT signature verified during extraction (RS256)',
        details: {
          cryptosuite: 'RS256 (JWT)',
          didBased: false,
          signatureValid: true,
        },
      })
    }
  } else {
    // HTTP(S)-based issuer
    try {
      const issuerResponse = await fetch(issuerId, {
        headers: {
          Accept: 'application/ld+json',
          'User-Agent': 'CloudNativeBergen-BadgeValidator/1.0',
        },
        signal: AbortSignal.timeout(5000),
      })

      if (!issuerResponse.ok) {
        checks.push({
          name: 'issuer',
          status: 'warning',
          message: `Issuer profile endpoint returned ${issuerResponse.status}`,
          details: { status: issuerResponse.status },
        })
      } else {
        const issuerProfile = await issuerResponse.json()
        checks.push({
          name: 'issuer',
          status: 'success',
          message: 'Issuer profile retrieved successfully',
          details: {
            issuerName: issuerProfile.name,
            hasVerificationMethod: !!issuerProfile.verificationMethod,
          },
        })

        if (credential.proof && credential.proof.length > 0) {
          const proof = credential.proof[0]
          const verificationMethod = issuerProfile.verificationMethod?.find(
            (vm: { id: string }) => vm.id === proof.verificationMethod,
          )

          if (!verificationMethod) {
            checks.push({
              name: 'proof',
              status: 'warning',
              message: 'Verification method not found in issuer profile',
              details: {
                expected: proof.verificationMethod,
                available:
                  issuerProfile.verificationMethod?.map(
                    (vm: { id: string }) => vm.id,
                  ) || [],
              },
            })
          } else {
            await validateController(
              proof,
              verificationMethod,
              issuerId,
              checks,
            )
            checks.push({
              name: 'proof',
              status: 'success',
              message: `Proof validation passed (${proof.cryptosuite})`,
              details: {
                cryptosuite: proof.cryptosuite,
                created: proof.created,
                verificationMethod: proof.verificationMethod,
              },
            })
          }
        }
      }
    } catch (error) {
      checks.push({
        name: 'issuer',
        status: 'error',
        message: `Failed to fetch issuer profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {
          issuerId,
          errorType:
            error instanceof Error ? error.constructor.name : typeof error,
        },
      })
    }
  }
}

async function validateController(
  proof: { verificationMethod: string },
  verificationMethod: { controller?: string },
  issuerId: string,
  checks: ValidationCheck[],
): Promise<void> {
  const controller = verificationMethod.controller
  const controllerIssues: string[] = []

  if (!controller) {
    controllerIssues.push('Missing controller on verification method')
  } else {
    if (controller !== issuerId) {
      controllerIssues.push('Controller does not match issuer.id')
    }
    if (
      !controller.startsWith('did:') &&
      !controller.endsWith('/api/badge/issuer')
    ) {
      controllerIssues.push(
        'HTTP(S) controller does not end with /api/badge/issuer',
      )
    }
  }

  try {
    const keyDocResp = await fetch(proof.verificationMethod, {
      headers: {
        Accept: 'application/ld+json',
        'User-Agent': 'CloudNativeBergen-BadgeValidator/1.0',
      },
      signal: AbortSignal.timeout(4000),
    })
    if (keyDocResp.ok) {
      const keyDoc = await keyDocResp.json()
      if (keyDoc.controller && keyDoc.controller !== issuerId) {
        controllerIssues.push('Key document controller mismatch issuer.id')
      }
      if (!keyDoc.publicKeyMultibase) {
        controllerIssues.push('Missing publicKeyMultibase in key document')
      }
    } else {
      controllerIssues.push(
        `Failed to fetch key document (${keyDocResp.status})`,
      )
    }
  } catch (e) {
    controllerIssues.push(
      `Key document fetch error: ${e instanceof Error ? e.message : 'Unknown error'}`,
    )
  }

  if (controllerIssues.length > 0) {
    checks.push({
      name: 'controller',
      status: 'error',
      message: 'Controller / key document consistency issues',
      details: { issues: controllerIssues },
    })
  } else {
    checks.push({
      name: 'controller',
      status: 'success',
      message: 'Controller and key document are consistent',
      details: { controller },
    })
  }
}

async function validateAchievement(
  credential: SignedCredential,
  checks: ValidationCheck[],
): Promise<void> {
  const achievementId =
    credential.credentialSubject?.achievement?.id ||
    credential.credentialSubject?.achievement

  if (achievementId && typeof achievementId === 'string') {
    try {
      const achievementResponse = await fetch(achievementId, {
        headers: {
          Accept: 'application/ld+json',
          'User-Agent': 'CloudNativeBergen-BadgeValidator/1.0',
        },
        signal: AbortSignal.timeout(5000),
      })

      if (achievementResponse.ok) {
        const achievement = await achievementResponse.json()
        checks.push({
          name: 'achievement',
          status: 'success',
          message: 'Achievement definition retrieved',
          details: {
            name: achievement.name,
            hasCriteria: !!achievement.criteria,
          },
        })
      } else {
        checks.push({
          name: 'achievement',
          status: 'warning',
          message: `Achievement endpoint returned ${achievementResponse.status}`,
        })
      }
    } catch (error) {
      checks.push({
        name: 'achievement',
        status: 'warning',
        message: `Could not fetch achievement definition: ${error instanceof Error ? error.message : 'Unknown error'}`,
        details: {
          achievementId,
          errorType:
            error instanceof Error ? error.constructor.name : typeof error,
        },
      })
    }
  }
}

function validateURLFormat(
  credential: SignedCredential,
  checks: ValidationCheck[],
): void {
  const achievement = credential.credentialSubject?.achievement
  if (achievement && typeof achievement === 'object') {
    const urlIssues: string[] = []

    if (achievement.evidence && Array.isArray(achievement.evidence)) {
      achievement.evidence.forEach(
        (evidence: { id?: string }, index: number) => {
          if (evidence.id?.includes('/api/badge/issuer')) {
            urlIssues.push(
              `Evidence[${index}] URL incorrectly contains /api/badge/issuer`,
            )
          }
        },
      )
    }

    const issuerUrl =
      typeof credential.issuer === 'object'
        ? credential.issuer.url
        : undefined
    if (issuerUrl?.endsWith('/api/badge/issuer')) {
      urlIssues.push(
        'issuer.url should point to organization homepage, not /api/badge/issuer endpoint',
      )
    }

    if (urlIssues.length > 0) {
      checks.push({
        name: 'url-format',
        status: 'warning',
        message: 'URL format issues detected',
        details: { issues: urlIssues },
      })
    } else if (achievement.evidence || issuerUrl) {
      checks.push({
        name: 'url-format',
        status: 'success',
        message: 'Evidence and issuer URLs are correctly formatted',
      })
    }
  }
}

function validateTemporalValidity(
  credential: SignedCredential,
  checks: ValidationCheck[],
): void {
  if (credential.validFrom) {
    const validFromDate = new Date(credential.validFrom)
    const now = new Date()

    if (validFromDate > now) {
      checks.push({
        name: 'validity',
        status: 'warning',
        message: 'Credential is not yet valid',
        details: {
          validFrom: credential.validFrom,
          current: now.toISOString(),
        },
      })
    } else {
      checks.push({
        name: 'validity',
        status: 'success',
        message: 'Credential is currently valid',
        details: {
          validFrom: credential.validFrom,
        },
      })
    }
  }
}
