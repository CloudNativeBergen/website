import { EncryptJWT, jwtDecrypt } from 'jose'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

const COOKIE_NAME = 'adobe_sign_session'
const STATE_COOKIE_NAME = 'adobe_sign_state'

export interface AdobeSignSession {
  accessToken: string
  refreshToken: string
  apiAccessPoint: string
  expiresAt: number
}

function getShard(): string {
  return process.env.ADOBE_SIGN_SHARD || 'eu2'
}

function getClientId(): string {
  const id = process.env.ADOBE_SIGN_CLIENT_ID
  if (!id) throw new Error('ADOBE_SIGN_CLIENT_ID is not set')
  return id
}

function getClientSecret(): string {
  const secret = process.env.ADOBE_SIGN_CLIENT_SECRET
  if (!secret) throw new Error('ADOBE_SIGN_CLIENT_SECRET is not set')
  return secret
}

async function getEncryptionKey(): Promise<Uint8Array> {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits'],
  )
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode('adobe-sign-session'),
      info: encoder.encode(''),
    },
    keyMaterial,
    256,
  )
  return new Uint8Array(derived)
}

export function getAuthorizeUrl(state: string, redirectUri: string): string {
  const shard = getShard()
  const clientId = getClientId()
  const scopes =
    'agreement_read agreement_write agreement_send webhook_read webhook_write'
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  })
  return `https://secure.${shard}.adobesign.com/public/oauth/v2?${params}`
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  api_access_point: string
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<AdobeSignSession> {
  const shard = getShard()
  const response = await fetch(
    `https://api.${shard}.adobesign.com/oauth/v2/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: getClientId(),
        client_secret: getClientSecret(),
        redirect_uri: redirectUri,
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Adobe Sign token exchange failed (${response.status}): ${body}`,
    )
  }

  const data: TokenResponse = await response.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    apiAccessPoint: data.api_access_point,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<AdobeSignSession> {
  const shard = getShard()
  const response = await fetch(
    `https://api.${shard}.adobesign.com/oauth/v2/refresh`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: getClientId(),
        client_secret: getClientSecret(),
      }),
    },
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Adobe Sign token refresh failed (${response.status}): ${body}`,
    )
  }

  const data: TokenResponse = await response.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    apiAccessPoint: data.api_access_point,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

export async function encryptSession(
  session: AdobeSignSession,
): Promise<string> {
  const key = await getEncryptionKey()
  return new EncryptJWT({ ...session })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .encrypt(key)
}

export async function decryptSession(
  token: string,
): Promise<AdobeSignSession | null> {
  try {
    const key = await getEncryptionKey()
    const { payload } = await jwtDecrypt(token, key)
    return {
      accessToken: payload.accessToken as string,
      refreshToken: payload.refreshToken as string,
      apiAccessPoint: payload.apiAccessPoint as string,
      expiresAt: payload.expiresAt as number,
    }
  } catch {
    return null
  }
}

export async function getAdobeSignSession(): Promise<AdobeSignSession | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(COOKIE_NAME)
  if (!cookie?.value) return null

  const session = await decryptSession(cookie.value)
  if (!session) return null

  // If token is expired, try refreshing
  if (Date.now() >= session.expiresAt - 60_000) {
    try {
      const refreshed = await refreshAccessToken(session.refreshToken)
      // Store the refreshed session back in the cookie
      const encrypted = await encryptSession(refreshed)
      cookieStore.set(COOKIE_NAME, encrypted, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 60, // 60 days (refresh token lifetime)
      })
      return refreshed
    } catch {
      // Refresh failed — session is dead
      cookieStore.delete(COOKIE_NAME)
      return null
    }
  }

  return session
}

export function setAdobeSignSessionCookie(
  response: NextResponse,
  encrypted: string,
): void {
  response.cookies.set(COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 60,
  })
}

export async function clearAdobeSignSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for potential use in route handlers
function clearAdobeSignSessionCookie(response: NextResponse): void {
  response.cookies.delete(COOKIE_NAME)
}

export function setStateCookie(response: NextResponse, state: string): void {
  response.cookies.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  })
}

export async function consumeStateCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(STATE_COOKIE_NAME)
  if (!cookie?.value) return null
  cookieStore.delete(STATE_COOKIE_NAME)
  return cookie.value
}
