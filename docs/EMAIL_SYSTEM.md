# Email System Technical Documentation

## Overview

The Cloud Native Days Norway website features a comprehensive email system built on Resend that handles various types of email communications including proposal notifications, speaker emails, and audience management. The system is designed for production use with rate limiting, retry logic, comprehensive error handling, and a modern Gmail-style composition interface.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                      Email System Architecture                  │
├─────────────────────────────────────────────────────────────────┤
│  Frontend Components                                             │
│  ├── EmailModal (shared Gmail-style composition modal)           │
│  ├── SpeakerEmailModal (speaker-specific email wrapper)          │
│  └── AdminActionBar (email integration)                          │
├─────────────────────────────────────────────────────────────────┤
│  API Routes                                                       │
│  ├── /admin/api/speakers/email/multi (multi-speaker emails)      │
│  ├── /admin/api/speakers/email/broadcast (audience emails)       │
│  └── /admin/api/speakers/email/audience/sync (audience sync)     │
├─────────────────────────────────────────────────────────────────┤
│  Core Libraries                                                   │
│  ├── /lib/email/config.ts (shared configuration & utilities)     │
│  ├── /lib/email/speaker.ts (speaker-specific emails)             │
│  ├── /lib/email/audience.ts (audience management)                │
│  └── /lib/proposal/notification.ts (proposal notifications)      │
├─────────────────────────────────────────────────────────────────┤
│  Email Templates                                                  │
│  ├── BaseEmailTemplate (shared foundation)                       │
│  ├── SpeakerEmailTemplate (speaker communications)               │
│  ├── BroadcastTemplate (audience communications)                 │
│  └── EmailComponents (reusable UI elements)                      │
├─────────────────────────────────────────────────────────────────┤
│  External Services                                                │
│  └── Resend API (email delivery service)                         │
└─────────────────────────────────────────────────────────────────┘
```

## Core Features

### Gmail-Style Email Composition

The email system features a modern, intuitive composition interface that mirrors familiar email clients:

- **Professional Layout**: Gmail-style header fields (To/From/Subject) with clean visual separation
- **Responsive Design**: Optimized for desktop and mobile with adaptive button text and layouts
- **Live Preview**: Toggle between composition and preview modes to see exactly how emails will appear
- **Customizable Content**: Full control over greetings, subject lines, and message content
- **Rich Context**: Automatic inclusion of proposal and conference information

### Multi-Speaker Support

The system handles both individual and group communications:

- **Single Recipients**: Direct emails to individual speakers with personalized greetings
- **Multiple Recipients**: Send to multiple speakers simultaneously with proper recipient display
- **Smart Grouping**: Intelligent greeting generation for multiple recipients ("Dear Alex and Sarah" vs "Dear Alex, Sarah, and Mike")
- **Context Preservation**: Maintains proposal and conference context across all communication types

### Template System

Flexible template architecture supporting various email types:

- **Base Template**: Shared foundation ensuring consistent branding and layout
- **Specialized Templates**: Purpose-built templates for different communication scenarios
- **Email Client Compatibility**: Table-based layouts with inline styles for maximum compatibility
- **Responsive Design**: Templates adapt to different screen sizes and email clients
- **Accessibility**: Proper semantic markup and alt text for screen readers

## Core Components

### Configuration Management (`/lib/email/config.ts`)

Centralized configuration system with production-ready features:

```typescript
// Shared Resend instance
export const resend = new Resend(EMAIL_CONFIG.RESEND_API_KEY)

// Configuration constants
export const EMAIL_CONFIG = {
  RESEND_API_KEY: process.env.RESEND_API_KEY || 'test_key',
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

### 1. Speaker Communications

**Purpose**: Direct communications from organizers to speakers about proposals, logistics, and conference details

**Key Features**:

- Gmail-style composition interface with live preview
- Customizable greetings that adapt to single or multiple recipients
- Automatic proposal and conference context inclusion
- Responsive email templates optimized for all devices
- Real-time validation and error handling

**Implementation**: Multi-speaker email API with comprehensive validation

```typescript
// Send email to one or more speakers
const response = await fetch('/admin/api/speakers/email/multi', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    proposalId: 'proposal_id',
    speakerIds: ['speaker1_id', 'speaker2_id'],
    subject: 'Conference Update',
    message: 'Dear speakers,\n\nWe have important updates...',
  }),
})
```

**Supported Scenarios**:

- Individual speaker communications
- Co-speaker group messages
- Proposal-specific discussions
- Conference logistics and updates
- Travel and accommodation information

### 2. Proposal Notifications

**Purpose**: Automated notifications for proposal lifecycle events

**Supported Actions**:

- Proposal acceptance notifications
- Proposal rejection communications
- Deadline reminders and follow-ups
- Status update notifications

**Templates**: Specialized templates for each notification type with consistent branding

### 3. Audience Management

**Purpose**: Maintain organized communication lists for conference-wide announcements

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
    from: `${conference.organizer} <${conference.cfp_email}>`,
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

# Development
RESEND_API_KEY=test_key
```

## API Endpoints

### Multi-Speaker Email

**Endpoint**: `POST /admin/api/speakers/email/multi`

**Authentication**: Requires organizer access

**Request Body**:

```json
{
  "proposalId": "string",
  "speakerIds": ["string"],
  "subject": "string",
  "message": "string"
}
```

**Response**:

```json
{
  "message": "Email sent successfully",
  "emailId": "resend_email_id",
  "recipients": ["speaker1@example.com", "speaker2@example.com"],
  "proposalTitle": "Speaker's Proposal Title"
}
```

**Error Responses**:

- `400`: Invalid request (missing fields, empty content, invalid speaker IDs)
- `404`: Conference, proposal, or speakers not found
- `500`: Email sending failure or server error

### Audience Management

**Endpoint**: `POST /admin/api/speakers/email/audience/sync`

**Purpose**: Synchronize conference audience lists with current speaker roster

**Authentication**: Requires organizer access

## Frontend Integration

### Email Composition Interface

Modern Gmail-style email composition with production-ready features:

```tsx
import { EmailModal } from '@/components/admin/EmailModal'
import { SpeakerEmailModal } from '@/components/admin/SpeakerEmailModal'

// Usage in admin components
;<SpeakerEmailModal
  isOpen={showEmailModal}
  onClose={() => setShowEmailModal(false)}
  proposal={proposal}
  speakers={selectedSpeakers}
  domain={domain}
  fromEmail={emailConfig.fromAddress}
/>
```

**Key Features**:

- **Server-Side Configuration**: Email addresses and configuration loaded server-side for security
- **Responsive Design**: Adaptive layouts for desktop and mobile devices
- **Live Preview**: Toggle between composition and preview modes
- **Real-Time Validation**: Immediate feedback on required fields and content
- **Loading States**: Clear indication of email sending progress
- **Error Handling**: User-friendly error messages and retry capabilities

### Admin Integration

Seamlessly integrated into the admin workflow:

- **Proposal Context**: Email functionality embedded directly in proposal management
- **Speaker Selection**: Support for single and multiple speaker selection
- **Conference Awareness**: Automatic inclusion of conference details and branding
- **Notification System**: Success and error notifications integrated with admin UI

## Testing

### Unit Tests

Basic validation and error handling tests:

```bash
# Run email system tests
pnpm test __tests__/lib/email/speaker.test.ts

# Run all tests
pnpm test
```

### Manual Testing Checklist

1. **Email Composition Interface**:
   - [ ] Gmail-style interface renders correctly on desktop and mobile
   - [ ] Preview mode toggles and displays formatted email correctly
   - [ ] Required field validation works (subject, message)
   - [ ] Loading states display during email sending
   - [ ] Error handling shows appropriate user messages

2. **Multi-Speaker Communications**:
   - [ ] Single speaker emails send successfully with proper greeting
   - [ ] Multiple speaker emails generate correct group greetings
   - [ ] Recipient display shows proper formatting for all scenarios
   - [ ] Conference and proposal context included automatically

3. **Template Rendering**:
   - [ ] Email templates render correctly across major email clients
   - [ ] Responsive design works on mobile email apps
   - [ ] Social links and branding display properly
   - [ ] All dynamic content populates correctly

4. **Error Scenarios**:
   - [ ] Invalid recipient handling
   - [ ] Missing proposal or conference data
   - [ ] Network failures and retry logic
   - [ ] Rate limiting behavior

## Security and Production Readiness

### Authentication and Authorization

- **Organizer-Only Access**: All email endpoints require authenticated organizer privileges
- **Server-Side Validation**: Comprehensive request validation on all API endpoints
- **Session Management**: Secure session handling via NextAuth.js integration
- **Input Sanitization**: Proper escaping and validation of all user-provided content

### Configuration Security

- **Environment Variables**: Email configuration stored securely in environment variables
- **Server-Side Only**: Email API keys and sensitive configuration never exposed to client
- **Fallback Handling**: Graceful degradation when configuration is missing or invalid
- **Development Warnings**: Clear notifications when running in development environments

### Data Protection

- **Email Validation**: Comprehensive validation of recipient email addresses
- **Content Safety**: HTML content properly escaped and sanitized
- **Error Message Safety**: No sensitive information exposed in error responses
- **Rate Limiting**: Built-in protection against email abuse and spam

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

- **Email Delivery Success Rate**: Track successful sends vs failures across all email types
- **User Interface Performance**: Monitor composition interface load times and responsiveness
- **Template Rendering**: Track successful template generation and any rendering failures
- **API Response Times**: Monitor email sending API performance and latency
- **Rate Limiting Events**: Watch for API limit encounters and backoff strategy effectiveness
- **Error Patterns**: Identify recurring issues for proactive fixes
- **User Engagement**: Track email composition completion rates and preview usage

### Resend Dashboard

Monitor email delivery through the Resend dashboard:

- Delivery status and bounce rates
- API usage and rate limit status
- Email performance analytics
- Webhook event logs

## Troubleshooting

### Common Issues

1. **"fromEmail prop is required"**
   - Verify server component is passing the conference CFP email
   - Check conference configuration includes required email fields
   - Ensure client components receive fromEmail as prop

2. **Gmail Interface Not Responding**
   - Check for JavaScript errors in browser console
   - Verify all required props are provided to EmailModal
   - Test preview toggle functionality

3. **Template Rendering Issues**
   - Verify all template props are provided and typed correctly
   - Check for React component errors in logs
   - Test templates in isolation with mock data

4. **Multi-Speaker Greeting Problems**
   - Verify speaker data includes proper name fields
   - Check greeting generation logic for edge cases
   - Test with various speaker count scenarios

### Debug Mode

Enable detailed logging in development:

```bash
NODE_ENV=development pnpm run dev
```

### Error Recovery

The system includes automatic recovery mechanisms:

- **Retry Logic**: Automatic retry for transient failures
- **Fallback Handling**: Graceful degradation when services are down
- **Error Isolation**: Email failures don't break other functionality

## Future Enhancements

### Planned Features

- [ ] **Email Templates Library**: Pre-defined templates for common communication scenarios
- [ ] **Scheduled Email Delivery**: Queue emails for future sending with timezone support
- [ ] **Email Analytics**: Track delivery rates, open rates, and engagement metrics
- [ ] **Advanced Composition**: Rich text editing, attachments, and formatting options
- [ ] **Email Workflows**: Automated email sequences and drip campaigns
- [ ] **Delivery Tracking**: Real-time delivery status updates and notifications

### Integration Opportunities

- [ ] **Calendar Integration**: Automatic event reminders and schedule synchronization
- [ ] **CRM Platform**: Enhanced speaker relationship management and communication history
- [ ] **Analytics Dashboard**: Comprehensive email performance and engagement tracking
- [ ] **Mobile App**: Native mobile interface for email composition and management
- [ ] **AI Assistance**: Smart content suggestions and automated response generation

## Development Guidelines

### Adding New Email Types

1. **Create Template Component**: Design email template in `/components/email/`
2. **Implement Business Logic**: Add email handling logic in `/lib/email/`
3. **Add API Endpoint**: Create secure API route with proper validation
4. **Update Frontend**: Integrate with Gmail-style composition interface
5. **Security Review**: Ensure proper authentication and input validation
6. **Testing**: Write comprehensive tests and manual testing scenarios
7. **Documentation**: Update this documentation with new capabilities

### Code Standards

- **Configuration**: Always use shared configuration from `/lib/email/config.ts`
- **Error Handling**: Include comprehensive error handling with user-friendly messages
- **Rate Limiting**: Implement rate limiting for any bulk operations
- **TypeScript**: Follow existing TypeScript patterns and interfaces
- **Security**: Server-side validation for all email operations
- **Logging**: Include proper logging and monitoring for debugging

### Architecture Principles

- **Server-Client Separation**: Keep email configuration and sensitive operations server-side
- **Component Reusability**: Use shared EmailModal for consistent UI across email types
- **Template Consistency**: Extend BaseEmailTemplate for visual consistency
- **Progressive Enhancement**: Ensure email functionality works without JavaScript
- **Accessibility**: Follow accessibility best practices in email composition interfaces

## References

- [Resend API Documentation](https://resend.com/docs)
- [NextAuth.js Documentation](https://next-auth.js.org)
- [React Email Documentation](https://react.email)
- [Conference Management Architecture](./EVENT_ARCHITECTURE.md)
