import { useRef, useState } from 'react'
import AgentAvatar from './AgentAvatar'
import { uploadAgentAvatar } from '../api/agents'

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Use a JPG, PNG, or GIF image'))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('Image too large (max 2MB)'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.readAsDataURL(file)
  })
}

export default function ProfilePhotos({ agents, onClose, onUpdated }) {
  const [uploadingId, setUploadingId] = useState(null)
  const [error, setError] = useState(null)
  const fileRefs = useRef({})

  async function handlePick(agent, file) {
    if (!file) return
    setError(null)
    setUploadingId(agent.id)
    try {
      const avatarUrl = await readImageFile(file)
      await uploadAgentAvatar(agent.id, avatarUrl)
      await onUpdated()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploadingId(null)
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog profile-photos" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Profile pictures</h3>
        <p className="dialog-text">Upload a photo for each account. Saved permanently.</p>

        {error && <p className="agent-doc-error">{error}</p>}

        <div className="profile-photos-grid">
          {agents.map((agent) => (
            <div key={agent.id} className="profile-photo-card">
              <AgentAvatar participant={agent} className="avatar profile-photo-preview" />
              <div className="profile-photo-meta">
                <strong>{agent.name}</strong>
                <span>{agent.handle}</span>
              </div>
              <input
                ref={(el) => {
                  fileRefs.current[agent.id] = el
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={(e) => handlePick(agent, e.target.files?.[0])}
              />
              <button
                type="button"
                className="debate-action-btn"
                disabled={uploadingId === agent.id}
                onClick={() => fileRefs.current[agent.id]?.click()}
              >
                {uploadingId === agent.id ? 'Uploading…' : agent.avatarUrl ? 'Change photo' : 'Upload photo'}
              </button>
            </div>
          ))}
        </div>

        <div className="dialog-actions">
          <button type="button" className="prompt-action" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
