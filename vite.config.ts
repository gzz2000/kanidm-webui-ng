import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/v1': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
      },
      '/scim': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
      },
      '/oauth2': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
        bypass(req) {
          const accept = req.headers.accept ?? ''
          if (accept.includes('text/html')) {
            return req.url
          }
          return undefined
        },
      },
      '/docs': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
      },
      '/ui': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
      },
      '/pkg': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
      },
      '/robots.txt': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
      },
      '/manifest.webmanifest': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
