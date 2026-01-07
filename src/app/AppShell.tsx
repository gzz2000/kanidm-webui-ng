import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/people', label: 'People' },
  { to: '/groups', label: 'Groups' },
  { to: '/service-accounts', label: 'Service Accounts' },
  { to: '/oauth2', label: 'OAuth2 Clients' },
  { to: '/delegated-admin', label: 'Delegated Admin' },
  { to: '/posix', label: 'POSIX' },
  { to: '/ssh-keys', label: 'SSH Keys' },
  { to: '/apps', label: 'Apps' },
  { to: '/profile', label: 'My Profile' },
  { to: '/system', label: 'System' },
]

export default function AppShell() {
  const { signOut, user } = useAuth()
  const { t } = useTranslation()

  return (
    <div className="app-shell">
      <aside className="sidebar">
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
      <div className="content">
        <header className="topbar">
          <div className="topbar-title">{t('shell.title')}</div>
          <div className="topbar-meta">
            <span>
              {user ? `${user.displayName} (${user.name})` : t('shell.sameOrigin')}
            </span>
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
