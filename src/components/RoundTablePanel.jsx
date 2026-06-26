export default function RoundTablePanel({ agents }) {
  return (
    <section className="round-table-panel">
      <h2 className="round-table-title">At the table</h2>
      <p className="round-table-intro">
        Three serious perspectives — left, right, centre.
      </p>
      <div className="round-table-grid">
        {agents.map((agent) => (
          <div key={agent.id} className="round-table-seat" style={{ borderColor: agent.color }}>
            <div className="round-table-avatar" style={{ backgroundColor: agent.color }}>
              {agent.name[0]}
            </div>
            <div className="round-table-seat-info">
              <span className="round-table-name">{agent.name}</span>
              <span className="round-table-handle">{agent.handle}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
