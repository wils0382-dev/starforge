import { useEffect } from 'react'
import { getLevel, displayName } from '../../lib/gameUtils'

export default function LeaderboardMode({ open, onClose, students }) {
  const present = students.filter(s => s.present)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={`lb-mode-overlay ${open ? 'open' : ''}`}>
      <button className="btn btn-sm lb-mode-close" onClick={onClose}>✕ Close</button>
      <h1>STARFORGE</h1>
      <div className="lb-mode-sub">CLASS LEADERBOARD</div>
      <div className="lb-mode-list">
        {present.map((s, i) => {
          const r = i + 1
          const rankClass = r === 1 ? 'rank-1-row' : r === 2 ? 'rank-2-row' : r === 3 ? 'rank-3-row' : ''
          const numClass  = r === 1 ? 'r1' : r === 2 ? 'r2' : r === 3 ? 'r3' : 'rn'
          const symbol    = r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r
          return (
            <div key={s.id} className={`lb-mode-row ${rankClass}`}>
              <div className={`lb-mode-rank ${numClass}`}>{symbol}</div>
              <div>
                <div className="lb-mode-name">{s.avatar_emoji ?? ''} {displayName(s)}</div>
                <div className="lb-mode-level">LVL {getLevel(s.xp)}</div>
              </div>
              <div className="lb-mode-xp">{s.xp} XP</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
