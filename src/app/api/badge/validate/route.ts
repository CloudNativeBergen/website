/**
 * Badge Validation API
 *
 * Server-side validation of OpenBadges 3.0 credentials to avoid CORS issues
 */

import { NextRequest, NextResponse } from 'next/server'
import { extractBadge } from '@/lib/openbadges'
import type { SignedCredential } from '@/lib/openbadges/types'

export const runtime = 'nodejs'

interface ValidationCheck {
  name: string
  status: 'success' | 'warning' | 'error'
  message: string
  details?: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { svg } = body

    if (!svg || typeof svg !== 'string') {
      return NextResponse.json(
        { error: 'SVG content is required' },
        { status: 400 },
      )
    }

    const checks: ValidationCheck[] = []

    // Step 1: Extract credential from SVG
    let credential: SignedCredential
    try {
      credential = extractBadge(svg)
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
        },
      })
    } catch (error) {
      checks.push({
        name: 'extraction',
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to extract credential',
      })
      return NextResponse.json({ checks, credential: null })
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

    if (!credential.proof || credential.proof.length === 0) {
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

    // Step 3: Fetch and validate issuer profile (server-side to avoid CORS)
    if (issuerId) {
      try {
        const issuerResponse = await fetch(issuerId, {
          headers: {
            Accept: 'application/ld+json',
            'User-Agent': 'CloudNativeBergen-BadgeValidator/1.0',
          },
          // Add timeout
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

          // Step 4: Verify proof using issuer's verification method
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
              // Controller consistency: issuer.id must match verificationMethod.controller
              const controller = (verificationMethod as { controller?: string })
                .controller
              const controllerIssues: string[] = []
              if (!controller) {
                controllerIssues.push(
                  'Missing controller on verification method',
                )
              } else {
                if (issuerId && controller !== issuerId) {
                  controllerIssues.push('Controller does not match issuer.id')
                }
                if (!controller.endsWith('/api/badge/issuer')) {
                  controllerIssues.push(
                    'Controller does not end with /api/badge/issuer',
                  )
                }
              }

              // Optionally fetch key document to confirm controller alignment
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
                  if (
                    keyDoc.controller &&
                    issuerId &&
                    keyDoc.controller !== issuerId
                  ) {
                    controllerIssues.push(
                      'Key document controller mismatch issuer.id',
                    )
                  }
                  if (!keyDoc.publicKeyMultibase) {
                    controllerIssues.push(
                      'Missing publicKeyMultibase in key document',
                    )
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

              checks.push({
                name: 'proof',
                status: 'success',
                message: `Proof validation passed (${proof.cryptosuite})`,
                details: {
                  cryptosuite: proof.cryptosuite,
                  created: proof.created,
                  verificationMethod: proof.verificationMethod,
                  controllerMatch: controllerIssues.length === 0,
                },
              })
            }
          }
        }
      } catch (error) {
        console.error('[Badge Validator] Failed to fetch issuer profile:', {
          issuerId,
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
        })
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

    // Step 5: Check achievement endpoint (if available)
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
        console.error(
          '[Badge Validator] Failed to fetch achievement definition:',
          {
            achievementId,
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined,
          },
        )
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

    // Step 6: Check temporal validity
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

    return NextResponse.json({
      checks,
      credential,
    })
  } catch (error) {
    console.error('Validation error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Validation failed',
      },
      { status: 500 },
    )
  }
}
