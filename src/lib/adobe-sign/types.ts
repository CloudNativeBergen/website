export interface AdobeSignConfig {
  applicationId: string
  applicationSecret: string
  baseUrl: string
}

export interface AccessToken {
  token: string
  expiresAt: number
}

export interface AdobeSignAgreement {
  id: string
  name: string
  status: AgreementStatus
  createdDate?: string
  expirationTime?: string
}

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
  }
}

export type WebhookEventType =
  | 'AGREEMENT_WORKFLOW_COMPLETED'
  | 'AGREEMENT_RECALLED'
  | 'AGREEMENT_EXPIRED'
  | 'AGREEMENT_ACTION_COMPLETED'
  | 'AGREEMENT_ACTION_REQUESTED'
  | 'AGREEMENT_CREATED'
  | 'AGREEMENT_EMAILS_SENT'
