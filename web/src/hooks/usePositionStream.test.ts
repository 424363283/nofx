// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { readPositionEvents, usePositionStream } from './usePositionStream'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const encoder = new TextEncoder()
const update = (symbol: string) => ({
  state: 'live',
  positions: [{ symbol }],
  as_of: '2026-11-08T12:00:00Z',
  snapshot_at: '2026-11-08T12:00:00Z',
  warning: '连接状态',
})
const frame = (symbol: string) =>
  encoder.encode(`data: ${JSON.stringify(update(symbol))}\n\n`)

it('decodes split UTF-8 SSE frames, CRLF and empty position snapshots', async () => {
  const bytes = encoder.encode(
    `: heartbeat\r\n\r\ndata: ${JSON.stringify(update('BTCUSDT'))}\r\n\r\ndata: ${JSON.stringify({ ...update(''), positions: [] })}\n\n`
  )
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 7)
        controller.enqueue(bytes.slice(i, i + 7))
      controller.close()
    },
  })
  const receive = vi.fn()
  await readPositionEvents(stream, receive)
  expect(receive).toHaveBeenCalledTimes(2)
  expect(receive.mock.calls[0][0]).toEqual(update('BTCUSDT'))
  expect(receive.mock.calls[1][0].positions).toEqual([])
})

it('authenticates by header and clears data on trader switch and logout', async () => {
  const connections: {
    controller: ReadableStreamDefaultController<Uint8Array>
    signal: AbortSignal
  }[] = []
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        const signal = options.signal as AbortSignal
        connections.push({ controller, signal })
        signal.addEventListener('abort', () => controller.close(), {
          once: true,
        })
      },
    }),
  }))
  vi.stubGlobal('fetch', fetcher)
  const { result, rerender } = renderHook(
    ({ id, token }) => usePositionStream(id, token),
    { initialProps: { id: 'a', token: 'private-token' as string | undefined } }
  )
  await waitFor(() => expect(connections).toHaveLength(1))
  await act(async () => {
    connections[0].controller.enqueue(frame('BTCUSDT'))
  })
  await waitFor(() =>
    expect(result.current.update?.positions?.[0].symbol).toBe('BTCUSDT')
  )
  expect(fetcher.mock.calls[0][0]).toBe('/api/traders/a/positions/stream')
  expect(fetcher.mock.calls[0][1].headers).toEqual({
    Authorization: 'Bearer private-token',
    Accept: 'text/event-stream',
  })
  rerender({ id: 'b', token: 'private-token' })
  expect(result.current.update).toBeUndefined()
  expect(connections[0].signal.aborted).toBe(true)
  await waitFor(() => expect(connections).toHaveLength(2))
  await act(async () => {
    connections[1].controller.enqueue(frame('ETHUSDT'))
  })
  await waitFor(() =>
    expect(result.current.update?.positions?.[0].symbol).toBe('ETHUSDT')
  )
  rerender({ id: 'b', token: undefined })
  expect(result.current.update).toBeUndefined()
  expect(connections[1].signal.aborted).toBe(true)
})

it('drops live status on disconnect and reconnects automatically', async () => {
  vi.useFakeTimers()
  const controllers: ReadableStreamDefaultController<Uint8Array>[] = []
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controllers.push(controller)
        options.signal?.addEventListener('abort', () => controller.close(), {
          once: true,
        })
      },
    }),
  }))
  vi.stubGlobal('fetch', fetcher)
  const { result } = renderHook(() => usePositionStream('a', 'token'))
  await act(async () => {
    await Promise.resolve()
    controllers[0].enqueue(frame('BTCUSDT'))
  })
  expect(result.current.connected).toBe(true)
  await act(async () => {
    controllers[0].close()
  })
  expect(result.current.connected).toBe(false)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(fetcher).toHaveBeenCalledTimes(2)
  await act(async () => {
    controllers[1].enqueue(frame('BTCUSDT'))
  })
  expect(result.current.connected).toBe(true)
})

it('retries an initial deployment 404 and connects when the endpoint becomes available', async () => {
  vi.useFakeTimers()
  let controller: ReadableStreamDefaultController<Uint8Array>
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 404 })
    .mockImplementation(async (_url: string, options: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      body: new ReadableStream<Uint8Array>({
        start(value) {
          controller = value
          options.signal?.addEventListener(
            'abort',
            () => {
              try {
                value.close()
              } catch {}
            },
            { once: true }
          )
        },
      }),
    }))
  vi.stubGlobal('fetch', fetcher)
  const { result } = renderHook(() => usePositionStream('a', 'token'))
  await act(async () => {
    await Promise.resolve()
  })
  expect(result.current.connected).toBe(false)
  expect(result.current.error).toContain('404')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
  expect(fetcher).toHaveBeenCalledTimes(2)
  await act(async () => {
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ ...update(''), positions: [] })}\n\n`
      )
    )
  })
  expect(result.current.connected).toBe(true)
  expect(result.current.update?.positions).toEqual([])
  expect(result.current.error).toBeUndefined()
})
