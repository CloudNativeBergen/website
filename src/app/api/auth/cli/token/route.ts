import { NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { getAuthSession } from '@/lib/auth'

const CLI_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 // 30 days
const JWT_SALT = 'authjs.session-token'

export async function POST() {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    console.error('AUTH_SECRET environment variable is not set')
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 },
    )
  }

  const session = await getAuthSession()
  if (!session?.speaker || !session?.account || !session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await encode({
    token: {
      sub: session.user.sub,
      name: session.user.name,
      email: session.user.email,
      picture: session.user.picture,
      speaker: session.speaker,
      account: session.account,
    },
    secret,
    maxAge: CLI_TOKEN_MAX_AGE,
    salt: JWT_SALT,
  })

  const expiresAt = new Date(
    Date.now() + CLI_TOKEN_MAX_AGE * 1000,
  ).toISOString()

  return NextResponse.json({ token, expiresAt })
}
