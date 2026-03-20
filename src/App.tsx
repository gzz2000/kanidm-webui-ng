import './App.css'
import { RouterProvider } from 'react-router-dom'
import { router } from './routes'
import { SiteInfoProvider } from './site/SiteInfoContext'

function App() {
  return (
    <SiteInfoProvider>
      <RouterProvider router={router} />
    </SiteInfoProvider>
  )
}

export default App
