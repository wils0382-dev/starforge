import { useState } from 'react'
import { getLevel, getLPBalance, hpClass, xpBarPct, MAX_HP, MAX_AP } from '../../lib/gameUtils'

const XP_BUTTONS  = [{ label: '+5', val: 5 }, { label: '+10', val: 10 }, { label: '+20', val: 20 }]
const HP_SUB_BTNS = [{ label: '-5', val: 5 }, { label: '-10', val: 10 }]
const AP_SUB_BTNS = [{ label: '-10', val: 10 }, { label: '-5', val: 5 }]

export default function StudentCard({
  student, abilities, squadrons = [],
  maxXP,
  onEdit, onChangeXP, onChangeHP, onRestoreHP, onChangeAP,
  onToggleAttendance, onResetStudent, onRemoveStudent
}) {
  const s = student
  const rank = s._rank
  const level = getLevel(s.xp)
  const lp = getLPBalance(s, abilities)
  const hpPct = Math.round((s.hp / MAX_HP) * 100)
  const ap    = s.ap ?? MAX_AP
  const apPct = Math.round((ap / MAX_AP) * 100)
  const xpPct = xpBarPct(s.xp, maxXP)

  const [customXp, setCustomXp] = useState('')
  const [customHp, setCustomHp] = useState('')
  const [customAp, setCustomAp] = useState('')

  function applyCustomXp() {
    const val = parseInt(customXp, 10)
    if (!val || val <= 0) return
    onChangeXP(s.id, val)
    setCustomXp('')
  }

  function applyCustomHp(sign) {
    const val = parseInt(customHp, 10)
    if (!val || val <= 0) return
    onChangeHP(s.id, sign * val)
    setCustomHp('')
  }

  function applyCustomAp(sign) {
    const val = parseInt(customAp, 10)
    if (!val || val <= 0) return
    onChangeAP(s.id, sign * val)
    setCustomAp('')
  }

  const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : ''
  const rankLabel = rank ? `#${rank}` : '—'
  const absentClass = !s.present ? 'absent' : ''

  return (
    <div className={`student-card ${absentClass}`} id={`card-${s.id}`}>
      <div className="card-top">
        <span className={`card-rank ${rankClass}`}>{rankLabel}</span>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{s.avatar_emoji ?? '🚀'}</span>
        <span className="card-name" onClick={() => onEdit(s)}>{s.name}</span>
        {s.alias && (
          <span className="alias-badge approved" title="Approved alias">{s.alias}</span>
        )}
        {s.alias_pending && (
          <span className="alias-badge pending" title={`Pending: "${s.alias_pending}"`}>⏳</span>
        )}
        {s.squadron_id && (() => {
          const sq = squadrons.find(x => x.id === s.squadron_id)
          return sq ? (
            <span
              className="squadron-badge"
              style={{ background: sq.color + '22', borderColor: sq.color, color: sq.color }}
            >
              {sq.emoji} {sq.name}
            </span>
          ) : null
        })()}
        <span className={`level-badge`}>LVL {level}</span>
        <span className="lp-badge">◈{lp}</span>
        <button
          className={`attend-btn ${s.present ? 'present' : 'absent'}`}
          onClick={() => onToggleAttendance(s.id)}
        >
          {s.present ? 'PRESENT' : 'ABSENT'}
        </button>
      </div>

      <div className="card-bars">
        <div className="bar-row">
          <span className="bar-label xp">XP</span>
          <div className="bar-track">
            <div className="bar-fill xp" style={{ width: xpPct + '%' }} />
          </div>
          <span className="bar-val xp">{s.xp}</span>
        </div>
        <div className="bar-row">
          <span className="bar-label hp">HP</span>
          <div className="bar-track">
            <div className={`bar-fill ${hpClass(s.hp)}`} style={{ width: hpPct + '%' }} />
          </div>
          <span className="bar-val hp">{s.hp}/{MAX_HP}</span>
        </div>
        <div className="bar-row">
          <span className="bar-label ap">AP</span>
          <div className="bar-track">
            <div className="bar-fill ap" style={{ width: apPct + '%' }} />
          </div>
          <span className="bar-val ap">{ap}/{MAX_AP}</span>
        </div>
      </div>

      <div className="card-actions">
        <div className="card-actions-xp">
          <span className="act-label xp">XP</span>
          {XP_BUTTONS.map(b => (
            <button key={b.val} className="btn btn-xp btn-sm" onClick={() => onChangeXP(s.id, b.val)}>
              {b.label}
            </button>
          ))}
          <input
            className="custom-stat-input"
            type="number" min={1} placeholder="?"
            value={customXp}
            onChange={e => setCustomXp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyCustomXp() }}
          />
          <button className="btn btn-xp btn-sm" onClick={applyCustomXp} disabled={!customXp}>+</button>
        </div>

        <div className="act-divider" />

        <div className="card-actions-hp">
          <span className="act-label hp">HP</span>
          {HP_SUB_BTNS.map(b => (
            <button key={b.val} className="btn btn-hp-sub btn-sm" onClick={() => onChangeHP(s.id, -b.val)}>
              {b.label}
            </button>
          ))}
          <input
            className="custom-stat-input"
            type="number" min={1} placeholder="?"
            value={customHp}
            onChange={e => setCustomHp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyCustomHp(-1) }}
          />
          <button className="btn btn-hp-sub btn-sm" onClick={() => applyCustomHp(-1)} disabled={!customHp} title="Subtract HP">−</button>
          <button className="btn btn-hp-add btn-sm" onClick={() => applyCustomHp(1)}  disabled={!customHp} title="Add HP">+</button>
          <button className="btn btn-hp-add btn-sm" onClick={() => onRestoreHP(s.id)}>
            ♥ Full
          </button>
        </div>

        <div className="act-divider" />

        <div className="card-actions-ap">
          <span className="act-label ap">AP</span>
          {AP_SUB_BTNS.map(b => (
            <button key={b.val} className="btn btn-ap-sub btn-sm" onClick={() => onChangeAP(s.id, -b.val)}>
              -{b.val}
            </button>
          ))}
          <input
            className="custom-stat-input"
            type="number" min={1} placeholder="?"
            value={customAp}
            onChange={e => setCustomAp(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyCustomAp(-1) }}
          />
          <button className="btn btn-ap-sub btn-sm" onClick={() => applyCustomAp(-1)} disabled={!customAp} title="Subtract AP">−</button>
          <button className="btn btn-ap-add btn-sm" onClick={() => applyCustomAp(1)}  disabled={!customAp} title="Add AP">+</button>
        </div>

        <div className="card-secondary">
          <button className="btn btn-sm" onClick={() => onResetStudent(s.id)} title="Reset XP & HP">↺</button>
          <button className="btn btn-sm btn-danger" onClick={() => onRemoveStudent(s.id)} title="Remove student">✕</button>
        </div>
      </div>

      {s.student_code && (
        <div style={{ padding: '4px 12px 8px', borderTop: '1px solid var(--border)' }}>
          <span className="student-code-badge">CODE: {s.student_code}</span>
        </div>
      )}
    </div>
  )
}
