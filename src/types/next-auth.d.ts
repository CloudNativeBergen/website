import { Speaker } from '@/lib/proposal/types'
import { Account } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      sub?: string
      name: string
      email: string
      picture: string
    }
    speaker?: Speaker
    account?: Account
    /**
     * The normalized address THIS session proved control of by redeeming an
     * email magic link. Present ONLY on a magic-link session; absent on OAuth
     * and on any session minted before the claim existed, so consumers must
     * fail closed. See `src/lib/auth/email-link/identity.ts`.
     */
    emailLinkIdentifier?: string
    isImpersonating?: boolean
    realAdmin?: Speaker
  }
}
