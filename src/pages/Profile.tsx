import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  beginCredentialUpdate,
  cancelCredentialUpdate,
  clearAuthToken,
  commitCredentialUpdate,
  fetchCredentialStatus,
  fetchRadiusSecret,
  fetchSelfProfile,
  regenerateRadiusSecret,
  updatePersonProfile,
  deleteRadiusSecret,
} from '../api'
import type { components } from '../api/schema'
import { useAuth } from '../auth/AuthContext'
import { useAccess } from '../auth/AccessContext'
import CredentialSections from '../components/CredentialSections'

type CUStatus = components['schemas']['CUStatus']
type CUSessionToken = components['schemas']['CUSessionToken']
type CredentialStatus = components['schemas']['CredentialStatus']

type ProfileForm = {
  name: string
  displayName: string
  emails: string[]
}


function normalizeEmails(emails: string[]) {
  return emails.map((email) => email.trim()).filter(Boolean)
}

function emailsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((email, index) => email === right[index])
}

function summarizePasskeys(labels: string[] | null | undefined, t: (key: string, args?: Record<string, unknown>) => string) {
  if (!labels) return t('profile.summaryUnavailable')
  if (labels.length === 0) return t('profile.summaryNotSet')
  return t('profile.summarySetWithTags', { count: labels.length, tags: labels.join(', ') })
}

function summarizePassword(status: CredentialStatus | null, t: (key: string) => string) {
  if (!status || !Array.isArray(status.creds)) return t('profile.summaryUnavailable')
  const hasPassword = status.creds.some((cred) => {
    if (cred.type_ === 'Password' || cred.type_ === 'GeneratedPassword') return true
    return typeof cred.type_ === 'object' && cred.type_ && 'PasswordMfa' in cred.type_
  })
  return hasPassword ? t('profile.summarySet') : t('profile.summaryNotSet')
}

function summarizeTotp(status: CredentialStatus | null, t: (key: string, args?: Record<string, unknown>) => string) {
  if (!status || !Array.isArray(status.creds)) return t('profile.summaryUnavailable')
  let totpLabels: string[] = []
  status.creds.forEach((cred) => {
    if (typeof cred.type_ === 'object' && cred.type_ && 'PasswordMfa' in cred.type_) {
      const detail = cred.type_.PasswordMfa
      const labels = Array.isArray(detail) ? detail[0] : []
      if (Array.isArray(labels)) {
        totpLabels = labels
      }
    }
  })
  if (totpLabels.length === 0) return t('profile.summaryNotSet')
  return t('profile.summarySetWithTags', {
    count: totpLabels.length,
    tags: totpLabels.join(', '),
  })
}

export default function Profile() {
  const { setAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileForm | null>(null)
  const [profileId, setProfileId] = useState<string>('')
  const [initialName, setInitialName] = useState('')
  const [initialDisplayName, setInitialDisplayName] = useState('')
  const [initialEmails, setInitialEmails] = useState<string[]>([])

  const [radiusSecret, setRadiusSecret] = useState<string | null>(null)
  const [radiusMessage, setRadiusMessage] = useState<string | null>(null)
  const [radiusLoading, setRadiusLoading] = useState(false)

  const [credSession, setCredSession] = useState<CUSessionToken | null>(null)
  const [credStatus, setCredStatus] = useState<CUStatus | null>(null)
  const [credMessage, setCredMessage] = useState<string | null>(null)
  const [credLoading, setCredLoading] = useState(false)
  const [credSummary, setCredSummary] = useState<CredentialStatus | null>(null)
  const [credSummaryMessage, setCredSummaryMessage] = useState<string | null>(null)
  const loadRef = useRef(false)
  const [passkeyLabels, setPasskeyLabels] = useState<string[]>([])

  const { canEdit, permissions, requestReauth } = useAccess()

  const canEditName = canEdit && permissions.nameAllowed
  const canEditEmail = canEdit && permissions.emailAllowed
  const canEditSelfWrite = canEdit && permissions.selfWriteAllowed
  const hasAnyEditPermission = permissions.nameAllowed || permissions.emailAllowed

  useEffect(() => {
    if (loadRef.current) return
    loadRef.current = true

    const load = async () => {
      setLoading(true)
      setMessage(null)
      try {
        const nextProfile = user ? user : await fetchSelfProfile()
        setProfile({
          name: nextProfile.name,
          displayName: nextProfile.displayName,
          emails: nextProfile.emails,
        })
        setProfileId(nextProfile.uuid)
        setInitialEmails(nextProfile.emails)
        setInitialName(nextProfile.name)
        setInitialDisplayName(nextProfile.displayName)
        setPasskeyLabels([...nextProfile.passkeys, ...nextProfile.attestedPasskeys])

        try {
          const summary = await fetchCredentialStatus(nextProfile.uuid)
          setCredSummary(summary)
          setCredSummaryMessage(null)
        } catch (error) {
          setCredSummaryMessage(
            error instanceof Error ? error.message : t('profile.messageCredentialSummaryFailed'),
          )
        }
        try {
          const radius = await fetchRadiusSecret(nextProfile.uuid)
          setRadiusSecret(radius)
        } catch (error) {
          setRadiusMessage(
            error instanceof Error ? error.message : t('profile.messageRadiusLoadFailed'),
          )
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('profile.messageLoadProfileFailed'))
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const handleProfileChange = (field: keyof ProfileForm, value: string) => {
    if (!profile) return
    setProfile({
      ...profile,
      [field]: value,
    })
  }

  const handleEmailChange = (index: number, value: string) => {
    if (!profile) return
    const nextEmails = [...profile.emails]
    nextEmails[index] = value
    setProfile({
      ...profile,
      emails: nextEmails,
    })
  }

  const handleEmailAdd = () => {
    if (!profile) return
    setProfile({
      ...profile,
      emails: [...profile.emails, ''],
    })
  }

  const handleEmailRemove = (index: number) => {
    if (!profile) return
    const nextEmails = profile.emails.filter((_, idx) => idx !== index)
    setProfile({
      ...profile,
      emails: nextEmails,
    })
  }

  const requestReauthIfNeeded = () => {
    if (!canEdit) {
      requestReauth()
    }
  }

  const handleSessionExpiredAfterCommit = () => {
    sessionStorage.setItem(
      'kanidm.login_notice',
      t('login.notice.credentialsUpdated'),
    )
    clearAuthToken()
    navigate('/login', { replace: true })
  }

  const isAuthExpiredError = (error: unknown) => {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    return message.includes('401') || message.includes('sessionexpired')
  }

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)
    if (!profile || !profileId) return

    if (!canEdit) {
      requestReauth()
      return
    }

    const name = profile.name.trim()
    const displayName = profile.displayName.trim()
    if (!name || !displayName) {
      setMessage(t('profile.messageNameDisplayRequired'))
      return
    }

    const emails = normalizeEmails(profile.emails)
    const emailChanged = !emailsEqual(emails, normalizeEmails(initialEmails))
    const nameChanged = name !== initialName
    const displayNameChanged = displayName !== initialDisplayName

    try {
      await updatePersonProfile({
        id: profileId,
        name: permissions.nameAllowed && nameChanged ? name : undefined,
        displayName: permissions.nameAllowed && displayNameChanged ? displayName : undefined,
        emails: permissions.emailAllowed && emailChanged ? emails : undefined,
      })
      await setAuthenticated()
      setMessage(t('profile.messageProfileUpdated'))
      setInitialEmails(emails)
      setInitialName(name)
      setInitialDisplayName(displayName)
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : t('profile.messageProfileUpdateFailed')
      setMessage(messageText)
    }
  }

  const startCredentialSession = async () => {
    if (!profileId) return
    if (!canEditSelfWrite) {
      requestReauth()
      return
    }
    setCredLoading(true)
    setCredMessage(null)
    try {
      const { session, status } = await beginCredentialUpdate(profileId)
      setCredSession(session)
      setCredStatus(status)
    } catch (error) {
      setCredMessage(
        error instanceof Error ? error.message : t('profile.messageCredentialSessionFailed'),
      )
    } finally {
      setCredLoading(false)
    }
  }

  const commitCredentialChanges = async () => {
    if (!credSession) return
    setCredLoading(true)
    setCredMessage(null)
    try {
      await commitCredentialUpdate(credSession)
      setCredSession(null)
      setCredStatus(null)
      if (profileId) {
        try {
          const summary = await fetchCredentialStatus(profileId)
          setCredSummary(summary)
          const nextProfile = await fetchSelfProfile()
          setPasskeyLabels([...nextProfile.passkeys, ...nextProfile.attestedPasskeys])
          setCredMessage(t('profile.messageCredentialSaved'))
        } catch (error) {
          if (isAuthExpiredError(error)) {
            handleSessionExpiredAfterCommit()
            return
          }
          setCredMessage(
            error instanceof Error ? error.message : t('profile.messageCredentialLoadFailed'),
          )
        }
      } else {
        setCredMessage(t('profile.messageCredentialSaved'))
      }
    } catch (error) {
      setCredMessage(
        error instanceof Error ? error.message : t('profile.messageCredentialSaveFailed'),
      )
    } finally {
      setCredLoading(false)
    }
  }

  const cancelCredentialChanges = async () => {
    if (!credSession) return
    setCredLoading(true)
    setCredMessage(null)
    try {
      await cancelCredentialUpdate(credSession)
      setCredSession(null)
      setCredStatus(null)
      if (profileId) {
        const summary = await fetchCredentialStatus(profileId)
        setCredSummary(summary)
        const nextProfile = await fetchSelfProfile()
        setPasskeyLabels([...nextProfile.passkeys, ...nextProfile.attestedPasskeys])
      }
    } catch (error) {
      setCredMessage(
        error instanceof Error ? error.message : t('profile.messageCredentialDiscardFailed'),
      )
    } finally {
      setCredLoading(false)
    }
  }

  const regenerateRadius = async () => {
    if (!profileId) return
    if (!canEditSelfWrite) {
      requestReauth()
      return
    }
    setRadiusLoading(true)
    setRadiusMessage(null)
    try {
      const secret = await regenerateRadiusSecret(profileId)
      setRadiusSecret(secret)
    } catch (error) {
      setRadiusMessage(
        error instanceof Error ? error.message : t('profile.messageRadiusRegenerateFailed'),
      )
    } finally {
      setRadiusLoading(false)
    }
  }

  const clearRadius = async () => {
    if (!profileId) return
    if (!canEditSelfWrite) {
      requestReauth()
      return
    }
    setRadiusLoading(true)
    setRadiusMessage(null)
    try {
      await deleteRadiusSecret(profileId)
      setRadiusSecret(null)
    } catch (error) {
      setRadiusMessage(
        error instanceof Error ? error.message : t('profile.messageRadiusDeleteFailed'),
      )
    } finally {
      setRadiusLoading(false)
    }
  }


  if (loading) {
    return (
      <section className="page profile-page">
        <h1>{t('profile.title')}</h1>
        <p className="page-note">{t('profile.loading')}</p>
      </section>
    )
  }

  return (
    <section className="page profile-page">
      <div className="profile-header">
        <div>
          <h1>{t('profile.title')}</h1>
          <p className="page-note">{t('profile.subtitle')}</p>
        </div>
        <div className="profile-status">
        </div>
      </div>

      {message && <p className="feedback">{message}</p>}

      <div className="profile-grid">
        <section className="profile-card">
          <header>
            <h2>{t('profile.personalTitle')}</h2>
            <p>{t('profile.personalDesc')}</p>
          </header>
          {profile && (
            <form onSubmit={handleProfileSave}>
              <label className="field">
                <span>{t('profile.username')}</span>
                <input
                  value={profile.name}
                  onChange={(event) => handleProfileChange('name', event.target.value)}
                  disabled={!permissions.nameAllowed}
                  readOnly={!canEditName && permissions.nameAllowed}
                  onFocus={requestReauthIfNeeded}
                  onClick={requestReauthIfNeeded}
                />
              </label>
              <label className="field">
                <span>{t('profile.displayName')}</span>
                <input
                  value={profile.displayName}
                  onChange={(event) =>
                    handleProfileChange('displayName', event.target.value)
                  }
                  disabled={!permissions.nameAllowed}
                  readOnly={!canEditName && permissions.nameAllowed}
                  onFocus={requestReauthIfNeeded}
                  onClick={requestReauthIfNeeded}
                />
              </label>
              {!permissions.nameAllowed && (
                <p className="muted-text">
                  {t('profile.namePermission')}
                </p>
              )}

              <div className="profile-emails">
                <div className="profile-emails-header">
                  <span>{t('profile.emailsTitle')}</span>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => {
                      if (!canEditEmail && permissions.emailAllowed) {
                        requestReauthIfNeeded()
                        return
                      }
                      handleEmailAdd()
                    }}
                    disabled={!permissions.emailAllowed}
                  >
                    {t('profile.addEmail')}
                  </button>
                </div>
                {!permissions.emailAllowed && (
                  <p className="muted-text">
                    {t('profile.emailPermission')}
                  </p>
                )}
                {profile.emails.length === 0 ? (
                  <p className="muted-text">{t('profile.noEmail')}</p>
                ) : (
                  profile.emails.map((email, index) => (
                    <div key={`${email}-${index}`} className="profile-email-row">
                      <input
                        value={email}
                        onChange={(event) => handleEmailChange(index, event.target.value)}
                        placeholder={t('profile.emailPlaceholder')}
                        disabled={!permissions.emailAllowed}
                        readOnly={!canEditEmail && permissions.emailAllowed}
                        onFocus={requestReauthIfNeeded}
                        onClick={requestReauthIfNeeded}
                      />
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => {
                          if (!canEditEmail && permissions.emailAllowed) {
                            requestReauthIfNeeded()
                            return
                          }
                          handleEmailRemove(index)
                        }}
                        disabled={!permissions.emailAllowed}
                      >
                        {t('profile.removeEmail')}
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="profile-actions">
                <button type="submit" disabled={!hasAnyEditPermission}>
                  {t('profile.saveChanges')}
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="profile-card">
          <header>
            <h2>{t('profile.credentialsTitle')}</h2>
            <p>{t('profile.credentialsDesc')}</p>
          </header>

          {!credSession && (
            <div className="credential-summary">
              <div>
                <span className="muted-text">{t('profile.summaryPasskeys')}</span>
                <strong>{summarizePasskeys(passkeyLabels, t)}</strong>
              </div>
              <div>
                <span className="muted-text">{t('profile.summaryPassword')}</span>
                <strong>{summarizePassword(credSummary, t)}</strong>
              </div>
              <div>
                <span className="muted-text">{t('profile.summaryTotp')}</span>
                <strong>{summarizeTotp(credSummary, t)}</strong>
              </div>
            </div>
          )}

          {credSummaryMessage && <p className="feedback">{credSummaryMessage}</p>}

          {!credSession && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                void startCredentialSession()
              }}
              disabled={credLoading || !permissions.selfWriteAllowed}
            >
              {t('profile.updateCredentials')}
            </button>
          )}

          {credMessage && <p className="feedback">{credMessage}</p>}

          {credSession && credStatus && (
            <div className="credential-panel">
              <CredentialSections
                session={credSession!}
                status={credStatus}
                loading={credLoading}
                onLoadingChange={setCredLoading}
                onStatusChange={setCredStatus}
                onMessage={setCredMessage}
                context="profile"
                leadMessage={t('profile.editingAlert')}
                warningsTitle={t('profile.warningsTitle')}
                tipMessage={t('profile.tipPasskey')}
                cannotSaveMessage={t('profile.cannotSave')}
              />

              <div className="credential-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    void cancelCredentialChanges()
                  }}
                  disabled={credLoading}
                >
                  {t('profile.discard')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void commitCredentialChanges()
                  }}
                  disabled={credLoading || !credStatus.can_commit}
                >
                  {t('profile.saveCredentialChanges')}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="profile-card">
          <header>
            <h2>{t('profile.radiusTitle')}</h2>
            <p>{t('profile.radiusDesc')}</p>
          </header>

          {radiusMessage && <p className="feedback">{radiusMessage}</p>}

          <div className="radius-panel">
            <div>
              <span className="muted-text">{t('profile.radiusCurrent')}</span>
              <div className="radius-secret">
                {radiusSecret ?? t('profile.radiusNoSecret')}
              </div>
            </div>
            <div className="radius-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  void regenerateRadius()
                }}
                disabled={radiusLoading || !permissions.selfWriteAllowed}
              >
                {radiusSecret ? t('profile.radiusRegenerate') : t('profile.radiusGenerate')}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  void clearRadius()
                }}
                disabled={radiusLoading || !radiusSecret || !permissions.selfWriteAllowed}
              >
                {t('profile.radiusRemove')}
              </button>
            </div>
          </div>
        </section>
      </div>

    </section>
  )
}
