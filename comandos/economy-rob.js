// comandos/economy-rob.js
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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function msToMinutes(ms) {
  return Math.ceil(ms / 60000)
}

// Try to resolve a target user id from: reply -> mentions -> numeric arg
function resolveTarget(m, args) {
  // 1) If message is a reply, try to pull the quoted sender
  try {
    if (m?.quoted) {
      // Baileys: quoted.key.participant or quoted.sender
      const q = m.quoted
      const possible = (q.sender || q.participant || (q.key && (q.key.participant || q.key.remoteJid)) || q.key && q.key.remoteJid)
      if (possible) {
        const norm = normalizeNumber(possible)
        if (norm) return norm
      }
      // also sometimes the quoted message contains participant in contextinfo
      const contextParticipant = q?.contextInfo?.participant
      if (contextParticipant) {
        const norm = normalizeNumber(contextParticipant)
        if (norm) return norm
      }
    }
  } catch (e) {}

  // 2) mentions (m.mentionedJid array)
  try {
    if (m?.mentionedJid && Array.isArray(m.mentionedJid) && m.mentionedJid.length) {
      const norm = normalizeNumber(m.mentionedJid[0])
      if (norm) return norm
    }
  } catch (e) {}

  // 3) args: first arg may be number or @... or +...
  if (Array.isArray(args) && args.length) {
    const maybe = args[0]
    if (typeof maybe === 'string') {
      const norm = normalizeNumber(maybe)
      if (norm) return norm
    }
  }

  return null
}

var handler = async (m, { conn }) => {
  try {
    const db = readDb()
    const attacker = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!attacker) return conn.reply(m.chat, 'No se pudo identificar tu número.', m)

    if (!db[attacker]) db[attacker] = { wallet: 0, bank: 0, lastAction: 0, lastRob: 0 }

    const now = Date.now()
    const COOLDOWN_ROB = 60 * 60 * 1000 // 1 hora
    const lastRob = Number(db[attacker].lastRob || 0)
    if (lastRob && (now - lastRob) < COOLDOWN_ROB) {
      const remaining = COOLDOWN_ROB - (now - lastRob)
      const mins = msToMinutes(remaining)
      return conn.reply(m.chat, `Debes esperar ${mins} minutos para usar rob de nuevo.`, m)
    }

    const text = (m.text || m.body || '').trim()
    const parts = text.split(/\s+/).slice(1)
    const target = resolveTarget(m, parts)
    if (!target) return conn.reply(m.chat, 'Uso: rob <mención|número> o responde al mensaje del usuario que quieres robar.\nEj: rob @usuario\nEj: rob 573123456789', m)
    if (target === attacker) return conn.reply(m.chat, 'No puedes robarte a ti mismo.', m)

    if (!db[target]) db[target] = { wallet: 0, bank: 0, lastAction: 0 }

    const victim = db[target]

    // If victim has no money anywhere
    if ((!victim.wallet || victim.wallet <= 0) && (!victim.bank || victim.bank <= 0)) {
      return conn.reply(m.chat, '*❁ No puedes robarle a los pobres*\n\n> ¡Este usuario aún no tiene dinero!', m)
    }

    // If victim has only bank (wallet 0) -> cannot rob
    if ((!victim.wallet || victim.wallet <= 0) && (victim.bank && victim.bank > 0)) {
      return conn.reply(m.chat, '*❁ Este usuario tiene sus coins en el banco, no puedes robarselo*', m)
    }

    // Victim protection: if victim used commands recently (within 1 hour), they are protected
    const PROTECT_WINDOW = 60 * 60 * 1000 // 1 hora
    const lastActionVictim = Number(victim.lastAction || 0)
    if (lastActionVictim && (now - lastActionVictim) < PROTECT_WINDOW) {
      const remaining = PROTECT_WINDOW - (now - lastActionVictim)
      const mins = msToMinutes(remaining)
      return conn.reply(m.chat, `No puedes robar a este usuario ahora. Está protegido por actividad reciente (${mins} min restantes).`, m)
    }

    // Ensure victim will not be left with 0; if wallet <=1 cannot steal
    if ((victim.wallet || 0) <= 1) {
      return conn.reply(m.chat, '*❁ No puedes robarle a los pobres (wallet muy baja)*', m)
    }

    const maxSteal = Math.min(100, Math.max(1, (victim.wallet || 0) - 1))
    const stolen = randomInt(1, maxSteal)

    // Transfer
    victim.wallet = (victim.wallet || 0) - stolen
    db[target] = victim
    db[attacker].wallet = (db[attacker].wallet || 0) + stolen
    db[attacker].lastRob = now
    db[attacker].lastAction = now
    writeDb(db)

    return conn.reply(m.chat, `❁ Robaste *${stolen}* coins.`, m)
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error en rob: ${err.message || err}`, m)
  }
}

handler.help = ['rob', 'robar']
handler.tags = ['economy']
handler.command = ['rob', 'robar']

export default handler