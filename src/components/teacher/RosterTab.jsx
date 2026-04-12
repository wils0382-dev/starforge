import LeaderboardPanel from './LeaderboardPanel'
import StudentCard from './StudentCard'

export default function RosterTab({
  students, ranked, abilities,
  sortBy, onSortChange,
  onAddStudent, onLoadDemo,
  onEditStudent, onChangeXP, onChangeHP, onRestoreHP,
  onToggleAttendance, onResetStudent, onRemoveStudent,
  onScrollToCard
}) {
  const maxXP = students.length ? Math.max(...students.map(s => s.xp), 100) : 100

  return (
    <div id="app-grid" style={{ position: 'relative', zIndex: 1 }}>
      <LeaderboardPanel
        ranked={ranked}
        abilities={abilities}
        onScrollToCard={onScrollToCard}
      />

      <main id="main-area">
        <div id="roster-toolbar">
          <span id="roster-title">Roster</span>
          <span id="student-count">{students.length} student{students.length !== 1 ? 's' : ''}</span>
          <span id="roster-spacer" />
          <button className="btn btn-sm" onClick={onLoadDemo}>Load Demo</button>
          <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
            Sort:
            <select
              value={sortBy}
              onChange={e => onSortChange(e.target.value)}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontFamily: 'var(--font-ui)', fontSize: 11, outline: 'none', cursor: 'pointer', marginLeft: 4 }}
            >
              <option value="rank">By Rank</option>
              <option value="name">By Name</option>
              <option value="hp">By HP</option>
            </select>
          </label>
        </div>

        <div id="roster-grid">
          {students.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">⚔</div>
              <h3>No Students Yet</h3>
              <p>Add students or load the demo roster to try things out.</p>
              <button className="btn btn-accent btn-lg" style={{ marginTop: 8 }} onClick={onAddStudent}>
                ＋ Add First Student
              </button>
            </div>
          ) : (
            students.map(s => (
              <StudentCard
                key={s.id}
                student={s}
                abilities={abilities}
                maxXP={maxXP}
                onEdit={onEditStudent}
                onChangeXP={onChangeXP}
                onChangeHP={onChangeHP}
                onRestoreHP={onRestoreHP}
                onToggleAttendance={onToggleAttendance}
                onResetStudent={onResetStudent}
                onRemoveStudent={onRemoveStudent}
              />
            ))
          )}
        </div>
      </main>
    </div>
  )
}
