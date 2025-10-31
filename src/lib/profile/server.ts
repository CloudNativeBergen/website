import { Session } from 'next-auth'

export function defaultEmails(session: Session) {
  return [
    {
      email: session.user.email,
      verified: true,
      primary: true,
      visibility: 'private',
    },
  ]
}
