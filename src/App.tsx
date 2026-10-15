import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import worlds from './levels.json'

// Durations scale with emoji count: base + per emoji
const previewMs = (n: number) => 2_000 + 400 * n
const roundMs = (n: number) => 10_000 + 3_000 * n
const GAME_KEY = 'emorderji-game'
const SCORES_KEY = 'emorderji-scores'

type Level = { world: number; level: number; worldName: string; name: string; emojis: string[] }

const LEVELS: Level[] = worlds.flatMap((w, wi) =>
  w.levels.map((l, li) => ({ world: wi + 1, level: li + 1, worldName: w.name, name: l.name, emojis: l.emojis })),
)

type Result = { correct: boolean[]; points: number; multiplier: number; levelScore: number; timedOut: boolean; timeLeft?: number }

type Mode = 'challenge' | 'free'

type Game = {
  mode: Mode
  index: number
  score: number
  phase: 'preview' | 'play' | 'result' | 'done'
  pool: string[]
  picked: string[]
  endsAt: number
  result?: Result
}

type Drag = { emoji: string; from: 'pool' | 'order'; x: number; y: number; over: number | null }

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

function startLevel(mode: Mode, index: number, score: number): Game {
  const pool = shuffle(LEVELS[index].emojis)
  return { mode, index, score, phase: 'preview', pool, picked: [], endsAt: Date.now() + previewMs(pool.length) }
}

function levelIndex(world: number, level: number) {
  return LEVELS.findIndex((l) => l.world === world && l.level === level)
}

function label(l: Level) {
  return `World ${l.world}, level ${l.level}`
}

export default function App() {
  const [game, setGame] = useState<Game | null>(() => {
    const g = load<Game | null>(GAME_KEY, null)
    return g && { ...g, mode: g.mode ?? 'challenge', phase: (g.phase as string) === 'over' ? 'done' : g.phase }
  })
  const [world, setWorld] = useState(1)
  const [lvl, setLvl] = useState(1)
  const [scores, setScores] = useState<HighScore[]>(() => load(SCORES_KEY, []))
  const [now, setNow] = useState(() => Date.now())
  const about = useRef<HTMLDialogElement>(null)
  const orderRow = useRef<HTMLDivElement>(null)
  const ourRow = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragged = useRef(false)

  useEffect(() => save(GAME_KEY, game), [game])
  useEffect(() => save(SCORES_KEY, scores), [scores])

  function endGame(g: Game) {
    const reached = label(LEVELS[Math.min(g.index, LEVELS.length - 1)])
    setScores((s) =>
      [...s, { score: g.score, reached, date: new Date().toLocaleDateString() }]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10),
    )
    setGame({ ...g, phase: 'done' })
  }

  // Tick timer during preview/play; preview ends into play, play ends in scoring what's picked
  useEffect(() => {
    if (game?.phase !== 'preview' && game?.phase !== 'play') return
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t < game.endsAt) return
      if (game.phase === 'preview') setGame({ ...game, phase: 'play', endsAt: t + roundMs(game.pool.length) })
      else submit(true)
    }, 100)
    return () => clearInterval(id)
  })

  // On submit, slide our graded order down from the top box into the bottom one
  const phase = game?.phase
  useLayoutEffect(() => {
    if (phase !== 'result' || !orderRow.current || !ourRow.current) return
    const dy = orderRow.current.getBoundingClientRect().top - ourRow.current.getBoundingClientRect().top
    ourRow.current.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
      duration: 200,
      easing: 'ease-out',
    })
  }, [phase])

  const level = game && LEVELS[game.index]
  const timeLeft = game ? Math.max(0, game.endsAt - now) : 0

  function pick(e: string) {
    if (dragged.current) return
    setGame((g) => g && { ...g, picked: [...g.picked, e] })
  }

  function unpick(e: string) {
    if (dragged.current) return
    setGame((g) => g && { ...g, picked: g.picked.filter((p) => p !== e) })
  }

  // Insertion index in the order row under (x, y), or null when outside it
  function dropIndex(x: number, y: number) {
    const row = orderRow.current
    if (!row) return null
    const r = row.getBoundingClientRect()
    const pad = 24
    if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return null
    const items = [...row.querySelectorAll<HTMLElement>('[data-e]')]
    const i = items.findIndex((el) => {
      const b = el.getBoundingClientRect()
      return y < b.top || (y <= b.bottom && x < b.left + b.width / 2)
    })
    return i === -1 ? items.length : i
  }

  // Pointer-based drag so it works with touch; taps still go through onClick
  function startDrag(e: React.PointerEvent, emoji: string, from: Drag['from']) {
    if (e.button !== 0) return
    const x0 = e.clientX
    const y0 = e.clientY
    let current: Drag | null = null
    const move = (ev: PointerEvent) => {
      if (!current && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return
      current = { emoji, from, x: ev.clientX, y: ev.clientY, over: dropIndex(ev.clientX, ev.clientY) }
      setDrag(current)
    }
    const end = (ev: PointerEvent) => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', end)
      removeEventListener('pointercancel', end)
      if (!current) return
      dragged.current = true
      setTimeout(() => (dragged.current = false))
      setDrag(null)
      if (ev.type === 'pointercancel') return
      const { over } = current
      setGame((g) => {
        if (!g || g.phase !== 'play') return g
        const rest = g.picked.filter((p) => p !== emoji)
        if (over === null) return from === 'order' ? { ...g, picked: rest } : g
        rest.splice(over, 0, emoji)
        return { ...g, picked: rest }
      })
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', end)
    addEventListener('pointercancel', end)
  }

  function submit(timedOut = false) {
    if (!game || !level) return
    const correct = game.picked.map((e, i) => e === level.emojis[i])
    const points = correct.filter(Boolean).length
    // Time bonus only for a complete order
    const timeLeft = Math.max(0, game.endsAt - Date.now())
    const full = game.picked.length === level.emojis.length
    const multiplier = full ? 1 + timeLeft / roundMs(level.emojis.length) : 1
    const levelScore = Math.round(points * multiplier)
    const result = { correct, points, multiplier, levelScore, timedOut, timeLeft }
    setGame({ ...game, phase: 'result', score: game.score + levelScore, result })
  }

  function next() {
    if (!game) return
    if (game.index + 1 >= LEVELS.length) endGame(game)
    else setGame(startLevel(game.mode, game.index + 1, game.score))
  }

  function playFree(index: number) {
    setWorld(LEVELS[index].world)
    setLvl(LEVELS[index].level)
    setGame(startLevel('free', index, 0))
  }

  function random() {
    playFree(Math.floor(Math.random() * LEVELS.length))
  }

  function cancel() {
    if (game?.mode === 'free' || confirm('Cancel current game?')) setGame(null)
  }

  return (
    <>
      <header>
        <h1>em-order-ji</h1>
        <p>
          <button onClick={() => about.current?.showModal()}>About</button>{' '}
          {game && (game.phase === 'preview' || game.phase === 'play' || game.phase === 'result') && (
            <button onClick={cancel}>{game.mode === 'free' ? 'Back' : 'Cancel game'}</button>
          )}
        </p>
      </header>

      <dialog ref={about}>
        <p>Memorise the order shown, then tap the emojis in the official Unicode order. Correct positions score a point, multiplied by up to 2× for time left if you place them all. Run out of time and only what you've placed counts.</p>
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
          <h2>Challenge</h2>
          <p>Every level in order, one total score.</p>
          <button onClick={() => setGame(startLevel('challenge', 0, 0))}>Start challenge</button>

          <h2>Free play</h2>
          <div className="field">
            <select
              aria-label="World"
              value={world}
              onChange={(e) => {
                setWorld(Number(e.target.value))
                setLvl(1)
              }}
            >
              {worlds.map((w, i) => (
                <option key={w.name} value={i + 1}>
                  {i + 1}. {w.name}
                </option>
              ))}
            </select>
            <select aria-label="Level" value={lvl} onChange={(e) => setLvl(Number(e.target.value))}>
              {worlds[world - 1].levels.map((l, i) => (
                <option key={l.name} value={i + 1}>
                  {i + 1}. {l.name}
                </option>
              ))}
            </select>
          </div>
          <p>
            <button onClick={() => playFree(levelIndex(world, lvl))}>Play</button>{' '}
            <button onClick={random}>Random</button>
          </p>

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
            {game.mode === 'challenge' ? `Challenge · Score: ${game.score}` : 'Free play'}
          </p>

          {game.phase !== 'done' && (
            <>
              <label className="timer">
                {game.phase === 'preview' ? (
                  <>
                    {/* Eyes cycle 1 → 2 → 3 */}
                    <span className="eyes">
                      {'👀'.repeat(1 + (Math.floor((previewMs(level.emojis.length) - timeLeft) / 300) % 3))}
                    </span>{' '}
                    Memorise
                  </>
                ) : (
                  '⏱️ Time'
                )}{' '}
                ·{' '}
                {Math.ceil(
                  (game.phase === 'result' && game.result
                    ? (game.result.timeLeft ?? (game.result.multiplier - 1) * roundMs(level.emojis.length))
                    : timeLeft) / 1000,
                )}
                s
                <progress
                  max={(game.phase === 'preview' ? previewMs : roundMs)(level.emojis.length)}
                  value={
                    game.phase === 'result' && game.result
                      ? (game.result.timeLeft ?? (game.result.multiplier - 1) * roundMs(level.emojis.length))
                      : timeLeft
                  }
                />
              </label>

              {/* Theirs: correct order, then your order while playing */}
              <p className="label">{game.phase === 'play' ? '🎯 Your order' : '✅ Correct order'}</p>
              <div className="row" ref={orderRow}>
                {game.phase === 'preview' &&
                  level.emojis.map((e) => (
                    <button key={`c${e}`} disabled>
                      {e}
                    </button>
                  ))}
                {game.phase === 'play' && (
                  <>
                    <div className="overlay" aria-hidden>
                      {level.emojis.map((e) => (
                        <button key={e} className="out" disabled tabIndex={-1}>
                          {e}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const items = (drag ? game.picked.filter((p) => p !== drag.emoji) : game.picked).map((e) => (
                        <button
                          key={`p${e}`}
                          data-e
                          onPointerDown={(ev) => startDrag(ev, e, 'order')}
                          onClick={() => unpick(e)}
                        >
                          {e}
                        </button>
                      ))
                      if (drag?.over != null)
                        items.splice(
                          drag.over,
                          0,
                          <span key="slot" className="slot">
                            {drag.emoji}
                          </span>,
                        )
                      return items
                    })()}
                  </>
                )}
                {game.phase === 'result' &&
                  level.emojis.map((e) => (
                    <button key={`r${e}`} className="in" disabled>
                      {e}
                    </button>
                  ))}
              </div>

              {/* Ours: jumbled while playing, graded order after */}
              <p className="label">{game.phase === 'result' ? '🎯 Your order' : '🔀 Jumbled'}</p>
              <div className="row" ref={ourRow}>
                {game.phase === 'play' &&
                  game.pool
                    .filter((e) => !game.picked.includes(e))
                    .map((e) => (
                      <button
                        key={`j${e}`}
                        className={drag?.emoji === e ? 'in lifted' : 'in'}
                        onPointerDown={(ev) => startDrag(ev, e, 'pool')}
                        onClick={() => pick(e)}
                      >
                        {e}
                      </button>
                    ))}
                {game.phase === 'result' &&
                  game.result &&
                  level.emojis.map((_, i) => {
                    const e = game.picked[i]
                    if (!e)
                      return (
                        <span key={`x${i}`} className="empty">
                          ❌
                        </span>
                      )
                    return (
                      <button key={`g${e}`} disabled>
                        {e}
                        <span className="badge">{game.result!.correct[i] ? '✅' : '❌'}</span>
                      </button>
                    )
                  })}
              </div>

              {drag && (
                <div className="ghost" style={{ left: drag.x, top: drag.y }}>
                  {drag.emoji}
                </div>
              )}

              {game.phase === 'play' && (
                <p>
                  <button disabled={game.picked.length === 0} onClick={() => submit()}>
                    Confirm
                  </button>
                </p>
              )}

              {game.phase === 'result' && game.result && (
                <>
                  <p>
                    {game.result.timedOut && "Time's up! "}
                    {game.result.points}/{level.emojis.length} correct × {game.result.multiplier.toFixed(2)} ={' '}
                    {game.result.levelScore} points
                  </p>
                  <p>
                    {(game.mode === 'challenge' || game.index + 1 < LEVELS.length) && (
                      <button onClick={next}>Next level</button>
                    )}{' '}
                    {game.mode === 'free' && (
                      <>
                        <button onClick={() => playFree(game.index)}>Retry</button>{' '}
                        <button onClick={random}>Random</button>
                      </>
                    )}
                  </p>
                </>
              )}
            </>
          )}

          {game.phase === 'done' && (
            <>
              <h2>You finished every level!</h2>
              <p>Final score: {game.score}</p>
              <button onClick={() => setGame(null)}>Back to start</button>
            </>
          )}
        </>
      )}
    </>
  )
}
