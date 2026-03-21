import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { createServiceAccount } from '../api'
import { useAccess } from '../auth/AccessContext'
import { useAuth } from '../auth/AuthContext'
import AccountGroupSelect from '../components/AccountGroupSelect'
import { applyDomain, extractDomainSuffix } from '../utils/strings'
import { isServiceAccountAdmin } from '../utils/groupAccess'

export default function ServiceAccountCreate() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { canEdit, memberOf, requestReauth } = useAccess()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [entryManagedBy, setEntryManagedBy] = useState(user?.name ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (user && !entryManagedBy) {
      setEntryManagedBy(user.name)
    }
  }, [entryManagedBy, user])

  const canCreate = useMemo(() => isServiceAccountAdmin(memberOf), [memberOf])
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
    const trimmedDisplay = displayName.trim()
    if (!trimmedName || !trimmedDisplay) {
      setMessage(t('serviceAccounts.create.messages.required'))
      return
    }
    if (!entryManagedBy) {
      setMessage(t('serviceAccounts.create.messages.entryManagerRequired'))
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      await createServiceAccount({
        name: trimmedName,
        displayName: trimmedDisplay,
        entryManagedBy: applyDomain(entryManagedBy.trim(), domainSuffix),
        description: description.trim() || undefined,
      })
      void queryClient.invalidateQueries({ queryKey: ['service-accounts-list'] })
      navigate(`/admin/service-accounts/${encodeURIComponent(trimmedName)}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('serviceAccounts.create.messages.failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="page service-account-page">
      <div className="service-account-header">
        <div>
          <h1>{t('serviceAccounts.create.title')}</h1>
          <p className="page-note">{t('serviceAccounts.create.subtitle')}</p>
        </div>
        <div className="service-account-actions">
          <button className="secondary-button" type="button" onClick={() => navigate('/admin/service-accounts')}>
            {t('serviceAccounts.backToList')}
          </button>
        </div>
      </div>

      {message && <p className="inline-feedback">{message}</p>}
      {!canCreate && (
        <p className="muted-text">{t('serviceAccounts.create.permissionDenied')}</p>
      )}

      <div className="panel-card service-account-card">
        <header>
          <h2>{t('serviceAccounts.create.basicsTitle')}</h2>
          <p>{t('serviceAccounts.create.basicsDesc')}</p>
        </header>
        <form onSubmit={handleSubmit} className="stacked-form">
          <div className="field">
            <label>{t('serviceAccounts.create.accountName')}</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canCreate}
              readOnly={canCreate && !canEdit}
              onFocus={requestReauthIfNeeded}
              placeholder={t('serviceAccounts.create.namePlaceholder')}
            />
          </div>
          <div className="field">
            <label>{t('serviceAccounts.create.displayName')}</label>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={!canCreate}
              readOnly={canCreate && !canEdit}
              onFocus={requestReauthIfNeeded}
              placeholder={t('serviceAccounts.create.displayNamePlaceholder')}
            />
          </div>
          <div className="field">
            <label>{t('serviceAccounts.create.entryManagedBy')}</label>
            <AccountGroupSelect
              value={entryManagedBy}
              disabled={!canCreate}
              readOnly={canCreate && !canEdit}
              includePeople
              includeGroups
              includeServiceAccounts
              onFocus={requestReauthIfNeeded}
              onChange={setEntryManagedBy}
            />
          </div>
          <div className="field">
            <label>{t('serviceAccounts.create.description')}</label>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value.replace(/[\r\n]+/g, ' '))}
              disabled={!canCreate}
              readOnly={canCreate && !canEdit}
              onFocus={requestReauthIfNeeded}
              placeholder={t('serviceAccounts.create.descriptionPlaceholder')}
            />
          </div>
          <div className="panel-actions">
            <button className="primary-button" type="submit" disabled={!canCreate || loading}>
              {loading ? t('serviceAccounts.create.creating') : t('serviceAccounts.create.submit')}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
