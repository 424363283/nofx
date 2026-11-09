// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { decisionErrorSummary } from './decisionError'

it('keeps old oversized errors out of the alert while preserving a useful summary', () => {
  expect(decisionErrorSummary('获取AI决策失败：JSON语法错误\nJSON内容: [{...}]\n完整响应: 很长的模型回复')).toBe('获取AI决策失败：JSON语法错误')
  expect(Array.from(decisionErrorSummary('错'.repeat(1000))).length).toBe(241)
  expect(decisionErrorSummary('资金不足')).toBe('资金不足')
})
