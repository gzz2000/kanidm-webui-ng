import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { oauth2AuthorisePermit, oauth2AuthoriseReject } from '../api/oauth2Flow'
import { useAuth } from '../auth/AuthContext'
import { useSiteInfo } from '../site/SiteInfoContext'
import {
  clearOauth2ConsentState,
  clearOauth2PendingRequest,
  clearOauth2ResumeAttempted,
  loadOauth2ConsentState,
} from '../auth/oauth2FlowState'

export default function Oauth2Consent() {
  const { t } = useTranslation()
  const { user, signOut } = useAuth()
  const { displayName, imageUrl } = useSiteInfo()
  const navigate = useNavigate()
  const consent = loadOauth2ConsentState()
  const [loading, setLoading] = useState(false)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const toConsentErrorMessage = (error: unknown) => {
    if (!(error instanceof Error)) {
      return t('oauth2Flow.errors.invalidRequest')
    }
    const text = error.message.trim()
    if (text === 'Request failed (500):' || text.includes('Request failed (500): ""')) {
      return t('oauth2Flow.errors.consentExpired')
    }
    return text || t('oauth2Flow.errors.invalidRequest')
  }

  const handleAction = async (action: 'allow' | 'deny') => {
    if (!consent) return
    setLoading(true)
    setMessage(null)
    try {
      const redirectUri =
        action === 'allow'
          ? await oauth2AuthorisePermit(consent.consentToken)
          : await oauth2AuthoriseReject(consent.consentToken)
      clearOauth2ConsentState()
      clearOauth2PendingRequest()
      clearOauth2ResumeAttempted()
      if (redirectUri) {
        window.location.assign(redirectUri)
        return
      }
      setMessage(t('oauth2Flow.errors.invalidRequest'))
    } catch (error) {
      setMessage(toConsentErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  const handleUseAnotherAccount = async () => {
    if (!user || switchingAccount) return
    setSwitchingAccount(true)
    setMessage(null)
    try {
      clearOauth2ConsentState()
      clearOauth2ResumeAttempted()
      await signOut()
      navigate('/login', { replace: true })
    } catch (error) {
      setMessage(toConsentErrorMessage(error))
    } finally {
      setSwitchingAccount(false)
    }
  }

  const signedInBlock = user ? (
    <>
      <p className="page-note">
        {t('oauth2Flow.user.signedInAs', { displayName: user.displayName, name: user.name })}
      </p>
      <button
        type="button"
        className="link-button oauth2-switch-account"
        onClick={() => void handleUseAnotherAccount()}
        disabled={switchingAccount}
      >
        {switchingAccount
          ? t('oauth2Flow.actions.processing')
          : t('oauth2Flow.actions.useAnotherAccount')}
      </button>
    </>
  ) : (
    <p className="page-note">{t('oauth2Flow.user.notSignedIn')}</p>
  )

  if (!consent) {
    return (
      <section className="centered-page">
        <div className="centered-card">
          <h1>{t('oauth2Flow.consent.title')}</h1>
          {signedInBlock}
          <p className="inline-feedback">{t('oauth2Flow.errors.missingConsent')}</p>
          <div className="panel-actions">
            <button className="ghost-button" type="button" onClick={() => navigate('/login')}>
              {t('oauth2Flow.actions.backToLogin')}
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="centered-page">
      <div className="centered-card">
        <div className="oauth2-header">
          <div>
            {imageUrl && (
              <div className="centered-brand-image-wrap">
                <img src={imageUrl} alt={displayName} className="centered-brand-image" />
              </div>
            )}
            <h1>
              {t('oauth2Flow.consent.titleWithClientAndDomain', {
                client: consent.clientName,
                domain: displayName,
              })}
            </h1>
            {signedInBlock}
            <p className="page-note">{t('oauth2Flow.consent.subtitle', { client: consent.clientName })}</p>
          </div>
        </div>

        <div className="oauth2-consent-card">
          <section className="oauth2-consent-section">
            <header>
              <h2>{t('oauth2Flow.consent.requestedScopes')}</h2>
            </header>
            {consent.scopes.length === 0 ? (
              <p className="muted-text">{t('oauth2Flow.consent.noScopes')}</p>
            ) : (
              <div className="oauth2-tags">
                {consent.scopes.map((scope) => (
                  <span key={scope} className="badge badge-sharp badge-neutral">
                    {scope}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="oauth2-consent-section">
            <header>
              <h2>{t('oauth2Flow.consent.piiScopes')}</h2>
            </header>
            {consent.piiScopes.length === 0 ? (
              <p className="muted-text">{t('oauth2Flow.consent.noPiiScopes')}</p>
            ) : (
              <div className="oauth2-tags">
                {consent.piiScopes.map((scope) => (
                  <span key={scope} className="badge badge-sharp badge-warn">
                    {scope}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>

        {message && <p className="inline-feedback">{message}</p>}

        <div className="panel-actions oauth2-consent-actions">
          <button
            className="primary-button oauth2-consent-button"
            type="button"
            onClick={() => void handleAction('allow')}
            disabled={loading}
          >
            {loading ? t('oauth2Flow.actions.processing') : t('oauth2Flow.actions.allow')}
          </button>
          <button
            className="ghost-button oauth2-consent-button"
            type="button"
            onClick={() => void handleAction('deny')}
            disabled={loading}
          >
            {t('oauth2Flow.actions.deny')}
          </button>
        </div>
      </div>
    </section>
  )
}
