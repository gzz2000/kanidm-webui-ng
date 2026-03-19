import { baseUrl, tokenStore } from './http'

export type Oauth2ConsentState = {
  clientName: string
  scopes: string[]
  piiScopes: string[]
  consentToken: string
}

export type Oauth2AuthoriseResult =
  | { state: 'consent'; consent: Oauth2ConsentState }
  | { state: 'redirect'; redirectUri: string }
  | { state: 'auth_required' }
  | { state: 'access_denied' }
  | { state: 'error'; message: string }

function withAuthHeaders(contentType?: string) {
  const headers = new Headers()
  const token = tokenStore.get()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (contentType) {
    headers.set('Content-Type', contentType)
  }
  return headers
}

function extractRedirectUri(response: Response): string | null {
  const location = response.headers.get('location')
  if (location) return location
  if (response.redirected && response.url) return response.url
  return null
}

function parseConsentBody(payload: unknown): Oauth2ConsentState | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const raw =
    (root.ConsentRequested as Record<string, unknown> | undefined) ??
    (root.consent_requested as Record<string, unknown> | undefined) ??
    root
  if (!raw || typeof raw !== 'object') return null

  const clientName = raw.client_name
  const consentToken = raw.consent_token
  const scopes = raw.scopes
  const piiScopes = raw.pii_scopes

  if (
    typeof clientName !== 'string' ||
    typeof consentToken !== 'string' ||
    !Array.isArray(scopes) ||
    !Array.isArray(piiScopes)
  ) {
    return null
  }

  return {
    clientName,
    consentToken,
    scopes: scopes.filter((value): value is string => typeof value === 'string'),
    piiScopes: piiScopes.filter((value): value is string => typeof value === 'string'),
  }
}

export async function oauth2Authorise(
  query: URLSearchParams | Record<string, string>,
): Promise<Oauth2AuthoriseResult> {
  const params =
    query instanceof URLSearchParams ? new URLSearchParams(query) : new URLSearchParams(query)
  const requestBody = Object.fromEntries(params.entries())

  const response = await fetch(`${baseUrl}/oauth2/authorise`, {
    method: 'POST',
    headers: withAuthHeaders('application/json'),
    credentials: 'include',
    redirect: 'manual',
    body: JSON.stringify(requestBody),
  })

  if (response.status === 401) {
    return { state: 'auth_required' }
  }
  if (response.status === 403) {
    return { state: 'access_denied' }
  }

  const redirectUri = extractRedirectUri(response)
  if (redirectUri) {
    return { state: 'redirect', redirectUri }
  }

  if (!response.ok) {
    const message = await response.text()
    return { state: 'error', message: message || `HTTP ${response.status}` }
  }

  let responseBody: unknown = null
  try {
    responseBody = await response.json()
  } catch {
    responseBody = null
  }

  const consent = parseConsentBody(responseBody)
  if (consent) {
    return { state: 'consent', consent }
  }

  return { state: 'error', message: 'Invalid OAuth2 authorisation response.' }
}

export async function oauth2AuthorisePermit(token: string): Promise<string | null> {
  const response = await fetch(`${baseUrl}/oauth2/authorise/permit`, {
    method: 'POST',
    headers: withAuthHeaders('application/json'),
    credentials: 'include',
    redirect: 'manual',
    body: JSON.stringify(token),
  })

  if (response.status === 401) {
    tokenStore.clear()
    window.dispatchEvent(new Event('kanidm:auth-expired'))
    return null
  }

  const redirectUri = extractRedirectUri(response)
  if (redirectUri) return redirectUri

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  return null
}

export async function oauth2AuthoriseReject(token: string): Promise<string | null> {
  const body = new URLSearchParams({ token })
  const response = await fetch(`${baseUrl}/oauth2/authorise/reject`, {
    method: 'POST',
    headers: withAuthHeaders('application/x-www-form-urlencoded'),
    credentials: 'include',
    redirect: 'manual',
    body: body.toString(),
  })

  if (response.status === 401) {
    tokenStore.clear()
    window.dispatchEvent(new Event('kanidm:auth-expired'))
    return null
  }

  const redirectUri = extractRedirectUri(response)
  if (redirectUri) return redirectUri

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  return null
}
