// comandos/economy-chest.js
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

// Asegura existencia de la carpeta y archivo con estructura inicial.
// Normaliza claves y migra 'balance' -> 'wallet' si es necesario.
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
    return
  }

  // Leer y normalizar sin perder datos
  const raw = fs.readFileSync(dbFile, 'utf8')
  try {
    const parsed = JSON.parse(raw || '{}')
    const normalized = {}
    for (const [key, val] of Object.entries(parsed || {})) {
      const normKey = (key || '').toString().replace(/\D/g, '')
      if (!normKey) continue
      const v = (val && typeof val === 'object') ? val : {}

      // Mapea balance antiguo a wallet nuevo, y respeta wallet si ya existe.
      const wallet = Number(v.wallet ?? v.balance ?? 0)
      const bank = Number(v.bank ?? 0)

      normalized[normKey] = {
        wallet: wallet,
        bank: bank,
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
    }

    // Reescribir sólo si hay diferencias (evita sobreescribir si no cambia)
    const normString = JSON.stringify(normalized, null, 2)
    if (normString !== raw) fs.writeFileSync(dbFile, normString)
  } catch (e) {
    // Si JSON corrupto: respaldar y crear init con la estructura nueva
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
  }
}

function readDb() {
  ensureDb()
  try {
    return JSON.parse(fs.readFileSync(dbFile, 'utf8') || '{}')
  } catch (e) {
    // Si falla de nuevo, respaldar y crear init
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

var handler = async (m, { conn }) => {
  try {
    const db = readDb()
    const sender = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!sender) return conn.reply(m.chat, '* No se pudo identificar tu número.', m)

    // Asegurar estructura del usuario (usando wallet/bank)
    if (!db[sender]) db[sender] = {
      wallet: 0,
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

    const user = db[sender]
    const now = Date.now()
    const COOLDOWN = 25 * 60 * 1000 // 25 minutos

    if (user.lastChest && (now - user.lastChest) < COOLDOWN) {
      const remaining = COOLDOWN - (now - user.lastChest)
      const minutes = msToMinutes(remaining)
      return conn.reply(m.chat, `❁ Ya reclamaste tu cofre, vuelve en ${minutes} minutos.`, m)
    }

    const coins = randomInt(100, 600)
    const diamonds = randomInt(0, 3)
    const coal = randomInt(1, 10)
    const gold = randomInt(0, 2)

    // Actualizar wallet (fuera del banco), no 'balance'
    user.wallet = (user.wallet || 0) + coins
    user.diamonds = (user.diamonds || 0) + diamonds
    user.coal = (user.coal || 0) + coal
    user.gold = (user.gold || 0) + gold
    user.lastChest = now
    user.lastAction = now

    db[sender] = user
    writeDb(db)

    const message =
`*❁ Cofre con tesoros ❁*

Coins » *${coins}*
Diamantes » *${diamonds}*
Carbón » *${coal}*
Oro » *${gold}*

> ¡Vuelve en 25 minutos para volver a obtener tu cofre!`

    return conn.reply(m.chat, message, m)
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error al abrir el cofre: ${err.message || err}`, m)
  }
}

handler.help = ['cofre', 'chest']
handler.tags = ['economy']
handler.command = ['cofre', 'chest']

export default handler