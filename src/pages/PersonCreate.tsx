import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  addGroupMembers,
  createCredentialResetToken,
  createPerson,
  fetchGroups,
  fetchPerson,
  setPersonUnix,
} from '../api'
import type { GroupSummary } from '../api/groups'
import { useAccess } from '../auth/AccessContext'
import { useAuth } from '../auth/AuthContext'
import { stripDomain } from '../utils/strings'
import {
  canManageGroupEntry,
  hasAnyGroup,
  isUnixAdmin,
} from '../utils/groupAccess'

export default function PersonCreate() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { canEdit, memberOf, requestReauth } = useAccess()
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [groupMessage, setGroupMessage] = useState<string | null>(null)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [enablePosix, setEnablePosix] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [createdPersonId, setCreatedPersonId] = useState<string | null>(null)
  const [createdPersonName, setCreatedPersonName] = useState<string | null>(null)
  const [resetToken, setResetToken] = useState<{ token: string; expiry_time?: string } | null>(null)
  const [resetMessage, setResetMessage] = useState<string | null>(null)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetCopyTip, setResetCopyTip] = useState(false)

  const canCreate = hasAnyGroup(memberOf, ['idm_people_admins', 'idm_people_on_boarding'])
  const canResetToken = hasAnyGroup(memberOf, [
    'idm_people_admins',
    'idm_people_on_boarding',
    'idm_service_desk',
  ])
  const canManagePosix = isUnixAdmin(memberOf)
  const canManageGroup = useMemo(() => {
    return (group: GroupSummary) => canManageGroupEntry(group.entryManagedBy, user, memberOf)
  }, [memberOf, user])

  useEffect(() => {
    let active = true
    setGroupsLoading(true)
    setGroupMessage(null)
    fetchGroups()
      .then((entries) => {
        if (!active) return
        const manageable = entries.filter((group) => canManageGroup(group))
        setGroups(manageable)
      })
      .catch((error) => {
        if (!active) return
        setGroupMessage(
          error instanceof Error ? error.message : t('people.create.messages.groupLoadFailed'),
        )
      })
      .finally(() => {
        if (!active) return
        setGroupsLoading(false)
      })
    return () => {
      active = false
    }
  }, [canManageGroup, t])

  const handleGenerateResetToken = async (personId: string) => {
    setResetLoading(true)
    setResetMessage(null)
    try {
      const token = await createCredentialResetToken(personId)
      setResetToken(token)
    } catch (error) {
      setResetMessage(
        error instanceof Error ? error.message : t('people.create.messages.resetFailed'),
      )
    } finally {
      setResetLoading(false)
    }
  }

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
      const created = await fetchPerson(trimmedName)
      const personId = created?.uuid ?? trimmedName
      if (enablePosix && canManagePosix) {
        await setPersonUnix(personId, {})
      }
      if (selectedGroups.size > 0) {
        const memberRef = created?.uuid ?? trimmedName
        await Promise.all(
          Array.from(selectedGroups).map((groupId) => addGroupMembers(groupId, [memberRef])),
        )
      }
      void queryClient.invalidateQueries({ queryKey: ['people-list'] })
      if (selectedGroups.size > 0) {
        void queryClient.invalidateQueries({ queryKey: ['groups-list'] })
      }
      setCreatedPersonId(personId)
      setCreatedPersonName(created?.displayName ?? trimmedDisplay)
      if (canResetToken) {
        await handleGenerateResetToken(personId)
      }
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
          <button className="secondary-button" type="button" onClick={() => navigate('/admin/people')}>
            {t('people.backToPeople')}
          </button>
        </div>
      </div>

      {message && <p className="inline-feedback">{message}</p>}
      {!canCreate && (
        <p className="muted-text">{t('people.create.permissionDenied')}</p>
      )}

      {createdPersonId ? (
        <div className="panel-card person-card">
          <header>
            <h2>{t('people.create.successTitle')}</h2>
            <p>{t('people.create.successSubtitle', { name: createdPersonName ?? name })}</p>
          </header>
          {canResetToken && (
            <div className="stacked-form">
              <p>{t('people.create.resetIntro')}</p>
              {resetMessage && <p className="inline-feedback">{resetMessage}</p>}
              {resetToken ? (
                <div className="token-summary">
                  <div className="copy-row">
                    <code>{`${window.location.origin}/reset?token=${resetToken.token}`}</code>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          `${window.location.origin}/reset?token=${resetToken.token}`,
                        )
                        setResetCopyTip(true)
                        window.setTimeout(() => setResetCopyTip(false), 1600)
                      }}
                    >
                      {t('people.create.resetCopy')}
                    </button>
                    {resetCopyTip && <span className="copy-tip">{t('people.create.resetCopied')}</span>}
                  </div>
                  <span className="muted-text">{t('people.create.resetExpires')}</span>
                </div>
              ) : (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    void handleGenerateResetToken(createdPersonId)
                  }}
                  disabled={resetLoading}
                >
                  {resetLoading ? t('people.create.resetCreating') : t('people.create.resetCreate')}
                </button>
              )}
            </div>
          )}
          <div className="panel-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setCreatedPersonId(null)
                setCreatedPersonName(null)
                setResetToken(null)
                setResetMessage(null)
                setName('')
                setDisplayName('')
                setSelectedGroups(new Set())
                setEnablePosix(false)
              }}
            >
              {t('people.create.createAnother')}
            </button>
            <button className="primary-button" type="button" onClick={() => navigate('/admin/people')}>
              {t('people.backToPeople')}
            </button>
          </div>
        </div>
      ) : (
        <div className="panel-card person-card">
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
            {groupsLoading ? (
              <p className="muted-text">{t('people.create.groupLoading')}</p>
            ) : groups.length > 0 ? (
              <div className="field">
                <label>{t('people.create.groupLabel')}</label>
                {groupMessage && <p className="inline-feedback">{groupMessage}</p>}
                <div className="stacked-form">
                  {groups.map((group) => (
                    <label className="checkbox" key={group.uuid}>
                      <input
                        type="checkbox"
                        checked={selectedGroups.has(group.uuid)}
                        onChange={(event) => {
                          const next = new Set(selectedGroups)
                          if (event.target.checked) {
                            next.add(group.uuid)
                          } else {
                            next.delete(group.uuid)
                          }
                          setSelectedGroups(next)
                        }}
                        disabled={!canCreate}
                      />
                      <span>{stripDomain(group.displayName || group.name)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            {canManagePosix && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={enablePosix}
                  onChange={(event) => setEnablePosix(event.target.checked)}
                  disabled={!canCreate}
                />
                <span>{t('people.create.posixToggle')}</span>
              </label>
            )}
            <div className="panel-actions">
              <button className="primary-button" type="submit" disabled={!canCreate || loading}>
                {loading ? t('people.create.creating') : t('people.create.submit')}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
