// comandos/tools-play.js
// Comando de descarga/reproducción de música con cobro de 50 coins (wallet).
// - Si el usuario no tiene >= 50 coins: mensaje de aviso y no descarga.
// - Si tiene, se descuentan 50 coins (antes de iniciar la descarga) y se continúa.
// - Usa jsons/economy.json como DB; migra balance -> wallet y normaliza claves.
// Pega este archivo en comandos/ y adáptalo a tu lógica de descarga real.

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

// Asegura existence del archivo DB y migra balance -> wallet si hace falta.
// No añade campos extra (como lastWork) para evitar romper otros handlers.
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

  // Intentar leer y normalizar (migración balance->wallet y claves)
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
    if (changed || (normString !== raw)) fs.writeFileSync(dbFile, normString)
  } catch (e) {
    // Si JSON corrupto: respaldar y crear init limpio
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

// Precio por descarga (ajusta si quieres)
const PRICE = 50

// Función principal del handler
var handler = async (m, { conn }) => {
  try {
    const db = readDb()
    const sender = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!sender) return conn.reply(m.chat, 'No se pudo identificar tu número.', m)

    // Asegurar estructura mínima del usuario (no añadimos campos extras innecesarios)
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

    const user = db[sender] || { wallet: 0, bank: 0 }

    // Verificar saldo
    if ((user.wallet || 0) < PRICE) {
      return conn.reply(m.chat, `*❁ No tienes suficientes coins.*\n> Necesitas *${PRICE}* coins para descargar música.`, m)
    }

    // Descontar antes de iniciar la descarga (previene abusos)
    db[sender].wallet = (db[sender].wallet || 0) - PRICE
    db[sender].lastAction = Date.now()
    writeDb(db)

    // ---- Aquí va la lógica real de descarga/reproducción ----
    // Reemplaza lo siguiente por tu flujo real (buscar y descargar audio, enviar archivo, etc.)
    // Ejemplo: obtener texto de búsqueda desde el mensaje
    const text = (m.text || m.body || '').trim().split(/\s+/).slice(1).join(' ')
    if (!text) {
      // Si no hay término de búsqueda, devolver coins (opcional) o informar
      // En este ejemplo devolvemos el cobro si no hay término para evitar perder coins.
      // Si prefieres no devolverlo, elimina este bloque.
      db[sender].wallet = (db[sender].wallet || 0) + PRICE
      writeDb(db)
      return conn.reply(m.chat, 'Uso: play <nombre o enlace>\nEj: play Despacito', m)
    }

    // Simulación de descarga (implementa tu propia lógica aquí)
    // Por ejemplo podrías llamar a un servicio que retorne URL o buffer del audio.
    // Para este template, enviamos un mensaje indicando que la descarga se completó.
    // Sustituye por: await conn.sendMessage(m.chat, { audio: buffer, mimetype: 'audio/mpeg' }, { quoted: m })
    const songTitle = text // o nombre real obtenido de la búsqueda
    const message =
`❁ Descarga completada
Título: *${songTitle}*

(Implementa aquí el envío del archivo de audio en lugar de este mensaje.)`

    return conn.reply(m.chat, message, m)
  } catch (err) {
    console.error(err)
    // Si ocurre error después de descontar, puedes considerar reembolsar al usuario.
    // Aquí sólo informamos del error.
    return conn.reply(m.chat, `⚠︎ Ocurrió un error al procesar la descarga: ${err.message || err}`, m)
  }
}

handler.help = ['play', 'song', 'download']
handler.tags = ['tools']
handler.command = ['play', 'song', 'download', 'mp3', 'musica']

export default handler