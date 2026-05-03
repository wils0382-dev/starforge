import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getLevel, displayName } from '../../lib/gameUtils'

export default function LeaderboardMode({ open, onClose, students, squadrons = [], allClasses = [], classData }) {
  const [viewMode, setViewMode]           = useState('class')
  const [crossStudents, setCrossStudents] = useState([])
  const [loadingCross, setLoadingCross]   = useState(false)

  const present = students.filter(s => s.present)
  const hasMultiClass = allClasses.length > 1
  const hasSquadrons  = squadrons.length > 0

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reset when closed
  useEffect(() => {
    if (!open) { setCrossStudents([]); setViewMode('class') }
  }, [open])

  // Fetch all-classes students when needed
  useEffect(() => {
    if (!open) return
    if (viewMode !== 'all' && viewMode !== 'summary') return
    if (crossStudents.length > 0 || loadingCross || allClasses.length === 0) return
    setLoadingCross(true)
    supabase
      .from('students')
      .select('*')
      .in('class_id', allClasses.map(c => c.id))
      .then(({ data }) => { setCrossStudents(data ?? []); setLoadingCross(false) })
  }, [open, viewMode, allClasses]) // eslint-disable-line

  // ── Squadron ranking helpers ───────────────────────────────────
  function getSquadronRankings() {
    const map = {}
    for (const s of students) {
      const sqId = s.squadron_id ?? '__none__'
      if (!map[sqId]) map[sqId] = { xp: 0, members: [] }
      map[sqId].xp += s.xp
      map[sqId].members.push(s)
    }
    const ranked = Object.entries(map)
      .filter(([sqId]) => sqId !== '__none__')
      .map(([sqId, data]) => ({ sqId, ...data, squad: squadrons.find(sq => sq.id === sqId) }))
      .sort((a, b) => b.xp - a.xp)
    const unassigned = map['__none__'] ?? null
    return { ranked, unassigned }
  }

  // ── Class summary helpers ──────────────────────────────────────
  function getClassSummary() {
    const map = {}
    for (const cls of allClasses) {
      map[cls.id] = { cls, members: [], totalXP: 0, avgXP: 0, topStudent: null }
    }
    for (const s of crossStudents) {
      if (map[s.class_id]) {
        map[s.class_id].members.push(s)
        map[s.class_id].totalXP += s.xp
      }
    }
    return Object.values(map).map(entry => {
      const count = entry.members.length
      entry.avgXP = count > 0 ? Math.round(entry.totalXP / count) : 0
      const sorted = [...entry.members].sort((a, b) => b.xp - a.xp)
      entry.topStudent = sorted[0] ?? null
      return entry
    }).sort((a, b) => b.avgXP - a.avgXP)
  }

  return (
    <div className={`lb-mode-overlay ${open ? 'open' : ''}`}>
      <button className="btn btn-sm lb-mode-close" onClick={onClose}>✕ Close</button>
      <h1>STARFORGE</h1>

      {/* View mode tabs */}
      <div className="lb-mode-tabs">
        <button className={`lb-tab-btn ${viewMode === 'class' ? 'active' : ''}`} onClick={() => setViewMode('class')}>
          Class Ranking
        </button>
        {hasSquadrons && (
          <button className={`lb-tab-btn ${viewMode === 'squadron' ? 'active' : ''}`} onClick={() => setViewMode('squadron')}>
            Squadrons
          </button>
        )}
        {hasMultiClass && (
          <>
            <button className={`lb-tab-btn ${viewMode === 'all' ? 'active' : ''}`} onClick={() => setViewMode('all')}>
              All Classes
            </button>
            <button className={`lb-tab-btn ${viewMode === 'summary' ? 'active' : ''}`} onClick={() => setViewMode('summary')}>
              Class Summary
            </button>
          </>
        )}
      </div>

      {/* ── Class Ranking ────────────────────────────────────────── */}
      {viewMode === 'class' && (
        <>
          <div className="lb-mode-sub">CLASS LEADERBOARD · {classData?.name ?? ''}</div>
          <div className="lb-mode-list">
            {present.map((s, i) => {
              const r = i + 1
              const rankClass = r === 1 ? 'rank-1-row' : r === 2 ? 'rank-2-row' : r === 3 ? 'rank-3-row' : ''
              const numClass  = r === 1 ? 'r1' : r === 2 ? 'r2' : r === 3 ? 'r3' : 'rn'
              const symbol    = r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r
              const sq = squadrons.find(x => x.id === s.squadron_id)
              return (
                <div key={s.id} className={`lb-mode-row ${rankClass}`}>
                  <div className={`lb-mode-rank ${numClass}`}>{symbol}</div>
                  <div style={{ flex: 1 }}>
                    <div className="lb-mode-name">{s.avatar_emoji ?? ''} {displayName(s)}</div>
                    <div className="lb-mode-level">
                      LVL {getLevel(s.xp)}
                      {sq && <span className="lb-sq-tag" style={{ color: sq.color }}> · {sq.emoji} {sq.name}</span>}
                    </div>
                  </div>
                  <div className="lb-mode-xp">{s.xp} XP</div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── Squadron Ranking ─────────────────────────────────────── */}
      {viewMode === 'squadron' && (() => {
        const { ranked, unassigned } = getSquadronRankings()
        return (
          <>
            <div className="lb-mode-sub">SQUADRON RANKINGS</div>
            <div className="lb-mode-list">
              {ranked.map((entry, i) => {
                const r = i + 1
                const rankClass = r <= 3 ? `rank-${r}-row` : ''
                const numClass  = r <= 3 ? `r${r}` : 'rn'
                const symbol    = r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r
                const sq = entry.squad
                return (
                  <div key={entry.sqId} className={`lb-mode-row ${rankClass}`}>
                    <div className={`lb-mode-rank ${numClass}`}>{symbol}</div>
                    <div style={{ flex: 1 }}>
                      <div className="lb-mode-name" style={{ color: sq?.color ?? 'var(--text)' }}>
                        {sq?.emoji ?? '⚡'} {sq?.name ?? 'Unknown'}
                      </div>
                      <div className="lb-mode-level">{entry.members.length} member{entry.members.length !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="lb-mode-xp">{entry.xp} XP total</div>
                  </div>
                )
              })}
              {unassigned?.members.length > 0 && (
                <div className="lb-mode-row" style={{ opacity: 0.45 }}>
                  <div className="lb-mode-rank rn">—</div>
                  <div style={{ flex: 1 }}>
                    <div className="lb-mode-name">Unassigned</div>
                    <div className="lb-mode-level">{unassigned.members.length} student{unassigned.members.length !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="lb-mode-xp">{unassigned.xp} XP</div>
                </div>
              )}
              {ranked.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '40px 0', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                  No students assigned to squadrons yet.
                </div>
              )}
            </div>
          </>
        )
      })()}

      {/* ── All Classes Combined ─────────────────────────────────── */}
      {viewMode === 'all' && (
        <>
          <div className="lb-mode-sub">ALL CLASSES · COMBINED RANKING</div>
          {loadingCross ? (
            <div className="lb-loading">Loading...</div>
          ) : (
            <div className="lb-mode-list">
              {[...crossStudents]
                .filter(s => s.present)
                .sort((a, b) => b.xp - a.xp)
                .map((s, i) => {
                  const r = i + 1
                  const rankClass = r === 1 ? 'rank-1-row' : r === 2 ? 'rank-2-row' : r === 3 ? 'rank-3-row' : ''
                  const numClass  = r === 1 ? 'r1' : r === 2 ? 'r2' : r === 3 ? 'r3' : 'rn'
                  const symbol    = r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r
                  const cls = allClasses.find(c => c.id === s.class_id)
                  return (
                    <div key={s.id} className={`lb-mode-row ${rankClass}`}>
                      <div className={`lb-mode-rank ${numClass}`}>{symbol}</div>
                      <div style={{ flex: 1 }}>
                        <div className="lb-mode-name">{s.avatar_emoji ?? ''} {displayName(s)}</div>
                        <div className="lb-mode-level">
                          LVL {getLevel(s.xp)}
                          {cls && <span style={{ color: 'var(--text-dim)' }}> · {cls.name}</span>}
                        </div>
                      </div>
                      <div className="lb-mode-xp">{s.xp} XP</div>
                    </div>
                  )
                })}
            </div>
          )}
        </>
      )}

      {/* ── Class Summary ────────────────────────────────────────── */}
      {viewMode === 'summary' && (
        <>
          <div className="lb-mode-sub">CLASS COMPARISON</div>
          {loadingCross ? (
            <div className="lb-loading">Loading...</div>
          ) : (
            <div className="lb-mode-list">
              {getClassSummary().map((entry, i) => {
                const r = i + 1
                const rankClass = r <= 3 ? `rank-${r}-row` : ''
                const numClass  = r <= 3 ? `r${r}` : 'rn'
                const symbol    = r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r
                return (
                  <div key={entry.cls.id} className={`lb-mode-row ${rankClass}`}>
                    <div className={`lb-mode-rank ${numClass}`}>{symbol}</div>
                    <div style={{ flex: 1 }}>
                      <div className="lb-mode-name">{entry.cls.name}</div>
                      <div className="lb-mode-level">
                        {entry.members.length} student{entry.members.length !== 1 ? 's' : ''}
                        {entry.topStudent && <span style={{ color: 'var(--text-dim)' }}> · Top: {displayName(entry.topStudent)} ({entry.topStudent.xp} XP)</span>}
                      </div>
                    </div>
                    <div className="lb-mode-xp" style={{ textAlign: 'right' }}>
                      <div>{entry.avgXP} avg XP</div>
                      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>{entry.totalXP} total</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
