import { defineSecret } from 'firebase-functions/params'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { logger, setGlobalOptions } from 'firebase-functions/v2'

setGlobalOptions({ region: 'asia-east1', maxInstances: 10 })

const TDX_CLIENT_ID = defineSecret('TDX_CLIENT_ID')
const TDX_CLIENT_SECRET = defineSecret('TDX_CLIENT_SECRET')

const TDX_BASE = 'https://tdx.transportdata.tw/api/basic/v2'
const TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token'

// Per-instance in-memory cache. TDX tokens are valid 24h; instances live longer than a single request.
let tokenCache: { value: string; expiresAt: number } | null = null

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.value
  }
  const res = await fetch(TDX_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    logger.error('TDX token fetch failed', { status: res.status, body: text.slice(0, 300) })
    throw new HttpsError('internal', `TDX token error ${res.status}`)
  }
  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return data.access_token
}

type TdxRequest = {
  path?: string
  query?: Record<string, string | number>
}

// Allow only these path roots — defence in depth against open-proxy abuse.
const ALLOWED_PREFIXES = ['Bus/', 'Basic/v2/Bus/']

export const tdxProxy = onCall(
  { secrets: [TDX_CLIENT_ID, TDX_CLIENT_SECRET] },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', '需要登入後才能查公車資料')
    }
    const { path, query } = (req.data || {}) as TdxRequest
    if (!path || typeof path !== 'string') {
      throw new HttpsError('invalid-argument', 'path 必填')
    }
    if (path.startsWith('/') || path.includes('..') || path.includes('//')) {
      throw new HttpsError('invalid-argument', 'path 含非法字元')
    }
    if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
      throw new HttpsError('invalid-argument', `path 必須以 ${ALLOWED_PREFIXES.join(' / ')} 開頭`)
    }

    const token = await getAccessToken(TDX_CLIENT_ID.value(), TDX_CLIENT_SECRET.value())
    const url = new URL(`${TDX_BASE}/${path}`)
    if (query && typeof query === 'object') {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
      }
    }
    if (!url.searchParams.has('$format')) url.searchParams.set('$format', 'JSON')

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) {
      // Token rejected — clear cache so next call re-mints.
      tokenCache = null
      throw new HttpsError('internal', 'TDX 拒絕 token，已重置快取，請重試')
    }
    if (!res.ok) {
      const text = await res.text()
      logger.error('TDX API failed', { url: url.toString(), status: res.status, body: text.slice(0, 300) })
      throw new HttpsError('internal', `TDX 回應 ${res.status}`)
    }
    return await res.json()
  }
)
