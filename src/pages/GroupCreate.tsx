import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { createGroup } from '../api'
import { useAccess } from '../auth/AccessContext'
import { useAuth } from '../auth/AuthContext'
import AccountGroupSelect from '../components/AccountGroupSelect'
import { applyDomain, extractDomainSuffix } from '../utils/strings'
import { isAccessControlAdmin, isGroupAdmin } from '../utils/groupAccess'

export default function GroupCreate() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { canEdit, memberOf, requestReauth } = useAccess()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [entryManagedBy, setEntryManagedBy] = useState(user?.name ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user && !entryManagedBy) {
      setEntryManagedBy(user.name)
    }
  }, [entryManagedBy, user])

  const canCreate = useMemo(() => isGroupAdmin(memberOf), [memberOf])
  const isAccessAdmin = useMemo(() => isAccessControlAdmin(memberOf), [memberOf])
  const domainSuffix = useMemo(
    () => extractDomainSuffix(memberOf),
    [memberOf],
  )

  const requestReauthIfNeeded = () => {
    if (!canEdit && canCreate) {
      requestReauth()
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canCreate) return
    if (!canEdit) {
      requestReauth()
      return
    }
    const trimmedName = name.trim()
    if (!trimmedName) {
      setMessage(t('groups.create.messages.required'))
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      await createGroup({
        name: trimmedName,
        entryManagedBy: applyDomain(entryManagedBy.trim(), domainSuffix) || undefined,
      })
      void queryClient.invalidateQueries({ queryKey: ['groups-list'] })
      navigate(`/admin/groups/${encodeURIComponent(trimmedName)}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('groups.create.messages.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="page groups-page">
      <div className="groups-header">
        <div>
          <h1>{t('groups.create.title')}</h1>
          <p className="page-note">{t('groups.create.subtitle')}</p>
        </div>
        <div className="groups-actions">
          <button className="secondary-button" type="button" onClick={() => navigate('/admin/groups')}>
            {t('groups.backToList')}
          </button>
        </div>
      </div>

      {message && <p className="inline-feedback">{message}</p>}
      {!canCreate && (
        <p className="muted-text">{t('groups.create.permissionDenied')}</p>
      )}

      <div className="panel-card">
        <header>
          <h2>{t('groups.create.basicsTitle')}</h2>
          <p>{t('groups.create.basicsDesc')}</p>
        </header>
        <form onSubmit={handleSubmit} className="stacked-form">
          <div className="field">
            <label>{t('groups.create.groupName')}</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canCreate}
              readOnly={canCreate && !canEdit}
              onFocus={requestReauthIfNeeded}
              placeholder={t('groups.create.namePlaceholder')}
            />
          </div>
          <div className="field">
            <label>{t('groups.create.entryManagedBy')}</label>
            <AccountGroupSelect
              value={entryManagedBy}
              disabled={!canCreate}
              readOnly={canCreate && !canEdit}
              includePeople
              includeGroups
              onFocus={requestReauthIfNeeded}
              onChange={setEntryManagedBy}
            />
            {!isAccessAdmin && (
              <p className="muted-text">{t('groups.create.entryManagerTip')}</p>
            )}
          </div>
          <div className="panel-actions">
            <button className="primary-button" type="submit" disabled={!canCreate || loading}>
              {loading ? t('groups.create.creating') : t('groups.create.submit')}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
