import type { FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { sendCredentialUpdate } from '../api'
import type { components } from '../api/schema'
import { performPasskeyCreation } from '../auth/webauthn'
import { buildTotpPayload } from '../utils/totp'
import { formatPasswordQualityError } from '../utils/passwordQuality'

type CUStatus = components['schemas']['CUStatus']
type CUSessionToken = components['schemas']['CUSessionToken']
type CURegState = components['schemas']['CURegState']
type CURegWarning = components['schemas']['CURegWarning']
type CredentialDetail = components['schemas']['CredentialDetail']
type TotpSecret = components['schemas']['TotpSecret']

type Props = {
  session: CUSessionToken
  status: CUStatus
  loading: boolean
  onLoadingChange: (loading: boolean) => void
  onStatusChange: (status: CUStatus) => void
  onMessage: (message: string | null) => void
  context: 'profile' | 'reset'
  leadMessage?: string
  warningsTitle: string
  tipMessage: string
  cannotSaveMessage: string
}

function extractPasskeyChallenge(state: CURegState): Record<string, unknown> | null {
  if (state && typeof state === 'object' && 'Passkey' in state) {
    return state.Passkey as Record<string, unknown>
  }
  return null
}

function extractTotpSecret(state: CURegState): TotpSecret | null {
  if (state && typeof state === 'object' && 'TotpCheck' in state) {
    return state.TotpCheck as TotpSecret
  }
  return null
}

function describeWarning(warning: CURegWarning, t: (key: string) => string) {
  if (typeof warning === 'string') {
    switch (warning) {
      case 'MfaRequired':
        return t('warnings.mfaRequired')
      case 'PasskeyRequired':
        return t('warnings.passkeyRequired')
      case 'AttestedPasskeyRequired':
        return t('warnings.attestedPasskeyRequired')
      case 'AttestedResidentKeyRequired':
        return t('warnings.attestedResidentKeyRequired')
      case 'WebauthnAttestationUnsatisfiable':
        return t('warnings.webauthnAttestationUnsatisfiable')
      case 'WebauthnUserVerificationRequired':
        return t('warnings.webauthnUserVerificationRequired')
      case 'Unsatisfiable':
        return t('warnings.unsatisfiable')
      case 'NoValidCredentials':
        return t('warnings.noValidCredentials')
      default:
        return warning
    }
  }
  return String(warning)
}

function hasPasswordCredential(cred: CredentialDetail | null | undefined) {
  if (!cred) return false
  if (cred.type_ === 'Password' || cred.type_ === 'GeneratedPassword') {
    return true
  }
  if (typeof cred.type_ === 'object' && cred.type_ && 'PasswordMfa' in cred.type_) {
    return true
  }
  return false
}

export default function CredentialSections({
  session,
  status,
  loading,
  onLoadingChange,
  onStatusChange,
  onMessage,
  context,
  leadMessage,
  warningsTitle,
  tipMessage,
  cannotSaveMessage,
}: Props) {
  const { t } = useTranslation()
  const messagePrefix = context === 'reset' ? 'reset' : 'profile'
  const msg = (key: string, args?: Record<string, unknown>) =>
    t(`${messagePrefix}.${key}`, args)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passkeyLabel, setPasskeyLabel] = useState('')
  const [passkeyLabelOpen, setPasskeyLabelOpen] = useState(false)
  const [pendingPasskey, setPendingPasskey] = useState<Record<string, unknown> | null>(null)
  const [totpPayload, setTotpPayload] = useState<ReturnType<typeof buildTotpPayload> | null>(
    null,
  )
  const [totpQr, setTotpQr] = useState<string | null>(null)
  const [totpLabel, setTotpLabel] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpError, setTotpError] = useState<string | null>(null)
  const [totpModalOpen, setTotpModalOpen] = useState(false)
  const [totpSha1Warning, setTotpSha1Warning] = useState(false)
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)
  const [totpCancelled, setTotpCancelled] = useState(false)
  const [copyTip, setCopyTip] = useState(false)
  const copyTimeout = useRef<number | null>(null)

  const showTotpPrompt = status.warnings.includes('MfaRequired')
  const warningMessages = useMemo(
    () => status.warnings.map((warning) => describeWarning(warning, t)),
    [status.warnings, t],
  )
  const passwordConfigured = useMemo(
    () => hasPasswordCredential(status.primary),
    [status.primary],
  )
  const passwordResetAvailable = passwordConfigured || Boolean(passwordNotice)
  const passwordButtonLabel = passwordResetAvailable
    ? t('profile.passwordReset')
    : t('profile.passwordSet')
  const passwordHelper = t('profile.passwordHelper')
  const effectivePasswordNotice =
    passwordNotice ?? (passwordConfigured ? t('profile.passwordSetNotice') : null)

  useEffect(() => {
    const buildQr = async () => {
      if (!totpPayload?.uri) {
        setTotpQr(null)
        return
      }
      try {
        const dataUrl = await QRCode.toDataURL(totpPayload.uri, {
          width: 280,
          margin: 1,
        })
        setTotpQr(dataUrl)
      } catch {
        setTotpQr(null)
      }
    }
    void buildQr()
  }, [totpPayload?.uri])

  const totpLabels = (() => {
    const detail = status.primary?.type_
    if (detail && typeof detail === 'object' && 'PasswordMfa' in detail) {
      const labels = Array.isArray(detail.PasswordMfa) ? detail.PasswordMfa[0] : []
      return Array.isArray(labels) ? labels : []
    }
    return []
  })()
  const totpSummary =
    totpLabels.length > 0
      ? t('profile.summarySetWithTags', { count: totpLabels.length, tags: totpLabels.join(', ') })
      : t('profile.summaryNotSet')

  const beginPasskeyEnrollment = async () => {
    onLoadingChange(true)
    onMessage(null)
    try {
      const initStatus = await sendCredentialUpdate(session, 'passkeyinit')
      const challenge = extractPasskeyChallenge(initStatus.mfaregstate)
      if (!challenge) {
        throw new Error(msg('messagePasskeyChallengeMissing'))
      }
      const registration = await performPasskeyCreation(challenge)
      setPendingPasskey(registration)
      setPasskeyLabel('')
      setPasskeyLabelOpen(true)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : msg('messagePasskeyEnrollFailed'))
    } finally {
      onLoadingChange(false)
    }
  }

  const submitPasskeyLabel = async () => {
    if (!pendingPasskey) return
    if (!passkeyLabel.trim()) {
      onMessage(msg('messagePasskeyLabelRequired'))
      return
    }
    onLoadingChange(true)
    onMessage(null)
    try {
      const nextStatus = await sendCredentialUpdate(session, {
        passkeyfinish: [passkeyLabel.trim(), pendingPasskey],
      })
      onStatusChange(nextStatus)
      setPasskeyLabel('')
      setPendingPasskey(null)
      setPasskeyLabelOpen(false)
      onMessage(msg('messagePasskeyEnrolled'))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : msg('messagePasskeyEnrollFailed'))
    } finally {
      onLoadingChange(false)
    }
  }

  const removePasskey = async (uuid: string) => {
    onLoadingChange(true)
    onMessage(null)
    try {
      const nextStatus = await sendCredentialUpdate(session, {
        passkeyremove: uuid,
      })
      onStatusChange(nextStatus)
    } catch (error) {
      onMessage(error instanceof Error ? error.message : msg('messagePasskeyRemoveFailed'))
    } finally {
      onLoadingChange(false)
    }
  }

  const submitPasswordChange = async (event: FormEvent) => {
    event.preventDefault()
    if (!password || password !== passwordConfirm) {
      onMessage(msg('messagePasswordMismatch'))
      return
    }
    onLoadingChange(true)
    onMessage(null)
    setTotpCancelled(false)
    try {
      const nextStatus = await sendCredentialUpdate(session, { password })
      onStatusChange(nextStatus)
      setPassword('')
      setPasswordConfirm('')
      setShowPasswordForm(false)
      setPasswordNotice(msg('messagePasswordSetNotice'))
      onMessage(msg('messagePasswordStaged'))
      if (nextStatus.warnings.includes('MfaRequired')) {
        await beginTotpEnrollment()
      }
    } catch (error) {
      if (error instanceof Error) {
        const qualityMessage = formatPasswordQualityError(error, t)
        onMessage(qualityMessage ?? error.message)
      } else {
        onMessage(msg('messagePasswordUpdateFailed'))
      }
    } finally {
      onLoadingChange(false)
    }
  }

  const beginTotpEnrollment = async () => {
    setTotpError(null)
    setTotpSha1Warning(false)
    setTotpLabel('')
    setTotpCode('')
    setTotpModalOpen(true)
    setTotpCancelled(false)
    if (!totpPayload) {
      setTotpError(msg('messageTotpLoading'))
    }
    onLoadingChange(true)
    try {
      const nextStatus = await sendCredentialUpdate(session, 'totpgenerate')
      const secret = extractTotpSecret(nextStatus.mfaregstate)
      if (!secret) {
        throw new Error(msg('messageTotpSetupMissing'))
      }
      setTotpPayload(buildTotpPayload(secret))
      setTotpError(null)
      onStatusChange(nextStatus)
    } catch (error) {
      setTotpError(error instanceof Error ? error.message : msg('messageTotpStartFailed'))
    } finally {
      onLoadingChange(false)
    }
  }

  const submitTotpEnrollment = async (acceptSha1 = false) => {
    if (!totpPayload) return
    if (!acceptSha1) {
      if (!totpLabel.trim() || !totpCode.trim()) {
        setTotpError(msg('messageTotpNameCodeRequired'))
        return
      }
    }
    onLoadingChange(true)
    setTotpError(null)
    try {
      const nextStatus = acceptSha1
        ? await sendCredentialUpdate(session, 'totpacceptsha1')
        : await sendCredentialUpdate(session, {
            totpverify: [Number(totpCode), totpLabel.trim()],
          })
      if (nextStatus.mfaregstate === 'TotpInvalidSha1') {
        setTotpSha1Warning(true)
        setTotpError(msg('messageTotpSha1'))
      } else if (nextStatus.mfaregstate === 'TotpTryAgain') {
        setTotpError(msg('messageTotpTryAgain'))
      } else if (
        nextStatus.mfaregstate &&
        typeof nextStatus.mfaregstate === 'object' &&
        'TotpNameTryAgain' in nextStatus.mfaregstate
      ) {
        setTotpError(
          msg('messageTotpNameInvalid', {
            name: nextStatus.mfaregstate.TotpNameTryAgain,
          }),
        )
      } else {
        setTotpModalOpen(false)
        setTotpPayload(null)
        setTotpQr(null)
        setTotpLabel('')
        setTotpCode('')
        setTotpSha1Warning(false)
        setTotpCancelled(false)
      }
      onStatusChange(nextStatus)
    } catch (error) {
      setTotpError(error instanceof Error ? error.message : msg('messageTotpAddFailed'))
    } finally {
      onLoadingChange(false)
    }
  }

  const cancelTotpEnrollment = async () => {
    onLoadingChange(true)
    setTotpError(null)
    try {
      const nextStatus = await sendCredentialUpdate(session, 'cancelmfareg')
      onStatusChange(nextStatus)
      setTotpModalOpen(false)
      setTotpPayload(null)
      setTotpQr(null)
      setTotpLabel('')
      setTotpCode('')
      setTotpSha1Warning(false)
      setTotpCancelled(true)
    } catch (error) {
      setTotpError(error instanceof Error ? error.message : msg('messageTotpCancelFailed'))
    } finally {
      onLoadingChange(false)
    }
  }

  const removePrimaryCredential = async () => {
    onLoadingChange(true)
    onMessage(null)
    try {
      const nextStatus = await sendCredentialUpdate(session, 'primaryremove')
      onStatusChange(nextStatus)
      setPasswordNotice(null)
      setShowPasswordForm(false)
      setTotpCancelled(false)
      onMessage(msg('messagePasswordRemoved'))
    } catch (error) {
      onMessage(error instanceof Error ? error.message : msg('messagePasswordRemoveFailed'))
    } finally {
      onLoadingChange(false)
    }
  }

  const handleCopy = async () => {
    if (totpPayload) {
      await navigator.clipboard?.writeText(totpPayload.uri)
    }
    setCopyTip(true)
    if (copyTimeout.current !== null) {
      window.clearTimeout(copyTimeout.current)
    }
    copyTimeout.current = window.setTimeout(() => {
      setCopyTip(false)
    }, 2000)
  }

  return (
    <>
      <div className="credential-alert">
        {leadMessage && <span>{leadMessage}</span>}
        {warningMessages.length > 0 && (
          <div>
            <span className="warning-text">{warningsTitle}</span>
            <ul className="warning-list">
              {warningMessages.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
        {status.passkeys.length === 0 && <span className="muted-text">{tipMessage}</span>}
        {!status.can_commit && <span className="warning-text">{cannotSaveMessage}</span>}
      </div>

      <div className="credential-section">
        <div className="section-header">
          <div>
            <h3>{t('credentials.passkeyTitle')}</h3>
            <p className="muted-text">{t('credentials.passkeyDesc')}</p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              void beginPasskeyEnrollment()
            }}
            disabled={loading}
          >
            {t('credentials.enrollPasskey')}
          </button>
        </div>
        {status.passkeys.length > 0 ? (
          <ul className="passkey-list">
            {status.passkeys.map((passkey) => (
              <li key={passkey.uuid}>
                <div>
                  <span className="passkey-tag">{passkey.tag}</span>
                  <span className="muted-text">{passkey.uuid}</span>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    void removePasskey(passkey.uuid)
                  }}
                  disabled={loading}
                >
                  {t('credentials.remove')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-text">{t('credentials.noPasskeys')}</p>
        )}
      </div>

      <div className="credential-section">
        <div className="section-header">
          <div>
            <h3>{t('credentials.passwordTitle')}</h3>
            <p className="muted-text">{passwordHelper}</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowPasswordForm((prev) => !prev)}
            disabled={loading}
          >
            {showPasswordForm ? t('profile.hideForm') : passwordButtonLabel}
          </button>
        </div>
        <div className="credential-status-row">
          <span className="muted-text">{t('credentials.totpStatus')}</span>
          <span>{totpSummary}</span>
        </div>
        {effectivePasswordNotice && <p className="muted-text">{effectivePasswordNotice}</p>}
        {totpCancelled && (
          <div className="inline-actions">
            <span className="muted-text">{t('credentials.totpCancelled')}</span>
            <button
              className="link-button"
              type="button"
              onClick={() => {
                void beginTotpEnrollment()
              }}
              disabled={loading}
            >
              {t('credentials.retryTotp')}
            </button>
            <button
              className="link-button"
              type="button"
              onClick={() => {
                void removePrimaryCredential()
              }}
              disabled={loading}
            >
              {t('credentials.removePassword')}
            </button>
          </div>
        )}
        {!totpCancelled && passwordConfigured && (
          <div className="inline-actions">
            <button
              className="link-button"
              type="button"
              onClick={() => {
                void removePrimaryCredential()
              }}
              disabled={loading}
            >
              {t('credentials.removePassword')}
            </button>
          </div>
        )}
        {showPasswordForm && (
          <form onSubmit={submitPasswordChange} className="stacked-form">
            <label className="field">
              <span>{t('credentials.newPassword')}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t('credentials.confirmPassword')}</span>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
              />
            </label>
            <button className="primary-button" type="submit" disabled={loading}>
              {t('credentials.stagePasswordUpdate')}
            </button>
            {showTotpPrompt && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  void beginTotpEnrollment()
                }}
                disabled={loading}
              >
                {t('credentials.enrollTotp')}
              </button>
            )}
          </form>
        )}
      </div>

      {passkeyLabelOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <header>
              <h3>{t('credentials.passkeyModalTitle')}</h3>
              <p>{t('credentials.passkeyModalDesc')}</p>
            </header>
            <label className="field">
              <span>{t('credentials.passkeyLabel')}</span>
              <input
                value={passkeyLabel}
                onChange={(event) => setPasskeyLabel(event.target.value)}
                placeholder={t('credentials.passkeyLabelPlaceholder')}
              />
            </label>
            <div className="modal-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setPasskeyLabelOpen(false)
                  setPendingPasskey(null)
                  setPasskeyLabel('')
                }}
              >
                {t('credentials.passkeyCancel')}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => void submitPasskeyLabel()}
                disabled={loading}
              >
                {t('credentials.passkeySave')}
              </button>
            </div>
          </div>
        </div>
      )}

      {totpModalOpen && (
        <div className="modal-backdrop">
          <div className="modal totp-modal">
            <header>
              <h3>{t('credentials.totpModalTitle')}</h3>
              <p>{t('credentials.totpModalDesc')}</p>
            </header>
            {totpPayload && (
              <div className="totp-grid">
                <div className="totp-qr">
                  {totpQr ? (
                    <img src={totpQr} alt={t('credentials.totpQrAlt')} />
                  ) : (
                    <div className="muted-text">{t('credentials.totpQrUnavailable')}</div>
                  )}
                </div>
                <div className="totp-details">
                  <div className="totp-detail">
                    <span>{t('credentials.totpUri')}</span>
                    <code>{totpPayload.uri}</code>
                  </div>
                  <div className="copy-row">
                    <button className="ghost-button" type="button" onClick={handleCopy}>
                      {t('credentials.copyUri')}
                    </button>
                    {copyTip && <span className="copy-tip">{t('credentials.copied')}</span>}
                  </div>
                </div>
              </div>
            )}
            {totpError && <p className="feedback">{totpError}</p>}
            <form
              className="stacked-form"
              onSubmit={(event) => {
                event.preventDefault()
                void submitTotpEnrollment()
              }}
            >
              <label className="field">
                <span>{t('credentials.totpLabel')}</span>
                <input
                  value={totpLabel}
                  onChange={(event) => setTotpLabel(event.target.value)}
                  placeholder={t('credentials.totpLabelPlaceholder')}
                />
              </label>
              <label className="field">
                <span>{t('credentials.totpCode')}</span>
                <input
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  inputMode="numeric"
                  placeholder={t('credentials.totpCodePlaceholder')}
                />
              </label>
              <div className="modal-actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void cancelTotpEnrollment()}
                >
                  {t('credentials.totpCancel')}
                </button>
                {totpSha1Warning && (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void submitTotpEnrollment(true)}
                    disabled={loading}
                  >
                    {t('credentials.totpAcceptSha1')}
                  </button>
                )}
                <button className="primary-button" type="submit" disabled={loading}>
                  {t('credentials.totpAdd')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
