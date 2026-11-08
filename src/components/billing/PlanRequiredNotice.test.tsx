/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlanRequiredNotice } from './PlanRequiredNotice'
import { clientPlanRequired } from '@/lib/trpc/errors'

const refusal = (data: Record<string, unknown>) => ({ message: 'x', data })

describe('PlanRequiredNotice (#2129)', () => {
  it('maps a PLAN_REQUIRED error to the notice, with plan and billing link', () => {
    const plan = clientPlanRequired(
      refusal({
        code: 'FORBIDDEN',
        reason: 'PLAN_REQUIRED',
        requiredPlan: 'pro',
        orgId: 'org_1',
        isOwner: true,
      }),
    )
    render(<PlanRequiredNotice {...plan!} />)
    expect(screen.getByText('This needs the Pro plan')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Upgrade' }).getAttribute('href'),
    ).toBe('https://my.konf.app/orgs/org_1/billing')
  })

  it('tells a non-owner to ask an owner', () => {
    render(
      <PlanRequiredNotice requiredPlan="basic" orgId="org_1" isOwner={false} />,
    )
    expect(screen.getByText('This needs the Basic plan')).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: 'Ask an owner to upgrade' })
        .getAttribute('href'),
    ).toBe('https://my.konf.app/orgs/org_1/billing')
    expect(screen.queryByRole('link', { name: 'Upgrade' })).toBeNull()
  })

  it.each([
    { code: 'FORBIDDEN' },
    { code: 'FORBIDDEN', reason: 'PLAN_REQUIRED' },
    { code: 'FORBIDDEN', reason: 'OTHER', requiredPlan: 'basic' },
  ])('ignores %j', (data) => {
    expect(clientPlanRequired(refusal(data))).toBeNull()
  })
})
