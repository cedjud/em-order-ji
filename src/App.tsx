import { useEffect, useRef, useState } from 'react'
import worlds from './levels.json'

const LEVEL_MS = 60_000
const GAME_KEY = 'emorderji-game'
const SCORES_KEY = 'emorderji-scores'

type Level = { world: number; level: number; worldName: string; name: string; emojis: string[] }

const LEVELS: Level[] = worlds.flatMap((w, wi) =>
  w.levels.map((l, li) => ({ world: wi + 1, level: li + 1, worldName: w.name, name: l.name, emojis: l.emojis })),
)

type Result = { correct: boolean[]; points: number; multiplier: number; levelScore: number }

type Game = {
  index: number
  score: number
  phase: 'play' | 'result' | 'over' | 'done'
  pool: string[]
  picked: string[]
  endsAt: number
  result?: Result
}

type HighScore = { score: number; reached: string; date: string }

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

function shuffle(emojis: string[]) {
  if (emojis.length < 2) return [...emojis]
  let out: string[]
  do {
    out = [...emojis]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
  } while (out.every((e, i) => e === emojis[i]))
  return out
}

function startLevel(index: number, score: number): Game {
  return { index, score, phase: 'play', pool: shuffle(LEVELS[index].emojis), picked: [], endsAt: Date.now() + LEVEL_MS }
}

function label(l: Level) {
  return `World ${l.world}, level ${l.level}`
}

export default function App() {
  const [game, setGame] = useState<Game | null>(() => load(GAME_KEY, null))
  const [scores, setScores] = useState<HighScore[]>(() => load(SCORES_KEY, []))
  const [now, setNow] = useState(() => Date.now())
  const about = useRef<HTMLDialogElement>(null)

  useEffect(() => save(GAME_KEY, game), [game])
  useEffect(() => save(SCORES_KEY, scores), [scores])

  function endGame(g: Game, phase: 'over' | 'done') {
    const reached = label(LEVELS[Math.min(g.index, LEVELS.length - 1)])
    setScores((s) =>
      [...s, { score: g.score, reached, date: new Date().toLocaleDateString() }]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10),
    )
    setGame({ ...g, phase })
  }

  // Tick timer while playing; game over when time runs out
  useEffect(() => {
    if (game?.phase !== 'play') return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= game.endsAt) endGame(game, 'over')
    }, 200)
    return () => clearInterval(id)
  })

  const level = game && LEVELS[game.index]
  const timeLeft = game ? Math.max(0, game.endsAt - now) : 0

  function pick(e: string) {
    setGame((g) => g && { ...g, picked: [...g.picked, e] })
  }

  function unpick(e: string) {
    setGame((g) => g && { ...g, picked: g.picked.filter((p) => p !== e) })
  }

  function submit() {
    if (!game || !level) return
    const correct = game.picked.map((e, i) => e === level.emojis[i])
    const points = correct.filter(Boolean).length
    const multiplier = 1 + Math.max(0, game.endsAt - Date.now()) / LEVEL_MS
    const levelScore = Math.round(points * multiplier)
    setGame({ ...game, phase: 'result', score: game.score + levelScore, result: { correct, points, multiplier, levelScore } })
  }

  function next() {
    if (!game) return
    if (game.index + 1 >= LEVELS.length) endGame(game, 'done')
    else setGame(startLevel(game.index + 1, game.score))
  }

  function cancel() {
    if (confirm('Cancel current game?')) setGame(null)
  }

  return (
    <>
      <h1>em-order-ji</h1>
      <p>
        <button onClick={() => about.current?.showModal()}>About</button>{' '}
        {game && (game.phase === 'play' || game.phase === 'result') && <button onClick={cancel}>Cancel game</button>}
      </p>

      <dialog ref={about}>
        <p>Tap the emojis in the official Unicode order. Correct positions score a point, multiplied by up to 2× for time left. Run out of time and it's game over.</p>
        <p>
          Order reference:{' '}
          <a href="https://www.unicode.org/emoji/charts-17.0/emoji-ordering.html" target="_blank" rel="noreferrer">
            Unicode emoji ordering v17
          </a>
        </p>
        <form method="dialog">
          <button>Close</button>
        </form>
      </dialog>

      {!game && (
        <>
          <button onClick={() => setGame(startLevel(0, 0))}>Start game</button>
          <h2>High scores</h2>
          {scores.length === 0 ? (
            <p>None yet.</p>
          ) : (
            <ol>
              {scores.map((s, i) => (
                <li key={i}>
                  {s.score} – {s.reached} ({s.date})
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {game && level && (
        <>
          <p>
            <b>{label(level)}</b>
            <br />
            {level.worldName} – {level.name}
            <br />
            Score: {game.score}
            {game.phase === 'play' && <> · Time: {Math.ceil(timeLeft / 1000)}s</>}
          </p>

          {game.phase === 'play' && (
            <>
              <p>Jumbled</p>
              <div className="row">
                {game.pool
                  .filter((e) => !game.picked.includes(e))
                  .map((e) => (
                    <button key={e} onClick={() => pick(e)}>
                      {e}
                    </button>
                  ))}
              </div>
              <p>Your order</p>
              <div className="row">
                {game.picked.map((e) => (
                  <button key={e} onClick={() => unpick(e)}>
                    {e}
                  </button>
                ))}
              </div>
              <p>
                <button disabled={game.picked.length !== level.emojis.length} onClick={submit}>
                  Confirm
                </button>
              </p>
            </>
          )}

          {game.phase === 'result' && game.result && (
            <>
              <p>Your order</p>
              <div className="row">
                {game.picked.map((e, i) => (
                  <button key={e} className={game.result!.correct[i] ? '' : 'wrong'} disabled>
                    {e}
                  </button>
                ))}
              </div>
              <p>Correct order</p>
              <div className="row">
                {level.emojis.map((e) => (
                  <button key={e} disabled>
                    {e}
                  </button>
                ))}
              </div>
              <p>
                {game.result.points}/{level.emojis.length} correct × {game.result.multiplier.toFixed(2)} ={' '}
                {game.result.levelScore} points
              </p>
              <button onClick={next}>Next level</button>
            </>
          )}

          {(game.phase === 'over' || game.phase === 'done') && (
            <>
              <h2>{game.phase === 'over' ? "Time's up! Game over." : 'You finished every level!'}</h2>
              <p>Final score: {game.score}</p>
              <button onClick={() => setGame(null)}>Back to start</button>
            </>
          )}
        </>
      )}
    </>
  )
}
