/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SelfProfile } from '../api'
import { clearAuthToken, fetchSelfProfile, logout } from '../api'
import { tokenStore } from '../api/http'

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated'

export type UserProfile = SelfProfile

type AuthContextValue = {
  status: AuthStatus
  user: UserProfile | null
  setAuthenticated: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [user, setUser] = useState<UserProfile | null>(null)
  const hasToken = Boolean(tokenStore.get())

  const selfQuery = useQuery({
    queryKey: ['selfProfile'],
    queryFn: fetchSelfProfile,
    enabled: hasToken,
    staleTime: 30_000,
    gcTime: 300_000,
    retry: 0,
  })

  useEffect(() => {
    if (!hasToken) {
      setStatus('unauthenticated')
      setUser(null)
      return
    }
    if (selfQuery.isPending) {
      setStatus('checking')
      return
    }
    if (selfQuery.isSuccess) {
      setUser(selfQuery.data)
      setStatus('authenticated')
      return
    }
    if (selfQuery.isError) {
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [hasToken, selfQuery.data, selfQuery.isError, selfQuery.isPending, selfQuery.isSuccess])

  useEffect(() => {
    const handleAuthExpired = () => {
      setStatus('unauthenticated')
      setUser(null)
      queryClient.clear()
    }
    window.addEventListener('kanidm:auth-expired', handleAuthExpired)
    return () => {
      window.removeEventListener('kanidm:auth-expired', handleAuthExpired)
    }
  }, [queryClient])

  const value = useMemo(
    () => ({
      status,
      user,
      setAuthenticated: async () => {
        await selfQuery.refetch()
      },
      signOut: async () => {
        try {
          await logout()
        } finally {
          clearAuthToken()
          queryClient.clear()
          setStatus('unauthenticated')
          setUser(null)
        }
      },
    }),
    [queryClient, selfQuery, status, user],
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
