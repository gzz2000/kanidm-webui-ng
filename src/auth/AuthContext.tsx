import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { clearAuthToken, fetchWhoami, logout } from '../api'
import { tokenStore } from '../api/http'

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated'

export type UserProfile = {
  name: string
  displayName: string
}

type AuthContextValue = {
  status: AuthStatus
  user: UserProfile | null
  setAuthenticated: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [user, setUser] = useState<UserProfile | null>(null)

  const refreshUser = useCallback(async () => {
    const profile = await fetchWhoami()
    setUser(profile)
    return profile
  }, [])

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      if (!tokenStore.get()) {
        if (!cancelled) {
          setStatus('unauthenticated')
          setUser(null)
        }
        return
      }

      try {
        await refreshUser()
        if (!cancelled) {
          setStatus('authenticated')
        }
      } catch {
        if (!cancelled) {
          setStatus('unauthenticated')
          setUser(null)
        }
      }
    }

    check()

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(
    () => ({
      status,
      user,
      setAuthenticated: async () => {
        setStatus('authenticated')
        await refreshUser()
      },
      signOut: async () => {
        try {
          await logout()
        } finally {
          clearAuthToken()
          setStatus('unauthenticated')
          setUser(null)
        }
      },
    }),
    [status, user, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
