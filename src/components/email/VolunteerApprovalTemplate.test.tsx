import { describe, it, expect } from 'vitest'
import { render } from '@react-email/render'
import {
  VolunteerApprovalTemplate,
  VolunteerMessageTemplate,
} from './VolunteerApprovalTemplate'

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

  it('renders attendance confirmation CTA when confirmUrl is provided', async () => {
    const html = await render(
      <VolunteerApprovalTemplate
        {...baseProps}
        confirmUrl="https://cloudnativebergen.dev/volunteer/confirm?token=abc.123"
      />,
    )

    expect(html).toContain('Action Required: Confirm Your Attendance')
    expect(html).toContain('Confirm Your Attendance')
    expect(html).toContain(
      'https://cloudnativebergen.dev/volunteer/confirm?token=abc.123',
    )
  })

  it('renders PortableText JSON messages as formatted HTML with links and bold text', async () => {
    const portableMessage = JSON.stringify([
      {
        _type: 'block',
        _key: 'b1',
        style: 'normal',
        markDefs: [
          {
            _key: 'm1',
            _type: 'link',
            href: 'https://cloudnativebergen.dev/handbook',
          },
        ],
        children: [
          {
            _type: 'span',
            _key: 's1',
            text: 'Please read our ',
            marks: [],
          },
          {
            _type: 'span',
            _key: 's2',
            text: 'volunteer handbook',
            marks: ['strong', 'm1'],
          },
          {
            _type: 'span',
            _key: 's3',
            text: ' before arriving.',
            marks: [],
          },
        ],
      },
    ])

    const html = await render(
      <VolunteerApprovalTemplate
        {...baseProps}
        message={portableMessage}
        brandColor="#9333EA"
      />,
    )

    expect(html).not.toContain('"_type":"block"')
    expect(html).toContain('Please read our ')
    expect(html).toContain('https://cloudnativebergen.dev/handbook')
    expect(html).toContain('<strong>')
    expect(html).toContain('volunteer handbook')
  })
})

describe('VolunteerMessageTemplate', () => {
  it('sends the message once greeted, without approval wording', async () => {
    const html = await render(
      <VolunteerMessageTemplate
        volunteerName="Ada"
        eventName="CND"
        eventLocation="Bergen"
        eventDate="Oct 28"
        eventUrl="https://cnd.example"
        message="Shifts are posted."
      />,
    )
    expect(html).toContain('Dear <!-- -->Ada')
    expect(html).toContain('Shifts are posted.')
    expect(html).not.toMatch(/Congratulations|approved|Welcome to the/)
  })
})
