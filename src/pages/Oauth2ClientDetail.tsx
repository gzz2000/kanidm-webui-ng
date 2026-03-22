import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import AccountGroupSelect from '../components/AccountGroupSelect'
import ImageEditor from '../components/ImageEditor'
import {
  addOauth2Redirect,
  clearOauth2Attr,
  deleteOauth2ClaimMap,
  deleteOauth2Client,
  deleteOauth2Image,
  deleteOauth2ScopeMap,
  deleteOauth2SupScopeMap,
  fetchGroups,
  fetchOauth2BasicSecret,
  fetchOauth2Client,
  fetchOauth2ImageObjectUrl,
  removeOauth2Redirect,
  resetOauth2BasicSecret,
  setOauth2BooleanAttr,
  updateOauth2ClaimJoin,
  updateOauth2ClaimMap,
  updateOauth2Client,
  updateOauth2ScopeMap,
  updateOauth2SupScopeMap,
  uploadOauth2Image,
} from '../api'
import type { GroupSummary } from '../api/groups'
import type {
  Oauth2ClaimJoin,
  Oauth2ClaimMap,
  Oauth2ClientDetail,
} from '../api/oauth2'
import { useAccess } from '../auth/AccessContext'
import { isOauth2Admin, normalizeGroupName } from '../utils/groupAccess'
import { stripDomain } from '../utils/strings'

type ClaimGroup = {
  claim: string
  join: Oauth2ClaimJoin
  entries: Oauth2ClaimMap[]
}

function parseScopeInput(input: string) {
  return input
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function mapGroupKey(value: string) {
  return normalizeGroupName(stripDomain(value)).toLowerCase()
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function hasGroupMap<T extends { groupId: string }>(entries: T[], group: string) {
  const target = mapGroupKey(group)
  return entries.some((entry) => mapGroupKey(entry.groupId) === target)
}

function hasClaimMap(
  entries: Oauth2ClaimMap[],
  claim: string,
  group: string,
) {
  const target = mapGroupKey(group)
  return entries.some((entry) => entry.claim === claim && mapGroupKey(entry.groupId) === target)
}

export default function Oauth2ClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { canEdit, requestReauth, memberOf } = useAccess()
  const queryClient = useQueryClient()
  const isAdmin = isOauth2Admin(memberOf)
  const [client, setClient] = useState<Oauth2ClientDetail | null>(null)
  const [pageMessage, setPageMessage] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [landingUrl, setLandingUrl] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')

  const [identityMessage, setIdentityMessage] = useState<string | null>(null)
  const [redirectMessage, setRedirectMessage] = useState<string | null>(null)
  const [securityMessage, setSecurityMessage] = useState<string | null>(null)
  const [scopeMessage, setScopeMessage] = useState<string | null>(null)
  const [supScopeMessage, setSupScopeMessage] = useState<string | null>(null)
  const [claimMessage, setClaimMessage] = useState<string | null>(null)
  const [secretMessage, setSecretMessage] = useState<string | null>(null)
  const [imageMessage, setImageMessage] = useState<string | null>(null)

  const [scopeGroup, setScopeGroup] = useState('')
  const [scopeValues, setScopeValues] = useState('')
  const [supScopeGroup, setSupScopeGroup] = useState('')
  const [supScopeValues, setSupScopeValues] = useState('')
  const [claimName, setClaimName] = useState('')
  const [claimGroup, setClaimGroup] = useState('')
  const [claimValues, setClaimValues] = useState('')
  const [claimJoin, setClaimJoin] = useState<Oauth2ClaimJoin>('array')

  const [pkceRequired, setPkceRequired] = useState(true)
  const [strictRedirect, setStrictRedirect] = useState(true)
  const [legacyCrypto, setLegacyCrypto] = useState(false)
  const [allowLocalhost, setAllowLocalhost] = useState(false)
  const [preferShortName, setPreferShortName] = useState(false)
  const [consentPrompt, setConsentPrompt] = useState(true)
  const [consentPromptDefault, setConsentPromptDefault] = useState(false)
  const [securityDirty, setSecurityDirty] = useState(false)

  const [secret, setSecret] = useState<string | null>(null)
  const [secretLoading, setSecretLoading] = useState(false)
  const [imageVersion, setImageVersion] = useState(0)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [configCopyTip, setConfigCopyTip] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [scopeConfirmGroup, setScopeConfirmGroup] = useState<string | null>(null)
  const [supScopeConfirmGroup, setSupScopeConfirmGroup] = useState<string | null>(null)
  const [claimConfirmKey, setClaimConfirmKey] = useState<string | null>(null)
  const [redirectConfirmUrl, setRedirectConfirmUrl] = useState<string | null>(null)

  const claimGroups = useMemo<ClaimGroup[]>(() => {
    if (!client) return []
    const map = new Map<string, ClaimGroup>()
    for (const entry of client.claimMaps) {
      const existing = map.get(entry.claim)
      if (existing) {
        existing.entries.push(entry)
      } else {
        map.set(entry.claim, {
          claim: entry.claim,
          join: entry.join,
          entries: [entry],
        })
      }
    }
    return Array.from(map.values())
  }, [client])

  const scopeEditing = useMemo(() => {
    const group = scopeGroup.trim()
    if (!client || !group) return false
    return hasGroupMap(client.scopeMaps, group)
  }, [client, scopeGroup])

  const supScopeEditing = useMemo(() => {
    const group = supScopeGroup.trim()
    if (!client || !group) return false
    return hasGroupMap(client.supScopeMaps, group)
  }, [client, supScopeGroup])

  const claimEditing = useMemo(() => {
    const claim = claimName.trim()
    const group = claimGroup.trim()
    if (!client || !claim || !group) return false
    return hasClaimMap(client.claimMaps, claim, group)
  }, [client, claimGroup, claimName])

  const applyClient = useCallback(
    (
      entry: Oauth2ClientDetail,
      options: {
        syncIdentity?: boolean
        syncLanding?: boolean
        syncSecurity?: boolean
      } = {},
    ) => {
      setClient(entry)
      if (options.syncIdentity) {
        setName(entry.name)
        setDisplayName(entry.displayName)
        setDescription(entry.description ?? '')
      }
      if (options.syncLanding) {
        setLandingUrl(entry.landingUrl ?? '')
      }
      if (options.syncSecurity) {
        setPkceRequired(!entry.allowInsecurePkce)
        setStrictRedirect(entry.strictRedirectUri)
        setLegacyCrypto(entry.legacyCrypto)
        setAllowLocalhost(entry.allowLocalhostRedirect)
        setPreferShortName(entry.preferShortUsername)
        setConsentPromptDefault(entry.consentPromptEnabled === null)
        setConsentPrompt(entry.consentPromptEnabled ?? true)
        setSecurityDirty(false)
      }
    },
    [],
  )

  const clientQuery = useQuery({
    queryKey: ['oauth2-client-detail', id],
    queryFn: async () => {
      if (!id) return null
      return fetchOauth2Client(id)
    },
    enabled: Boolean(id),
  })

  const groupsQuery = useQuery({
    queryKey: ['groups', 'for-oauth2-client-detail'],
    queryFn: fetchGroups,
  })
  const groups: GroupSummary[] = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data])

  const groupLookup = useMemo(() => {
    const map = new Map<string, GroupSummary>()
    for (const group of groups) {
      map.set(group.uuid, group)
      map.set(group.name.toLowerCase(), group)
    }
    return map
  }, [groups])

  const resolveGroupLabel = useCallback(
    (groupId: string) => {
      const group = groupLookup.get(groupId) ?? groupLookup.get(groupId.toLowerCase())
      if (!group) return stripDomain(groupId)
      const shortName = stripDomain(group.name)
      const shortDisplay = stripDomain(group.displayName)
      if (!shortDisplay || shortDisplay === shortName) {
        return shortName
      }
      return `${group.displayName} (${shortName})`
    },
    [groupLookup],
  )

  const imageQuery = useQuery({
    queryKey: ['oauth2-client-image', client?.name, imageVersion],
    queryFn: async () => {
      if (!client) return null
      return fetchOauth2ImageObjectUrl(client.name)
    },
    enabled: Boolean(client),
  })

  useEffect(() => {
    if (clientQuery.isLoading) return
    if (clientQuery.error) {
      setPageMessage(clientQuery.error instanceof Error ? clientQuery.error.message : t('oauth2.messages.loadFailed'))
      setClient(null)
      return
    }
    const entry = clientQuery.data
    if (!entry) {
      setPageMessage(t('oauth2.detail.notFound'))
      setClient(null)
      return
    }
    setPageMessage(null)
    applyClient(entry, { syncIdentity: true, syncLanding: true, syncSecurity: true })
  }, [applyClient, clientQuery.data, clientQuery.error, clientQuery.isLoading, t])

  useEffect(() => {
    if (imageQuery.error) {
      setImageSrc((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      return
    }
    setImageSrc((current) => {
      const next = imageQuery.data ?? null
      if (current && current !== next) URL.revokeObjectURL(current)
      return next
    })
  }, [imageQuery.data, imageQuery.error])

  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc)
    }
  }, [imageSrc])

  const requestReauthIfNeeded = () => {
    if (!canEdit && isAdmin) {
      requestReauth()
      return true
    }
    return false
  }

  const integrationItems = useMemo(() => {
    if (!client) return []
    const origin = window.location.origin
    const clientId = encodeURIComponent(client.name)
    const issuer = `${origin}/oauth2/openid/${clientId}`
    return [
      { key: 'clientId', label: t('oauth2.integration.clientId'), value: client.name },
      { key: 'issuer', label: t('oauth2.integration.issuer'), value: issuer },
      {
        key: 'discovery',
        label: t('oauth2.integration.discovery'),
        value: `${issuer}/.well-known/openid-configuration`,
      },
      { key: 'authorizeUi', label: t('oauth2.integration.authorizeUi'), value: `${origin}/oauth2-ui/authorise` },
      { key: 'token', label: t('oauth2.integration.token'), value: `${issuer}/token` },
      { key: 'userinfo', label: t('oauth2.integration.userinfo'), value: `${issuer}/userinfo` },
      { key: 'jwks', label: t('oauth2.integration.jwks'), value: `${issuer}/public_key.jwk` },
      { key: 'introspect', label: t('oauth2.integration.introspect'), value: `${issuer}/introspect` },
      { key: 'revoke', label: t('oauth2.integration.revoke'), value: `${issuer}/token/revoke` },
    ]
  }, [client, t])

  const handleConfigCopy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setConfigCopyTip(key)
    window.setTimeout(() => setConfigCopyTip((current) => (current === key ? null : current)), 1600)
  }

  const refreshClientMaps = useCallback(
    async (clientName: string) => {
      const latest = await fetchOauth2Client(clientName)
      if (!latest) return
      queryClient.setQueryData(['oauth2-client-detail', latest.name], latest)
      if (id && id !== latest.name) {
        queryClient.setQueryData(['oauth2-client-detail', id], latest)
      }
      void queryClient.invalidateQueries({ queryKey: ['oauth2-clients-list'] })
      setClient((prev) => {
        if (!prev) return latest
        return {
          ...prev,
          scopeMaps: latest.scopeMaps,
          supScopeMaps: latest.supScopeMaps,
          claimMaps: latest.claimMaps,
        }
      })
    },
    [id, queryClient],
  )

  const syncOauth2ClientCache = useCallback(
    (nextClient: Oauth2ClientDetail, originalId?: string) => {
      queryClient.setQueryData(['oauth2-client-detail', nextClient.name], nextClient)
      if (originalId && originalId !== nextClient.name) {
        queryClient.setQueryData(['oauth2-client-detail', originalId], nextClient)
      }
      void queryClient.invalidateQueries({ queryKey: ['oauth2-clients-list'] })
    },
    [queryClient],
  )

  const handleIdentitySave = async () => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    setIdentityMessage(null)
    try {
      const trimmedName = name.trim()
      const trimmedDisplay = displayName.trim()
      const trimmedDescription = description.trim()
      await updateOauth2Client({
        id: client.name,
        name: trimmedName !== client.name ? trimmedName : undefined,
        displayName:
          trimmedDisplay !== client.displayName ? trimmedDisplay : undefined,
        description:
          trimmedDescription !== (client.description ?? '')
            ? trimmedDescription
            : undefined,
      })
      const nextClient = {
        ...client,
        name: trimmedName || client.name,
        displayName: trimmedDisplay || client.displayName,
        description: trimmedDescription || null,
      }
      syncOauth2ClientCache(nextClient, client.name)
      setClient(nextClient)
      setName(nextClient.name)
      setDisplayName(nextClient.displayName)
      setDescription(nextClient.description ?? '')
      setIdentityMessage(t('oauth2.messages.identityUpdated'))
      if (trimmedName && trimmedName !== client.name) {
        navigate(`/admin/oauth2/${encodeURIComponent(trimmedName)}`, { replace: true })
      }
    } catch (error) {
      setIdentityMessage(errorMessage(error, t('oauth2.messages.identityFailed')))
    }
  }

  const handleLandingSave = async () => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    setRedirectMessage(null)
    try {
      await updateOauth2Client({
        id: client.name,
        landingUrl: landingUrl.trim(),
      })
      const nextLanding = landingUrl.trim()
      const nextClient = { ...client, landingUrl: nextLanding || null }
      syncOauth2ClientCache(nextClient, client.name)
      setClient(nextClient)
      setRedirectMessage(t('oauth2.messages.landingUpdated'))
    } catch (error) {
      setRedirectMessage(errorMessage(error, t('oauth2.messages.landingFailed')))
    }
  }

  const handleAddRedirect = async () => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    const url = redirectUrl.trim()
    if (!url) return
    setRedirectMessage(null)
    try {
      await addOauth2Redirect(client.name, url)
      setRedirectUrl('')
      if (!client.redirectUrls.includes(url)) {
        const nextClient = { ...client, redirectUrls: [...client.redirectUrls, url] }
        syncOauth2ClientCache(nextClient, client.name)
        setClient(nextClient)
      }
      setRedirectMessage(t('oauth2.messages.redirectAdded'))
    } catch (error) {
      setRedirectMessage(errorMessage(error, t('oauth2.messages.redirectAddFailed')))
    }
  }

  const handleRemoveRedirect = async (url: string) => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    setRedirectMessage(null)
    try {
      await removeOauth2Redirect(client.name, url)
      setRedirectConfirmUrl(null)
      const nextClient = {
        ...client,
        redirectUrls: client.redirectUrls.filter((item) => item !== url),
      }
      syncOauth2ClientCache(nextClient, client.name)
      setClient(nextClient)
      setRedirectMessage(t('oauth2.messages.redirectRemoved'))
    } catch (error) {
      setRedirectMessage(errorMessage(error, t('oauth2.messages.redirectRemoveFailed')))
    }
  }

  const handleSaveSecurity = async () => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    setSecurityMessage(null)
    const updates: Promise<void>[] = []

    if (pkceRequired !== !client.allowInsecurePkce) {
      if (pkceRequired) {
        updates.push(clearOauth2Attr(client.name, 'oauth2_allow_insecure_client_disable_pkce'))
      } else {
        updates.push(
          setOauth2BooleanAttr(
            client.name,
            'oauth2_allow_insecure_client_disable_pkce',
            true,
          ),
        )
      }
    }

    if (strictRedirect !== client.strictRedirectUri) {
      updates.push(
        setOauth2BooleanAttr(client.name, 'oauth2_strict_redirect_uri', strictRedirect),
      )
    }

    if (legacyCrypto !== client.legacyCrypto) {
      updates.push(
        setOauth2BooleanAttr(client.name, 'oauth2_jwt_legacy_crypto_enable', legacyCrypto),
      )
    }

    if (allowLocalhost !== client.allowLocalhostRedirect) {
      updates.push(
        setOauth2BooleanAttr(client.name, 'oauth2_allow_localhost_redirect', allowLocalhost),
      )
    }

    if (preferShortName !== client.preferShortUsername) {
      updates.push(
        setOauth2BooleanAttr(client.name, 'oauth2_prefer_short_username', preferShortName),
      )
    }

    if (client.type === 'basic') {
      const currentConsent = client.consentPromptEnabled ?? true
      if (consentPrompt !== currentConsent) {
        updates.push(
          setOauth2BooleanAttr(client.name, 'oauth2_consent_prompt_enable', consentPrompt),
        )
      }
    }

    if (updates.length === 0) {
      setSecurityMessage(t('oauth2.messages.noChanges'))
      return
    }

    try {
      await Promise.all(updates)
      const nextClient = {
        ...client,
        allowInsecurePkce: !pkceRequired,
        strictRedirectUri: strictRedirect,
        legacyCrypto,
        allowLocalhostRedirect: allowLocalhost,
        preferShortUsername: preferShortName,
        consentPromptEnabled: client.type === 'basic' ? consentPrompt : client.consentPromptEnabled,
      }
      syncOauth2ClientCache(nextClient, client.name)
      setClient(nextClient)
      if (client.type === 'basic') {
        setConsentPromptDefault(false)
      }
      setSecurityDirty(false)
      setSecurityMessage(t('oauth2.messages.securitySaved'))
    } catch (error) {
      setSecurityMessage(error instanceof Error ? error.message : t('oauth2.messages.securityFailed'))
    }
  }

  const handleAddScopeMap = async () => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    const group = scopeGroup.trim()
    const scopes = parseScopeInput(scopeValues)
    if (!group || scopes.length === 0) {
      setScopeMessage(t('oauth2.messages.scopeInputRequired'))
      return
    }
    setScopeMessage(null)
    try {
      await updateOauth2ScopeMap(client.name, group, scopes)
      setScopeGroup('')
      setScopeValues('')
      await refreshClientMaps(client.name)
      setScopeMessage(t('oauth2.messages.scopeSaved'))
    } catch (error) {
      setScopeMessage(error instanceof Error ? error.message : t('oauth2.messages.scopeSaveFailed'))
    }
  }

  const handleEditScopeMap = (groupId: string, scopes: string[]) => {
    if (requestReauthIfNeeded()) return
    setScopeGroup(normalizeGroupName(groupId))
    setScopeValues(scopes.join(' '))
    setScopeMessage(null)
  }

  const handleRemoveScopeMap = async (groupId: string) => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    setScopeMessage(null)
    try {
      await deleteOauth2ScopeMap(client.name, groupId)
      setScopeConfirmGroup(null)
      await refreshClientMaps(client.name)
      setScopeMessage(t('oauth2.messages.scopeRemoved'))
    } catch (error) {
      setScopeMessage(error instanceof Error ? error.message : t('oauth2.messages.scopeRemoveFailed'))
    }
  }

  const handleAddSupScopeMap = async () => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    const group = supScopeGroup.trim()
    const scopes = parseScopeInput(supScopeValues)
    if (!group || scopes.length === 0) {
      setSupScopeMessage(t('oauth2.messages.scopeInputRequired'))
      return
    }
    setSupScopeMessage(null)
    try {
      await updateOauth2SupScopeMap(client.name, group, scopes)
      setSupScopeGroup('')
      setSupScopeValues('')
      await refreshClientMaps(client.name)
      setSupScopeMessage(t('oauth2.messages.supScopeSaved'))
    } catch (error) {
      setSupScopeMessage(error instanceof Error ? error.message : t('oauth2.messages.supScopeSaveFailed'))
    }
  }

  const handleEditSupScopeMap = (groupId: string, scopes: string[]) => {
    if (requestReauthIfNeeded()) return
    setSupScopeGroup(normalizeGroupName(groupId))
    setSupScopeValues(scopes.join(' '))
    setSupScopeMessage(null)
  }

  const handleRemoveSupScopeMap = async (groupId: string) => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    setSupScopeMessage(null)
    try {
      await deleteOauth2SupScopeMap(client.name, groupId)
      setSupScopeConfirmGroup(null)
      await refreshClientMaps(client.name)
      setSupScopeMessage(t('oauth2.messages.supScopeRemoved'))
    } catch (error) {
      setSupScopeMessage(error instanceof Error ? error.message : t('oauth2.messages.supScopeRemoveFailed'))
    }
  }

  const handleAddClaimMap = async () => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    const claim = claimName.trim()
    const group = claimGroup.trim()
    const values = parseScopeInput(claimValues)
    if (!claim || !group || values.length === 0) {
      setClaimMessage(t('oauth2.messages.claimInputRequired'))
      return
    }
    setClaimMessage(null)
    try {
      await updateOauth2ClaimMap(client.name, claim, group, values)
      await updateOauth2ClaimJoin(client.name, claim, claimJoin)
      setClaimName('')
      setClaimGroup('')
      setClaimValues('')
      setClaimJoin('array')
      await refreshClientMaps(client.name)
      setClaimMessage(t('oauth2.messages.claimSaved'))
    } catch (error) {
      setClaimMessage(error instanceof Error ? error.message : t('oauth2.messages.claimSaveFailed'))
    }
  }

  const handleEditClaimMap = (entry: Oauth2ClaimMap) => {
    if (requestReauthIfNeeded()) return
    setClaimName(entry.claim)
    setClaimGroup(normalizeGroupName(entry.groupId))
    setClaimValues(entry.values.join(' '))
    setClaimJoin(entry.join)
    setClaimMessage(null)
  }

  const handleRemoveClaimMap = async (claim: string, groupId: string) => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    setClaimMessage(null)
    try {
      await deleteOauth2ClaimMap(client.name, claim, groupId)
      setClaimConfirmKey(null)
      await refreshClientMaps(client.name)
      setClaimMessage(t('oauth2.messages.claimRemoved'))
    } catch (error) {
      setClaimMessage(error instanceof Error ? error.message : t('oauth2.messages.claimRemoveFailed'))
    }
  }

  const handleSecretLoad = async () => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    setSecretMessage(null)
    setSecretLoading(true)
    try {
      const value = await fetchOauth2BasicSecret(client.name)
      setSecret(value)
    } catch (error) {
      setSecretMessage(error instanceof Error ? error.message : t('oauth2.messages.secretLoadFailed'))
    } finally {
      setSecretLoading(false)
    }
  }

  const handleSecretReset = async () => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    setSecretMessage(null)
    try {
      await resetOauth2BasicSecret(client.name)
      setSecret(null)
      setSecretMessage(t('oauth2.messages.secretReset'))
    } catch (error) {
      setSecretMessage(error instanceof Error ? error.message : t('oauth2.messages.secretResetFailed'))
    }
  }

  const handleImageUpload = async (file: File) => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) {
      return
    }
    setImageMessage(null)
    try {
      await uploadOauth2Image(client.name, file)
      setImageVersion((prev) => prev + 1)
      setImageMessage(t('oauth2.messages.imageUpdated'))
    } catch (error) {
      setImageMessage(error instanceof Error ? error.message : t('oauth2.messages.imageUpdateFailed'))
    }
  }

  const handleImageDelete = async () => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    setImageMessage(null)
    try {
      await deleteOauth2Image(client.name)
      setImageVersion((prev) => prev + 1)
      setImageMessage(t('oauth2.messages.imageRemoved'))
    } catch (error) {
      setImageMessage(error instanceof Error ? error.message : t('oauth2.messages.imageRemoveFailed'))
    }
  }

  const handleDeleteClient = async () => {
    if (!client || !isAdmin) return
    if (requestReauthIfNeeded()) return
    setPageMessage(null)
    try {
      await deleteOauth2Client(client.name)
      void queryClient.invalidateQueries({ queryKey: ['oauth2-clients-list'] })
      navigate('/admin/oauth2')
    } catch (error) {
      setPageMessage(error instanceof Error ? error.message : t('oauth2.messages.deleteFailed'))
    }
  }

  if (clientQuery.isLoading) {
    return (
      <section className="page oauth2-page">
        <h1>{t('oauth2.detail.title')}</h1>
        <p className="muted-text">{t('oauth2.detail.loading')}</p>
      </section>
    )
  }

  if (!client) {
    return (
      <section className="page oauth2-page">
        <h1>{t('oauth2.detail.title')}</h1>
        <p className="inline-feedback">{pageMessage ?? t('oauth2.detail.notFound')}</p>
      </section>
    )
  }

  const canViewLanding = isAdmin || client.visibility.landing
  const canViewRedirectUrls = isAdmin || client.visibility.redirectUrls
  const canViewSecurity = isAdmin || client.visibility.security
  const canViewScopeMap = isAdmin || client.visibility.scopeMap
  const canViewSupScopeMap = isAdmin || client.visibility.supScopeMap
  const canViewClaimMap = isAdmin || client.visibility.claimMap

  return (
    <section className="page oauth2-page">
      <div className="oauth2-header">
        <div>
          <h1>{client.displayName}</h1>
          <p className="page-note">{client.name}</p>
          <span className="badge badge-sharp badge-neutral oauth2-type">
            {client.type === 'basic'
              ? t('oauth2.types.basic')
              : client.type === 'public'
                ? t('oauth2.types.public')
              : t('oauth2.types.unknown')}
          </span>
        </div>
        <div className="oauth2-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => navigate('/admin/oauth2')}
          >
            {t('oauth2.actions.backToList')}
          </button>
        </div>
      </div>

      {pageMessage && <p className="inline-feedback">{pageMessage}</p>}

      <div className="card-grid oauth2-grid">
        <div className="panel-card">
          <header>
            <h2>{t('oauth2.detail.identityTitle')}</h2>
            <p>{t('oauth2.detail.identityDesc')}</p>
          </header>
          <label className="field">
            <span>{t('oauth2.create.clientName')}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onFocus={requestReauthIfNeeded}
              disabled={!isAdmin}
            />
          </label>
          <label className="field">
            <span>{t('oauth2.create.displayName')}</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              onFocus={requestReauthIfNeeded}
              disabled={!isAdmin}
            />
          </label>
          <label className="field">
            <span>{t('oauth2.detail.description')}</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onFocus={requestReauthIfNeeded}
              disabled={!isAdmin}
              placeholder={t('oauth2.detail.descriptionPlaceholder')}
            />
          </label>
          {identityMessage && <p className="inline-feedback">{identityMessage}</p>}
          {isAdmin && (
            <div className="panel-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => void handleIdentitySave()}
              >
                {t('oauth2.actions.saveIdentity')}
              </button>
            </div>
          )}
        </div>

        {(canViewLanding || canViewRedirectUrls) && (
        <div className="panel-card">
          <header>
            <h2>{t('oauth2.detail.redirectTitle')}</h2>
            <p>{t('oauth2.detail.redirectDesc')}</p>
          </header>
          {canViewLanding && (
            <>
              <label className="field">
                <span>{t('oauth2.create.landingUrl')}</span>
                <input
                  type="url"
                  value={landingUrl}
                  onChange={(event) => setLandingUrl(event.target.value)}
                  onFocus={requestReauthIfNeeded}
                  disabled={!isAdmin}
                />
              </label>
              {isAdmin && (
                <div className="panel-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleLandingSave()}
                  >
                    {t('oauth2.actions.saveLanding')}
                  </button>
                </div>
              )}
            </>
          )}

          {canViewRedirectUrls && (
          <div className="credential-section">
            <div className="section-header">
              <h3>{t('oauth2.detail.additionalRedirectTitle')}</h3>
            </div>
            {client.redirectUrls.length === 0 ? (
              <p className="muted-text">{t('oauth2.detail.redirectEmpty')}</p>
            ) : (
              <div className="token-list">
                {client.redirectUrls.map((url) => (
                  <div className="token-row" key={url}>
                    <div>
                      <div>{url}</div>
                    </div>
                    {isAdmin && (
                      <>
                        {redirectConfirmUrl === url ? (
                          <div className="ssh-confirm">
                            <span className="muted-text">{t('oauth2.detail.confirmRemoveRedirect')}</span>
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => void handleRemoveRedirect(url)}
                            >
                              {t('oauth2.actions.remove')}
                            </button>
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => setRedirectConfirmUrl(null)}
                            >
                              {t('oauth2.actions.cancel')}
                            </button>
                          </div>
                        ) : (
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => {
                              if (requestReauthIfNeeded()) return
                              setRedirectConfirmUrl(url)
                            }}
                          >
                            {t('oauth2.actions.remove')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isAdmin && (
              <>
                <label className="field">
                  <span>{t('oauth2.detail.addRedirectLabel')}</span>
                  <input
                    type="url"
                    value={redirectUrl}
                    onChange={(event) => setRedirectUrl(event.target.value)}
                    onFocus={requestReauthIfNeeded}
                    placeholder={t('oauth2.detail.addRedirectPlaceholder')}
                  />
                </label>
                <div className="panel-actions">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void handleAddRedirect()}
                  >
                    {t('oauth2.actions.addRedirect')}
                  </button>
                </div>
              </>
            )}
          </div>
          )}
          {redirectMessage && <p className="inline-feedback">{redirectMessage}</p>}
        </div>
        )}

        {canViewSecurity && (
        <div className="panel-card">
          <header>
            <h2>{t('oauth2.detail.securityTitle')}</h2>
            <p>{t('oauth2.detail.securityDesc')}</p>
          </header>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={pkceRequired}
              onChange={(event) => {
                if (requestReauthIfNeeded()) return
                setPkceRequired(event.target.checked)
                setSecurityDirty(true)
                setSecurityMessage(null)
              }}
              disabled={!isAdmin || client.type === 'public'}
            />
            {t('oauth2.detail.requirePkce')}
          </label>
          {client.type === 'public' && (
            <p className="muted-text">{t('oauth2.detail.pkceRequiredPublic')}</p>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={strictRedirect}
              onChange={(event) => {
                if (requestReauthIfNeeded()) return
                setStrictRedirect(event.target.checked)
                setSecurityDirty(true)
                setSecurityMessage(null)
              }}
              disabled={!isAdmin}
            />
            {t('oauth2.detail.strictRedirect')}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={legacyCrypto}
              onChange={(event) => {
                if (requestReauthIfNeeded()) return
                setLegacyCrypto(event.target.checked)
                setSecurityDirty(true)
                setSecurityMessage(null)
              }}
              disabled={!isAdmin}
            />
            {t('oauth2.detail.legacyCrypto')}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={allowLocalhost}
              onChange={(event) => {
                if (requestReauthIfNeeded()) return
                setAllowLocalhost(event.target.checked)
                setSecurityDirty(true)
                setSecurityMessage(null)
              }}
              disabled={!isAdmin}
            />
            {t('oauth2.detail.allowLocalhost')}
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={preferShortName}
              onChange={(event) => {
                if (requestReauthIfNeeded()) return
                setPreferShortName(event.target.checked)
                setSecurityDirty(true)
                setSecurityMessage(null)
              }}
              disabled={!isAdmin}
            />
            {t('oauth2.detail.preferShortUsername')}
          </label>
          {client.type === 'basic' && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={consentPrompt}
                  onChange={(event) => {
                    if (requestReauthIfNeeded()) return
                    setConsentPromptDefault(false)
                    setConsentPrompt(event.target.checked)
                    setSecurityDirty(true)
                    setSecurityMessage(null)
                  }}
                  disabled={!isAdmin}
                />
                {t('oauth2.detail.requireConsentPrompt')}
              </label>
              {consentPromptDefault && (
                <p className="muted-text">{t('oauth2.detail.consentDefault')}</p>
              )}
            </>
          )}
          {securityMessage && <p className="inline-feedback">{securityMessage}</p>}
          {isAdmin && (
            <div className="panel-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => void handleSaveSecurity()}
                disabled={!securityDirty}
              >
                {t('oauth2.actions.saveSecurity')}
              </button>
            </div>
          )}
        </div>
        )}

        {canViewScopeMap && (
        <div className="panel-card">
          <header>
            <h2>{t('oauth2.detail.scopeTitle')}</h2>
            <p>{t('oauth2.detail.scopeDesc')}</p>
          </header>
          <p className="muted-text">
            {t('oauth2.detail.scopeOpenid')}
          </p>
          {client.scopeMaps.length === 0 ? (
            <p className="muted-text">{t('oauth2.detail.scopeEmpty')}</p>
          ) : (
            <div className="token-list">
              {client.scopeMaps.map((entry) => (
                <div className="token-row" key={entry.groupId}>
                  <div>
                    <strong>{resolveGroupLabel(entry.groupId)}</strong>
                    <div className="oauth2-tags">
                      {entry.scopes.map((scope) => (
                        <span className="badge badge-sharp badge-neutral" key={scope}>
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isAdmin && (
                    <>
                      {scopeConfirmGroup === entry.groupId ? (
                        <div className="ssh-confirm">
                          <span className="muted-text">{t('oauth2.detail.confirmRemoveScope')}</span>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => void handleRemoveScopeMap(entry.groupId)}
                          >
                            {t('oauth2.actions.remove')}
                          </button>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => setScopeConfirmGroup(null)}
                          >
                            {t('oauth2.actions.cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className="ssh-confirm">
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => handleEditScopeMap(entry.groupId, entry.scopes)}
                          >
                            {t('oauth2.actions.edit')}
                          </button>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => {
                              if (requestReauthIfNeeded()) return
                              setScopeConfirmGroup(entry.groupId)
                            }}
                          >
                            {t('oauth2.actions.remove')}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {isAdmin && (
            <>
              <label className="field">
                <span>{t('oauth2.labels.group')}</span>
                <AccountGroupSelect
                  value={scopeGroup}
                  onChange={setScopeGroup}
                  onFocus={requestReauthIfNeeded}
                  readOnly={!canEdit && isAdmin}
                  includePeople={false}
                  includeGroups
                  includeServiceAccounts={false}
                  formatValue={(option) => normalizeGroupName(option.name)}
                />
              </label>
              <label className="field">
                <span>{t('oauth2.labels.scopes')}</span>
                <input
                  value={scopeValues}
                  onChange={(event) => setScopeValues(event.target.value)}
                  onFocus={requestReauthIfNeeded}
                  placeholder={t('oauth2.detail.scopePlaceholder')}
                />
              </label>
              <div className="panel-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleAddScopeMap()}
                >
                  {scopeEditing ? t('oauth2.actions.updateScopeMap') : t('oauth2.actions.addScopeMap')}
                </button>
              </div>
            </>
          )}
          {scopeMessage && <p className="inline-feedback">{scopeMessage}</p>}
        </div>
        )}

        {canViewSupScopeMap && (
        <div className="panel-card">
          <header>
            <h2>{t('oauth2.detail.supScopeTitle')}</h2>
            <p>{t('oauth2.detail.supScopeDesc')}</p>
          </header>
          {client.supScopeMaps.length === 0 ? (
            <p className="muted-text">{t('oauth2.detail.supScopeEmpty')}</p>
          ) : (
            <div className="token-list">
              {client.supScopeMaps.map((entry) => (
                <div className="token-row" key={entry.groupId}>
                  <div>
                    <strong>{resolveGroupLabel(entry.groupId)}</strong>
                    <div className="oauth2-tags">
                      {entry.scopes.map((scope) => (
                        <span className="badge badge-sharp badge-neutral" key={scope}>
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isAdmin && (
                    <>
                      {supScopeConfirmGroup === entry.groupId ? (
                        <div className="ssh-confirm">
                          <span className="muted-text">{t('oauth2.detail.confirmRemoveSupScope')}</span>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => void handleRemoveSupScopeMap(entry.groupId)}
                          >
                            {t('oauth2.actions.remove')}
                          </button>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => setSupScopeConfirmGroup(null)}
                          >
                            {t('oauth2.actions.cancel')}
                          </button>
                        </div>
                      ) : (
                        <div className="ssh-confirm">
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => handleEditSupScopeMap(entry.groupId, entry.scopes)}
                          >
                            {t('oauth2.actions.edit')}
                          </button>
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => {
                              if (requestReauthIfNeeded()) return
                              setSupScopeConfirmGroup(entry.groupId)
                            }}
                          >
                            {t('oauth2.actions.remove')}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {isAdmin && (
            <>
              <label className="field">
                <span>{t('oauth2.labels.group')}</span>
                <AccountGroupSelect
                  value={supScopeGroup}
                  onChange={setSupScopeGroup}
                  onFocus={requestReauthIfNeeded}
                  readOnly={!canEdit && isAdmin}
                  includePeople={false}
                  includeGroups
                  includeServiceAccounts={false}
                  formatValue={(option) => normalizeGroupName(option.name)}
                />
              </label>
              <label className="field">
                <span>{t('oauth2.labels.scopes')}</span>
                <input
                  value={supScopeValues}
                  onChange={(event) => setSupScopeValues(event.target.value)}
                  onFocus={requestReauthIfNeeded}
                  placeholder={t('oauth2.detail.supScopePlaceholder')}
                />
              </label>
              <div className="panel-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleAddSupScopeMap()}
                >
                  {supScopeEditing ? t('oauth2.actions.updateSupScopeMap') : t('oauth2.actions.addSupScopeMap')}
                </button>
              </div>
            </>
          )}
          {supScopeMessage && <p className="inline-feedback">{supScopeMessage}</p>}
        </div>
        )}

        {canViewClaimMap && (
        <div className="panel-card">
          <header>
            <h2>{t('oauth2.detail.claimTitle')}</h2>
            <p>{t('oauth2.detail.claimDesc')}</p>
          </header>
          {claimGroups.length === 0 ? (
            <p className="muted-text">{t('oauth2.detail.claimEmpty')}</p>
          ) : (
            <div className="token-list">
              {claimGroups.map((group) => (
                <div className="token-row" key={group.claim}>
                  <div className="oauth2-claim-block">
                    <div className="oauth2-claim-header">
                      <strong>{group.claim}</strong>
                      <span className="muted-text">
                        {group.join === 'csv'
                          ? t('oauth2.join.csv')
                          : group.join === 'ssv'
                            ? t('oauth2.join.ssv')
                            : t('oauth2.join.array')}
                      </span>
                    </div>
                    <div className="oauth2-claim-list">
                      {group.entries.map((entry) => {
                        const key = `${entry.claim}:${entry.groupId}`
                        return (
                          <div className="oauth2-claim-entry" key={key}>
                            <div>
                              <strong>{resolveGroupLabel(entry.groupId)}</strong>
                              <div className="oauth2-tags">
                                {entry.values.map((value) => (
                                  <span className="badge badge-sharp badge-neutral" key={value}>
                                    {value}
                                  </span>
                                ))}
                              </div>
                            </div>
                            {isAdmin && (
                              <>
                                {claimConfirmKey === key ? (
                                  <div className="ssh-confirm">
                                    <span className="muted-text">{t('oauth2.detail.confirmRemoveClaim')}</span>
                                    <button
                                      className="link-button"
                                      type="button"
                                      onClick={() => void handleRemoveClaimMap(entry.claim, entry.groupId)}
                                    >
                                      {t('oauth2.actions.remove')}
                                    </button>
                                    <button
                                      className="link-button"
                                      type="button"
                                      onClick={() => setClaimConfirmKey(null)}
                                    >
                                      {t('oauth2.actions.cancel')}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="ssh-confirm">
                                    <button
                                      className="link-button"
                                      type="button"
                                      onClick={() => handleEditClaimMap(entry)}
                                    >
                                      {t('oauth2.actions.edit')}
                                    </button>
                                    <button
                                      className="link-button"
                                      type="button"
                                      onClick={() => {
                                        if (requestReauthIfNeeded()) return
                                        setClaimConfirmKey(key)
                                      }}
                                    >
                                      {t('oauth2.actions.remove')}
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {isAdmin && (
            <>
              <label className="field">
                <span>{t('oauth2.labels.claimName')}</span>
                <input
                  value={claimName}
                  onChange={(event) => setClaimName(event.target.value)}
                  onFocus={requestReauthIfNeeded}
                  placeholder={t('oauth2.detail.claimNamePlaceholder')}
                />
              </label>
              <label className="field">
                <span>{t('oauth2.labels.group')}</span>
                <AccountGroupSelect
                  value={claimGroup}
                  onChange={setClaimGroup}
                  onFocus={requestReauthIfNeeded}
                  readOnly={!canEdit && isAdmin}
                  includePeople={false}
                  includeGroups
                  includeServiceAccounts={false}
                  formatValue={(option) => normalizeGroupName(option.name)}
                />
              </label>
              <label className="field">
                <span>{t('oauth2.labels.values')}</span>
                <input
                  value={claimValues}
                  onChange={(event) => setClaimValues(event.target.value)}
                  onFocus={requestReauthIfNeeded}
                  placeholder={t('oauth2.detail.claimValuesPlaceholder')}
                />
              </label>
              <label className="field">
                <span>{t('oauth2.labels.joinFormat')}</span>
                <select
                  value={claimJoin}
                  onChange={(event) => setClaimJoin(event.target.value as Oauth2ClaimJoin)}
                >
                  <option value="array">{t('oauth2.join.array')}</option>
                  <option value="csv">{t('oauth2.join.csv')}</option>
                  <option value="ssv">{t('oauth2.join.ssv')}</option>
                </select>
              </label>
              <div className="panel-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void handleAddClaimMap()}
                >
                  {claimEditing ? t('oauth2.actions.updateClaimMap') : t('oauth2.actions.addClaimMap')}
                </button>
              </div>
            </>
          )}
          {claimMessage && <p className="inline-feedback">{claimMessage}</p>}
        </div>
        )}

        {client.type === 'basic' && (
          <div className="panel-card">
            <header>
              <h2>{t('oauth2.detail.secretTitle')}</h2>
              <p>{t('oauth2.detail.secretDesc')}</p>
            </header>
            {secret && (
              <div className="service-account-token">
                <code>{secret}</code>
              </div>
            )}
            {secretMessage && <p className="inline-feedback">{secretMessage}</p>}
            {isAdmin && (
              <div className="panel-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleSecretLoad()}
                  disabled={secretLoading}
                >
                  {secretLoading ? t('oauth2.actions.loading') : t('oauth2.actions.showSecret')}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void handleSecretReset()}
                >
                  {t('oauth2.actions.resetSecret')}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="panel-card">
          <header>
            <h2>{t('oauth2.integration.title')}</h2>
            <p>{t('oauth2.integration.subtitle')}</p>
          </header>
          <div className="oauth2-integration-list">
            {integrationItems.map((item) => (
              <div className="oauth2-integration-row" key={item.key}>
                <span className="oauth2-integration-label">{item.label}</span>
                <div className="oauth2-integration-main">
                  <code className="oauth2-integration-value">{item.value}</code>
                  <div className="oauth2-integration-actions">
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => void handleConfigCopy(item.key, item.value)}
                    >
                      {t('oauth2.actions.copy')}
                    </button>
                    {configCopyTip === item.key && <span className="copy-tip">{t('oauth2.actions.copied')}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-card">
          <header>
            <h2>{t('oauth2.detail.imageTitle')}</h2>
            <p>{t('oauth2.detail.imageDesc')}</p>
          </header>
          <ImageEditor
            imageSrc={imageSrc}
            emptyText={t('oauth2.detail.imageEmpty')}
            canEdit={isAdmin}
            chooseLabel={t('oauth2.actions.chooseImage')}
            replaceLabel={t('oauth2.actions.uploadImage')}
            removeLabel={t('oauth2.actions.removeImage')}
            onBeforeEdit={requestReauthIfNeeded}
            onSelectImage={(file) => {
              void handleImageUpload(file)
            }}
            onRemoveImage={() => {
              void handleImageDelete()
            }}
          />
          {imageMessage && <p className="inline-feedback">{imageMessage}</p>}
        </div>

        {isAdmin && (
          <div className="panel-card danger-card">
            <header>
              <h2>{t('oauth2.detail.dangerTitle')}</h2>
              <p>{t('oauth2.detail.dangerDesc')}</p>
            </header>
            {deleteConfirm ? (
              <div className="ssh-confirm">
                <span className="muted-text">{t('oauth2.detail.confirmDelete')}</span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void handleDeleteClient()}
                >
                  {t('oauth2.actions.deleteClient')}
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setDeleteConfirm(false)}
                >
                  {t('oauth2.actions.cancel')}
                </button>
              </div>
            ) : (
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  if (requestReauthIfNeeded()) return
                  setDeleteConfirm(true)
                }}
              >
                {t('oauth2.actions.deleteClient')}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
