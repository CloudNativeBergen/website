import type { ConferenceTheme } from '@/lib/branding/theme'
import { clientReadUncached } from '@/lib/sanity/client'
import { mergeConference } from '@/lib/conference/merge'
import type { ContractStatus, SponsorStatus } from '@/lib/sponsor-crm/types'

export interface SigningContractData {
  _id: string
  /**
   * Read alongside the status so `signing.submitSignature` can make its
   * status check binding with `ifRevisionId` — see the patch there.
   */
  _rev?: string
  status?: SponsorStatus
  signatureStatus: string
  signatureId: string
  signerEmail: string
  contractStatus?: ContractStatus
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

// groq-global: the signing token is an unguessable bearer capability for one
// contract and the only key the public signing page has; the deal's own
// conference is resolved from the match.
const SIGNING_CONTRACT_QUERY = `*[_type == "sponsorForConference" && signatureId == $signingToken][0]{
  _id,
  _rev,
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
  const contract = await clientReadUncached.fetch<SigningContractData | null>(
    SIGNING_CONTRACT_QUERY,
    { signingToken: token },
  )
  if (!contract) return null
  if (contract.conference?._id) {
    const conf = contract.conference
    const candidate = {
      ...conf,
      _id: conf._id as string,
      domains: conf.domains,
      organization: conf.organization?._ref
        ? { _ref: conf.organization._ref }
        : null,
    }
    const merged = await mergeConference(candidate)
    contract.conference = {
      ...conf,
      ...merged,
      domains: merged.domains ? [...merged.domains] : undefined,
    }
  }
  return contract
}
