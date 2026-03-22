import https from 'node:https'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const upstreamBase = 'https://localhost:8443'
const discoveryPathPattern = /^\/oauth2\/openid\/[^/]+\/\.well-known\/openid-configuration$/

function fetchUpstreamText(url: URL) {
  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: 'GET',
        rejectUnauthorized: false,
        headers: {
          accept: 'application/json',
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 502,
            body: Buffer.concat(chunks).toString('utf-8'),
          })
        })
      },
    )
    request.on('error', reject)
    request.end()
  })
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'kanidm-openid-discovery-rewrite',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url?.split('?')[0] ?? ''
          if (req.method !== 'GET' || !discoveryPathPattern.test(url)) {
            next()
            return
          }

          try {
            const upstreamUrl = new URL(req.url ?? '', upstreamBase)
            const upstreamResponse = await fetchUpstreamText(upstreamUrl)
            const bodyText = upstreamResponse.body
            if (upstreamResponse.statusCode < 200 || upstreamResponse.statusCode >= 300) {
              res.statusCode = upstreamResponse.statusCode
              res.end(bodyText)
              return
            }

            const payload = JSON.parse(bodyText) as Record<string, unknown>
            if (typeof payload.authorization_endpoint === 'string') {
              payload.authorization_endpoint = payload.authorization_endpoint.replace(
                '/ui/oauth2',
                '/oauth2-ui/authorise',
              )
            }

            res.statusCode = 200
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify(payload))
          } catch (error) {
            res.statusCode = 502
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'discovery rewrite failed',
              }),
            )
          }
        })
      },
    },
  ],
  server: {
    proxy: {
      '/v1': {
        target: upstreamBase,
        changeOrigin: true,
        secure: false,
      },
      '/scim': {
        target: upstreamBase,
        changeOrigin: true,
        secure: false,
      },
      '/oauth2/': {
        target: upstreamBase,
        changeOrigin: true,
        secure: false,
      },
      '/docs': {
        target: upstreamBase,
        changeOrigin: true,
        secure: false,
      },
      '/ui': {
        target: upstreamBase,
        changeOrigin: true,
        secure: false,
      },
      '/pkg': {
        target: upstreamBase,
        changeOrigin: true,
        secure: false,
      },
      '/robots.txt': {
        target: upstreamBase,
        changeOrigin: true,
        secure: false,
      },
      '/manifest.webmanifest': {
        target: upstreamBase,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
