import { useEffect, useState } from 'react'
import TwitterFeed from './components/TwitterFeed'
import SearchBar from './components/SearchBar'
import { fetchUsage } from './api/debate'
import './App.css'

export default function App() {
  const [usage, setUsage] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    let active = true

    async function loadUsage() {
      try {
        const data = await fetchUsage()
        if (active) setUsage(data)
      } catch {
        if (active) setUsage(null)
      }
    }

    loadUsage()
    const timer = setInterval(loadUsage, 30_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  return (
    <div className="app app--twitter">
      <header className="twitter-topbar">
        <SearchBar value={searchQuery} onChange={setSearchQuery} />
        {usage?.cap > 0 && (
          <span className={`twitter-usage${usage.capped ? ' twitter-usage--capped' : ''}`}>
            ${usage.spent.toFixed(2)} / ${usage.cap.toFixed(0)}
          </span>
        )}
      </header>

      <main className="feed feed--twitter">
        <TwitterFeed searchQuery={searchQuery} />
      </main>
    </div>
  )
}
