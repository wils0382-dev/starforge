import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import TeacherLogin from './pages/TeacherLogin'
import TeacherDashboard from './pages/TeacherDashboard'
import StudentPortal from './pages/StudentPortal'
import './styles/global.css'

function SetNewPassword() {
  const { updatePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    const { error } = await updatePassword(password)
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-logo">STAR<span>FORGE</span></div>
        <div className="login-subtitle">SET NEW PASSWORD</div>
        <form onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 5, marginTop: 0 }}>
            New Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
            autoFocus
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border-hi)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 14, padding: '8px 12px', outline: 'none', marginBottom: 12 }}
          />
          <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 5 }}>
            Confirm Password
          </label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••"
            required
            style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border-hi)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 14, padding: '8px 12px', outline: 'none' }}
          />
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'SAVING...' : 'SET PASSWORD'}
          </button>
        </form>
      </div>
    </div>
  )
}

function TeacherRoute() {
  const { session, needsPasswordReset } = useAuth()

  // Still checking auth state
  if (session === undefined) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">STAR<span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>FORGE</span></div>
        <div className="loading-sub">INITIALISING...</div>
      </div>
    )
  }

  if (needsPasswordReset) return <SetNewPassword />

  return session ? <TeacherDashboard /> : <TeacherLogin />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<TeacherRoute />} />
            <Route path="/student" element={<StudentPortal />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
