import { NextRequest, NextResponse } from 'next/server'
import { clientWrite } from '@/lib/sanity/client'
import { getCurrentDateTime } from '@/lib/time'
import type { WebhookEvent } from '@/lib/adobe-sign'

const SYSTEM_USER_ID = 'system'

function getExpectedClientId(): string | undefined {
  return process.env.ADOBE_SIGN_CLIENT_ID
}

function clientIdResponse(clientId: string): NextResponse {
  return NextResponse.json(
    { xAdobeSignClientId: clientId },
    { headers: { 'X-AdobeSign-ClientId': clientId } },
  )
}

function validateClientId(request: NextRequest): string | null {
  const clientId = request.headers.get('X-AdobeSign-ClientId')
  const expected = getExpectedClientId()

  if (!clientId) {
    console.error(
      '[Adobe Sign webhook] Missing X-AdobeSign-ClientId header. Headers:',
      Object.fromEntries(request.headers.entries()),
    )
    return null
  }

  if (!expected) {
    console.error(
      '[Adobe Sign webhook] ADOBE_SIGN_CLIENT_ID env var is not set',
    )
    return null
  }

  if (clientId !== expected) {
    console.error(
      `[Adobe Sign webhook] Client ID mismatch: received=${clientId}, expected=${expected}`,
    )
    return null
  }

  return clientId
}

async function findSponsorByAgreementId(
  agreementId: string,
): Promise<{ _id: string; signatureStatus: string } | null> {
  const result = await clientWrite.fetch(
    `*[_type == "sponsorForConference" && signatureId == $agreementId][0]{ _id, signatureStatus }`,
    { agreementId },
  )
  return result
}

// GET: Adobe Sign webhook URL verification (registration & activation)
// Adobe Sign sends a GET with X-AdobeSign-ClientId header.
// We must respond 2XX and echo the client ID back in either:
//   - the X-AdobeSign-ClientId response header, OR
//   - a JSON body with key xAdobeSignClientId
// See: https://helpx.adobe.com/sign/integrations/api-webhooks.html
export async function GET(request: NextRequest) {
  console.log(
    '[Adobe Sign webhook] GET verification request from',
    request.nextUrl.toString(),
  )

  const clientId = validateClientId(request)
  if (!clientId) {
    console.error(
      '[Adobe Sign webhook] GET verification failed: invalid client ID',
    )
    return NextResponse.json({ error: 'Invalid client ID' }, { status: 401 })
  }

  console.log(
    '[Adobe Sign webhook] GET verification succeeded, echoing client ID',
  )
  return clientIdResponse(clientId)
}

// POST: Handle Adobe Sign webhook notification events
// Every notification also includes X-AdobeSign-ClientId and must be echoed back.
export async function POST(request: NextRequest) {
  console.log('[Adobe Sign webhook] POST notification received')

  const clientId = validateClientId(request)
  if (!clientId) {
    console.error('[Adobe Sign webhook] POST rejected: invalid client ID')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let event: WebhookEvent
  try {
    event = await request.json()
  } catch (parseError) {
    console.error('[Adobe Sign webhook] Failed to parse JSON body:', parseError)
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400, headers: { 'X-AdobeSign-ClientId': clientId } },
    )
  }

  console.log(
    '[Adobe Sign webhook] Event: %s, Agreement: %s, WebhookId: %s',
    event.event,
    event.agreement?.id ?? 'none',
    event.webhookId ?? 'unknown',
  )

  const agreementId = event.agreement?.id
  if (!agreementId) {
    console.log('[Adobe Sign webhook] No agreement ID in event, acknowledging')
    return clientIdResponse(clientId)
  }

  try {
    const sfc = await findSponsorByAgreementId(agreementId)
    if (!sfc) {
      console.warn(
        `[Adobe Sign webhook] No sponsorForConference found with signatureId=${agreementId}`,
      )
      return clientIdResponse(clientId)
    }

    console.log(
      '[Adobe Sign webhook] Matched sponsor %s (current signatureStatus=%s)',
      sfc._id,
      sfc.signatureStatus,
    )

    switch (event.event) {
      case 'AGREEMENT_WORKFLOW_COMPLETED': {
        const updateFields: Record<string, unknown> = {
          signatureStatus: 'signed',
          contractStatus: 'contract-signed',
          contractSignedAt: getCurrentDateTime(),
        }

        // Extract signed document from webhook payload if available
        const docInfo = event.agreement?.signedDocumentInfo
        if (docInfo?.document) {
          try {
            const pdfBuffer = Buffer.from(docInfo.document, 'base64')
            const filename =
              docInfo.name || `signed-contract-${agreementId}.pdf`
            const asset = await clientWrite.assets.upload('file', pdfBuffer, {
              filename,
              contentType: docInfo.mimeType || 'application/pdf',
            })
            updateFields.contractDocument = {
              _type: 'file',
              asset: { _type: 'reference', _ref: asset._id },
            }
          } catch (docError) {
            console.error(
              '[Adobe Sign webhook] Failed to store signed PDF from payload:',
              docError,
            )
          }
        } else if (
          event.conditionalParametersTrimmed?.includes(
            'agreement.signedDocumentInfo',
          )
        ) {
          console.warn(
            '[Adobe Sign webhook] Signed document trimmed from payload (size limit exceeded) for agreement %s — document must be fetched manually',
            agreementId,
          )
        } else {
          console.warn(
            '[Adobe Sign webhook] No inline signed document in payload for agreement %s',
            agreementId,
          )
        }

        await clientWrite.patch(sfc._id).set(updateFields).commit()
        console.log(
          '[Adobe Sign webhook] Updated %s to signed (contractDocument=%s)',
          sfc._id,
          updateFields.contractDocument ? 'attached' : 'not attached',
        )
        await logActivity(sfc._id, sfc.signatureStatus, 'signed')
        break
      }

      case 'AGREEMENT_RECALLED':
      case 'AGREEMENT_EXPIRED': {
        const newStatus =
          event.event === 'AGREEMENT_EXPIRED' ? 'expired' : 'rejected'
        await clientWrite
          .patch(sfc._id)
          .set({ signatureStatus: newStatus })
          .commit()
        console.log(
          '[Adobe Sign webhook] Updated %s signatureStatus to %s',
          sfc._id,
          newStatus,
        )
        await logActivity(sfc._id, sfc.signatureStatus, newStatus)
        break
      }

      default:
        console.log(
          '[Adobe Sign webhook] Unhandled event type: %s',
          event.event,
        )
        break
    }
  } catch (error) {
    console.error('Adobe Sign webhook processing error:', error)
    return NextResponse.json(
      { error: 'Internal error' },
      {
        status: 500,
        headers: { 'X-AdobeSign-ClientId': clientId },
      },
    )
  }

  return clientIdResponse(clientId)
}

async function logActivity(
  sfcId: string,
  oldStatus: string | undefined,
  newStatus: string,
) {
  try {
    await clientWrite.create({
      _type: 'sponsorActivity',
      sponsorForConference: { _type: 'reference', _ref: sfcId },
      activityType: 'signature_status_change',
      description: `Signature status changed from ${oldStatus || 'not-started'} to ${newStatus} (via Adobe Sign webhook)`,
      metadata: {
        oldValue: oldStatus || 'not-started',
        newValue: newStatus,
        timestamp: getCurrentDateTime(),
      },
      createdBy: { _type: 'reference', _ref: SYSTEM_USER_ID },
      createdAt: getCurrentDateTime(),
    })
  } catch (logError) {
    console.error('Failed to log webhook activity:', logError)
  }
}
