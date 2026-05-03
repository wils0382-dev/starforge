import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getRanked, clamp, MAX_HP, MAX_AP, getLevel, getLPBalance } from '../lib/gameUtils'
import Header from '../components/teacher/Header'
import AbilityWindowBar from '../components/teacher/AbilityWindowBar'
import TabBar from '../components/teacher/TabBar'
import RosterTab from '../components/teacher/RosterTab'
import PortalTab from '../components/teacher/PortalTab'
import LeaderboardMode from '../components/teacher/LeaderboardMode'
import StudentModal from '../components/teacher/modals/StudentModal'
import ConfirmModal from '../components/teacher/modals/ConfirmModal'

function generateCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Ability auto-resolution ────────────────────────────────────────
const ABILITY_EFFECTS = {
  'Evasion I':       { type: 'reduce_flat', value: 15 },
  'Evasion II':      { type: 'reduce_flat', value: 25 },
  'Phase Shield I':  { type: 'reduce_pct',  value: 20 },
  'Phase Shield II': { type: 'reduce_pct',  value: 50 },
  'Power Shield I':  { type: 'block',       value: 15 },
  'Power Shield II': { type: 'block',       value: 35 },
}

const MANUAL_NOTES = {
  'Guardian I':      'Ally takes 80% of damage instead of the target',
  'Guardian II':     'Ally takes 60% of damage instead of the target',
  'Guardian III':    'Ally takes 40% of damage instead of the target',
  'Intercept':       'Ally HP drops to 10 — target takes no damage',
  'Defensive':       'Takes 10% of team damage; returns 10 AP when healed',
  'Reflector Array': 'Reflects 25 damage back at the source',
  'Repair I':        'Restores 25 HP to self or an ally',
  'Repair II':       'Restores 40 HP to self or an ally',
  'Critical Repairs':'Revives a KO\'d ally to 25 HP',
  'Nano Cloud':      'Restores 30 HP to all allies',
}

function computeResolution(eventData, activations) {
  if (!eventData?.targets?.length) return null
  const results = []

  for (const target of eventData.targets) {
    let damage = target.damage
    const autoEffects = []
    const manualNotes = []

    const selfActs = activations.filter(a => a.activatorId === target.studentId)
    for (const act of selfActs) {
      const effect = ABILITY_EFFECTS[act.abilityName]
      if (effect) {
        if (effect.type === 'reduce_flat') {
          const cut = Math.min(damage, effect.value)
          damage = Math.max(0, damage - effect.value)
          autoEffects.push(`${act.abilityIcon} ${act.abilityName} (−${cut})`)
        } else if (effect.type === 'reduce_pct') {
          const cut = Math.round(damage * effect.value / 100)
          damage = Math.max(0, damage - cut)
          autoEffects.push(`${act.abilityIcon} ${act.abilityName} (−${effect.value}%, −${cut})`)
        } else if (effect.type === 'block') {
          const cut = Math.min(damage, effect.value)
          damage = Math.max(0, damage - effect.value)
          autoEffects.push(`${act.abilityIcon} ${act.abilityName} (blocked ${cut})`)
        }
      } else if (MANUAL_NOTES[act.abilityName]) {
        manualNotes.push(`${act.abilityIcon} ${act.activatorName} — ${act.abilityName}: ${MANUAL_NOTES[act.abilityName]}`)
      }
    }

    results.push({
      studentId: target.studentId,
      studentName: target.studentName,
      originalDamage: target.damage,
      finalDamage: damage,
      autoEffects,
      manualNotes,
    })
  }

  const targetIds = new Set(eventData.targets.map(t => t.studentId))
  const otherActs = activations.filter(a =>
    !targetIds.has(a.activatorId) || MANUAL_NOTES[a.abilityName]
  )

  return { results, otherActs }
}

const SCI_FI_ABILITIES = [
  { name: 'Evasion I',        icon: '💨', cost: 1, max_owned: 1, ap_cost: 15, description: 'AP Cost: 15 — Reduce incoming damage by 15 this round.' },
  { name: 'Evasion II',       icon: '💨', cost: 2, max_owned: 1, ap_cost: 25, description: 'AP Cost: 25 — Reduce incoming damage by 25 this round. (Upgrade of Evasion I)' },
  { name: 'Intercept',        icon: '⚔️',  cost: 3, max_owned: 1, ap_cost: 60, description: 'AP Cost: 60 — Take full damage for an ally. Your HP drops to 10, cannot go lower. Next repair restores only half.' },
  { name: 'Guardian I',       icon: '🛡️',  cost: 1, max_owned: 1, ap_cost: 15, description: 'AP Cost: 15 — Take damage for an ally, receive only 80% of it.' },
  { name: 'Guardian II',      icon: '🛡️',  cost: 2, max_owned: 1, ap_cost: 25, description: 'AP Cost: 25 — Take damage for an ally, receive only 60% of it. (Upgrade of Guardian I)' },
  { name: 'Guardian III',     icon: '🛡️',  cost: 3, max_owned: 1, ap_cost: 40, description: 'AP Cost: 40 — Take damage for an ally, receive only 40% of it. (Upgrade of Guardian II)' },
  { name: 'Defensive',        icon: '🔰',  cost: 2, max_owned: 1, ap_cost: 10, description: 'AP Cost: 10 — Take 10% of team damage; return 10 AP to an ally when they\'re healed.' },
  { name: 'Reflector Array',  icon: '🪞',  cost: 4, max_owned: 1, ap_cost: 60, description: 'AP Cost: 60 — Reflect up to 25 damage back at the Boss this round.' },
  { name: 'Power Shield I',   icon: '🔵',  cost: 1, max_owned: 1, ap_cost: 15, description: 'AP Cost: 15 — Convert AP to block up to 15 damage.' },
  { name: 'Power Shield II',  icon: '🔵',  cost: 2, max_owned: 1, ap_cost: 35, description: 'AP Cost: 35 — Convert AP to block up to 35 damage. (Upgrade of Power Shield I)' },
  { name: 'Phase Shield I',   icon: '💠',  cost: 1, max_owned: 1, ap_cost: 15, description: 'AP Cost: 15 — Reduce incoming damage by 20% and convert blocked damage to AP/HP.' },
  { name: 'Phase Shield II',  icon: '💠',  cost: 3, max_owned: 1, ap_cost: 45, description: 'AP Cost: 45 — Reduce incoming damage by 50% and convert blocked damage to AP/HP. (Upgrade of Phase Shield I)' },
  { name: 'Hacking',          icon: '💻',  cost: 5, max_owned: 1, ap_cost: 75, description: 'AP Cost: 75 — Block all damage this round. Convert the total into double AP shared between teammates.' },
  { name: 'Repair I',         icon: '🔧',  cost: 1, max_owned: 1, ap_cost: 15, description: 'AP Cost: 15 — Restore 25 HP to yourself or an ally.' },
  { name: 'Repair II',        icon: '🔧',  cost: 2, max_owned: 1, ap_cost: 25, description: 'AP Cost: 25 — Restore 40 HP to yourself or an ally. (Upgrade of Repair I)' },
  { name: 'Critical Repairs', icon: '💊',  cost: 2, max_owned: 1, ap_cost: 30, description: 'AP Cost: 30 — Revive a KO\'d ally to 25 HP with no penalty.' },
  { name: 'Nano Cloud',       icon: '🌫️',  cost: 5, max_owned: 1, ap_cost: 75, description: 'AP Cost: 75 — Restore 30 HP to all allies.' },
  { name: 'Power Tap',        icon: '🔋',  cost: 3, max_owned: 1, ap_cost: 30, description: 'AP Cost: 30 — Give 40 AP to an ally, lose 30 AP yourself.' },
  { name: 'Power Up',         icon: '⬆️',  cost: 4, max_owned: 1, ap_cost: 60, description: 'AP Cost: 60 — Double an ally\'s next ability. If it helps another player, triple it.' },
  { name: 'Overcharge',       icon: '🌩️',  cost: 5, max_owned: 1, ap_cost: 75, description: 'AP Cost: 75 — If a hit lands this round, all allies attack twice. +3 damage bonus per extra hit.' },
  { name: 'Eliminate',        icon: '💥',  cost: 3, max_owned: 1, ap_cost: 50, description: 'AP Cost: 50 — Remove one minion OR remove a wrong answer on a multiple choice question.' },
  { name: 'Bribe',            icon: '💰',  cost: 2, max_owned: 1, ap_cost: 50, description: 'AP Cost: 50 — Instantly gain a correct answer.' },
  { name: 'Expose Weakness',  icon: '🔍',  cost: 1, max_owned: 1, ap_cost: 20, description: 'AP Cost: 20 — Remove one incorrect answer from a multiple choice question (for everyone).' },
  { name: 'Data Hack',        icon: '💾',  cost: 2, max_owned: 1, ap_cost: 25, description: 'AP Cost: 25 — Add +10% XP to one completed task.' },
  { name: 'Invisibility',     icon: '👻',  cost: 1, max_owned: 1, ap_cost: 20, description: 'AP Cost: 20 — Listen to music for a lesson.' },
  { name: 'Feast',            icon: '🍕',  cost: 1, max_owned: 1, ap_cost: 20, description: 'AP Cost: 20 — Eat during class.' },
  { name: 'Cloak & Disappear',icon: '🌑',  cost: 1, max_owned: 1, ap_cost: 25, description: 'AP Cost: 25 — Leave the room for 10 minutes undetected.' },
  { name: 'Energy Surge',     icon: '⚡',  cost: 2, max_owned: 1, ap_cost:  0, description: 'AP Cost: 0 (costs your turn) — Regain 30 AP immediately.' },
  { name: 'Tactical Insight', icon: '🎯',  cost: 1, max_owned: 1, ap_cost: 15, description: 'AP Cost: 15 — Correctly answering a group question deals +10 bonus Boss damage.' },
  { name: 'Battle Cry',       icon: '📣',  cost: 1, max_owned: 1, ap_cost: 25, description: 'AP Cost: 25 — All allies gain +2 to attack rolls this round.' },
  { name: 'Deflector Swap',   icon: '🔄',  cost: 4, max_owned: 1, ap_cost: 40, description: 'AP Cost: 40 — Swap HP with an ally for one round, reverts after.' },
  { name: 'Lucky Break',      icon: '🎲',  cost: 1, max_owned: 1, ap_cost: 15, description: 'AP Cost: 15 — Reroll any dice once per day (combat or academic).' },
]

export default function TeacherDashboard() {
  const { session, signOut } = useAuth()
  const toast = useToast()

  const [allClasses, setAllClasses]   = useState([])
  const [classData, setClassData]     = useState(null)
  const [students, setStudents]       = useState([])
  const [abilities, setAbilities]     = useState([])
  const [squadrons, setSquadrons]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [activeTab, setActiveTab]     = useState('roster')
  const [sortBy, setSortBy]           = useState('rank')
  const [lbModeOpen, setLbModeOpen]   = useState(false)

  // Modal state
  const [studentModal, setStudentModal] = useState({ open: false, student: null })
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', onConfirm: null })

  // New Lesson modal state
  const [lessonModal, setLessonModal] = useState({ open: false, amount: 30 })

  // Ability window state
  const [windowActivations, setWindowActivations] = useState([])
  const [combatForm, setCombatForm] = useState({ open: false, targetIds: [], damage: '', message: '', duration: 3 })
  const [secondsLeft, setSecondsLeft]   = useState(0)
  const [resolution, setResolution]     = useState(null)
  const [editedDamages, setEditedDamages] = useState({})
  const windowChannelRef = useRef(null)
  const windowTimerRef   = useRef(null)
  const resolvingRef     = useRef(false)

  // ── Fetch helpers ──────────────────────────────────────────────
  const fetchStudents = useCallback(async (classId) => {
    const id = classId ?? classData?.id
    if (!id) return
    const { data, error } = await supabase
      .from('students')
      .select('*, student_abilities(ability_id, quantity)')
      .eq('class_id', id)
      .order('xp', { ascending: false })
    if (!error) setStudents(data ?? [])
  }, [classData?.id])

  const fetchAbilities = useCallback(async (classId) => {
    const id = classId ?? classData?.id
    if (!id) return
    const { data, error } = await supabase
      .from('abilities')
      .select('*')
      .eq('class_id', id)
      .order('sort_order')
    if (!error) setAbilities(data ?? [])
  }, [classData?.id])

  const fetchSquadrons = useCallback(async (classId) => {
    const id = classId ?? classData?.id
    if (!id) return
    const { data, error } = await supabase
      .from('squadrons')
      .select('*')
      .eq('class_id', id)
      .order('name')
    if (!error) setSquadrons(data ?? [])
  }, [classData?.id])

  // ── Bootstrap: load all classes ────────────────────────────────
  const bootstrap = useCallback(async () => {
    setLoading(true)
    const userId = session.user.id

    let { data: classes, error } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', userId)
      .order('created_at')

    if (error) {
      console.error('Bootstrap: failed to fetch classes', error)
      toast('Failed to load classes: ' + error.message, 'err')
      setLoading(false)
      return
    }

    if (!classes?.length) {
      // First login — create class and seed abilities
      const { data: newClass, error: createErr } = await supabase
        .from('classes')
        .insert({ name: 'My Class', teacher_id: userId, code: generateCode() })
        .select()
        .single()

      if (createErr) {
        console.error('Bootstrap: failed to create class', createErr)
        toast('Failed to create class: ' + createErr.message, 'err')
        setLoading(false)
        return
      }

      await supabase.rpc('seed_builtin_abilities', { p_class_id: newClass.id })
      classes = [newClass]
    }

    setAllClasses(classes)
    const cls = classes[0]
    setClassData(cls)
    await Promise.all([fetchStudents(cls.id), fetchAbilities(cls.id), fetchSquadrons(cls.id)])

    // Fix any existing students with null student_code
    const { data: nullCodeStudents } = await supabase
      .from('students')
      .select('id')
      .eq('class_id', cls.id)
      .is('student_code', null)
    if (nullCodeStudents?.length) {
      await Promise.all(nullCodeStudents.map(s =>
        supabase.from('students').update({ student_code: generateCode(4) + '-' + generateCode(4) }).eq('id', s.id)
      ))
      await fetchStudents(cls.id)
    }

    setLoading(false)
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bootstrap() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime: refresh students when teacher changes them ───────
  useEffect(() => {
    if (!classData?.id) return
    const channel = supabase
      .channel('class-students-' + classData.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'students',
        filter: `class_id=eq.${classData.id}`
      }, () => { if (!resolvingRef.current) fetchStudents() })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'student_abilities'
      }, () => { if (!resolvingRef.current) fetchStudents() })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [classData?.id, fetchStudents])

  // ── Ability window broadcast channel ──────────────────────────
  useEffect(() => {
    if (!classData?.id) return
    const channel = supabase
      .channel('ability-window-' + classData.id)
      .on('broadcast', { event: 'ability_activated' }, ({ payload }) => {
        setWindowActivations(prev => [...prev, payload])
      })
      .subscribe()
    windowChannelRef.current = channel
    return () => { supabase.removeChannel(channel); windowChannelRef.current = null }
  }, [classData?.id])

  useEffect(() => () => clearInterval(windowTimerRef.current), [])

  // ── Class switching ────────────────────────────────────────────
  const switchClass = useCallback(async (classId) => {
    const cls = allClasses.find(c => c.id === classId)
    if (!cls || cls.id === classData?.id) return
    setClassData(cls)
    setStudents([])
    setAbilities([])
    setSquadrons([])
    await Promise.all([fetchStudents(classId), fetchAbilities(classId), fetchSquadrons(classId)])
  }, [allClasses, classData?.id, fetchStudents, fetchAbilities, fetchSquadrons])

  // ── Create new class ───────────────────────────────────────────
  const createClass = useCallback(async (name) => {
    const userId = session.user.id
    const { data: newClass, error } = await supabase
      .from('classes')
      .insert({ name: name.trim(), teacher_id: userId, code: generateCode() })
      .select()
      .single()
    if (error) { toast('Failed to create class: ' + error.message, 'err'); return }

    const { error: seedErr } = await supabase.rpc('seed_builtin_abilities', { p_class_id: newClass.id })
    if (seedErr) console.error('seed abilities failed', seedErr)

    setAllClasses(prev => [...prev, newClass])
    setClassData(newClass)
    setStudents([])
    setAbilities([])
    setSquadrons([])
    await Promise.all([fetchStudents(newClass.id), fetchAbilities(newClass.id), fetchSquadrons(newClass.id)])
    toast(`✓ "${newClass.name}" created`, 'ok')
  }, [session, fetchStudents, fetchAbilities, fetchSquadrons, toast])

  function startWindowTimer(expiresAt, eventData) {
    clearInterval(windowTimerRef.current)
    function tick() {
      const remaining = Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining === 0) {
        clearInterval(windowTimerRef.current)
        setWindowActivations(prev => {
          const res = computeResolution(eventData, prev)
          if (res) {
            setEditedDamages(Object.fromEntries(res.results.map(r => [r.studentId, r.finalDamage])))
            setResolution(res)
          }
          return prev
        })
        supabase.from('classes').update({ window_open: false }).eq('id', classData?.id)
        setClassData(prev => prev ? { ...prev, window_open: false } : prev)
        windowChannelRef.current?.send({ type: 'broadcast', event: 'window_closed', payload: {} })
      }
    }
    tick()
    windowTimerRef.current = setInterval(tick, 1000)
  }

  const openAbilityWindow = useCallback(async () => {
    if (!classData) return
    const { targetIds, damage, message, duration } = combatForm
    const targets = targetIds.map(id => {
      const s = students.find(x => x.id === id)
      return { studentId: id, studentName: s?.name ?? id, damage: Number(damage) || 0 }
    })
    const event_data = targets.length ? { targets } : null
    const window_expires_at = new Date(Date.now() + duration * 60 * 1000).toISOString()
    const { error } = await supabase.from('classes').update({
      window_open: true, window_message: message.trim(), window_expires_at, event_data
    }).eq('id', classData.id)
    if (error) { toast('Failed to open window: ' + error.message, 'err'); return }
    const updated = { ...classData, window_open: true, window_message: message.trim(), window_expires_at, event_data }
    setClassData(updated)
    setWindowActivations([])
    setResolution(null)
    setCombatForm(prev => ({ ...prev, open: false }))
    windowChannelRef.current?.send({
      type: 'broadcast', event: 'window_open',
      payload: { message: message.trim(), expiresAt: window_expires_at, event_data }
    })
    startWindowTimer(window_expires_at, event_data)
    toast('⚡ Ability window open!', 'portal')
  }, [classData, combatForm, students, toast]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeAbilityWindow = useCallback(async () => {
    if (!classData) return
    clearInterval(windowTimerRef.current)
    setWindowActivations(prev => {
      const res = computeResolution(classData.event_data, prev)
      if (res) {
        setEditedDamages(Object.fromEntries(res.results.map(r => [r.studentId, r.finalDamage])))
        setResolution(res)
      }
      return prev
    })
    await supabase.from('classes').update({ window_open: false }).eq('id', classData.id)
    setClassData(prev => prev ? { ...prev, window_open: false } : prev)
    windowChannelRef.current?.send({ type: 'broadcast', event: 'window_closed', payload: {} })
    toast('Ability window closed', 'ok')
  }, [classData, toast])

  // ── Class rename ───────────────────────────────────────────────
  const renameClass = useCallback(async (name) => {
    if (!classData) return
    const trimmed = name.trim() || classData.name
    setClassData(prev => ({ ...prev, name: trimmed }))
    setAllClasses(prev => prev.map(c => c.id === classData.id ? { ...c, name: trimmed } : c))
    await supabase.from('classes').update({ name: trimmed }).eq('id', classData.id)
  }, [classData])

  // ── XP / HP ───────────────────────────────────────────────────
  const changeXP = useCallback(async (studentId, delta) => {
    const s = students.find(x => x.id === studentId)
    if (!s) return
    const newXP = Math.max(0, s.xp + delta)
    setStudents(prev => prev.map(x => x.id === studentId ? { ...x, xp: newXP } : x))
    const { error } = await supabase.from('students').update({ xp: newXP }).eq('id', studentId)
    if (error) {
      setStudents(prev => prev.map(x => x.id === studentId ? { ...x, xp: s.xp } : x))
      toast('Failed to update XP', 'err')
      return
    }
    const sign = delta > 0 ? '+' : ''
    toast(`${s.name}  ${sign}${delta} XP  → ${newXP}`, 'xp')
  }, [students, toast])

  const changeHP = useCallback(async (studentId, delta) => {
    const s = students.find(x => x.id === studentId)
    if (!s) return
    const newHP = clamp(s.hp + delta, 0, MAX_HP)
    setStudents(prev => prev.map(x => x.id === studentId ? { ...x, hp: newHP } : x))
    const { error } = await supabase.from('students').update({ hp: newHP }).eq('id', studentId)
    if (error) {
      setStudents(prev => prev.map(x => x.id === studentId ? { ...x, hp: s.hp } : x))
      toast('Failed to update HP', 'err')
      return
    }
    const sign = delta > 0 ? '+' : ''
    toast(`${s.name}  ${sign}${delta} HP  → ${newHP}`, delta < 0 ? 'hp' : 'ok')
  }, [students, toast])

  const restoreHP = useCallback(async (studentId) => {
    const s = students.find(x => x.id === studentId)
    if (!s) return
    setStudents(prev => prev.map(x => x.id === studentId ? { ...x, hp: MAX_HP } : x))
    await supabase.from('students').update({ hp: MAX_HP }).eq('id', studentId)
    toast(`${s.name}  HP restored`, 'ok')
  }, [students, toast])

  const changeAP = useCallback(async (studentId, delta) => {
    const s = students.find(x => x.id === studentId)
    if (!s) return
    const newAP = clamp((s.ap ?? MAX_AP) + delta, 0, MAX_AP)
    setStudents(prev => prev.map(x => x.id === studentId ? { ...x, ap: newAP } : x))
    const { error } = await supabase.from('students').update({ ap: newAP }).eq('id', studentId)
    if (error) {
      setStudents(prev => prev.map(x => x.id === studentId ? { ...x, ap: s.ap } : x))
      toast('Failed to update AP', 'err')
      return
    }
    const sign = delta > 0 ? '+' : ''
    toast(`${s.name}  ${sign}${delta} AP  → ${newAP}`, 'ok')
  }, [students, toast])

  const distributeAP = useCallback(async (amount) => {
    if (!classData || !amount || amount <= 0) return
    const presentStudents = students.filter(s => s.present)
    if (!presentStudents.length) { toast('No students are present', 'err'); return }

    // Save lesson_ap setting to class record
    await supabase.from('classes').update({ lesson_ap: amount }).eq('id', classData.id)
    setClassData(prev => ({ ...prev, lesson_ap: amount }))

    // Add AP to each present student, capped at MAX_AP
    await Promise.all(presentStudents.map(s => {
      const newAP = Math.min((s.ap ?? MAX_AP) + amount, MAX_AP)
      return supabase.from('students').update({ ap: newAP }).eq('id', s.id)
    }))
    setStudents(prev => prev.map(s =>
      s.present ? { ...s, ap: Math.min((s.ap ?? MAX_AP) + amount, MAX_AP) } : s
    ))
    toast(`✓ +${amount} AP distributed to ${presentStudents.length} present student${presentStudents.length !== 1 ? 's' : ''}`, 'ok')
    setLessonModal({ open: false, amount })
  }, [classData, students, toast])

  const applyResolution = useCallback(async () => {
    if (!resolution) return
    resolvingRef.current = true

    // Collect HP damage per student
    const hpDamageMap = {}
    for (const result of resolution.results) {
      const dmg = editedDamages[result.studentId] ?? result.finalDamage
      if (dmg > 0) hpDamageMap[result.studentId] = dmg
    }

    // Collect AP deductions per student
    const apDeductions = {}
    for (const act of windowActivations) {
      const cost = act.apCost ?? 0
      if (cost > 0) apDeductions[act.activatorId] = (apDeductions[act.activatorId] ?? 0) + cost
    }

    // Write HP + AP together in one update per student so no race condition
    const affectedIds = new Set([...Object.keys(hpDamageMap), ...Object.keys(apDeductions)])
    await Promise.all([...affectedIds].map(async (sid) => {
      const s = students.find(x => x.id === sid)
      if (!s) return
      const update = {}
      if (hpDamageMap[sid] != null) update.hp = clamp((s.hp ?? MAX_HP) - hpDamageMap[sid], 0, MAX_HP)
      if (apDeductions[sid] != null) update.ap = clamp((s.ap ?? MAX_AP) - apDeductions[sid], 0, MAX_AP)
      await supabase.from('students').update(update).eq('id', sid)
    }))

    // Single refresh after all writes complete
    await fetchStudents()
    resolvingRef.current = false

    setResolution(null)
    setWindowActivations([])
    toast('✓ Changes applied', 'ok')
  }, [resolution, editedDamages, windowActivations, students, fetchStudents, toast])

  const toggleAttendance = useCallback(async (studentId) => {
    const s = students.find(x => x.id === studentId)
    if (!s) return
    const present = !s.present
    setStudents(prev => prev.map(x => x.id === studentId ? { ...x, present } : x))
    await supabase.from('students').update({ present }).eq('id', studentId)
  }, [students])

  // ── Add / Edit student ─────────────────────────────────────────
  const saveStudent = useCallback(async ({ id, name, xp, hp, ap, squadron_id }) => {
    try {
      if (id) {
        const { error } = await supabase
          .from('students')
          .update({ name, xp: Math.max(0, xp), hp: clamp(hp, 0, MAX_HP), ap: clamp(ap ?? MAX_AP, 0, MAX_AP), squadron_id: squadron_id || null })
          .eq('id', id)
        if (error) { toast('Failed to update student: ' + error.message, 'err'); return }
        setStudents(prev => prev.map(s => s.id === id
          ? { ...s, name, xp: Math.max(0, xp), hp: clamp(hp, 0, MAX_HP), ap: clamp(ap ?? MAX_AP, 0, MAX_AP), squadron_id: squadron_id || null }
          : s))
        toast(`✓ ${name} updated`, 'ok')
      } else {
        if (!classData) { toast('Class not loaded — try refreshing', 'err'); return }
        const student_code = generateCode(4) + '-' + generateCode(4)
        const { data, error } = await supabase
          .from('students')
          .insert({ class_id: classData.id, name, xp: Math.max(0, xp), hp: clamp(hp, 0, MAX_HP), ap: clamp(ap ?? MAX_AP, 0, MAX_AP), student_code, squadron_id: squadron_id || null })
          .select()
          .single()
        if (error) { toast('Failed to add student: ' + error.message, 'err'); return }
        setStudents(prev => [...prev, { ...data, student_abilities: [] }])
        toast(`✓ ${name} added`, 'ok')
      }
      setStudentModal({ open: false, student: null })
    } catch (err) {
      console.error('saveStudent error:', err)
      toast('Unexpected error: ' + err.message, 'err')
    }
  }, [classData, toast])

  // ── Remove student ─────────────────────────────────────────────
  const removeStudent = useCallback(async (studentId) => {
    const s = students.find(x => x.id === studentId)
    const { error } = await supabase.from('students').delete().eq('id', studentId)
    if (error) { toast('Failed to remove student', 'err'); return }
    setStudents(prev => prev.filter(x => x.id !== studentId))
    toast(`${s?.name} removed`, 'ok')
  }, [students, toast])

  // ── Reset ──────────────────────────────────────────────────────
  const resetStudent = useCallback(async (studentId) => {
    const s = students.find(x => x.id === studentId)
    if (!s) return
    await supabase.from('students').update({ xp: 0, hp: MAX_HP }).eq('id', studentId)
    setStudents(prev => prev.map(x => x.id === studentId ? { ...x, xp: 0, hp: MAX_HP } : x))
    toast(`${s.name} reset`, 'ok')
  }, [students, toast])

  const resetAll = useCallback(async () => {
    if (!classData) return
    await supabase.from('students').update({ xp: 0, hp: MAX_HP }).eq('class_id', classData.id)
    setStudents(prev => prev.map(s => ({ ...s, xp: 0, hp: MAX_HP })))
    toast('Class reset', 'ok')
  }, [classData, students, toast])

  // ── Alias approval ─────────────────────────────────────────────
  const approveAlias = useCallback(async (studentId) => {
    const s = students.find(x => x.id === studentId)
    if (!s?.alias_pending) return
    const newAlias = s.alias_pending
    const { error } = await supabase
      .from('students')
      .update({ alias: newAlias, alias_pending: null })
      .eq('id', studentId)
    if (error) { toast('Failed to approve alias', 'err'); return }
    setStudents(prev => prev.map(x => x.id === studentId ? { ...x, alias: newAlias, alias_pending: null } : x))
    toast(`✓ Alias approved: "${newAlias}" for ${s.name}`, 'ok')
  }, [students, toast])

  const rejectAlias = useCallback(async (studentId) => {
    const s = students.find(x => x.id === studentId)
    if (!s?.alias_pending) return
    const { error } = await supabase
      .from('students')
      .update({ alias_pending: null })
      .eq('id', studentId)
    if (error) { toast('Failed to reject alias', 'err'); return }
    setStudents(prev => prev.map(x => x.id === studentId ? { ...x, alias_pending: null } : x))
    toast(`Alias rejected for ${s.name}`, 'ok')
  }, [students, toast])

  // ── Squadron management ────────────────────────────────────────
  const saveSquadron = useCallback(async ({ name, color, emoji }) => {
    if (!classData) return
    const { data, error } = await supabase
      .from('squadrons')
      .insert({ class_id: classData.id, name: name.trim(), color, emoji: emoji.trim() || '⚡' })
      .select()
      .single()
    if (error) { toast('Failed to create squadron: ' + error.message, 'err'); return }
    setSquadrons(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    toast(`✓ Squadron "${data.name}" created`, 'ok')
  }, [classData, toast])

  const deleteSquadron = useCallback(async (squadronId) => {
    const { error } = await supabase.from('squadrons').delete().eq('id', squadronId)
    if (error) { toast('Failed to delete squadron', 'err'); return }
    setSquadrons(prev => prev.filter(sq => sq.id !== squadronId))
    setStudents(prev => prev.map(s => s.squadron_id === squadronId ? { ...s, squadron_id: null } : s))
    toast('Squadron deleted', 'ok')
  }, [toast])

  // ── Ability management ─────────────────────────────────────────
  const addAbility = useCallback(async ({ name, icon, cost, apCost, maxOwned, description }) => {
    if (!classData) return
    const sort_order = abilities.filter(a => !a.is_builtin).length + 100
    const { data, error } = await supabase
      .from('abilities')
      .insert({ class_id: classData.id, name, icon: icon || '✨', cost, ap_cost: apCost ?? 0, max_owned: maxOwned, description, is_builtin: false, available: true, sort_order })
      .select()
      .single()
    if (error) { toast('Failed to add ability', 'err'); return }
    setAbilities(prev => [...prev, data])
    toast('✓ Ability added', 'portal')
    return true
  }, [classData, abilities, toast])

  const toggleAbility = useCallback(async (abilityId) => {
    const ab = abilities.find(a => a.id === abilityId)
    if (!ab) return
    const available = !ab.available
    setAbilities(prev => prev.map(a => a.id === abilityId ? { ...a, available } : a))
    await supabase.from('abilities').update({ available }).eq('id', abilityId)
  }, [abilities])

  const deleteAbility = useCallback(async (abilityId) => {
    const { error } = await supabase.from('abilities').delete().eq('id', abilityId)
    if (error) { toast('Failed to remove ability', 'err'); return }
    setAbilities(prev => prev.filter(a => a.id !== abilityId))
    toast('Ability removed', 'ok')
  }, [toast])

  const loadSciFiAbilities = useCallback(async () => {
    if (!classData) return
    const existingNames = new Set(abilities.map(a => a.name))
    const toAdd = SCI_FI_ABILITIES.filter(a => !existingNames.has(a.name))
    if (toAdd.length === 0) { toast('All sci-fi abilities already loaded', 'ok'); return }
    const rows = toAdd.map((ab, i) => ({
      class_id: classData.id,
      name: ab.name, icon: ab.icon, cost: ab.cost,
      ap_cost: ab.ap_cost ?? 0,
      max_owned: ab.max_owned, description: ab.description,
      is_builtin: false,
      available: true,
      sort_order: 200 + i
    }))
    const { error } = await supabase.from('abilities').insert(rows)
    if (error) { toast('Failed to load abilities: ' + error.message, 'err'); return }
    await fetchAbilities(classData.id)
    toast(`✓ ${toAdd.length} sci-fi abilities added to shop`, 'portal')
  }, [classData, abilities, toast, fetchAbilities])

  // ── Export ─────────────────────────────────────────────────────
  const exportData = useCallback(() => {
    const payload = {
      version: 3,
      className: classData?.name,
      students: students.map(s => ({
        name: s.name, xp: s.xp, hp: s.hp, present: s.present,
        student_code: s.student_code,
        abilities: s.student_abilities
      })),
      abilities: abilities.filter(a => !a.is_builtin),
      exported: new Date().toISOString()
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'starforge-' + Date.now() + '.json'
    a.click()
    toast('Data exported', 'ok')
  }, [classData, students, abilities, toast])

  // ── Demo roster ────────────────────────────────────────────────
  const loadDemo = useCallback(async () => {
    if (!classData) return
    const demos = [
      { name: 'Alex Chen',    xp: 340, hp: 90,  ap: 60,  present: true },
      { name: 'Brianna Hall', xp: 280, hp: 100, ap: 100, present: true },
      { name: 'Carlos Vega',  xp: 210, hp: 75,  ap: 40,  present: true },
      { name: 'Dani Novak',   xp: 190, hp: 100, ap: 80,  present: true },
      { name: 'Ethan Price',  xp: 155, hp: 60,  ap: 100, present: false },
      { name: 'Freya Lund',   xp: 90,  hp: 100, ap: 100, present: true },
    ]
    const rows = demos.map(d => ({ ...d, class_id: classData.id }))
    const { data, error } = await supabase
      .from('students')
      .insert(rows)
      .select('*, student_abilities(ability_id, quantity)')
    if (error) { toast('Failed to load demo', 'err'); return }
    setStudents(prev => [...prev, ...data])
    toast('Demo roster loaded', 'ok')
  }, [classData, toast])

  const confirmAction = (title, message, onConfirm) => {
    setConfirmModal({ open: true, title, message, onConfirm })
  }

  // ── Computed display data ──────────────────────────────────────
  const pendingAliases = students.filter(s => s.alias_pending)
  const ranked = getRanked(students)
  const sorted = sortBy === 'name'
    ? [...ranked].sort((a, b) => a.name.localeCompare(b.name))
    : sortBy === 'hp'
    ? [...ranked].sort((a, b) => b.hp - a.hp)
    : ranked

  const presentCount = students.filter(s => s.present).length
  const topXP = students.length ? Math.max(...students.map(s => s.xp)) : null

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">STAR<span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>FORGE</span></div>
        <div className="loading-sub">LOADING CLASS DATA...</div>
      </div>
    )
  }

  return (
    <>
      <Header
        allClasses={allClasses}
        classData={classData}
        onSwitchClass={switchClass}
        onCreateClass={createClass}
        onRename={renameClass}
        studentCount={students.length}
        presentCount={presentCount}
        topXP={topXP}
        onNewLesson={() => setLessonModal({ open: true, amount: classData?.lesson_ap ?? 30 })}
        onAddStudent={() => setStudentModal({ open: true, student: null })}
        onLeaderboardMode={() => setLbModeOpen(true)}
        onExport={exportData}
        onResetAll={() => confirmAction('RESET CLASS?', `Set XP to 0 and HP to ${MAX_HP} for ALL students. Ability purchases are preserved.`, resetAll)}
        onSignOut={signOut}
        windowOpen={!!classData?.window_open}
        onOpenWindow={() => setCombatForm(prev => ({ ...prev, open: true }))}
      />

      {classData?.window_open && (
        <AbilityWindowBar
          classData={classData}
          secondsLeft={secondsLeft}
          activations={windowActivations}
          onManualClose={closeAbilityWindow}
        />
      )}

      <TabBar activeTab={activeTab} onSwitch={setActiveTab} pendingCount={pendingAliases.length} />

      {activeTab === 'roster' && (
        <RosterTab
          students={sorted}
          ranked={ranked}
          abilities={abilities}
          squadrons={squadrons}
          sortBy={sortBy}
          onSortChange={setSortBy}
          onAddStudent={() => setStudentModal({ open: true, student: null })}
          onLoadDemo={loadDemo}
          onEditStudent={s => setStudentModal({ open: true, student: s })}
          onChangeXP={changeXP}
          onChangeHP={changeHP}
          onRestoreHP={restoreHP}
          onChangeAP={changeAP}
          onToggleAttendance={toggleAttendance}
          onResetStudent={id => {
            const s = students.find(x => x.id === id)
            confirmAction('RESET STUDENT?', `Reset ${s?.name}'s XP and HP? Ability purchases are preserved.`, () => resetStudent(id))
          }}
          onRemoveStudent={id => {
            const s = students.find(x => x.id === id)
            confirmAction('REMOVE STUDENT?', `Remove ${s?.name} entirely? This cannot be undone.`, () => removeStudent(id))
          }}
          onScrollToCard={id => document.getElementById('card-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        />
      )}

      {activeTab === 'portal' && (
        <PortalTab
          students={ranked}
          abilities={abilities}
          squadrons={squadrons}
          pendingAliases={pendingAliases}
          onApproveAlias={approveAlias}
          onRejectAlias={rejectAlias}
          onToggleAbility={toggleAbility}
          onDeleteAbility={deleteAbility}
          onAddAbility={addAbility}
          onLoadSciFiAbilities={loadSciFiAbilities}
          onSaveSquadron={saveSquadron}
          onDeleteSquadron={id => confirmAction(
            'DELETE SQUADRON?',
            'This will remove the squadron and unassign all its members. XP is not affected.',
            () => deleteSquadron(id)
          )}
        />
      )}

      <LeaderboardMode
        open={lbModeOpen}
        onClose={() => setLbModeOpen(false)}
        students={ranked}
        squadrons={squadrons}
        allClasses={allClasses}
        classData={classData}
      />

      <StudentModal
        open={studentModal.open}
        student={studentModal.student}
        squadrons={squadrons}
        onSave={saveStudent}
        onClose={() => setStudentModal({ open: false, student: null })}
      />

      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => { confirmModal.onConfirm?.(); setConfirmModal(prev => ({ ...prev, open: false })) }}
        onClose={() => setConfirmModal(prev => ({ ...prev, open: false }))}
      />

      {/* ── Combat event form ──────────────────────────────────── */}
      {combatForm.open && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setCombatForm(p => ({ ...p, open: false })) }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <h2>⚡ COMBAT EVENT</h2>

            <label>Target students (select all that apply)</label>
            <div className="combat-target-grid">
              {students.map(s => (
                <label key={s.id} className={`combat-target-btn ${combatForm.targetIds.includes(s.id) ? 'selected' : ''}`}>
                  <input type="checkbox" checked={combatForm.targetIds.includes(s.id)}
                    onChange={() => setCombatForm(p => ({
                      ...p,
                      targetIds: p.targetIds.includes(s.id)
                        ? p.targetIds.filter(x => x !== s.id)
                        : [...p.targetIds, s.id]
                    }))}
                    style={{ display: 'none' }}
                  />
                  {s.avatar_emoji ?? '🚀'} {s.name.split(' ')[0]}
                </label>
              ))}
            </div>

            {combatForm.targetIds.length > 0 && (
              <>
                <label style={{ marginTop: 12 }}>HP Damage (applied to each selected student)</label>
                <input
                  type="number" min={1} max={100} autoFocus
                  placeholder="e.g. 30"
                  value={combatForm.damage}
                  onChange={e => setCombatForm(p => ({ ...p, damage: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border-hi)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 14, padding: '8px 12px' }}
                />
              </>
            )}

            <label style={{ marginTop: 12 }}>Context message (optional)</label>
            <input
              type="text"
              placeholder='e.g. "Boss unleashes plasma cannon"'
              value={combatForm.message}
              onChange={e => setCombatForm(p => ({ ...p, message: e.target.value }))}
              maxLength={100}
            />

            <label style={{ marginTop: 12 }}>Duration</label>
            <select
              value={combatForm.duration}
              onChange={e => setCombatForm(p => ({ ...p, duration: Number(e.target.value) }))}
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border-hi)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 14, padding: '8px 12px' }}
            >
              <option value={1}>1 minute</option>
              <option value={2}>2 minutes</option>
              <option value={3}>3 minutes</option>
              <option value={5}>5 minutes</option>
            </select>

            <div className="modal-actions">
              <button className="btn" onClick={() => setCombatForm(p => ({ ...p, open: false }))}>Cancel</button>
              <button className="btn btn-accent btn-lg" onClick={openAbilityWindow}
                disabled={combatForm.targetIds.length > 0 && !combatForm.damage}>
                ⚡ Open Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Resolution modal ────────────────────────────────────── */}
      {resolution && (() => {
        const apDeductions = {}
        for (const act of windowActivations) {
          const cost = act.apCost ?? 0
          if (cost > 0) apDeductions[act.activatorId] = (apDeductions[act.activatorId] ?? 0) + cost
        }
        return (
          <div className="modal-overlay open">
            <div className="modal" style={{ maxWidth: 560 }}>
              <h2>⚡ COMBAT RESOLUTION</h2>

              <div className="resolution-table">
                {resolution.results.map(r => (
                  <div key={r.studentId} className="resolution-row">
                    <div className="res-name">{r.studentName}</div>
                    <div className="res-detail">
                      <span className="res-original">{r.originalDamage} HP</span>
                      <span className="res-arrow">→</span>
                      <input
                        className="res-final-input"
                        type="number" min={0} max={100}
                        value={editedDamages[r.studentId] ?? r.finalDamage}
                        onChange={e => setEditedDamages(prev => ({ ...prev, [r.studentId]: Number(e.target.value) }))}
                      />
                      <span className="res-unit">HP damage</span>
                    </div>
                    {r.autoEffects.length > 0 && (
                      <div className="res-effects">
                        {r.autoEffects.map((e, i) => <span key={i} className="res-effect auto">{e}</span>)}
                      </div>
                    )}
                    {r.manualNotes.length > 0 && (
                      <div className="res-effects">
                        {r.manualNotes.map((n, i) => <span key={i} className="res-effect manual">⚠ {n}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {resolution.otherActs?.length > 0 && (
                <div className="res-other">
                  <div className="res-other-title">Other activations (review manually):</div>
                  {resolution.otherActs.map((a, i) => (
                    <div key={i} className="res-other-row">
                      {a.abilityIcon} <strong>{a.activatorName}</strong> — {a.abilityName}
                      {MANUAL_NOTES[a.abilityName] && <span className="res-note"> · {MANUAL_NOTES[a.abilityName]}</span>}
                    </div>
                  ))}
                </div>
              )}

              {Object.keys(apDeductions).length > 0 && (
                <div className="res-ap-section">
                  <div className="res-ap-title">⚡ AP Deductions</div>
                  {Object.entries(apDeductions).map(([sid, cost]) => {
                    const stu = students.find(x => x.id === sid)
                    const acts = windowActivations.filter(a => a.activatorId === sid && (a.apCost ?? 0) > 0)
                    return (
                      <div key={sid} className="res-ap-row">
                        <span className="res-ap-name">{stu?.name ?? sid}</span>
                        <span className="res-ap-cost">−{cost} AP</span>
                        <span className="res-ap-detail">{acts.map(a => `${a.abilityName} (${a.apCost})`).join(', ')}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="modal-actions">
                <button className="btn" onClick={() => { setResolution(null); setWindowActivations([]) }}>
                  Dismiss
                </button>
                <button className="btn btn-accent btn-lg" onClick={applyResolution}>
                  ✓ Apply Changes
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── New Lesson modal ─────────────────────────────────────── */}
      {lessonModal.open && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) setLessonModal(p => ({ ...p, open: false })) }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h2>📖 NEW LESSON</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
              Distribute AP to all <strong style={{ color: 'var(--text)' }}>{students.filter(s => s.present).length}</strong> present student{students.filter(s => s.present).length !== 1 ? 's' : ''}.
              {students.filter(s => !s.present).length > 0 && (
                <span> ({students.filter(s => !s.present).length} absent — they will not receive AP.)</span>
              )}
            </p>

            <label>AP to distribute</label>
            <input
              type="number" min={1} max={MAX_AP} autoFocus
              value={lessonModal.amount}
              onChange={e => setLessonModal(p => ({ ...p, amount: Number(e.target.value) }))}
              onKeyDown={e => { if (e.key === 'Enter') distributeAP(lessonModal.amount) }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              AP is capped at {MAX_AP}. This setting is saved for future lessons.
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setLessonModal(p => ({ ...p, open: false }))}>Cancel</button>
              <button
                className="btn btn-accent btn-lg"
                onClick={() => distributeAP(lessonModal.amount)}
                disabled={!lessonModal.amount || lessonModal.amount <= 0 || !students.some(s => s.present)}
              >
                ✓ Distribute AP
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
