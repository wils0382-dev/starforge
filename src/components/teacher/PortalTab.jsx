import { useState } from 'react'
import { getLevel, getLPBalance, getLPSpent } from '../../lib/gameUtils'
import { useToast } from '../../context/ToastContext'

export default function PortalTab({
  students, abilities,
  pendingAliases,
  onApproveAlias, onRejectAlias,
  onToggleAbility, onDeleteAbility, onAddAbility
}) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', icon: '', cost: 1, maxOwned: 0, description: '' })
  const [saving, setSaving] = useState(false)

  async function handleAddAbility(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.description.trim()) return
    setSaving(true)
    const ok = await onAddAbility({
      name: form.name.trim(),
      icon: form.icon.trim() || '✨',
      cost: Number(form.cost) || 1,
      maxOwned: Number(form.maxOwned) || 0,
      description: form.description.trim()
    })
    if (ok) setForm({ name: '', icon: '', cost: 1, maxOwned: 0, description: '' })
    setSaving(false)
  }

  const studentsWithAbilities = students.filter(s => s.student_abilities?.length > 0)

  return (
    <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', minHeight: 'calc(100vh - 96px)' }}>

      {/* Left panel */}
      <div style={{ padding: 24, borderRight: '1px solid var(--border)', overflowY: 'auto' }}>

        {/* ── Pending alias approvals ─────────────────────────── */}
        {pendingAliases.length > 0 && (
          <div className="portal-section">
            <div className="portal-section-title" style={{ color: 'var(--xp)' }}>
              ⏳ Alias Approvals ({pendingAliases.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
              {pendingAliases.map(s => (
                <div key={s.id} className="pending-alias-card">
                  <div className="pa-avatar">{s.avatar_emoji ?? '🚀'}</div>
                  <div className="pa-info">
                    <div className="pa-real-name">{s.name}</div>
                    <div className="pa-proposed">
                      wants to be called <strong>"{s.alias_pending}"</strong>
                    </div>
                  </div>
                  <div className="pa-actions">
                    <button className="btn btn-sm btn-hp-add" onClick={() => onApproveAlias(s.id)}>✓ Approve</button>
                    <button className="btn btn-sm btn-danger" onClick={() => onRejectAlias(s.id)}>✕ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="portal-info-box">
          <strong>How the Student Portal Works:</strong> Students go to <strong>/student</strong> on the app and type their code. They can view their stats, set an alias and avatar, and spend Level Points on abilities. Print each student's code from the table below.
        </div>

        {/* ── Student codes ───────────────────────────────────── */}
        <div className="portal-section">
          <div className="portal-section-title">Student Codes</div>
          {students.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '20px 0' }}>
              No students yet. Add students in the Roster tab.
            </div>
          ) : (
            <table className="links-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Level</th>
                  <th>LP</th>
                  <th>Alias</th>
                  <th>Portal Code</th>
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id}>
                    <td className="link-name">
                      <span style={{ marginRight: 6 }}>{s.avatar_emoji ?? '🚀'}</span>
                      {s.name}
                    </td>
                    <td><span className="level-badge">LVL {getLevel(s.xp)}</span></td>
                    <td><span className="link-lp">◈ {getLPBalance(s, abilities)}</span></td>
                    <td>
                      {s.alias
                        ? <span style={{ color: 'var(--hp-green)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>✓ {s.alias}</span>
                        : s.alias_pending
                        ? <span style={{ color: 'var(--xp)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>⏳ pending</span>
                        : <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
                      }
                    </td>
                    <td><span className="link-code">{s.student_code ?? '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Student ability inventories ─────────────────────── */}
        <div className="portal-section">
          <div className="portal-section-title">Student Ability Inventories</div>
          {studentsWithAbilities.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No purchases yet.</div>
          ) : (
            studentsWithAbilities.map(s => (
              <div key={s.id} style={{ marginBottom: 16, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px' }}>
                <div style={{ fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
                  {s.avatar_emoji ?? '🚀'} {s.name} {s.alias && <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>({s.alias})</span>}
                </div>
                {s.student_abilities.map(sa => {
                  const ab = abilities.find(a => a.id === sa.ability_id)
                  if (!ab) return null
                  return (
                    <div key={sa.ability_id} className="student-ability-row">
                      <span className="student-ability-name">{ab.icon} {ab.name}</span>
                      <span className="student-ability-count">×{sa.quantity}</span>
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel: ability shop editor */}
      <div style={{ padding: 24, overflowY: 'auto' }}>
        <div className="portal-section">
          <div className="portal-section-title">Ability Shop</div>
          <div className="ability-grid">
            {abilities.map(ab => (
              <div key={ab.id} className={`ability-card ${ab.is_builtin ? 'builtin' : 'custom'}`}>
                <div className="ability-card-top">
                  <div className="ability-icon">{ab.icon}</div>
                  <div className="ability-info">
                    <div className="ability-name">{ab.name}</div>
                    <div className="ability-cost">{ab.cost} LP · {ab.max_owned > 0 ? `Max: ${ab.max_owned}` : 'Unlimited'}</div>
                  </div>
                  <span className={`ability-tag ${ab.is_builtin ? 'builtin' : 'custom'}`}>
                    {ab.is_builtin ? 'BUILT-IN' : 'CUSTOM'}
                  </span>
                </div>
                <div className="ability-desc">{ab.description}</div>
                <div className="ability-actions">
                  <label className="ability-toggle btn btn-sm" style={{ gap: 8, padding: '4px 10px' }}>
                    <label className="toggle-switch">
                      <input type="checkbox" checked={ab.available} onChange={() => onToggleAbility(ab.id)} />
                      <span className="toggle-slider" />
                    </label>
                    <span style={{ fontSize: 11, color: ab.available ? 'var(--portal)' : 'var(--text-dim)' }}>
                      {ab.available ? 'Available' : 'Hidden'}
                    </span>
                  </label>
                  {!ab.is_builtin && (
                    <button className="btn btn-sm btn-danger" onClick={() => onDeleteAbility(ab.id)}>✕ Remove</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form className="add-ability-form" onSubmit={handleAddAbility}>
            <h3>＋ Create Custom Ability</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input type="text" placeholder="e.g. Time Warp" maxLength={30}
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Icon (emoji)</label>
                <input type="text" placeholder="⚡" maxLength={4}
                  value={form.icon} onChange={e => setForm(p => ({ ...p, icon: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Cost (Level Points)</label>
                <input type="number" min={1} max={10}
                  value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Max Owned (0 = unlimited)</label>
                <input type="number" min={0} max={99}
                  value={form.maxOwned} onChange={e => setForm(p => ({ ...p, maxOwned: e.target.value }))} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Description</label>
              <textarea placeholder="e.g. Skip one question of your choice during a test."
                value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} required />
            </div>
            <button className="btn btn-portal btn-lg" type="submit" disabled={saving}>
              {saving ? 'Adding...' : 'Add to Shop'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
