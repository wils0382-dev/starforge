import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function SettingsTab({ session, allClasses, classData, onRename, onCreateClass }) {
  // ── Password change ────────────────────────────────────────────
  const [newPassword, setNewPassword]     = useState('')
  const [confirmPass, setConfirmPass]     = useState('')
  const [passFeedback, setPassFeedback]   = useState(null) // { type: 'ok'|'err', msg }
  const [savingPass, setSavingPass]       = useState(false)

  // ── Display name ───────────────────────────────────────────────
  const currentName = session?.user?.user_metadata?.full_name ?? ''
  const [displayName, setDisplayName]     = useState(currentName)
  const [nameFeedback, setNameFeedback]   = useState(null)
  const [savingName, setSavingName]       = useState(false)

  // ── Class rename ───────────────────────────────────────────────
  const [renameVal, setRenameVal] = useState(classData?.name ?? '')

  async function handlePasswordChange(e) {
    e.preventDefault()
    setPassFeedback(null)
    if (newPassword.length < 8) {
      setPassFeedback({ type: 'err', msg: 'Password must be at least 8 characters.' })
      return
    }
    if (newPassword !== confirmPass) {
      setPassFeedback({ type: 'err', msg: 'Passwords do not match.' })
      return
    }
    setSavingPass(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSavingPass(false)
    if (error) {
      setPassFeedback({ type: 'err', msg: error.message })
    } else {
      setPassFeedback({ type: 'ok', msg: 'Password updated successfully.' })
      setNewPassword('')
      setConfirmPass('')
    }
  }

  async function handleNameSave(e) {
    e.preventDefault()
    setNameFeedback(null)
    const trimmed = displayName.trim()
    if (!trimmed) { setNameFeedback({ type: 'err', msg: 'Name cannot be empty.' }); return }
    setSavingName(true)
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } })
    setSavingName(false)
    if (error) {
      setNameFeedback({ type: 'err', msg: error.message })
    } else {
      setNameFeedback({ type: 'ok', msg: 'Display name updated.' })
    }
  }

  async function handleRename(e) {
    e.preventDefault()
    const trimmed = renameVal.trim()
    if (!trimmed || trimmed === classData?.name) return
    await onRename(trimmed)
  }

  return (
    <div className="settings-wrap">

      {/* ── Account ── */}
      <div className="settings-card">
        <h3>⚙ Account</h3>

        <form onSubmit={handleNameSave}>
          <div className="settings-field">
            <label>Display Name</label>
            <div className="settings-row">
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={40}
              />
              <button className="settings-save-btn" type="submit" disabled={savingName || !displayName.trim()}>
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {nameFeedback && (
            <div className={`settings-feedback ${nameFeedback.type}`}>{nameFeedback.msg}</div>
          )}
        </form>

        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        <form onSubmit={handlePasswordChange}>
          <div className="settings-field">
            <label>New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </div>
          <div className="settings-field">
            <label>Confirm New Password</label>
            <input
              type="password"
              value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              placeholder="Repeat new password"
              autoComplete="new-password"
            />
          </div>
          {passFeedback && (
            <div className={`settings-feedback ${passFeedback.type}`}>{passFeedback.msg}</div>
          )}
          <button
            className="settings-save-btn"
            type="submit"
            disabled={savingPass || !newPassword || !confirmPass}
            style={{ marginTop: 8 }}
          >
            {savingPass ? 'Updating…' : 'Change Password'}
          </button>
        </form>

        <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', letterSpacing: .5 }}>
          Signed in as {session?.user?.email}
        </div>
      </div>

      {/* ── Class Management ── */}
      <div className="settings-card">
        <h3>◈ Class Management</h3>

        <div style={{ marginBottom: 16 }}>
          {allClasses.map(cls => (
            <div key={cls.id} className="settings-class-item">
              <span className="settings-class-name">{cls.name}</span>
              {cls.id === classData?.id && (
                <span className="settings-class-active">ACTIVE</span>
              )}
            </div>
          ))}
        </div>

        {classData && (
          <form onSubmit={handleRename} style={{ marginBottom: 16 }}>
            <div className="settings-field">
              <label>Rename Active Class</label>
              <div className="settings-row">
                <input
                  type="text"
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  placeholder={classData.name}
                  maxLength={60}
                />
                <button
                  className="settings-save-btn"
                  type="submit"
                  disabled={!renameVal.trim() || renameVal.trim() === classData.name}
                >
                  Rename
                </button>
              </div>
            </div>
          </form>
        )}

        <button className="settings-save-btn" onClick={onCreateClass} style={{ width: '100%' }}>
          + Create New Class
        </button>
      </div>

    </div>
  )
}
