// comandos/economy-daily.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Nuevo archivo de DB: jsons/economy.json (raíz del repo > jsons)
const dbDir = path.join(__dirname, '..', 'jsons')
const dbFile = path.join(dbDir, 'economy.json')

// Normaliza un número WhatsApp a solo dígitos
function normalizeNumber(raw) {
  if (!raw) return ''
  return raw.toString().split('@')[0].replace(/\D/g, '')
}

// Asegura existencia de la carpeta y archivo con estructura inicial.
// También normaliza claves (quita prefijos +) para evitar problemas de lookup.
function ensureDb() {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
  if (!fs.existsSync(dbFile)) {
    const init = { "8094374392": { balance: 999999, lastDaily: 0, streak: 0 } }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
    return
  }
  // Si existe, normalizar claves (migración automática si hay claves con +)
  const raw = fs.readFileSync(dbFile, 'utf8')
  try {
    const parsed = JSON.parse(raw || '{}')
    const normalized = {}
    for (const [key, val] of Object.entries(parsed || {})) {
      const norm = (key || '').toString().replace(/\D/g, '')
      if (!norm) continue
      if (!normalized[norm]) {
        normalized[norm] = {
          balance: Number(val.balance || 0),
          lastDaily: Number(val.lastDaily || 0),
          streak: Number(val.streak || 0)
        }
      } else {
        // Si hay colisión, sumar balance y tomar los maximos de timestamps/streak
        normalized[norm].balance = (normalized[norm].balance || 0) + Number(val.balance || 0)
        normalized[norm].lastDaily = Math.max(normalized[norm].lastDaily || 0, Number(val.lastDaily || 0))
        normalized[norm].streak = Math.max(normalized[norm].streak || 0, Number(val.streak || 0))
      }
    }
    // Reescribir sólo si la forma normalizada difiere de la leída (previene escrituras innecesarias)
    const normString = JSON.stringify(normalized, null, 2)
    if (normString !== raw) fs.writeFileSync(dbFile, normString)
  } catch (e) {
    // Si JSON corrupto: respaldar y crear uno limpio
    try { fs.renameSync(dbFile, dbFile + '.corrupt.' + Date.now()) } catch {}
    const init = { "8094374392": { balance: 999999, lastDaily: 0, streak: 0 } }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
  }
}

function readDb() {
  ensureDb()
  const raw = fs.readFileSync(dbFile, 'utf8')
  try {
    return JSON.parse(raw || '{}')
  } catch (e) {
    // Si por alguna razón vuelve a fallar, recuperar archivo corrupto y crear init
    try { fs.renameSync(dbFile, dbFile + '.corrupt.' + Date.now()) } catch {}
    const init = { "8094374392": { balance: 999999, lastDaily: 0, streak: 0 } }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
    return init
  }
}

function writeDb(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2))
}

function msToHourMinute(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return { hours, minutes }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

var handler = async (m, { conn }) => {
  try {
    await m.react?.('🕒')

    // Cargar DB unificada
    const db = readDb()

    // Obtener y normalizar número del remitente
    const sender = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!sender) {
      try { await m.react?.('✖️') } catch {}
      return conn.reply(m.chat, '* No se pudo identificar tu número.', m)
    }

    // Asegurarse de la entrada del usuario (usar clave normalizada sin +)
    if (!db[sender]) {
      db[sender] = { balance: 0, lastDaily: 0, streak: 0 }
    }

    const user = db[sender]
    const now = Date.now()
    const COOLDOWN = 24 * 60 * 60 * 1000 // 24 horas

    // Si ya reclamó
    if (user.lastDaily && (now - user.lastDaily) < COOLDOWN) {
      const remaining = COOLDOWN - (now - user.lastDaily)
      const { hours, minutes } = msToHourMinute(remaining)
      try { await m.react?.('✖️') } catch {}
      return conn.reply(m.chat, `👾 Ya obtuviste tu daily de hoy, espera ${hours}h ${minutes}m para volver a reclamar.`, m)
    }

    // Calcular recompensa aleatoria (ajusta rango si quieres)
    const baseReward = randomInt(100, 500)
    const streakBonusMultiplier = 1 + ((user.streak || 0) * 0.10)
    let reward = Math.floor(baseReward * streakBonusMultiplier)
    if (reward < 1) reward = 1

    const nextReward = Math.floor(reward * 1.2 + 50)

    // Actualizar racha (si la última fue hace menos de 48h, aumentar racha)
    const STREAK_MAX_GAP = 48 * 60 * 60 * 1000 // 48h
    if (user.lastDaily && (now - user.lastDaily) <= STREAK_MAX_GAP) {
      user.streak = (user.streak || 0) + 1
    } else {
      user.streak = 1
    }

    // Actualizar balance y timestamp
    user.balance = (user.balance || 0) + reward
    user.lastDaily = now

    // Guardar DB
    db[sender] = user
    writeDb(db)

    // Responder
    const message =
`👾 *Obtuviste tu recompensa diaria de* *${reward} coins*
> Día ${user.streak + 1} » *${nextReward} coins*

Saldo actual: *${user.balance} coins*`

    try { await m.react?.('✅') } catch {}
    return conn.reply(m.chat, message, m)
  } catch (err) {
    try { await m.react?.('✖️') } catch {}
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error al procesar tu daily: ${err.message || err}`, m)
  }
}

handler.help = ['daily', 'diaro']
handler.tags = ['economy']
// Soporta triggers con o sin #
handler.command = ['#daily', '#diario', '#diaro', 'daily', 'diario', 'diaro']

export default handler