import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [people, setPeople] = useState<PersonSummary[]>([])
  const pendingRef = useRef<Promise<PersonSummary[]> | null>(null)
  const [groups, setGroups] = useState<GroupSummary[]>([])

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

  useEffect(() => {
    let active = true
    setLoading(true)
    setMessage(null)
    if (!pendingRef.current) {
      pendingRef.current = fetchPeople()
    }
    pendingRef.current
      .then((entries) => {
        if (!active) return
        setPeople(entries)
      })
      .catch((error) => {
        if (!active) return
        setMessage(error instanceof Error ? error.message : t('people.messages.listFailed'))
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

  useEffect(() => {
    if (isAdmin) {
      setHideUnrelated(false)
      return
    }
    setHideUnrelated(true)
    let active = true
    fetchGroups()
      .then((entries) => {
        if (!active) return
        setGroups(entries.filter((group) => canManageGroup(group)))
      })
      .catch(() => {
        if (!active) return
        setGroups([])
      })
    return () => {
      active = false
    }
  }, [canManageGroup, isAdmin])

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
    if (isAdmin || !hideUnrelated) return filteredPeople
    const manageableGroups = new Set(groups.map((group) => normalizeGroupName(group.name)))
    if (manageableGroups.size === 0) return []
    return filteredPeople.filter((person) =>
      person.memberOf.some((group) => manageableGroups.has(normalizeGroupName(group))),
    )
  }, [filteredPeople, groups, hideUnrelated, isAdmin])

  return (
    <section className="page people-page">
      <div className="people-header">
        <div>
          <h1>{t('people.title')}</h1>
          <p className="page-note">{t('people.subtitle')}</p>
        </div>
        {canCreate && (
          <div className="people-actions">
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

      <div className="people-toolbar">
        <input
          className="people-search"
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
              checked={hideUnrelated}
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
        <div className="people-list">
          {visiblePeople.length === 0 ? (
            <p className="muted-text">{t('people.empty')}</p>
          ) : (
            visiblePeople.map((person) => (
              <button
                className="people-row"
                key={person.uuid}
                type="button"
                onClick={() => navigate(`/admin/people/${person.uuid}`)}
              >
                <div>
                  <div className="people-name">
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
                  <div className="people-meta">
                    <span>{person.name}</span>
                    <span>{person.uuid}</span>
                  </div>
                </div>
                {canReadPii && (
                  <div className="people-cell">
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
