import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import { VolunteerApprovalTemplate } from './VolunteerApprovalTemplate'

describe('VolunteerApprovalTemplate', () => {
  const baseProps = {
    volunteerName: 'Ada Lovelace',
    eventName: 'Cloud Native Days Bergen',
    eventLocation: 'Bergen, Norway',
    eventDate: 'October 28, 2026',
    eventUrl: 'https://cloudnativebergen.dev',
    message: 'Welcome to the team! We are thrilled to have you.',
    socialLinks: ['https://x.com/cndbergen'],
  }

  it('renders base message without ticket or slack sections when omitted', async () => {
    const html = await render(<VolunteerApprovalTemplate {...baseProps} />)

    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Cloud Native Days Bergen')
    expect(html).toContain('Welcome to the team!')
    expect(html).not.toContain('Volunteer Ticket Registration')
    expect(html).not.toContain('Join Our Slack Community')
  })

  it('renders volunteer ticket registration section when registrationUrl is provided', async () => {
    const html = await render(
      <VolunteerApprovalTemplate
        {...baseProps}
        registrationUrl="https://tickets.example.test/volunteer-signup"
      />,
    )

    expect(html).toContain('Volunteer Ticket Registration')
    expect(html).toContain('https://tickets.example.test/volunteer-signup')
    expect(html).toContain('Claim Your Volunteer Ticket')
    expect(html).not.toContain('Join Our Slack Community')
  })

  it('renders Slack invitation section when slackInviteUrl is provided', async () => {
    const html = await render(
      <VolunteerApprovalTemplate
        {...baseProps}
        slackInviteUrl="https://slack.example.test/volunteer-invite"
      />,
    )

    expect(html).toContain('Join Our Slack Community')
    expect(html).toContain('https://slack.example.test/volunteer-invite')
    expect(html).toContain('Join Volunteer Slack')
    expect(html).not.toContain('Volunteer Ticket Registration')
  })

  it('renders both ticket registration and Slack sections when both are provided', async () => {
    const html = await render(
      <VolunteerApprovalTemplate
        {...baseProps}
        registrationUrl="https://tickets.example.test/volunteer-signup"
        slackInviteUrl="https://slack.example.test/volunteer-invite"
      />,
    )

    expect(html).toContain('Volunteer Ticket Registration')
    expect(html).toContain('https://tickets.example.test/volunteer-signup')
    expect(html).toContain('Join Our Slack Community')
    expect(html).toContain('https://slack.example.test/volunteer-invite')
  })

  it('applies brand color to accents and links when provided', async () => {
    const html = await render(
      <VolunteerApprovalTemplate
        {...baseProps}
        brandColor="#9333EA"
        registrationUrl="https://tickets.example.test/volunteer-signup"
      />,
    )

    expect(html).toContain('#9333EA')
  })
})
