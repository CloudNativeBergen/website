export type AgreementStatus =
  | 'OUT_FOR_SIGNATURE'
  | 'SIGNED'
  | 'APPROVED'
  | 'DELIVERED'
  | 'ACCEPTED'
  | 'FORM_FILLED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'OUT_FOR_APPROVAL'
  | 'AUTHORING'
  | 'DRAFT'

export interface CreateAgreementParams {
  name: string
  participantEmail: string
  message?: string
  fileInfos: Array<{ transientDocumentId: string }>
  signatureType?: 'ESIGN' | 'WRITTEN'
  expirationTime?: string
  state?: 'IN_PROCESS' | 'DRAFT'
  ccs?: Array<{ email: string }>
}

export interface AgreementCreationResponse {
  id: string
}

export interface TransientDocumentResponse {
  transientDocumentId: string
}

export interface AgreementDetails {
  id: string
  name: string
  status: AgreementStatus
  createdDate: string
  expirationTime?: string
  participantSetsInfo?: {
    participantSets: Array<{
      memberInfos: Array<{
        email: string
        name?: string
      }>
      role: string
      status: string
    }>
  }
}

export interface ReminderResponse {
  id: string
  status: string
}

export interface SigningUrlSetInfo {
  signingUrls: Array<{
    email: string
    esignUrl: string
  }>
}

export interface WebhookDocumentInfo {
  document?: string // base64-encoded signed PDF
  mimeType?: string
  name?: string
}

export interface WebhookEvent {
  webhookId: string
  webhookName: string
  webhookNotificationId: string
  webhookUrlInfo: {
    url: string
  }
  webhookScope: string
  event: string
  subEvent?: string
  eventDate: string
  eventResourceType: string
  eventResourceParentType: string
  agreement?: {
    id: string
    name: string
    status: AgreementStatus
    signedDocumentInfo?: WebhookDocumentInfo
  }
}
