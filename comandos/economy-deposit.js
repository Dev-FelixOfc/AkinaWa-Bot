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
  // migration: balance -> wallet
  try {
    const raw = fs.readFileSync(dbFile, 'utf8')
    const parsed = JSON.parse(raw || '{}')
    let changed = false
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.balance !== 'undefined' && typeof v.wallet === 'undefined') {
        v.wallet = Number(v.balance || 0)
        delete v.balance
        changed = true
      }
      if (v && typeof v.bank === 'undefined') v.bank = Number(v.bank || 0)
      if (v && typeof v.lastAction === 'undefined') v.lastAction = Number(v.lastAction || 0)
      if (v && typeof v.lastRob === 'undefined') v.lastRob = Number(v.lastRob || 0)
    }
    if (changed) fs.writeFileSync(dbFile, JSON.stringify(parsed, null, 2))
  } catch (e) {
    // if corrupt, will be handled in readDb
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

function writeDb(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2))
}

var handler = async (m, { conn }) => {
  try {
    const db = readDb()
    const sender = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!sender) return conn.reply(m.chat, 'No se pudo identificar tu número.', m)

    if (!db[sender]) db[sender] = { wallet: 0, bank: 0, lastAction: 0 }

    const user = db[sender]
    const text = (m.text || m.body || '').trim()
    const parts = text.split(/\s+/).slice(1) // args after command

    if (!parts.length) {
      return conn.reply(m.chat, 'Uso: deposit all  o  deposit <cantidad>\nEj: deposit all\nEj: deposit 500', m)
    }

    const arg = parts[0].toLowerCase()
    if (arg === 'all') {
      if (!user.wallet || user.wallet <= 0) {
        return conn.reply(m.chat, '*[❁] Ya todos tus coins están en el banco.*\n\n> ¡Usa los comandos de economía y luego deposítalos para que no te lo roben!', m)
      }
      const amount = Number(user.wallet || 0)
      user.bank = (user.bank || 0) + amount
      user.wallet = 0
      user.lastAction = Date.now()
      db[sender] = user
      writeDb(db)
      return conn.reply(m.chat, `❁ Depositaste *${amount}* al banco.`, m)
    }

    // numeric amount
    const amt = Math.floor(Number(arg))
    if (isNaN(amt) || amt <= 0) {
      return conn.reply(m.chat, 'Cantidad inválida. Usa: deposit all  o  deposit <cantidad>', m)
    }
    if ((user.wallet || 0) < amt) {
      return conn.reply(m.chat, '*[❁] Ya todos tus coins están en el banco.*\n\n> ¡Usa los comandos de economía y luego deposítalos para que no te lo roben!', m)
    }
    user.wallet = (user.wallet || 0) - amt
    user.bank = (user.bank || 0) + amt
    user.lastAction = Date.now()
    db[sender] = user
    writeDb(db)
    return conn.reply(m.chat, `❁ Depositaste *${amt}* al banco.`, m)
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error en deposit: ${err.message || err}`, m)
  }
}

handler.help = ['deposit', 'dep', 'depositar', 'depisit']
handler.tags = ['economy']
handler.command = ['deposit', 'dep', 'depositar', 'depisit']

export default handler