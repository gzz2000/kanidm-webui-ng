import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchPeople } from '../api'
import type { PersonSummary } from '../api/people'
import { useAccess } from '../auth/AccessContext'

function normalizeGroupName(group: string) {
  return group.split('@')[0]?.toLowerCase() ?? ''
}

function hasAnyGroup(memberOf: string[], groups: string[]) {
  const allowed = new Set(groups.map((group) => group.toLowerCase()))
  return memberOf.some((entry) => allowed.has(normalizeGroupName(entry)))
}

function isHighPrivilege(memberOf: string[]) {
  return memberOf.some((group) => normalizeGroupName(group) === 'idm_high_privilege')
}

export default function People() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { memberOf } = useAccess()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [people, setPeople] = useState<PersonSummary[]>([])

  const canReadPii = useMemo(
    () =>
      hasAnyGroup(memberOf, [
        'idm_people_admins',
        'idm_people_pii_read',
      ]),
    [memberOf],
  )
  const canCreate = useMemo(
    () => hasAnyGroup(memberOf, ['idm_people_admins']),
    [memberOf],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setMessage(null)
    fetchPeople()
      .then((entries) => {
        if (!active) return
        setPeople(entries)
      })
      .catch((error) => {
        if (!active) return
        setMessage(error instanceof Error ? error.message : t('people.messages.listFailed'))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [t])

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
              onClick={() => navigate('/people/new')}
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
      </div>

      {message && <p className="feedback">{message}</p>}

      {loading ? (
        <p className="page-note">{t('people.loading')}</p>
      ) : (
        <div className="people-list">
          {filteredPeople.length === 0 ? (
            <p className="muted-text">{t('people.empty')}</p>
          ) : (
            filteredPeople.map((person) => (
              <button
                className="people-row"
                key={person.uuid}
                type="button"
                onClick={() => navigate(`/people/${person.uuid}`)}
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
