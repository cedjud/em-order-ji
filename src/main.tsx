import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import worlds from './levels.json'

// Random emoji favicon per load; public/favicon.svg (🧠) is the fallback
const emojis = worlds.flatMap((w) => w.levels.flatMap((l) => l.emojis))
const emoji = emojis[Math.floor(Math.random() * emojis.length)]
const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
if (icon)
  icon.href = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`,
  )}`

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
