import { BaseEmailTemplate } from './BaseEmailTemplate'

interface BroadcastEmailTemplateProps {
  subject: string
  content: string
  recipientName: string
}

export const BroadcastEmailTemplate = ({
  subject,
  content,
  recipientName,
}: BroadcastEmailTemplateProps) => {
  return (
    <BaseEmailTemplate
      speakerName={recipientName}
      proposalTitle=""
      eventName="Cloud Native Bergen"
      eventLocation="Bergen, Norway"
      eventDate="TBA"
      eventUrl="https://cloudnativebergen.dev"
      socialLinks={[]}
      customContent={{
        heading: subject,
        body: (
          <div>
            <div
              style={{
                fontSize: '16px',
                lineHeight: '1.6',
                color: '#334155',
                marginBottom: '24px',
              }}
              dangerouslySetInnerHTML={{ __html: content }}
            />
            <hr
              style={{
                border: 'none',
                borderTop: '1px solid #CBD5E1',
                margin: '32px 0',
              }}
            />
            <div
              style={{
                textAlign: 'center' as const,
                fontSize: '14px',
                color: '#64748B',
              }}
            >
              <p>
                You received this email because you are a confirmed or accepted
                speaker at Cloud Native Bergen.
              </p>
              <p>
                <a
                  href="{{{RESEND_UNSUBSCRIBE_URL}}}"
                  style={{ color: '#64748B', textDecoration: 'underline' }}
                >
                  Unsubscribe from these emails
                </a>
              </p>
            </div>
          </div>
        ),
      }}
    />
  )
}
