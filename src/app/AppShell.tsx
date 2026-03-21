import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchGroups, fetchServiceAccounts } from '../api'
import { useAuth } from '../auth/AuthContext'
import { AccessProvider, useAccess } from '../auth/AccessContext'
import {
  isAccountPolicyAdmin,
  isAccessControlAdmin,
  isDomainAdmin,
  isGroupAdmin,
  isHighPrivilege,
  isMessageAdmin,
  isMessageSender,
  isServiceAccountAdmin,
} from '../utils/groupAccess'
import { useSiteInfo } from '../site/SiteInfoContext'

function AppShellContent() {
  const { signOut, user } = useAuth()
  const { unlockedMinutes, memberOf } = useAccess()
  const { displayName, imageUrl } = useSiteInfo()
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)

  const highPrivilege = isHighPrivilege(memberOf)
  const canSeeSystem =
    isDomainAdmin(memberOf) ||
    isAccountPolicyAdmin(memberOf) ||
    isMessageAdmin(memberOf) ||
    isMessageSender(memberOf)
  const canSeeGroupsByGroup = isGroupAdmin(memberOf) || isAccessControlAdmin(memberOf)
  const canSeeServiceAccountsByGroup =
    isServiceAccountAdmin(memberOf) || isAccessControlAdmin(memberOf) || isGroupAdmin(memberOf)
  const groupsProbe = useQuery({
    queryKey: ['capability', 'groups-read', user?.uuid ?? 'anonymous'],
    queryFn: fetchGroups,
    enabled: Boolean(user?.uuid) && !canSeeGroupsByGroup,
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 0,
  })
  const serviceAccountsProbe = useQuery({
    queryKey: ['capability', 'service-accounts-read', user?.uuid ?? 'anonymous'],
    queryFn: fetchServiceAccounts,
    enabled: Boolean(user?.uuid) && !canSeeServiceAccountsByGroup,
    staleTime: 60_000,
    gcTime: 300_000,
    retry: 0,
  })
  const canSeeGroups =
    canSeeGroupsByGroup || ((groupsProbe.data?.length ?? 0) > 0)
  const canSeeServiceAccounts =
    canSeeServiceAccountsByGroup || ((serviceAccountsProbe.data?.length ?? 0) > 0)
  const navItems = [
    { to: '/', label: t('shell.navApps') },
    { to: '/profile', label: t('shell.navProfile') },
    { to: '/admin/people', label: t('shell.navPeople') },
    ...(canSeeServiceAccounts
      ? [{ to: '/admin/service-accounts', label: t('shell.navServiceAccounts') }]
      : []),
    ...(canSeeGroups ? [{ to: '/admin/groups', label: t('shell.navGroups') }] : []),
    { to: '/admin/oauth2', label: t('shell.navOauth2') },
    ...(canSeeSystem ? [{ to: '/system', label: t('shell.navSystem') }] : []),
  ]

  return (
    <div className="app-shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-title-wrap">
            {imageUrl && <img src={imageUrl} alt={displayName} className="brand-logo" />}
            <div className="brand-title">{displayName}</div>
          </div>
          <div className="brand-subtitle">{t('shell.subtitle')}</div>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      {menuOpen && (
        <button
          className="nav-overlay"
          type="button"
          aria-label={t('shell.closeMenu')}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="content">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="menu-button"
              type="button"
              aria-label={t('shell.openMenu')}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              ☰
            </button>
            <span>{t('shell.title')}</span>
          </div>
          <div className="topbar-meta">
            <div className="topbar-user">
              <div className="topbar-user-row">
                <span>
                  {user ? `${user.displayName} (${user.name})` : t('shell.sameOrigin')}
                </span>
                {highPrivilege && (
                  <span className="badge badge-warn badge-sharp" title={t('shell.highPrivilegeTip')}>
                    {t('shell.highPrivilege')}
                  </span>
                )}
              </div>
              {unlockedMinutes && (
                <span className="profile-unlock">
                  {t('profile.unlockedEdit', { minutes: unlockedMinutes })}
                </span>
              )}
            </div>
            <button
              className="link-button"
              type="button"
              onClick={() => {
                void signOut()
              }}
            >
              {t('shell.signOut')}
            </button>
          </div>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default function AppShell() {
  return (
    <AccessProvider>
      <AppShellContent />
    </AccessProvider>
  )
}
