import type { AdobeSignSession } from './auth'
import type {
  AgreementCreationResponse,
  AgreementDetails,
  CreateAgreementParams,
  ReminderResponse,
  SigningUrlSetInfo,
  TransientDocumentResponse,
  WebhookCreationParams,
  WebhookCreationResponse,
} from './types'

function apiBase(session: AdobeSignSession): string {
  // apiAccessPoint already has trailing slash, e.g. "https://api.eu2.adobesign.com/"
  return `${session.apiAccessPoint}api/rest/v6`
}

async function apiRequest<T>(
  session: AdobeSignSession,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${apiBase(session)}${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Adobe Sign API error ${response.status} on ${path}: ${body}`,
    )
  }

  return response.json()
}

export async function uploadTransientDocument(
  session: AdobeSignSession,
  pdf: Buffer,
  filename: string,
): Promise<TransientDocumentResponse> {
  const formData = new FormData()
  formData.append('File-Name', filename)
  formData.append(
    'File',
    new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
    filename,
  )

  const url = `${apiBase(session)}/transientDocuments`
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.accessToken}` },
    body: formData,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Adobe Sign transient document upload failed (${response.status}): ${body}`,
    )
  }

  return response.json()
}

export async function createAgreement(
  session: AdobeSignSession,
  params: CreateAgreementParams,
): Promise<AgreementCreationResponse> {
  return apiRequest<AgreementCreationResponse>(session, '/agreements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: params.name,
      participantSetsInfo: [
        {
          memberInfos: [{ email: params.participantEmail }],
          order: 1,
          role: 'SIGNER',
        },
      ],
      signatureType: params.signatureType || 'ESIGN',
      state: params.state || 'IN_PROCESS',
      fileInfos: params.fileInfos,
      ...(params.message && { message: params.message }),
      ...(params.expirationTime && {
        expirationTime: params.expirationTime,
      }),
      ...(params.ccs && {
        ccs: params.ccs.map((cc) => ({
          email: cc.email,
          label: '',
        })),
      }),
    }),
  })
}

export async function getAgreement(
  session: AdobeSignSession,
  agreementId: string,
): Promise<AgreementDetails> {
  return apiRequest<AgreementDetails>(session, `/agreements/${agreementId}`)
}

export async function getSigningUrls(
  session: AdobeSignSession,
  agreementId: string,
): Promise<SigningUrlSetInfo> {
  return apiRequest<SigningUrlSetInfo>(
    session,
    `/agreements/${agreementId}/signingUrls`,
  )
}

export async function registerWebhook(
  session: AdobeSignSession,
  params: WebhookCreationParams,
): Promise<WebhookCreationResponse> {
  return apiRequest<WebhookCreationResponse>(session, '/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

export async function sendReminder(
  session: AdobeSignSession,
  agreementId: string,
): Promise<ReminderResponse> {
  return apiRequest<ReminderResponse>(
    session,
    `/agreements/${agreementId}/reminders`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ACTIVE',
      }),
    },
  )
}

export async function cancelAgreement(
  session: AdobeSignSession,
  agreementId: string,
): Promise<void> {
  await apiRequest(session, `/agreements/${agreementId}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: 'CANCELLED',
    }),
  })
}
