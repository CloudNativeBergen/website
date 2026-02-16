/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any

import {
  ContractFlowStep,
  type ContractFlowStepStatus,
} from '@/components/admin/sponsor-crm/ContractFlowStep'

describe('ContractFlowStep', () => {
  const renderStep = (
    status: ContractFlowStepStatus,
    opts?: { step?: number; isLast?: boolean },
  ) =>
    render(
      <ContractFlowStep
        step={opts?.step ?? 1}
        title="Registration"
        status={status}
        isLast={opts?.isLast}
      >
        <p>Step content</p>
      </ContractFlowStep>,
    )

  it('renders step number and title', () => {
    renderStep('pending', { step: 2 })
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Registration')).toBeInTheDocument()
    expect(screen.getByText('Step content')).toBeInTheDocument()
  })

  it('shows check icon when complete', () => {
    const { container } = renderStep('complete')
    // Complete state shows an SVG check icon instead of the step number
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  it('shows step number when pending', () => {
    renderStep('pending')
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows step number when active', () => {
    renderStep('active')
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders connector line when not last', () => {
    const { container } = renderStep('pending', { isLast: false })
    // The connector div has absolute positioning with bottom style
    const connector = container.querySelector('[style*="bottom"]')
    expect(connector).toBeTruthy()
  })

  it('omits connector line when last', () => {
    const { container } = renderStep('pending', { isLast: true })
    const connector = container.querySelector('[style*="bottom"]')
    expect(connector).toBeNull()
  })
})
