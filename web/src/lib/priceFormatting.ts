export function formatPrice(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'
  const maximumFractionDigits = Math.min(20, Math.max(2, 6 - Math.floor(Math.log10(value))))
  return value.toLocaleString('en-US', {
    minimumFractionDigits: Math.min(maximumFractionDigits, value < 1 ? 8 : 2),
    maximumFractionDigits,
  })
}
