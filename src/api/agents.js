async function parseJson(res, fallback) {
  const raw = await res.text()
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(fallback)
  }
}

export async function fetchAgents() {
  let res
  try {
    res = await fetch('/api/agents')
  } catch {
    throw new Error('Cannot reach the server. Run: npm run dev')
  }
  const data = await parseJson(res, 'Failed to load agents')
  if (!res.ok) throw new Error(data.error || 'Failed to load agents')
  return data.agents || []
}

export async function saveAgentToServer(agent) {
  let res
  try {
    res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(agent),
    })
  } catch {
    throw new Error('Cannot reach the server. Run: npm run dev')
  }
  const data = await parseJson(res, 'Failed to save agent')
  if (!res.ok) throw new Error(data.error || 'Failed to save agent')
  return data.agent
}

export async function deleteAgentOnServer(agentId) {
  let res
  try {
    res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, { method: 'DELETE' })
  } catch {
    throw new Error('Cannot reach the server. Run: npm run dev')
  }
  const data = await parseJson(res, 'Failed to delete agent')
  if (!res.ok) throw new Error(data.error || 'Failed to delete agent')
}

export async function importAgentsToServer(agents) {
  let res
  try {
    res = await fetch('/api/agents/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agents }),
    })
  } catch {
    throw new Error('Cannot reach the server. Run: npm run dev')
  }
  const data = await parseJson(res, 'Failed to import agents')
  if (!res.ok) throw new Error(data.error || 'Failed to import agents')
  return data.agents || []
}

export async function uploadAgentAvatar(agentId, avatarUrl) {
  let res
  try {
    res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatarUrl }),
    })
  } catch {
    throw new Error('Cannot reach the server. Run: npm run dev')
  }
  const data = await parseJson(res, 'Failed to save profile picture')
  if (!res.ok) throw new Error(data.error || 'Failed to save profile picture')
  return data.agent
}

export async function fetchAgentStats() {
  try {
    const res = await fetch('/api/agents/stats')
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
