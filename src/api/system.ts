import type { components } from './schema'
import { apiRequest } from './client'
import { baseUrl, tokenStore } from './http'

type Entry = components['schemas']['Entry']
type ScimEntry = components['schemas']['ScimEntry']

export type SystemMessageSummary = {
  id: string
  template: string
  sendAfter: string
  sentAt: string | null
  deleteAfter: string
  recipients: string[]
}

function firstAttr(entry: Entry, ...keys: string[]) {
  for (const key of keys) {
    const value = entry.attrs?.[key]
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      return value[0]
    }
  }
  return ''
}

function listAttr(entry: Entry, ...keys: string[]) {
  for (const key of keys) {
    const value = entry.attrs?.[key]
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string')
    }
  }
  return []
}

function parseDomainEntry(entry: Entry) {
  return {
    displayName: firstAttr(entry, 'domaindisplayname', 'domain_display_name'),
    ldapBaseDn: firstAttr(entry, 'domainldapbasedn', 'domain_ldap_basedn'),
    ldapMaxQueryableAttrs: firstAttr(entry, 'ldapmaxqueryableattrs', 'ldap_max_queryable_attrs'),
    ldapAllowUnixPwBind: firstAttr(entry, 'ldapallowunixpwbind', 'ldap_allow_unix_pw_bind'),
    allowEasterEggs: firstAttr(entry, 'domainalloweastereggs', 'domain_allow_easter_eggs'),
    name: firstAttr(entry, 'domainname', 'domain_name', 'name'),
    uuid: firstAttr(entry, 'domainuuid', 'domain_uuid', 'uuid'),
  }
}

function parseSystemEntry(entry: Entry) {
  return {
    deniedNames: listAttr(entry, 'deniedname', 'denied_name'),
    badlistPasswords: listAttr(entry, 'badlistpassword', 'badlist_password'),
    authSessionExpiry: firstAttr(entry, 'authsessionexpiry', 'auth_session_expiry'),
    privilegeExpiry: firstAttr(entry, 'privilegeexpiry', 'privilege_expiry'),
  }
}

function parseMailDestination(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (
        entry &&
        typeof entry === 'object' &&
        'value' in entry &&
        typeof entry.value === 'string'
      ) {
        return entry.value
      }
      return ''
    })
    .filter((entry) => entry.length > 0)
}

function toMessageSummary(entry: ScimEntry): SystemMessageSummary {
  const source = entry as Record<string, unknown>
  const sendAfter = source.send_after as { date_time?: string } | string | undefined
  const sentAt = source.sent_at as { date_time?: string } | string | null | undefined
  const deleteAfter = source.delete_after as { date_time?: string } | string | undefined
  const messageTemplate = source.message_template as { display_type?: string } | string | undefined

  const sendAfterValue =
    typeof sendAfter === 'string' ? sendAfter : sendAfter?.date_time ?? ''
  const sentAtValue =
    sentAt === null
      ? null
      : typeof sentAt === 'string'
        ? sentAt
        : sentAt?.date_time ?? null
  const deleteAfterValue =
    typeof deleteAfter === 'string' ? deleteAfter : deleteAfter?.date_time ?? ''
  const templateValue =
    typeof messageTemplate === 'string'
      ? messageTemplate
      : messageTemplate?.display_type ?? ''

  return {
    id: String(source.id ?? ''),
    template: templateValue || 'unknown',
    sendAfter: sendAfterValue,
    sentAt: sentAtValue,
    deleteAfter: deleteAfterValue,
    recipients: parseMailDestination(source.mail_destination),
  }
}

export async function fetchDomain() {
  const entries = await apiRequest<Entry[]>('/v1/domain', 'get')
  const entry = Array.isArray(entries) && entries.length > 0 ? entries[0] : null
  if (!entry) return null
  return parseDomainEntry(entry)
}

export async function setDomainAttr(attr: string, values: string[]) {
  await apiRequest(`/v1/domain/_attr/${encodeURIComponent(attr)}`, 'put', { body: values })
}

export async function deleteDomainAttr(attr: string, values?: string[]) {
  await apiRequest(`/v1/domain/_attr/${encodeURIComponent(attr)}`, 'delete', {
    body: values ?? null,
  })
}

export async function uploadDomainImage(file: File, imageType?: string) {
  const formData = new FormData()
  formData.append('image', file, file.name)
  if (imageType) {
    formData.append('image_type', imageType)
  }

  const headers = new Headers()
  const token = tokenStore.get()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${baseUrl}/v1/domain/_image`, {
    method: 'POST',
    headers,
    body: formData,
    credentials: 'include',
  })

  if (!response.ok) {
    const text = await response.text()
    if (response.status === 401) {
      tokenStore.clear()
      window.dispatchEvent(new Event('kanidm:auth-expired'))
    }
    throw new Error(`Request failed (${response.status}): ${text}`)
  }
}

export async function removeDomainImage() {
  await apiRequest('/v1/domain/_image', 'delete')
}

export async function fetchDomainImageObjectUrl(): Promise<string | null> {
  const headers = new Headers()
  const token = tokenStore.get()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${baseUrl}/ui/images/domain`, {
    method: 'GET',
    headers,
    credentials: 'include',
  })

  if (response.status === 404) return null
  if (response.status === 401) {
    tokenStore.clear()
    window.dispatchEvent(new Event('kanidm:auth-expired'))
    throw new Error('Request failed (401): "notauthenticated"')
  }
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Request failed (${response.status}): ${text}`)
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

export async function fetchPublicDomainDisplayName(): Promise<string> {
  const response = await fetch(`${baseUrl}/manifest.webmanifest`, {
    method: 'GET',
    credentials: 'include',
  })
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  const payload = (await response.json()) as { name?: unknown }
  if (typeof payload?.name === 'string') {
    return payload.name
  }
  throw new Error('Request failed (invalid manifest)')
}

export async function checkDomainImageExists(version?: number): Promise<string | null> {
  const url = version
    ? `${baseUrl}/ui/images/domain?v=${encodeURIComponent(String(version))}`
    : `${baseUrl}/ui/images/domain`
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
  })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  return url
}

export async function fetchSystem() {
  const entries = await apiRequest<Entry[]>('/v1/system', 'get')
  const entry = Array.isArray(entries) && entries.length > 0 ? entries[0] : null
  if (!entry) return null
  return parseSystemEntry(entry)
}

export async function fetchSystemAttr(attr: string) {
  const values = await apiRequest<string[] | null>(`/v1/system/_attr/${encodeURIComponent(attr)}`, 'get')
  return values ?? []
}

export async function appendSystemAttr(attr: string, values: string[]) {
  await apiRequest(`/v1/system/_attr/${encodeURIComponent(attr)}`, 'post', { body: values })
}

export async function setSystemAttr(attr: string, values: string[]) {
  await apiRequest(`/v1/system/_attr/${encodeURIComponent(attr)}`, 'put', { body: values })
}

export async function deleteSystemAttr(attr: string, values?: string[]) {
  await apiRequest(`/v1/system/_attr/${encodeURIComponent(attr)}`, 'delete', {
    body: values ?? null,
  })
}

type ScimListResponse = {
  resources?: ScimEntry[]
}

export async function listMessages() {
  const response = await apiRequest<ScimListResponse>('/scim/v1/Message', 'get')
  const resources = Array.isArray(response?.resources) ? response.resources : []
  return resources.map(toMessageSummary)
}

export async function getMessage(id: string) {
  const response = await apiRequest<ScimEntry>(`/scim/v1/Message/${encodeURIComponent(id)}`, 'get')
  return toMessageSummary(response)
}

export async function markMessageSent(id: string) {
  await apiRequest(`/scim/v1/Message/${encodeURIComponent(id)}/_sent`, 'post')
}

export async function sendTestMessage(personIdOrName: string) {
  await apiRequest(`/scim/v1/Person/${encodeURIComponent(personIdOrName)}/_message/_send_test`, 'get')
}
