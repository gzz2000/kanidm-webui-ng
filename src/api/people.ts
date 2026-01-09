import type { components, paths } from './schema'
import { apiRequest } from './client'
import { request } from './http'

type Entry = components['schemas']['Entry']
type PersonListResponse = paths['/v1/person']['get']['responses'][200]['content']['application/json']
type PersonDetailResponse = paths['/v1/person/{id}']['get']['responses'][200]['content']['application/json']

type UnixUserToken = components['schemas']['UnixUserToken']

export type PersonSummary = {
  uuid: string
  name: string
  displayName: string
  emails: string[]
  memberOf: string[]
  accountValidFrom: string | null
  accountExpire: string | null
}

export type PersonDetail = {
  uuid: string
  name: string
  displayName: string
  legalName: string | null
  emails: string[]
  memberOf: string[]
  directMemberOf: string[]
  passkeys: string[] | null
  attestedPasskeys: string[] | null
  accountValidFrom: string | null
  accountExpire: string | null
}

function firstAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) && value.length > 0 ? value[0] : ''
}

function listAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  return Array.isArray(value) ? value : []
}

function optionalListAttr(entry: Entry, key: string) {
  const value = entry.attrs?.[key]
  if (!value) return null
  return Array.isArray(value) ? value : null
}

function parsePerson(entry: Entry): PersonSummary {
  const name = firstAttr(entry, 'name') || firstAttr(entry, 'spn')
  const displayName = firstAttr(entry, 'displayname') || name
  return {
    uuid: firstAttr(entry, 'uuid'),
    name,
    displayName,
    emails: listAttr(entry, 'mail'),
    memberOf: listAttr(entry, 'memberof'),
    accountValidFrom: firstAttr(entry, 'account_valid_from') || null,
    accountExpire: firstAttr(entry, 'account_expire') || null,
  }
}

function parsePersonDetail(entry: Entry): PersonDetail {
  const name = firstAttr(entry, 'name') || firstAttr(entry, 'spn')
  const displayName = firstAttr(entry, 'displayname') || name
  return {
    uuid: firstAttr(entry, 'uuid'),
    name,
    displayName,
    legalName: firstAttr(entry, 'legalname') || null,
    emails: listAttr(entry, 'mail'),
    memberOf: listAttr(entry, 'memberof'),
    directMemberOf: listAttr(entry, 'directmemberof'),
    passkeys: optionalListAttr(entry, 'passkeys'),
    attestedPasskeys: optionalListAttr(entry, 'attested_passkeys'),
    accountValidFrom: firstAttr(entry, 'account_valid_from') || null,
    accountExpire: firstAttr(entry, 'account_expire') || null,
  }
}

export async function fetchPeople(): Promise<PersonSummary[]> {
  const entries = await apiRequest('/v1/person', 'get')
  return (entries as PersonListResponse).map(parsePerson)
}

export async function searchPeople(query: string): Promise<PersonSummary[]> {
  const entries = await apiRequest(`/v1/person/_search/${encodeURIComponent(query)}`, 'get')
  return (entries as PersonListResponse).map(parsePerson)
}

export async function fetchPerson(id: string): Promise<PersonDetail | null> {
  const entry = await apiRequest(`/v1/person/${encodeURIComponent(id)}`, 'get')
  if (!entry) return null
  return parsePersonDetail(entry as PersonDetailResponse)
}

export async function createPerson(input: { name: string; displayName: string }) {
  await apiRequest('/v1/person', 'post', {
    body: {
      attrs: {
        name: [input.name],
        displayname: [input.displayName],
      },
    },
  })
}

export async function updatePerson(input: {
  id: string
  name?: string
  displayName?: string
  legalName?: string
  emails?: string[]
}) {
  const attrs: Record<string, string[]> = {}

  if (input.name) {
    attrs.name = [input.name]
  }
  if (input.displayName) {
    attrs.displayname = [input.displayName]
  }
  if (input.legalName) {
    attrs.legalname = [input.legalName]
  }
  if (input.emails && input.emails.length > 0) {
    attrs.mail = input.emails
  }

  if (Object.keys(attrs).length > 0) {
    await apiRequest(`/v1/person/${encodeURIComponent(input.id)}`, 'patch', {
      body: {
        attrs,
      },
    })
  }

  if (input.emails && input.emails.length === 0) {
    await apiRequest(`/v1/person/${encodeURIComponent(input.id)}/_attr/mail`, 'delete')
  }
}

export async function setPersonAttr(
  id: string,
  attr: string,
  values: string[],
) {
  await apiRequest(`/v1/person/${encodeURIComponent(id)}/_attr/${attr}`, 'put', {
    body: values,
  })
}

export async function clearPersonAttr(id: string, attr: string) {
  await apiRequest(`/v1/person/${encodeURIComponent(id)}/_attr/${attr}`, 'delete')
}

export type CredentialResetToken = {
  token: string
  expiry_time?: string
}

export async function createCredentialResetToken(
  id: string,
  ttl?: number,
): Promise<CredentialResetToken> {
  const path = ttl
    ? `/v1/person/${encodeURIComponent(id)}/_credential/_update_intent/${ttl}`
    : `/v1/person/${encodeURIComponent(id)}/_credential/_update_intent`
  return request<CredentialResetToken>(path, { method: 'GET' })
}

export async function fetchUnixToken(id: string): Promise<UnixUserToken> {
  return request<UnixUserToken>(`/v1/account/${encodeURIComponent(id)}/_unix/_token`, {
    method: 'GET',
  })
}

export async function setPersonUnix(
  id: string,
  input: { gidnumber?: number; shell?: string },
) {
  await apiRequest(`/v1/person/${encodeURIComponent(id)}/_unix`, 'post', {
    body: input,
  })
}
