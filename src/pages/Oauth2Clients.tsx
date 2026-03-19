import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchOauth2Clients } from '../api'
import type { Oauth2ClientSummary } from '../api/oauth2'
import { useAccess } from '../auth/AccessContext'
import { isOauth2Admin } from '../utils/groupAccess'

export default function Oauth2Clients() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { memberOf } = useAccess()
  const isAdmin = useMemo(() => isOauth2Admin(memberOf), [memberOf])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [clients, setClients] = useState<Oauth2ClientSummary[]>([])
  const pendingRef = useRef<Promise<Oauth2ClientSummary[]> | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setMessage(null)
    if (!pendingRef.current) {
      pendingRef.current = fetchOauth2Clients()
    }
    pendingRef.current
      .then((entries) => {
        if (!active) return
        setClients(entries)
      })
      .catch((error) => {
        if (!active) return
        setMessage(error instanceof Error ? error.message : t('oauth2.messages.listFailed'))
      })
      .finally(() => {
        pendingRef.current = null
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filteredClients = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return clients
    return clients.filter((client) => {
      if (client.name.toLowerCase().includes(needle)) return true
      if (client.displayName.toLowerCase().includes(needle)) return true
      if (client.landingUrl && client.landingUrl.toLowerCase().includes(needle)) return true
      return false
    })
  }, [clients, query])

  return (
    <section className="page oauth2-page">
      <div className="oauth2-header">
        <div>
          <h1>{t('oauth2.list.title')}</h1>
          <p className="page-note">{t('oauth2.list.subtitle')}</p>
        </div>
        {isAdmin && (
          <div className="oauth2-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => navigate('/admin/oauth2/new')}
            >
              {t('oauth2.list.createCta')}
            </button>
          </div>
        )}
      </div>

      <div className="oauth2-toolbar">
        <input
          className="oauth2-search"
          placeholder={t('oauth2.list.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {message && <p className="inline-feedback">{message}</p>}

      {loading ? (
        <p className="muted-text">{t('oauth2.list.loading')}</p>
      ) : filteredClients.length === 0 ? (
        <p className="muted-text">{t('oauth2.list.empty')}</p>
      ) : (
        <div className="oauth2-list">
          {filteredClients.map((client) => (
            <button
              key={client.uuid}
              type="button"
              className="oauth2-row"
              onClick={() => navigate(`/admin/oauth2/${encodeURIComponent(client.name)}`)}
            >
              <div>
                <strong>{client.displayName}</strong>
                <div className="muted-text">{client.name}</div>
              </div>
              <div className="oauth2-meta">
                <span className="badge badge-sharp badge-neutral">
                  {client.type === 'basic'
                    ? t('oauth2.types.basic')
                    : client.type === 'public'
                      ? t('oauth2.types.public')
                      : t('oauth2.types.unknown')}
                </span>
                {client.landingUrl && (
                  <span className="muted-text">{client.landingUrl}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
