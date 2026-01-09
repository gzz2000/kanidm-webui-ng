import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createPerson } from '../api'
import { useAccess } from '../auth/AccessContext'

function normalizeGroupName(group: string) {
  return group.split('@')[0]?.toLowerCase() ?? ''
}

function hasAnyGroup(memberOf: string[], groups: string[]) {
  const allowed = new Set(groups.map((group) => group.toLowerCase()))
  return memberOf.some((entry) => allowed.has(normalizeGroupName(entry)))
}

export default function PersonCreate() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { canEdit, memberOf, requestReauth } = useAccess()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const canCreate = hasAnyGroup(memberOf, ['idm_people_admins'])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canCreate) return
    if (!canEdit) {
      requestReauth()
      return
    }
    setMessage(null)
    const trimmedName = name.trim()
    const trimmedDisplay = displayName.trim()
    if (!trimmedName || !trimmedDisplay) {
      setMessage(t('people.create.messages.required'))
      return
    }
    setLoading(true)
    try {
      await createPerson({
        name: trimmedName,
        displayName: trimmedDisplay,
      })
      navigate(`/people/${encodeURIComponent(trimmedName)}`)
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t('people.create.messages.failed'),
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="page person-page">
      <div className="person-header">
        <div>
          <h1>{t('people.create.title')}</h1>
          <p className="page-note">{t('people.create.subtitle')}</p>
        </div>
        <div className="person-actions">
          <button className="secondary-button" type="button" onClick={() => navigate('/people')}>
            {t('people.backToPeople')}
          </button>
        </div>
      </div>

      {message && <p className="feedback">{message}</p>}
      {!canCreate && (
        <p className="muted-text">{t('people.create.permissionDenied')}</p>
      )}

      <div className="profile-card person-card">
        <header>
          <h2>{t('people.create.basicsTitle')}</h2>
          <p>{t('people.create.basicsDesc')}</p>
        </header>
        <form onSubmit={handleSubmit} className="stacked-form">
          <div className="field">
            <label>{t('people.labels.username')}</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canCreate}
              readOnly={canCreate && !canEdit}
              onFocus={() => {
                if (!canEdit && canCreate) requestReauth()
              }}
              placeholder={t('people.create.usernamePlaceholder')}
            />
          </div>
          <div className="field">
            <label>{t('people.labels.displayName')}</label>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={!canCreate}
              readOnly={canCreate && !canEdit}
              onFocus={() => {
                if (!canEdit && canCreate) requestReauth()
              }}
              placeholder={t('people.create.displayNamePlaceholder')}
            />
          </div>
          <div className="profile-actions">
            <button className="primary-button" type="submit" disabled={!canCreate || loading}>
              {loading ? t('people.create.creating') : t('people.create.submit')}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
