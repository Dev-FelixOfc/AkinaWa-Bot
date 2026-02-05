// comandos/economy-daily.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Ruta a la base de datos
const dbDir = path.join(__dirname, '..', 'jsons', 'economy')
const dbFile = path.join(dbDir, 'daily.json')

// Asegura que la carpeta y archivo existan
function ensureDb() {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
  if (!fs.existsSync(dbFile)) {
    const init = { "+8094374392": { balance: 999999, lastDaily: 0, streak: 0 } }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
  }
}

// Leer DB (sincronamente para simplicidad)
function readDb() {
  ensureDb()
  const raw = fs.readFileSync(dbFile, 'utf8')
  try {
    return JSON.parse(raw || '{}')
  } catch (e) {
    // Si el JSON está corrupto, respaldarlo y recrear con el init mínimo
    fs.renameSync(dbFile, dbFile + '.corrupt.' + Date.now())
    const init = { "+8094374392": { balance: 999999, lastDaily: 0, streak: 0 } }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
    return init
  }
}

function writeDb(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2))
}

function normalizeNumber(raw) {
  if (!raw) return ''
  return raw.toString().split('@')[0].replace(/\D/g, '')
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
    // Cargar DB
    const db = readDb()

    // Normalizar número usuario
    const sender = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!sender) {
      try { await m.react?.('✖️') } catch {}
      return conn.reply(m.chat, '* No se pudo identificar tu número.', m)
    }

    // Asegurar entrada del usuario
    if (!db[sender]) {
      db[sender] = { balance: 0, lastDaily: 0, streak: 0 }
    }

    const user = db[sender]
    const now = Date.now()
    const COOLDOWN = 24 * 60 * 60 * 1000 // 24 horas

    // Revisar si ya reclamó
    if (user.lastDaily && (now - user.lastDaily) < COOLDOWN) {
      const remaining = COOLDOWN - (now - user.lastDaily)
      const { hours, minutes } = msToHourMinute(remaining)
      try { await m.react?.('✖️') } catch {}
      return conn.reply(
        m.chat,
        `👾 Ya obtuviste tu daily de hoy, espera ${hours}h ${minutes}m para volver a reclamar.`,
        m
      )
    }

    // Calcular recompensa aleatoria (puedes ajustar rangos)
    // Rango base 100 - 500
    const baseReward = randomInt(100, 500)
    // Aplicar bonus por racha (10% extra por cada día de racha, por ejemplo)
    const streakBonusMultiplier = 1 + (user.streak ? user.streak * 0.10 : 0)
    let reward = Math.floor(baseReward * streakBonusMultiplier)
    // Limitar reward razonablemente
    if (reward < 1) reward = 1

    // Calcular próxima recompensa estimada (día siguiente)
    const nextReward = Math.floor(reward * 1.2 + 50)

    // Actualizar streak: si la última reclamación fue hace menos de 48h incrementa racha, sino reinicia
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

    // Responder al usuario
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
handler.command = ['#daily', '#diario', '#diaro', 'daily', 'diario', 'diaro']

export default handler