import type { components, paths } from './schema'
import { apiRequest } from './client'
import { baseUrl, tokenStore } from './http'

type Entry = components['schemas']['Entry']
type Oauth2ListResponse =
  paths['/v1/oauth2']['get']['responses'][200]['content']['application/json']
type Oauth2DetailResponse =
  paths['/v1/oauth2/{rs_name}']['get']['responses'][200]['content']['application/json']

export type Oauth2ClientType = 'basic' | 'public' | 'unknown'
export type Oauth2ClaimJoin = components['schemas']['Oauth2ClaimMapJoin']

const VALID_IMAGE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/svg+xml',
  'image/webp',
])
const MAX_UPLOAD_IMAGE_BYTES = 256 * 1024

function imageTypeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.webp')) return 'image/webp'
  return null
}

export type Oauth2ScopeMap = {
  groupId: string
  scopes: string[]
}

export type Oauth2ClaimMap = {
  claim: string
  groupId: string
  values: string[]
  join: Oauth2ClaimJoin
}

export type Oauth2ClientSummary = {
  uuid: string
  name: string
  displayName: string
  type: Oauth2ClientType
  landingUrl: string | null
}

export type Oauth2ClientDetail = {
  uuid: string
  name: string
  displayName: string
  description: string | null
  type: Oauth2ClientType
  landingUrl: string | null
  redirectUrls: string[]
  scopeMaps: Oauth2ScopeMap[]
  supScopeMaps: Oauth2ScopeMap[]
  claimMaps: Oauth2ClaimMap[]
  allowInsecurePkce: boolean
  allowLocalhostRedirect: boolean
  legacyCrypto: boolean
  preferShortUsername: boolean
  strictRedirectUri: boolean
  consentPromptEnabled: boolean | null
  deviceFlowEnabled: boolean
  visibility: {
    landing: boolean
    redirectUrls: boolean
    security: boolean
    scopeMap: boolean
    supScopeMap: boolean
    claimMap: boolean
  }
}

function firstAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) && value.length > 0 ? value[0] : ''
}

function listAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) ? value : []
}

function parseOptionalBool(entry: Entry, key: string): boolean | null {
  const value = listAttr(entry, key)
  if (value.length === 0) return null
  const raw = value[0]?.toLowerCase()
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}

function parseBool(entry: Entry, key: string) {
  const parsed = parseOptionalBool(entry, key)
  return parsed ?? false
}

function hasAttr(entry: Entry, key: string) {
  const attrs = entry.attrs
  if (!attrs) return false
  return Object.prototype.hasOwnProperty.call(attrs, key)
}

function detectJoin(raw: string): Oauth2ClaimJoin {
  if (raw.includes(';')) return 'array'
  if (raw.includes(',')) return 'csv'
  if (raw.includes(' ')) return 'ssv'
  return 'array'
}

function joinFromToken(token: string, raw: string): Oauth2ClaimJoin {
  if (token === ',') return 'csv'
  if (token === ';') return 'array'
  if (token === ' ') return 'ssv'
  if (!token) return detectJoin(raw)
  return detectJoin(raw)
}

function splitClaimMapValues(raw: string, join: Oauth2ClaimJoin): string[] {
  // /v1/oauth2/{id} serializes claim-map values as comma-joined text
  // regardless of join mode; join mode is encoded separately.
  void join
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function extractQuotedValues(input: string): string[] {
  const values: string[] = []
  const regex = /"([^"]+)"/g
  let match: RegExpExecArray | null = regex.exec(input)
  while (match) {
    values.push(match[1])
    match = regex.exec(input)
  }
  return values
}

function parseScopeMapValue(value: string): Oauth2ScopeMap | null {
  const idx = value.indexOf(':')
  if (idx < 0) return null
  const groupId = value.slice(0, idx).trim()
  const scopes = extractQuotedValues(value.slice(idx + 1))
  return {
    groupId,
    scopes,
  }
}

function parseScopeMaps(values: string[]): Oauth2ScopeMap[] {
  return values
    .map(parseScopeMapValue)
    .filter((entry): entry is Oauth2ScopeMap => entry !== null)
}

function parseClaimMapValue(value: string): Oauth2ClaimMap | null {
  const quotedMatch = /"([^"]*)"/.exec(value)
  const joined = quotedMatch ? quotedMatch[1] : ''
  const prefix = quotedMatch ? value.slice(0, quotedMatch.index).replace(/:\s*$/, '') : value
  const joinMatch = /^([^:]+):([^:]+):([^:]*):?/.exec(prefix)

  if (joinMatch) {
    const claim = joinMatch[1]?.trim() ?? ''
    const groupId = joinMatch[2]?.trim() ?? ''
    const joinToken = joinMatch[3] ?? ''
    if (!claim || !groupId) return null
    const join = joinFromToken(joinToken, joined)
    return {
      claim,
      groupId,
      values: joined ? splitClaimMapValues(joined, join) : [],
      join,
    }
  }

  const idx = value.indexOf(':')
  if (idx < 0) return null
  const claim = value.slice(0, idx).trim()
  const rest = value.slice(idx + 1).trim()
  const [groupId] = rest.split(/\s+/, 1)
  if (!groupId) return null
  const join = detectJoin(joined)
  return {
    claim,
    groupId,
    values: joined ? splitClaimMapValues(joined, join) : [],
    join,
  }
}

function parseClaimMaps(values: string[]): Oauth2ClaimMap[] {
  return values
    .map(parseClaimMapValue)
    .filter((entry): entry is Oauth2ClaimMap => entry !== null)
}

function parseClientType(entry: Entry): Oauth2ClientType {
  const classes = listAttr(entry, 'class').map((value) => value.toLowerCase())
  if (classes.includes('oauth2_resource_server_basic')) return 'basic'
  if (classes.includes('oauth2_resource_server_public')) return 'public'
  return 'unknown'
}

function parseOauth2Summary(entry: Entry): Oauth2ClientSummary {
  const name = firstAttr(entry, 'name')
  const displayName = firstAttr(entry, 'displayname') || name
  return {
    uuid: firstAttr(entry, 'uuid'),
    name,
    displayName,
    type: parseClientType(entry),
    landingUrl: firstAttr(entry, 'oauth2_rs_origin_landing') || null,
  }
}

function parseOauth2Detail(entry: Entry): Oauth2ClientDetail {
  const name = firstAttr(entry, 'name')
  const consentPrompt = parseOptionalBool(entry, 'oauth2_consent_prompt_enable')
  return {
    uuid: firstAttr(entry, 'uuid'),
    name,
    displayName: firstAttr(entry, 'displayname') || name,
    description: firstAttr(entry, 'description') || null,
    type: parseClientType(entry),
    landingUrl: firstAttr(entry, 'oauth2_rs_origin_landing') || null,
    redirectUrls: listAttr(entry, 'oauth2_rs_origin'),
    scopeMaps: parseScopeMaps(listAttr(entry, 'oauth2_rs_scope_map')),
    supScopeMaps: parseScopeMaps(listAttr(entry, 'oauth2_rs_sup_scope_map')),
    claimMaps: parseClaimMaps(listAttr(entry, 'oauth2_rs_claim_map')),
    allowInsecurePkce: parseBool(entry, 'oauth2_allow_insecure_client_disable_pkce'),
    allowLocalhostRedirect: parseBool(entry, 'oauth2_allow_localhost_redirect'),
    legacyCrypto: parseBool(entry, 'oauth2_jwt_legacy_crypto_enable'),
    preferShortUsername: parseBool(entry, 'oauth2_prefer_short_username'),
    strictRedirectUri: parseBool(entry, 'oauth2_strict_redirect_uri'),
    consentPromptEnabled: consentPrompt,
    deviceFlowEnabled: parseBool(entry, 'oauth2_device_flow_enable'),
    visibility: {
      landing: hasAttr(entry, 'oauth2_rs_origin_landing'),
      redirectUrls: hasAttr(entry, 'oauth2_rs_origin'),
      security:
        hasAttr(entry, 'oauth2_allow_insecure_client_disable_pkce') ||
        hasAttr(entry, 'oauth2_strict_redirect_uri') ||
        hasAttr(entry, 'oauth2_jwt_legacy_crypto_enable') ||
        hasAttr(entry, 'oauth2_allow_localhost_redirect') ||
        hasAttr(entry, 'oauth2_prefer_short_username') ||
        hasAttr(entry, 'oauth2_consent_prompt_enable'),
      scopeMap: hasAttr(entry, 'oauth2_rs_scope_map'),
      supScopeMap: hasAttr(entry, 'oauth2_rs_sup_scope_map'),
      claimMap: hasAttr(entry, 'oauth2_rs_claim_map'),
    },
  }
}

export async function fetchOauth2Clients(): Promise<Oauth2ClientSummary[]> {
  const entries = await apiRequest<Oauth2ListResponse>('/v1/oauth2', 'get')
  return Array.isArray(entries) ? entries.map(parseOauth2Summary) : []
}

export async function fetchOauth2Client(
  name: string,
): Promise<Oauth2ClientDetail | null> {
  const entry = await apiRequest<Oauth2DetailResponse | null>(
    `/v1/oauth2/${encodeURIComponent(name)}`,
    'get',
  )
  if (!entry) return null
  return parseOauth2Detail(entry)
}

export async function createOauth2Client(input: {
  name: string
  displayName: string
  landingUrl: string
  type: 'basic' | 'public'
}) {
  const path = input.type === 'public' ? '/v1/oauth2/_public' : '/v1/oauth2/_basic'
  await apiRequest(path, 'post', {
    body: {
      attrs: {
        name: [input.name],
        displayname: [input.displayName],
        oauth2_rs_origin_landing: [input.landingUrl],
        oauth2_strict_redirect_uri: ['true'],
      },
    },
  })
}

export async function updateOauth2Client(input: {
  id: string
  name?: string
  displayName?: string
  landingUrl?: string
  description?: string
}) {
  const attrs: Record<string, string[]> = {}
  if (input.name) {
    attrs.name = [input.name]
  }
  if (input.displayName) {
    attrs.displayname = [input.displayName]
  }
  if (input.landingUrl) {
    attrs.oauth2_rs_origin_landing = [input.landingUrl]
  }
  if (input.description !== undefined) {
    if (input.description) {
      attrs.description = [input.description]
    } else {
      attrs.description = []
    }
  }
  if (Object.keys(attrs).length === 0) return
  await apiRequest(`/v1/oauth2/${encodeURIComponent(input.id)}`, 'patch', {
    body: { attrs },
  })
}

export async function deleteOauth2Client(id: string) {
  await apiRequest(`/v1/oauth2/${encodeURIComponent(id)}`, 'delete')
}

export async function addOauth2Redirect(id: string, url: string) {
  await apiRequest(
    `/v1/oauth2/${encodeURIComponent(id)}/_attr/oauth2_rs_origin`,
    'post',
    { body: [url] },
  )
}

export async function removeOauth2Redirect(id: string, url: string) {
  await apiRequest(
    `/v1/oauth2/${encodeURIComponent(id)}/_attr/oauth2_rs_origin`,
    'delete',
    { body: [url] },
  )
}

export async function updateOauth2ScopeMap(
  id: string,
  group: string,
  scopes: string[],
) {
  await apiRequest(
    `/v1/oauth2/${encodeURIComponent(id)}/_scopemap/${encodeURIComponent(group)}`,
    'post',
    { body: scopes },
  )
}

export async function deleteOauth2ScopeMap(id: string, group: string) {
  await apiRequest(
    `/v1/oauth2/${encodeURIComponent(id)}/_scopemap/${encodeURIComponent(group)}`,
    'delete',
  )
}

export async function updateOauth2SupScopeMap(
  id: string,
  group: string,
  scopes: string[],
) {
  await apiRequest(
    `/v1/oauth2/${encodeURIComponent(id)}/_sup_scopemap/${encodeURIComponent(group)}`,
    'post',
    { body: scopes },
  )
}

export async function deleteOauth2SupScopeMap(id: string, group: string) {
  await apiRequest(
    `/v1/oauth2/${encodeURIComponent(id)}/_sup_scopemap/${encodeURIComponent(group)}`,
    'delete',
  )
}

export async function updateOauth2ClaimMap(
  id: string,
  claim: string,
  group: string,
  values: string[],
) {
  await apiRequest(
    `/v1/oauth2/${encodeURIComponent(id)}/_claimmap/${encodeURIComponent(
      claim,
    )}/${encodeURIComponent(group)}`,
    'post',
    { body: values },
  )
}

export async function deleteOauth2ClaimMap(
  id: string,
  claim: string,
  group: string,
) {
  await apiRequest(
    `/v1/oauth2/${encodeURIComponent(id)}/_claimmap/${encodeURIComponent(
      claim,
    )}/${encodeURIComponent(group)}`,
    'delete',
  )
}

export async function updateOauth2ClaimJoin(
  id: string,
  claim: string,
  join: Oauth2ClaimJoin,
) {
  await apiRequest(
    `/v1/oauth2/${encodeURIComponent(id)}/_claimmap/${encodeURIComponent(
      claim,
    )}`,
    'post',
    { body: join },
  )
}

export async function fetchOauth2BasicSecret(
  id: string,
): Promise<string | null> {
  const secret = await apiRequest(
    `/v1/oauth2/${encodeURIComponent(id)}/_basic_secret`,
    'get',
  )
  return secret as string | null
}

export async function resetOauth2BasicSecret(id: string) {
  await apiRequest(`/v1/oauth2/${encodeURIComponent(id)}`, 'patch', {
    body: {
      attrs: {
        oauth2_rs_basic_secret: [],
      },
    },
  })
}

export async function setOauth2BooleanAttr(
  id: string,
  attr: string,
  value: boolean,
) {
  await apiRequest(`/v1/oauth2/${encodeURIComponent(id)}`, 'patch', {
    body: {
      attrs: {
        [attr]: [value ? 'true' : 'false'],
      },
    },
  })
}

export async function clearOauth2Attr(id: string, attr: string) {
  await apiRequest(
    `/v1/oauth2/${encodeURIComponent(id)}/_attr/${encodeURIComponent(attr)}`,
    'delete',
  )
}

export async function uploadOauth2Image(id: string, file: File) {
  if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
    throw new Error(
      'Image is too large. Maximum upload size is 256 KiB.',
    )
  }

  const contentType = file.type || imageTypeFromFilename(file.name) || ''
  if (!VALID_IMAGE_CONTENT_TYPES.has(contentType)) {
    throw new Error(
      'Unsupported image type. Use JPEG, PNG, GIF, SVG, or WebP.',
    )
  }

  const uploadFile =
    file.type === contentType ? file : new File([file], file.name, { type: contentType })

  const formData = new FormData()
  formData.append('image', uploadFile, uploadFile.name)

  const headers = new Headers()
  const token = tokenStore.get()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(
    `${baseUrl}/v1/oauth2/${encodeURIComponent(id)}/_image`,
    {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    },
  )

  if (!response.ok) {
    const text = await response.text()
    if (response.status === 500 && text.includes('invalidrequeststate')) {
      throw new Error(
        'Server rejected the image. Ensure it is <= 256 KiB, valid JPEG/PNG/GIF/SVG/WebP, and within 1024x1024.',
      )
    }
    throw new Error(`Request failed (${response.status}): ${text}`)
  }
}

export async function deleteOauth2Image(id: string) {
  await apiRequest(`/v1/oauth2/${encodeURIComponent(id)}/_image`, 'delete')
}

export async function fetchOauth2ImageObjectUrl(id: string): Promise<string | null> {
  const headers = new Headers()
  const token = tokenStore.get()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(
    `${baseUrl}/ui/images/oauth2/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      headers,
      credentials: 'include',
    },
  )

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
