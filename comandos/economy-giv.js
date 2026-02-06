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

// Resolve target from: reply -> mention -> last arg numeric
function resolveTargetForGive(m, parts) {
  try {
    if (m?.quoted) {
      const q = m.quoted
      const possible = (q.sender || q.participant || (q.key && (q.key.participant || q.key.remoteJid)))
      if (possible) {
        const norm = normalizeNumber(possible)
        if (norm) return norm
      }
      const contextParticipant = q?.contextInfo?.participant
      if (contextParticipant) {
        const norm = normalizeNumber(contextParticipant)
        if (norm) return norm
      }
    }
  } catch (e) {}

  try {
    if (m?.mentionedJid && Array.isArray(m.mentionedJid) && m.mentionedJid.length) {
      const norm = normalizeNumber(m.mentionedJid[0])
      if (norm) return norm
    }
  } catch (e) {}

  if (Array.isArray(parts) && parts.length) {
    const maybe = parts[parts.length - 1]
    const norm = normalizeNumber(maybe)
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
    const parts = text.split(/\s+/).slice(1) // amount and target (target may be last arg or reply/mention)

    if (parts.length < 1) {
      return conn.reply(m.chat, 'Uso: givechar <cantidad> <mención|número> o responde al usuario con: givechar <cantidad>\nEj: givechar 500 @usuario\nEj: givechar 500 573123456789\nO responde al mensaje del usuario: givechar 500', m)
    }

    const amount = Math.floor(Number(parts[0]))
    if (isNaN(amount) || amount <= 0) {
      return conn.reply(m.chat, 'Cantidad inválida.', m)
    }

    const target = resolveTargetForGive(m, parts)
    if (!target) return conn.reply(m.chat, 'No se encontró el usuario destino. Menciona, escribe su número o responde a su mensaje.', m)
    if (target === sender) return conn.reply(m.chat, 'No puedes regalarte a ti mismo.', m)

    if (!db[sender]) db[sender] = { wallet: 0, bank: 0, lastAction: 0 }
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