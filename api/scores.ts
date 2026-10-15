import { Redis } from '@upstash/redis'
import worlds from '../src/levels.json' with { type: 'json' }

const redis = Redis.fromEnv()
const KEEP = 100
const TOP = 10

// Max score per board: every emoji correct at the full 2× time multiplier
const levels = worlds.flatMap((w) => w.levels)
const MAX = new Map<string, number>([
  ['challenge', levels.reduce((sum, l) => sum + 2 * l.emojis.length, 0)],
  ...levels.map((l) => [`free:${l.name}`, 2 * l.emojis.length] as [string, number]),
])

// Members are { name, id } so the same name can appear more than once
type Member = { name: string; id: string }

async function top(board: string) {
  const flat = await redis.zrange<(Member | number)[]>(`hs:${board}`, 0, TOP - 1, { rev: true, withScores: true })
  const out: (Member & { score: number })[] = []
  for (let i = 0; i < flat.length; i += 2) out.push({ ...(flat[i] as Member), score: Number(flat[i + 1]) })
  return out
}

export async function GET(req: Request) {
  const board = new URL(req.url).searchParams.get('board') ?? ''
  if (!MAX.has(board)) return Response.json({ error: 'Unknown board' }, { status: 400 })
  return Response.json(await top(board))
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { board?: unknown; name?: unknown; score?: unknown } | null
  const board = String(body?.board ?? '')
  const name = String(body?.name ?? '').trim().slice(0, 12)
  const score = Number(body?.score)
  const max = MAX.get(board)
  if (max === undefined || !name || !Number.isInteger(score) || score < 0 || score > max)
    return Response.json({ error: 'Invalid score' }, { status: 400 })

  // Every score is kept, trimmed to the best KEEP per board
  const key = `hs:${board}`
  const member: Member = { name, id: crypto.randomUUID() }
  await redis.zadd(key, { score, member })
  await redis.zremrangebyrank(key, 0, -KEEP - 1)
  const rank = await redis.zrevrank(key, member)
  return Response.json({ id: member.id, rank: rank === null ? null : rank + 1, top: await top(board) })
}
