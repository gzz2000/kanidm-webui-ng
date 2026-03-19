import type { Oauth2ConsentState } from '../api/oauth2Flow'

const OAUTH2_PENDING_KEY = 'kanidm.oauth2.pending'
const OAUTH2_CONSENT_KEY = 'kanidm.oauth2.consent'
const OAUTH2_RESUME_ATTEMPTED_KEY = 'kanidm.oauth2.resume_attempted'

export function saveOauth2PendingRequest(pathAndSearch: string) {
  sessionStorage.setItem(OAUTH2_PENDING_KEY, pathAndSearch)
}

export function loadOauth2PendingRequest(): string | null {
  return sessionStorage.getItem(OAUTH2_PENDING_KEY)
}

export function clearOauth2PendingRequest() {
  sessionStorage.removeItem(OAUTH2_PENDING_KEY)
}

export function saveOauth2ConsentState(consent: Oauth2ConsentState) {
  sessionStorage.setItem(OAUTH2_CONSENT_KEY, JSON.stringify(consent))
}

export function loadOauth2ConsentState(): Oauth2ConsentState | null {
  const raw = sessionStorage.getItem(OAUTH2_CONSENT_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Oauth2ConsentState
    if (
      parsed &&
      typeof parsed.clientName === 'string' &&
      typeof parsed.consentToken === 'string' &&
      Array.isArray(parsed.scopes) &&
      Array.isArray(parsed.piiScopes)
    ) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

export function clearOauth2ConsentState() {
  sessionStorage.removeItem(OAUTH2_CONSENT_KEY)
}

export function hasOauth2ResumeAttempted() {
  return sessionStorage.getItem(OAUTH2_RESUME_ATTEMPTED_KEY) === '1'
}

export function markOauth2ResumeAttempted() {
  sessionStorage.setItem(OAUTH2_RESUME_ATTEMPTED_KEY, '1')
}

export function clearOauth2ResumeAttempted() {
  sessionStorage.removeItem(OAUTH2_RESUME_ATTEMPTED_KEY)
}
