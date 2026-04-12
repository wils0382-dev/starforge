import { useState, useEffect } from 'react'
import { MAX_HP } from '../../../lib/gameUtils'

export default function StudentModal({ open, student, onSave, onClose }) {
  const [name, setName] = useState('')
  const [xp,   setXp]   = useState(0)
  const [hp,   setHp]   = useState(MAX_HP)

  useEffect(() => {
    if (open) {
      setName(student?.name ?? '')
      setXp(student?.xp ?? 0)
      setHp(student?.hp ?? MAX_HP)
    }
  }, [open, student])

  function handleSave() {
    if (!name.trim()) return
    onSave({ id: student?.id ?? null, name: name.trim(), xp: Number(xp), hp: Number(hp) })
  }

  if (!open) return null

  return (
    <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <h2>{student ? 'EDIT STUDENT' : 'ADD STUDENT'}</h2>

        <label>Student Name</label>
        <input
          type="text" value={name} maxLength={40} autoFocus
          placeholder="e.g. Alex Chen"
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
        />

        <label>Starting XP</label>
        <input type="number" value={xp} min={0} onChange={e => setXp(e.target.value)} />

        <label>Starting HP</label>
        <input type="number" value={hp} min={0} max={MAX_HP} onChange={e => setHp(e.target.value)} />

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent btn-lg" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
