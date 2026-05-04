export default function TabBar({ activeTab, onSwitch, pendingCount = 0 }) {
  return (
    <div id="tab-bar">
      <button
        className={`tab-btn ${activeTab === 'roster' ? 'active' : ''}`}
        onClick={() => onSwitch('roster')}
      >
        ⚔ Roster
      </button>
      <button
        className={`tab-btn portal-tab ${activeTab === 'portal' ? 'active' : ''}`}
        onClick={() => onSwitch('portal')}
      >
        ◈ Portal Manager
        {pendingCount > 0 && (
          <span className="tab-badge">{pendingCount}</span>
        )}
      </button>
      <button
        className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
        onClick={() => onSwitch('settings')}
      >
        ⚙ Settings
      </button>
    </div>
  )
}
