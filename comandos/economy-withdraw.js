// comandos/economy-withdraw.js
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
    const parts = text.split(/\s+/).slice(1)

    if (!parts.length) {
      return conn.reply(m.chat, 'Uso: with all  o  with <cantidad>\nEj: with all\nEj: with 500', m)
    }

    const arg = parts[0].toLowerCase()
    if (arg === 'all') {
      if (!user.bank || user.bank <= 0) {
        return conn.reply(m.chat, '❁ No tienes coins en el banco.', m)
      }
      const amount = Number(user.bank || 0)
      user.bank = 0
      user.wallet = (user.wallet || 0) + amount
      user.lastAction = Date.now()
      db[sender] = user
      writeDb(db)
      return conn.reply(m.chat, `❁ Retiraste *${amount}* del banco.\n\n> ¡Tu dinero puede ser robado fácilmente!`, m)
    }

    const amt = Math.floor(Number(arg))
    if (isNaN(amt) || amt <= 0) {
      return conn.reply(m.chat, 'Cantidad inválida. Usa: with all  o  with <cantidad>', m)
    }
    if ((user.bank || 0) < amt) {
      return conn.reply(m.chat, '❁ No tienes esa cantidad de coins en el banco.', m)
    }
    user.bank = (user.bank || 0) - amt
    user.wallet = (user.wallet || 0) + amt
    user.lastAction = Date.now()
    db[sender] = user
    writeDb(db)
    return conn.reply(m.chat, `❁ Retiraste *${amt}* del banco.\n\n> ¡Tu dinero puede ser robado fácilmente!`, m)
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error en withdraw: ${err.message || err}`, m)
  }
}

handler.help = ['with', 'retirar', 'withcoins']
handler.tags = ['economy']
handler.command = ['with', 'retirar', 'withcoins']

export default handler