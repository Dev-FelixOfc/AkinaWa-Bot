// comandos/economy-balance.js
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

var handler = async (m, { conn }) => {
  try {
    const db = readDb()
    const sender = normalizeNumber(m.sender || m.from || m.participant || '')
    if (!sender) return conn.reply(m.chat, 'No se pudo identificar tu número.', m)

    const user = db[sender] || { wallet: 0, bank: 0 }

    const wallet = Number(user.wallet || 0)
    const bank = Number(user.bank || 0)
    const total = wallet + bank

    const message =
`❁ \`Balance del usuario\` ❁

Coins en cartera: *${wallet}*
Coins en el banco: *${bank}*
Total de coins: *${total}*

> ¡Usa más los comandos de economía para que ganes más dinero y seas el más rico!`

    return conn.reply(m.chat, message, m)
  } catch (err) {
    console.error(err)
    return conn.reply(m.chat, `⚠︎ Ocurrió un error al obtener tu balance: ${err.message || err}`, m)
  }
}

handler.help = ['bal', 'balance']
handler.tags = ['economy']
handler.command = ['bal', 'balance']

export default handler