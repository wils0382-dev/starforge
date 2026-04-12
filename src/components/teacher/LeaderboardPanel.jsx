import { getLevel, getLPBalance, displayName } from '../../lib/gameUtils'

export default function LeaderboardPanel({ ranked, abilities, onScrollToCard }) {
  return (
    <aside id="leaderboard-panel">
      <div id="lb-header">
        <div id="lb-title">Leaderboard</div>
        <div id="lb-subtitle">RANKED BY XP</div>
      </div>
      <div id="leaderboard-list">
        {ranked.map((s, i) => {
          const rank = s._rank
          const rankLabel = rank ? `#${rank}` : '—'
          const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : ''
          const isAbsent = !s.present
          const isTop = rank === 1
          const lp = getLPBalance(s, abilities)

          return (
            <div key={s.id}>
              <div
                className={`lb-item ${isTop ? 'lb-top' : ''} ${isAbsent ? 'lb-absent-row' : ''}`}
                onClick={() => onScrollToCard(s.id)}
              >
                <div className={`lb-rank ${rankClass}`}>{rankLabel}</div>
                <div className="lb-info">
                  <div className="lb-name">{s.avatar_emoji ?? ''} {displayName(s)}</div>
                  <div className="lb-xp-label">LVL {getLevel(s.xp)} · ◈{lp} LP</div>
                </div>
                <div className="lb-xp-val">{s.xp}</div>
              </div>
              {rank === 3 && ranked.length > 3 && (
                <hr className="lb-divider" />
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}
