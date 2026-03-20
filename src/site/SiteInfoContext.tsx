/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { checkDomainImageExists, fetchPublicDomainDisplayName } from '../api'

type SiteInfoValue = {
  loading: boolean
  displayName: string
  imageUrl: string | null
  refresh: () => Promise<void>
}

const DEFAULT_DISPLAY_NAME = 'Kanidm'

const SiteInfoContext = createContext<SiteInfoValue | undefined>(undefined)

export function SiteInfoProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [imageVersion, setImageVersion] = useState(0)
  const displayQuery = useQuery({
    queryKey: ['site-info', 'display-name'],
    queryFn: async () => {
      const value = await fetchPublicDomainDisplayName()
      const trimmed = value.trim()
      return trimmed || DEFAULT_DISPLAY_NAME
    },
    staleTime: 300_000,
    gcTime: 3_600_000,
    retry: 0,
  })

  const imageQuery = useQuery({
    queryKey: ['site-info', 'image-url', imageVersion],
    queryFn: () => checkDomainImageExists(imageVersion || undefined),
    staleTime: 300_000,
    gcTime: 3_600_000,
    retry: 0,
  })

  const refresh = useCallback(async () => {
    setImageVersion((prev) => prev + 1)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['site-info', 'display-name'] }),
      queryClient.invalidateQueries({ queryKey: ['site-info', 'image-url'] }),
    ])
  }, [queryClient])

  useEffect(() => {
    const onChanged = () => {
      void refresh()
    }
    window.addEventListener('kanidm:site-brand-updated', onChanged)
    return () => {
      window.removeEventListener('kanidm:site-brand-updated', onChanged)
    }
  }, [refresh])

  const value = useMemo(
    () => ({
      loading: displayQuery.isPending || imageQuery.isPending,
      displayName: displayQuery.data ?? DEFAULT_DISPLAY_NAME,
      imageUrl: imageQuery.data ?? null,
      refresh,
    }),
    [displayQuery.data, displayQuery.isPending, imageQuery.data, imageQuery.isPending, refresh],
  )

  return <SiteInfoContext.Provider value={value}>{children}</SiteInfoContext.Provider>
}

export function useSiteInfo() {
  const context = useContext(SiteInfoContext)
  if (!context) {
    throw new Error('useSiteInfo must be used within SiteInfoProvider')
  }
  return context
}
