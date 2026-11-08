import type { Position, PositionSnapshot } from '../types'
import type { PositionStreamUpdate } from '../hooks/usePositionStream'

// Financial fields come only from Binance's account snapshot. Mark-price
// projections must not overwrite the exchange-reported unrealized profit.
export function selectPositionRows(
  polled?: PositionSnapshot,
  stream?: PositionStreamUpdate,
  _connected = false
): Position[] | undefined {
  if (!polled) return undefined
  const streamAt = Date.parse(stream?.positions_at || stream?.snapshot_at || '')
  if (stream?.positions != null && streamAt >= polled.asOf) {
    // A newer account event may remove a closed position immediately. New or
    // resized positions wait for an authoritative account snapshot.
    const current = new Set(
      stream.positions.map((p) => `${p.symbol}-${p.side}`)
    )
    return polled.positions.filter((p) => current.has(`${p.symbol}-${p.side}`))
  }
  return polled.positions
}
