// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { selectPositionRows } from './positionSnapshot'
import type { Position } from '../types'
import type { PositionStreamUpdate } from '../hooks/usePositionStream'

const position: Position = {
  symbol: 'JCTUSDT',
  side: 'short',
  entry_price: 100,
  mark_price: 90,
  quantity: 2,
  leverage: 5,
  unrealized_pnl: 20,
  unrealized_pnl_pct: 50,
  liquidation_price: 120,
  margin_used: 36,
}
const stamp = (ms: number) => new Date(ms).toISOString()
const stream = (
  rows: Position[],
  at: number,
  state: PositionStreamUpdate['state'] = 'live'
): PositionStreamUpdate => ({
  positions: rows,
  positions_at: stamp(at),
  snapshot_at: stamp(at),
  as_of: stamp(at),
  state,
})

it('clears a closed position even while quote transport is reconnecting', () => {
  const oldPoll = { positions: [position], asOf: 1000 }
  expect(
    selectPositionRows(oldPoll, stream([], 2000, 'reconnecting'), true)
  ).toEqual([])
  expect(selectPositionRows(oldPoll, stream([], 2000), false)).toEqual([])
})

it('does not let an old HTTP response restore a closed position', () => {
  const closed = stream([], 3000)
  expect(
    selectPositionRows({ positions: [position], asOf: 2000 }, closed, true)
  ).toEqual([])
})

it('does not let a fresh price tick restore stale position membership', () => {
  const oldMembership = { ...stream([position], 1000), as_of: stamp(5000) }
  expect(
    selectPositionRows({ positions: [], asOf: 3000 }, oldMembership, true)
  ).toEqual([])
})

it('keeps exchange PnL and mark price instead of stream estimates', () => {
  const quoted = {
    ...stream(
      [
        {
          ...position,
          mark_price: 80,
          unrealized_pnl: 40,
          liquidation_price: 0,
        },
      ],
      1000
    ),
    as_of: stamp(5000),
  }
  const rows = selectPositionRows(
    { positions: [position], asOf: 3000 },
    quoted,
    true
  )
  expect(rows?.[0].mark_price).toBe(90)
  expect(rows?.[0].unrealized_pnl).toBe(20)
  expect(rows?.[0].liquidation_price).toBe(120)
})

it('keeps a newer entry or resized position intact', () => {
  const newer = { ...position, quantity: 1, entry_price: 95 }
  expect(
    selectPositionRows(
      { positions: [newer], asOf: 3000 },
      { ...stream([position], 1000), as_of: stamp(5000) },
      true
    )
  ).toEqual([newer])
  expect(
    selectPositionRows(
      undefined,
      { ...stream([], 1000), positions: null },
      true
    )
  ).toBeUndefined()
})

it('rejects inflated stream profit even when its timestamps are newer', () => {
  const official = { ...position, symbol: 'HOTUSDT', unrealized_pnl: 3.25 }
  const estimated = { ...official, mark_price: 120, unrealized_pnl: 237.33 }
  expect(
    selectPositionRows(
      { positions: [official], asOf: 1000 },
      stream([estimated], 2000),
      true
    )
  ).toEqual([official])
  expect(
    selectPositionRows(undefined, stream([estimated], 2000), true)
  ).toBeUndefined()
})
