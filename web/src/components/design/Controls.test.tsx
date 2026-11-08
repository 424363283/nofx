// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest'
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import {
  UiCheckLabel,
  UiInput,
  UiSelect,
  UiForm,
  UiButton,
  UiTable,
} from './Controls'
afterEach(cleanup)
it('preserves numeric zero and native event-shaped callbacks', () => {
  const change = vi.fn()
  render(
    <UiInput type="number" aria-label="杠杆" value={1} onChange={change} />
  )
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
  expect(change.mock.calls.at(-1)?.[0].target.value).toBe('0')
})
it('uses a single accessible checkbox label', () => {
  const change = vi.fn()
  render(
    <UiCheckLabel>
      <UiInput type="checkbox" checked={false} onChange={change} />
      开启信号
    </UiCheckLabel>
  )
  fireEvent.click(screen.getByText('开启信号'))
  expect(change).toHaveBeenCalledTimes(1)
  expect(change.mock.calls[0][0].target.checked).toBe(true)
  expect(document.querySelector('label label')).toBeNull()
})
it('preserves select values and form submission', async () => {
  const change = vi.fn(),
    submit = vi.fn((e) => e.preventDefault())
  render(
    <UiForm onSubmit={submit}>
      <UiSelect aria-label="模型" value="a" onChange={change}>
        <option value="a">模型A</option>
        <option value="b">模型B</option>
      </UiSelect>
      <UiButton type="submit">保存</UiButton>
    </UiForm>
  )
  fireEvent.mouseDown(screen.getByLabelText('模型'))
  await waitFor(() =>
    expect(
      document.querySelector('.ant-select-item-option[title="模型B"]')
    ).toBeTruthy()
  )
  fireEvent.click(
    document.querySelector('.ant-select-item-option[title="模型B"]')!
  )
  expect(change.mock.calls[0][0].target.value).toBe('b')
  fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
  expect(submit).toHaveBeenCalledTimes(1)
})

it('preserves position table rows and cell content', () => {
  render(
    <UiTable>
      <thead>
        <tr>
          <th>合约</th>
          <th>持仓量</th>
        </tr>
      </thead>
      <tbody>
        {['BTCUSDT', 'TSLAUSDT'].map((symbol, i) => (
          <tr key={symbol}>
            <td>{symbol}</td>
            <td>{i}</td>
          </tr>
        ))}
      </tbody>
    </UiTable>
  )
  expect(screen.getByRole('columnheader', { name: '合约' })).toBeTruthy()
  expect(screen.getByRole('cell', { name: 'TSLAUSDT' })).toBeTruthy()
  expect(screen.getByRole('cell', { name: '0' })).toBeTruthy()
})
