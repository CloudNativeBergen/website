# Co-Speaker Invitation Flow Guide

## Expected User Flow

When a co-speaker receives an invitation email and clicks the invitation link, the following flow occurs:

### 1. Initial Click (Not Authenticated)

When clicking the invitation link (e.g., `https://yourdomain.com/invitation/respond?token=...`):

- If the user is **not signed in**, they will be redirected to the sign-in page
- The invitation URL is preserved as a callback URL
- The sign-in page URL will look like: `/api/auth/signin?callbackUrl=%2Finvitation%2Frespond%3Ftoken%3D...`

### 2. Authentication

- The user must sign in using either LinkedIn or GitHub
- The email address used for authentication should match the email the invitation was sent to
- If there's an email mismatch, the user will see a warning and need to sign in with the correct account

### 3. Post-Authentication Redirect

- After successful authentication, NextAuth.js automatically redirects the user back to the invitation page
- The user should now see the invitation details and can accept or decline

### 4. Accepting the Invitation

- When accepting, the user becomes a co-speaker on the proposal
- They are redirected to a success page
- The proposal will now appear in their speaker dashboard

## Troubleshooting

### "Not on the invitation page" after clicking the link

This usually means one of the following:

1. **You're on the sign-in page** - This is expected if you're not authenticated. Sign in and you'll be redirected back.
2. **Email mismatch** - Make sure you sign in with the same email address the invitation was sent to.
3. **Expired token** - Invitations expire after 14 days.

### Testing in Development

For development testing, you can append `?test=true` to bypass authentication:

```
http://localhost:3000/invitation/respond?token=YOUR_TOKEN&test=true
```

## Technical Details

The invitation system uses JWT tokens that contain:

- Invitation ID
- Invitee email
- Proposal ID
- Expiration timestamp

The token is signed and verified server-side to ensure security.
