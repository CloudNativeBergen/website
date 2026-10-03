// Granular GROQ queries for the decoupled Sponsor CRM dashboard

export const SPONSOR_OVERVIEW_FIELDS = `
  _id,
  _createdAt,
  _updatedAt,
  conference { _ref },
  sponsor->{
    _id,
    name,
    website,
    logo,
    logoBright,
    orgNumber,
    address,
    linkedinUrl,
    blueskyHandle
  },
  tier->{
    _id,
    title,
    tagline,
    tierType,
    price[]{
      _key,
      amount,
      currency
    },
    ticketEntitlement
  },
  addons[]->{
    _id,
    title,
    tierType,
    price[]{
      _key,
      amount,
      currency
    }
  },
  status,
  contractStatus,
  invoiceStatus,
  assignedTo->{
    _id,
    name,
    email,
    image
  },
  contractValue,
  contractCurrency,
  tags,
  nextFollowUpAt,
  outreachCount
`

export const SPONSOR_CONTACTS_FIELDS = `
  _id,
  _createdAt,
  _updatedAt,
  conference { _ref },
  contactPersons,
  billing
`

export const SPONSOR_CONTRACT_FIELDS = `
  _id,
  _createdAt,
  _updatedAt,
  conference { _ref },
  contractStatus,
  signatureStatus,
  signatureId,
  signerName,
  signerEmail,
  signingUrl,
  contractSentAt,
  contractDocument{
    asset->{
      _ref,
      url
    }
  },
  reminderCount,
  contractTemplate->{
    _id,
    title
  },
  contractSignedAt,
  organizerSignedAt,
  organizerSignedBy
`
