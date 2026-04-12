import { useState, useEffect } from 'react'

export default function Header({
  className, onRename,
  studentCount, presentCount, topXP,
  onAddStudent, onLeaderboardMode, onExport, onResetAll, onSignOut
}) {
  const [title, setTitle] = useState(className)

  useEffect(() => { setTitle(className) }, [className])

  function handleBlur() {
    const trimmed = title.trim() || 'My Class'
    setTitle(trimmed)
    if (trimmed !== className) onRename(trimmed)
  }

  return (
    <header id="header">
      <div id="logo">STAR<span>FORGE</span></div>
      <input
        id="class-title"
        type="text"
        value={title}
        maxLength={40}
        title="Click to rename"
        onChange={e => setTitle(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
      />
      <div id="header-stats">
        <span>STUDENTS <span className="stat-val">{studentCount}</span></span>
        <span>PRESENT <span className="stat-val">{presentCount}</span></span>
        <span>TOP XP <span className="stat-val">{topXP ?? '—'}</span></span>
      </div>
      <div id="header-actions">
        <button className="btn btn-accent" onClick={onAddStudent}>＋ Add Student</button>
        <button className="btn" onClick={onLeaderboardMode}>⛶ Board Mode</button>
        <button className="btn" onClick={onExport}>↓ Export</button>
        <button className="btn btn-danger" onClick={onResetAll}>⚠ Reset All</button>
        <button className="btn" onClick={onSignOut} title="Sign out">⎋ Sign Out</button>
      </div>
    </header>
  )
}
