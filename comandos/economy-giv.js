// comandos/economy-give.js
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

function parseTarget(parts, m) {
  if (m?.mentionedJid && Array.isArray(m.mentionedJid) && m.mentionedJid.length) {
    return normalizeNumber(m.mentionedJid[0])
  }
  if (parts.length >= 2) {
    const maybe = parts[parts.length - 1]
    const norm = maybe.replace(/\D/g, '')
    if (norm) return norm
  }
  return null
}

var handler = async (m, { conn }) => {
  try {
    const db = readDb()
    const sender = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!sender) return conn.reply(m.chat, 'No se pudo identificar tu número.', m)

    if (!db[sender]) db[sender] = { wallet: 0, bank: 0, lastAction: 0 }

    const text = (m.text || m.body || '').trim()
    const parts = text.split(/\s+/).slice(1) // amount and target

    if (parts.length < 2) {
      return conn.reply(m.chat, 'Uso: givechar <cantidad> <mención|número>\nEj: givechar 500 @usuario\nEj: givechar 500 573123456789', m)
    }

    const amount = Math.floor(Number(parts[0]))
    if (isNaN(amount) || amount <= 0) {
      return conn.reply(m.chat, 'Cantidad inválida.', m)
    }

    const target = parseTarget(parts, m)
    if (!target) return conn.reply(m.chat, 'No se encontró el usuario destino. Menciona o escribe su número.', m)
    if (target === sender) return conn.reply(m.chat, 'No puedes regalarte a ti mismo.', m)

    const giver = db[sender]
    if ((giver.wallet || 0) <= 0) {
      return conn.reply(m.chat, '*[❁]* No tienes suficientes coins para regalar.', m)
    }
    if ((giver.wallet || 0) < amount) {
      return conn.reply(m.chat, `*❁* No tienes *${amount}*\n\n> ¡Usa los comandos de economía para conseguir más Coins y poder darle a tus amigos!`, m)
    }

    if (!db[target]) db[target] = { wallet: 0, bank: 0, lastAction: 0 }

    giver.wallet = (giver.wallet || 0) - amount
    db[target].wallet = (db[target].wallet || 0) + amount
    giver.lastAction = Date.now()
    db[target].lastAction = Date.now()
    db[sender] = giver
    writeDb(db)

    const displayTarget = (m?.mentionedJid && m.mentionedJid[0]) ? m.mentionedJid[0] : `+${target}`

    return conn.reply(m.chat, `*[❁]* Regalaste *${amount}* a ${displayTarget}.`, m)
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error en give: ${err.message || err}`, m)
  }
}

handler.help = ['givechar', 'regcoins']
handler.tags = ['economy']
handler.command = ['givechar', 'regcoins']

export default handler