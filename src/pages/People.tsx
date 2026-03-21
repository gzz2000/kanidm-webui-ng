import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchGroups, fetchPeople } from '../api'
import type { PersonSummary } from '../api/people'
import type { GroupSummary } from '../api/groups'
import { useAccess } from '../auth/AccessContext'
import { useAuth } from '../auth/AuthContext'
import {
  canManageGroupEntry,
  isHighPrivilege,
  isPeopleAdmin,
  normalizeGroupName,
  hasAnyGroup,
} from '../utils/groupAccess'

export default function People() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { memberOf } = useAccess()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [hideUnrelated, setHideUnrelated] = useState(true)

  const canReadPii = useMemo(
    () => hasAnyGroup(memberOf, ['idm_people_admins', 'idm_people_pii_read']),
    [memberOf],
  )
  const isAdmin = useMemo(() => isPeopleAdmin(memberOf), [memberOf])
  const canCreate = useMemo(
    () => hasAnyGroup(memberOf, ['idm_people_admins', 'idm_people_on_boarding']),
    [memberOf],
  )
  const canManageGroup = useMemo(() => {
    return (group: GroupSummary) => canManageGroupEntry(group.entryManagedBy, user, memberOf)
  }, [memberOf, user])
  const peopleQuery = useQuery({
    queryKey: ['people-list'],
    queryFn: fetchPeople,
    staleTime: 30_000,
    gcTime: 300_000,
    retry: 0,
  })
  const groupsQuery = useQuery({
    queryKey: ['groups-list'],
    queryFn: fetchGroups,
    enabled: !isAdmin,
    staleTime: 30_000,
    gcTime: 300_000,
    retry: 0,
  })
  const people: PersonSummary[] = useMemo(() => peopleQuery.data ?? [], [peopleQuery.data])
  const groups: GroupSummary[] = useMemo(
    () => (groupsQuery.data ?? []).filter((group) => canManageGroup(group)),
    [groupsQuery.data, canManageGroup],
  )
  const loading = peopleQuery.isPending || (!isAdmin && groupsQuery.isPending)
  const message = peopleQuery.isError
    ? peopleQuery.error instanceof Error
      ? peopleQuery.error.message
      : t('people.messages.listFailed')
    : null
  const effectiveHideUnrelated = isAdmin ? false : hideUnrelated

  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return people
    return people.filter((person) => {
      if (person.displayName.toLowerCase().includes(needle)) return true
      if (person.name.toLowerCase().includes(needle)) return true
      if (person.emails.some((email) => email.toLowerCase().includes(needle))) return true
      return false
    })
  }, [people, query])

  const visiblePeople = useMemo(() => {
    if (isAdmin || !effectiveHideUnrelated) return filteredPeople
    const manageableGroups = new Set(groups.map((group) => normalizeGroupName(group.name)))
    if (manageableGroups.size === 0) {
      return filteredPeople.filter((person) => person.uuid === user?.uuid)
    }
    return filteredPeople.filter((person) =>
      person.uuid === user?.uuid ||
      person.memberOf.some((group) => manageableGroups.has(normalizeGroupName(group))),
    )
  }, [effectiveHideUnrelated, filteredPeople, groups, isAdmin, user?.uuid])

  return (
    <section className="page people-page management-list-page">
      <div className="management-list-header">
        <div>
          <h1>{t('people.title')}</h1>
          <p className="page-note">{t('people.subtitle')}</p>
        </div>
        {canCreate && (
          <div className="management-list-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => navigate('/admin/people/new')}
            >
              {t('people.createCta')}
            </button>
          </div>
        )}
      </div>

      <div className="management-list-toolbar">
        <input
          className="management-list-search"
          type="search"
          value={query}
          placeholder={t('people.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!canReadPii && (
          <span className="muted-text">
            {t('people.limitedAccess')}
          </span>
        )}
        {!isAdmin && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={effectiveHideUnrelated}
              onChange={(event) => setHideUnrelated(event.target.checked)}
            />
            <span>{t('people.onlyMyGroups')}</span>
          </label>
        )}
      </div>

      {message && <p className="inline-feedback">{message}</p>}

      {loading ? (
        <p className="page-note">{t('people.loading')}</p>
      ) : (
        <div className="management-list">
          {visiblePeople.length === 0 ? (
            <p className="muted-text">{t('people.empty')}</p>
          ) : (
            visiblePeople.map((person) => (
              <button
                className="management-list-row"
                key={person.uuid}
                type="button"
                onClick={() => navigate(`/admin/people/${person.uuid}`)}
              >
                <div>
                  <div className="management-list-name">
                    <span>{person.displayName}</span>
                    {isHighPrivilege(person.memberOf) && (
                      <span
                        className="badge badge-warn badge-sharp"
                        title={t('shell.highPrivilegeTip')}
                      >
                        {t('shell.highPrivilege')}
                      </span>
                    )}
                  </div>
                  <div className="management-list-meta">
                    <span>{person.name}</span>
                    <span>{person.uuid}</span>
                  </div>
                </div>
                {canReadPii && (
                  <div className="management-list-cell">
                    {person.emails.length > 0
                      ? person.emails.join(', ')
                      : t('people.noEmail')}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </section>
  )
}
