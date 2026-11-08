// Compatibility boundary: legacy handlers retain their event contracts while
// every control renders a real Ant Design component.
import React, {
  Children,
  isValidElement,
  forwardRef,
  useRef,
  useImperativeHandle,
} from 'react'
import {
  Button,
  Input,
  InputNumber,
  Checkbox,
  Radio,
  Select,
  Card,
  Collapse,
  Modal,
  Table,
  Form,
  Alert,
} from 'antd'
import type { InputRef, SelectProps } from 'antd'
import type { CSSProperties, ReactNode } from 'react'

function layoutClass(value = '') {
  return value
    .split(/\s+/)
    .filter(
      (c) =>
        !/^(bg-|text-(?:black|white|gray|red|green|yellow|blue|\[)|border(?:-|$)|rounded|shadow|hover:|focus:|disabled:|from-|to-|backdrop-|transition|duration|font-(?:bold|semibold)|p[xy]?-)/.test(
          c
        )
    )
    .join(' ')
}
function layoutStyle(style?: CSSProperties) {
  if (!style) return undefined
  const {
    background,
    backgroundColor,
    color,
    border,
    borderColor,
    borderRadius,
    boxShadow,
    ...rest
  } = style
  return rest
}
export const UiButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ type, className = '', style, title, children, color, ...props }, ref) => {
  const source = className + ' ' + JSON.stringify(style || {})
  const primary =
    /bg-\[var\(--binance-yellow\)\]|bg-gradient|desk-primary|btn-binance/.test(
      source
    ) ||
    /var\(--(?:binance-yellow|brand-yellow|accent-primary)\)/.test(
      String(style?.background || style?.backgroundColor || '')
    )
  const danger = /red|binance-red/.test(source)
  return (
    <Button
      {...props}
      ref={ref}
      htmlType={type || 'button'}
      type={primary ? 'primary' : 'default'}
      danger={danger}
      aria-label={props['aria-label'] || title}
      title={title}
      className={layoutClass(className)}
      style={layoutStyle(style)}
    >
      {children}
    </Button>
  )
})
UiButton.displayName = 'UiButton'
export const UiInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ type = 'text', className, style, onChange, size, ...props }, ref) => {
  const inner = useRef<InputRef>(null)
  useImperativeHandle(ref, () => inner.current?.input as HTMLInputElement)
  if (type === 'checkbox')
    return (
      <Checkbox
        {...(props as any)}
        onChange={onChange as any}
        className={layoutClass(className)}
      />
    )
  if (type === 'radio')
    return (
      <Radio
        {...(props as any)}
        onChange={onChange as any}
        className={layoutClass(className)}
      />
    )
  if (type === 'number')
    return (
      <InputNumber
        {...(props as any)}
        aria-label={props['aria-label']}
        style={{ width: '100%', ...layoutStyle(style) }}
        className={layoutClass(className)}
        onChange={(value) =>
          onChange?.({
            target: { ...props, value: value == null ? '' : String(value) },
            currentTarget: {
              ...props,
              value: value == null ? '' : String(value),
            },
          } as unknown as React.ChangeEvent<HTMLInputElement>)
        }
      />
    )
  return (
    <Input
      {...props}
      ref={inner}
      type={type}
      onChange={onChange}
      className={layoutClass(className)}
      style={layoutStyle(style)}
    />
  )
})
UiInput.displayName = 'UiInput'
export function UiTextarea({
  className,
  style,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Input.TextArea
      {...props}
      className={layoutClass(className)}
      style={layoutStyle(style)}
    />
  )
}
function options(children: ReactNode): SelectProps['options'] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<any>(child)) return []
    if (child.type === React.Fragment)
      return options(child.props.children) || []
    if (child.type === 'optgroup')
      return [
        { label: child.props.label, options: options(child.props.children) },
      ]
    return [
      {
        value: child.props.value,
        label: child.props.children,
        disabled: child.props.disabled,
      },
    ]
  })
}
export function UiSelect({
  children,
  onChange,
  className,
  style,
  value,
  defaultValue,
  id,
  disabled,
  name,
  required,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select
      id={id}
      disabled={disabled}
      aria-label={rest['aria-label']}
      aria-labelledby={rest['aria-labelledby']}
      aria-required={required}
      value={value as string}
      defaultValue={defaultValue as string}
      options={options(children)}
      onChange={(v) =>
        onChange?.({
          target: { value: v, name },
          currentTarget: { value: v, name },
        } as React.ChangeEvent<HTMLSelectElement>)
      }
      className={layoutClass(className)}
      style={{ minWidth: 140, ...layoutStyle(style) }}
      popupMatchSelectWidth={false}
    />
  )
}
export function UiCard({
  children,
  className = '',
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card
      {...props}
      className={layoutClass(className).replace(
        /\b(?:binance-card(?:-no-hover)?|stat-card|chart-container|desk-feature|desk-market-panel)\b/g,
        ''
      )}
      style={layoutStyle(style)}
      classNames={{
        body: layoutClass(className)
          .split(/\s+/)
          .filter((c) => /^(?:flex|grid|items-|justify-|gap-|space-)/.test(c))
          .join(' '),
      }}
      styles={{ body: { width: '100%' } }}
    >
      {children}
    </Card>
  )
}
export function UiCollapse({
  children,
  open,
  className,
  ...props
}: React.DetailsHTMLAttributes<HTMLDetailsElement>) {
  const nodes = Children.toArray(children)
  const summary = nodes.find(
    (n) => isValidElement(n) && n.type === 'summary'
  ) as React.ReactElement | undefined
  const content = nodes.filter((n) => n !== summary)
  return (
    <Collapse
      className={layoutClass(className)}
      activeKey={open === undefined ? undefined : open ? ['panel'] : []}
      defaultActiveKey={open ? ['panel'] : []}
      items={[
        {
          key: 'panel',
          label: summary?.props.children || '详情',
          children: content,
        },
      ]}
      {...(props.id ? { id: props.id } : {})}
    />
  )
}
export function UiForm({
  onSubmit,
  className,
  children,
  ...props
}: React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <Form
      {...(props as any)}
      layout="vertical"
      onSubmitCapture={onSubmit}
      className={className}
    >
      {children}
    </Form>
  )
}
export function UiAlert({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Alert
      {...props}
      type="error"
      showIcon
      title={children}
      className={layoutClass(className)}
    />
  )
}
// Used for existing modal bodies; Ant handles portal, mask, focus trap and scroll lock.
export function UiDialog({
  children,
  onClose,
  width = 640,
  title,
  className = '',
}: {
  children: ReactNode
  onClose?: () => void
  width?: number
  title?: string
  className?: string
}) {
  return (
    <Modal
      open
      title={title}
      width={width}
      footer={null}
      closable={!!onClose}
      onCancel={onClose}
      mask={{ closable: false }}
      keyboard={!!onClose}
      className={`desk-ant-dialog ${className}`}
      centered
    >
      {children}
    </Modal>
  )
}
function flatten(children: ReactNode): React.ReactElement<any>[] {
  return Children.toArray(children).flatMap((n) =>
    isValidElement<any>(n)
      ? n.type === React.Fragment
        ? flatten(n.props.children)
        : [n]
      : []
  )
}
export function UiTable({
  children,
}: React.TableHTMLAttributes<HTMLTableElement>) {
  const sections = flatten(children),
    head = sections.find((n) => n.type === 'thead'),
    body = sections.find((n) => n.type === 'tbody')
  const headers = flatten(flatten(head?.props.children)[0]?.props.children)
  const rows = flatten(body?.props.children).map((row, index) => ({
    key: row.key ?? index,
    cells: flatten(row.props.children),
  }))
  return (
    <Table
      size="middle"
      pagination={false}
      scroll={{ x: 'max-content' }}
      rowKey="key"
      dataSource={rows}
      columns={headers.map((h, index) => ({
        key: index,
        title: h.props.children,
        render: (_: unknown, row: (typeof rows)[number]) =>
          row.cells[index]?.props.children,
      }))}
    />
  )
}

export function UiCheckLabel({
  children,
  className,
  style,
  ...labelProps
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  const nodes = Children.toArray(children)
  const input = nodes.find(
    (n) => isValidElement<any>(n) && n.type === UiInput
  ) as
    | React.ReactElement<React.InputHTMLAttributes<HTMLInputElement>>
    | undefined
  if (!input)
    return (
      <label {...labelProps} className={className} style={style}>
        {children}
      </label>
    )
  const { onChange, type, ...props } = input.props
  return (
    <Checkbox
      {...(props as any)}
      onChange={onChange as any}
      className={layoutClass(className)}
      style={layoutStyle(style)}
    >
      {nodes.filter((n) => n !== input)}
    </Checkbox>
  )
}
