import type {
  AdobeSignConfig,
  AccessToken,
  AgreementCreationResponse,
  AgreementDetails,
  CreateAgreementParams,
  ReminderResponse,
  TransientDocumentResponse,
} from './types'

const TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3'
const DEFAULT_BASE_URL = 'https://api.na1.adobesign.com/api/rest/v6'

let cachedToken: AccessToken | null = null

function getConfig(): AdobeSignConfig {
  const applicationId = process.env.ADOBE_SIGN_APPLICATION_ID
  const applicationSecret = process.env.ADOBE_SIGN_APPLICATION_SECRET

  if (!applicationId || !applicationSecret) {
    throw new Error(
      'Adobe Sign credentials not configured. ' +
        'Set ADOBE_SIGN_APPLICATION_ID and ADOBE_SIGN_APPLICATION_SECRET environment variables.',
    )
  }

  return {
    applicationId,
    applicationSecret,
    baseUrl: process.env.ADOBE_SIGN_BASE_URL || DEFAULT_BASE_URL,
  }
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }

  const config = getConfig()

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.applicationId,
      client_secret: config.applicationSecret,
      scope: 'agreement_read agreement_write agreement_send',
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Adobe Sign token request failed (${response.status}): ${body}`,
    )
  }

  const data = await response.json()

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  return cachedToken.token
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken()
  const config = getConfig()
  const url = `${config.baseUrl}${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
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
  pdf: Buffer,
  filename: string,
): Promise<TransientDocumentResponse> {
  const token = await getAccessToken()
  const config = getConfig()

  const formData = new FormData()
  formData.append('File-Name', filename)
  formData.append(
    'File',
    new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
    filename,
  )

  const response = await fetch(`${config.baseUrl}/transientDocuments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
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
  params: CreateAgreementParams,
): Promise<AgreementCreationResponse> {
  return apiRequest<AgreementCreationResponse>('/agreements', {
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
  agreementId: string,
): Promise<AgreementDetails> {
  return apiRequest<AgreementDetails>(`/agreements/${agreementId}`)
}

export async function downloadSignedDocument(
  agreementId: string,
): Promise<ArrayBuffer> {
  const token = await getAccessToken()
  const config = getConfig()

  const response = await fetch(
    `${config.baseUrl}/agreements/${agreementId}/combinedDocument`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Adobe Sign download failed (${response.status}): ${body}`)
  }

  return response.arrayBuffer()
}

export async function sendReminder(
  agreementId: string,
): Promise<ReminderResponse> {
  return apiRequest<ReminderResponse>(`/agreements/${agreementId}/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'ACTIVE',
    }),
  })
}

export async function cancelAgreement(agreementId: string): Promise<void> {
  await apiRequest(`/agreements/${agreementId}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: 'CANCELLED',
    }),
  })
}

export function clearTokenCache(): void {
  cachedToken = null
}
