import type { FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  addServiceAccountSshKey,
  clearServiceAccountAttr,
  deleteServiceAccountApiToken,
  deleteServiceAccountSshKey,
  fetchServiceAccount,
  fetchServiceAccountApiTokens,
  fetchServiceAccountCredentialStatus,
  fetchServiceAccountSshKeys,
  fetchServiceAccountUnixToken,
  generateServiceAccountApiToken,
  generateServiceAccountPassword,
  setServiceAccountAttr,
  setServiceAccountUnix,
  updateServiceAccount,
} from '../api'
import type {
  ApiToken,
  CredentialStatus,
  ServiceAccountDetail as ServiceAccountDetailRecord,
  ServiceAccountSshKey,
} from '../api/serviceAccounts'
import type { components } from '../api/schema'
import { useAccess } from '../auth/AccessContext'
import { useAuth } from '../auth/AuthContext'
import AccountGroupSelect from '../components/AccountGroupSelect'
import { getPasswordState } from '../utils/credentials'
import { formatExpiryTime, fromLocalDateTime, toLocalDateTime } from '../utils/dates'
import { emailsEqual, normalizeEmails } from '../utils/email'
import { isNotFound } from '../utils/errors'
import { parseKeyType } from '../utils/ssh'
import { applyDomain, extractDomainSuffix, stripDomain } from '../utils/strings'
import {
  canManageServiceAccountEntry,
  isAccessControlAdmin,
  isHighPrivilege,
  isServiceAccountAdmin,
  isUnixAdmin,
} from '../utils/groupAccess'

function summarizePassword(
  status: CredentialStatus | null,
  fallback: string,
  setLabel: string,
  notSetLabel: string,
) {
  const state = getPasswordState(status)
  if (state === 'unavailable') return fallback
  return state === 'set' ? setLabel : notSetLabel
}

type ServiceAccountForm = {
  name: string
  displayName: string
  description: string
  emails: string[]
  entryManagedBy: string
  validFrom: string
  expiresAt: string
}

type ServiceAccountMeta = {
  uuid: string
  memberOf: string[]
  directMemberOf: string[]
  entryManagedBy: string[]
  accountValidFrom: string | null
  accountExpire: string | null
}

type UnixUserToken = components['schemas']['UnixUserToken']

export default function ServiceAccountDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { canEdit, memberOf, requestReauth } = useAccess()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [identityMessage, setIdentityMessage] = useState<string | null>(null)
  const [validityMessage, setValidityMessage] = useState<string | null>(null)
  const [emailMessage, setEmailMessage] = useState<string | null>(null)
  const [form, setForm] = useState<ServiceAccountForm | null>(null)
  const [initialForm, setInitialForm] = useState<ServiceAccountForm | null>(null)
  const [accountMeta, setAccountMeta] = useState<ServiceAccountMeta | null>(null)
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus | null>(null)
  const [credentialMessage, setCredentialMessage] = useState<string | null>(null)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [passwordCopyTip, setPasswordCopyTip] = useState(false)
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([])
  const [apiTokenMessage, setApiTokenMessage] = useState<string | null>(null)
  const [apiTokenLabel, setApiTokenLabel] = useState('')
  const [apiTokenExpiry, setApiTokenExpiry] = useState('')
  const [apiTokenReadWrite, setApiTokenReadWrite] = useState(true)
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [tokenCopyTip, setTokenCopyTip] = useState(false)
  const [apiTokenLoading, setApiTokenLoading] = useState(false)
  const [apiTokenDeleting, setApiTokenDeleting] = useState<string | null>(null)
  const [apiTokenConfirm, setApiTokenConfirm] = useState<string | null>(null)
  const [sshKeys, setSshKeys] = useState<ServiceAccountSshKey[]>([])
  const [sshMessage, setSshMessage] = useState<string | null>(null)
  const [sshLabel, setSshLabel] = useState('')
  const [sshKey, setSshKey] = useState('')
  const [sshLoading, setSshLoading] = useState(false)
  const [sshDeleting, setSshDeleting] = useState<string | null>(null)
  const [sshConfirm, setSshConfirm] = useState<string | null>(null)
  const [posixToken, setPosixToken] = useState<UnixUserToken | null>(null)
  const [posixMessage, setPosixMessage] = useState<string | null>(null)
  const [posixLoading, setPosixLoading] = useState(false)
  const [posixGid, setPosixGid] = useState('')
  const [posixShell, setPosixShell] = useState('')
  const loadRef = useRef<string | null>(null)

  const isServiceAdmin = useMemo(() => isServiceAccountAdmin(memberOf), [memberOf])
  const isAccessAdmin = useMemo(() => isAccessControlAdmin(memberOf), [memberOf])
  const canManagePosix = useMemo(() => isUnixAdmin(memberOf), [memberOf])

  const accountHighPrivilege = useMemo(() => {
    if (!accountMeta) return false
    return isHighPrivilege(accountMeta.memberOf)
  }, [accountMeta])

  const domainSuffix = useMemo(() => {
    const value = form?.entryManagedBy ?? ''
    if (value.includes('@')) {
      return value.split('@')[1] ?? null
    }
    return extractDomainSuffix(memberOf)
  }, [form?.entryManagedBy, memberOf])

  const canManageEntry = useMemo(
    () => canManageServiceAccountEntry(accountMeta?.entryManagedBy ?? [], user, memberOf),
    [accountMeta, memberOf, user],
  )

  const canEditName = isServiceAdmin
  const canEditDisplayName = canManageEntry
  const canEditDescription = isServiceAdmin
  const canEditEmail = isServiceAdmin
  const canEditEntryManagedBy = isServiceAdmin && (!accountHighPrivilege || isAccessAdmin)
  const canManageValidity = canManageEntry
  const canManageCredentials = canManageEntry
  const canManageApiTokens = canManageEntry
  const canManageSshKeys = canManageEntry

  const requestReauthIfNeeded = () => {
    if (!canEdit && (canEditDisplayName || canEditName || canEditEntryManagedBy)) {
      requestReauth()
    }
  }

  const setFormState = (account: ServiceAccountDetailRecord) => {
    const entryManagedBy = account.entryManagedBy[0] ?? ''
    const nextForm: ServiceAccountForm = {
      name: account.name,
      displayName: account.displayName,
      description: account.description ?? '',
      emails: account.emails,
      entryManagedBy: stripDomain(entryManagedBy),
      validFrom: toLocalDateTime(account.accountValidFrom),
      expiresAt: toLocalDateTime(account.accountExpire),
    }
    setForm(nextForm)
    setInitialForm(nextForm)
    setAccountMeta({
      uuid: account.uuid,
      memberOf: account.memberOf,
      directMemberOf: account.directMemberOf,
      entryManagedBy: account.entryManagedBy,
      accountValidFrom: account.accountValidFrom,
      accountExpire: account.accountExpire,
    })
  }

  const loadCredentialStatus = async (accountId: string) => {
    try {
      const status = await fetchServiceAccountCredentialStatus(accountId)
      setCredentialStatus(status)
    } catch (error) {
      setCredentialMessage(
        error instanceof Error ? error.message : t('serviceAccounts.messages.credentialStatusFailed'),
      )
    }
  }

  const loadApiTokens = async (accountId: string) => {
    try {
      const tokens = await fetchServiceAccountApiTokens(accountId)
      setApiTokens(tokens)
    } catch (error) {
      setApiTokenMessage(
        error instanceof Error ? error.message : t('serviceAccounts.messages.apiTokenLoadFailed'),
      )
    }
  }

  const loadSshKeys = async (accountId: string) => {
    try {
      const keys = await fetchServiceAccountSshKeys(accountId)
      setSshKeys(keys)
    } catch (error) {
      setSshMessage(error instanceof Error ? error.message : t('profile.ssh.messageLoadFailed'))
    }
  }

  const loadPosix = async (accountId: string) => {
    try {
      const token = await fetchServiceAccountUnixToken(accountId)
      setPosixToken(token)
      setPosixGid(token.gidnumber ? String(token.gidnumber) : '')
      setPosixShell(token.shell ?? '')
    } catch (error) {
      if (isNotFound(error)) {
        setPosixToken(null)
        setPosixGid('')
        setPosixShell('')
      } else {
        setPosixMessage(error instanceof Error ? error.message : t('serviceAccounts.messages.posixLoadFailed'))
      }
    }
  }

  useEffect(() => {
    if (!id || loadRef.current === id) return
    loadRef.current = id
    setLoading(true)
    setMessage(null)

    const load = async () => {
      try {
        const account = await fetchServiceAccount(id)
        if (!account) {
          setMessage(t('serviceAccounts.detail.notFound'))
          return
        }
        const isBuiltin = account.name === 'admin' || account.name === 'idm_admin'
        setFormState(account)
        if (id !== account.uuid) {
          navigate(`/service-accounts/${account.uuid}`, { replace: true })
        }
        if (isBuiltin) {
          setCredentialStatus(null)
        }
        await Promise.all([
          isBuiltin ? Promise.resolve() : loadCredentialStatus(account.uuid),
          loadApiTokens(account.uuid),
          loadSshKeys(account.uuid),
          loadPosix(account.uuid),
        ])
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('serviceAccounts.messages.loadFailed'))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id, navigate])

  const handleIdentitySubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form || !initialForm || !accountMeta) return
    if (!canEdit) {
      requestReauth()
      return
    }
    setIdentityMessage(null)
    try {
      const normalizedEmails = normalizeEmails(form.emails)
      const emailChanged = !emailsEqual(normalizedEmails, normalizeEmails(initialForm.emails))
      const descriptionChanged = form.description.trim() !== initialForm.description.trim()
      const entryManagerChanged = form.entryManagedBy !== initialForm.entryManagedBy
      const displayNameChanged = form.displayName.trim() !== initialForm.displayName.trim()
      const nameChanged = form.name.trim() !== initialForm.name.trim()

      if (entryManagerChanged && !form.entryManagedBy) {
        setIdentityMessage(t('serviceAccounts.messages.entryManagerRequired'))
        return
      }

      if (
        !emailChanged &&
        !descriptionChanged &&
        !entryManagerChanged &&
        !displayNameChanged &&
        !nameChanged
      ) {
        setIdentityMessage(t('serviceAccounts.messages.identityNoChanges'))
        return
      }

      await updateServiceAccount({
        id: accountMeta.uuid,
        name: nameChanged ? form.name.trim() : undefined,
        displayName: displayNameChanged ? form.displayName.trim() : undefined,
        description: descriptionChanged ? form.description.trim() : undefined,
        entryManagedBy: entryManagerChanged
          ? applyDomain(form.entryManagedBy.trim(), domainSuffix)
          : undefined,
        emails: emailChanged ? normalizedEmails : undefined,
      })

      const refreshed = await fetchServiceAccount(accountMeta.uuid)
      if (refreshed) {
        setFormState(refreshed)
      }
      setIdentityMessage(t('serviceAccounts.messages.identityUpdated'))
    } catch (error) {
      setIdentityMessage(error instanceof Error ? error.message : t('serviceAccounts.messages.identityFailed'))
    }
  }

  const handleValiditySubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form || !accountMeta) return
    if (!canManageValidity) {
      setValidityMessage(t('serviceAccounts.messages.validityPermission'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    const validFrom = fromLocalDateTime(form.validFrom)
    if (validFrom === undefined) {
      setValidityMessage(t('serviceAccounts.messages.validityStartInvalid'))
      return
    }
    const expireAt = fromLocalDateTime(form.expiresAt)
    if (expireAt === undefined) {
      setValidityMessage(t('serviceAccounts.messages.validityEndInvalid'))
      return
    }
    setValidityMessage(null)
    try {
      if (validFrom) {
        await setServiceAccountAttr(accountMeta.uuid, 'account_valid_from', [validFrom])
      } else {
        await clearServiceAccountAttr(accountMeta.uuid, 'account_valid_from')
      }
      if (expireAt) {
        await setServiceAccountAttr(accountMeta.uuid, 'account_expire', [expireAt])
      } else {
        await clearServiceAccountAttr(accountMeta.uuid, 'account_expire')
      }
      const refreshed = await fetchServiceAccount(accountMeta.uuid)
      if (refreshed) {
        setFormState(refreshed)
      }
      setValidityMessage(t('serviceAccounts.messages.validityUpdated'))
    } catch (error) {
      setValidityMessage(error instanceof Error ? error.message : t('serviceAccounts.messages.validityFailed'))
    }
  }

  const handleEmailSave = async () => {
    if (!form || !initialForm || !accountMeta) return
    if (!canEditEmail) {
      setEmailMessage(t('serviceAccounts.messages.emailPermission'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    const normalizedEmails = normalizeEmails(form.emails)
    if (emailsEqual(normalizedEmails, normalizeEmails(initialForm.emails))) {
      setEmailMessage(t('serviceAccounts.messages.emailNoChanges'))
      return
    }
    setEmailMessage(null)
    try {
      await updateServiceAccount({ id: accountMeta.uuid, emails: normalizedEmails })
      const refreshed = await fetchServiceAccount(accountMeta.uuid)
      if (refreshed) {
        setFormState(refreshed)
      }
      setEmailMessage(t('serviceAccounts.messages.emailUpdated'))
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : t('serviceAccounts.messages.emailFailed'))
    }
  }

  const handlePasswordGenerate = async () => {
    if (!accountMeta) return
    if (form?.name === 'admin' || form?.name === 'idm_admin') {
      setCredentialMessage(t('serviceAccounts.messages.passwordBuiltin'))
      return
    }
    if (!canManageCredentials) {
      setCredentialMessage(t('serviceAccounts.messages.passwordPermission'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    setCredentialMessage(null)
    setGeneratedPassword(null)
    try {
      const password = await generateServiceAccountPassword(accountMeta.uuid)
      setGeneratedPassword(password)
      void loadCredentialStatus(accountMeta.uuid)
    } catch (error) {
      setCredentialMessage(error instanceof Error ? error.message : t('serviceAccounts.messages.passwordGenerateFailed'))
    }
  }

  const handlePasswordCopy = async () => {
    if (!generatedPassword) return
    await navigator.clipboard.writeText(generatedPassword)
    setPasswordCopyTip(true)
    window.setTimeout(() => setPasswordCopyTip(false), 1600)
  }

  const handleApiTokenSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!accountMeta) return
    if (!canManageApiTokens) {
      setApiTokenMessage(t('serviceAccounts.messages.apiTokenPermission'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    const label = apiTokenLabel.trim()
    if (!label) {
      setApiTokenMessage(t('serviceAccounts.messages.apiTokenLabelRequired'))
      return
    }
    const expiry = apiTokenExpiry.trim()
    const expiryIso = expiry ? fromLocalDateTime(expiry) : null
    if (expiry && expiryIso === undefined) {
      setApiTokenMessage(t('serviceAccounts.messages.apiTokenExpiryInvalid'))
      return
    }
    setApiTokenLoading(true)
    setApiTokenMessage(null)
    setCreatedToken(null)
    setTokenCopyTip(false)
    try {
      const token = await generateServiceAccountApiToken(accountMeta.uuid, {
        label,
        expiry: expiryIso ?? null,
        read_write: apiTokenReadWrite,
      })
      setCreatedToken(token)
      setApiTokenLabel('')
      setApiTokenExpiry('')
      await loadApiTokens(accountMeta.uuid)
    } catch (error) {
      setApiTokenMessage(error instanceof Error ? error.message : t('serviceAccounts.messages.apiTokenGenerateFailed'))
    } finally {
      setApiTokenLoading(false)
    }
  }

  const handleApiTokenCopy = async () => {
    if (!createdToken) return
    await navigator.clipboard.writeText(createdToken)
    setTokenCopyTip(true)
    window.setTimeout(() => setTokenCopyTip(false), 1600)
  }

  const handleApiTokenDelete = async (tokenId: string) => {
    if (!accountMeta) return
    if (!canManageApiTokens) {
      setApiTokenMessage(t('serviceAccounts.messages.apiTokenPermission'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    setApiTokenDeleting(tokenId)
    setApiTokenMessage(null)
    try {
      await deleteServiceAccountApiToken(accountMeta.uuid, tokenId)
      await loadApiTokens(accountMeta.uuid)
    } catch (error) {
      setApiTokenMessage(error instanceof Error ? error.message : t('serviceAccounts.messages.apiTokenRemoveFailed'))
    } finally {
      setApiTokenDeleting(null)
      setApiTokenConfirm(null)
    }
  }

  const handleSshSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!accountMeta) return
    if (!canManageSshKeys) {
      setSshMessage(t('profile.ssh.permissionDenied'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    const label = sshLabel.trim()
    const keyValue = sshKey.trim()
    if (!label) {
      setSshMessage(t('profile.ssh.messageLabelRequired'))
      return
    }
    if (!keyValue) {
      setSshMessage(t('profile.ssh.messageKeyRequired'))
      return
    }
    setSshLoading(true)
    setSshMessage(null)
    try {
      await addServiceAccountSshKey(accountMeta.uuid, label, keyValue)
      setSshLabel('')
      setSshKey('')
      await loadSshKeys(accountMeta.uuid)
    } catch (error) {
      setSshMessage(error instanceof Error ? error.message : t('profile.ssh.messageAddFailed'))
    } finally {
      setSshLoading(false)
    }
  }

  const handleSshDelete = async (tag: string) => {
    if (!accountMeta) return
    if (!canManageSshKeys) {
      setSshMessage(t('profile.ssh.permissionDenied'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    setSshDeleting(tag)
    setSshMessage(null)
    try {
      await deleteServiceAccountSshKey(accountMeta.uuid, tag)
      await loadSshKeys(accountMeta.uuid)
    } catch (error) {
      setSshMessage(error instanceof Error ? error.message : t('profile.ssh.messageDeleteFailed'))
    } finally {
      setSshDeleting(null)
      setSshConfirm(null)
    }
  }

  const handlePosixSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!accountMeta) return
    if (!canManagePosix) {
      setPosixMessage(t('serviceAccounts.messages.posixPermission'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    const gidTrimmed = posixGid.trim()
    const gidNumber = gidTrimmed ? Number(gidTrimmed) : undefined
    if (gidTrimmed && (!gidNumber || Number.isNaN(gidNumber))) {
      setPosixMessage(t('serviceAccounts.messages.posixGidInvalid'))
      return
    }
    setPosixLoading(true)
    setPosixMessage(null)
    try {
      await setServiceAccountUnix(accountMeta.uuid, {
        gidnumber: gidNumber,
        shell: posixShell.trim() || undefined,
      })
      await loadPosix(accountMeta.uuid)
      setPosixMessage(t('serviceAccounts.messages.posixUpdated'))
    } catch (error) {
      setPosixMessage(error instanceof Error ? error.message : t('serviceAccounts.messages.posixFailed'))
    } finally {
      setPosixLoading(false)
    }
  }

  const directGroups = accountMeta?.directMemberOf ?? []
  const inheritedGroups = useMemo(() => {
    if (!accountMeta) return []
    const direct = new Set(accountMeta.directMemberOf)
    return accountMeta.memberOf.filter((group) => !direct.has(group))
  }, [accountMeta])

  if (loading) {
    return (
      <section className="page service-account-page">
        <h1>{t('serviceAccounts.title')}</h1>
        <p className="page-note">{t('serviceAccounts.detail.loading')}</p>
      </section>
    )
  }

  if (!form || !accountMeta) {
    return (
      <section className="page service-account-page">
        <h1>{t('serviceAccounts.title')}</h1>
        <p className="page-note">{message ?? t('serviceAccounts.detail.unavailable')}</p>
      </section>
    )
  }

  const isBuiltin = form.name === 'admin' || form.name === 'idm_admin'

  return (
    <section className="page service-account-page">
      <div className="service-account-header">
        <div>
          <h1>{form.displayName}</h1>
          <p className="page-note">
            {form.name} · {accountMeta.uuid}
          </p>
        </div>
        <div className="service-account-actions">
          {accountHighPrivilege && (
            <span className="badge badge-warn badge-sharp" title={t('shell.highPrivilegeTip')}>
              {t('shell.highPrivilege')}
            </span>
          )}
          <button className="secondary-button" type="button" onClick={() => navigate('/service-accounts')}>
            {t('serviceAccounts.backToList')}
          </button>
        </div>
      </div>

      <div className="profile-grid">
        <section className="profile-card service-account-card">
          <header>
            <h2>{t('serviceAccounts.detail.identityTitle')}</h2>
            <p>{t('serviceAccounts.detail.identityDesc')}</p>
          </header>
          {identityMessage && <p className="feedback">{identityMessage}</p>}
          <form className="stacked-form" onSubmit={handleIdentitySubmit}>
            <div className="field">
              <label>{t('serviceAccounts.detail.accountName')}</label>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                disabled={!canEditName}
                readOnly={canEditName && !canEdit}
                onFocus={requestReauthIfNeeded}
              />
            </div>
            <div className="field">
              <label>{t('serviceAccounts.detail.displayName')}</label>
              <input
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                disabled={!canEditDisplayName}
                readOnly={canEditDisplayName && !canEdit}
                onFocus={requestReauthIfNeeded}
              />
            </div>
            <div className="field">
              <label>{t('serviceAccounts.detail.description')}</label>
              <input
                value={form.description}
                onChange={(event) =>
                  setForm({
                    ...form,
                    description: event.target.value.replace(/[\r\n]+/g, ' '),
                  })
                }
                disabled={!canEditDescription}
                readOnly={canEditDescription && !canEdit}
                onFocus={requestReauthIfNeeded}
                placeholder={t('serviceAccounts.detail.descriptionPlaceholder')}
              />
            </div>
            <div className="field">
              <label>{t('serviceAccounts.detail.entryManagedBy')}</label>
              <AccountGroupSelect
                value={form.entryManagedBy}
                disabled={!canEditEntryManagedBy}
                readOnly={canEditEntryManagedBy && !canEdit}
                includePeople
                includeGroups
                includeServiceAccounts
                onFocus={() => {
                  if (!canEdit && canEditEntryManagedBy) requestReauth()
                }}
                onChange={(value) => setForm({ ...form, entryManagedBy: value })}
              />
              {!canEditEntryManagedBy && accountHighPrivilege && (
                <p className="muted-text">{t('serviceAccounts.detail.entryManagerHighPriv')}</p>
              )}
            </div>
            {(canEditName || canEditDisplayName || canEditDescription || canEditEntryManagedBy) && (
              <div className="profile-actions">
                <button className="primary-button" type="submit">
                  {t('serviceAccounts.detail.saveIdentity')}
                </button>
              </div>
            )}
          </form>
        </section>

        <section className="profile-card service-account-card">
          <header>
            <h2>{t('serviceAccounts.detail.apiTokensTitle')}</h2>
            <p>{t('serviceAccounts.detail.apiTokensDesc')}</p>
          </header>
          {apiTokenMessage && <p className="feedback">{apiTokenMessage}</p>}
          {createdToken && (
            <div className="service-account-token">
              <p className="muted-text">{t('serviceAccounts.detail.apiTokenShownOnce')}</p>
              <div className="copy-row">
                <code>{createdToken}</code>
                <button className="secondary-button" type="button" onClick={handleApiTokenCopy}>
                  {t('serviceAccounts.detail.apiTokenCopy')}
                </button>
                {tokenCopyTip && <span className="copy-tip">{t('serviceAccounts.detail.copied')}</span>}
              </div>
            </div>
          )}
          {canManageApiTokens && (
            <form className="stacked-form" onSubmit={handleApiTokenSubmit}>
              <div className="field">
                <label>{t('serviceAccounts.detail.apiTokenLabel')}</label>
                <input
                  value={apiTokenLabel}
                  onChange={(event) => setApiTokenLabel(event.target.value)}
                  readOnly={!canEdit}
                  onFocus={() => {
                    if (!canEdit) requestReauth()
                  }}
                  placeholder={t('serviceAccounts.detail.apiTokenLabelPlaceholder')}
                />
              </div>
              <div className="field">
                <label>{t('serviceAccounts.detail.apiTokenExpiry')}</label>
                <input
                  type="datetime-local"
                  value={apiTokenExpiry}
                  onChange={(event) => setApiTokenExpiry(event.target.value)}
                  readOnly={!canEdit}
                  onFocus={() => {
                    if (!canEdit) requestReauth()
                  }}
                />
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={apiTokenReadWrite}
                  onChange={(event) => setApiTokenReadWrite(event.target.checked)}
                />
                {t('serviceAccounts.detail.apiTokenReadWrite')}
              </label>
              <div className="profile-actions">
                <button className="primary-button" type="submit" disabled={apiTokenLoading}>
                  {apiTokenLoading ? t('serviceAccounts.detail.apiTokenGenerating') : t('serviceAccounts.detail.apiTokenGenerate')}
                </button>
              </div>
            </form>
          )}

          <div className="token-list">
            {apiTokens.length === 0 ? (
              <p className="muted-text">{t('serviceAccounts.detail.apiTokenNone')}</p>
            ) : (
              apiTokens.map((token) => (
                <div className="token-row" key={token.token_id}>
                  <div>
                    <strong>{token.label}</strong>
                    <div className="token-meta">
                      <span>{t('serviceAccounts.detail.apiTokenIssued', { time: formatExpiryTime(token.issued_at, t('serviceAccounts.detail.never')) })}</span>
                      <span>{t('serviceAccounts.detail.apiTokenExpires', { time: formatExpiryTime(token.expiry, t('serviceAccounts.detail.never')) })}</span>
                      <span>{token.purpose ?? 'readonly'}</span>
                    </div>
                  </div>
                  {canManageApiTokens && (
                    apiTokenConfirm === token.token_id ? (
                      <div className="ssh-confirm">
                        <span className="muted-text">{t('serviceAccounts.detail.apiTokenConfirm', { label: token.label })}</span>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void handleApiTokenDelete(token.token_id)}
                          disabled={apiTokenDeleting === token.token_id}
                        >
                          {t('serviceAccounts.detail.apiTokenRemove')}
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => setApiTokenConfirm(null)}
                          disabled={apiTokenDeleting === token.token_id}
                        >
                          {t('serviceAccounts.detail.apiTokenCancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setApiTokenConfirm(token.token_id)}
                      >
                        {t('serviceAccounts.detail.apiTokenRemove')}
                      </button>
                    )
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="profile-card service-account-card">
          <header>
            <h2>{t('serviceAccounts.detail.validityTitle')}</h2>
            <p>{t('serviceAccounts.detail.validityDesc')}</p>
          </header>
          {validityMessage && <p className="feedback">{validityMessage}</p>}
          <form className="stacked-form" onSubmit={handleValiditySubmit}>
            <div className="field">
              <label>{t('serviceAccounts.detail.validFrom')}</label>
              <input
                type="datetime-local"
                value={form.validFrom}
                onChange={(event) => setForm({ ...form, validFrom: event.target.value })}
                disabled={!canManageValidity}
                readOnly={canManageValidity && !canEdit}
                onFocus={() => {
                  if (!canEdit && canManageValidity) requestReauth()
                }}
              />
            </div>
            <div className="field">
              <label>{t('serviceAccounts.detail.expiresAt')}</label>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
                disabled={!canManageValidity}
                readOnly={canManageValidity && !canEdit}
                onFocus={() => {
                  if (!canEdit && canManageValidity) requestReauth()
                }}
              />
            </div>
            <div className="profile-actions">
              {canManageValidity && (
                <button className="primary-button" type="submit">
                  {t('serviceAccounts.detail.saveValidity')}
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="profile-card service-account-card">
          <header>
            <h2>{t('serviceAccounts.detail.credentialsTitle')}</h2>
            <p>{t('serviceAccounts.detail.credentialsDesc')}</p>
          </header>
          {credentialMessage && <p className="feedback">{credentialMessage}</p>}
          {isBuiltin ? (
            <p className="muted-text">{t('serviceAccounts.detail.builtinCredentials')}</p>
          ) : (
            <>
              <div className="credential-summary">
                <div>
                  <span>{t('serviceAccounts.detail.passwordLabel')}</span>
                  <strong>{summarizePassword(
                    credentialStatus,
                    t('serviceAccounts.detail.passwordUnavailable'),
                    t('serviceAccounts.detail.passwordSet'),
                    t('serviceAccounts.detail.passwordNotSet'),
                  )}</strong>
                </div>
              </div>
              <div className="profile-actions">
                {canManageCredentials && (
                  <button
                    className="primary-button"
                    type="button"
                    onClick={handlePasswordGenerate}
                  >
                    {t('serviceAccounts.detail.generatePassword')}
                  </button>
                )}
              </div>
            </>
          )}
          {generatedPassword && (
            <div className="service-account-token">
              <p className="muted-text">{t('serviceAccounts.detail.passwordShownOnce')}</p>
              <div className="copy-row">
                <code>{generatedPassword}</code>
                <button className="secondary-button" type="button" onClick={handlePasswordCopy}>
                  {t('serviceAccounts.detail.copy')}
                </button>
                {passwordCopyTip && <span className="copy-tip">{t('serviceAccounts.detail.copied')}</span>}
              </div>
            </div>
          )}
        </section>

        <section className="profile-card service-account-card">
          <header>
            <h2>{t('serviceAccounts.detail.posixTitle')}</h2>
            <p>{t('serviceAccounts.detail.posixDesc')}</p>
          </header>
          {posixMessage && <p className="feedback">{posixMessage}</p>}
          {!canManagePosix && (
            <p className="muted-text">{t('serviceAccounts.detail.posixNoPermission')}</p>
          )}
          {posixToken ? (
            <p className="muted-text">
              {t('serviceAccounts.detail.posixEnabled', {
                gid: posixToken.gidnumber ?? '—',
                shell: posixToken.shell ?? t('serviceAccounts.detail.posixDefaultShell'),
              })}
            </p>
          ) : (
            <p className="muted-text">{t('serviceAccounts.detail.posixDisabled')}</p>
          )}
          {canManagePosix && (
            <form className="stacked-form" onSubmit={handlePosixSubmit}>
              <div className="field">
                <label>{t('serviceAccounts.detail.gidNumber')}</label>
                <input
                  value={posixGid}
                  onChange={(event) => setPosixGid(event.target.value)}
                  readOnly={!canEdit}
                  onFocus={() => {
                    if (!canEdit) requestReauth()
                  }}
                  placeholder={t('serviceAccounts.detail.gidPlaceholder')}
                />
              </div>
              <div className="field">
                <label>{t('serviceAccounts.detail.loginShell')}</label>
                <input
                  value={posixShell}
                  onChange={(event) => setPosixShell(event.target.value)}
                  readOnly={!canEdit}
                  onFocus={() => {
                    if (!canEdit) requestReauth()
                  }}
                  placeholder={t('serviceAccounts.detail.shellPlaceholder')}
                />
              </div>
              <div className="profile-actions">
                <button className="primary-button" type="submit" disabled={posixLoading}>
                  {posixLoading ? t('serviceAccounts.detail.posixSaving') : t('serviceAccounts.detail.posixSave')}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="profile-card service-account-card">
          <header>
            <h2>{t('profile.ssh.title')}</h2>
            <p>{t('profile.ssh.subtitle')}</p>
          </header>
          {sshMessage && <p className="feedback">{sshMessage}</p>}
          {canManageSshKeys && sshKeys.length === 0 ? (
            <form className="stacked-form" onSubmit={handleSshSubmit}>
              <div className="field">
                <label>{t('profile.ssh.labelLabel')}</label>
                <input
                  value={sshLabel}
                  onChange={(event) => setSshLabel(event.target.value)}
                  placeholder={t('profile.ssh.labelPlaceholder')}
                  disabled={!canManageSshKeys}
                  readOnly={canManageSshKeys && !canEdit}
                  onFocus={() => {
                    if (!canEdit && canManageSshKeys) requestReauth()
                  }}
                />
              </div>
              <div className="field">
                <label>{t('profile.ssh.keyLabel')}</label>
                <textarea
                  value={sshKey}
                  onChange={(event) => setSshKey(event.target.value)}
                  placeholder={t('profile.ssh.keyPlaceholder')}
                  disabled={!canManageSshKeys}
                  readOnly={canManageSshKeys && !canEdit}
                  onFocus={() => {
                    if (!canEdit && canManageSshKeys) requestReauth()
                  }}
                />
              </div>
              <div className="profile-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!canManageSshKeys || sshLoading}
                >
                  {sshLoading ? t('profile.ssh.adding') : t('profile.ssh.add')}
                </button>
              </div>
            </form>
          ) : canManageSshKeys ? (
            <details className="ssh-add-toggle">
              <summary>{t('profile.ssh.addTitle')}</summary>
              <form className="stacked-form" onSubmit={handleSshSubmit}>
                <div className="field">
                  <label>{t('profile.ssh.labelLabel')}</label>
                  <input
                    value={sshLabel}
                    onChange={(event) => setSshLabel(event.target.value)}
                    placeholder={t('profile.ssh.labelPlaceholder')}
                    disabled={!canManageSshKeys}
                    readOnly={canManageSshKeys && !canEdit}
                    onFocus={() => {
                      if (!canEdit && canManageSshKeys) requestReauth()
                    }}
                  />
                </div>
                <div className="field">
                  <label>{t('profile.ssh.keyLabel')}</label>
                  <textarea
                    value={sshKey}
                    onChange={(event) => setSshKey(event.target.value)}
                    placeholder={t('profile.ssh.keyPlaceholder')}
                    disabled={!canManageSshKeys}
                    readOnly={canManageSshKeys && !canEdit}
                    onFocus={() => {
                      if (!canEdit && canManageSshKeys) requestReauth()
                    }}
                  />
                </div>
                <div className="profile-actions">
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={sshLoading}
                  >
                    {sshLoading ? t('profile.ssh.adding') : t('profile.ssh.add')}
                  </button>
                </div>
              </form>
            </details>
          ) : null}

          <div className="ssh-list">
            {sshKeys.length === 0 ? (
              <p className="muted-text">{t('profile.ssh.empty')}</p>
            ) : (
              sshKeys.map((key) => (
                <div className="ssh-key-card" key={key.tag}>
                  <div className="ssh-key-header">
                    <div>
                      <strong>{key.tag}</strong>
                      <span className="ssh-key-type">{parseKeyType(key.value)}</span>
                    </div>
                    {canManageSshKeys && (
                      sshConfirm === key.tag ? (
                        <div className="ssh-confirm">
                          <span className="muted-text">
                            {t('profile.ssh.removeConfirm', { label: key.tag })}
                          </span>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => void handleSshDelete(key.tag)}
                            disabled={sshDeleting === key.tag}
                          >
                            {t('profile.ssh.remove')}
                          </button>
                          <button
                            className="ghost-button"
                            type="button"
                            onClick={() => setSshConfirm(null)}
                            disabled={sshDeleting === key.tag}
                          >
                            {t('profile.ssh.cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setSshConfirm(key.tag)}
                        >
                          {t('profile.ssh.remove')}
                        </button>
                      )
                    )}
                  </div>
                  <code className="ssh-key-value">{key.value}</code>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="profile-card service-account-card">
          <header>
            <h2>{t('serviceAccounts.detail.emailTitle')}</h2>
            <p>{t('serviceAccounts.detail.emailDesc')}</p>
          </header>
          {emailMessage && <p className="feedback">{emailMessage}</p>}
          {!canEditEmail && <p className="muted-text">{t('serviceAccounts.detail.emailPermission')}</p>}
          <div className="profile-emails">
            <div className="profile-emails-header">
              <span>{t('serviceAccounts.detail.emailLabel')}</span>
              {canEditEmail && (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setForm({ ...form, emails: [...form.emails, ''] })}
                >
                  {t('serviceAccounts.detail.emailAdd')}
                </button>
              )}
            </div>
            {form.emails.length === 0 ? (
              <p className="muted-text">{t('serviceAccounts.detail.emailNone')}</p>
            ) : (
              form.emails.map((email, index) => (
                <div className="profile-email-row" key={`${email}-${index}`}>
                  <input
                    value={email}
                    onChange={(event) => {
                      const next = [...form.emails]
                      next[index] = event.target.value
                      setForm({ ...form, emails: next })
                    }}
                    disabled={!canEditEmail}
                    readOnly={canEditEmail && !canEdit}
                    onFocus={requestReauthIfNeeded}
                    placeholder={t('serviceAccounts.detail.emailPlaceholder')}
                  />
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      const next = form.emails.filter((_, i) => i !== index)
                      setForm({ ...form, emails: next })
                    }}
                  >
                    {t('serviceAccounts.detail.emailRemove')}
                  </button>
                </div>
              ))
            )}
          </div>
          {canEditEmail && (
            <div className="profile-actions">
              <button className="primary-button" type="button" onClick={handleEmailSave}>
                {t('serviceAccounts.detail.emailSave')}
              </button>
            </div>
          )}
        </section>

        <section className="profile-card service-account-card">
          <header>
            <h2>{t('serviceAccounts.detail.groupsTitle')}</h2>
            <p>{t('serviceAccounts.detail.groupsDesc')}</p>
          </header>
          <div className="person-groups">
            <div className="person-group-list">
              <span className="muted-text">{t('serviceAccounts.detail.directMemberships')}</span>
              <div className="person-group-tags">
                {directGroups.length === 0 ? (
                  <span className="muted-text">{t('serviceAccounts.detail.directMembershipsNone')}</span>
                ) : (
                  directGroups.map((group) => (
                    <span className="badge" key={`direct-${group}`}>{stripDomain(group)}</span>
                  ))
                )}
              </div>
            </div>
            <div className="person-group-list">
              <span className="muted-text">{t('serviceAccounts.detail.inheritedMemberships')}</span>
              <div className="person-group-tags">
                {inheritedGroups.length === 0 ? (
                  <span className="muted-text">{t('serviceAccounts.detail.inheritedMembershipsNone')}</span>
                ) : (
                  inheritedGroups.map((group) => (
                    <span className="badge" key={`inherited-${group}`}>{stripDomain(group)}</span>
                  ))
                )}
              </div>
            </div>
            <span className="muted-text">{t('serviceAccounts.detail.groupEditHint')}</span>
          </div>
        </section>
      </div>
    </section>
  )
}
