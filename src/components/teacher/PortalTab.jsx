import { useState } from 'react'
import { getLevel, getLPBalance, getLPSpent } from '../../lib/gameUtils'
import { useToast } from '../../context/ToastContext'

const SQUADRON_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
]

export default function PortalTab({
  students, abilities,
  squadrons, onSaveSquadron, onDeleteSquadron,
  pendingAliases,
  onApproveAlias, onRejectAlias,
  onToggleAbility, onDeleteAbility, onAddAbility,
  onLoadSciFiAbilities
}) {
  const toast = useToast()
  const [abilityForm, setAbilityForm] = useState({ name: '', icon: '', cost: 1, apCost: 0, maxOwned: 0, description: '' })
  const [abilitySaving, setAbilitySaving] = useState(false)

  // Squadron form
  const [sqForm, setSqForm] = useState({ name: '', emoji: '⚡', color: SQUADRON_COLORS[0] })
  const [sqSaving, setSqSaving] = useState(false)

  async function handleAddAbility(e) {
    e.preventDefault()
    if (!abilityForm.name.trim() || !abilityForm.description.trim()) return
    setAbilitySaving(true)
    const ok = await onAddAbility({
      name: abilityForm.name.trim(),
      icon: abilityForm.icon.trim() || '✨',
      cost: Number(abilityForm.cost) || 1,
      apCost: Number(abilityForm.apCost) || 0,
      maxOwned: Number(abilityForm.maxOwned) || 0,
      description: abilityForm.description.trim()
    })
    if (ok) setAbilityForm({ name: '', icon: '', cost: 1, apCost: 0, maxOwned: 0, description: '' })
    setAbilitySaving(false)
  }

  async function handleAddSquadron(e) {
    e.preventDefault()
    if (!sqForm.name.trim()) return
    setSqSaving(true)
    await onSaveSquadron({ name: sqForm.name.trim(), color: sqForm.color, emoji: sqForm.emoji.trim() || '⚡' })
    setSqForm({ name: '', emoji: '⚡', color: SQUADRON_COLORS[0] })
    setSqSaving(false)
  }

  const studentsWithAbilities = students.filter(s => s.student_abilities?.length > 0)

  // Count members per squadron
  const memberCount = (sqId) => students.filter(s => s.squadron_id === sqId).length

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

        {/* ── Squadron management ──────────────────────────────── */}
        <div className="portal-section">
          <div className="portal-section-title">Squadrons</div>

          {squadrons.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '8px 0 16px' }}>
              No squadrons yet. Create one below to start grouping students.
            </div>
          ) : (
            <div className="squadron-list">
              {squadrons.map(sq => (
                <div key={sq.id} className="squadron-row" style={{ borderColor: sq.color + '55' }}>
                  <span className="sq-swatch" style={{ background: sq.color }} />
                  <span className="sq-emoji">{sq.emoji}</span>
                  <span className="sq-name" style={{ color: sq.color }}>{sq.name}</span>
                  <span className="sq-count">{memberCount(sq.id)} member{memberCount(sq.id) !== 1 ? 's' : ''}</span>
                  <button className="btn btn-sm btn-danger" onClick={() => onDeleteSquadron(sq.id)}>✕</button>
                </div>
              ))}
            </div>
          )}

          <form className="sq-create-form" onSubmit={handleAddSquadron}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 3 }}>
                <label>Squadron Name</label>
                <input
                  type="text" placeholder="e.g. Nova Squad" maxLength={30}
                  value={sqForm.name}
                  onChange={e => setSqForm(p => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Icon</label>
                <input
                  type="text" placeholder="⚡" maxLength={4}
                  value={sqForm.emoji}
                  onChange={e => setSqForm(p => ({ ...p, emoji: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Colour</label>
              <div className="sq-color-row">
                {SQUADRON_COLORS.map(c => (
                  <button
                    key={c} type="button"
                    className={`sq-color-swatch ${sqForm.color === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setSqForm(p => ({ ...p, color: c }))}
                  />
                ))}
              </div>
            </div>
            <button className="btn btn-portal btn-lg" type="submit" disabled={sqSaving || !sqForm.name.trim()}>
              {sqSaving ? 'Creating...' : '＋ Create Squadron'}
            </button>
          </form>
        </div>

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
                      {s.squadron_id && (() => {
                        const sq = squadrons.find(x => x.id === s.squadron_id)
                        return sq ? (
                          <span className="sq-inline-badge" style={{ color: sq.color }}>
                            {sq.emoji} {sq.name}
                          </span>
                        ) : null
                      })()}
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
          <div className="portal-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Ability Shop</span>
            <button className="btn btn-portal btn-sm" onClick={onLoadSciFiAbilities}>
              ⚡ Load Sci-Fi Abilities
            </button>
          </div>
          <div className="ability-grid">
            {abilities.map(ab => (
              <div key={ab.id} className={`ability-card ${ab.is_builtin ? 'builtin' : 'custom'}`}>
                <div className="ability-card-top">
                  <div className="ability-icon">{ab.icon}</div>
                  <div className="ability-info">
                    <div className="ability-name">{ab.name}</div>
                    <div className="ability-cost">
                      {ab.cost} LP · {ab.ap_cost > 0 ? `${ab.ap_cost} AP · ` : ''}{ab.max_owned > 0 ? `Max: ${ab.max_owned}` : 'Unlimited'}
                    </div>
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
                  value={abilityForm.name} onChange={e => setAbilityForm(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Icon (emoji)</label>
                <input type="text" placeholder="⚡" maxLength={4}
                  value={abilityForm.icon} onChange={e => setAbilityForm(p => ({ ...p, icon: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Cost (Level Points)</label>
                <input type="number" min={1} max={10}
                  value={abilityForm.cost} onChange={e => setAbilityForm(p => ({ ...p, cost: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>AP Cost (to activate)</label>
                <input type="number" min={0} max={100}
                  value={abilityForm.apCost} onChange={e => setAbilityForm(p => ({ ...p, apCost: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Max Owned (0 = unlimited)</label>
                <input type="number" min={0} max={99}
                  value={abilityForm.maxOwned} onChange={e => setAbilityForm(p => ({ ...p, maxOwned: e.target.value }))} />
              </div>
              <div className="form-group" />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label>Description</label>
              <textarea placeholder="e.g. Skip one question of your choice during a test."
                value={abilityForm.description} onChange={e => setAbilityForm(p => ({ ...p, description: e.target.value }))} required />
            </div>
            <button className="btn btn-portal btn-lg" type="submit" disabled={abilitySaving}>
              {abilitySaving ? 'Adding...' : 'Add to Shop'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
