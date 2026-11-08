// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { formatPrice } from './priceFormatting'

it('keeps HOT entry, mark and liquidation prices distinguishable', () => {
  expect(formatPrice(0.0004372638)).toBe('0.0004372638')
  expect(formatPrice(0.0004402)).toBe('0.00044020')
  expect(formatPrice(0.0004283)).toBe('0.00042830')
  expect(formatPrice(100000.12)).toBe('100,000.12')
  expect(formatPrice(0.00000000012)).toBe('0.00000000012')
  expect(formatPrice(NaN)).toBe('—')
})
