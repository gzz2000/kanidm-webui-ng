import { tokenStore } from './http'
import type { AuthIssueSession, AuthMech, AuthRequest, AuthResponse } from './types'

const AUTH_SESSION_HEADER = 'X-KANIDM-AUTH-SESSION-ID'
let authSessionId: string | null = null

function authHeaders() {
  if (!authSessionId) return undefined
  return { [AUTH_SESSION_HEADER]: authSessionId }
}

const baseUrl = import.meta.env.VITE_KANIDM_BASE_URL ?? ''

async function authRequest(payload: AuthRequest | AuthIssueSession) {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  const token = tokenStore.get()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const sessionHeader = authHeaders()
  if (sessionHeader) {
    Object.entries(sessionHeader).forEach(([key, value]) => headers.set(key, value))
  }

  const response = await fetch(`${baseUrl}/v1/auth`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers,
    credentials: 'include',
  })

  const sessionFromHeader = response.headers.get(AUTH_SESSION_HEADER) ?? response.headers.get(AUTH_SESSION_HEADER.toLowerCase())
  if (sessionFromHeader) {
    authSessionId = sessionFromHeader
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  const json = (await response.json()) as AuthResponse
  return handleAuthResponse(json)
}

function handleAuthResponse(response: AuthResponse): AuthResponse {
  if ('success' in response.state) {
    tokenStore.set(response.state.success)
    authSessionId = null
  } else if ('denied' in response.state) {
    authSessionId = null
  }
  return response
}

export async function authInit(
  username: string,
  issue: AuthIssueSession = 'token',
  privileged = false,
) {
  const payload: AuthRequest = {
    step: {
      init2: {
        username,
        issue,
        privileged,
      },
    },
  }

  return authRequest(payload)
}

export async function authBegin(mech: AuthMech) {
  const payload: AuthRequest = {
    step: {
      begin: mech,
    },
  }

  return authRequest(payload)
}

export async function authPassword(password: string) {
  const payload: AuthRequest = {
    step: {
      cred: { password },
    },
  }

  return authRequest(payload)
}

export async function authPasskey(passkey: Record<string, unknown>) {
  const payload: AuthRequest = {
    step: {
      cred: { passkey },
    },
  }

  return authRequest(payload)
}

export async function authTotp(totp: number) {
  const payload: AuthRequest = {
    step: {
      cred: { totp },
    },
  }

  return authRequest(payload)
}

export async function authBackupCode(backupcode: string) {
  const payload: AuthRequest = {
    step: {
      cred: { backupcode },
    },
  }

  return authRequest(payload)
}

export async function authAnonymous() {
  const payload: AuthRequest = {
    step: {
      cred: 'anonymous',
    },
  }

  return authRequest(payload)
}

export async function reauthBegin(issue: AuthIssueSession = 'token') {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')
  const token = tokenStore.get()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const sessionHeader = authHeaders()
  if (sessionHeader) {
    Object.entries(sessionHeader).forEach(([key, value]) => headers.set(key, value))
  }

  const response = await fetch(`${baseUrl}/v1/reauth`, {
    method: 'POST',
    body: JSON.stringify(issue),
    headers,
    credentials: 'include',
  })

  const sessionFromHeader = response.headers.get(AUTH_SESSION_HEADER) ?? response.headers.get(AUTH_SESSION_HEADER.toLowerCase())
  if (sessionFromHeader) {
    authSessionId = sessionFromHeader
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  const json = (await response.json()) as AuthResponse
  return handleAuthResponse(json)
}

export async function logout() {
  const headers = new Headers()
  const token = tokenStore.get()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  const sessionHeader = authHeaders()
  if (sessionHeader) {
    Object.entries(sessionHeader).forEach(([key, value]) => headers.set(key, value))
  }

  const response = await fetch(`${baseUrl}/v1/logout`, {
    method: 'GET',
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  return undefined
}

export function clearAuthToken() {
  tokenStore.clear()
  authSessionId = null
}
