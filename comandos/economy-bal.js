// comandos/economy-balance.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbDir = path.join(__dirname, '..', 'jsons')
const dbFile = path.join(dbDir, 'economy.json')

function normalizeNumber(raw) {
  if (!raw) return ''
  return raw.toString().split('@')[0].replace(/\D/g, '')
}

function ensureDb() {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
  if (!fs.existsSync(dbFile)) {
    const init = {
      "573235915041": {
        balance: 999999,
        lastDaily: 0,
        streak: 0,
        diamonds: 0,
        coal: 0,
        gold: 0,
        lastCrime: 0,
        lastChest: 0
      }
    }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
  } else {
    try {
      const raw = fs.readFileSync(dbFile, 'utf8')
      const parsed = JSON.parse(raw || '{}')
      const normalized = {}
      let changed = false
      for (const [key, val] of Object.entries(parsed || {})) {
        const norm = (key || '').toString().replace(/\D/g, '')
        if (!norm) continue
        normalized[norm] = {
          balance: Number((val && val.balance) || 0),
          lastDaily: Number((val && val.lastDaily) || 0),
          streak: Number((val && val.streak) || 0),
          diamonds: Number((val && val.diamonds) || 0),
          coal: Number((val && val.coal) || 0),
          gold: Number((val && val.gold) || 0),
          lastCrime: Number((val && val.lastCrime) || 0),
          lastChest: Number((val && val.lastChest) || 0)
        }
        if (norm !== key) changed = true
      }
      if (changed) fs.writeFileSync(dbFile, JSON.stringify(normalized, null, 2))
    } catch (e) {
      console.error('ensureDb migration error:', e)
    }
  }
}

function readDb() {
  ensureDb()
  try {
    const raw = fs.readFileSync(dbFile, 'utf8')
    return JSON.parse(raw || '{}')
  } catch (e) {
    try { fs.renameSync(dbFile, dbFile + '.corrupt.' + Date.now()) } catch {}
    const init = {
      "573235915041": {
        balance: 999999,
        lastDaily: 0,
        streak: 0,
        diamonds: 0,
        coal: 0,
        gold: 0,
        lastCrime: 0,
        lastChest: 0
      }
    }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
    return init
  }
}

var handler = async (m, { conn }) => {
  try {
    const db = readDb()
    const sender = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!sender) return conn.reply(m.chat, 'No se pudo identificar tu número.', m)

    const userEntry = db[sender] || { balance: 0 }

    const message =
`❁ \`Balance del usuario\` ❁

Coins: *${Number(userEntry.balance || 0)}*

> ¡Usa más los comandos de economía para que ganes más dinero y seas el más rico!`

    return conn.reply(m.chat, message, m)
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error al obtener tu balance: ${err.message || err}`, m)
  }
}

handler.help = ['bal', 'balance']
handler.tags = ['economy']
handler.command = ['bal', 'balance']

export default handler