import { useEffect, useRef } from 'react'

export function useDialogFocus(
  open: boolean,
  onClose: () => void,
  busy = false
) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  const saving = useRef(busy)
  close.current = onClose
  saving.current = busy
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const elements = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
        ) || []
      ).filter((el) => !el.hidden && el.getAttribute('aria-hidden') !== 'true')
    ;(
      ref.current?.querySelector<HTMLElement>('input:not(:disabled)') ||
      elements()[0] ||
      ref.current
    )?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving.current) {
        event.preventDefault()
        close.current()
      }
      if (event.key !== 'Tab') return
      const items = elements()
      const first = items[0],
        last = items[items.length - 1]
      if (!first) {
        event.preventDefault()
        ref.current?.focus()
        return
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !ref.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !ref.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open])
  return ref
}
