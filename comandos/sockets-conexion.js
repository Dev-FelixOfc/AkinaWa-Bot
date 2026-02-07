// comandos/sockets-conexion.js
// Sub-bot linking (#code / #qr)
// - CODE: pide el pairing code REAL a Baileys usando el número del usuario (sin caracteres).
// - QR: envía el texto + imagen QR (caption).
// Auths en jsons/sockets/auth/<sessionName>, sesiones en jsons/sockets/JadiBot.json

import fs from 'fs'
import path from 'path'
import qrcode from 'qrcode'
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

// Small helpers
function formatPairingCode(raw) {
  if (!raw || typeof raw !== 'string') return raw
  return (raw.replace(/\s+/g, '').match(/.{1,4}/g) || [raw]).join('-')
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

// Try common locations for requestPairingCode
async function tryRequestPairingCode(sock, phone, attempts = 5, interval = 700) {
  for (let i = 0; i < attempts; i++) {
    try {
      if (!sock) throw new Error('sock inexistente')
      if (typeof sock.requestPairingCode === 'function') {
        const code = await sock.requestPairingCode(phone)
        if (code) return String(code)
      }
      if (sock.signal && typeof sock.signal.requestPairingCode === 'function') {
        const code = await sock.signal.requestPairingCode(phone)
        if (code) return String(code)
      }
      if (sock.ws && typeof sock.ws.requestPairingCode === 'function') {
        const code = await sock.ws.requestPairingCode(phone)
        if (code) return String(code)
      }
    } catch (e) {
      console.warn('[subbot] petición pairing error (intento ' + (i+1) + '):', e?.message || e)
    }
    await delay(interval)
  }
  return null
}

// Messaging adapters (adapt to your conn impl if needed)
async function sendText(conn, chat, text, quoted = null) {
  if (!conn) throw new Error('conn missing')
  if (typeof conn.reply === 'function') return conn.reply(chat, text, quoted)
  if (typeof conn.sendMessage === 'function') return conn.sendMessage(chat, { text }, { quoted })
  throw new Error('conn no expone reply/sendMessage')
}
async function sendImageWithCaption(conn, chat, buffer, caption = '', quoted = null) {
  if (!conn) throw new Error('conn missing')
  if (typeof conn.sendMessage === 'function') return conn.sendMessage(chat, { image: buffer, caption }, { quoted })
  if (typeof conn.sendFile === 'function') return conn.sendFile(chat, buffer, 'qrcode.png', caption, quoted)
  throw new Error('conn no expone método para imágenes')
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
  } catch (e) {}
}

// Create temp socket using baileys' useMultiFileAuthState and wrapper simple.js (ruta en tu bot)
async function makeTempSocket(sessionName) {
  const bailPkg = await import('@whiskeysockets/baileys')
  const { useMultiFileAuthState, fetchLatestBaileysVersion } = bailPkg
  // Intentar usar tu wrapper simple.js en la carpeta configuraciones
  let makeWASocket = null
  try {
    const mod = await import('./configuraciones/simple.js') // ruta dentro comandos/
    makeWASocket = mod.makeWASocket ?? mod.default ?? null
  } catch (e) {}
  if (!makeWASocket) makeWASocket = (await import('@whiskeysockets/baileys')).makeWASocket

  const authDir = path.join(AUTH_ROOT, sessionName)
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true })

  const { state, saveCreds } = await useMultiFileAuthState(authDir)
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

  // Behaviors similar to original: mark not initialized, schedule cleanup if never initialized
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
      console.log(`[AUTO-LIMPIEZA] Sesión ${sessionName} eliminada por credenciales inválidas/no completadas.`)
    }
  }, 60_000) // 60s auto-clean like original

  return { sock, authDir }
}

// logging helpers
function logCommandEvent({ message, connection = 'Pendiente', type = 'SubBot' }) {
  printCommandEvent({ message, connection, type })
}
function logSessionEvent(action, number) {
  printSessionEvent({ action, number })
}

// main handler
var handler = async (m, { conn }) => {
  try {
    const rawText = (m.text || m.body || '').trim()
    const lc = rawText.toLowerCase()
    const wantCode = lc === '#code' || lc === '.code' || lc === 'code'
    const wantQr = lc === '#qr' || lc === '.qr' || lc === 'qr'
    if (!wantCode && !wantQr) return

    logCommandEvent({ message: rawText, connection: 'Pendiente', type: 'SubBot' })

    // Prepare socket
    const sessionName = `sub-${Date.now()}-${randomBytes(3).toString('hex')}`
    const { sock, authDir } = await makeTempSocket(sessionName)

    let introMsg = null
    let payloadMsg = null
    let finished = false
    const expireMs = wantCode ? 45_000 : 60_000

    // Intro texts
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

    const introQr = [
      '✿︎ `Vinculación de sockets` ✿︎',
      '',
      'Modo: *Codigo qr*.',
      '',
      '`❁ Instrucciones:`',
      'Más opciones > Dispositivos vinculados > Escanea el código de la foto.',
      '',
      '*_Nota_* Necesitas otro teléfono o PC y escanear antes de los 60 segundos.'
    ].join('\n')

    // send intro (QR mode will resend caption with image when QR arrives; we still send an intro first for UX)
    introMsg = await sendText(conn, m.chat, wantCode ? introCode : introQr, m).catch(()=>null)

    // expiration timeout
    const timeoutId = setTimeout(async () => {
      if (finished) return
      finished = true
      try { await sendText(conn, m.chat, `*[❁]* No se pudo conectar al socket.\n> ¡Intenta conectarte nuevamente!`, m) } catch (e) {}
      await tryDeleteMessage(conn, m.chat, introMsg)
      await tryDeleteMessage(conn, m.chat, payloadMsg)
      try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
      try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
      logCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
    }, expireMs + 2000)

    // connection.update handler (sequence similar to tu código original)
    sock.ev.on('connection.update', async (update) => {
      if (finished) return
      const { connection, lastDisconnect, qr, isNewLogin } = update

      if (isNewLogin) sock.isInit = false

      // When Baileys emits QR payload (string) we act accordingly
      if (qr && !finished) {
        if (wantCode) {
          // Emular secuencia: esperar un poco para que el socket esté listo a recibir requestPairingCode
          await delay(2500)
          // phone number to pass: usa el número del solicitante (sin símbolos)
          let phone = (m.sender || '').split('@')[0] || sessionName
          phone = phone.replace(/\D/g, '')
          if (!phone) phone = sessionName

          try {
            const secret = await tryRequestPairingCode(sock, phone, 5, 700)
            if (!secret) {
              // If cannot obtain real code, report and cleanup (no falsos)
              finished = true
              clearTimeout(timeoutId)
              try { await sendText(conn, m.chat, `*[❁]* No se pudo generar el código de vinculación.\n> ¡Intenta conectarte nuevamente!`, m) } catch {}
              await tryDeleteMessage(conn, m.chat, introMsg)
              try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
              try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
              logCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
              return
            }
            const formatted = formatPairingCode(String(secret))
            // Enviar solo el código (bloque de código), sin texto extra
            payloadMsg = await sendText(conn, m.chat, '```' + formatted + '```', m).catch(()=>null)
            console.log('[subbot] pairing code enviado (real):', formatted)
            // No cerramos el socket aquí; esperamos open/disconnect
          } catch (err) {
            console.error('[subbot] error obteniendo pairing code:', err)
            finished = true
            clearTimeout(timeoutId)
            try { await sendText(conn, m.chat, `*[❁]* No se pudo generar el código de vinculación.\n> ¡Intenta conectarte nuevamente!`, m) } catch {}
            await tryDeleteMessage(conn, m.chat, introMsg)
            await tryDeleteMessage(conn, m.chat, payloadMsg)
            try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
            try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
            logCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
            return
          }
        } else {
          // QR mode: enviar imagen con caption (introQr) juntos
          try {
            const img = await qrcode.toBuffer(qr, { type: 'png', margin: 1, width: 512 })
            payloadMsg = await sendImageWithCaption(conn, m.chat, img, introQr, m).catch(()=>null)
          } catch (e) {
            console.error('[subbot] error enviando QR image:', e)
          }
        }
      }

      // When connection opens: persist session, notify and cleanup msgs
      if (connection === 'open' && !finished) {
        finished = true
        clearTimeout(timeoutId)
        try {
          const jid = sock.user?.id || sock.user?.jid || `${sessionName}@s.whatsapp.net`
          addSession({ socket: jid, sessionFile: authDir, active: true, createdAt: Date.now(), browser: 'Ubuntu' })
          try { await sendText(conn, m.chat, `*[❁]* La conexión con el socket fue un éxito.\n> ¡Personaliza el socket usando el comando ${'.set'}!`, m).catch(()=>{}) } catch {}
          await tryDeleteMessage(conn, m.chat, introMsg)
          await tryDeleteMessage(conn, m.chat, payloadMsg)
          logCommandEvent({ message: rawText, connection: 'Exitosa', type: 'SubBot' })
          logSessionEvent('Session creada en', jid)
          // push to global conns like en tu código original
          if (!global.conns) global.conns = []
          global.conns.push(sock)
        } catch (e) {
          console.error('[subbot] error on open handling:', e)
        }
      }

      // Handle disconnects & logged out
      if (lastDisconnect && lastDisconnect.error && !finished) {
        try {
          const baileysPkg = await import('@whiskeysockets/baileys')
          const { DisconnectReason } = baileysPkg
          const reason = lastDisconnect?.error?.output?.statusCode
          if (reason === DisconnectReason.loggedOut) {
            const jid = sock.user?.id || `${sessionName}@s.whatsapp.net`
            removeSession(jid)
            logSessionEvent('Session cerrada en', jid)
          }
        } catch (e) {}
        finished = true
        clearTimeout(timeoutId)
        try { await sendText(conn, m.chat, `*[❁]* No se pudo conectar al socket.\n> ¡Intenta conectarte nuevamente!`, m) } catch {}
        await tryDeleteMessage(conn, m.chat, introMsg)
        await tryDeleteMessage(conn, m.chat, payloadMsg)
        try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
        try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
        logCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
      }
    })

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