/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

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

  it('renders step number, title, and children', () => {
    renderStep('pending', { step: 2 })
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Registration')).toBeInTheDocument()
    expect(screen.getByText('Step content')).toBeInTheDocument()
  })

  it('shows check icon instead of number when complete', () => {
    renderStep('complete')
    // Complete state replaces the step number with a CheckIcon SVG
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
})
