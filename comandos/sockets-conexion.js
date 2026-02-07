// comandos/sockets-conexion.js
// Maneja #code / #qr para sub-sockets usando @whiskeysockets/baileys
// - CODE: solicita el pairing code real a Baileys usando el número del usuario (m.sender).
// - QR: envía el QR como imagen junto con el texto de instrucciones (caption).
// Persistencia en jsons/sockets, auth en jsons/sockets/auth/<sessionName>

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

// util: format pairing code en grupos de 4 con guiones
function formatPairingCode(raw) {
  if (!raw || typeof raw !== 'string') return raw
  const s = raw.replace(/\s+/g, '')
  return (s.match(/.{1,4}/g) || [s]).join('-')
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

async function tryGetPairingCodeFromSock(sock, phone, attempts = 4, interval = 700) {
  // intenta varias variantes (requestPairingCode en sock, sock.signal, sock.ws, etc.)
  for (let i = 0; i < attempts; i++) {
    try {
      if (!sock) throw new Error('sock no existente')
      // variante directa
      if (typeof sock.requestPairingCode === 'function') {
        const secret = await sock.requestPairingCode(phone)
        if (secret) return String(secret)
      }
      // variante en signal (algunas builds exponen en signal)
      if (sock.signal && typeof sock.signal.requestPairingCode === 'function') {
        const secret = await sock.signal.requestPairingCode(phone)
        if (secret) return String(secret)
      }
      // variante en ws (poco común)
      if (sock.ws && typeof sock.ws.requestPairingCode === 'function') {
        const secret = await sock.ws.requestPairingCode(phone)
        if (secret) return String(secret)
      }
    } catch (err) {
      // si hay error sigue intentando
      console.warn('[subbot] intento requestPairingCode falló:', err?.message || err)
    }
    await delay(interval)
  }
  throw new Error('requestPairingCode no disponible en sock (o falló)')
}

// helpers de envío/adaptación al conn del bot principal
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

// crea socket temporal (useMultiFileAuthState)
async function makeTempSocket(sessionName) {
  const baileysPkg = await import('@whiskeysockets/baileys')
  const { useMultiFileAuthState, fetchLatestBaileysVersion } = baileysPkg
  // si tienes wrapper local lo usamos, si no el makeWASocket de baileys
  let makeWASocket = null
  try {
    const mod = await import('./configuraciones/simple.js')
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
  return { sock, authDir }
}

// prints / logs (usa tus módulos)
function logCmd(m) { printCommandEvent({ message: m, connection: 'Pendiente', type: 'SubBot' }) }
function logCreated(jid) { printSessionEvent({ action: 'Session creada en', number: jid }) }

// handler principal
var handler = async (m, { conn }) => {
  try {
    const rawText = (m.text || m.body || '').trim()
    const lc = rawText.toLowerCase()
    const wantCode = lc === '#code' || lc === '.code' || lc === 'code'
    const wantQr = lc === '#qr' || lc === '.qr' || lc === 'qr'
    if (!wantCode && !wantQr) return

    logCmd(rawText)

    const sessionName = `sub-${Date.now()}-${randomBytes(3).toString('hex')}`
    const { sock, authDir } = await makeTempSocket(sessionName)

    let introMsg = null
    let payloadMsg = null
    let finished = false
    const expireMs = wantCode ? 45_000 : 60_000

    // textos intro
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

    // enviamos intro (para QR luego enviaremos la imagen con caption)
    introMsg = await sendText(conn, m.chat, wantCode ? introCode : introQr, m).catch(()=>null)

    // timeout por expiración
    const timeoutId = setTimeout(async () => {
      if (finished) return
      finished = true
      try { await sendText(conn, m.chat, `*[❁]* No se pudo conectar al socket.\n> ¡Intenta conectarte nuevamente!`, m) } catch (e) {}
      await tryDeleteMessage(conn, m.chat, introMsg)
      await tryDeleteMessage(conn, m.chat, payloadMsg)
      try { sock.logout?.().catch(()=>{}); sock.close?.().catch(()=>{}) } catch {}
      try { fs.rmSync(authDir, { recursive: true, force: true }) } catch {}
      printCommandEvent({ message: rawText, connection: 'Fallida', type: 'SubBot' })
    }, expireMs + 2000)

    // Escucha updates
    sock.ev.on('connection.update', async (update) => {
      if (finished) return
      const { connection, lastDisconnect, qr } = update

      if (qr && !finished) {
        // Si el modo es CODE: pedimos pairing code REAL usando número del usuario
        if (wantCode) {
          try {
            // número objetivo: m.sender sin @
            const phone = (m.sender || '').split('@')[0] || sessionName
            // intentamos varias veces para que el método esté disponible
            let secret = null
            try {
              secret = await tryGetPairingCodeFromSock(sock, phone, 5, 800)
            } catch (err) {
              console.error('[subbot] no se obtuvo pairing code real:', err?.message || err)
            }

            if (!secret) {
              // no enviar código falso: notificar fallo y limpiar
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
            // enviar SOLO el código (en bloque), sin texto extra
            payloadMsg = await sendText(conn, m.chat, '```' + formatted + '```', m).catch(()=>null)
            console.log('[subbot] pairing code real enviado:', formatted)
            // NOTA: no finalizamos socket aquí; esperamos open o eventos de disconnect
          } catch (err) {
            console.error('[subbot] error en modo CODE:', err)
          }
        } else {
          // Modo QR: enviamos la imagen junto con el texto (caption)
          try {
            const img = await qrcode.toBuffer(qr, { type: 'png', margin: 1, width: 512 })
            payloadMsg = await sendImageWithCaption(conn, m.chat, img, introQr, m).catch(()=>null)
          } catch (e) {
            console.error('error al generar/enviar QR image:', e)
          }
        }
      }

      // conexión abierta -> persistir sesión y notificar
      if (connection === 'open' && !finished) {
        finished = true
        clearTimeout(timeoutId)
        try {
          const jid = sock.user?.id || sock.user?.jid || `${sessionName}@s.whatsapp.net`
          addSession({ socket: jid, sessionFile: authDir, active: true, createdAt: Date.now(), browser: 'Ubuntu' })
          try { await sendText(conn, m.chat, `*[❁]* La conexión con el socket fue un éxito.\n> ¡Personaliza el socket usando el comando ${'.set'}!`, m).catch(()=>{}) } catch {}
          await tryDeleteMessage(conn, m.chat, introMsg)
          await tryDeleteMessage(conn, m.chat, payloadMsg)
          printCommandEvent({ message: rawText, connection: 'Exitosa', type: 'SubBot' })
          printSessionEvent({ action: 'Session creada en', number: jid })
          // mantener sock vivo
          if (!global.conns) global.conns = []
          global.conns.push(sock)
        } catch (e) {
          console.error('error on open handling:', e)
        }
      }

      // desconexiones/errores
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

    // keep handler alive; socket corre en background
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