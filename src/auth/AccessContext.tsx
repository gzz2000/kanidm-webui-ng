import type { FormEvent } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authPasskey, authPassword, authTotp, fetchUserAuthToken, reauthBegin } from '../api'
import type { AuthAllowed, AuthResponse } from '../api/types'
import type { components } from '../api/schema'
import { useAuth } from './AuthContext'
import { performPasskeyRequest } from './webauthn'

type UserAuthToken = components['schemas']['UserAuthToken']

type AccessPermissions = {
  nameAllowed: boolean
  emailAllowed: boolean
  selfWriteAllowed: boolean
}

type AccessContextValue = {
  canEdit: boolean
  unlockedMinutes: number | null
  permissions: AccessPermissions
  memberOf: string[]
  requestReauth: () => void
}

const SELF_NAME_WRITE_GROUPS = ['idm_all_persons', 'idm_people_self_name_write']
const SELF_MAIL_WRITE_GROUPS = ['idm_people_self_mail_write']
const SELF_WRITE_GROUPS = ['idm_all_persons']

const AccessContext = createContext<AccessContextValue | undefined>(undefined)

function normalizeGroupName(group: string) {
  return group.split('@')[0]?.toLowerCase() ?? ''
}

function hasAnyGroup(memberOf: string[], groups: string[]) {
  const groupSet = new Set(groups.map((group) => group.toLowerCase()))
  return memberOf.some((entry) => groupSet.has(normalizeGroupName(entry)))
}

function parseUatExpiry(expiry: UserAuthToken['expiry']): number | null {
  if (expiry === null || expiry === undefined) return null
  if (typeof expiry === 'number') {
    return expiry < 1_000_000_000_000 ? expiry * 1000 : expiry
  }
  if (typeof expiry === 'string') {
    const parsed = Date.parse(expiry)
    if (!Number.isNaN(parsed)) return parsed
    const numeric = Number(expiry)
    if (!Number.isNaN(numeric)) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric
    }
  }
  return null
}

function isReadwrite(purpose: UserAuthToken['purpose'], now: number) {
  if (!(typeof purpose === 'object' && purpose !== null && 'readwrite' in purpose)) {
    return false
  }
  const expiry = parseUatExpiry(purpose.readwrite.expiry)
  if (!expiry) return false
  const cutoff = now + 60_000
  return expiry > cutoff
}

function authSucceeded(response: AuthResponse) {
  return 'success' in response.state
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { status, user, setAuthenticated } = useAuth()
  const { t } = useTranslation()
  const [uat, setUat] = useState<UserAuthToken | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const [reauthOpen, setReauthOpen] = useState(false)
  const [reauthAllowed, setReauthAllowed] = useState<AuthAllowed[]>([])
  const [reauthMessage, setReauthMessage] = useState<string | null>(null)
  const [reauthLoading, setReauthLoading] = useState(false)
  const [reauthTotp, setReauthTotp] = useState('')
  const [reauthPassword, setReauthPassword] = useState('')

  const memberOf = user?.memberOf ?? []
  const permissions = useMemo(
    () => ({
      nameAllowed: hasAnyGroup(memberOf, SELF_NAME_WRITE_GROUPS),
      emailAllowed: hasAnyGroup(memberOf, SELF_MAIL_WRITE_GROUPS),
      selfWriteAllowed: hasAnyGroup(memberOf, SELF_WRITE_GROUPS),
    }),
    [memberOf],
  )

  const canEdit = useMemo(
    () => (uat ? isReadwrite(uat.purpose, now) : false),
    [uat, now],
  )

  const rwExpiry = useMemo(
    () => (uat && typeof uat.purpose === 'object' ? parseUatExpiry(uat.purpose.readwrite.expiry) : null),
    [uat],
  )
  const unlockedMinutes =
    rwExpiry && rwExpiry > now ? Math.max(1, Math.ceil((rwExpiry - now) / 60000)) : null

  useEffect(() => {
    if (!rwExpiry) return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [rwExpiry])

  const refreshUat = useCallback(async () => {
    try {
      const nextToken = await fetchUserAuthToken()
      setUat(nextToken)
    } catch {
      setUat(null)
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated') {
      setUat(null)
      return
    }
    void refreshUat()
  }, [status, refreshUat])

  const beginReauth = useCallback(async () => {
    if (status !== 'authenticated') return
    if (reauthLoading) return
    setReauthOpen(true)
    setReauthLoading(true)
    setReauthMessage(null)
    setReauthAllowed([])
    setReauthPassword('')
    setReauthTotp('')
    try {
      const response = await reauthBegin()
      if (authSucceeded(response)) {
        await setAuthenticated()
        await refreshUat()
        setReauthOpen(false)
        return
      }
      if ('continue' in response.state) {
        setReauthAllowed(response.state.continue)
      } else {
        setReauthMessage(t('profile.messageReauthStartFailed'))
      }
    } catch (error) {
      setReauthMessage(error instanceof Error ? error.message : t('profile.messageReauthFailed'))
    } finally {
      setReauthLoading(false)
    }
  }, [reauthLoading, refreshUat, setAuthenticated, status, t])

  const handleReauthPassword = async (event: FormEvent) => {
    event.preventDefault()
    setReauthLoading(true)
    setReauthMessage(null)
    try {
      if (reauthAllowed.some((entry) => entry === 'totp') && !reauthTotp) {
        setReauthMessage(t('profile.messageReauthTotpRequired'))
        setReauthLoading(false)
        return
      }
      if (reauthAllowed.some((entry) => entry === 'password') && !reauthPassword) {
        setReauthMessage(t('profile.messageReauthPasswordRequired'))
        setReauthLoading(false)
        return
      }
      let response: AuthResponse | null = null
      if (reauthAllowed.some((entry) => entry === 'totp')) {
        response = await authTotp(Number(reauthTotp))
        if ('continue' in response.state) {
          setReauthAllowed(response.state.continue)
          if (response.state.continue.some((entry) => entry === 'password')) {
            if (!reauthPassword) {
              setReauthMessage(t('profile.messageReauthPasswordRequired'))
              setReauthLoading(false)
              return
            }
            response = await authPassword(reauthPassword)
          }
        }
      } else {
        response = await authPassword(reauthPassword)
        if ('continue' in response.state) {
          setReauthAllowed(response.state.continue)
          if (response.state.continue.some((entry) => entry === 'totp')) {
            if (!reauthTotp) {
              setReauthMessage(t('profile.messageReauthTotpRequired'))
              setReauthLoading(false)
              return
            }
            response = await authTotp(Number(reauthTotp))
          }
        }
      }

      if (response && authSucceeded(response)) {
        await setAuthenticated()
        await refreshUat()
        setReauthOpen(false)
        setReauthPassword('')
        setReauthTotp('')
      } else {
        setReauthMessage(t('profile.messageReauthIncomplete'))
      }
    } catch (error) {
      setReauthMessage(error instanceof Error ? error.message : t('profile.messageReauthFailed'))
    } finally {
      setReauthLoading(false)
    }
  }

  const handleReauthPasskey = async () => {
    const passkeyAllowed = reauthAllowed.find((entry) => entry && typeof entry === 'object' && 'passkey' in entry)
    if (!passkeyAllowed || typeof passkeyAllowed !== 'object') {
      setReauthMessage(t('profile.messageReauthPasskeyUnavailable'))
      return
    }
    setReauthLoading(true)
    setReauthMessage(null)
    try {
      const credential = await performPasskeyRequest(
        passkeyAllowed.passkey as Record<string, unknown>,
      )
      const response = await authPasskey(credential as Record<string, unknown>)
      if (authSucceeded(response)) {
        await setAuthenticated()
        await refreshUat()
        setReauthOpen(false)
      } else {
        setReauthMessage(t('profile.messageReauthPasskeyFailed'))
      }
    } catch (error) {
      setReauthMessage(
        error instanceof Error ? error.message : t('profile.messageReauthPasskeyFailed'),
      )
    } finally {
      setReauthLoading(false)
    }
  }

  const requestReauth = useCallback(() => {
    if (reauthOpen || reauthLoading) return
    void beginReauth()
  }, [beginReauth, reauthLoading, reauthOpen])

  const value = useMemo(
    () => ({
      canEdit,
      unlockedMinutes,
      permissions,
      memberOf,
      requestReauth,
    }),
    [canEdit, unlockedMinutes, permissions, memberOf, requestReauth],
  )

  return (
    <AccessContext.Provider value={value}>
      {children}
      {reauthOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <header>
              <h3>{t('profile.reauthTitle')}</h3>
              <p>{t('profile.reauthSubtitle')}</p>
            </header>
            {reauthMessage && <p className="feedback">{reauthMessage}</p>}

            {reauthAllowed.length > 0 && (
              <div className="reauth-options">
                {reauthAllowed.some((entry) => entry && typeof entry === 'object' && 'passkey' in entry) && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      void handleReauthPasskey()
                    }}
                    disabled={reauthLoading}
                  >
                    {t('profile.reauthUsePasskey')}
                  </button>
                )}

                {(reauthAllowed.some((entry) => entry === 'password') ||
                  reauthAllowed.some((entry) => entry === 'totp')) && (
                    <form className="reauth-form" onSubmit={handleReauthPassword}>
                      {reauthAllowed.some((entry) => entry === 'totp') && (
                        <label className="field">
                          <span>{t('profile.reauthTotpLabel')}</span>
                          <input
                            value={reauthTotp}
                            onChange={(event) => setReauthTotp(event.target.value)}
                            placeholder={t('credentials.totpCodePlaceholder')}
                          />
                        </label>
                      )}
                      {reauthAllowed.some((entry) => entry === 'password') && (
                        <label className="field">
                          <span>{t('profile.reauthPasswordLabel')}</span>
                          <input
                            type="password"
                            value={reauthPassword}
                            onChange={(event) => setReauthPassword(event.target.value)}
                          />
                        </label>
                      )}
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={reauthLoading}
                      >
                        {t('profile.reauthConfirm')}
                      </button>
                    </form>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setReauthOpen(false)}
                disabled={reauthLoading}
              >
                {t('profile.reauthCancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AccessContext.Provider>
  )
}

export function useAccess() {
  const ctx = useContext(AccessContext)
  if (!ctx) {
    throw new Error('useAccess must be used within AccessProvider')
  }
  return ctx
}
