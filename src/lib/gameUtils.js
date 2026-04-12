export const XP_PER_LEVEL = 100
export const MAX_HP = 100

export function getLevel(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

export function getLPEarned(xp) {
  return Math.max(0, getLevel(xp) - 1)
}

// student.student_abilities = [{ability_id, quantity}]
// abilities = [{id, cost, ...}]
export function getLPSpent(studentAbilities, abilities) {
  if (!studentAbilities?.length) return 0
  return studentAbilities.reduce((sum, sa) => {
    const ab = abilities.find(a => a.id === sa.ability_id)
    return sum + (ab ? ab.cost * sa.quantity : 0)
  }, 0)
}

export function getLPBalance(student, abilities) {
  const earned = getLPEarned(student.xp)
  const spent = getLPSpent(student.student_abilities, abilities)
  return Math.max(0, earned - spent)
}

export function getOwnedCount(student, abilityId) {
  const sa = student.student_abilities?.find(x => x.ability_id === abilityId)
  return sa?.quantity ?? 0
}

export function hpClass(hp) {
  const pct = (hp / MAX_HP) * 100
  return pct > 60 ? 'hp-hi' : pct > 30 ? 'hp-mid' : 'hp-lo'
}

// XP progress within the current level as a 0–100 percentage
export function xpLevelPct(xp) {
  return Math.round((xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100)
}

// For the teacher leaderboard bar — relative to the class top scorer
export function xpBarPct(xp, maxXP) {
  return Math.round((xp / Math.max(maxXP, 100)) * 100)
}

// Returns the name to show on leaderboards.
// Uses approved alias for privacy; falls back to first name only.
export function displayName(student) {
  if (student?.alias) return student.alias
  return student?.name?.split(' ')?.[0] ?? student?.name ?? '?'
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

// Returns students sorted by XP descending with _rank assigned.
// Absent students are unranked and placed at the bottom.
export function getRanked(students) {
  const present = [...students].filter(s => s.present).sort((a, b) => b.xp - a.xp)
  const absent  = [...students].filter(s => !s.present).sort((a, b) => b.xp - a.xp)
  let rank = 1
  present.forEach(s => { s._rank = rank++ })
  absent.forEach(s => { s._rank = null })
  return [...present, ...absent]
}
