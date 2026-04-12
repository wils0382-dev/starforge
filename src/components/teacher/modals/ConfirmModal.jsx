import { useEffect } from 'react'

export default function ConfirmModal({ open, title, message, onConfirm, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <h2>{title}</h2>
        <p style={{ color: 'var(--text-dim)', lineHeight: 1.6, marginTop: 8 }}>{message}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger btn-lg" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  )
}
