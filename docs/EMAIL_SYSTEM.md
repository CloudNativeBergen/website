# Email System Technical Documentation

## Overview

The Cloud Native Bergen website features a comprehensive email system built on Resend that handles various types of email communications including proposal notifications, speaker emails, and audience management. The system is designed for production use with rate limiting, retry logic, and comprehensive error handling.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                      Email System Architecture                  │
├─────────────────────────────────────────────────────────────────┤
│  Frontend Components                                             │
│  ├── EmailModal (shared modal component)                         │
│  ├── SingleSpeakerEmailModal (individual speaker emails)         │
│  └── AdminActionBar (email integration)                          │
├─────────────────────────────────────────────────────────────────┤
│  API Routes                                                       │
│  ├── /admin/api/speakers/email/single (single speaker emails)    │
│  └── Future: /admin/api/speakers/email/bulk                      │
├─────────────────────────────────────────────────────────────────┤
│  Core Libraries                                                   │
│  ├── /lib/email/config.ts (shared configuration & utilities)     │
│  ├── /lib/email/speaker.ts (speaker-specific emails)             │
│  ├── /lib/email/audience.ts (audience management)                │
│  └── /lib/proposal/notification.ts (proposal notifications)      │
├─────────────────────────────────────────────────────────────────┤
│  Email Templates                                                  │
│  ├── BaseEmailTemplate (shared foundation)                       │
│  ├── SingleSpeakerEmailTemplate (individual communications)      │
│  ├── ProposalAcceptTemplate (acceptance notifications)           │
│  ├── ProposalRejectTemplate (rejection notifications)            │
│  ├── SpeakerBroadcastTemplate (mass communications)              │
│  └── EmailComponents (reusable UI elements)                      │
├─────────────────────────────────────────────────────────────────┤
│  External Services                                                │
│  └── Resend API (email delivery service)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### Shared Configuration (`/lib/email/config.ts`)

The centralized configuration module provides:

```typescript
// Shared Resend instance
export const resend = new Resend(EMAIL_CONFIG.RESEND_API_KEY)

// Configuration constants
export const EMAIL_CONFIG = {
  RESEND_API_KEY: process.env.RESEND_API_KEY || 'test_key',
  RESEND_FROM_EMAIL:
    process.env.RESEND_FROM_EMAIL || 'test@cloudnativebergen.no',
  RATE_LIMIT_DELAY: 500, // 500ms delay = 2 requests per second max
  MAX_RETRIES: 3,
}

// Utility functions
export function retryWithBackoff<T>(apiCall: () => Promise<T>): Promise<T>
export function isRateLimitError(error: unknown): boolean
export function delay(ms: number): Promise<void>
```

### Email Templates

All email templates extend the `BaseEmailTemplate` for consistency:

```tsx
// Example template structure
export function CustomEmailTemplate({
  speakerName,
  eventName,
  customContent,
  ...props
}: CustomEmailTemplateProps) {
  return (
    <BaseEmailTemplate
      speakerName={speakerName}
      eventName={eventName}
      {...props}
    >
      {customContent}
    </BaseEmailTemplate>
  )
}
```

## Email Types and Use Cases

### 1. Proposal Notifications

**Purpose**: Automated notifications for proposal status changes (accept/reject/remind)

**Implementation**: `/lib/proposal/notification.ts`

```typescript
import { sendAcceptRejectNotification } from '@/lib/proposal/notification'

await sendAcceptRejectNotification({
  action: Action.accept, // accept | reject | remind
  speaker: { name: 'John Doe', email: 'john@example.com' },
  proposal: { _id: 'prop123', title: 'My Talk' },
  comment: 'We loved your proposal!',
  event: {
    name: 'Cloud Native Bergen 2025',
    location: 'Bergen',
    date: '2025-09-15',
    url: 'cloudnativebergen.no',
    socialLinks: ['https://twitter.com/cloudnativebergen'],
  },
})
```

**Templates Used**:

- `ProposalAcceptTemplate` - For acceptances and reminders
- `ProposalRejectTemplate` - For rejections

**Triggers**:

- Admin action on proposal (approve/reject/remind)
- Automated reminder systems

### 2. Individual Speaker Emails

**Purpose**: Custom emails from organizers to specific speakers

**Implementation**: `/lib/email/speaker.ts`

```typescript
import { sendSpeakerEmail } from '@/lib/email/speaker'

const result = await sendSpeakerEmail({
  proposalId: 'proposal_id',
  speakerId: 'speaker_id',
  subject: 'Travel Information Update',
  message: 'Hello! We have updates about your travel arrangements...',
  senderName: 'Conference Organizer',
  addToAudience: true, // Optional: add to mailing list
})

if (result.error) {
  console.error('Email failed:', result.error)
} else {
  console.log('Email sent to:', result.data.recipient)
}
```

**Template Used**: `SingleSpeakerEmailTemplate`

**Features**:

- Custom subject and message
- Automatic proposal context inclusion
- Optional audience list integration
- Admin UI integration

### 3. Audience Management

**Purpose**: Manage mailing lists for conference communications

**Implementation**: `/lib/email/audience.ts`

```typescript
import {
  getOrCreateConferenceAudience,
  addSpeakerToAudience,
  syncConferenceAudience,
} from '@/lib/email/audience'

// Create/get conference audience
const { audienceId } = await getOrCreateConferenceAudience(conference)

// Add individual speaker
await addSpeakerToAudience(audienceId, speaker)

// Sync all eligible speakers
await syncConferenceAudience(conference, eligibleSpeakers)
```

**Features**:

- Automatic audience creation per conference
- Speaker synchronization based on proposal status
- Rate-limited operations for large audiences
- Duplicate handling and cleanup

## Production Features

### Rate Limiting and Retry Logic

All email operations include production-ready safeguards:

```typescript
// Automatic retry with exponential backoff
const emailResult = await retryWithBackoff(async () => {
  return await resend.emails.send({
    from: EMAIL_CONFIG.RESEND_FROM_EMAIL,
    to: [recipient],
    subject: subject,
    react: template,
  })
})
```

**Benefits**:

- Handles temporary service outages
- Respects API rate limits (2 requests/second)
- Exponential backoff prevents overwhelming the service
- Graceful failure handling

### Error Handling

Standardized error handling across all email functions:

```typescript
// Consistent error response structure
export interface EmailError {
  error: string
  status: number
}

export type EmailResult<T = EmailResponse> = {
  data?: T
  error?: EmailError
}

// Usage
const result = await sendSpeakerEmail(params)
if (result.error) {
  // Handle error based on status code
  switch (result.error.status) {
    case 404: // Not found
    case 400: // Validation error
    case 500: // Server error
  }
}
```

### Environment Configuration

Required environment variables:

```bash
# Production
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=noreply@cloudnativebergen.no

# Development
RESEND_API_KEY=test_key
RESEND_FROM_EMAIL=test@cloudnativebergen.no
```

## API Endpoints

### Single Speaker Email

**Endpoint**: `POST /admin/api/speakers/email/single`

**Authentication**: Requires organizer access

**Request Body**:

```json
{
  "proposalId": "string",
  "speakerId": "string",
  "subject": "string",
  "message": "string",
  "addToAudience": "boolean (optional)"
}
```

**Response**:

```json
{
  "message": "Email sent successfully",
  "emailId": "resend_email_id",
  "recipient": "speaker@example.com",
  "proposalTitle": "Speaker's Proposal Title"
}
```

**Error Responses**:

- `400`: Invalid request (missing fields, empty content)
- `404`: Conference, proposal, or speaker not found
- `500`: Email sending failure or server error

## Frontend Integration

### Email Modal Component

Reusable modal for email composition:

```tsx
import { EmailModal } from '@/components/admin/EmailModal'

;<EmailModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  title="Email Speaker"
  recipientInfo="Sending to John Doe (john@example.com)"
  contextInfo="Proposal: My Amazing Talk"
  onSend={async ({ subject, message }) => {
    // Handle email sending
  }}
  submitButtonText="Send Email"
  placeholder={{
    subject: 'Enter email subject...',
    message: 'Type your message...',
  }}
/>
```

### Admin Integration

Email functionality is integrated into the admin interface:

```tsx
// In AdminActionBar.tsx
{
  speakers.map((speaker) => (
    <button
      onClick={() => handleEmailSpeaker(speaker)}
      className="email-button"
    >
      📧 Email {speaker.name}
    </button>
  ))
}
```

## Testing

### Unit Tests

Basic validation and error handling tests:

```bash
# Run email system tests
npm test __tests__/lib/email/speaker.test.ts

# Run all tests
npm test
```

### Manual Testing Checklist

1. **Single Speaker Emails**:
   - [ ] Send email to speaker with valid proposal
   - [ ] Verify email delivery in Resend dashboard
   - [ ] Test error handling (invalid speaker, missing proposal)
   - [ ] Test audience integration toggle

2. **Proposal Notifications**:
   - [ ] Accept proposal and verify email sent
   - [ ] Reject proposal and verify email sent
   - [ ] Test reminder functionality

3. **Audience Management**:
   - [ ] Verify audience creation for new conference
   - [ ] Test speaker addition/removal
   - [ ] Test bulk synchronization

## Security Considerations

### Authentication and Authorization

- All email endpoints require authenticated organizer access
- Server-side validation of all requests
- Proper session management via NextAuth

### Data Protection

- Email addresses are validated before sending
- No sensitive data in error messages
- Input sanitization for display content
- Rate limiting prevents abuse

### Email Content Safety

- HTML content is properly escaped
- Template injection protection
- Sender verification through Resend

## Monitoring and Observability

### Logging

All email operations include comprehensive logging:

```typescript
// Success logging
console.log(`Email sent successfully to ${recipient} (ID: ${emailId})`)

// Error logging
console.error('Email sending failed:', {
  error: error.message,
  recipient,
  proposalId,
  timestamp: new Date().toISOString(),
})

// Rate limiting warnings
console.warn('Rate limit encountered, implementing backoff strategy')
```

### Metrics to Monitor

- **Email Delivery Rate**: Track successful vs failed sends
- **Rate Limiting Events**: Monitor API limit encounters
- **Error Patterns**: Watch for recurring issues
- **Response Times**: Email API performance
- **Audience Growth**: Track speaker list growth

### Resend Dashboard

Monitor email delivery through the Resend dashboard:

- Delivery status and bounce rates
- API usage and rate limit status
- Email performance analytics
- Webhook event logs

## Troubleshooting

### Common Issues

1. **"RESEND_API_KEY is not set"**
   - Verify environment variable configuration
   - Check API key validity in Resend dashboard

2. **Rate Limiting Errors**
   - Monitor request frequency in logs
   - Consider increasing `RATE_LIMIT_DELAY` for high volume
   - Check for concurrent email operations

3. **Template Rendering Issues**
   - Verify all template props are provided
   - Check for React component errors in logs
   - Test templates in isolation

4. **Delivery Failures**
   - Check recipient email validity
   - Verify sender domain configuration
   - Monitor Resend service status

### Debug Mode

Enable detailed logging in development:

```bash
NODE_ENV=development npm run dev
```

### Error Recovery

The system includes automatic recovery mechanisms:

- **Retry Logic**: Automatic retry for transient failures
- **Fallback Handling**: Graceful degradation when services are down
- **Error Isolation**: Email failures don't break other functionality

## Future Enhancements

### Planned Features

- [ ] **Bulk Email Operations**: Send emails to multiple speakers
- [ ] **Email Templates Library**: Pre-defined templates for common scenarios
- [ ] **Delivery Tracking**: Real-time delivery status updates
- [ ] **Email Analytics**: Open rates, click tracking, engagement metrics
- [ ] **Scheduled Emails**: Queue emails for future delivery
- [ ] **Email Workflows**: Automated email sequences

### Integration Opportunities

- [ ] **Calendar Integration**: Event reminders and scheduling
- [ ] **CRM Integration**: Speaker relationship management
- [ ] **Analytics Platform**: Email performance tracking
- [ ] **Notification System**: Real-time email status updates

## Development Guidelines

### Adding New Email Types

1. Create template component in `/components/email/`
2. Add business logic in `/lib/email/`
3. Create API endpoint if needed
4. Add frontend integration
5. Write tests and documentation
6. Update this documentation

### Code Standards

- Use shared configuration from `/lib/email/config.ts`
- Include comprehensive error handling
- Add rate limiting for bulk operations
- Follow existing TypeScript patterns
- Include proper logging and monitoring

### Testing Requirements

- Unit tests for validation logic
- Integration tests for API endpoints
- Manual testing in staging environment
- Error scenario coverage
- Performance testing for bulk operations

## References

- [Resend API Documentation](https://resend.com/docs)
- [NextAuth.js Documentation](https://next-auth.js.org)
- [React Email Documentation](https://react.email)
- [Conference Management Architecture](./EVENT_ARCHITECTURE.md)
