// comandos/economy-baltop.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbDir = path.join(__dirname, '..', 'jsons')
const dbFile = path.join(dbDir, 'economy.json')

function ensureDb() {
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
  if (!fs.existsSync(dbFile)) {
    const init = {
      "573235915041": {
        balance: 999999,
        lastDaily: 0,
        streak: 0,
        diamonds: 0,
        coal: 0,
        gold: 0,
        lastCrime: 0,
        lastChest: 0
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
        balance: 999999,
        lastDaily: 0,
        streak: 0,
        diamonds: 0,
        coal: 0,
        gold: 0,
        lastCrime: 0,
        lastChest: 0
      }
    }
    fs.writeFileSync(dbFile, JSON.stringify(init, null, 2))
    return init
  }
}

var handler = async (m, { conn }) => {
  try {
    const db = readDb()
    // usuarios con actividad económica (criterio: cualquier recurso > 0 o timestamps > 0)
    const users = Object.entries(db)
      .map(([num, info]) => ({ num, info }))
      .filter(({ info }) => {
        const used = (info.balance && info.balance > 0) ||
                     (info.diamonds && info.diamonds > 0) ||
                     (info.coal && info.coal > 0) ||
                     (info.gold && info.gold > 0) ||
                     (info.lastDaily && info.lastDaily > 0) ||
                     (info.lastCrime && info.lastCrime > 0) ||
                     (info.lastChest && info.lastChest > 0)
        return used
      })

    if (users.length === 0) return conn.reply(m.chat, '❀ No hay usuarios con actividad económica aún.', m)

    // ordenar por balance descendente
    users.sort((a, b) => (b.info.balance || 0) - (a.info.balance || 0))

    // parsear página del mensaje: "baltop 2" o "topbalance 2"
    const text = (m.text || m.body || '').trim()
    const parts = text.split(/\s+/)
    let page = 1
    if (parts.length > 1) {
      const p = parseInt(parts[1])
      if (!isNaN(p) && p > 0) page = p
    }

    const PER_PAGE = 10
    const totalPages = Math.max(1, Math.ceil(users.length / PER_PAGE))

    if (page > totalPages) {
      return conn.reply(m.chat, `❀ la página *${page}* aún no existe.\n> El bot debe tener al menos 2 usuarios más que usen los comandos de economía para crear otra página.`, m)
    }

    const start = (page - 1) * PER_PAGE
    const pageItems = users.slice(start, start + PER_PAGE)

    let message = `*❁ Top usuarios con más Coins ❁*\n\n`
    for (const u of pageItems) {
      const displayNum = `+${u.num}`
      message += `❀ ${displayNum}:\n> Coins » *${Number(u.info.balance || 0)}*\n\n`
    }
    message += `• Página *${page}* de *${totalPages}*`

    return conn.reply(m.chat, message, m)
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error al obtener el top: ${err.message || err}`, m)
  }
}

handler.help = ['baltop', 'topbalance']
handler.tags = ['economy']
// triggers sin '#'
handler.command = ['baltop', 'topbalance']

export default handler