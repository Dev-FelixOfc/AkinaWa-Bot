// comandos/sockets-conexion.js
import fs from 'fs'
import path from 'path'
import qrcode from 'qrcode'
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Rutas y DB
const SESSIONS_ROOT = path.join(process.cwd(), 'jsons', 'sockets')
const AUTH_ROOT = path.join(SESSIONS_ROOT, 'auth')
const DB_PATH = path.join(SESSIONS_ROOT, 'JadiBot.json')
if (!fs.existsSync(AUTH_ROOT)) fs.mkdirSync(AUTH_ROOT, { recursive: true })
if (!fs.existsSync(SESSIONS_ROOT)) fs.mkdirSync(SESSIONS_ROOT, { recursive: true })
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({}, null, 2))

// helpers DB (usa la misma implementación que sockets/indexsubs.js)
function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8') || '{}'
    return JSON.parse(raw)
  } catch (e) {
    try { fs.renameSync(DB_PATH, DB_PATH + '.corrupt.' + Date.now()) } catch {}
    const init = {}
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2))
    return init
  }
}
function writeDB(db) {
  fs.writeFileSync(DB_PATH + '.tmp', JSON.stringify(db, null, 2))
  try { fs.renameSync(DB_PATH + '.tmp', DB_PATH) } catch (e) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
  }
}
function addSessionToDB({ socket, sessionDir, active = false, createdAt = Date.now(), browser = 'Ubuntu' }) {
  const db = readDB()
  db[socket] = {
    socket,
    sessionDir,
    active: !!active,
    createdAt,
    lastUpdated: Date.now(),
    browser
  }
  writeDB(db)
  return db[socket]
}
function removeSessionFromDB(socket) {
  const db = readDB()
  if (db[socket]) {
    delete db[socket]
    writeDB(db)
    return true
  }
  return false
}
function setSessionActiveInDB(socket, active = true) {
  const db = readDB()
  if (!db[socket]) return false
  db[socket].active = !!active
  db[socket].lastUpdated = Date.now()
  writeDB(db)
  return true
}

// imprime en consola en caja (usa el formato pedido)
function boxify(lines) {
  const top = '╔✿︎' + '═'.repeat(8) + '𑁍' + '═'.repeat(8) + '✿︎╗'
  const bottom = '╚✿︎' + '═'.repeat(8) + '𑁍' + '═'.repeat(8) + '✿︎╝'
  const body = lines.map(l => `║${l}`).join('\n')
  return `${top}\n${body}\n${bottom}`
}
function printCommandEvent({ message, connection = 'Pendiente', type = 'SubBot' }) {
  const lines = [
    '❁ `Mención grupal` ❁',
    '',
    '*[❀] Mensaje:*',
    '',
    `Mensaje: (${message})`,
    `Conexion: (${connection})`,
    `Tipo: ${type}`
  ]
  console.log(boxify(lines))
}
function printSessionEvent({ action = 'Session creada en', number = 'unknown' }) {
  const lines = [
    `${action}`,
    `(${number})`
  ]
  console.log(boxify(lines))
}

// util: genera 8 dígitos aleatorios
function gen8Digits() {
  return String(Math.floor(10000000 + Math.random() * 90000000))
}

// helpers para enviar mensajes/imagenes adaptables a distintas APIs de conn
async function sendText(conn, chat, text, quoted = null) {
  if (!conn) throw new Error('conn missing')
  if (typeof conn.reply === 'function') return conn.reply(chat, text, quoted)
  if (typeof conn.sendMessage === 'function') return conn.sendMessage(chat, { text }, { quoted })
  throw new Error('conn has no send method (reply/sendMessage)')
}
async function sendImageBuffer(conn, chat, buffer, caption = '', quoted = null) {
  if (!conn) throw new Error('conn missing')
  if (typeof conn.sendMessage === 'function') return conn.sendMessage(chat, { image: buffer, caption }, { quoted })
  if (typeof conn.sendFile === 'function') return conn.sendFile(chat, buffer, 'qrcode.png', caption, quoted)
  throw new Error('conn has no send image method (sendMessage/sendFile)')
}
async function tryDeleteMessage(conn, chat, msgObj) {
  try {
    if (!msgObj) return
    if (typeof conn.deleteMessage === 'function') {
      // muchas implementaciones usan conn.deleteMessage(chat, id)
      const id = (msgObj?.key?.id) || (msgObj?.id) || msgObj
      if (id) {
        await conn.deleteMessage(chat, id).catch(()=>{})
      }
    } else if (typeof conn.relayMessage === 'function') {
      // no-op fallback
    }
  } catch (e) {
    // ignore
  }
}

// crea un socket temporal usando baileys (import dinámico)
async function makeTempSocket(sessionName) {
  // importa baileys dinámicamente (según tu snippet)
  const baileysPkg = await import('@whiskeysockets/baileys')
  const { useMultiFileAuthState, fetchLatestBaileysVersion } = baileysPkg

  // intenta usar tu wrapper makeWASocket si existe
  let makeWASocket = null
  try {
    const mod = await import('../lib/simple.js')
    makeWASocket = mod.makeWASocket ?? mod.default ?? null
  } catch (e) {
    // if fails, fallback to baileys native
  }
  if (!makeWASocket) {
    makeWASocket = baileysPkg.makeWASocket
  }

  const authDir = path.join(AUTH_ROOT, sessionName)
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(authDir)

  // intenta obtener la versión
  let version = [2, 2320, 3]
  try {
    const v = await fetchLatestBaileysVersion()
    version = v.version
  } catch (e) {}

  const sock = makeWASocket({
    auth: state,
    browser: ['Ubuntu', 'Chrome', '1.0'],
    version,
    printQRInTerminal: false
  })

  sock.ev.on('creds.update', saveCreds)
  return { sock, authDir }
}

// handler principal del comando
var handler = async (m, { conn }) => {
  try {
    const rawText = (m.text || m.body || '').trim()
    const lc = rawText.toLowerCase()
    const isCode = lc === '#code' || lc === '.code' || lc === 'code'
    const isQr = lc === '#qr' || lc === '.qr' || lc === 'qr'
    if (!isCode && !isQr) return

    // imprime evento pendiente
    printCommandEvent({ message: rawText, connection: 'Pendiente', type: 'SubBot' })

    // crea socket temporal
    const sessionName = `sub-${Date.now()}-${randomBytes(3).toString('hex')}`
    const { sock, authDir } = await makeTempSocket(sessionName)

    let sentIntro = null
    let sentPayload = null
    let finished = false
    const expireMs = isCode ? 45_000 : 60_000

    // Enviar mensaje intro
    if (isCode) {
      const intro = [
        '✿︎ `Vinculación de sockets` ✿︎',
        '',
        'Modo: *Codigo de digitos*.',
        '',
        '`❁ Instrucciones:`',
        'Más opciones > Dispositivos vinculados > Vincular con número > pega el codigo.',
        '',
        '*_Nota_* Este codigo es valido por 45 segundos.'
      ].join('\n')
      sentIntro = await sendText(conn, m.chat, intro, m)
    } else {
      const intro = [
        '✿︎ `Vinculación de sockets` ✿︎',
        '',
        'Modo: *Codigo qr*.',
        '',
        '`❁ Instrucciones:`',
        'Más opciones > Dispositivos vinculados > Escanea el código de la foto.',
        '',
        '*_Nota_* Necesitas otro teléfono o PC y escanear antes de los 60 segundos.'
      ].join('\n')
      sentIntro = await sendText(conn, m.chat, intro, m)
    }

    // timeout por expiración
    const timeoutId = setTimeout(async () => {
      if (finished) return
      finished = true
      try {
        await sendText(conn, m.chat, `*[❁]* No se pudo conectar al socket.\n> ¡Intenta conectarte nuevamente!`, m)
      } catch (e) {}
      // intentamos borrar los mensajes enviados
      await tryDeleteMessage(conn, m.chat, sentIntro)
      await tryDeleteMessage(conn, m.chat, sentPayload)
      // cerrar socket y limpiar auth
      try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch (e) {}
      try { fs.rmSync(authDir, { recursive: true, force: true }) } catch (e) {}
      printCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
    }, expireMs + 2000)

    // escucha actualizaciones de conexión
    sock.ev.on('connection.update', async (update) => {
      if (finished) return
      const { connection, lastDisconnect, qr } = update

      // cuando llegue qr/string
      if (qr && !finished) {
        try {
          if (isCode) {
            const code = gen8Digits()
            sentPayload = await sendText(conn, m.chat, '```' + code + '```\n\n_Pegalo en el otro dispositivo para vincular._\n\nNota: válido por 45s.', m)
          } else {
            const img = await qrcode.toBuffer(qr, { type: 'png', margin: 1, width: 512 })
            sentPayload = await sendImageBuffer(conn, m.chat, img, 'Escanea este QR con otro teléfono antes de 60 segundos.', m)
          }
        } catch (e) {
          console.error('Error al enviar payload:', e)
        }
      }

      // conexión exitosa
      if (connection === 'open' && !finished) {
        finished = true
        clearTimeout(timeoutId)
        try {
          // extraer jid del socket
          const jid = sock.user?.id || sock.user?.jid || (`${sessionName}@s.whatsapp.net`)
          addSessionToDB({
            socket: jid,
            sessionDir: authDir,
            active: true,
            createdAt: Date.now(),
            browser: 'Ubuntu'
          })
          // notificar en chat
          try {
            await sendText(conn, m.chat, `*[❁]* La conexión con el socket fue un éxito.\n> ¡Personaliza el socket usando el comando ${'.set'}!`, m)
          } catch (e) {}
          // borrar mensajes intro/payload
          await tryDeleteMessage(conn, m.chat, sentIntro)
          await tryDeleteMessage(conn, m.chat, sentPayload)
          // imprimir logs en consola
          printCommandEvent({ message: rawText, connection: 'Exitosa', type: 'SubBot' })
          printSessionEvent({ action: 'Session creada en', number: jid })
          // Dejar el socket corriendo (subbot). Si deseas autodesconectar llamar sock.logout()
        } catch (e) {
          console.error('Error on open handling:', e)
        }
      }

      // desconexión / errores
      if (lastDisconnect && lastDisconnect.error && !finished) {
        try {
          const baileysPkg = await import('@whiskeysockets/baileys')
          const { DisconnectReason } = baileysPkg
          const statusCode = lastDisconnect?.error?.output?.statusCode
          // si la razón fue loggedOut, eliminar de DB
          if (statusCode === DisconnectReason.loggedOut) {
            const jid = sock.user?.id || (`${sessionName}@s.whatsapp.net`)
            removeSessionFromDB(jid)
            printSessionEvent({ action: 'Session cerrada en', number: jid })
          }
        } catch (e) {}
        // marcar fallo y limpiar
        finished = true
        clearTimeout(timeoutId)
        try {
          await sendText(conn, m.chat, `*[❁]* No se pudo conectar al socket.\n> ¡Intenta conectarte nuevamente!`, m)
        } catch (e) {}
        try { fs.rmSync(authDir, { recursive: true, force: true }) } catch (e) {}
        printCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
      }
    })

    // también escuchamos credenciales/logouts para imprimir cambios (opcional)
    sock.ev.on('creds.update', () => {
      // si la session se corrompe o se reinicia, puedes añadir prints aquí
    })

    // retorno para que el handler no falle; el socket corre en background
    return
  } catch (err) {
    console.error('Error en sockets-conexion handler:', err)
    try { await conn.reply(m.chat, `⚠︎ Ocurrió un error: ${err.message || err}`, m) } catch {}
  }
}

handler.help = ['code', 'qr']
handler.tags = ['subbot', 'sockets']
handler.command = ['#code', '#qr', '.code', '.qr', 'code', 'qr', 'QR']

export default handler