import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { AccessProvider, useAccess } from '../auth/AccessContext'

function AppShellContent() {
  const { signOut, user } = useAuth()
  const { unlockedMinutes, memberOf } = useAccess()
  const { t } = useTranslation()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems = [
    { to: '/', label: 'Apps' },
    { to: '/profile', label: t('shell.navProfile') },
    { to: '/people', label: t('shell.navPeople') },
    { to: '/service-accounts', label: t('shell.navServiceAccounts') },
    { to: '/groups', label: 'Groups' },
    { to: '/oauth2', label: 'OAuth2 Clients' },
    { to: '/system', label: 'System' },
  ]

  const isHighPrivilege = memberOf.some(
    (group) => group.split('@')[0]?.toLowerCase() === 'idm_high_privilege',
  )

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="app-shell">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <div className="brand-title">Kanidm WebUI NG</div>
          <div className="brand-subtitle">{t('shell.subtitle')}</div>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
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
                {isHighPrivilege && (
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
