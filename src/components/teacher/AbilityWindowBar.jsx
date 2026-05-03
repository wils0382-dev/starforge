export default function AbilityWindowBar({ classData, secondsLeft, activations, onManualClose }) {
  const mins = Math.floor(secondsLeft / 60)
  const secs = String(secondsLeft % 60).padStart(2, '0')
  const urgent = secondsLeft > 0 && secondsLeft <= 30
  const targets = classData?.event_data?.targets ?? []

  return (
    <div className={`awb ${urgent ? 'awb-urgent' : ''}`}>
      <div className="awb-meta">
        <span className="awb-label">⚡ ABILITY WINDOW</span>
        {classData.window_message && (
          <span className="awb-msg">"{classData.window_message}"</span>
        )}
        {targets.length > 0 && (
          <span className="awb-targets">
            Targeting: {targets.map(t => `${t.studentName} (${t.damage} HP)`).join(', ')}
          </span>
        )}
      </div>

      <div className="awb-feed">
        {activations.length === 0 ? (
          <span className="awb-waiting">Waiting for activations...</span>
        ) : (
          activations.map((a, i) => (
            <span key={i} className="awb-activation">
              {a.abilityIcon} <strong>{a.activatorName}</strong> — {a.abilityName}
            </span>
          ))
        )}
      </div>

      <div className={`awb-timer ${urgent ? 'urgent' : ''}`}>{mins}:{secs}</div>
      <button className="btn btn-sm btn-danger" onClick={onManualClose}>✕ Close</button>
    </div>
  )
}
