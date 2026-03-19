import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { oauth2Authorise } from '../api/oauth2Flow'
import { useAuth } from '../auth/AuthContext'
import {
  clearOauth2PendingRequest,
  clearOauth2ConsentState,
  clearOauth2ResumeAttempted,
  saveOauth2ConsentState,
  saveOauth2PendingRequest,
} from '../auth/oauth2FlowState'

export default function Oauth2Authorise() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const run = async () => {
      clearOauth2ResumeAttempted()
      clearOauth2ConsentState()
      saveOauth2PendingRequest(`${location.pathname}${location.search}`)

      const result = await oauth2Authorise(new URLSearchParams(location.search))
      if (!active) return

      if (result.state === 'auth_required') {
        navigate('/login', { replace: true })
        return
      }
      if (result.state === 'redirect') {
        clearOauth2PendingRequest()
        clearOauth2ConsentState()
        clearOauth2ResumeAttempted()
        window.location.assign(result.redirectUri)
        return
      }
      if (result.state === 'consent') {
        saveOauth2ConsentState(result.consent)
        navigate('/oauth2/consent', { replace: true })
        return
      }
      if (result.state === 'access_denied') {
        setMessage(t('oauth2Flow.errors.accessDenied'))
        return
      }
      setMessage(result.message || t('oauth2Flow.errors.invalidRequest'))
    }

    void run().catch((error) => {
      if (!active) return
      setMessage(error instanceof Error ? error.message : t('oauth2Flow.errors.invalidRequest'))
    })

    return () => {
      active = false
    }
  }, [location.pathname, location.search, navigate, t])

  return (
    <section className="centered-page">
      <div className="centered-card">
        <h1>{t('oauth2Flow.authorise.title')}</h1>
        <p className="muted-text">
          {user
            ? t('oauth2Flow.user.signedInAs', { displayName: user.displayName, name: user.name })
            : t('oauth2Flow.user.notSignedIn')}
        </p>
        {message ? (
          <p className="inline-feedback">{message}</p>
        ) : (
          <p className="muted-text">{t('oauth2Flow.authorise.loading')}</p>
        )}
      </div>
    </section>
  )
}
