import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  authBegin,
  authInit,
  authPasskey,
  authPassword,
  authTotp,
} from '../api'
import { performPasskeyRequest } from '../auth/webauthn'
import { useAuth } from '../auth/AuthContext'
import { loadOauth2PendingRequest } from '../auth/oauth2FlowState'
import { useSiteInfo } from '../site/SiteInfoContext'
import type { AuthAllowed, AuthMech, AuthResponse } from '../api/types'

function findAllowed(
  allowed: AuthAllowed[],
  key: string,
): AuthAllowed | undefined {
  return allowed.find((entry) => {
    if (typeof entry === 'string') {
      return entry === key
    }
    if (entry && typeof entry === 'object') {
      return key in entry
    }
    return false
  })
}

function authSucceeded(response: AuthResponse) {
  return 'success' in response.state
}

export default function Login() {
  const navigate = useNavigate()
  const { setAuthenticated } = useAuth()
  const { displayName, imageUrl } = useSiteInfo()
  const { t } = useTranslation()
  const [step, setStep] = useState<'username' | 'select' | 'password' | 'totp' | 'passkey'>(
    'username',
  )
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [available, setAvailable] = useState<AuthMech[]>([])
  const [authReady, setAuthReady] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(false)

  useEffect(() => {
    const notice = sessionStorage.getItem('kanidm.login_notice')
    if (notice) {
      setMessage(notice)
      sessionStorage.removeItem('kanidm.login_notice')
    }
  }, [])

  const handleSuccess = async () => {
    await setAuthenticated()
    if (loadOauth2PendingRequest()) {
      navigate('/oauth2/resume')
      return
    }
    navigate('/')
  }

  const handleAuthResponse = (response: AuthResponse) => {
    if (authSucceeded(response)) {
      void handleSuccess()
      return
    }

    if ('denied' in response.state) {
      setMessage(response.state.denied)
      setAuthReady(false)
      setRetry(true)
      return
    }

    if ('continue' in response.state) {
      const allowed = response.state.continue
      if (findAllowed(allowed, 'totp')) {
        setStep('totp')
        return
      }
      if (findAllowed(allowed, 'password')) {
        setStep('password')
        return
      }
      if (findAllowed(allowed, 'passkey')) {
        setStep('passkey')
        return
      }
    }
  }

  const resetFlow = () => {
    setAuthReady(false)
    setAvailable([])
    setPassword('')
    setTotp('')
    setStep('username')
    setRetry(false)
    setMessage(null)
  }

  const startAuth = async (mechanism: AuthMech) => {
    if (!authReady) {
      const init = await authInit(username)
      if ('denied' in init.state) {
        throw new Error(init.state.denied)
      }
      setAuthReady(true)
    }
    const begin = await authBegin(mechanism)
    handleAuthResponse(begin)
    return begin
  }

  const submitPasswordFlow = async (mech: AuthMech) => {
    setMessage(null)
    setLoading(true)
    try {
      const begin = await startAuth(mech)
      if ('continue' in begin.state) {
        const allowed = begin.state.continue
        if (findAllowed(allowed, 'totp')) {
          setStep('totp')
          return
        }
        if (findAllowed(allowed, 'password')) {
          setStep('password')
          return
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed')
      setAuthReady(false)
      setRetry(true)
    } finally {
      setLoading(false)
    }
  }

  const submitPasskey = async () => {
    setMessage(null)
    setLoading(true)
    try {
      const begin = await startAuth('passkey')
      if (!('continue' in begin.state)) {
        return
      }
      const passkey = findAllowed(begin.state.continue, 'passkey')
      if (!passkey || typeof passkey === 'string' || !('passkey' in passkey)) {
        throw new Error('Passkey challenge missing from server response')
      }
      const credential = await performPasskeyRequest(
        passkey.passkey as Record<string, unknown>,
      )
      const response = await authPasskey(credential as Record<string, unknown>)
      handleAuthResponse(response)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Passkey login failed')
      setAuthReady(false)
      setRetry(true)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setMessage(null)
    if (!username) {
      setMessage('Username is required')
      return
    }

    if (step === 'username') {
      setLoading(true)
      try {
        const init = await authInit(username)
        if ('denied' in init.state) {
          throw new Error(init.state.denied)
        }
        setAuthReady(true)
        if ('choose' in init.state) {
          setAvailable(init.state.choose)
          if (init.state.choose.length === 1) {
            const mech = init.state.choose[0]
            if (mech === 'passkey') {
              setStep('passkey')
              await submitPasskey()
              return
            }
            await submitPasswordFlow(mech)
            return
          }
          setStep('select')
        } else if ('continue' in init.state) {
          setStep('select')
          } else if (authSucceeded(init)) {
            void handleSuccess()
          }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Login failed')
        setAuthReady(false)
        setRetry(true)
      } finally {
        setLoading(false)
      }
      return
    }

    if (retry) {
      resetFlow()
      return
    }

    if (step === 'passkey') {
      await submitPasskey()
      return
    }

    if (step === 'totp') {
      setLoading(true)
      try {
        const response = await authTotp(Number(totp))
        handleAuthResponse(response)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Login failed')
      } finally {
        setLoading(false)
      }
      return
    }

    if (step === 'password') {
      setLoading(true)
      try {
        const response = await authPassword(password)
        handleAuthResponse(response)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Login failed')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <section className="login">
      <div className="login-card">
        <div className="login-header">
          <div>
            {imageUrl && (
              <div className="centered-brand-image-wrap">
                <img src={imageUrl} alt={displayName} className="centered-brand-image" />
              </div>
            )}
            <h1>{t('login.titleWithDomain', { domain: displayName })}</h1>
            <p className="page-note">{t('login.subtitle')}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>{t('login.username')}</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="username"
              required
              disabled={step !== 'username'}
            />
          </label>

          {step === 'select' && (
            <div className="mode-toggle">
              {available.includes('passwordmfa') && (
                <button
                  type="button"
                  onClick={() => submitPasswordFlow('passwordmfa')}
                >
                  {t('login.passwordTotp')}
                </button>
              )}
              {available.includes('passkey') && (
                <button type="button" onClick={() => submitPasskey()}>
                  {t('login.passkey')}
                </button>
              )}
              {available.includes('password') && !available.includes('passwordmfa') && (
                <button
                  type="button"
                  onClick={() => submitPasswordFlow('password')}
                >
                  {t('login.passwordOnly')}
                </button>
              )}
            </div>
          )}

          {step === 'password' && (
            <label className="field">
              <span>{t('login.password')}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
            </label>
          )}

          {step === 'totp' && (
            <label className="field">
              <span>{t('login.totp')}</span>
              <input
                value={totp}
                onChange={(event) => setTotp(event.target.value)}
                placeholder="123456"
              />
            </label>
          )}

          {step === 'passkey' && (
            <div className="passkey-hint">
              <p className="page-note">{t('login.passkeyPrompt')}</p>
            </div>
          )}

          {message && <div className="error">{message}</div>}

          <button type="submit" disabled={loading || (step === 'select' && !retry)}>
            {loading
              ? t('login.signingIn')
              : retry
                ? t('login.tryAgain')
                : t('login.continue')}
          </button>
        </form>
      </div>
    </section>
  )
}
