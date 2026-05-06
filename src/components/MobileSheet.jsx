import { useEffect } from 'react'

export default function MobileSheet({ open, onClose, children, label }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(28, 24, 18, 0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="iris-sheet bg-white w-full flex flex-col overflow-hidden"
        style={{
          height: '92%',
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          animation: 'iris-sheet-in 280ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        <div className="pt-2.5 pb-1 flex justify-center shrink-0">
          <span className="block w-[38px] h-1 rounded-full bg-parchment-300" aria-hidden="true" />
        </div>
        <div className="px-4 pb-2 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-[13px] text-parchment-700 hover:text-parchment-950 px-1.5 py-1"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  )
}
