# Email Provider Migration: SendGrid to Resend

This document outlines the migration from SendGrid to Resend for email notifications in the Cloud Native Bergen website.

## Changes Made

### 1. Email Templates
Created React-based email templates in `/src/components/email/`:
- `ProposalAcceptTemplate.tsx` - For accepted proposals 
- `ProposalRejectTemplate.tsx` - For rejected proposals
- `index.ts` - Export file for templates

### 2. Notification System Refactor
Updated `/src/lib/proposal/notification.ts`:
- Replaced SendGrid client with Resend client
- Removed template ID dependencies (now using React components)
- Updated function signature to return Resend response format
- Added proper error handling for Resend API

### 3. Environment Variables
**Required Environment Variables:**
- `RESEND_API_KEY` - Your Resend API key
- `RESEND_FROM_EMAIL` - The verified sender email address

**Removed Environment Variables:**
- `SENDGRID_API_KEY` (no longer needed)
- `SENDGRID_FROM_EMAIL` (replaced by `RESEND_FROM_EMAIL`)
- `SENDGRID_TEMPALTE_ID_CFP_ACCEPT` (no longer needed)
- `SENDGRID_TEMPALTE_ID_CFP_REJECT` (no longer needed)

### 4. Test Updates
Updated `/src/app/api/proposal/[id]/action/route.test.ts`:
- Replaced SendGrid mocks with Resend mocks
- Updated test expectations to match new email format
- Simplified test structure by mocking the notification function directly

## Benefits of Migration

1. **React Templates**: Email templates are now React components, making them easier to maintain and preview
2. **Type Safety**: Better TypeScript integration with Resend
3. **Simplified Configuration**: No need to manage template IDs in external service
4. **Better Developer Experience**: Templates can be versioned with code
5. **Cost Efficiency**: Resend typically offers better pricing for transactional emails

## Testing the Migration

1. Set up the required environment variables in your `.env.local` file
2. Verify the email templates render correctly
3. Test the notification system with the new Resend integration
4. Run the updated tests: `npm test -- --testPathPatterns="route.test.ts"`

## Migration Steps for Production

1. Create a Resend account and verify your domain
2. Generate a Resend API key
3. Update environment variables in your production environment
4. Deploy the updated code
5. Test email notifications in production
6. Remove old SendGrid configuration and API keys

## Rollback Plan

If issues arise, the migration can be rolled back by:
1. Reverting the code changes
2. Restoring SendGrid environment variables
3. Redeploying the previous version

The old SendGrid templates should be kept until the migration is fully validated in production.
