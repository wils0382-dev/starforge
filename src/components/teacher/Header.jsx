import { useState } from 'react'

function ClassSwitcher({ allClasses, classData, onSwitchClass, onRename, onCreateClass }) {
  const [open, setOpen]             = useState(false)
  const [renaming, setRenaming]     = useState(false)
  const [renameVal, setRenameVal]   = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName]       = useState('')

  function startRename(e) {
    e.stopPropagation()
    setRenameVal(classData?.name ?? '')
    setRenaming(true)
    setOpen(false)
  }

  function commitRename() {
    const trimmed = renameVal.trim()
    if (trimmed && trimmed !== classData?.name) onRename(trimmed)
    setRenaming(false)
  }

  function handleCreateSubmit() {
    if (!newName.trim()) return
    onCreateClass(newName.trim())
    setNewName('')
    setShowNewForm(false)
    setOpen(false)
  }

  if (renaming) {
    return (
      <input
        id="class-title"
        type="text"
        value={renameVal}
        maxLength={40}
        autoFocus
        onChange={e => setRenameVal(e.target.value)}
        onBlur={commitRename}
        onKeyDown={e => {
          if (e.key === 'Enter') e.target.blur()
          if (e.key === 'Escape') setRenaming(false)
        }}
      />
    )
  }

  return (
    <div className="class-switcher">
      <button className="cs-btn" onClick={() => { setOpen(p => !p); setShowNewForm(false) }}>
        <span className="cs-name">{classData?.name ?? 'My Class'}</span>
        <span className="cs-chevron">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <>
          <div className="cs-backdrop" onClick={() => setOpen(false)} />
          <div className="cs-dropdown">
            <div className="cs-label">YOUR CLASSES</div>
            {allClasses.map(cls => (
              <button
                key={cls.id}
                className={`cs-item ${cls.id === classData?.id ? 'active' : ''}`}
                onClick={() => { if (cls.id !== classData?.id) onSwitchClass(cls.id); setOpen(false) }}
              >
                <span className="cs-item-name">{cls.name}</span>
                {cls.id === classData?.id && (
                  <span className="cs-rename-btn" onClick={startRename} title="Rename">✏</span>
                )}
              </button>
            ))}

            <div className="cs-divider" />

            {showNewForm ? (
              <div className="cs-new-form">
                <input
                  autoFocus
                  placeholder="Class name..."
                  value={newName}
                  maxLength={40}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateSubmit()
                    if (e.key === 'Escape') setShowNewForm(false)
                  }}
                  onClick={e => e.stopPropagation()}
                />
                <button className="cs-create-btn" onClick={handleCreateSubmit} disabled={!newName.trim()}>
                  Create
                </button>
              </div>
            ) : (
              <button className="cs-item cs-new-class" onClick={() => setShowNewForm(true)}>
                ＋ New Class
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function Header({
  allClasses, classData,
  onSwitchClass, onCreateClass, onRename,
  studentCount, presentCount, topXP,
  onNewLesson,
  onAddStudent, onLeaderboardMode, onExport, onResetAll, onSignOut,
  windowOpen, onOpenWindow
}) {
  return (
    <header id="header">
      <div id="logo">STAR<span>FORGE</span></div>

      <ClassSwitcher
        allClasses={allClasses}
        classData={classData}
        onSwitchClass={onSwitchClass}
        onRename={onRename}
        onCreateClass={onCreateClass}
      />

      <div id="header-stats">
        <span>STUDENTS <span className="stat-val">{studentCount}</span></span>
        <span>PRESENT <span className="stat-val">{presentCount}</span></span>
        <span>TOP XP <span className="stat-val">{topXP ?? '—'}</span></span>
      </div>
      <div id="header-actions">
        <button className="btn btn-lesson" onClick={onNewLesson}>📖 New Lesson</button>
        <button className="btn btn-accent" onClick={onAddStudent}>＋ Add Student</button>
        {!windowOpen && (
          <button className="btn btn-window" onClick={onOpenWindow}>⚡ Window</button>
        )}
        {windowOpen && (
          <span className="btn btn-window-live">⚡ LIVE</span>
        )}
        <button className="btn" onClick={onLeaderboardMode}>⛶ Board Mode</button>
        <button className="btn" onClick={onExport}>↓ Export</button>
        <button className="btn btn-danger" onClick={onResetAll}>⚠ Reset All</button>
        <button className="btn" onClick={onSignOut} title="Sign out">⎋ Sign Out</button>
      </div>
    </header>
  )
}
