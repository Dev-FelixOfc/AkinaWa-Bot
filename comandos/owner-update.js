// comandos/owner-update.js
import { execSync } from 'child_process'
import fs from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ownerFile = join(__dirname, '..', 'jsons', 'owner.json')

var handler = async (m, { conn, text }) => {
  // Cargar owners desde jsons/owner.json (formato: objeto con claves número y valores {name, enabled})
  let ownersMap = {}
  try {
    const raw = fs.readFileSync(ownerFile, 'utf8')
    const parsed = JSON.parse(raw)
    // Normalize keys into a map keyed by digits-only number for fast lookup
    for (const [num, info] of Object.entries(parsed || {})) {
      const norm = (num || '').toString().replace(/\D/g, '')
      ownersMap[norm] = {
        raw: num,
        name: (info && info.name) ? info.name : '',
        enabled: !!(info && typeof info.enabled !== 'undefined' ? info.enabled : true)
      }
    }
  } catch (e) {
    console.error('No se pudo leer jsons/owner.json:', e)
    // Si no se puede leer, denegar por seguridad
    try { await m.react('✖️') } catch {}
    return conn.reply(m.chat, 'Configuración de owners no disponible. Contacta al administrador.', m)
  }

  // Obtener número del remitente (sin @s.whatsapp.net), normalizado a solo dígitos
  const senderNumber = ((m.sender || m.from || '').toString().split('@')[0] || '').replace(/\D/g, '')

  const ownerEntry = ownersMap[senderNumber]
  if (!ownerEntry) {
    try { await m.react('✖️') } catch {}
    return conn.reply(m.chat, 'No tienes permiso para usar este comando.', m)
  }
  if (!ownerEntry.enabled) {
    try { await m.react('✖️') } catch {}
    return conn.reply(m.chat, `Tu usuario (${ownerEntry.name || ownerEntry.raw}) está deshabilitado para este comando.`, m)
  }

  // Si llega hasta aquí, está autorizado
  try { await m.react('🕒') } catch {}

  try {
    const stdout = execSync('git pull' + (m.fromMe && text ? ' ' + text : ''), { stdio: 'pipe' })
    let messager = stdout.toString()
    if (messager.includes('👑 Ya está cargada la actualización.')) messager = '👑 Los datos ya están actualizados a la última versión.'
    if (messager.includes('👑 Actualizando.')) messager = '👾 Procesando, espere un momento mientras me actualizo.\n\n' + stdout.toString()
    try { await m.react('✓') } catch {}
    return conn.reply(m.chat, messager, m)
  } catch (e) {
    // Manejo alternativo (status en caso de conflictos, etc.)
    try {
      const status = execSync('git status --porcelain', { stdio: 'pipe' })
      if (status.length > 0) {
        const conflictedFiles = status
          .toString()
          .split('\n')
          .filter(line => line.trim() !== '')
          .map(line => {
            if (line.includes('.npm/') || line.includes('.cache/') || line.includes('tmp/') || line.includes('database.json') || line.includes('sessions/Principal/') || line.includes('npm-debug.log')) {
              return null
            }
            return '*→ ' + line.slice(3) + '*'
          })
          .filter(Boolean)
        if (conflictedFiles.length > 0) {
          const errorMessage = `\`⚠︎ No se pudo realizar la actualización.\`\n\n> *Ya.*\n\n${conflictedFiles.join('\n')}.`
          try { await conn.reply(m.chat, errorMessage, m) } catch {}
          try { await m.react('✖️') } catch {}
          return
        }
      }
    } catch (error) {
      console.error(error)
      let errorMessage2 = 'Error al actualizar.'
      if (error && error.message) {
        errorMessage2 += '\n* Mensaje de error: ' + error.message
      }
      try { await conn.reply(m.chat, errorMessage2, m) } catch {}
    }
  }
}

handler.help = ['update']
handler.tags = ['owner']
handler.command = ['update', 'up', 'actualizar']

export default handler