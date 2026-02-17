import {
  RegistrationTokenSchema,
  RegistrationContactPersonSchema,
  RegistrationBillingSchema,
  RegistrationSubmissionSchema,
  GenerateRegistrationTokenSchema,
} from '@/server/schemas/registration'

describe('RegistrationTokenSchema', () => {
  it('passes with valid UUID', () => {
    const result = RegistrationTokenSchema.safeParse({
      token: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    })
    expect(result.success).toBe(true)
  })

  it('fails with non-UUID string', () => {
    const result = RegistrationTokenSchema.safeParse({
      token: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('fails without token', () => {
    const result = RegistrationTokenSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('fails with empty string', () => {
    const result = RegistrationTokenSchema.safeParse({ token: '' })
    expect(result.success).toBe(false)
  })
})

describe('RegistrationContactPersonSchema', () => {
  it('passes with name and email', () => {
    const result = RegistrationContactPersonSchema.safeParse({
      name: 'John Doe',
      email: 'john@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('passes with all optional fields', () => {
    const result = RegistrationContactPersonSchema.safeParse({
      _key: 'key-1',
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '+47 12 34 56 78',
      role: 'CTO',
      isPrimary: true,
    })
    expect(result.success).toBe(true)
  })

  it('fails with empty name', () => {
    const result = RegistrationContactPersonSchema.safeParse({
      name: '',
      email: 'john@example.com',
    })
    expect(result.success).toBe(false)
  })

  it('fails with invalid email', () => {
    const result = RegistrationContactPersonSchema.safeParse({
      name: 'John',
      email: 'not-email',
    })
    expect(result.success).toBe(false)
  })

  it('fails without name', () => {
    const result = RegistrationContactPersonSchema.safeParse({
      email: 'john@example.com',
    })
    expect(result.success).toBe(false)
  })

  it('fails without email', () => {
    const result = RegistrationContactPersonSchema.safeParse({
      name: 'John',
    })
    expect(result.success).toBe(false)
  })

  it('generates a unique _key when not provided', () => {
    const result = RegistrationContactPersonSchema.safeParse({
      name: 'John',
      email: 'john@example.com',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data._key).toMatch(/^cp-\d+-[0-9a-f]+$/)
    }
  })
})

describe('RegistrationBillingSchema', () => {
  it('passes with valid billing email', () => {
    const result = RegistrationBillingSchema.safeParse({
      email: 'billing@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('passes with all optional fields', () => {
    const result = RegistrationBillingSchema.safeParse({
      email: 'billing@example.com',
      reference: 'PO-2026-001',
      comments: 'Invoice quarterly',
    })
    expect(result.success).toBe(true)
  })

  it('fails with invalid billing email', () => {
    const result = RegistrationBillingSchema.safeParse({
      email: 'not-email',
    })
    expect(result.success).toBe(false)
  })

  it('fails without email', () => {
    const result = RegistrationBillingSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('RegistrationSubmissionSchema', () => {
  const validSubmission = {
    token: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    contactPersons: [
      {
        name: 'John Doe',
        email: 'john@example.com',
      },
    ],
    billing: {
      email: 'billing@example.com',
    },
    logo: '<svg>logo</svg>',
    address: 'Test Street 1, Oslo',
  }

  it('passes with minimal valid submission', () => {
    const result = RegistrationSubmissionSchema.safeParse(validSubmission)
    expect(result.success).toBe(true)
  })

  it('passes with all optional fields', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      ...validSubmission,
      logoBright: '<svg>bright</svg>',
      orgNumber: '123456789',
      signerEmail: 'signer@example.com',
    })
    expect(result.success).toBe(true)
  })

  it('fails without address', () => {
    const { address: _, ...withoutAddress } = validSubmission
    const result = RegistrationSubmissionSchema.safeParse(withoutAddress)
    expect(result.success).toBe(false)
  })

  it('fails with empty address', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      ...validSubmission,
      address: '',
    })
    expect(result.success).toBe(false)
  })

  it('fails without logo', () => {
    const { logo: _, ...withoutLogo } = validSubmission
    const result = RegistrationSubmissionSchema.safeParse(withoutLogo)
    expect(result.success).toBe(false)
  })

  it('fails with empty logo', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      ...validSubmission,
      logo: '',
    })
    expect(result.success).toBe(false)
  })

  it('fails with invalid token', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      ...validSubmission,
      token: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('fails without token', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      contactPersons: validSubmission.contactPersons,
      billing: validSubmission.billing,
    })
    expect(result.success).toBe(false)
  })

  it('fails with empty contactPersons array', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      ...validSubmission,
      contactPersons: [],
    })
    expect(result.success).toBe(false)
  })

  it('fails without contactPersons', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      token: validSubmission.token,
      billing: validSubmission.billing,
    })
    expect(result.success).toBe(false)
  })

  it('fails without billing', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      token: validSubmission.token,
      contactPersons: validSubmission.contactPersons,
    })
    expect(result.success).toBe(false)
  })

  it('fails with invalid signerEmail', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      ...validSubmission,
      signerEmail: 'not-email',
    })
    expect(result.success).toBe(false)
  })

  it('validates nested contact person', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      ...validSubmission,
      contactPersons: [{ name: '', email: 'bad-email' }],
    })
    expect(result.success).toBe(false)
  })

  it('validates nested billing', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      ...validSubmission,
      billing: { email: 'bad-email' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts multiple contact persons', () => {
    const result = RegistrationSubmissionSchema.safeParse({
      ...validSubmission,
      contactPersons: [
        { name: 'John', email: 'john@example.com', isPrimary: true },
        { name: 'Jane', email: 'jane@example.com' },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('GenerateRegistrationTokenSchema', () => {
  it('passes with valid sponsorForConferenceId', () => {
    const result = GenerateRegistrationTokenSchema.safeParse({
      sponsorForConferenceId: 'sfc-123',
    })
    expect(result.success).toBe(true)
  })

  it('fails with empty sponsorForConferenceId', () => {
    const result = GenerateRegistrationTokenSchema.safeParse({
      sponsorForConferenceId: '',
    })
    expect(result.success).toBe(false)
  })

  it('fails without sponsorForConferenceId', () => {
    const result = GenerateRegistrationTokenSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
