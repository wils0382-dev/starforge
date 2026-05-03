import { useState, useEffect } from 'react'
import { MAX_HP, MAX_AP } from '../../../lib/gameUtils'

export default function StudentModal({ open, student, squadrons = [], onSave, onClose }) {
  const [name,       setName]       = useState('')
  const [xp,         setXp]         = useState(0)
  const [hp,         setHp]         = useState(MAX_HP)
  const [ap,         setAp]         = useState(MAX_AP)
  const [squadronId, setSquadronId] = useState('')

  useEffect(() => {
    if (open) {
      setName(student?.name ?? '')
      setXp(student?.xp ?? 0)
      setHp(student?.hp ?? MAX_HP)
      setAp(student?.ap ?? MAX_AP)
      setSquadronId(student?.squadron_id ?? '')
    }
  }, [open, student])

  function handleSave() {
    if (!name.trim()) return
    onSave({
      id: student?.id ?? null,
      name: name.trim(),
      xp: Number(xp),
      hp: Number(hp),
      ap: Number(ap),
      squadron_id: squadronId || null
    })
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

        <label>Starting AP</label>
        <input type="number" value={ap} min={0} max={MAX_AP} onChange={e => setAp(e.target.value)} />

        <label>Squadron (optional)</label>
        <select
          value={squadronId}
          onChange={e => setSquadronId(e.target.value)}
          style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border-hi)', borderRadius: 'var(--radius)', color: squadronId ? 'var(--text)' : 'var(--text-dim)', fontFamily: 'var(--font-ui)', fontSize: 14, padding: '8px 12px' }}
        >
          <option value="">— No Squadron —</option>
          {squadrons.map(sq => (
            <option key={sq.id} value={sq.id}>{sq.emoji} {sq.name}</option>
          ))}
        </select>
        {squadrons.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            Create squadrons in the Portal Manager tab first.
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent btn-lg" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  )
}
