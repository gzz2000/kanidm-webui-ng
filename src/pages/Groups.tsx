import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchGroups } from '../api'
import type { GroupSummary } from '../api/groups'
import { useAccess } from '../auth/AccessContext'
import { useAuth } from '../auth/AuthContext'
import {
  canManageGroupEntry,
  isAccessControlAdmin,
  isGroupAdmin,
  isHighPrivilege,
} from '../utils/groupAccess'

export default function Groups() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { memberOf } = useAccess()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [hideUnmanaged, setHideUnmanaged] = useState(true)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const pendingRef = useRef<Promise<GroupSummary[]> | null>(null)

  const canCreate = useMemo(() => isGroupAdmin(memberOf), [memberOf])
  const isAccessAdmin = useMemo(() => isAccessControlAdmin(memberOf), [memberOf])
  const canManageGroup = useMemo(() => {
    return (group: GroupSummary) => canManageGroupEntry(group.entryManagedBy, user, memberOf)
  }, [memberOf, user])

  useEffect(() => {
    let active = true
    setLoading(true)
    setMessage(null)
    if (!pendingRef.current) {
      pendingRef.current = fetchGroups()
    }
    pendingRef.current
      .then((entries) => {
        if (!active) return
        setGroups(entries)
      })
      .catch((error) => {
        if (!active) return
        setMessage(error instanceof Error ? error.message : t('groups.messages.listFailed'))
      })
      .finally(() => {
        pendingRef.current = null
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [t])

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = groups.filter((group) => {
      if (group.displayName.toLowerCase().includes(needle)) return true
      if (group.name.toLowerCase().includes(needle)) return true
      if (group.description && group.description.toLowerCase().includes(needle)) return true
      return false
    })
    if (!hideUnmanaged) return filtered
    return filtered.filter((group) => canManageGroup(group))
  }, [canManageGroup, groups, hideUnmanaged, query])

  return (
    <section className="page groups-page">
      <div className="groups-header">
        <div>
          <h1>{t('groups.title')}</h1>
          <p className="page-note">{t('groups.subtitle')}</p>
        </div>
        {canCreate && (
          <div className="groups-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => navigate('/groups/new')}
            >
              {t('groups.createCta')}
            </button>
          </div>
        )}
      </div>

      <div className="groups-toolbar">
        <input
          className="groups-search"
          type="search"
          value={query}
          placeholder={t('groups.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!isAccessAdmin && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={hideUnmanaged}
              onChange={(event) => setHideUnmanaged(event.target.checked)}
            />
            <span>{t('groups.hideUnmanaged')}</span>
          </label>
        )}
      </div>

      {message && <p className="feedback">{message}</p>}

      {loading ? (
        <p className="page-note">{t('groups.loading')}</p>
      ) : (
        <div className="groups-list">
          {filteredGroups.length === 0 ? (
            <p className="muted-text">{t('groups.empty')}</p>
          ) : (
            filteredGroups.map((group) => (
              <button
                className="groups-row"
                key={group.uuid}
                type="button"
                onClick={() => navigate(`/groups/${group.uuid}`)}
              >
                <div>
                  <div className="groups-name">
                    <span>{group.displayName}</span>
                    {isHighPrivilege(group.memberOf) && (
                      <span
                        className="badge badge-warn badge-sharp"
                        title={t('shell.highPrivilegeTip')}
                      >
                        {t('shell.highPrivilege')}
                      </span>
                    )}
                  </div>
                  <div className="groups-meta">
                    <span>{group.name}</span>
                    <span>{group.uuid}</span>
                  </div>
                </div>
                <div className="groups-cell">
                  {group.description ? group.description : t('groups.noDescription')}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  )
}
