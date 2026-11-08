import { useEffect, useState } from 'react'
import type { Position } from '../types'

export interface PositionStreamUpdate {
  state: 'connecting' | 'live' | 'reconnecting' | 'syncing'
  positions: Position[] | null
  as_of: string
  snapshot_at: string
  positions_at?: string
  warning?: string
}

// fetch supports authenticated SSE without putting credentials in URLs.
export async function readPositionEvents(
  body: ReadableStream<Uint8Array>,
  onUpdate: (update: PositionStreamUpdate) => void
) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      if (buffer.length > 2_000_000)
        throw new Error('Position stream frame too large')
      let boundary: RegExpExecArray | null
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index)
        buffer = buffer.slice(boundary.index + boundary[0].length)
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (!data) continue
        const update = JSON.parse(data) as PositionStreamUpdate
        if (
          !['connecting', 'live', 'reconnecting', 'syncing'].includes(
            update.state
          ) ||
          (update.positions !== null && !Array.isArray(update.positions))
        ) {
          throw new Error('Invalid position stream frame')
        }
        onUpdate(update)
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

interface StreamState {
  traderId?: string
  token?: string
  connected: boolean
  update?: PositionStreamUpdate
  error?: string
}

export function usePositionStream(traderId?: string, token?: string) {
  const [stream, setStream] = useState<StreamState>({ connected: false })
  useEffect(() => {
    if (!traderId || !token) return
    let disposed = false
    let controller: AbortController | undefined
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let retryWake: (() => void) | undefined
    let delay = 2000
    const fail = (error: string) => {
      if (!disposed)
        setStream((previous) => ({
          ...previous,
          traderId,
          token,
          connected: false,
          error,
        }))
    }
    const reconnect = async () => {
      while (!disposed) {
        controller = new AbortController()
        let lastFrame = Date.now()
        const watchdog = setInterval(() => {
          if (Date.now() - lastFrame > 15000) controller?.abort()
        }, 1000)
        try {
          const response = await fetch(
            `/api/traders/${encodeURIComponent(traderId)}/positions/stream`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'text/event-stream',
              },
              signal: controller.signal,
              cache: 'no-store',
            }
          )
          if (response.status === 401 || response.status === 403) {
            fail(
              response.status === 401
                ? '登录已失效，请重新登录以连接持仓推送。'
                : '当前账户没有此持仓推送的访问权限。'
            )
            return
          }
          if (
            !response.ok ||
            !response.body ||
            !response.headers.get('Content-Type')?.includes('text/event-stream')
          ) {
            throw new Error(
              `推送连接失败（HTTP ${response.status}），正在自动重试。`
            )
          }
          await readPositionEvents(response.body, (update) => {
            lastFrame = Date.now()
            delay = 2000
            if (!disposed)
              setStream({ traderId, token, connected: true, update })
          })
        } catch (error) {
          fail(
            error instanceof Error && error.name !== 'AbortError'
              ? error.message
              : '推送连接超时或中断，正在自动重连。'
          )
          // The polling request remains active and supplies the fallback snapshot.
        } finally {
          clearInterval(watchdog)
          controller.abort()
          if (!disposed)
            setStream((previous) => ({ ...previous, connected: false }))
        }
        if (disposed) return
        await new Promise<void>((resolve) => {
          retryWake = resolve
          retryTimer = setTimeout(resolve, delay)
        })
        delay = Math.min(delay * 2, 30000)
      }
    }
    void reconnect()
    return () => {
      disposed = true
      controller?.abort()
      clearTimeout(retryTimer)
      retryWake?.()
    }
  }, [traderId, token])
  // Prevent an old account's positions from appearing during a trader/token switch.
  return stream.traderId === traderId && stream.token === token
    ? stream
    : { connected: false, update: undefined, error: undefined }
}
