// Builds src/levels.json from the Unicode emoji-test.txt (CLDR order).
// Usage: node scripts/build-levels.mjs
import { writeFileSync } from 'node:fs'

const VERSION = '17.0.0'
const MIN_PER_LEVEL = 3
const MAX_PER_LEVEL = 16
const SKIN_TONE = /1F3F[B-F]/

const res = await fetch(`https://www.unicode.org/Public/${VERSION}/emoji/emoji-test.txt`)
const text = await res.text()

const worlds = []
let world, subgroup
for (const line of text.split('\n')) {
  if (line.startsWith('# group: ')) {
    const name = line.slice(9).trim()
    world = name === 'Component' ? null : { name, levels: [] }
    if (world) worlds.push(world)
  } else if (line.startsWith('# subgroup: ')) {
    subgroup = world && { name: line.slice(12).trim(), emojis: [] }
    if (subgroup) world.levels.push(subgroup)
  } else if (subgroup && !line.startsWith('#') && line.includes('; fully-qualified') && !SKIN_TONE.test(line)) {
    subgroup.emojis.push(line.split('# ')[1].split(' ')[0])
  }
}

// Merge tiny subgroups into their neighbour (next one, or previous if last)
for (const w of worlds) {
  const merged = []
  let carry = null
  for (const l of w.levels) {
    const cur = carry ? { name: `${carry.name} + ${l.name}`, emojis: [...carry.emojis, ...l.emojis] } : l
    carry = cur.emojis.length < MIN_PER_LEVEL ? cur : null
    if (!carry) merged.push(cur)
  }
  if (carry) {
    const prev = merged.pop()
    merged.push(prev ? { name: `${prev.name} + ${carry.name}`, emojis: [...prev.emojis, ...carry.emojis] } : carry)
  }
  w.levels = merged
}

// Split oversized subgroups into evenly sized chunks
for (const w of worlds) {
  w.levels = w.levels.flatMap(({ name, emojis }) => {
    const parts = Math.ceil(emojis.length / MAX_PER_LEVEL)
    if (parts <= 1) return [{ name, emojis }]
    const size = Math.ceil(emojis.length / parts)
    return Array.from({ length: parts }, (_, i) => ({
      name: `${name} (${i + 1}/${parts})`,
      emojis: emojis.slice(i * size, (i + 1) * size),
    }))
  })
}

writeFileSync(new URL('../src/levels.json', import.meta.url), JSON.stringify(worlds))
console.log(worlds.map((w) => `${w.name}: ${w.levels.length} levels`).join('\n'))
