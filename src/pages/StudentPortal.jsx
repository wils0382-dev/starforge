import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  getLevel, getLPEarned, getLPSpent, getLPBalance,
  getOwnedCount, hpClass, xpLevelPct, XP_PER_LEVEL, MAX_HP
} from '../lib/gameUtils'

const AVATARS = [
  '🚀','🛸','⚡','🌟','🔮','🤖','🛡️','⚔️','🌙','🪐',
  '🌌','🔭','🦾','🧬','🎯','💫','🌀','🔥','❄️','🌊',
  '👾','🎮','🎲','🏆','🐉','🦅','🌈','☄️','🔱','💎'
]

export default function StudentPortal() {
  const [code, setCode]           = useState('')
  const [student, setStudent]     = useState(null)
  const [abilities, setAbilities] = useState([])
  const [classData, setClassData] = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [toasts, setToasts]       = useState([])
  const [confirm, setConfirm]     = useState(null)

  // Avatar + alias state
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const [aliasInput, setAliasInput]             = useState('')
  const [aliasSaving, setAliasSaving]           = useState(false)

  const channelRef = useRef(null)
  let _toastId = 0

  function addToast(msg, type = '') {
    const id = ++_toastId
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800)
  }

  // ── Login ──────────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const cleaned = code.trim().toUpperCase()
    const { data: studentData, error: sErr } = await supabase
      .from('students')
      .select('*, student_abilities(ability_id, quantity)')
      .eq('student_code', cleaned)
      .single()

    if (sErr || !studentData) {
      setError('Code not found. Check with your teacher.')
      setLoading(false)
      return
    }

    const { data: cls } = await supabase
      .from('classes')
      .select('name')
      .eq('id', studentData.class_id)
      .single()

    const { data: abs } = await supabase
      .from('abilities')
      .select('*')
      .eq('class_id', studentData.class_id)
      .eq('available', true)
      .order('sort_order')

    setStudent(studentData)
    setClassData(cls)
    setAbilities(abs ?? [])
    setLoading(false)
  }

  // ── Realtime ───────────────────────────────────────────────────
  useEffect(() => {
    if (!student) return
    const channel = supabase
      .channel('student-portal-' + student.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'students',
        filter: `id=eq.${student.id}`
      }, (payload) => {
        const prev = student
        setStudent(s => ({ ...s, ...payload.new }))
        if (payload.new.xp > prev.xp)
          addToast(`+${payload.new.xp - prev.xp} XP received!`, 'ok')
        if (payload.new.hp < prev.hp)
          addToast(`HP changed: ${payload.new.hp}/${MAX_HP}`, 'err')
        if (payload.new.alias && !prev.alias)
          addToast(`✓ Your alias "${payload.new.alias}" was approved!`, 'ok')
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'student_abilities',
        filter: `student_id=eq.${student.id}`
      }, async () => {
        const { data } = await supabase
          .from('student_abilities')
          .select('ability_id, quantity')
          .eq('student_id', student.id)
        setStudent(s => ({ ...s, student_abilities: data ?? [] }))
      })
      .subscribe()

    channelRef.current = channel
    return () => supabase.removeChannel(channel)
  }, [student?.id])

  // ── Avatar change (immediate, no approval needed) ───────────────
  async function changeAvatar(emoji) {
    setAvatarPickerOpen(false)
    setStudent(s => ({ ...s, avatar_emoji: emoji }))
    await supabase.from('students').update({ avatar_emoji: emoji }).eq('id', student.id)
  }

  // ── Alias submission (requires teacher approval) ────────────────
  async function submitAlias(e) {
    e.preventDefault()
    const trimmed = aliasInput.trim()
    if (!trimmed) return
    if (trimmed.length < 2) { addToast('Alias must be at least 2 characters', 'err'); return }
    setAliasSaving(true)
    const { error } = await supabase
      .from('students')
      .update({ alias_pending: trimmed })
      .eq('id', student.id)
    if (error) {
      addToast('Could not submit alias. Try again.', 'err')
    } else {
      setStudent(s => ({ ...s, alias_pending: trimmed }))
      addToast('Alias submitted — waiting for teacher approval', 'ok')
      setAliasInput('')
    }
    setAliasSaving(false)
  }

  // ── Purchase flow ──────────────────────────────────────────────
  function startPurchase(ability) {
    const lp = getLPBalance(student, abilities)
    if (lp < ability.cost) { addToast('Not enough Level Points!', 'err'); return }
    const owned = getOwnedCount(student, ability.id)
    if (ability.max_owned > 0 && owned >= ability.max_owned) { addToast('You already own the maximum!', 'err'); return }
    setConfirm(ability)
  }

  async function confirmPurchase() {
    const ab = confirm
    setConfirm(null)
    if (!ab) return
    const lp = getLPBalance(student, abilities)
    if (lp < ab.cost) { addToast('Not enough Level Points!', 'err'); return }

    const existing = student.student_abilities?.find(sa => sa.ability_id === ab.id)
    if (existing) {
      const { error } = await supabase
        .from('student_abilities')
        .update({ quantity: existing.quantity + 1 })
        .eq('student_id', student.id)
        .eq('ability_id', ab.id)
      if (error) { addToast('Purchase failed', 'err'); return }
      setStudent(s => ({
        ...s,
        student_abilities: s.student_abilities.map(sa =>
          sa.ability_id === ab.id ? { ...sa, quantity: sa.quantity + 1 } : sa
        )
      }))
    } else {
      const { error } = await supabase
        .from('student_abilities')
        .insert({ student_id: student.id, ability_id: ab.id, quantity: 1 })
      if (error) { addToast('Purchase failed', 'err'); return }
      setStudent(s => ({
        ...s,
        student_abilities: [...(s.student_abilities ?? []), { ability_id: ab.id, quantity: 1 }]
      }))
    }

    addToast(`✓ ${ab.name} unlocked!`, 'ok')
    setTimeout(() => {
      const card = document.getElementById('shop-card-' + ab.id)
      if (card) { card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 650) }
    }, 50)
  }

  // ── Login screen ───────────────────────────────────────────────
  if (!student) {
    return (
      <div className="student-page">
        <div className="student-app">
          <div className="portal-header">
            <div className="portal-logo">STAR<span>FORGE</span></div>
          </div>
          <div className="student-login">
            <div className="student-login-box">
              <h2>ENTER YOUR CODE</h2>
              <p>YOUR PORTAL ACCESS CODE</p>
              <form onSubmit={handleLogin}>
                {error && (
                  <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 'var(--radius)', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--hp)', marginBottom: 12 }}>
                    {error}
                  </div>
                )}
                <input
                  className="code-input"
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX"
                  maxLength={9}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                />
                <button className="enter-btn" type="submit" disabled={loading || code.length < 4}>
                  {loading ? 'SEARCHING...' : 'ENTER PORTAL'}
                </button>
              </form>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', letterSpacing: 1 }}>
              Ask your teacher for your code if you don't have one.
            </div>
          </div>
        </div>
        <div id="toast-container">
          {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
        </div>
      </div>
    )
  }

  // ── Portal view ────────────────────────────────────────────────
  const s = student
  const level = getLevel(s.xp)
  const lp = getLPBalance(s, abilities)
  const lpEarned = getLPEarned(s.xp)
  const lpSpent = getLPSpent(s.student_abilities, abilities)
  const xpIntoLevel = s.xp % XP_PER_LEVEL
  const xpToNext = XP_PER_LEVEL - xpIntoLevel
  const levelPct = xpLevelPct(s.xp)
  const hpPct = Math.round((s.hp / MAX_HP) * 100)
  const displayAlias = s.alias || s.name.split(' ')[0]
  const availableAbilities = abilities.filter(a => a.available)
  const ownedAbilities = s.student_abilities?.filter(sa => sa.quantity > 0) ?? []

  return (
    <div className="student-page">
      <div className="student-app">

        {/* Header */}
        <div className="portal-header">
          <div className="portal-logo">STAR<span>FORGE</span></div>
          {classData && <div className="portal-class">{classData.name}</div>}
        </div>

        {!s.present && <div className="absent-banner">MARKED ABSENT TODAY</div>}

        {/* ── Hero card ──────────────────────────────────────── */}
        <div id="hero-card">
          <div className="hero-top">

            {/* Avatar — click to change */}
            <div style={{ position: 'relative' }}>
              <div
                className="hero-avatar"
                onClick={() => setAvatarPickerOpen(p => !p)}
                title="Click to change avatar"
                style={{ cursor: 'pointer', fontSize: 32 }}
              >
                {s.avatar_emoji ?? '🚀'}
              </div>
              <div style={{ position: 'absolute', bottom: -4, right: -4, background: 'var(--lp-dim)', border: '1px solid var(--lp)', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, cursor: 'pointer' }}
                onClick={() => setAvatarPickerOpen(p => !p)}>✏️</div>

              {/* Avatar picker dropdown */}
              {avatarPickerOpen && (
                <div className="avatar-picker">
                  <div className="avatar-picker-title">Choose your avatar</div>
                  <div className="avatar-picker-grid">
                    {AVATARS.map(emoji => (
                      <button
                        key={emoji}
                        className={`avatar-option ${s.avatar_emoji === emoji ? 'selected' : ''}`}
                        onClick={() => changeAvatar(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="hero-identity">
              <div className="hero-name">{displayAlias}</div>
              <div className="hero-subtitle">
                {s.alias
                  ? `ALIAS ACTIVE · ${s.present ? 'ONLINE' : 'ABSENT'}`
                  : `STUDENT · ${s.present ? 'ACTIVE' : 'ABSENT'}`
                }
              </div>
            </div>

            <div className="hero-lp">
              <div className="lp-number">{lp}</div>
              <div className="lp-label">◈ LEVEL POINTS</div>
            </div>
          </div>

          {/* Stat bars */}
          <div className="stat-bars">
            <div className="stat-row">
              <span className="stat-label xp">XP</span>
              <div className="stat-track">
                <div className="stat-fill xp" style={{ width: levelPct + '%' }} />
              </div>
              <span className="stat-val xp">{s.xp} XP</span>
            </div>
            <div className="stat-row">
              <span className="stat-label hp">HP</span>
              <div className="stat-track">
                <div className={`stat-fill ${hpClass(s.hp)}`} style={{ width: hpPct + '%' }} />
              </div>
              <span className="stat-val hp">{s.hp} / {MAX_HP}</span>
            </div>
          </div>

          {/* Level progress */}
          <div className="level-section">
            <div className="level-badge-big">LEVEL {level}</div>
            <div className="level-progress-wrap">
              <div className="level-progress-label">
                <span>{xpIntoLevel} XP into level {level}</span>
                <span>{xpToNext} XP to level {level + 1}</span>
              </div>
              <div className="level-track">
                <div className="level-fill" style={{ width: levelPct + '%' }} />
              </div>
            </div>
          </div>

          <div className="lp-summary">
            TOTAL LP EARNED: {lpEarned} &nbsp;·&nbsp; SPENT: {lpSpent} &nbsp;·&nbsp; AVAILABLE: {lp}
          </div>
        </div>

        {/* ── Identity section ────────────────────────────────── */}
        <div className="section-header">
          <div className="section-title" style={{ color: 'var(--accent)' }}>◉ Identity</div>
          <div className="section-line" />
        </div>

        <div className="identity-panel">
          <div className="identity-status">
            {s.alias ? (
              <>
                <span className="id-status-dot approved" />
                <span>Your alias <strong style={{ color: 'var(--owned)' }}>"{s.alias}"</strong> is active and showing on the leaderboard.</span>
              </>
            ) : s.alias_pending ? (
              <>
                <span className="id-status-dot pending" />
                <span>
                  Alias <strong style={{ color: 'var(--xp)' }}>"{s.alias_pending}"</strong> is waiting for teacher approval.
                  {' '}Submit a new one below to change your request.
                </span>
              </>
            ) : (
              <>
                <span className="id-status-dot none" />
                <span>No alias set yet. Your first name shows on the leaderboard until you set one.</span>
              </>
            )}
          </div>

          <form className="alias-form" onSubmit={submitAlias}>
            <input
              type="text"
              className="alias-input"
              placeholder={s.alias_pending ? `Change request: "${s.alias_pending}"` : 'Choose a username...'}
              value={aliasInput}
              onChange={e => setAliasInput(e.target.value)}
              maxLength={20}
              minLength={2}
            />
            <button className="alias-submit-btn" type="submit" disabled={aliasSaving || !aliasInput.trim()}>
              {aliasSaving ? '...' : s.alias_pending || s.alias ? 'Request Change' : 'Submit for Approval'}
            </button>
          </form>

          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)', letterSpacing: 1, marginTop: 8 }}>
            Your teacher must approve your alias before it appears on the leaderboard. Avatars update immediately.
          </div>
        </div>

        {/* ── Ability shop ────────────────────────────────────── */}
        <div className="section-header" style={{ marginTop: 32 }}>
          <div className="section-title abilities">◈ Ability Shop</div>
          <div className="section-line" />
          <div className="section-count">{lp} LP available</div>
        </div>

        <div id="shop-grid">
          {availableAbilities.length === 0 ? (
            <div className="no-lp-msg"><strong>SHOP COMING SOON</strong>Your teacher hasn't enabled any abilities yet.</div>
          ) : lp === 0 && lpEarned === 0 ? (
            <div className="no-lp-msg"><strong>LEVEL UP TO EARN POINTS</strong>You earn 1 Level Point every time you gain a level. Reach Level 2 to unlock your first point!</div>
          ) : (
            availableAbilities.map(ab => {
              const owned = getOwnedCount(s, ab.id)
              const isMaxed = ab.max_owned > 0 && owned >= ab.max_owned
              const canAfford = lp >= ab.cost
              const cardClass = isMaxed ? 'maxed' : canAfford ? 'can-afford' : 'cant-afford'
              const maxLabel = ab.max_owned > 0 ? `Max ${ab.max_owned}` : 'Unlimited'
              return (
                <div key={ab.id} className={`shop-card ${cardClass}`} id={`shop-card-${ab.id}`}>
                  <div className="shop-card-glow" />
                  <div className="shop-icon">{ab.icon}</div>
                  <div className="shop-name">{ab.name}</div>
                  <div className="shop-desc">{ab.description}</div>
                  <div className="shop-footer">
                    <div>
                      <div className="shop-cost"><span className="lp-icon">◈</span> {ab.cost} LP · {maxLabel}</div>
                      {owned > 0 && <div className="shop-owned-count" style={{ marginTop: 4 }}>Owned: {owned}</div>}
                    </div>
                    {isMaxed
                      ? <button className="buy-btn maxed-btn" disabled>✓ MAXED</button>
                      : canAfford
                      ? <button className="buy-btn active" onClick={() => startPurchase(ab)}>BUY</button>
                      : <button className="buy-btn disabled" disabled>NEED {ab.cost} LP</button>
                    }
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ── Owned abilities ──────────────────────────────────── */}
        <div className="section-header">
          <div className="section-title owned">✓ Your Abilities</div>
          <div className="section-line" />
          <div className="section-count">{ownedAbilities.length} unlocked</div>
        </div>

        <div id="owned-grid">
          {ownedAbilities.length === 0 ? (
            <div className="empty-owned">No abilities unlocked yet — spend your Level Points in the shop above!</div>
          ) : (
            ownedAbilities.map(sa => {
              const ab = abilities.find(a => a.id === sa.ability_id)
              if (!ab) return null
              return (
                <div key={sa.ability_id} className="owned-card">
                  <div className="owned-icon">{ab.icon}</div>
                  <div className="owned-info">
                    <div className="owned-name">{ab.name}</div>
                    <div className="owned-count">×{sa.quantity}</div>
                    <div className="owned-count-label">TOKENS OWNED</div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Purchase confirm */}
      {confirm && (
        <div className="confirm-overlay open" onClick={e => { if (e.target === e.currentTarget) setConfirm(null) }}>
          <div className="confirm-box">
            <div className="cb-icon">{confirm.icon}</div>
            <h3>PURCHASE ABILITY?</h3>
            <p style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-head)', letterSpacing: 1 }}>{confirm.name}</p>
            <p>{confirm.description}</p>
            <div className="confirm-cost">◈ {confirm.cost} LP</div>
            <div className="confirm-actions">
              <button className="cb-btn cb-cancel" onClick={() => setConfirm(null)}>Cancel</button>
              <button className="cb-btn cb-confirm" onClick={confirmPurchase}>Purchase</button>
            </div>
          </div>
        </div>
      )}

      {/* Close avatar picker on outside click */}
      {avatarPickerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setAvatarPickerOpen(false)} />
      )}

      <div id="toast-container">
        {toasts.map(t => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </div>
  )
}
