// comandos/sockets-conexion.js
// Maneja #code para crear Sub-Bots (pairing code real).
// Añade cooldown por usuario de 30s; durante los últimos 3s del cooldown
// se ejecuta limpieza del servidor (carpeta temporal y sufijo .temporal) y se reinicia (process.exit(0)).

import fs from 'fs'
import path from 'path'
import qrcode from 'qrcode' // reservado si lo necesitas más adelante
import { randomBytes } from 'crypto'
import { fileURLToPath } from 'url'

import { addSession, removeSession } from '../sockets/indexsubs.js'
import { printCommandEvent, printSessionEvent } from '../sockets/print.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SESSIONS_ROOT = path.join(process.cwd(), 'jsons', 'sockets')
const AUTH_ROOT = path.join(SESSIONS_ROOT, 'auth')
const ATOMIC_SUFFIX = '.temporal'
if (!fs.existsSync(AUTH_ROOT)) fs.mkdirSync(AUTH_ROOT, { recursive: true })
if (!fs.existsSync(SESSIONS_ROOT)) fs.mkdirSync(SESSIONS_ROOT, { recursive: true })

// ---------------------- Utilities ----------------------
const COOLDOWN_MS = 30_000
const RESTART_WINDOW_MS = 3_000 // últimos 3 segundos para reinicio

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

function formatPairingCode(raw) {
  if (!raw || typeof raw !== 'string') return raw
  return (raw.replace(/\s+/g, '').match(/.{1,4}/g) || [raw]).join('-')
}

async function safeDbWrite() {
  try { if (global.db && typeof global.db.write === 'function') await global.db.write() } catch (e) { /* ignore */ }
}

async function sendText(conn, chat, text, quoted = null) {
  if (!conn) throw new Error('conn missing')
  if (typeof conn.reply === 'function') return conn.reply(chat, text, quoted)
  if (typeof conn.sendMessage === 'function') return conn.sendMessage(chat, { text }, { quoted })
  throw new Error('conn no expone reply/sendMessage')
}

async function tryDeleteMessage(conn, chat, msgObj) {
  if (!msgObj) return
  try {
    if (typeof conn.deleteMessage === 'function') {
      const id = msgObj?.key?.id || msgObj?.id || msgObj
      if (id) return await conn.deleteMessage(chat, id).catch(()=>{})
    }
    if (typeof conn.sendMessage === 'function' && msgObj?.key) {
      try { return await conn.sendMessage(chat, { delete: msgObj.key }) } catch (e) {}
    }
  } catch (e) { /* ignore */ }
}

// ---------------------- Make temp socket ----------------------
async function makeTempSocket(sessionName, browser = ['Windows', 'Firefox']) {
  const baileysPkg = await import('@whiskeysockets/baileys')
  const { useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = baileysPkg

  // intentar usar wrapper local en ./configuraciones/simple.js (ruta dentro comandos/)
  let makeWASocket = null
  try {
    const mod = await import('./configuraciones/simple.js')
    makeWASocket = mod.makeWASocket ?? mod.default ?? null
  } catch (e) {
    // ignore - fallback to baileys makeWASocket
  }
  if (!makeWASocket) makeWASocket = baileysPkg.makeWASocket

  const authDir = path.join(AUTH_ROOT, sessionName)
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(authDir)

  let version = [2, 2320, 3]
  try {
    const v = await fetchLatestBaileysVersion()
    version = v.version
  } catch (e) {}

  // Build minimal "complete" connectionOptions like in main index
  const connectionOptions = {
    logger: (await import('pino')).default({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, (await import('pino')).default({ level: 'silent' }))
    },
    browser,
    version,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    defaultQueryTimeoutMs: undefined,
    keepAliveIntervalMs: 55_000,
  }

  const sock = makeWASocket(connectionOptions)
  sock.ev.on('creds.update', saveCreds)

  // debugging props shortly after creation
  setTimeout(() => {
    try {
      console.log('[subbot] sock props:', {
        hasUser: !!sock.user,
        requestPairingAvailable: typeof sock.requestPairingCode === 'function',
        hasSignalRequest: !!(sock.signal && typeof sock.signal.requestPairingCode === 'function'),
        hasWsRequest: !!(sock.ws && typeof sock.ws.requestPairingCode === 'function')
      })
    } catch (e) {}
  }, 1500)

  // auto-cleanup if never initialized within 60s (like in your example)
  sock.isInit = false
  setTimeout(async () => {
    if (!sock.user) {
      try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
      try { sock.ws?.close() } catch {}
      sock.ev.removeAllListeners()
      if (global.conns) {
        const i = global.conns.indexOf(sock)
        if (i >= 0) global.conns.splice(i, 1)
      }
      console.log(`[AUTO-LIMPIEZA] Sesión ${sessionName} eliminada por no completar autenticación.`)
    }
  }, 60_000)

  return { sock, authDir }
}

// ---------------------- Request pairing code real ----------------------
async function requestPairingCodeReal(sock, phone, attempts = 6, intervalMs = 800) {
  for (let i = 0; i < attempts; i++) {
    try {
      if (!sock) throw new Error('sock inexistente')
      if (typeof sock.requestPairingCode === 'function') {
        const res = await sock.requestPairingCode(phone)
        if (res) return String(res)
      }
      if (sock.signal && typeof sock.signal.requestPairingCode === 'function') {
        const res = await sock.signal.requestPairingCode(phone)
        if (res) return String(res)
      }
      if (sock.ws && typeof sock.ws.requestPairingCode === 'function') {
        const res = await sock.ws.requestPairingCode(phone)
        if (res) return String(res)
      }
    } catch (err) {
      console.warn('[subbot] requestPairingCode intento fallo:', err?.message || err)
    }
    await delay(intervalMs)
  }
  return null
}

// ---------------------- Maintenance scheduling (cooldown window) ----------------------
function scheduleMaintenanceDuringCooldown(conn, chat) {
  const startAfter = Math.max(0, COOLDOWN_MS - RESTART_WINDOW_MS)

  // prevent multiple scheduled maintenances in same process
  if (global.__subbotMaintenanceScheduled) return
  global.__subbotMaintenanceScheduled = true

  setTimeout(async () => {
    try {
      console.log('[maintenance] Inicio de limpieza antes del reinicio programado.')

      // 1) Eliminar carpeta temporal si existe
      const TEMP_DIR = path.join(process.cwd(), 'jsons', 'sockets', 'temporal')
      if (fs.existsSync(TEMP_DIR)) {
        try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }) } catch (e) { console.warn('[maintenance] rm temporal error:', e) }
      }

      // 2) Eliminar archivos .temporal en jsons/sockets
      const SESS_ROOT = path.join(process.cwd(), 'jsons', 'sockets')
      if (fs.existsSync(SESS_ROOT)) {
        try {
          const files = fs.readdirSync(SESS_ROOT)
          for (const f of files) {
            if (f.endsWith(ATOMIC_SUFFIX)) {
              try { fs.unlinkSync(path.join(SESS_ROOT, f)) } catch (e) {}
            }
          }
        } catch (e) { console.warn('[maintenance] limpiar .temporal error:', e) }
      }

      // Aviso de reinicio al chat (intento)
      const restartMsg = '「🪷」 Reiniciando la Bot....'
      try {
        if (conn && typeof conn.sendMessage === 'function') {
          await conn.sendMessage(chat, { text: restartMsg }).catch(()=>{})
        } else if (conn && typeof conn.reply === 'function') {
          try { conn.reply(chat, restartMsg) } catch {}
        }
      } catch (e) { /* ignore */ }

      console.log('[maintenance] Aviso de reinicio enviado. Reiniciando en 3s...')
      setTimeout(() => {
        console.log('[maintenance] Ejecutando process.exit(0) para reiniciar.')
        try { process.exit(0) } catch (e) { process.exit(0) }
      }, RESTART_WINDOW_MS)
    } finally {
      // in case process doesn't exit, allow re-scheduling later
      global.__subbotMaintenanceScheduled = false
    }
  }, startAfter)
}

// ---------------------- Handler principal (#code) ----------------------
var handler = async (m, { conn }) => {
  try {
    const rawText = (m.text || m.body || '').trim()
    const lc = rawText.toLowerCase()
    const isCode = lc === '#code' || lc === '.code' || lc === 'code'
    if (!isCode) return

    // ensure DB loaded
    try { if (typeof global.loadDatabase === 'function') await global.loadDatabase() } catch (e) {}

    if (!global.db || !global.db.data) {
      // if DB not present, allow but warn
      console.warn('[subbot] global.db no disponible, cooldown no se aplicará correctamente.')
    } else {
      if (!global.db.data.users) global.db.data.users = {}
    }

    const uid = m.sender
    const now = Date.now()

    // check cooldown
    let last = 0
    if (global.db && global.db.data && global.db.data.users && global.db.data.users[uid]) {
      last = Number(global.db.data.users[uid].lastCodeTime || 0)
    }

    const remaining = Math.max(0, COOLDOWN_MS - (now - last))
    if (remaining > 0) {
      const secs = Math.ceil(remaining / 1000)
      return await sendText(conn, m.chat, `❗ Debes esperar ${secs}s para volver a usar #code.`, m).catch(()=>null)
    }

    // set cooldown timestamp
    if (global.db && global.db.data) {
      if (!global.db.data.users[uid]) global.db.data.users[uid] = {}
      global.db.data.users[uid].lastCodeTime = now
      await safeDbWrite()
    }

    // schedule maintenance/restart to occupy last 3s of cooldown
    try { scheduleMaintenanceDuringCooldown(conn, m.chat) } catch (e) {}

    // continue with pairing logic
    printCommandEvent({ message: rawText, connection: 'Pendiente', type: 'SubBot' })

    const sessionName = `sub-${Date.now()}-${randomBytes(3).toString('hex')}`
    const { sock, authDir } = await makeTempSocket(sessionName, ['Windows', 'Firefox'])

    let introMsg = null
    let payloadMsg = null
    let finished = false
    const expireMs = 45_000

    const introCode = [
      '✿︎ `Vinculación de sockets` ✿︎',
      '',
      'Modo: *Codigo de digitos*.',
      '',
      '`❁ Instrucciones:`',
      'Más opciones > Dispositivos vinculados > Vincular con número > pega el codigo.',
      '',
      '*_Nota_* Este codigo es valido por 45 segundos.'
    ].join('\n')

    introMsg = await sendText(conn, m.chat, introCode, m).catch(()=>null)

    const timeoutId = setTimeout(async () => {
      if (finished) return
      finished = true
      try { await sendText(conn, m.chat, `*[❁]* No se pudo conectar al socket.\n> ¡Intenta conectarte nuevamente!`, m) } catch (e) {}
      await tryDeleteMessage(conn, m.chat, introMsg)
      await tryDeleteMessage(conn, m.chat, payloadMsg)
      try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
      try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
      printCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
      // maintenance already scheduled earlier; do not re-schedule here
    }, expireMs + 2000)

    // listen connection updates
    sock.ev.on('connection.update', async (update) => {
      if (finished) return
      console.log('[subbot] connection.update:', JSON.stringify(Object.assign({}, update, { qr: !!update.qr }), null, 2))
      const { connection, lastDisconnect, qr, isNewLogin } = update
      if (isNewLogin) sock.isInit = false

      if (qr && !finished) {
        // small delay to let sock be ready
        await delay(1200)
        let phone = (m.sender || '').split('@')[0] || sessionName
        phone = phone.replace(/\D/g, '') || sessionName
        console.log('[subbot] intentando obtener pairing code para:', phone)

        const secret = await requestPairingCodeReal(sock, phone, 6, 800).catch(() => null)
        if (!secret) {
          console.error('[subbot] no se obtuvo pairing code real; notificar y limpiar.')
          finished = true
          clearTimeout(timeoutId)
          try { await sendText(conn, m.chat, `*[❁]* No se pudo generar el código de vinculación.\n> ¡Intenta conectarte nuevamente!`, m) } catch (e) {}
          await tryDeleteMessage(conn, m.chat, introMsg)
          try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
          try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
          printCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
          return
        }

        const formatted = formatPairingCode(String(secret))
        payloadMsg = await sendText(conn, m.chat, '```' + formatted + '```', m).catch(()=>null)
        console.log('[subbot] pairing code real enviado:', formatted)
      }

      if (connection === 'open' && !finished) {
        finished = true
        clearTimeout(timeoutId)
        try {
          const jid = sock.user?.id || sock.user?.jid || `${sessionName}@s.whatsapp.net`
          addSession({ socket: jid, sessionFile: authDir, active: true, createdAt: Date.now(), browser: 'Windows/Firefox' })
          try { await sendText(conn, m.chat, `*[❁]* La conexión con el socket fue un éxito.\n> ¡Personaliza el socket usando el comando ${'.set'}!`, m).catch(()=>{}) } catch {}
          await tryDeleteMessage(conn, m.chat, introMsg)
          await tryDeleteMessage(conn, m.chat, payloadMsg)
          printCommandEvent({ message: rawText, connection: 'Exitosa', type: 'SubBot' })
          printSessionEvent({ action: 'Session creada en', number: jid })
          if (!global.conns) global.conns = []
          global.conns.push(sock)
        } catch (e) {
          console.error('[subbot] error on open handling:', e)
        }
        // maintenance/restart is already scheduled earlier to execute during cooldown
      }

      if (lastDisconnect && lastDisconnect.error && !finished) {
        try {
          const baileysPkg = await import('@whiskeysockets/baileys')
          const { DisconnectReason } = baileysPkg
          const reason = lastDisconnect?.error?.output?.statusCode
          if (reason === DisconnectReason.loggedOut) {
            const jid = sock.user?.id || `${sessionName}@s.whatsapp.net`
            removeSession(jid)
            printSessionEvent({ action: 'Session cerrada en', number: jid })
          }
        } catch (e) {}
        finished = true
        clearTimeout(timeoutId)
        try { await sendText(conn, m.chat, `*[❁]* No se pudo conectar al socket.\n> ¡Intenta conectarte nuevamente!`, m) } catch (e) {}
        await tryDeleteMessage(conn, m.chat, introMsg)
        await tryDeleteMessage(conn, m.chat, payloadMsg)
        try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
        try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
        printCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
      }
    })

    return
  } catch (err) {
    console.error('Error en sockets-conexion handler:', err)
    try { await sendText(m.conn || (arguments[0] && arguments[0].conn) || null, m.chat, `⚠︎ Ocurrió un error: ${err.message || err}`, m) } catch (e) {}
  }
}

handler.help = ['code']
handler.tags = ['subbot', 'sockets']
handler.command = ['#code', '.code', 'code']

export default handler