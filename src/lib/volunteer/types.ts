export enum VolunteerStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum Occupation {
  STUDENT = 'student',
  WORKING = 'working',
  UNEMPLOYED = 'unemployed',
  OTHER = 'other',
}

export enum TShirtSize {
  XS = 'XS',
  S = 'S',
  M = 'M',
  L = 'L',
  XL = 'XL',
  XXL = 'XXL',
}

export interface ConsentRecord {
  granted: boolean
  grantedAt?: string
  ipAddress?: string
}

export interface VolunteerConsent {
  dataProcessing?: ConsentRecord
  privacyPolicyVersion?: string
}

export interface VolunteerInput {
  name: string
  email: string
  phone: string
  occupation: Occupation
  availability?: string
  preferredTasks?: string[]
  tshirtSize?: TShirtSize
  dietaryRestrictions?: string
  otherInfo?: string
  conference: {
    _type: 'reference'
    _ref: string
  }
  consent?: VolunteerConsent
}

export interface Volunteer extends VolunteerInput {
  _id: string
  _rev: string
  _createdAt: string
  _updatedAt: string
  status: VolunteerStatus
  submittedAt?: string
  reviewedAt?: string
  reviewedBy?: {
    _type: 'reference'
    _ref: string
  }
  reviewNotes?: string
}

export interface VolunteerWithConference extends Omit<
  Volunteer,
  'conference' | 'reviewedBy'
> {
  conference: {
    _id: string
    title: string
    contact_email?: string
    cfp_email?: string
    city?: string
    country?: string
    start_date?: string
    domains?: string[]
    organizer?: string
    social_links?: Array<{
      platform: string
      url: string
    }>
  }
  reviewedBy?: {
    _id: string
    name: string
  }
}
