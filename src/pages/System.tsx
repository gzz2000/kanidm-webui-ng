import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  appendSystemAttr,
  deleteDomainAttr,
  deleteSystemAttr,
  fetchDomain,
  fetchDomainImageObjectUrl,
  fetchSystem,
  getMessage,
  listMessages,
  markMessageSent,
  removeDomainImage,
  sendTestMessage,
  setDomainAttr,
  setSystemAttr,
  uploadDomainImage,
  type SystemMessageSummary,
} from '../api'
import { useAccess } from '../auth/AccessContext'
import ImageEditor from '../components/ImageEditor'
import { formatExpiryTime } from '../utils/dates'
import {
  isAccountPolicyAdmin,
  isDomainAdmin,
  isMessageAdmin,
  isMessageSender,
} from '../utils/groupAccess'

type DomainState = {
  displayName: string
  ldapBaseDn: string
  ldapMaxQueryableAttrs: string
  ldapAllowUnixPwBind: boolean
  name: string
  uuid: string
}

type PolicyState = {
  deniedNames: string[]
  badlistPasswords: string[]
  authSessionExpiry: string
  privilegeExpiry: string
}

function parseBoolean(value: string) {
  return value.trim().toLowerCase() === 'true'
}

function splitLines(input: string) {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function normalizeDeniedNames(input: string) {
  const values = splitLines(input).map((entry) => entry.toLowerCase())
  const invalid = values.filter((entry) => !/^[a-z0-9][a-z0-9._-]*$/.test(entry))
  return { values, invalid }
}

function formatMessageError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export default function System() {
  const { t } = useTranslation()
  const { memberOf, canEdit, requestReauth } = useAccess()

  const canManageDomain = useMemo(() => isDomainAdmin(memberOf), [memberOf])
  const canManagePolicy = useMemo(() => isAccountPolicyAdmin(memberOf), [memberOf])
  const canManageMessages = useMemo(
    () => isMessageAdmin(memberOf) || isMessageSender(memberOf),
    [memberOf],
  )
  const canSendTestMessage = useMemo(() => isMessageAdmin(memberOf), [memberOf])

  const [domainForm, setDomainForm] = useState<DomainState | null>(null)
  const [initialDomainForm, setInitialDomainForm] = useState<DomainState | null>(null)
  const [policyForm, setPolicyForm] = useState<PolicyState | null>(null)
  const [initialPolicyForm, setInitialPolicyForm] = useState<PolicyState | null>(null)
  const [messageList, setMessageList] = useState<SystemMessageSummary[]>([])
  const [selectedMessage, setSelectedMessage] = useState<SystemMessageSummary | null>(null)
  const [domainImageVersion, setDomainImageVersion] = useState(0)
  const [domainImageSrc, setDomainImageSrc] = useState<string | null>(null)

  const [domainMessage, setDomainMessage] = useState<string | null>(null)
  const [policyMessage, setPolicyMessage] = useState<string | null>(null)
  const [messageMessage, setMessageMessage] = useState<string | null>(null)

  const [deniedNamesInput, setDeniedNamesInput] = useState('')
  const [badlistAppendInput, setBadlistAppendInput] = useState('')
  const [badlistRemoveInput, setBadlistRemoveInput] = useState('')
  const [keyRevokeInput, setKeyRevokeInput] = useState('')
  const [keyRevokeConfirm, setKeyRevokeConfirm] = useState(false)
  const [messageConfirmId, setMessageConfirmId] = useState<string | null>(null)
  const [sendTestTarget, setSendTestTarget] = useState('')

  const [domainBusy, setDomainBusy] = useState(false)
  const [policyBusy, setPolicyBusy] = useState(false)
  const [messageBusy, setMessageBusy] = useState(false)
  const [canManageDeniedNames, setCanManageDeniedNames] = useState(canManagePolicy)

  useEffect(() => {
    setCanManageDeniedNames(canManagePolicy)
  }, [canManagePolicy])

  const domainQuery = useQuery({
    queryKey: ['system', 'domain'],
    queryFn: fetchDomain,
  })

  const policyQuery = useQuery({
    queryKey: ['system', 'policy'],
    queryFn: fetchSystem,
  })

  const messagesQuery = useQuery({
    queryKey: ['system', 'messages'],
    queryFn: listMessages,
    enabled: canManageMessages,
  })

  const domainImageQuery = useQuery({
    queryKey: ['system', 'domain-image', domainImageVersion],
    queryFn: fetchDomainImageObjectUrl,
  })

  const requestReauthIfNeeded = (allowed: boolean) => {
    if (allowed && !canEdit) {
      requestReauth()
      return true
    }
    return false
  }

  useEffect(() => {
    if (domainQuery.error) {
      setDomainMessage(
        domainQuery.error instanceof Error
          ? domainQuery.error.message
          : t('system.messages.loadStateFailed'),
      )
      return
    }
    const domain = domainQuery.data
    const parsed = domain
      ? {
          displayName: domain.displayName,
          ldapBaseDn: domain.ldapBaseDn,
          ldapMaxQueryableAttrs: domain.ldapMaxQueryableAttrs,
          ldapAllowUnixPwBind: parseBoolean(domain.ldapAllowUnixPwBind),
          name: domain.name,
          uuid: domain.uuid,
        }
      : null
    setDomainForm(parsed)
    setInitialDomainForm(parsed)
  }, [domainQuery.data, domainQuery.error, t])

  useEffect(() => {
    if (policyQuery.error) {
      setPolicyMessage(
        policyQuery.error instanceof Error
          ? policyQuery.error.message
          : t('system.messages.loadStateFailed'),
      )
      return
    }
    const system = policyQuery.data
    const parsed = system
      ? {
          deniedNames: system.deniedNames,
          badlistPasswords: system.badlistPasswords,
          authSessionExpiry: system.authSessionExpiry,
          privilegeExpiry: system.privilegeExpiry,
        }
      : null
    setPolicyForm(parsed)
    setInitialPolicyForm(parsed)
  }, [policyQuery.data, policyQuery.error, t])

  useEffect(() => {
    if (!canManageMessages) {
      setMessageList([])
      setSelectedMessage(null)
      return
    }
    if (messagesQuery.error) {
      setMessageMessage(
        messagesQuery.error instanceof Error
          ? messagesQuery.error.message
          : t('system.messages.loadStateFailed'),
      )
      return
    }
    const list = messagesQuery.data ?? []
    setMessageList(list)
    if (selectedMessage) {
      const fresh = list.find((entry) => entry.id === selectedMessage.id)
      setSelectedMessage(fresh ?? null)
    }
  }, [canManageMessages, messagesQuery.data, messagesQuery.error, selectedMessage, t])

  useEffect(() => {
    if (domainImageQuery.error) {
      setDomainImageSrc((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      return
    }
    setDomainImageSrc((current) => {
      const next = domainImageQuery.data ?? null
      if (current && current !== next) URL.revokeObjectURL(current)
      return next
    })
  }, [domainImageQuery.data, domainImageQuery.error])

  useEffect(() => {
    return () => {
      if (domainImageSrc) URL.revokeObjectURL(domainImageSrc)
    }
  }, [domainImageSrc])

  const handleDomainSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!domainForm || !initialDomainForm) return
    if (requestReauthIfNeeded(canManageDomain)) return
    if (!canManageDomain) return

    setDomainBusy(true)
    setDomainMessage(null)
    try {
      const displayName = domainForm.displayName.trim()
      const initialDisplayName = initialDomainForm.displayName.trim()
      if (displayName !== initialDisplayName) {
        if (displayName) {
          await setDomainAttr('domain_display_name', [displayName])
        } else if (initialDisplayName) {
          await deleteDomainAttr('domain_display_name')
        }
      }

      const ldapBaseDn = domainForm.ldapBaseDn.trim()
      const initialLdapBaseDn = initialDomainForm.ldapBaseDn.trim()
      if (ldapBaseDn !== initialLdapBaseDn) {
        if (ldapBaseDn) {
          await setDomainAttr('domain_ldap_basedn', [ldapBaseDn])
        } else if (initialLdapBaseDn) {
          await deleteDomainAttr('domain_ldap_basedn')
        }
      }

      const ldapMaxAttrs = domainForm.ldapMaxQueryableAttrs.trim()
      const initialLdapMaxAttrs = initialDomainForm.ldapMaxQueryableAttrs.trim()
      if (ldapMaxAttrs !== initialLdapMaxAttrs) {
        if (ldapMaxAttrs) {
          await setDomainAttr('ldap_max_queryable_attrs', [ldapMaxAttrs])
        } else if (initialLdapMaxAttrs) {
          await deleteDomainAttr('ldap_max_queryable_attrs')
        }
      }

      if (domainForm.ldapAllowUnixPwBind !== initialDomainForm.ldapAllowUnixPwBind) {
        await setDomainAttr('ldap_allow_unix_pw_bind', [String(domainForm.ldapAllowUnixPwBind)])
      }
      setDomainMessage(t('system.messages.domainSaved'))
      window.dispatchEvent(new Event('kanidm:site-brand-updated'))
      await domainQuery.refetch()
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : t('system.messages.domainSaveFailed'))
    } finally {
      setDomainBusy(false)
    }
  }

  const handleDomainImageUpload = async (file: File) => {
    if (requestReauthIfNeeded(canManageDomain)) return
    if (!canManageDomain) return
    if (!file.size) {
      setDomainMessage(t('system.messages.imageSelectRequired'))
      return
    }

    setDomainBusy(true)
    setDomainMessage(null)
    try {
      await uploadDomainImage(file)
      setDomainImageVersion((prev) => prev + 1)
      window.dispatchEvent(new Event('kanidm:site-brand-updated'))
      setDomainMessage(t('system.messages.imageUpdated'))
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : t('system.messages.imageUpdateFailed'))
    } finally {
      setDomainBusy(false)
    }
  }

  const handleDomainImageRemove = async () => {
    if (requestReauthIfNeeded(canManageDomain)) return
    if (!canManageDomain) return
    setDomainBusy(true)
    setDomainMessage(null)
    try {
      await removeDomainImage()
      setDomainImageVersion((prev) => prev + 1)
      window.dispatchEvent(new Event('kanidm:site-brand-updated'))
      setDomainMessage(t('system.messages.imageRemoved'))
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : t('system.messages.imageRemoveFailed'))
    } finally {
      setDomainBusy(false)
    }
  }

  const handleRevokeKey = async () => {
    if (requestReauthIfNeeded(canManageDomain)) return
    if (!canManageDomain) return
    const keyId = keyRevokeInput.trim()
    if (!keyId) {
      setDomainMessage(t('system.messages.keyIdRequired'))
      return
    }

    setDomainBusy(true)
    setDomainMessage(null)
    try {
      await setDomainAttr('keyactionrevoke', [keyId])
      setDomainMessage(t('system.messages.keyRevokeSubmitted'))
      setKeyRevokeInput('')
      setKeyRevokeConfirm(false)
    } catch (error) {
      setDomainMessage(error instanceof Error ? error.message : t('system.messages.keyRevokeFailed'))
    } finally {
      setDomainBusy(false)
    }
  }

  const handleDeniedNamesAppend = async () => {
    if (requestReauthIfNeeded(canManageDeniedNames)) return
    if (!canManageDeniedNames) return
    const { values: entries, invalid } = normalizeDeniedNames(deniedNamesInput)
    if (entries.length === 0) return
    if (invalid.length > 0) {
      setPolicyMessage(
        t('system.messages.deniedNamesInvalidFormat', { values: invalid.join(', ') }),
      )
      return
    }

    const existing = new Set((policyForm?.deniedNames ?? []).map((entry) => entry.toLowerCase()))
    const uniqueNew = entries.filter((entry) => !existing.has(entry))
    if (uniqueNew.length === 0) {
      setPolicyMessage(t('system.messages.deniedNamesNoNewEntries'))
      return
    }

    setPolicyBusy(true)
    setPolicyMessage(null)
    try {
      await appendSystemAttr('denied_name', uniqueNew)
      setDeniedNamesInput('')
      await policyQuery.refetch()
      setPolicyMessage(t('system.messages.deniedNamesUpdated'))
    } catch (error) {
      const text = error instanceof Error ? error.message : t('system.messages.deniedNamesUpdateFailed')
      if (text.includes('"accessdenied"')) {
        setCanManageDeniedNames(false)
        setPolicyMessage(t('system.messages.deniedNamesWriteNotAllowed'))
      } else {
        setPolicyMessage(text)
      }
    } finally {
      setPolicyBusy(false)
    }
  }

  const handleDeniedNameRemove = async (name: string) => {
    if (requestReauthIfNeeded(canManageDeniedNames)) return
    if (!canManageDeniedNames) return
    setPolicyBusy(true)
    setPolicyMessage(null)
    try {
      await deleteSystemAttr('denied_name', [name])
      await policyQuery.refetch()
      setPolicyMessage(t('system.messages.deniedNameRemoved'))
    } catch (error) {
      const text = error instanceof Error ? error.message : t('system.messages.deniedNameRemoveFailed')
      if (text.includes('"accessdenied"')) {
        setCanManageDeniedNames(false)
        setPolicyMessage(t('system.messages.deniedNamesWriteNotAllowed'))
      } else {
        setPolicyMessage(text)
      }
    } finally {
      setPolicyBusy(false)
    }
  }

  const handleBadlistAppend = async () => {
    if (requestReauthIfNeeded(canManagePolicy)) return
    if (!canManagePolicy) return
    const entries = splitLines(badlistAppendInput)
    if (entries.length === 0) return

    setPolicyBusy(true)
    setPolicyMessage(null)
    try {
      await appendSystemAttr('badlist_password', entries)
      setBadlistAppendInput('')
      await policyQuery.refetch()
      setPolicyMessage(t('system.messages.badlistAppended'))
    } catch (error) {
      setPolicyMessage(error instanceof Error ? error.message : t('system.messages.badlistAppendFailed'))
    } finally {
      setPolicyBusy(false)
    }
  }

  const handleBadlistRemove = async () => {
    if (requestReauthIfNeeded(canManagePolicy)) return
    if (!canManagePolicy) return
    const entries = splitLines(badlistRemoveInput)
    if (entries.length === 0) return

    setPolicyBusy(true)
    setPolicyMessage(null)
    try {
      await deleteSystemAttr('badlist_password', entries)
      setBadlistRemoveInput('')
      await policyQuery.refetch()
      setPolicyMessage(t('system.messages.badlistRemoved'))
    } catch (error) {
      setPolicyMessage(error instanceof Error ? error.message : t('system.messages.badlistRemoveFailed'))
    } finally {
      setPolicyBusy(false)
    }
  }

  const handleExpirySave = async () => {
    if (requestReauthIfNeeded(canManagePolicy)) return
    if (!canManagePolicy || !policyForm || !initialPolicyForm) return

    setPolicyBusy(true)
    setPolicyMessage(null)
    try {
      const authExpiry = policyForm.authSessionExpiry.trim()
      const initialAuthExpiry = initialPolicyForm.authSessionExpiry.trim()
      if (authExpiry !== initialAuthExpiry && authExpiry) {
        await setSystemAttr('authsession_expiry', [authExpiry])
      }
      const privilegeExpiry = policyForm.privilegeExpiry.trim()
      const initialPrivilegeExpiry = initialPolicyForm.privilegeExpiry.trim()
      if (privilegeExpiry !== initialPrivilegeExpiry && privilegeExpiry) {
        await setSystemAttr('privilege_expiry', [privilegeExpiry])
      }
      await policyQuery.refetch()
      setPolicyMessage(t('system.messages.expirySaved'))
    } catch (error) {
      setPolicyMessage(error instanceof Error ? error.message : t('system.messages.expirySaveFailed'))
    } finally {
      setPolicyBusy(false)
    }
  }

  const handleMessageExpand = async (id: string) => {
    setMessageBusy(true)
    setMessageMessage(null)
    try {
      const detail = await getMessage(id)
      setSelectedMessage(detail)
    } catch (error) {
      setMessageMessage(error instanceof Error ? error.message : t('system.messages.messageDetailFailed'))
    } finally {
      setMessageBusy(false)
    }
  }

  const handleMarkSent = async (id: string) => {
    if (requestReauthIfNeeded(canManageMessages)) return
    if (!canManageMessages) return

    setMessageBusy(true)
    setMessageMessage(null)
    try {
      await markMessageSent(id)
      setMessageConfirmId(null)
      setMessageMessage(t('system.messages.messageMarkedSent'))
      await messagesQuery.refetch()
    } catch (error) {
      setMessageMessage(
        formatMessageError(
          error,
          t('system.messages.messageMarkSentFailed'),
        ),
      )
    } finally {
      setMessageBusy(false)
    }
  }

  const handleSendTestMessage = async () => {
    if (requestReauthIfNeeded(canSendTestMessage)) return
    if (!canSendTestMessage) return
    const target = sendTestTarget.trim()
    if (!target) return

    setMessageBusy(true)
    setMessageMessage(null)
    try {
      await sendTestMessage(target)
      setSendTestTarget('')
      setMessageMessage(t('system.messages.testMessageQueued'))
      await messagesQuery.refetch()
    } catch (error) {
      setMessageMessage(error instanceof Error ? error.message : t('system.messages.testMessageFailed'))
    } finally {
      setMessageBusy(false)
    }
  }

  if (domainQuery.isLoading || policyQuery.isLoading || (canManageMessages && messagesQuery.isLoading)) {
    return (
      <section className="page system-page">
        <h1>{t('system.title')}</h1>
        <p className="page-note system-page-note">{t('system.loading')}</p>
      </section>
    )
  }

  return (
    <section className="page system-page">
      <h1>{t('system.title')}</h1>
      <p className="page-note system-page-note">
        {t('system.subtitle')}
      </p>

      <div className="card-grid">
        <article className="panel-card">
          <header>
            <h2>{t('system.domain.title')}</h2>
            <p>{t('system.domain.subtitle')}</p>
          </header>
          {domainMessage && <p className="inline-feedback">{domainMessage}</p>}
          {domainForm ? (
            <>
              <p className="muted-text">
                {t('system.domain.domainLabel')}:{' '}
                <strong>{domainForm.name || domainForm.uuid || t('system.common.unknown')}</strong>
              </p>
              <form onSubmit={handleDomainSubmit}>
                <label className="field">
                  <span>{t('system.domain.displayName')}</span>
                  <input
                    placeholder={t('system.placeholders.domainDisplayName')}
                    value={domainForm.displayName}
                    onChange={(event) =>
                      setDomainForm((current) =>
                        current ? { ...current, displayName: event.target.value } : current,
                      )
                    }
                    readOnly={canManageDomain && !canEdit}
                    disabled={!canManageDomain}
                    onFocus={() => requestReauthIfNeeded(canManageDomain)}
                  />
                </label>
                <label className="field">
                  <span>{t('system.domain.ldapBaseDn')}</span>
                  <input
                    placeholder={t('system.placeholders.ldapBaseDn')}
                    value={domainForm.ldapBaseDn}
                    onChange={(event) =>
                      setDomainForm((current) =>
                        current ? { ...current, ldapBaseDn: event.target.value } : current,
                      )
                    }
                    readOnly={canManageDomain && !canEdit}
                    disabled={!canManageDomain}
                    onFocus={() => requestReauthIfNeeded(canManageDomain)}
                  />
                </label>
                <label className="field">
                  <span>{t('system.domain.ldapMaxQueryableAttrs')}</span>
                  <input
                    placeholder={t('system.placeholders.ldapMaxQueryableAttrs')}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={domainForm.ldapMaxQueryableAttrs}
                    onChange={(event) =>
                      setDomainForm((current) =>
                        current
                          ? { ...current, ldapMaxQueryableAttrs: event.target.value.replace(/[^\d]/g, '') }
                          : current,
                      )
                    }
                    readOnly={canManageDomain && !canEdit}
                    disabled={!canManageDomain}
                    onFocus={() => requestReauthIfNeeded(canManageDomain)}
                  />
                </label>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={domainForm.ldapAllowUnixPwBind}
                    onChange={(event) => {
                      if (requestReauthIfNeeded(canManageDomain)) return
                      setDomainForm((current) =>
                        current ? { ...current, ldapAllowUnixPwBind: event.target.checked } : current,
                      )
                    }}
                    disabled={!canManageDomain}
                    onFocus={() => requestReauthIfNeeded(canManageDomain)}
                  />
                  {t('system.domain.ldapAllowUnixPwBind')}
                </label>
                {canManageDomain ? (
                  <div className="panel-actions">
                    <button className="primary-button" type="submit" disabled={domainBusy}>
                      {t('system.domain.save')}
                    </button>
                  </div>
                ) : (
                  <p className="muted-text">{t('system.domain.permission')}</p>
                )}
              </form>

              <div className="credential-section">
                <div className="section-header">
                  <h3>{t('system.domain.imageTitle')}</h3>
                </div>
                <ImageEditor
                  imageSrc={domainImageSrc}
                  emptyText={t('system.domain.imageEmpty')}
                  canEdit={canManageDomain}
                  chooseLabel={t('system.domain.chooseImage')}
                  replaceLabel={t('system.domain.replaceImage')}
                  removeLabel={t('system.domain.removeImage')}
                  accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
                  onBeforeEdit={() => requestReauthIfNeeded(canManageDomain)}
                  onSelectImage={(file) => {
                    void handleDomainImageUpload(file)
                  }}
                  onRemoveImage={() => {
                    void handleDomainImageRemove()
                  }}
                />
              </div>

              <div className="credential-section danger-card">
                <div className="section-header">
                  <h3>{t('system.domain.revokeTitle')}</h3>
                </div>
                <p className="muted-text">
                  {t('system.domain.revokeDesc')}
                </p>
                <label className="field">
                  <span>{t('system.domain.keyId')}</span>
                  <input
                    placeholder={t('system.placeholders.keyId')}
                    value={keyRevokeInput}
                    onChange={(event) => setKeyRevokeInput(event.target.value)}
                    disabled={!canManageDomain}
                    readOnly={canManageDomain && !canEdit}
                    onFocus={() => requestReauthIfNeeded(canManageDomain)}
                  />
                </label>
                {canManageDomain && (
                  <>
                    {!keyRevokeConfirm ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setKeyRevokeConfirm(true)}
                        disabled={domainBusy || keyRevokeInput.trim().length === 0}
                      >
                        {t('system.domain.revokeButton')}
                      </button>
                    ) : (
                      <div className="ssh-confirm">
                        <span className="muted-text">{t('system.domain.revokeConfirm')}</span>
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => void handleRevokeKey()}
                          disabled={domainBusy}
                        >
                          {t('system.common.revoke')}
                        </button>
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => setKeyRevokeConfirm(false)}
                          disabled={domainBusy}
                        >
                          {t('system.common.cancel')}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="muted-text">{t('system.domain.unavailable')}</p>
          )}
        </article>

        <article className="panel-card">
          <header>
            <h2>{t('system.policy.title')}</h2>
            <p>{t('system.policy.subtitle')}</p>
          </header>
          {policyMessage && <p className="inline-feedback">{policyMessage}</p>}
          {policyForm ? (
            <>
              <div className="credential-section">
                <div className="section-header">
                  <h3>{t('system.policy.deniedNamesTitle')}</h3>
                </div>
                {policyForm.deniedNames.length === 0 ? (
                  <p className="muted-text">{t('system.policy.deniedNamesEmpty')}</p>
                ) : (
                  <div className="token-list">
                    {policyForm.deniedNames.map((name) => (
                      <div className="token-row" key={name}>
                        <div>{name}</div>
                        {canManageDeniedNames && (
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => void handleDeniedNameRemove(name)}
                            disabled={policyBusy}
                          >
                            {t('system.common.remove')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {canManageDeniedNames ? (
                  <>
                    <details className="ssh-add-toggle">
                      <summary>{t('system.policy.appendDeniedNames')}</summary>
                      <label className="field">
                        <span>{t('system.policy.appendDeniedNamesDesc')}</span>
                        <textarea
                          placeholder={t('system.placeholders.deniedNames')}
                          value={deniedNamesInput}
                          onChange={(event) => setDeniedNamesInput(event.target.value)}
                          readOnly={!canEdit}
                          onFocus={() => requestReauthIfNeeded(canManageDeniedNames)}
                        />
                      </label>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void handleDeniedNamesAppend()}
                        disabled={policyBusy}
                      >
                        {t('system.policy.appendDeniedNames')}
                      </button>
                    </details>
                  </>
                ) : (
                  <p className="muted-text">{t('system.policy.permissionDeniedNames')}</p>
                )}
              </div>

              <div className="credential-section">
                <div className="section-header">
                  <h3>{t('system.policy.badlistTitle')}</h3>
                </div>
                <p className="muted-text">
                  {t('system.policy.badlistCount', { count: policyForm.badlistPasswords.length })}
                </p>
                {policyForm.badlistPasswords.length > 0 && (
                  <details className="ssh-add-toggle">
                    <summary>{t('system.policy.showBadlist')}</summary>
                    <pre className="ssh-key-value">
                      {policyForm.badlistPasswords.slice(0, 100).join('\n')}
                    </pre>
                  </details>
                )}
                <p className="muted-text">
                  {t('system.policy.badlistNote')}
                </p>
                {canManagePolicy ? (
                  <>
                    <details className="ssh-add-toggle">
                      <summary>{t('system.policy.appendBadlist')}</summary>
                      <label className="field">
                        <span>{t('system.policy.appendBadlistDesc')}</span>
                        <textarea
                          placeholder={t('system.placeholders.badlistAppend')}
                          value={badlistAppendInput}
                          onChange={(event) => setBadlistAppendInput(event.target.value)}
                          readOnly={!canEdit}
                          onFocus={() => requestReauthIfNeeded(canManagePolicy)}
                        />
                      </label>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void handleBadlistAppend()}
                        disabled={policyBusy}
                      >
                        {t('system.policy.appendBadlist')}
                      </button>
                    </details>
                    <details className="ssh-add-toggle">
                      <summary>{t('system.policy.removeBadlist')}</summary>
                      <label className="field">
                        <span>{t('system.policy.removeBadlistDesc')}</span>
                        <textarea
                          placeholder={t('system.placeholders.badlistRemove')}
                          value={badlistRemoveInput}
                          onChange={(event) => setBadlistRemoveInput(event.target.value)}
                          readOnly={!canEdit}
                          onFocus={() => requestReauthIfNeeded(canManagePolicy)}
                        />
                      </label>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void handleBadlistRemove()}
                        disabled={policyBusy}
                      >
                        {t('system.policy.removeBadlist')}
                      </button>
                    </details>
                  </>
                ) : (
                  <p className="muted-text">{t('system.policy.permissionBadlist')}</p>
                )}
              </div>

              <div className="credential-section">
                <div className="section-header">
                  <h3>{t('system.policy.expiryTitle')}</h3>
                </div>
                <label className="field">
                  <span>{t('system.policy.authExpiry')}</span>
                  <input
                    placeholder={t('system.placeholders.authExpiry')}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={policyForm.authSessionExpiry}
                    onChange={(event) =>
                      setPolicyForm((current) =>
                        current
                          ? { ...current, authSessionExpiry: event.target.value.replace(/[^\d]/g, '') }
                          : current,
                      )
                    }
                    readOnly={canManagePolicy && !canEdit}
                    disabled={!canManagePolicy}
                    onFocus={() => requestReauthIfNeeded(canManagePolicy)}
                  />
                  <span className="muted-text">
                    {t('system.common.current')}:{' '}
                    {formatExpiryTime(policyForm.authSessionExpiry, t('system.common.notSet'))}
                  </span>
                </label>
                <label className="field">
                  <span>{t('system.policy.privilegeExpiry')}</span>
                  <input
                    placeholder={t('system.placeholders.privilegeExpiry')}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={policyForm.privilegeExpiry}
                    onChange={(event) =>
                      setPolicyForm((current) =>
                        current
                          ? { ...current, privilegeExpiry: event.target.value.replace(/[^\d]/g, '') }
                          : current,
                      )
                    }
                    readOnly={canManagePolicy && !canEdit}
                    disabled={!canManagePolicy}
                    onFocus={() => requestReauthIfNeeded(canManagePolicy)}
                  />
                  <span className="muted-text">
                    {t('system.common.current')}:{' '}
                    {formatExpiryTime(policyForm.privilegeExpiry, t('system.common.notSet'))}
                  </span>
                </label>
                {canManagePolicy && (
                  <div className="panel-actions">
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void handleExpirySave()}
                      disabled={policyBusy}
                    >
                      {t('system.policy.saveExpiry')}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="muted-text">{t('system.policy.unavailable')}</p>
          )}
        </article>

        <article className="panel-card">
          <header>
            <h2>{t('system.message.title')}</h2>
            <p>{t('system.message.subtitle')}</p>
          </header>
          {messageMessage && <p className="inline-feedback">{messageMessage}</p>}
          {!canManageMessages ? (
            <p className="muted-text">{t('system.message.permission')}</p>
          ) : (
            <>
              {messageList.length === 0 ? (
                <p className="muted-text">{t('system.message.empty')}</p>
              ) : (
                <div className="token-list">
                  {messageList.map((message) => (
                    <div className="token-row" key={message.id}>
                      <div>
                        <div>{message.id}</div>
                        <div className="token-meta">
                          <span>{t('system.message.template')}: {message.template}</span>
                          <span>
                            {t('system.message.sendAfter')}:{' '}
                            {formatExpiryTime(message.sendAfter, t('system.common.na'))}
                          </span>
                          <span>
                            {t('system.message.sentAt')}:{' '}
                            {message.sentAt ? formatExpiryTime(message.sentAt) : t('system.message.queued')}
                          </span>
                        </div>
                      </div>
                      <div className="inline-actions">
                        <button
                          className="link-button"
                          type="button"
                          onClick={() => void handleMessageExpand(message.id)}
                          disabled={messageBusy}
                        >
                          {t('system.common.view')}
                        </button>
                        {messageConfirmId === message.id ? (
                          <>
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => void handleMarkSent(message.id)}
                              disabled={messageBusy}
                            >
                              {t('system.message.confirmSent')}
                            </button>
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => setMessageConfirmId(null)}
                            >
                              {t('system.common.cancel')}
                            </button>
                          </>
                        ) : (
                          <button
                            className="link-button"
                            type="button"
                            onClick={() => {
                              if (requestReauthIfNeeded(canManageMessages)) return
                              setMessageConfirmId(message.id)
                            }}
                            disabled={messageBusy}
                          >
                            {t('system.message.markSent')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedMessage && (
                <div className="credential-section">
                <div className="section-header">
                    <h3>{t('system.message.detailTitle')}</h3>
                  </div>
                  <p className="muted-text">{t('system.message.id')}: {selectedMessage.id}</p>
                  <p className="muted-text">{t('system.message.template')}: {selectedMessage.template}</p>
                  <p className="muted-text">
                    {t('system.message.sendAfter')}:{' '}
                    {formatExpiryTime(selectedMessage.sendAfter, t('system.common.na'))}
                  </p>
                  <p className="muted-text">
                    {t('system.message.sentAt')}:{' '}
                    {selectedMessage.sentAt ? formatExpiryTime(selectedMessage.sentAt) : t('system.message.queued')}
                  </p>
                  <p className="muted-text">
                    {t('system.message.deleteAfter')}:{' '}
                    {formatExpiryTime(selectedMessage.deleteAfter, t('system.common.na'))}
                  </p>
                  <p className="muted-text">
                    {t('system.message.recipients')}:{' '}
                    {selectedMessage.recipients.length > 0
                      ? selectedMessage.recipients.join(', ')
                      : t('system.common.none')}
                  </p>
                </div>
              )}

              {canSendTestMessage && (
                <div className="credential-section">
                <div className="section-header">
                    <h3>{t('system.message.sendTestTitle')}</h3>
                  </div>
                  <label className="field">
                    <span>{t('system.message.sendTestTarget')}</span>
                    <input
                      placeholder={t('system.placeholders.sendTestTarget')}
                      value={sendTestTarget}
                      onChange={(event) => setSendTestTarget(event.target.value)}
                      readOnly={!canEdit}
                      onFocus={() => requestReauthIfNeeded(canSendTestMessage)}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleSendTestMessage()}
                    disabled={messageBusy}
                  >
                    {t('system.message.sendTestButton')}
                  </button>
                </div>
              )}
            </>
          )}
        </article>
      </div>

    </section>
  )
}
