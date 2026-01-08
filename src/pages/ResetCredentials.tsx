import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  cancelCredentialUpdate,
  commitCredentialUpdate,
  exchangeCredentialIntent,
  refreshCredentialStatus,
} from '../api'
import type { components } from '../api/schema'
import CredentialSections from '../components/CredentialSections'

type CUStatus = components['schemas']['CUStatus']
type CUSessionToken = components['schemas']['CUSessionToken']

type ResetState = {
  session: CUSessionToken
  status: CUStatus
}

const RESET_SESSION_KEY = 'kanidm.reset.session'

function storeResetSession(payload: ResetState) {
  sessionStorage.setItem(RESET_SESSION_KEY, JSON.stringify(payload.session))
}

function clearResetSession() {
  sessionStorage.removeItem(RESET_SESSION_KEY)
}

function readResetSession(): CUSessionToken | null {
  const raw = sessionStorage.getItem(RESET_SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CUSessionToken
  } catch {
    return null
  }
}

export default function ResetCredentials() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tokenParam = searchParams.get('token') ?? ''

  const [token, setToken] = useState(tokenParam)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<CUSessionToken | null>(null)
  const [status, setStatus] = useState<CUStatus | null>(null)
  const hasSession = Boolean(session && status)

  const beginSessionFromToken = async (tokenValue: string) => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await exchangeCredentialIntent(tokenValue)
      setSession(response.session)
      setStatus(response.status)
      storeResetSession(response)
      if (tokenValue !== token) {
        setToken(tokenValue)
      }
      setSearchParams({ token: tokenValue })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('reset.messageTokenInvalid'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const resume = async () => {
      const stored = readResetSession()
      if (!stored) return
      setLoading(true)
      setMessage(null)
      try {
        const nextStatus = await refreshCredentialStatus(stored)
        setSession(stored)
        setStatus(nextStatus)
      } catch {
        clearResetSession()
        setSession(null)
        setStatus(null)
      } finally {
        setLoading(false)
      }
    }

    void resume()
  }, [])

  useEffect(() => {
    if (!tokenParam || hasSession) return
    void beginSessionFromToken(tokenParam)
  }, [tokenParam, hasSession])

  const handleTokenSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token) {
      setMessage(t('reset.messageTokenRequired'))
      return
    }
    await beginSessionFromToken(token.trim())
  }

  const commitChanges = async () => {
    if (!session) return
    setLoading(true)
    setMessage(null)
    try {
      await commitCredentialUpdate(session)
      clearResetSession()
      navigate('/login')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('reset.messageSaveFailed'))
    } finally {
      setLoading(false)
    }
  }

  const discardChanges = async () => {
    if (!session) return
    setLoading(true)
    setMessage(null)
    try {
      await cancelCredentialUpdate(session)
      clearResetSession()
      setSession(null)
      setStatus(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('reset.messageDiscardFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="reset">
      <div className="reset-card">
        <h1>{t('reset.title')}</h1>
        <p className="page-note">{t('reset.subtitle')}</p>

        {message && <p className="feedback">{message}</p>}

        {!hasSession && (
          <form onSubmit={handleTokenSubmit} className="form-actions">
            <label className="field">
              <span>{t('reset.tokenLabel')}</span>
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={t('reset.tokenPlaceholder')}
                required
              />
            </label>
            <button type="submit" disabled={loading}>
              {t('reset.startSession')}
            </button>
          </form>
        )}

        {hasSession && status && (
          <div className="credential-panel">
            <CredentialSections
              session={session!}
              status={status}
              loading={loading}
              onLoadingChange={setLoading}
              onStatusChange={setStatus}
              onMessage={setMessage}
              context="reset"
              leadMessage={t('reset.sessionActive', {
                displayName: status.displayname,
                spn: status.spn,
              })}
              warningsTitle={t('reset.warningsTitle')}
              tipMessage={t('reset.tipPasskey')}
              cannotSaveMessage={t('reset.cannotSave')}
            />

            <div className="credential-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  void discardChanges()
                }}
                disabled={loading}
              >
                {t('reset.discard')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void commitChanges()
                }}
                disabled={loading || !status.can_commit}
              >
                {t('reset.saveCredentialChanges')}
              </button>
            </div>
          </div>
        )}

      </div>
    </section>
  )
}
