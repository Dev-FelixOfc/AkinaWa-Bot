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

// Resuelve objetivo: RESPUESTA -> MENCIÓN -> ARG NUMÉRICO
function resolveTargetNorm(m, args) {
  try {
    if (m?.quoted) {
      // quoted puede tener sender o key.participant
      const q = m.quoted
      const possible = q.sender || q.participant || (q.key && (q.key.participant || q.key.remoteJid)) || q.key && q.key.remoteJid
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
      return normalizeNumber(m.mentionedJid[0])
    }
  } catch (e) {}

  if (Array.isArray(args) && args.length) {
    const maybe = args[0]
    const norm = normalizeNumber(maybe)
    if (norm) return norm
  }

  return null
}

// Construye JID para mentions (si se detectó m.mentionedJid, úsala; si no, construye)
function buildMentionJid(m, norm) {
  if (!norm) return null
  // si la petición incluía m.mentionedJid y coincide con norm, úsala
  if (m?.mentionedJid && Array.isArray(m.mentionedJid) && m.mentionedJid.length) {
    // preferir la primera mencionada
    return m.mentionedJid[0]
  }
  // fallback: construir JID estándar
  return `${norm}@s.whatsapp.net`
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
    const targetNorm = resolveTargetNorm(m, parts)
    if (!targetNorm) return conn.reply(m.chat, 'Uso: rob <mención|número> o responde al mensaje del usuario que quieres robar.\nEj: rob @usuario\nEj: rob 573123456789', m)
    if (targetNorm === attacker) return conn.reply(m.chat, 'No puedes robarte a ti mismo.', m)

    if (!db[targetNorm]) db[targetNorm] = { wallet: 0, bank: 0, lastAction: 0 }

    const victim = db[targetNorm]

    // Si no tiene dinero en ningún lado
    if ((!victim.wallet || victim.wallet <= 0) && (!victim.bank || victim.bank <= 0)) {
      return conn.reply(m.chat, '*❁ No puedes robarle a los pobres*\n\n> ¡Este usuario aún no tiene dinero!', m)
    }

    // Si tiene todo en banco (wallet 0 y bank > 0)
    if ((!victim.wallet || victim.wallet <= 0) && (victim.bank && victim.bank > 0)) {
      const mentionJid = buildMentionJid(m, targetNorm)
      const textResp = '*❁ Este usuario tiene sus coins en el banco, no puedes robarselo*'
      // mencionar para que se vea bien si hay mención
      return conn.reply(m.chat, textResp, m, { mentions: mentionJid ? [mentionJid] : [] })
    }

    // Protección por actividad reciente (1 hora)
    const PROTECT_WINDOW = 60 * 60 * 1000
    const lastActionVictim = Number(victim.lastAction || 0)
    if (lastActionVictim && (now - lastActionVictim) < PROTECT_WINDOW) {
      const remaining = PROTECT_WINDOW - (now - lastActionVictim)
      const mins = msToMinutes(remaining)
      return conn.reply(m.chat, `No puedes robar a este usuario ahora. Está protegido por actividad reciente (${mins} min restantes).`, m)
    }

    // wallet muy baja
    if ((victim.wallet || 0) <= 1) {
      return conn.reply(m.chat, '*❁ No puedes robarle a los pobres (wallet muy baja)*', m)
    }

    const maxSteal = Math.min(100, Math.max(1, (victim.wallet || 0) - 1))
    const stolen = randomInt(1, maxSteal)

    // Transferencia
    victim.wallet = (victim.wallet || 0) - stolen
    db[targetNorm] = victim
    db[attacker].wallet = (db[attacker].wallet || 0) + stolen
    db[attacker].lastRob = now
    db[attacker].lastAction = now
    writeDb(db)

    // Respuesta con mención
    const mentionJid = buildMentionJid(m, targetNorm)
    const displayTag = `@${targetNorm}`
    const replyText = `❁ Robaste *${stolen}* coins a ${displayTag}.`
    return conn.reply(m.chat, replyText, m, { mentions: mentionJid ? [mentionJid] : [] })
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error en rob: ${err.message || err}`, m)
  }
}

handler.help = ['rob', 'robar']
handler.tags = ['economy']
handler.command = ['rob', 'robar']

export default handler