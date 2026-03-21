import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
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
  const groupsQuery = useQuery({
    queryKey: ['groups-list'],
    queryFn: fetchGroups,
    staleTime: 30_000,
    gcTime: 300_000,
    retry: 0,
  })
  const groups: GroupSummary[] = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data])
  const loading = groupsQuery.isPending
  const message = groupsQuery.isError
    ? groupsQuery.error instanceof Error
      ? groupsQuery.error.message
      : t('groups.messages.listFailed')
    : null

  const canCreate = useMemo(() => isGroupAdmin(memberOf), [memberOf])
  const isAccessAdmin = useMemo(() => isAccessControlAdmin(memberOf), [memberOf])
  const canManageGroup = useMemo(() => {
    return (group: GroupSummary) => canManageGroupEntry(group.entryManagedBy, user, memberOf)
  }, [memberOf, user])

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
    <section className="page groups-page management-list-page">
      <div className="management-list-header">
        <div>
          <h1>{t('groups.title')}</h1>
          <p className="page-note">{t('groups.subtitle')}</p>
        </div>
        {canCreate && (
          <div className="management-list-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => navigate('/admin/groups/new')}
            >
              {t('groups.createCta')}
            </button>
          </div>
        )}
      </div>

      <div className="management-list-toolbar">
        <input
          className="management-list-search"
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

      {message && <p className="inline-feedback">{message}</p>}

      {loading ? (
        <p className="page-note">{t('groups.loading')}</p>
      ) : (
        <div className="management-list">
          {filteredGroups.length === 0 ? (
            <p className="muted-text">{t('groups.empty')}</p>
          ) : (
            filteredGroups.map((group) => (
              <button
                className="management-list-row"
                key={group.uuid}
                type="button"
                onClick={() => navigate(`/admin/groups/${group.uuid}`)}
              >
                <div>
                  <div className="management-list-name">
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
                  <div className="management-list-meta">
                    <span>{group.name}</span>
                    <span>{group.uuid}</span>
                  </div>
                </div>
                <div className="management-list-cell">
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
