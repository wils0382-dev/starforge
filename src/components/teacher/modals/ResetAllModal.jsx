import { useState, useEffect } from 'react'

export default function ResetAllModal({ open, className, onConfirm, onClose }) {
  const [input, setInput] = useState('')

  useEffect(() => {
    if (!open) setInput('')
  }, [open])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const matches = input.trim().toUpperCase() === (className ?? '').toUpperCase()

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <h2 style={{ color: 'var(--hp)' }}>⚠ FULL CLASS RESET</h2>
        <p style={{ color: 'var(--text-dim)', lineHeight: 1.6, marginTop: 8 }}>
          This will wipe the entire class back to zero. It cannot be undone.
        </p>

        <ul className="reset-checklist">
          <li>All student XP reset to 0</li>
          <li>All student HP reset to 100</li>
          <li>All student AP reset to 100</li>
          <li>All ability purchases deleted</li>
        </ul>

        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', letterSpacing: .5 }}>
          To confirm, type the class name below:
        </p>
        <div className="reset-codeword-box">{className}</div>

        <input
          className="reset-confirm-input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type class name here..."
          autoFocus
          autoComplete="off"
          spellCheck={false}
        />

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-danger btn-lg"
            onClick={() => { onConfirm(); onClose() }}
            disabled={!matches}
          >
            WIPE CLASS
          </button>
        </div>
      </div>
    </div>
  )
}
