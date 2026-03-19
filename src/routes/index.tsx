import { createBrowserRouter } from 'react-router-dom'
import AppShell from '../app/AppShell'
import ProtectedLayout from '../auth/ProtectedLayout'
import Apps from '../pages/Apps'
import GroupCreate from '../pages/GroupCreate'
import GroupDetail from '../pages/GroupDetail'
import Groups from '../pages/Groups'
import Login from '../pages/Login'
import Oauth2ClientCreate from '../pages/Oauth2ClientCreate'
import Oauth2ClientDetail from '../pages/Oauth2ClientDetail'
import Oauth2Clients from '../pages/Oauth2Clients'
import Oauth2Authorise from '../pages/Oauth2Authorise'
import Oauth2Consent from '../pages/Oauth2Consent'
import Oauth2Resume from '../pages/Oauth2Resume'
import People from '../pages/People'
import PersonCreate from '../pages/PersonCreate'
import PersonDetail from '../pages/PersonDetail'
import Profile from '../pages/Profile'
import ResetCredentials from '../pages/ResetCredentials'
import ServiceAccounts from '../pages/ServiceAccounts'
import ServiceAccountCreate from '../pages/ServiceAccountCreate'
import ServiceAccountDetail from '../pages/ServiceAccountDetail'
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
    path: '/oauth2/authorise',
    element: <Oauth2Authorise />,
  },
  {
    path: '/oauth2/consent',
    element: <Oauth2Consent />,
  },
  {
    path: '/oauth2/resume',
    element: <Oauth2Resume />,
  },
  {
    path: '/',
    element: (
      <ProtectedLayout>
        <AppShell />
      </ProtectedLayout>
    ),
    children: [
      { index: true, element: <Apps /> },
      { path: 'admin/people', element: <People /> },
      { path: 'admin/people/new', element: <PersonCreate /> },
      { path: 'admin/people/:id', element: <PersonDetail /> },
      { path: 'admin/groups', element: <Groups /> },
      { path: 'admin/groups/new', element: <GroupCreate /> },
      { path: 'admin/groups/:id', element: <GroupDetail /> },
      { path: 'admin/service-accounts', element: <ServiceAccounts /> },
      { path: 'admin/service-accounts/new', element: <ServiceAccountCreate /> },
      { path: 'admin/service-accounts/:id', element: <ServiceAccountDetail /> },
      { path: 'admin/oauth2', element: <Oauth2Clients /> },
      { path: 'admin/oauth2/new', element: <Oauth2ClientCreate /> },
      { path: 'admin/oauth2/:id', element: <Oauth2ClientDetail /> },
      { path: 'profile', element: <Profile /> },
      { path: 'system', element: <System /> },
    ],
  },
])
