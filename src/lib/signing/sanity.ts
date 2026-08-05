import type { ConferenceTheme } from '@/lib/branding/theme'
import { clientReadUncached } from '@/lib/sanity/client'

export interface SigningContractData {
  _id: string
  status?: string
  signatureStatus: string
  signatureId: string
  signerEmail: string
  contractStatus?: string
  contractSentAt?: string
  organizerSignedBy?: string
  organizerSignedAt?: string
  contractDocument?: {
    asset?: {
      url?: string
    }
  }
  sponsor?: {
    name?: string
  }
  tier?: {
    title?: string
  }
  conference?: {
    _id?: string
    title?: string
    startDate?: string
    city?: string
    organizer?: string
    sponsorEmail?: string
    domains?: string[]
    socialLinks?: string[]
    salesNotificationChannel?: string
    /**
     * The owning tenant. Required, not decorative: `resolveConferenceSlackToken`
     * keys the Slack bot token on it, and a projection that drops it resolves NO
     * token and silently stops the contract-signed Slack post.
     */
    organization?: { _ref?: string } | null
    /** Tenant brand theme — the contract-signed email is branded from it. */
    theme?: ConferenceTheme | null
  }
  contactPersons?: Array<{ name?: string; email?: string; isPrimary?: boolean }>
  contractValue?: number
  contractCurrency?: string
}

const SIGNING_CONTRACT_QUERY = `*[_type == "sponsorForConference" && signatureId == $signingToken][0]{
  _id,
  status,
  signatureStatus,
  signatureId,
  signerEmail,
  contractStatus,
  contractSentAt,
  organizerSignedBy,
  organizerSignedAt,
  contractDocument{
    asset->{
      url
    }
  },
  "sponsor": sponsor->{ name },
  "tier": tier->{ title },
  "conference": conference->{ _id, title, startDate, city, organizer, sponsorEmail, domains, socialLinks, salesNotificationChannel, organization, theme },
  contactPersons[]{ name, email, isPrimary },
  contractValue,
  contractCurrency
}`

export async function getSigningContract(
  token: string,
): Promise<SigningContractData | null> {
  return clientReadUncached.fetch<SigningContractData | null>(
    SIGNING_CONTRACT_QUERY,
    { signingToken: token },
  )
}
