import { useEffect, useState } from 'react'

const NAME_KEY = 'emorderji-name'

type Entry = { name: string; id: string; score: number }

function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

// Global top 10 for a board; pass score to offer submitting it
export function Leaderboard({ board, score }: { board: string; score?: number }) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState(false)
  const [name, setName] = useState(loadName)
  const [rank, setRank] = useState<number | null | undefined>()
  const [mine, setMine] = useState<string>()
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/scores?board=${encodeURIComponent(board)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((e: Entry[]) => live && setEntries(e))
      .catch(() => live && setError(true))
    return () => {
      live = false
    }
  }, [board])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n || score === undefined) return
    try {
      localStorage.setItem(NAME_KEY, n)
    } catch {
      // ignore
    }
    setSending(true)
    try {
      const r = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ board, name: n, score }),
      })
      if (!r.ok) throw new Error()
      const res: { id: string; rank: number | null; top: Entry[] } = await r.json()
      setEntries(res.top)
      setRank(res.rank)
      setMine(res.id)
    } catch {
      setError(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {score !== undefined && score > 0 && rank === undefined && !error && (
        <form className="field" onSubmit={submit}>
          <input
            aria-label="Your name"
            placeholder="Your name"
            maxLength={12}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button disabled={sending || !name.trim()}>Submit score</button>
        </form>
      )}
      {rank !== undefined && <p>{rank === null ? 'Not in the top 100 this time.' : `You're #${rank}!`}</p>}
      {error ? (
        <p>Leaderboard unavailable.</p>
      ) : entries === null ? (
        <p>Loading…</p>
      ) : entries.length === 0 ? (
        <p>None yet.</p>
      ) : (
        <ol>
          {entries.map((s) => (
            <li key={s.id} className={s.id === mine ? 'me' : undefined}>
              {s.score} – {s.name}
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
