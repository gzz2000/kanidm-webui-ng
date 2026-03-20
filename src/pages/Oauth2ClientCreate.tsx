import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { addOauth2Redirect, createOauth2Client } from '../api'
import { useAccess } from '../auth/AccessContext'
import { isOauth2Admin } from '../utils/groupAccess'

export default function Oauth2ClientCreate() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { canEdit, requestReauth, memberOf } = useAccess()
  const isAdmin = isOauth2Admin(memberOf)
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [landingUrl, setLandingUrl] = useState('')
  const [redirectUrl, setRedirectUrl] = useState('')
  const [type, setType] = useState<'basic' | 'public'>('basic')
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const requestReauthIfNeeded = () => {
    if (!canEdit && isAdmin) {
      requestReauth()
      return true
    }
    return false
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!isAdmin) return
    if (requestReauthIfNeeded()) return
    if (!name.trim()) {
      setMessage(t('oauth2.create.messages.nameRequired'))
      return
    }
    if (!displayName.trim()) {
      setMessage(t('oauth2.create.messages.displayNameRequired'))
      return
    }
    if (!landingUrl.trim()) {
      setMessage(t('oauth2.create.messages.landingRequired'))
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const trimmedName = name.trim()
      const trimmedDisplayName = displayName.trim()
      const trimmedLandingUrl = landingUrl.trim()
      const trimmedRedirectUrl = redirectUrl.trim()

      await createOauth2Client({
        name: trimmedName,
        displayName: trimmedDisplayName,
        landingUrl: trimmedLandingUrl,
        type,
      })

      if (trimmedRedirectUrl) {
        await addOauth2Redirect(trimmedName, trimmedRedirectUrl)
      }

      navigate(`/admin/oauth2/${encodeURIComponent(trimmedName)}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('oauth2.create.messages.failed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page oauth2-page">
      <div className="oauth2-header">
        <div>
          <h1>{t('oauth2.create.title')}</h1>
          <p className="page-note">{t('oauth2.create.subtitle')}</p>
        </div>
      </div>

      <div className="card-grid">
        <div className="panel-card">
          <header>
            <h2>{t('oauth2.create.identityTitle')}</h2>
            <p>{t('oauth2.create.identityDesc')}</p>
          </header>

          {!isAdmin && (
            <p className="muted-text">
              {t('oauth2.create.permissionDenied')}
            </p>
          )}

          <form onSubmit={handleSubmit}>
            <label className="field">
              <span>{t('oauth2.create.clientName')}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onFocus={requestReauthIfNeeded}
                disabled={!isAdmin}
                placeholder={t('oauth2.create.clientNamePlaceholder')}
              />
            </label>
            <label className="field">
              <span>{t('oauth2.create.displayName')}</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                onFocus={requestReauthIfNeeded}
                disabled={!isAdmin}
                placeholder={t('oauth2.create.displayNamePlaceholder')}
              />
            </label>
            <label className="field">
              <span>{t('oauth2.create.landingUrl')}</span>
              <input
                type="url"
                value={landingUrl}
                onChange={(event) => setLandingUrl(event.target.value)}
                onFocus={requestReauthIfNeeded}
                disabled={!isAdmin}
                placeholder={t('oauth2.create.landingPlaceholder')}
              />
            </label>
            <label className="field">
              <span>{t('oauth2.create.redirectUrlOptional')}</span>
              <input
                type="url"
                value={redirectUrl}
                onChange={(event) => setRedirectUrl(event.target.value)}
                onFocus={requestReauthIfNeeded}
                disabled={!isAdmin}
                placeholder={t('oauth2.create.redirectPlaceholder')}
              />
            </label>
            <label className="field">
              <span>{t('oauth2.create.clientType')}</span>
              <div className="radio-group">
                <label className="radio">
                  <input
                    type="radio"
                    checked={type === 'basic'}
                    onChange={() => setType('basic')}
                    disabled={!isAdmin}
                  />
                  {t('oauth2.create.typeBasic')}
                </label>
                <label className="radio">
                  <input
                    type="radio"
                    checked={type === 'public'}
                    onChange={() => setType('public')}
                    disabled={!isAdmin}
                  />
                  {t('oauth2.create.typePublic')}
                </label>
              </div>
            </label>

            {message && <p className="inline-feedback">{message}</p>}

            <div className="panel-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={!isAdmin || saving}
              >
                {saving ? t('oauth2.create.creating') : t('oauth2.create.submit')}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => navigate('/admin/oauth2')}
              >
                {t('oauth2.actions.cancel')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}
