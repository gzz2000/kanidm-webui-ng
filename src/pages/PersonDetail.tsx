import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { components } from '../api/schema'
import {
  clearPersonAttr,
  createCredentialResetToken,
  fetchCredentialStatus,
  fetchPerson,
  fetchUnixToken,
  setPersonAttr,
  setPersonUnix,
  updatePerson,
} from '../api'
import { useAccess } from '../auth/AccessContext'
import { stripDomain } from '../utils/strings'
import { getPasskeySummary, getPasswordState, getTotpSummary } from '../utils/credentials'
import { formatExpiryTime, fromLocalDateTime, toLocalDateTime } from '../utils/dates'
import { emailsEqual, normalizeEmails } from '../utils/email'
import { isNotFound } from '../utils/errors'
import {
  hasAnyGroup,
  isHighPrivilege,
  isServiceDesk,
  isUnixAdmin,
} from '../utils/groupAccess'

type CredentialStatus = components['schemas']['CredentialStatus']
type UnixUserToken = components['schemas']['UnixUserToken']

type PersonForm = {
  name: string
  displayName: string
  legalName: string
  emails: string[]
  validFrom: string
  expiresAt: string
}

type PersonMeta = {
  uuid: string
  memberOf: string[]
  directMemberOf: string[]
  passkeys: string[] | null
  attestedPasskeys: string[] | null
}

function describeSummary(
  summary: { state: 'unavailable' | 'notSet' | 'set'; labels: string[] },
  t: (key: string, args?: Record<string, unknown>) => string,
) {
  if (summary.state === 'unavailable') return t('people.summaryUnavailable')
  if (summary.state === 'notSet') return t('people.summaryNotSet')
  return t('people.summarySetWithTags', {
    count: summary.labels.length,
    tags: summary.labels.join(', '),
  })
}

function describePasswordState(
  state: 'unavailable' | 'notSet' | 'set',
  t: (key: string) => string,
) {
  if (state === 'unavailable') return t('people.summaryUnavailable')
  return state === 'set' ? t('people.summarySet') : t('people.summaryNotSet')
}

export default function PersonDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { canEdit, memberOf, requestReauth } = useAccess()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [identityMessage, setIdentityMessage] = useState<string | null>(null)
  const [emailMessage, setEmailMessage] = useState<string | null>(null)
  const [validityMessage, setValidityMessage] = useState<string | null>(null)
  const [form, setForm] = useState<PersonForm | null>(null)
  const [initialForm, setInitialForm] = useState<PersonForm | null>(null)
  const [personMeta, setPersonMeta] = useState<PersonMeta | null>(null)
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus | null>(null)
  const [credentialMessage, setCredentialMessage] = useState<string | null>(null)
  const [resetToken, setResetToken] = useState<{ token: string; expiry_time?: string } | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetTtl, setResetTtl] = useState('3600')
  const [posixToken, setPosixToken] = useState<UnixUserToken | null>(null)
  const [posixMessage, setPosixMessage] = useState<string | null>(null)
  const [posixLoading, setPosixLoading] = useState(false)
  const [posixGid, setPosixGid] = useState('')
  const [posixShell, setPosixShell] = useState('')
  const [copyTip, setCopyTip] = useState(false)

  const isPeopleAdmin = useMemo(
    () => hasAnyGroup(memberOf, ['idm_people_admins']),
    [memberOf],
  )
  const canReadPii = useMemo(
    () => hasAnyGroup(memberOf, ['idm_people_admins', 'idm_people_pii_read']),
    [memberOf],
  )
  const canResetToken = useMemo(
    () =>
      hasAnyGroup(memberOf, [
        'idm_people_admins',
        'idm_people_on_boarding',
        'idm_service_desk',
      ]),
    [memberOf],
  )
  const canManagePosix = useMemo(
    () => isUnixAdmin(memberOf),
    [memberOf],
  )

  const personHighPrivilege = useMemo(() => {
    if (!personMeta) return false
    return isHighPrivilege(personMeta.memberOf)
  }, [personMeta])

  const canManageValidity = useMemo(
    () => isPeopleAdmin || (isServiceDesk(memberOf) && !personHighPrivilege),
    [isPeopleAdmin, memberOf, personHighPrivilege],
  )

  const allowResetToken = canResetToken && (isPeopleAdmin || !personHighPrivilege)

  const passkeySummary = useMemo(() => {
    if (!personMeta) return null
    if (personMeta.passkeys === null && personMeta.attestedPasskeys === null) {
      return null
    }
    const passkeys = personMeta.passkeys ?? []
    const attested = personMeta.attestedPasskeys ?? []
    return [...passkeys, ...attested]
  }, [personMeta])

  useEffect(() => {
    let active = true
    if (!id) {
      navigate('/people', { replace: true })
      return
    }

    const load = async () => {
      setLoading(true)
      setMessage(null)
      setCredentialMessage(null)
      setPosixMessage(null)
      try {
        const person = await fetchPerson(id)
        if (!active) return
        if (!person) {
          setMessage(t('people.detail.notFound'))
          setLoading(false)
          return
        }
        if (person.uuid && person.uuid !== id) {
          navigate(`/people/${person.uuid}`, { replace: true })
        }
        setPersonMeta({
          uuid: person.uuid,
          memberOf: person.memberOf,
          directMemberOf: person.directMemberOf,
          passkeys: person.passkeys,
          attestedPasskeys: person.attestedPasskeys,
        })
        const nextForm: PersonForm = {
          name: person.name,
          displayName: person.displayName,
          legalName: person.legalName ?? '',
          emails: person.emails,
          validFrom: toLocalDateTime(person.accountValidFrom),
          expiresAt: toLocalDateTime(person.accountExpire),
        }
        setForm(nextForm)
        setInitialForm(nextForm)

        try {
          const status = await fetchCredentialStatus(person.uuid || id)
          if (!active) return
          setCredentialStatus(status)
        } catch (error) {
          if (!active) return
          setCredentialMessage(
            error instanceof Error
              ? error.message
              : t('people.messages.credentialStatusFailed'),
          )
        }

        try {
          const token = await fetchUnixToken(person.uuid || id)
          if (!active) return
          setPosixToken(token)
          setPosixGid(String(token.gidnumber ?? ''))
          setPosixShell(token.shell ?? '')
        } catch (error) {
          if (!active) return
          if (isNotFound(error)) {
            setPosixToken(null)
          } else {
            setPosixMessage(
              error instanceof Error ? error.message : t('people.messages.posixLoadFailed'),
            )
          }
        }
      } catch (error) {
        if (!active) return
        setMessage(error instanceof Error ? error.message : t('people.messages.loadFailed'))
      } finally {
        if (!active) return
        setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [id, navigate, t])

  const requestReauthIfNeeded = (allowed: boolean) => {
    if (allowed && !canEdit) {
      requestReauth()
    }
  }

  const handleIdentityChange = (field: keyof PersonForm, value: string) => {
    if (!form) return
    setForm({ ...form, [field]: value })
  }

  const handleEmailChange = (index: number, value: string) => {
    if (!form) return
    const nextEmails = [...form.emails]
    nextEmails[index] = value
    setForm({ ...form, emails: nextEmails })
  }

  const handleEmailAdd = () => {
    if (!form) return
    if (!canEdit && isPeopleAdmin) {
      requestReauth()
      return
    }
    setForm({ ...form, emails: [...form.emails, ''] })
  }

  const handleEmailRemove = (index: number) => {
    if (!form) return
    if (!canEdit && isPeopleAdmin) {
      requestReauth()
      return
    }
    const nextEmails = form.emails.filter((_, idx) => idx !== index)
    setForm({ ...form, emails: nextEmails })
  }

  const handleIdentitySave = async () => {
    if (!form || !initialForm || !id) return
    if (!canManageValidity) return
    if (!canEdit) {
      requestReauth()
      return
    }
    setIdentityMessage(null)

    const name = form.name.trim()
    const displayName = form.displayName.trim()
    const legalName = form.legalName.trim()
    if (!name || !displayName) {
      setIdentityMessage(t('people.messages.identityRequired'))
      return
    }

    try {
      await updatePerson({
        id,
        name: name !== initialForm.name ? name : undefined,
        displayName: displayName !== initialForm.displayName ? displayName : undefined,
        legalName:
          canReadPii && legalName !== initialForm.legalName ? legalName : undefined,
      })
      setInitialForm({
        ...initialForm,
        name,
        displayName,
        legalName,
      })
      setIdentityMessage(t('people.messages.identityUpdated'))
    } catch (error) {
      setIdentityMessage(error instanceof Error ? error.message : t('people.messages.identityFailed'))
    }
  }

  const handleEmailSave = async () => {
    if (!form || !initialForm || !id) return
    if (!isPeopleAdmin || !canReadPii) return
    if (!canEdit) {
      requestReauth()
      return
    }
    setEmailMessage(null)

    const emails = normalizeEmails(form.emails)
    if (emailsEqual(emails, normalizeEmails(initialForm.emails))) {
      setEmailMessage(t('people.messages.emailUnchanged'))
      return
    }

    try {
      await updatePerson({
        id,
        emails,
      })
      setInitialForm({ ...initialForm, emails })
      setEmailMessage(t('people.messages.emailUpdated'))
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : t('people.messages.emailFailed'))
    }
  }

  const handleValiditySave = async () => {
    if (!form || !initialForm || !id) return
    if (!canManageValidity) return
    if (!canEdit) {
      requestReauth()
      return
    }
    setValidityMessage(null)

    const validFrom = form.validFrom.trim()
    const expiresAt = form.expiresAt.trim()
    const validFromIso = fromLocalDateTime(validFrom)
    const expiresAtIso = fromLocalDateTime(expiresAt)
    if (validFromIso === undefined || expiresAtIso === undefined) {
      setValidityMessage(t('people.messages.validityInvalid'))
      return
    }
    const validFromChanged = validFrom !== initialForm.validFrom
    const expiresAtChanged = expiresAt !== initialForm.expiresAt

    try {
      if (validFromChanged) {
        if (validFromIso) {
          await setPersonAttr(id, 'account_valid_from', [validFromIso])
        } else {
          await clearPersonAttr(id, 'account_valid_from')
        }
      }
      if (expiresAtChanged) {
        if (expiresAtIso) {
          await setPersonAttr(id, 'account_expire', [expiresAtIso])
        } else {
          await clearPersonAttr(id, 'account_expire')
        }
      }
      setInitialForm({ ...initialForm, validFrom, expiresAt })
      setValidityMessage(t('people.messages.validityUpdated'))
    } catch (error) {
      setValidityMessage(error instanceof Error ? error.message : t('people.messages.validityFailed'))
    }
  }

  const handleExpireNow = () => {
    const nowValue = toLocalDateTime(new Date().toISOString())
    handleIdentityChange('expiresAt', nowValue)
    setValidityMessage(t('people.detail.expireNowHint'))
  }

  const handleResetToken = async () => {
    if (!id) return
    if (!allowResetToken) return
    if (!canEdit) {
      requestReauth()
      return
    }
    setResetLoading(true)
    setResetMessage(null)
    try {
      const ttlValue = resetTtl.trim()
      const ttl = ttlValue ? Number(ttlValue) : undefined
      const ttlSeconds =
        ttl && Number.isFinite(ttl) && ttl > 0 ? Math.trunc(ttl) : undefined
      const token = await createCredentialResetToken(id, ttlSeconds)
      setResetToken(token)
      setResetMessage(t('people.messages.resetCreated'))
    } catch (error) {
      setResetMessage(error instanceof Error ? error.message : t('people.messages.resetFailed'))
    } finally {
      setResetLoading(false)
    }
  }

  const handleCopyReset = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyTip(true)
      window.setTimeout(() => setCopyTip(false), 1500)
    } catch {
      setCopyTip(false)
    }
  }

  const handlePosixSave = async () => {
    if (!id) return
    if (!canManagePosix) return
    if (!canEdit) {
      requestReauth()
      return
    }
    setPosixLoading(true)
    setPosixMessage(null)
    try {
      const gidValue = posixGid.trim()
      const gidnumber = gidValue ? Number(gidValue) : undefined
      if (gidValue && (!Number.isFinite(gidnumber) || gidnumber <= 0)) {
        setPosixMessage(t('people.messages.posixGidInvalid'))
        setPosixLoading(false)
        return
      }
      const shell = posixShell.trim() || undefined
      await setPersonUnix(id, {
        gidnumber: gidnumber ? Math.trunc(gidnumber) : undefined,
        shell,
      })
      const token = await fetchUnixToken(id)
      setPosixToken(token)
      setPosixGid(String(token.gidnumber ?? ''))
      setPosixShell(token.shell ?? '')
      setPosixMessage(t('people.messages.posixUpdated'))
    } catch (error) {
      setPosixMessage(error instanceof Error ? error.message : t('people.messages.posixFailed'))
    } finally {
      setPosixLoading(false)
    }
  }

  if (loading) {
    return (
      <section className="page person-page">
        <p className="page-note">{t('people.loadingDetail')}</p>
      </section>
    )
  }

  if (!form) {
    return (
      <section className="page person-page">
        <p className="page-note">{message ?? t('people.detail.notFound')}</p>
        <button className="secondary-button" type="button" onClick={() => navigate('/people')}>
          {t('people.backToPeople')}
        </button>
      </section>
    )
  }

  const resetLink = resetToken ? `${window.location.origin}/reset?token=${resetToken.token}` : ''
  const passkeys = passkeySummary

  return (
    <section className="page person-page">
      <div className="person-header">
        <div>
          <h1>{form.displayName}</h1>
          <p className="page-note">
            {personMeta?.uuid
              ? t('people.detail.identityLine', {
                  name: form.name,
                  uuid: personMeta.uuid,
                })
              : t('people.detail.identityLineNoUuid', { name: form.name })}
          </p>
          {personHighPrivilege && (
            <span className="badge badge-warn badge-sharp">
              {t('shell.highPrivilege')}
            </span>
          )}
        </div>
        <div className="person-actions">
          <button className="secondary-button" type="button" onClick={() => navigate('/people')}>
            {t('people.backToPeople')}
          </button>
        </div>
      </div>

      <div className="profile-grid person-grid">
        <div className="profile-card person-card">
          <header>
            <h2>{t('people.detail.identityTitle')}</h2>
            <p>{t('people.detail.identityDesc')}</p>
          </header>
          {identityMessage && <p className="feedback">{identityMessage}</p>}
          <div className="field">
            <label>{t('people.labels.username')}</label>
            <input
              value={form.name}
              onChange={(event) => handleIdentityChange('name', event.target.value)}
              disabled={!isPeopleAdmin}
              readOnly={isPeopleAdmin && !canEdit}
              onFocus={() => requestReauthIfNeeded(isPeopleAdmin)}
            />
          </div>
          <div className="field">
            <label>{t('people.labels.displayName')}</label>
            <input
              value={form.displayName}
              onChange={(event) => handleIdentityChange('displayName', event.target.value)}
              disabled={!isPeopleAdmin}
              readOnly={isPeopleAdmin && !canEdit}
              onFocus={() => requestReauthIfNeeded(isPeopleAdmin)}
            />
          </div>
          <div className="field">
            {canReadPii && (
              <>
                <label>{t('people.labels.legalName')}</label>
                <input
                  value={form.legalName}
                  onChange={(event) => handleIdentityChange('legalName', event.target.value)}
                  disabled={!isPeopleAdmin}
                  readOnly={isPeopleAdmin && !canEdit}
                  onFocus={() => requestReauthIfNeeded(isPeopleAdmin)}
                />
              </>
            )}
          </div>
          {isPeopleAdmin && (
            <div className="profile-actions">
              <button
                className="primary-button"
                type="button"
                onClick={handleIdentitySave}
              >
                {t('people.detail.saveIdentity')}
              </button>
            </div>
          )}
        </div>

        <div className="profile-card person-card">
          <header>
            <h2>{t('people.detail.emailTitle')}</h2>
            <p>{t('people.detail.emailDesc')}</p>
          </header>
          {emailMessage && <p className="feedback">{emailMessage}</p>}
          {canReadPii ? (
            <div className="profile-emails">
              <div className="profile-emails-header">
                <span>
                  {form.emails.length === 0
                    ? t('people.detail.emailEmpty')
                    : t('people.detail.emailList')}
                </span>
                {isPeopleAdmin && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={handleEmailAdd}
                  >
                    {t('people.actions.add')}
                  </button>
                )}
              </div>
              {form.emails.map((email, index) => (
                <div className="profile-email-row" key={`email-${index}`}>
                  <input
                    value={email}
                    placeholder={t('people.detail.emailPlaceholder')}
                    onChange={(event) => handleEmailChange(index, event.target.value)}
                    disabled={!isPeopleAdmin}
                    readOnly={isPeopleAdmin && !canEdit}
                    onFocus={() => requestReauthIfNeeded(isPeopleAdmin)}
                  />
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => handleEmailRemove(index)}
                    disabled={!isPeopleAdmin}
                  >
                    {t('people.actions.remove')}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-text">{t('people.detail.piiHidden')}</p>
          )}
          {isPeopleAdmin && canReadPii && (
            <div className="profile-actions">
              <button
                className="primary-button"
                type="button"
                onClick={handleEmailSave}
              >
                {t('people.detail.saveEmail')}
              </button>
            </div>
          )}
        </div>

        <div className="profile-card person-card">
          <header>
            <h2>{t('people.detail.validityTitle')}</h2>
            <p>{t('people.detail.validityDesc')}</p>
          </header>
          {validityMessage && <p className="feedback">{validityMessage}</p>}
          <div className="field">
            <label>{t('people.labels.validFrom')}</label>
            <input
              type="datetime-local"
              value={form.validFrom}
              placeholder={t('people.detail.datePlaceholder')}
              onChange={(event) => handleIdentityChange('validFrom', event.target.value)}
              disabled={!canManageValidity}
              readOnly={canManageValidity && !canEdit}
              onFocus={() => requestReauthIfNeeded(canManageValidity)}
            />
          </div>
          <div className="field">
            <label>{t('people.labels.expiresAt')}</label>
            <input
              type="datetime-local"
              value={form.expiresAt}
              placeholder={t('people.detail.datePlaceholder')}
              onChange={(event) => handleIdentityChange('expiresAt', event.target.value)}
              disabled={!canManageValidity}
              readOnly={canManageValidity && !canEdit}
              onFocus={() => requestReauthIfNeeded(canManageValidity)}
            />
          </div>
          {canManageValidity && (
            <div className="profile-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={handleExpireNow}
              >
                {t('people.detail.expireNow')}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={handleValiditySave}
              >
                {t('people.detail.saveValidity')}
              </button>
            </div>
          )}
        </div>

        <div className="profile-card person-card">
          <header>
            <h2>{t('people.detail.credentialsTitle')}</h2>
            <p>{t('people.detail.credentialsDesc')}</p>
          </header>
          {credentialMessage && <p className="feedback">{credentialMessage}</p>}
          <div className="credential-summary">
            <div>
              <strong>{t('people.labels.passkeys')}</strong>
              <span>{describeSummary(getPasskeySummary(passkeys), t)}</span>
            </div>
            <div>
              <strong>{t('people.labels.password')}</strong>
              <span>{describePasswordState(getPasswordState(credentialStatus), t)}</span>
            </div>
            <div>
              <strong>{t('people.labels.totp')}</strong>
              <span>{describeSummary(getTotpSummary(credentialStatus), t)}</span>
            </div>
          </div>
          {!canResetToken && (
            <p className="muted-text">
              {t('people.detail.resetNoPermission')}
            </p>
          )}

          {allowResetToken && (
            <>
              <div className="field">
                <label>{t('people.labels.resetTtl')}</label>
                <input
                  value={resetTtl}
                  onChange={(event) => setResetTtl(event.target.value)}
                  readOnly={!canEdit}
                  onFocus={() => requestReauthIfNeeded(allowResetToken)}
                />
                <span className="muted-text">
                  {t('people.detail.resetTtlHelp')}
                </span>
              </div>
              <div className="profile-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={handleResetToken}
                  disabled={resetLoading}
                >
                  {resetLoading ? t('people.detail.resetCreating') : t('people.detail.resetCreate')}
                </button>
              </div>
            </>
          )}
          {resetMessage && <p className="feedback">{resetMessage}</p>}
          {!allowResetToken && canResetToken && personHighPrivilege && !isPeopleAdmin && (
            <p className="muted-text">
              {t('people.detail.resetHighPrivDenied')}
            </p>
          )}
          {resetToken && (
            <div className="reset-summary">
              <div className="field">
                <label>{t('people.labels.resetToken')}</label>
                <code>{resetToken.token}</code>
              </div>
              <div className="field">
                <label>{t('people.labels.resetLink')}</label>
                <div className="copy-row">
                  <code>{resetLink}</code>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => handleCopyReset(resetLink)}
                  >
                    {t('people.actions.copyLink')}
                  </button>
                  {copyTip && <span className="copy-tip">{t('people.actions.copied')}</span>}
                </div>
              </div>
              {resetToken.expiry_time && (
                <p className="muted-text">
                  {t('people.detail.resetExpires', {
                    time: formatExpiryTime(resetToken.expiry_time),
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="profile-card person-card">
          <header>
            <h2>{t('people.detail.posixTitle')}</h2>
            <p>{t('people.detail.posixDesc')}</p>
          </header>
          {!canManagePosix && (
            <p className="muted-text">{t('people.detail.posixNoPermission')}</p>
          )}
          {posixMessage && <p className="feedback">{posixMessage}</p>}
          {posixToken ? (
            <p className="muted-text">
              {t('people.detail.posixEnabled', {
                gid: posixToken.gidnumber,
                shell: posixToken.shell ?? t('people.detail.posixDefaultShell'),
              })}
            </p>
          ) : (
            <p className="muted-text">{t('people.detail.posixDisabled')}</p>
          )}
          {canManagePosix && (
            <>
              <div className="field">
                <label>{t('people.labels.gidNumber')}</label>
                <input
                  value={posixGid}
                  placeholder={t('people.detail.posixGidPlaceholder')}
                  onChange={(event) => setPosixGid(event.target.value)}
                  readOnly={!canEdit}
                  onFocus={() => requestReauthIfNeeded(canManagePosix)}
                />
              </div>
              <div className="field">
                <label>{t('people.labels.loginShell')}</label>
                <input
                  value={posixShell}
                  placeholder={t('people.detail.posixShellPlaceholder')}
                  onChange={(event) => setPosixShell(event.target.value)}
                  readOnly={!canEdit}
                  onFocus={() => requestReauthIfNeeded(canManagePosix)}
                />
              </div>
              <div className="profile-actions">
                <button
                  className="primary-button"
                  type="button"
                  onClick={handlePosixSave}
                  disabled={posixLoading}
                >
                  {posixLoading ? t('people.detail.posixSaving') : t('people.detail.posixSave')}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="profile-card person-card">
          <header>
            <h2>{t('people.detail.groupsTitle')}</h2>
            <p>{t('people.detail.groupsDesc')}</p>
          </header>
          <div className="person-groups">
            <div className="person-group-list">
              <span className="muted-text">{t('people.detail.directMemberships')}</span>
              <div className="person-group-tags">
                {personMeta?.directMemberOf && personMeta.directMemberOf.length > 0 ? (
                  personMeta.directMemberOf.map((group) => (
                    <span className="badge" key={`direct-${group}`}>
                      {stripDomain(group)}
                    </span>
                  ))
                ) : (
                  <span className="muted-text">{t('people.detail.none')}</span>
                )}
              </div>
            </div>
            <div className="person-group-list">
              <span className="muted-text">{t('people.detail.inheritedMemberships')}</span>
              <div className="person-group-tags">
                {personMeta?.memberOf && personMeta.memberOf.length > 0 ? (
                  personMeta.memberOf
                    .filter((group) => !personMeta.directMemberOf.includes(group))
                    .map((group) => (
                      <span className="badge" key={`inherited-${group}`}>
                        {stripDomain(group)}
                      </span>
                    ))
                ) : (
                  <span className="muted-text">{t('people.detail.none')}</span>
                )}
              </div>
            </div>
            <span className="muted-text">
              {t('people.detail.groupEditHint')}
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
