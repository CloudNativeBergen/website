import { clientReadUncached } from '@/lib/sanity/client'

export interface SigningContractData {
  _id: string
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
  }
  contactPersons?: Array<{ name?: string; email?: string; isPrimary?: boolean }>
  contractValue?: number
  contractCurrency?: string
}

const SIGNING_CONTRACT_QUERY = `*[_type == "sponsorForConference" && signatureId == $signingToken][0]{
  _id,
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
  "conference": conference->{ _id, title, startDate, city, organizer, sponsorEmail, domains, socialLinks, salesNotificationChannel },
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
