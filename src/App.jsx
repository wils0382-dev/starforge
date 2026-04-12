import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import TeacherLogin from './pages/TeacherLogin'
import TeacherDashboard from './pages/TeacherDashboard'
import StudentPortal from './pages/StudentPortal'
import './styles/global.css'

function TeacherRoute() {
  const { session } = useAuth()

  // Still checking auth state
  if (session === undefined) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">STAR<span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>FORGE</span></div>
        <div className="loading-sub">INITIALISING...</div>
      </div>
    )
  }

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
