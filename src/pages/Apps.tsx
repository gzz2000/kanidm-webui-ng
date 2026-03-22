import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchOauth2ImageObjectUrl } from '../api/oauth2'
import { fetchSelfAppLinks } from '../api/user'
import type { UserAppLink } from '../api/user'

export default function Apps() {
  const { t } = useTranslation()
  const previousUrlsRef = useRef<Record<string, string>>({})
  const appsQuery = useQuery({
    queryKey: ['selfAppLinks'],
    queryFn: fetchSelfAppLinks,
    staleTime: 30_000,
    gcTime: 300_000,
    retry: 0,
  })
  const apps: UserAppLink[] = useMemo(
    () =>
      appsQuery.data
        ? [...appsQuery.data].sort((a, b) => a.displayName.localeCompare(b.displayName))
        : [],
    [appsQuery.data],
  )
  const loading = appsQuery.isPending
  const message = appsQuery.isError
    ? appsQuery.error instanceof Error
      ? appsQuery.error.message
      : t('apps.messages.loadFailed')
    : null
  const imageNames = useMemo(
    () => apps.filter((app) => app.hasImage).map((app) => app.name).sort(),
    [apps],
  )
  const imagesQuery = useQuery({
    queryKey: ['apps-images', imageNames.join('|')],
    queryFn: async () => {
      if (imageNames.length === 0) return {} as Record<string, string>
      const entries = await Promise.all(
        imageNames.map(async (name) => {
          try {
            const url = await fetchOauth2ImageObjectUrl(name)
            return [name, url] as const
          } catch {
            return [name, null] as const
          }
        }),
      )
      const next: Record<string, string> = {}
      for (const [name, url] of entries) {
        if (url) next[name] = url
      }
      return next
    },
    staleTime: 30_000,
    gcTime: 120_000,
  })
  const appImageUrls = useMemo(() => imagesQuery.data ?? {}, [imagesQuery.data])

  useEffect(() => {
    const previous = previousUrlsRef.current
    const next = appImageUrls
    for (const [name, url] of Object.entries(previous)) {
      if (next[name] !== url) URL.revokeObjectURL(url)
    }
    previousUrlsRef.current = next
  }, [appImageUrls])

  return (
    <section className="page apps-page">
      <header>
        <h1>{t('apps.title')}</h1>
        <p className="page-note">{t('apps.subtitle')}</p>
      </header>

      {message && <p className="inline-feedback">{message}</p>}

      {loading ? (
        <p className="muted-text">{t('apps.loading')}</p>
      ) : apps.length === 0 ? (
        <p className="muted-text">{t('apps.empty')}</p>
      ) : (
        <div className="apps-grid">
          {apps.map((app) => (
            <a key={app.name} href={app.redirectUrl} className="apps-card">
              {app.hasImage && appImageUrls[app.name] ? (
                <img
                  src={appImageUrls[app.name]}
                  alt={t('apps.imageAlt', { app: app.displayName })}
                />
              ) : (
                <div className="apps-fallback" aria-hidden="true">
                  {app.displayName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="apps-card-body">
                <div className="apps-name">{app.displayName}</div>
                <div className="apps-open">{t('apps.open')}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  )
}
