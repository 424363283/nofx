export function decisionErrorSummary(message: string): string {
  const summary = message.split(/JSON内容\s*[:：]|完整响应\s*[:：]/, 1)[0].trim()
  const chars = Array.from(summary)
  return chars.length > 240 ? `${chars.slice(0, 240).join('')}…` : summary
}
