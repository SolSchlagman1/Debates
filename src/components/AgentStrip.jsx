export default function AgentStrip({ agents }) {
  return (
    <div className="agent-strip">
      {agents.map((agent) => (
        <div key={agent.id} className="agent-card" style={{ borderColor: agent.color }}>
          <div className="agent-card-header">
            <div className="agent-card-avatar" style={{ backgroundColor: agent.color }}>
              {agent.name[0]}
            </div>
            <div>
              <div className="agent-card-name">{agent.name}</div>
              <div className="agent-card-handle">{agent.handle}</div>
            </div>
          </div>
          <p className="agent-card-stance">
            <strong>Position:</strong> {agent.stance || 'Not yet spoken'}
          </p>
        </div>
      ))}
    </div>
  )
}
