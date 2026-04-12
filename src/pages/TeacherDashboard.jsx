import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { getRanked, clamp, MAX_HP, getLevel, getLPBalance } from '../lib/gameUtils'
import Header from '../components/teacher/Header'
import TabBar from '../components/teacher/TabBar'
import RosterTab from '../components/teacher/RosterTab'
import PortalTab from '../components/teacher/PortalTab'
import LeaderboardMode from '../components/teacher/LeaderboardMode'
import StudentModal from '../components/teacher/modals/StudentModal'
import ConfirmModal from '../components/teacher/modals/ConfirmModal'

export default function TeacherDashboard() {
  const { session, signOut } = useAuth()
  const toast = useToast()

  const [classData, setClassData] = useState(null)
  const [students, setStudents] = useState([])
  const [abilities, setAbilities] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('roster')
  const [sortBy, setSortBy] = useState('rank')
  const [lbModeOpen, setLbModeOpen] = useState(false)

  // Modal state
  const [studentModal, setStudentModal] = useState({ open: false, student: null })
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', message: '', onConfirm: null })

  // ── Bootstrap: load or create class ───────────────────────────
  const bootstrap = useCallback(async () => {
    setLoading(true)
    const userId = session.user.id

    // Find existing class
    let { data: classes, error } = await supabase
      .from('classes')
      .select('*')
      .eq('teacher_id', userId)
      .limit(1)

    if (error) { toast('Failed to load class', 'err'); setLoading(false); return }

    let cls = classes?.[0]

    if (!cls) {
      // First login — create class and seed abilities
      const { data: newClass, error: createErr } = await supabase
        .from('classes')
        .insert({ name: 'My Class', teacher_id: userId })
        .select()
        .single()

      if (createErr) { toast('Failed to create class', 'err'); setLoading(false); return }

      cls = newClass
      await supabase.rpc('seed_builtin_abilities', { p_class_id: cls.id })
    }

    setClassData(cls)
    await Promise.all([fetchStudents(cls.id), fetchAbilities(cls.id)])
    setLoading(false)
  }, [session])

  useEffect(() => { bootstrap() }, [bootstrap])

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

  // ── Realtime: refresh students when teacher changes them ───────
  useEffect(() => {
    if (!classData?.id) return
    const channel = supabase
      .channel('class-students-' + classData.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'students',
        filter: `class_id=eq.${classData.id}`
      }, () => fetchStudents())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'student_abilities'
      }, () => fetchStudents())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [classData?.id, fetchStudents])

  // ── Class name rename ──────────────────────────────────────────
  const renameClass = useCallback(async (name) => {
    if (!classData) return
    setClassData(prev => ({ ...prev, name }))
    await supabase.from('classes').update({ name }).eq('id', classData.id)
  }, [classData])

  // ── XP / HP ───────────────────────────────────────────────────
  const changeXP = useCallback(async (studentId, delta) => {
    const s = students.find(x => x.id === studentId)
    if (!s) return
    const newXP = Math.max(0, s.xp + delta)
    // Optimistic update
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

  const toggleAttendance = useCallback(async (studentId) => {
    const s = students.find(x => x.id === studentId)
    if (!s) return
    const present = !s.present
    setStudents(prev => prev.map(x => x.id === studentId ? { ...x, present } : x))
    await supabase.from('students').update({ present }).eq('id', studentId)
  }, [students])

  // ── Add / Edit student ─────────────────────────────────────────
  const saveStudent = useCallback(async ({ id, name, xp, hp }) => {
    if (id) {
      const { error } = await supabase
        .from('students')
        .update({ name, xp: Math.max(0, xp), hp: clamp(hp, 0, MAX_HP) })
        .eq('id', id)
      if (error) { toast('Failed to update student', 'err'); return }
      setStudents(prev => prev.map(s => s.id === id ? { ...s, name, xp: Math.max(0, xp), hp: clamp(hp, 0, MAX_HP) } : s))
      toast(`✓ ${name} updated`, 'ok')
    } else {
      const { data, error } = await supabase
        .from('students')
        .insert({ class_id: classData.id, name, xp: Math.max(0, xp), hp: clamp(hp, 0, MAX_HP) })
        .select()
        .single()
      if (error) { toast('Failed to add student', 'err'); return }
      setStudents(prev => [...prev, { ...data, student_abilities: [] }])
      toast(`✓ ${name} added`, 'ok')
    }
    setStudentModal({ open: false, student: null })
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

  // ── Ability management ─────────────────────────────────────────
  const addAbility = useCallback(async ({ name, icon, cost, maxOwned, description }) => {
    if (!classData) return
    const sort_order = abilities.filter(a => !a.is_builtin).length + 100
    const { data, error } = await supabase
      .from('abilities')
      .insert({ class_id: classData.id, name, icon: icon || '✨', cost, max_owned: maxOwned, description, is_builtin: false, available: true, sort_order })
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

  // ── Export / Import ────────────────────────────────────────────
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
      { name: 'Alex Chen',    xp: 340, hp: 90,  present: true },
      { name: 'Brianna Hall', xp: 280, hp: 100, present: true },
      { name: 'Carlos Vega',  xp: 210, hp: 75,  present: true },
      { name: 'Dani Novak',   xp: 190, hp: 100, present: true },
      { name: 'Ethan Price',  xp: 155, hp: 60,  present: false },
      { name: 'Freya Lund',   xp: 90,  hp: 100, present: true },
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

  // ── Confirm modal helpers ──────────────────────────────────────
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
        className={classData?.name ?? ''}
        onRename={renameClass}
        studentCount={students.length}
        presentCount={presentCount}
        topXP={topXP}
        onAddStudent={() => setStudentModal({ open: true, student: null })}
        onLeaderboardMode={() => setLbModeOpen(true)}
        onExport={exportData}
        onResetAll={() => confirmAction('RESET CLASS?', `Set XP to 0 and HP to ${MAX_HP} for ALL students. Ability purchases are preserved.`, resetAll)}
        onSignOut={signOut}
      />

      <TabBar activeTab={activeTab} onSwitch={setActiveTab} pendingCount={pendingAliases.length} />

      {activeTab === 'roster' && (
        <RosterTab
          students={sorted}
          ranked={ranked}
          abilities={abilities}
          sortBy={sortBy}
          onSortChange={setSortBy}
          onAddStudent={() => setStudentModal({ open: true, student: null })}
          onLoadDemo={loadDemo}
          onEditStudent={s => setStudentModal({ open: true, student: s })}
          onChangeXP={changeXP}
          onChangeHP={changeHP}
          onRestoreHP={restoreHP}
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
          pendingAliases={pendingAliases}
          onApproveAlias={approveAlias}
          onRejectAlias={rejectAlias}
          onToggleAbility={toggleAbility}
          onDeleteAbility={deleteAbility}
          onAddAbility={addAbility}
        />
      )}

      <LeaderboardMode
        open={lbModeOpen}
        onClose={() => setLbModeOpen(false)}
        students={ranked}
        abilities={abilities}
      />

      <StudentModal
        open={studentModal.open}
        student={studentModal.student}
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
    </>
  )
}
