import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchOauth2ImageObjectUrl } from '../api/oauth2'
import { fetchSelfAppLinks } from '../api/user'
import type { UserAppLink } from '../api/user'

export default function Apps() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [apps, setApps] = useState<UserAppLink[]>([])
  const [appImageUrls, setAppImageUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setMessage(null)
      try {
        const response = await fetchSelfAppLinks()
        if (cancelled) return
        setApps(response.sort((a, b) => a.displayName.localeCompare(b.displayName)))
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : t('apps.messages.loadFailed'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [t])

  useEffect(() => {
    let active = true
    let objectUrls: string[] = []

    const loadImages = async () => {
      const imageApps = apps.filter((app) => app.hasImage)
      if (imageApps.length === 0) {
        setAppImageUrls({})
        return
      }

      const entries = await Promise.all(
        imageApps.map(async (app) => {
          try {
            const url = await fetchOauth2ImageObjectUrl(app.name)
            return [app.name, url] as const
          } catch {
            return [app.name, null] as const
          }
        }),
      )

      if (!active) {
        entries.forEach(([, url]) => {
          if (url) URL.revokeObjectURL(url)
        })
        return
      }

      const next: Record<string, string> = {}
      for (const [name, url] of entries) {
        if (url) {
          next[name] = url
          objectUrls.push(url)
        }
      }
      setAppImageUrls(next)
    }

    void loadImages()

    return () => {
      active = false
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
      objectUrls = []
    }
  }, [apps])

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
