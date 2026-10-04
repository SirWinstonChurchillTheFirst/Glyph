import https from 'node:https'
import type { LcuCredentials } from './credentials'

/** `status` is 0 when the client could not be reached at all. */
export class LcuError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

// The LCU serves a certificate signed by Riot's private root CA. This agent is only ever
// used for 127.0.0.1, so skipping verification does not expose anything to the network.
const agent = new https.Agent({ keepAlive: true, maxSockets: 2, rejectUnauthorized: false })

export function lcuRequest<T>(
  credentials: LcuCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const request = https.request(
      {
        host: '127.0.0.1',
        port: credentials.port,
        path,
        method,
        agent,
        timeout: 4000,
        headers: {
          Accept: 'application/json',
          Authorization: 'Basic ' + Buffer.from(`riot:${credentials.password}`).toString('base64'),
          ...(payload ? { 'Content-Type': 'application/json' } : {})
        }
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => (text += chunk))
        response.on('end', () => {
          let json: unknown
          try {
            json = text ? JSON.parse(text) : undefined
          } catch {
            json = undefined
          }
          const status = response.statusCode ?? 0
          if (status >= 200 && status < 300) return resolve(json as T)
          const message = (json as { message?: string } | undefined)?.message
          reject(new LcuError(status, message ?? `HTTP ${status}`))
        })
      }
    )
    request.on('timeout', () => request.destroy(new Error('timeout')))
    request.on('error', (error) => reject(new LcuError(0, error.message)))
    request.end(payload)
  })
}
