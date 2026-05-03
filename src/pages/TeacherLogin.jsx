import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function TeacherLogin() {
  const { signIn, signUp, resetPassword } = useAuth()
  const [tab, setTab] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [signupDone, setSignupDone] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  async function handleForgotPassword() {
    if (!email) { setError('Enter your email above first, then click Forgot Password.'); return }
    setError('')
    setLoading(true)
    await resetPassword(email)
    setLoading(false)
    setResetSent(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (tab === 'signin') {
      const { error } = await signIn(email, password)
      if (error) setError(error.message)
    } else {
      const { error } = await signUp(email, password)
      if (error) {
        setError(error.message)
      } else {
        setSignupDone(true)
      }
    }

    setLoading(false)
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-logo">STAR<span>FORGE</span></div>
        <div className="login-subtitle">TEACHER COMMAND CENTRE</div>

        <div className="login-tabs">
          <button
            className={`login-tab ${tab === 'signin' ? 'active' : ''}`}
            onClick={() => { setTab('signin'); setError(''); setSignupDone(false) }}
          >
            Sign In
          </button>
          <button
            className={`login-tab ${tab === 'signup' ? 'active' : ''}`}
            onClick={() => { setTab('signup'); setError(''); setSignupDone(false) }}
          >
            Create Account
          </button>
        </div>

        {signupDone ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              CHECK YOUR EMAIL
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.7 }}>
              We sent a confirmation link to<br />
              <span style={{ color: 'var(--xp)' }}>{email}</span><br />
              Click it to activate your account, then sign in.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="login-error">{error}</div>}

            <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 5, marginTop: 0 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@school.edu"
              required
              autoFocus
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border-hi)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 14, padding: '8px 12px', outline: 'none', marginBottom: 12 }}
            />

            <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 5 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={tab === 'signup' ? 'At least 6 characters' : '••••••••'}
              required
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border-hi)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'var(--font-ui)', fontSize: 14, padding: '8px 12px', outline: 'none' }}
            />

            {tab === 'signin' && (
              <div style={{ textAlign: 'right', marginTop: 6, marginBottom: 2 }}>
                {resetSent ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--xp)' }}>
                    Reset email sent — check your inbox.
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', textDecoration: 'underline', padding: 0 }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            )}

            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? 'LOADING...' : tab === 'signin' ? 'ENTER THE FORGE' : 'CREATE ACCOUNT'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
