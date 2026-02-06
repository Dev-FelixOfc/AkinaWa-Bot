// comandos/economy-baltop.js
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
        wallet: 999999,
        bank: 0,
        lastDaily: 0,
        streak: 0,
        diamonds: 0,
        coal: 0,
        gold: 0,
        lastCrime: 0,
        lastChest: 0,
        lastAction: 0,
        lastRob: 0
      }
    }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
  }
  // attempt migration balance -> wallet and normalize keys
  try {
    const raw = fs.readFileSync(dbFile, 'utf8')
    const parsed = JSON.parse(raw || '{}')
    const normalized = {}
    let changed = false
    for (const [key, val] of Object.entries(parsed || {})) {
      const normKey = (key || '').toString().replace(/\D/g, '')
      if (!normKey) continue
      const v = (val && typeof val === 'object') ? val : {}
      const wallet = Number(v.wallet ?? v.balance ?? 0)
      const bank = Number(v.bank ?? 0)
      normalized[normKey] = {
        wallet,
        bank,
        lastDaily: Number(v.lastDaily ?? 0),
        streak: Number(v.streak ?? 0),
        diamonds: Number(v.diamonds ?? 0),
        coal: Number(v.coal ?? 0),
        gold: Number(v.gold ?? 0),
        lastCrime: Number(v.lastCrime ?? 0),
        lastChest: Number(v.lastChest ?? 0),
        lastAction: Number(v.lastAction ?? 0),
        lastRob: Number(v.lastRob ?? 0)
      }
      if (normKey !== key) changed = true
    }
    const normString = JSON.stringify(normalized, null, 2)
    if (changed) fs.writeFileSync(dbFile, normString)
  } catch (e) {
    // if parsing failed, do nothing here - readDb will recreate if needed
  }
}

function readDb() {
  ensureDb()
  try {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8') || '{}')
  } catch (e) {
    try { fs.renameSync(dbFile, dbFile + '.corrupt.' + Date.now()) } catch {}
    const init = {
      "573235915041": {
        wallet: 999999,
        bank: 0,
        lastDaily: 0,
        streak: 0,
        diamonds: 0,
        coal: 0,
        gold: 0,
        lastCrime: 0,
        lastChest: 0,
        lastAction: 0,
        lastRob: 0
      }
    }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
    return init
  }
}

var handler = async (m, { conn }) => {
  try {
    const db = readDb()
    const entries = Object.entries(db || {})

    // map to objects and filter users with any activity (or with any coins)
    const users = entries.map(([num, info]) => {
      const wallet = Number(info.wallet || 0)
      const bank = Number(info.bank || 0)
      const total = wallet + bank
      return { num: num.toString(), wallet, bank, total }
    }).filter(u => u.total > 0) // only users with coins; remove if you want all users

    if (users.length === 0) {
      return conn.reply(m.chat, '❀ No hay usuarios con Coins aún.', m)
    }

    // sort by total coins descending (wallet + bank)
    users.sort((a, b) => b.total - a.total)

    // parse page from command text: e.g. "baltop 2"
    const text = (m.text || m.body || '').trim()
    const parts = text.split(/\s+/)
    let page = 1
    if (parts.length > 1) {
      const p = parseInt(parts[1])
      if (!isNaN(p) && p > 0) page = p
    }

    const PER_PAGE = 10
    const totalPages = Math.max(1, Math.ceil(users.length / PER_PAGE))
    if (page > totalPages) {
      return conn.reply(m.chat, `❀ La página *${page}* no existe. Hay *${totalPages}* páginas.`, m)
    }

    const start = (page - 1) * PER_PAGE
    const pageItems = users.slice(start, start + PER_PAGE)

    // Build message and mentions array
    let message = `*❁ Top usuarios con más coins ❁*\n\n`
    const mentions = []
    for (let i = 0; i < pageItems.length; i++) {
      const u = pageItems[i]
      const pos = start + i + 1
      const jid = `${u.num}@s.whatsapp.net`
      mentions.push(jid)
      // Use @<number> in text so WhatsApp will convert it to mention when `mentions` provided
      message += `❀ @${u.num}\n> Coins: *${u.total}*\n\n`
    }
    message += `• Página *${page}* de *${totalPages}*`

    return conn.reply(m.chat, message, m, { mentions })
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error al obtener el baltop: ${err.message || err}`, m)
  }
}

handler.help = ['baltop', 'topbalance']
handler.tags = ['economy']
handler.command = ['baltop', 'topbalance']

export default handler