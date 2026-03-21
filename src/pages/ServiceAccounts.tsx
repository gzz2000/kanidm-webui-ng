import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchServiceAccounts } from '../api'
import type { ServiceAccountSummary } from '../api/serviceAccounts'
import { useAccess } from '../auth/AccessContext'
import { useAuth } from '../auth/AuthContext'
import {
  canManageServiceAccountEntry,
  isHighPrivilege,
  isServiceAccountAdmin,
} from '../utils/groupAccess'

export default function ServiceAccounts() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { memberOf } = useAccess()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [hideUnmanaged, setHideUnmanaged] = useState(true)
  const accountsQuery = useQuery({
    queryKey: ['service-accounts-list'],
    queryFn: fetchServiceAccounts,
    staleTime: 30_000,
    gcTime: 300_000,
    retry: 0,
  })
  const accounts: ServiceAccountSummary[] = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data])
  const loading = accountsQuery.isPending
  const message = accountsQuery.isError
    ? accountsQuery.error instanceof Error
      ? accountsQuery.error.message
      : t('serviceAccounts.messages.listFailed')
    : null

  const isAdmin = useMemo(() => isServiceAccountAdmin(memberOf), [memberOf])
  const canCreate = isAdmin
  const canManageAccount = useMemo(() => {
    return (account: ServiceAccountSummary) =>
      canManageServiceAccountEntry(account.entryManagedBy, user, memberOf)
  }, [memberOf, user])

  const filteredAccounts = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = accounts.filter((account) => {
      if (account.displayName.toLowerCase().includes(needle)) return true
      if (account.name.toLowerCase().includes(needle)) return true
      if (account.emails.some((email) => email.toLowerCase().includes(needle))) return true
      return false
    })
    if (!hideUnmanaged) return filtered
    return filtered.filter((account) => canManageAccount(account))
  }, [accounts, canManageAccount, hideUnmanaged, query])

  return (
    <section className="page service-accounts-page management-list-page">
      <div className="management-list-header">
        <div>
          <h1>{t('serviceAccounts.title')}</h1>
          <p className="page-note">{t('serviceAccounts.subtitle')}</p>
        </div>
        {canCreate && (
          <div className="management-list-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => navigate('/admin/service-accounts/new')}
            >
              {t('serviceAccounts.createCta')}
            </button>
          </div>
        )}
      </div>

      <div className="management-list-toolbar">
        <input
          className="management-list-search"
          type="search"
          value={query}
          placeholder={t('serviceAccounts.searchPlaceholder')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!isAdmin && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={hideUnmanaged}
              onChange={(event) => setHideUnmanaged(event.target.checked)}
            />
            <span>{t('serviceAccounts.hideUnmanaged')}</span>
          </label>
        )}
      </div>

      {message && <p className="inline-feedback">{message}</p>}

      {loading ? (
        <p className="page-note">{t('serviceAccounts.loading')}</p>
      ) : (
        <div className="management-list">
          {filteredAccounts.length === 0 ? (
            <p className="muted-text">{t('serviceAccounts.empty')}</p>
          ) : (
            filteredAccounts.map((account) => (
              <button
                className="management-list-row"
                key={account.uuid}
                type="button"
                onClick={() => navigate(`/admin/service-accounts/${account.uuid}`)}
              >
                <div>
                  <div className="management-list-name">
                    <span>{account.displayName}</span>
                    {isHighPrivilege(account.memberOf) && (
                      <span className="badge badge-warn badge-sharp" title={t('shell.highPrivilegeTip')}>
                        {t('shell.highPrivilege')}
                      </span>
                    )}
                  </div>
                  <div className="management-list-meta">
                    <span>{account.name}</span>
                    <span>{account.uuid}</span>
                  </div>
                </div>
                <div className="management-list-cell">
                  {account.emails.length > 0
                    ? account.emails.join(', ')
                    : t('serviceAccounts.noEmail')}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </section>
  )
}
