import { createBrowserRouter } from 'react-router-dom'
import AppShell from '../app/AppShell'
import ProtectedLayout from '../auth/ProtectedLayout'
import Apps from '../pages/Apps'
import Groups from '../pages/Groups'
import Login from '../pages/Login'
import Overview from '../pages/Overview'
import Oauth2Clients from '../pages/Oauth2Clients'
import People from '../pages/People'
import PersonCreate from '../pages/PersonCreate'
import PersonDetail from '../pages/PersonDetail'
import Profile from '../pages/Profile'
import ResetCredentials from '../pages/ResetCredentials'
import ServiceAccounts from '../pages/ServiceAccounts'
import SshKeys from '../pages/SshKeys'
import System from '../pages/System'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/reset',
    element: <ResetCredentials />,
  },
  {
    path: '/',
    element: (
      <ProtectedLayout>
        <AppShell />
      </ProtectedLayout>
    ),
    children: [
      { index: true, element: <Overview /> },
      { path: 'people', element: <People /> },
      { path: 'people/new', element: <PersonCreate /> },
      { path: 'people/:id', element: <PersonDetail /> },
      { path: 'groups', element: <Groups /> },
      { path: 'service-accounts', element: <ServiceAccounts /> },
      { path: 'oauth2', element: <Oauth2Clients /> },
      { path: 'ssh-keys', element: <SshKeys /> },
      { path: 'apps', element: <Apps /> },
      { path: 'profile', element: <Profile /> },
      { path: 'system', element: <System /> },
    ],
  },
])
