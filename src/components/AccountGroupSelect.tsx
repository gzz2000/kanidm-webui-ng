import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchGroups, fetchPeople, fetchServiceAccounts } from '../api'
import type { GroupSummary } from '../api/groups'
import type { PersonSummary } from '../api/people'
import type { ServiceAccountSummary } from '../api/serviceAccounts'

export type AccountGroupOption = {
  uuid: string
  name: string
  displayName: string
  kind: 'person' | 'group' | 'service-account'
}

type AccountGroupSelectProps = {
  value: string
  disabled?: boolean
  readOnly?: boolean
  placeholder?: string
  includePeople?: boolean
  includeGroups?: boolean
  includeServiceAccounts?: boolean
  formatValue?: (option: AccountGroupOption) => string
  onChange: (value: string) => void
  onFocus?: () => void
}

function buildLabel(option: AccountGroupOption) {
  const suffix =
    option.kind === 'group'
      ? 'Group'
      : option.kind === 'service-account'
        ? 'Service account'
        : 'Person'
  return `${option.displayName} (${option.name}) · ${suffix}`
}

function matchesOption(option: AccountGroupOption, needle: string) {
  const query = needle.trim().toLowerCase()
  if (!query) return true
  const nameQuery = query.includes('@') ? query.split('@')[0] ?? query : query
  if (nameQuery && option.name.toLowerCase().includes(nameQuery)) return true
  if (option.name.toLowerCase().includes(query)) return true
  if (option.displayName.toLowerCase().includes(query)) return true
  if (option.uuid.toLowerCase().includes(query)) return true
  return false
}

function toPersonOption(entry: PersonSummary): AccountGroupOption {
  return {
    uuid: entry.uuid,
    name: entry.name,
    displayName: entry.displayName,
    kind: 'person',
  }
}

function toGroupOption(entry: GroupSummary): AccountGroupOption {
  return {
    uuid: entry.uuid,
    name: entry.name,
    displayName: entry.displayName,
    kind: 'group',
  }
}

function toServiceAccountOption(entry: ServiceAccountSummary): AccountGroupOption {
  return {
    uuid: entry.uuid,
    name: entry.name,
    displayName: entry.displayName,
    kind: 'service-account',
  }
}

export default function AccountGroupSelect({
  value,
  disabled = false,
  readOnly = false,
  placeholder,
  includePeople = true,
  includeGroups = true,
  includeServiceAccounts = false,
  formatValue,
  onChange,
  onFocus,
}: AccountGroupSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const optionsQuery = useQuery({
    queryKey: ['account-group-select', includePeople, includeGroups, includeServiceAccounts],
    queryFn: async () => {
      const tasks: Promise<AccountGroupOption[]>[] = []
      if (includePeople) {
        tasks.push(fetchPeople().then((entries) => entries.map(toPersonOption)))
      }
      if (includeGroups) {
        tasks.push(fetchGroups().then((entries) => entries.map(toGroupOption)))
      }
      if (includeServiceAccounts) {
        tasks.push(fetchServiceAccounts().then((entries) => entries.map(toServiceAccountOption)))
      }
      const lists = await Promise.all(tasks)
      const map = new Map(lists.flat().map((entry) => [entry.uuid, entry]))
      return Array.from(map.values())
    },
    enabled: open && (includePeople || includeGroups || includeServiceAccounts),
    staleTime: 300_000,
    gcTime: 900_000,
    retry: 0,
  })
  const options = useMemo(() => optionsQuery.data ?? [], [optionsQuery.data])
  const loading = open && optionsQuery.isFetching

  const filtered = useMemo(
    () => options.filter((option) => matchesOption(option, query)),
    [options, query],
  )

  const handleSelect = (option: AccountGroupOption) => {
    if (readOnly) return
    const nextValue = formatValue ? formatValue(option) : option.name
    onChange(nextValue)
    setOpen(false)
  }

  const handleBlur = () => {
    window.setTimeout(() => setOpen(false), 150)
  }

  const resolvedPlaceholder =
    placeholder ?? t('selector.accountGroupPlaceholder')
  const kindLabel = (option: AccountGroupOption) => {
    if (option.kind === 'group') return t('selector.group')
    if (option.kind === 'service-account') return t('selector.serviceAccount')
    return t('selector.person')
  }

  return (
    <div className="entry-manager-picker">
      <input
        className="entry-manager-input"
        value={open ? query : value}
        onChange={(event) => {
          if (readOnly) return
          const next = event.target.value
          setQuery(next)
          if (!open) onChange(next)
        }}
        onFocus={() => {
          onFocus?.()
          if (!readOnly && !disabled) {
            setOpen(true)
            setQuery(value)
          }
        }}
        onClick={() => {
          onFocus?.()
          if (!readOnly && !disabled) {
            setOpen(true)
            setQuery(value)
          }
        }}
        onBlur={handleBlur}
        placeholder={loading ? t('selector.loading') : resolvedPlaceholder}
        disabled={disabled}
        readOnly={readOnly}
      />
      {open && !disabled && !readOnly && (
        <div className="entry-manager-list">
          {loading ? (
            <div className="entry-manager-empty">{t('selector.loading')}</div>
          ) : filtered.length === 0 ? (
            <div className="entry-manager-empty">{t('selector.empty')}</div>
          ) : (
            filtered.map((option) => (
              <button
                key={option.uuid}
                type="button"
                className="entry-manager-item"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(option)}
                title={buildLabel(option)}
              >
                <span className="entry-manager-title">{option.displayName}</span>
                <span className="entry-manager-meta">
                  {option.name} · {kindLabel(option)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
