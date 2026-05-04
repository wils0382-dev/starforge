import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import {
  getLevel, getLPEarned, getLPSpent, getLPBalance,
  getOwnedCount, hpClass, xpLevelPct, XP_PER_LEVEL, MAX_HP, MAX_AP
} from '../lib/gameUtils'

// ── Prerequisite helpers ───────────────────────────────────────────
function prerequisiteName(name) {
  if (name.endsWith(' III')) return name.replace(/ III$/, ' II')
  if (name.endsWith(' II'))  return name.replace(/ II$/, ' I')
  return null
}
function hasPrerequisite(ability, studentAbilities, allAbilities) {
  const prereq = prerequisiteName(ability.name)
  if (!prereq) return true
  const prereqAbility = allAbilities.find(a => a.name === prereq)
  if (!prereqAbility) return true
  return studentAbilities.some(sa => sa.ability_id === prereqAbility.id && sa.quantity > 0)
}

// ── Emoji avatars ──────────────────────────────────────────────────
const AVATARS = [
  '🚀','🛸','⚡','🌟','🔮','🤖','🛡️','⚔️','🌙','🪐',
  '🌌','🔭','🦾','🧬','🎯','💫','🌀','🔥','❄️','🌊',
  '👾','🎮','🎲','🏆','🐉','🦅','🌈','☄️','🔱','💎'
]

// ── Anytime ability definitions ────────────────────────────────────
// needsTarget: null | 'ally' | 'ally_or_self' | 'koed_ally'
// effect: 'heal' | 'revive' | 'heal_all' | 'ap' | 'transfer_ap' | 'social' | 'xp_bonus'
const ANYTIME = {
  'Repair I':          { needsTarget: 'ally_or_self', effect: 'heal',        value: 25 },
  'Repair II':         { needsTarget: 'ally_or_self', effect: 'heal',        value: 40 },
  'Critical Repairs':  { needsTarget: 'koed_ally',    effect: 'revive',      value: 25 },
  'Nano Cloud':        { needsTarget: null,            effect: 'heal_all',    value: 30 },
  'Power Tap':         { needsTarget: 'ally',          effect: 'transfer_ap', give: 40 },
  'Power Up':          { needsTarget: 'ally',          effect: 'social',      note: "Double an ally's next ability" },
  'Overcharge':        { needsTarget: null,            effect: 'social',      note: 'All allies attack twice next hit' },
  'Data Hack':         { needsTarget: null,            effect: 'xp_bonus',   note: '+10% XP to a completed task — teacher will apply' },
  'Invisibility':      { needsTarget: null,            effect: 'social',      note: 'Permission: listen to music this lesson' },
  'Feast':             { needsTarget: null,            effect: 'social',      note: 'Permission: eat during class' },
  'Cloak & Disappear': { needsTarget: null,            effect: 'social',      note: 'Permission: leave room for 10 minutes' },
  'Energy Surge':      { needsTarget: null,            effect: 'ap',          value: 30 },
}

// Window abilities that need a target selected before activating
const WINDOW_NEEDS_TARGET = {
  'Guardian I': 'ally', 'Guardian II': 'ally', 'Guardian III': 'ally',
  'Intercept': 'ally',
  'Repair I': 'ally_or_self', 'Repair II': 'ally_or_self',
  'Critical Repairs': 'ally',
  'Power Tap': 'ally',
  'Power Up': 'ally',
}

function getDisplayName(s) {
  return s?.alias || s?.name?.split(' ')[0] || '?'
}

function getLeaderboardSlice(allStudents, myId, window = 3) {
  const sorted = [...allStudents].filter(s => s.present).sort((a, b) => b.xp - a.xp)
  const myIndex = sorted.findIndex(s => s.id === myId)
  const total = sorted.length
  if (total <= 7) return { visible: sorted, start: 0, myIndex, total }
  const start = Math.max(0, Math.min(myIndex - window, total - 7))
  return { visible: sorted.slice(start, start + 7), start, myIndex, total }
}

export default function StudentPortal() {
  const [code, setCode]           = useState('')
  const [student, setStudent]     = useState(null)
  const [abilities, setAbilities] = useState([])
  const [classData, setClassData] = useState(null)
  const [classmates, setClassmates] = useState([])
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [toasts, setToasts]       = useState([])
  const [confirm, setConfirm]     = useState(null)     // purchase confirm
  const [anytimeConfirm, setAnytimeConfirm] = useState(null) // { ability, target }
  const [squadron, setSquadron]   = useState(null)

  // Avatar + alias state
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false)
  const [aliasInput, setAliasInput]             = useState('')
  const [aliasSaving, setAliasSaving]           = useState(false)
  const [uploadingAvatar, setUploadingAvatar]   = useState(false)
  const avatarInputRef = useRef(null)

  // Ability window state
  const [windowOpen, setWindowOpen]               = useState(false)
  const [windowMessage, setWindowMessage]         = useState('')
  const [windowExpiresAt, setWindowExpiresAt]     = useState(null)
  const [windowEventData, setWindowEventData]     = useState(null)
  const [windowSecondsLeft, setWindowSecondsLeft] = useState(0)
  const [activatedAbility, setActivatedAbility]   = useState(null)

  // Target picker state (for both window and anytime)
  const [pendingTarget, setPendingTarget] = useState(null) // { ability, context, targetType }

  const channelRef = useRef(null)
  const windowChannelRef = useRef(null)
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
      .select('name, window_open, window_message, window_expires_at, event_data')
      .eq('id', studentData.class_id)
      .single()

    const { data: abs } = await supabase
      .from('abilities')
      .select('*')
      .eq('class_id', studentData.class_id)
      .eq('available', true)
      .order('sort_order')

    // Load classmates (all students in class, lightweight)
    const { data: peers } = await supabase
      .from('students')
      .select('id, name, alias, avatar_emoji, avatar_url, xp, hp, ap, present')
      .eq('class_id', studentData.class_id)
      .order('xp', { ascending: false })

    setStudent(studentData)
    setClassData(cls)
    setAbilities(abs ?? [])
    setClassmates(peers ?? [])

    if (cls?.window_open && cls?.window_expires_at && new Date(cls.window_expires_at) > Date.now()) {
      setWindowOpen(true)
      setWindowMessage(cls.window_message || '')
      setWindowExpiresAt(cls.window_expires_at)
      setWindowEventData(cls.event_data ?? null)
    }

    setLoading(false)
  }

  // ── Ability window broadcast ───────────────────────────────────
  useEffect(() => {
    if (!student) return
    const channel = supabase
      .channel('ability-window-' + student.class_id)
      .on('broadcast', { event: 'window_open' }, ({ payload }) => {
        setWindowOpen(true)
        setWindowMessage(payload.message || '')
        setWindowExpiresAt(payload.expiresAt)
        setWindowEventData(payload.event_data ?? null)
        setActivatedAbility(null)
        addToast('⚡ Ability window open!', 'ok')
      })
      .on('broadcast', { event: 'window_closed' }, () => {
        setWindowOpen(false)
        setActivatedAbility(null)
      })
      .on('broadcast', { event: 'anytime_revoked' }, ({ payload }) => {
        if (payload.studentId === student.id) {
          addToast(`↩ ${payload.abilityName} was revoked by your teacher — token returned.`, 'err')
        }
      })
      .subscribe()
    windowChannelRef.current = channel
    return () => { supabase.removeChannel(channel); windowChannelRef.current = null }
  }, [student?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Window countdown timer ─────────────────────────────────────
  useEffect(() => {
    if (!windowOpen || !windowExpiresAt) return
    function tick() {
      const remaining = Math.max(0, Math.round((new Date(windowExpiresAt) - Date.now()) / 1000))
      setWindowSecondsLeft(remaining)
      if (remaining === 0) { setWindowOpen(false); setActivatedAbility(null) }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [windowOpen, windowExpiresAt])

  // ── Squadron ───────────────────────────────────────────────────
  useEffect(() => {
    if (!student?.squadron_id) { setSquadron(null); return }
    supabase.from('squadrons').select('*').eq('id', student.squadron_id).single()
      .then(({ data }) => setSquadron(data ?? null))
  }, [student?.squadron_id])

  // ── Realtime (self + classmates) ───────────────────────────────
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
        event: 'UPDATE', schema: 'public', table: 'students',
        filter: `class_id=eq.${student.class_id}`
      }, async () => {
        // Refresh classmates list on any class-wide update
        const { data } = await supabase
          .from('students')
          .select('id, name, alias, avatar_emoji, avatar_url, xp, hp, ap, present')
          .eq('class_id', student.class_id)
          .order('xp', { ascending: false })
        setClassmates(data ?? [])
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
  }, [student?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Avatar — emoji ─────────────────────────────────────────────
  async function changeAvatar(emoji) {
    setAvatarPickerOpen(false)
    setStudent(s => ({ ...s, avatar_emoji: emoji, avatar_url: null }))
    await supabase.from('students')
      .update({ avatar_emoji: emoji, avatar_url: null })
      .eq('id', student.id)
  }

  // ── Avatar — image upload ──────────────────────────────────────
  async function uploadAvatar(file) {
    if (!file) return
    if (file.size > 3 * 1024 * 1024) {
      addToast('Image must be under 3 MB', 'err'); return
    }
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop().toLowerCase() || 'jpg'
    const path = `${student.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage
      .from('student-avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) {
      addToast('Upload failed — check storage is configured', 'err')
      setUploadingAvatar(false)
      return
    }
    const { data: urlData } = supabase.storage.from('student-avatars').getPublicUrl(path)
    const publicUrl = urlData.publicUrl + '?t=' + Date.now()
    await supabase.from('students').update({ avatar_url: publicUrl }).eq('id', student.id)
    setStudent(s => ({ ...s, avatar_url: publicUrl }))
    setAvatarPickerOpen(false)
    setUploadingAvatar(false)
    addToast('✓ Avatar updated!', 'ok')
  }

  // ── Alias ──────────────────────────────────────────────────────
  async function submitAlias(e) {
    e.preventDefault()
    const trimmed = aliasInput.trim()
    if (!trimmed) return
    if (trimmed.length < 2) { addToast('Alias must be at least 2 characters', 'err'); return }
    setAliasSaving(true)
    const { error } = await supabase.from('students')
      .update({ alias_pending: trimmed }).eq('id', student.id)
    if (error) {
      addToast('Could not submit alias. Try again.', 'err')
    } else {
      setStudent(s => ({ ...s, alias_pending: trimmed }))
      addToast('Alias submitted — waiting for teacher approval', 'ok')
      setAliasInput('')
    }
    setAliasSaving(false)
  }

  // ── Window ability activation ──────────────────────────────────
  function handleWindowAbilityClick(ability) {
    if (!windowChannelRef.current || activatedAbility) return
    const targetType = WINDOW_NEEDS_TARGET[ability.name]
    if (targetType) {
      setPendingTarget({ ability, context: 'window', targetType })
    } else {
      activateInWindow(ability, null)
    }
  }

  function activateInWindow(ability, target) {
    if (!windowChannelRef.current || activatedAbility) return
    const cost = ability.ap_cost ?? 0
    if (cost > 0 && (student.ap ?? MAX_AP) < cost) {
      addToast(`Not enough AP — need ${cost}, you have ${student.ap ?? MAX_AP}.`, 'err')
      return
    }
    windowChannelRef.current.send({
      type: 'broadcast',
      event: 'ability_activated',
      payload: {
        activatorId: student.id,
        activatorName: getDisplayName(student),
        abilityId: ability.id,
        abilityName: ability.name,
        abilityIcon: ability.icon,
        apCost: cost,
        targetId: target?.id ?? null,
        targetName: target ? getDisplayName(target) : null,
      }
    })
    setActivatedAbility(ability)
    setPendingTarget(null)
    addToast(`⚡ ${ability.name} activated!`, 'ok')
  }

  // ── Anytime ability USE ────────────────────────────────────────
  function startAnytimeUse(ability) {
    const def = ANYTIME[ability.name]
    if (!def) return
    const apCost = ability.ap_cost ?? 0
    if (apCost > 0 && (student.ap ?? MAX_AP) < apCost) {
      addToast(`Not enough AP — need ${apCost}, you have ${student.ap ?? MAX_AP}.`, 'err')
      return
    }
    const owned = getOwnedCount(student, ability.id)
    if (owned < 1) { addToast('No tokens remaining!', 'err'); return }

    if (def.needsTarget) {
      setPendingTarget({ ability, context: 'anytime', targetType: def.needsTarget })
    } else {
      setAnytimeConfirm({ ability, target: null })
    }
  }

  function onTargetSelect(target) {
    const { ability, context } = pendingTarget
    setPendingTarget(null)
    if (context === 'window') {
      activateInWindow(ability, target)
    } else {
      setAnytimeConfirm({ ability, target })
    }
  }

  async function executeAnytimeAbility(ability, target) {
    setAnytimeConfirm(null)
    const def = ANYTIME[ability.name]
    if (!def) return

    const apCost = ability.ap_cost ?? 0
    const selfAP = student.ap ?? MAX_AP
    const snapshots = {}
    const updates = {}

    // Build snapshots and DB updates based on effect type
    snapshots[student.id] = { ap: selfAP }

    switch (def.effect) {
      case 'heal': {
        const isMe = !target || target.id === student.id
        const currentHP = isMe ? student.hp : (classmates.find(c => c.id === target?.id)?.hp ?? 0)
        const tid = target?.id ?? student.id
        snapshots[tid] = { ...(snapshots[tid] ?? {}), hp: currentHP }
        updates[tid] = { hp: Math.min(currentHP + def.value, MAX_HP) }
        updates[student.id] = { ...(updates[student.id] ?? {}), ap: Math.max(0, selfAP - apCost) }
        break
      }
      case 'revive': {
        const t = classmates.find(c => c.id === target?.id)
        if (t) snapshots[t.id] = { hp: t.hp }
        if (target?.id) updates[target.id] = { hp: 25 }
        updates[student.id] = { ...(updates[student.id] ?? {}), ap: Math.max(0, selfAP - apCost) }
        break
      }
      case 'heal_all': {
        const presentPeers = classmates.filter(c => c.present)
        for (const c of presentPeers) {
          snapshots[c.id] = { hp: c.hp }
          updates[c.id] = { hp: Math.min(c.hp + def.value, MAX_HP) }
        }
        snapshots[student.id] = { ap: selfAP, hp: student.hp }
        updates[student.id] = {
          hp: Math.min(student.hp + def.value, MAX_HP),
          ap: Math.max(0, selfAP - apCost),
        }
        break
      }
      case 'ap': {
        // Energy Surge: gain AP (ap_cost is 0)
        updates[student.id] = { ap: Math.min(selfAP + def.value, MAX_AP) }
        break
      }
      case 'transfer_ap': {
        const targetAP = classmates.find(c => c.id === target?.id)?.ap ?? MAX_AP
        snapshots[target.id] = { ap: targetAP }
        updates[student.id] = { ap: Math.max(0, selfAP - apCost) }
        if (target?.id) updates[target.id] = { ap: Math.min(targetAP + def.give, MAX_AP) }
        break
      }
      case 'social':
      case 'xp_bonus': {
        updates[student.id] = { ap: Math.max(0, selfAP - apCost) }
        break
      }
    }

    // Apply DB updates
    for (const [sid, update] of Object.entries(updates)) {
      await supabase.from('students').update(update).eq('id', sid)
    }

    // Decrement token
    const sa = student.student_abilities?.find(x => x.ability_id === ability.id)
    if (sa) {
      if (sa.quantity > 1) {
        await supabase.from('student_abilities')
          .update({ quantity: sa.quantity - 1 })
          .eq('student_id', student.id).eq('ability_id', ability.id)
      } else {
        await supabase.from('student_abilities')
          .delete()
          .eq('student_id', student.id).eq('ability_id', ability.id)
      }
    }

    // Update local student state optimistically
    setStudent(s => {
      let next = { ...s }
      if (updates[s.id]) next = { ...next, ...updates[s.id] }
      const sas = (s.student_abilities ?? [])
        .map(x => x.ability_id === ability.id ? (x.quantity > 1 ? { ...x, quantity: x.quantity - 1 } : null) : x)
        .filter(Boolean)
      next.student_abilities = sas
      return next
    })

    // Update classmates optimistically for heal_all / transfer_ap
    setClassmates(prev => prev.map(c => updates[c.id] ? { ...c, ...updates[c.id] } : c))

    // Broadcast to teacher
    const allTargets = def.effect === 'heal_all'
      ? [{ id: student.id }, ...classmates.filter(c => c.present).map(c => ({ id: c.id }))]
      : null

    windowChannelRef.current?.send({
      type: 'broadcast',
      event: 'anytime_ability_used',
      payload: {
        useId: Math.random().toString(36).substring(2, 10),
        studentId: student.id,
        studentName: getDisplayName(student),
        abilityId: ability.id,
        abilityName: ability.name,
        abilityIcon: ability.icon,
        targetId: target?.id ?? null,
        targetName: target ? getDisplayName(target) : null,
        effectType: def.effect,
        effectValue: def.value ?? null,
        give: def.give ?? null,
        note: def.note ?? null,
        apCost,
        snapshots,
        allTargets,
      }
    })

    const isSocial = def.effect === 'social' || def.effect === 'xp_bonus'
    addToast(
      isSocial
        ? `${ability.icon} ${ability.name} — waiting for teacher to respond`
        : `✓ ${ability.name} used!`,
      'ok'
    )
  }

  // ── Purchase flow ──────────────────────────────────────────────
  function startPurchase(ability) {
    const lp = getLPBalance(student, abilities)
    if (!hasPrerequisite(ability, student.student_abilities ?? [], abilities)) {
      addToast(`Unlock ${prerequisiteName(ability.name)} first!`, 'err'); return
    }
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
      const { error } = await supabase.from('student_abilities')
        .update({ quantity: existing.quantity + 1 })
        .eq('student_id', student.id).eq('ability_id', ab.id)
      if (error) { addToast('Purchase failed', 'err'); return }
      setStudent(s => ({
        ...s,
        student_abilities: s.student_abilities.map(sa =>
          sa.ability_id === ab.id ? { ...sa, quantity: sa.quantity + 1 } : sa
        )
      }))
    } else {
      const { error } = await supabase.from('student_abilities')
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
  const ap    = s.ap ?? MAX_AP
  const apPct = Math.round((ap / MAX_AP) * 100)
  const displayAlias = getDisplayName(s)
  const availableAbilities = abilities.filter(a => a.available)
  const ownedAbilities = s.student_abilities?.filter(sa => sa.quantity > 0) ?? []

  // Leaderboard data: merge self into classmates list and sort
  const allForLeaderboard = classmates.map(c =>
    c.id === s.id ? { ...c, ...s } : c
  )
  // If self not in classmates (rare), add manually
  if (!allForLeaderboard.find(c => c.id === s.id)) {
    allForLeaderboard.push({ id: s.id, name: s.name, alias: s.alias, avatar_emoji: s.avatar_emoji, avatar_url: s.avatar_url, xp: s.xp, hp: s.hp, ap: s.ap, present: s.present })
  }
  const { visible: lbVisible, start: lbStart, myIndex: lbMyIndex, total: lbTotal } = getLeaderboardSlice(allForLeaderboard, s.id)

  // Target picker helpers
  const presentClassmates = classmates.filter(c => c.present)
  const koedClassmates    = presentClassmates.filter(c => c.hp === 0)

  function renderAvatarImg(avatarUrl, emoji, size = 28) {
    if (avatarUrl) {
      return <img src={avatarUrl} alt="" className="lb-avatar-img" style={{ width: size, height: size }} />
    }
    return <span className="lb-avatar" style={{ fontSize: size * 0.75 }}>{emoji ?? '🚀'}</span>
  }

  return (
    <div className="student-page">
      <div className="student-app">

        {/* Header */}
        <div className="portal-header">
          <div className="portal-logo">STAR<span>FORGE</span></div>
          {classData && <div className="portal-class">{classData.name}</div>}
        </div>

        {!s.present && <div className="absent-banner">MARKED ABSENT TODAY</div>}

        {/* ── Ability window banner ──────────────────────────── */}
        {windowOpen && (() => {
          const isTargeted = windowEventData?.targets?.some(t => t.studentId === s.id)
          const myDamage   = windowEventData?.targets?.find(t => t.studentId === s.id)?.damage
          return (
          <div className={`student-window-banner ${isTargeted ? 'swb-targeted' : ''} ${windowSecondsLeft <= 30 && windowSecondsLeft > 0 ? 'swb-urgent' : ''}`}>
            <div className="swb-header">
              <span className="swb-icon">{isTargeted ? '🎯' : '⚡'}</span>
              <span className="swb-title">{isTargeted ? 'YOU ARE TARGETED!' : 'ABILITY WINDOW OPEN'}</span>
              <span className={`swb-timer ${windowSecondsLeft <= 30 ? 'urgent' : ''}`}>
                {Math.floor(windowSecondsLeft / 60)}:{String(windowSecondsLeft % 60).padStart(2, '0')}
              </span>
            </div>
            {isTargeted && myDamage > 0 && (
              <div className="swb-incoming">⚠ Incoming: <strong>{myDamage} HP damage</strong> — use an ability to reduce it!</div>
            )}
            {windowMessage && <div className="swb-msg">"{windowMessage}"</div>}
            {activatedAbility ? (
              <div className="swb-done">
                ✓ {activatedAbility.icon} <strong>{activatedAbility.name}</strong> activated — your teacher has been notified!
              </div>
            ) : ownedAbilities.length === 0 ? (
              <div className="swb-empty">You have no abilities to activate right now.</div>
            ) : (
              <div className="swb-abilities">
                <div className="swb-prompt">
                  Use an ability:
                  <span className="swb-ap-balance"> {ap} AP available</span>
                </div>
                {ownedAbilities.map(sa => {
                  const ab = abilities.find(a => a.id === sa.ability_id)
                  if (!ab) return null
                  const cost = ab.ap_cost ?? 0
                  const canAfford = cost === 0 || ap >= cost
                  return (
                    <button
                      key={sa.ability_id}
                      className={`swb-btn ${!canAfford ? 'swb-btn-locked' : ''}`}
                      onClick={() => handleWindowAbilityClick(ab)}
                      disabled={!canAfford}
                    >
                      <span className="swb-btn-icon">{ab.icon}</span>
                      <span className="swb-btn-name">{ab.name}</span>
                      {cost > 0 && (
                        <span className={`swb-btn-ap ${!canAfford ? 'swb-btn-ap-short' : ''}`}>
                          {cost} AP
                        </span>
                      )}
                      <span className="swb-btn-owned">×{sa.quantity}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          )
        })()}

        {/* ── Hero card ──────────────────────────────────────── */}
        <div id="hero-card">
          <div className="hero-top">

            {/* Avatar */}
            <div style={{ position: 'relative' }}>
              <div
                className="hero-avatar"
                onClick={() => setAvatarPickerOpen(p => !p)}
                title="Click to change avatar"
                style={{ cursor: 'pointer', fontSize: 32 }}
              >
                {s.avatar_url
                  ? <img src={s.avatar_url} alt="" className="hero-avatar-img" />
                  : (s.avatar_emoji ?? '🚀')
                }
              </div>
              <div
                style={{ position: 'absolute', bottom: -4, right: -4, background: 'var(--lp-dim)', border: '1px solid var(--lp)', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, cursor: 'pointer' }}
                onClick={() => setAvatarPickerOpen(p => !p)}
              >✏️</div>

              {/* Avatar picker */}
              {avatarPickerOpen && (
                <div className="avatar-picker">
                  <div className="avatar-picker-title">Choose your avatar</div>

                  {/* Upload photo button */}
                  <button
                    className="avatar-upload-btn"
                    disabled={uploadingAvatar}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {uploadingAvatar ? 'Uploading...' : '📷 Upload a photo'}
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => uploadAvatar(e.target.files?.[0])}
                  />

                  <div className="avatar-picker-grid">
                    {AVATARS.map(emoji => (
                      <button
                        key={emoji}
                        className={`avatar-option ${!s.avatar_url && s.avatar_emoji === emoji ? 'selected' : ''}`}
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

          {squadron && (
            <div
              className="hero-squadron"
              style={{ borderColor: squadron.color + '66', background: squadron.color + '14', color: squadron.color }}
            >
              <span className="hero-sq-emoji">{squadron.emoji}</span>
              <span className="hero-sq-name">{squadron.name}</span>
            </div>
          )}

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
            <div className="stat-row">
              <span className="stat-label ap">AP</span>
              <div className="stat-track">
                <div className="stat-fill ap" style={{ width: apPct + '%' }} />
              </div>
              <span className="stat-val ap">{ap} / {MAX_AP}</span>
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

        {/* ── Leaderboard ──────────────────────────────────────── */}
        <div className="section-header" style={{ marginTop: 32 }}>
          <div className="section-title" style={{ color: 'var(--rank)' }}>▲ Leaderboard</div>
          <div className="section-line" />
          <div className="section-count">{lbTotal} present</div>
        </div>

        {lbTotal === 0 ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginBottom: 24 }}>
            No classmates online right now.
          </div>
        ) : (
          <>
            <div className="lb-position-summary">
              You are #{lbMyIndex + 1} of {lbTotal} present students
            </div>
            <div className="lb-portal">
              {lbStart > 0 && (
                <div className="lb-gap">· · · {lbStart} above · · ·</div>
              )}
              {lbVisible.map((c, vi) => {
                const globalRank = lbStart + vi + 1
                const isMe = c.id === s.id
                const rankClass = globalRank === 1 ? 'lb-gold' : globalRank === 2 ? 'lb-silver' : globalRank === 3 ? 'lb-bronze' : ''
                const medal = globalRank === 1 ? '🥇' : globalRank === 2 ? '🥈' : globalRank === 3 ? '🥉' : `#${globalRank}`
                return (
                  <div key={c.id} className={`lb-row ${isMe ? 'lb-me' : ''}`}>
                    <span className={`lb-rank ${rankClass}`}>{medal}</span>
                    {renderAvatarImg(c.avatar_url, c.avatar_emoji, 24)}
                    <span className="lb-name">{getDisplayName(c)}</span>
                    {isMe && <span className="lb-you-badge">YOU</span>}
                    <span className="lb-xp">{c.xp} XP</span>
                  </div>
                )
              })}
              {lbStart + lbVisible.length < lbTotal && (
                <div className="lb-gap">· · · {lbTotal - lbStart - lbVisible.length} below · · ·</div>
              )}
            </div>
          </>
        )}

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
              const isLocked = !hasPrerequisite(ab, s.student_abilities ?? [], abilities)
              const prereq = prerequisiteName(ab.name)
              const cardClass = isLocked ? 'locked' : isMaxed ? 'maxed' : canAfford ? 'can-afford' : 'cant-afford'
              const maxLabel = ab.max_owned > 0 ? `Max ${ab.max_owned}` : 'Unlimited'
              return (
                <div key={ab.id} className={`shop-card ${cardClass}`} id={`shop-card-${ab.id}`}>
                  <div className="shop-card-glow" />
                  <div className="shop-icon">{isLocked ? '🔒' : ab.icon}</div>
                  <div className="shop-name">{ab.name}</div>
                  <div className="shop-desc">{ab.description}</div>
                  {isLocked && <div className="shop-locked-msg">Requires {prereq}</div>}
                  <div className="shop-footer">
                    <div>
                      <div className="shop-cost"><span className="lp-icon">◈</span> {ab.cost} LP · {maxLabel}</div>
                      {owned > 0 && <div className="shop-owned-count" style={{ marginTop: 4 }}>Owned: {owned}</div>}
                    </div>
                    {isLocked
                      ? <button className="buy-btn disabled" disabled>🔒 LOCKED</button>
                      : isMaxed
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
              const def = ANYTIME[ab.name]
              const apCost = ab.ap_cost ?? 0
              const canUse = def && ap >= apCost
              const isSocial = def && (def.effect === 'social' || def.effect === 'xp_bonus')
              return (
                <div key={sa.ability_id} className="owned-card">
                  <div className="owned-icon">{ab.icon}</div>
                  <div className="owned-card-inner">
                    <div className="owned-name">{ab.name}</div>
                    <div className="owned-count">×{sa.quantity}</div>
                    <div className="owned-count-label">TOKENS OWNED</div>
                    {def && (
                      <div className="owned-actions">
                        <button
                          className={`use-btn ${isSocial ? 'use-btn-social' : ''}`}
                          onClick={() => startAnytimeUse(ab)}
                          disabled={!canUse}
                          title={!canUse ? `Need ${apCost} AP (you have ${ap})` : undefined}
                        >
                          USE
                        </button>
                        {apCost > 0 && (
                          <span className="owned-ap-cost">{apCost} AP</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

      </div>{/* end student-app */}

      {/* ── Purchase confirm ─────────────────────────────────────── */}
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

      {/* ── Anytime ability confirm ───────────────────────────────── */}
      {anytimeConfirm && (
        <div className="confirm-overlay open" onClick={e => { if (e.target === e.currentTarget) setAnytimeConfirm(null) }}>
          <div className="confirm-box">
            <div className="cb-icon">{anytimeConfirm.ability.icon}</div>
            <h3>USE ABILITY?</h3>
            <p style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-head)', letterSpacing: 1 }}>
              {anytimeConfirm.ability.name}
              {anytimeConfirm.target && ` → ${getDisplayName(anytimeConfirm.target)}`}
            </p>
            {ANYTIME[anytimeConfirm.ability.name]?.note && (
              <p style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                {ANYTIME[anytimeConfirm.ability.name].note}
              </p>
            )}
            <p>{anytimeConfirm.ability.description}</p>
            {(anytimeConfirm.ability.ap_cost ?? 0) > 0 && (
              <div className="confirm-cost" style={{ color: 'var(--ap)' }}>
                {anytimeConfirm.ability.ap_cost} AP · 1 token consumed
              </div>
            )}
            <div className="confirm-actions">
              <button className="cb-btn cb-cancel" onClick={() => setAnytimeConfirm(null)}>Cancel</button>
              <button className="cb-btn cb-confirm" onClick={() => executeAnytimeAbility(anytimeConfirm.ability, anytimeConfirm.target)}>
                Activate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Target picker ─────────────────────────────────────────── */}
      {pendingTarget && (
        <div className="target-overlay" onClick={e => { if (e.target === e.currentTarget) setPendingTarget(null) }}>
          <div className="target-box">
            <h3>
              {pendingTarget.ability.icon} {pendingTarget.ability.name}
            </h3>
            <p>SELECT A TARGET</p>
            <div className="target-list">
              {/* Myself option (only for ally_or_self) */}
              {pendingTarget.targetType === 'ally_or_self' && (
                <button
                  className="target-btn tb-self"
                  onClick={() => onTargetSelect({ id: s.id, name: s.name, alias: s.alias })}
                >
                  <span className="tb-avatar">
                    {s.avatar_url
                      ? <img src={s.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                      : (s.avatar_emoji ?? '🚀')
                    }
                  </span>
                  <span className="tb-name">Myself ({getDisplayName(s)})</span>
                  <span className="tb-hp">{s.hp} HP</span>
                </button>
              )}

              {/* Present classmates */}
              {(pendingTarget.targetType === 'koed_ally' ? koedClassmates : presentClassmates)
                .filter(c => c.id !== s.id)
                .map(c => (
                  <button
                    key={c.id}
                    className="target-btn"
                    onClick={() => onTargetSelect(c)}
                  >
                    <span className="tb-avatar">
                      {c.avatar_url
                        ? <img src={c.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                        : (c.avatar_emoji ?? '🚀')
                      }
                    </span>
                    <span className="tb-name">{getDisplayName(c)}</span>
                    <span className="tb-hp">{c.hp} HP</span>
                  </button>
                ))
              }

              {pendingTarget.targetType === 'koed_ally' && koedClassmates.length === 0 && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', padding: '12px 0' }}>
                  No KO'd allies right now.
                </p>
              )}
            </div>
            <button className="target-cancel" onClick={() => setPendingTarget(null)}>Cancel</button>
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
