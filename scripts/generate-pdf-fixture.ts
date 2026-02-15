/**
 * Generates a contract PDF test fixture using @react-pdf/renderer.
 *
 * Run with: pnpm tsx scripts/generate-pdf-fixture.ts
 *
 * Outputs to: __tests__/testdata/contract-fixture.pdf
 * This file is used by the signature smoke tests to validate
 * marker detection and signature placement against real
 * @react-pdf/renderer output.
 */

import { writeFileSync } from 'fs'
import { resolve } from 'path'
import { generateContractPdf } from '../src/lib/sponsor-crm/contract-pdf'
import type { ContractTemplate } from '../src/lib/sponsor-crm/contract-templates'
import type { ContractVariableContext } from '../src/lib/sponsor-crm/contract-variables'

const template: ContractTemplate = {
  _id: 'tmpl-fixture',
  _createdAt: '2026-01-01T00:00:00Z',
  _updatedAt: '2026-01-01T00:00:00Z',
  title: 'Partnership Agreement — {{SPONSOR_NAME}}',
  conference: { _id: 'conf-1', title: 'CloudNative Day 2026' },
  language: 'en',
  sections: [
    {
      _key: 'sec1',
      heading: 'Scope of Agreement',
      body: [
        {
          _type: 'block',
          _key: 'b1',
          style: 'normal',
          children: [
            {
              _type: 'span',
              _key: 's1',
              text: 'This agreement establishes the partnership between {{ORG_NAME}} and {{SPONSOR_NAME}} for {{CONFERENCE_TITLE}}.',
              marks: [],
            },
          ],
        },
      ],
    },
    {
      _key: 'sec2',
      heading: 'Obligations',
      body: [
        {
          _type: 'block',
          _key: 'b2',
          style: 'normal',
          children: [
            {
              _type: 'span',
              _key: 's2',
              text: 'The partner agrees to provide sponsorship at the {{TIER_NAME}} level for a total of {{CONTRACT_VALUE}}.',
              marks: [],
            },
          ],
        },
      ],
    },
  ],
  terms: [
    {
      _type: 'block',
      _key: 't1',
      style: 'h3',
      children: [
        {
          _type: 'span',
          _key: 'ts1',
          text: '1. General Terms',
          marks: [],
        },
      ],
    },
    {
      _type: 'block',
      _key: 't2',
      style: 'normal',
      children: [
        {
          _type: 'span',
          _key: 'ts2',
          text: 'Standard terms and conditions apply to this partnership agreement.',
          marks: [],
        },
      ],
    },
  ],
  isDefault: true,
  isActive: true,
}

const context: ContractVariableContext = {
  sponsor: {
    name: 'Acme Corp',
    orgNumber: '987654321',
    address: 'Innovation Street 42, 5020 Bergen',
    website: 'https://acme.example.com',
  },
  contactPerson: { name: 'Jane Doe', email: 'jane@acme.com' },
  tier: { title: 'Gold', tagline: 'Premium partnership' },
  addons: [{ title: 'Workshop slot' }, { title: 'Logo on lanyard' }],
  contractValue: 50000,
  contractCurrency: 'NOK',
  conference: {
    title: 'CloudNative Day 2026',
    startDate: '2026-06-10',
    endDate: '2026-06-11',
    city: 'Bergen',
    organizer: 'Cloud Native Bergen',
    organizerOrgNumber: '123456789',
    organizerAddress: 'Bergen, Norway',
    venueName: 'Grieghallen',
    venueAddress: 'Edvard Griegs plass 1, 5015 Bergen',
    sponsorEmail: 'sponsors@cloudnative.no',
  },
}

async function main() {
  const pdf = await generateContractPdf(template, context)
  const outPath = resolve(
    __dirname,
    '../__tests__/testdata/contract-fixture.pdf',
  )
  writeFileSync(outPath, pdf)
  console.log(`Wrote ${pdf.length} bytes to ${outPath}`)
}

main().catch((err) => {
  console.error('Failed to generate fixture:', err)
  process.exit(1)
})
