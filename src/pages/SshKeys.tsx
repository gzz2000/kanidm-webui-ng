import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addSshPublicKey, deleteSshPublicKey, fetchSshPublicKeys } from '../api'
import type { SshPublicKey } from '../api/ssh'
import { useAuth } from '../auth/AuthContext'
import { useAccess } from '../auth/AccessContext'

function parseKeyType(value: string) {
  return value.trim().split(/\s+/)[0] ?? ''
}

export default function SshKeys() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { canEdit, permissions, requestReauth } = useAccess()

  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [keys, setKeys] = useState<SshPublicKey[]>([])
  const [label, setLabel] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deletingLabel, setDeletingLabel] = useState<string | null>(null)
  const [confirmLabel, setConfirmLabel] = useState<string | null>(null)
  const loadRef = useRef(false)

  const canManage = permissions.selfWriteAllowed

  const requestReauthIfNeeded = () => {
    if (!canEdit && permissions.selfWriteAllowed) {
      requestReauth()
    }
  }

  const loadKeys = async (personId: string, showLoading: boolean) => {
    if (showLoading) {
      setLoading(true)
    }
    try {
      const result = await fetchSshPublicKeys(personId)
      setKeys(result)
      return true
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t('ssh.messageLoadFailed'),
      )
      return false
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (loadRef.current) return
    if (!user?.uuid) return
    loadRef.current = true
    setMessage(null)
    void loadKeys(user.uuid, true)
  }, [user?.uuid])

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault()
    if (!user?.uuid) return
    if (!canManage) {
      setMessage(t('ssh.permissionDenied'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    const nextLabel = label.trim()
    const nextKey = publicKey.trim()
    if (!nextLabel) {
      setMessage(t('ssh.messageLabelRequired'))
      return
    }
    if (!nextKey) {
      setMessage(t('ssh.messageKeyRequired'))
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      await addSshPublicKey(user.uuid, nextLabel, nextKey)
      setLabel('')
      setPublicKey('')
      const refreshed = await loadKeys(user.uuid, false)
      if (refreshed) {
        setMessage(t('ssh.messageAdded'))
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t('ssh.messageAddFailed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (tag: string) => {
    if (!user?.uuid) return
    if (!canManage) {
      setMessage(t('ssh.permissionDenied'))
      return
    }
    if (!canEdit) {
      requestReauth()
      return
    }
    setDeletingLabel(tag)
    setMessage(null)
    try {
      await deleteSshPublicKey(user.uuid, tag)
      const refreshed = await loadKeys(user.uuid, false)
      if (refreshed) {
        setMessage(t('ssh.messageRemoved'))
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t('ssh.messageDeleteFailed'),
      )
    } finally {
      setDeletingLabel(null)
      setConfirmLabel(null)
    }
  }

  if (loading) {
    return (
      <section className="page profile-page">
        <h1>{t('ssh.title')}</h1>
        <p className="page-note">{t('ssh.loading')}</p>
      </section>
    )
  }

  return (
    <section className="page profile-page">
      <div className="profile-header">
        <div>
          <h1>{t('ssh.title')}</h1>
          <p className="page-note">{t('ssh.subtitle')}</p>
        </div>
      </div>

      {message && <p className="feedback">{message}</p>}

      <div className="profile-grid">
        <section className="profile-card ssh-add-card">
          <header>
            <h2>{t('ssh.addTitle')}</h2>
            <p>{t('ssh.addDesc')}</p>
          </header>
          {!canManage && <p className="muted-text">{t('ssh.permissionDenied')}</p>}
          <form className="ssh-form" onSubmit={handleAdd}>
            <label className="field">
              <span>{t('ssh.labelLabel')}</span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={t('ssh.labelPlaceholder')}
                disabled={!canManage}
                readOnly={!canEdit && canManage}
                onFocus={requestReauthIfNeeded}
                onClick={requestReauthIfNeeded}
              />
            </label>
            <label className="field">
              <span>{t('ssh.keyLabel')}</span>
              <textarea
                value={publicKey}
                onChange={(event) => setPublicKey(event.target.value)}
                placeholder={t('ssh.keyPlaceholder')}
                disabled={!canManage}
                readOnly={!canEdit && canManage}
                onFocus={requestReauthIfNeeded}
                onClick={requestReauthIfNeeded}
              />
            </label>
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={!canManage || submitting}>
                {submitting ? t('ssh.adding') : t('ssh.add')}
              </button>
            </div>
          </form>
        </section>

        <section className="profile-card">
          <header>
            <h2>{t('ssh.listTitle')}</h2>
            <p>{t('ssh.listDesc')}</p>
          </header>

          {keys.length === 0 ? (
            <p className="muted-text">{t('ssh.empty')}</p>
          ) : (
            <div className="ssh-list">
              {keys.map((key) => (
                <div className="ssh-key-card" key={key.label}>
                  <div className="ssh-key-header">
                    <div>
                      <strong>{key.label}</strong>
                      <span className="ssh-key-type">{parseKeyType(key.value)}</span>
                    </div>
                    {confirmLabel === key.label ? (
                      <div className="ssh-confirm">
                        <span className="muted-text">
                          {t('ssh.removeConfirm', { label: key.label })}
                        </span>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => {
                            void handleDelete(key.label)
                          }}
                          disabled={!canManage || deletingLabel === key.label}
                        >
                          {t('ssh.remove')}
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => setConfirmLabel(null)}
                          disabled={deletingLabel === key.label}
                        >
                          {t('ssh.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setConfirmLabel(key.label)}
                        disabled={!canManage}
                      >
                        {t('ssh.remove')}
                      </button>
                    )}
                  </div>
                  <div className="ssh-key-value">{key.value}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
