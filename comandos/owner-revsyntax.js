// comandos/owner-revsyntax.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import syntaxError from 'syntax-error'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ownerFile = path.join(__dirname, '..', 'jsons', 'owner.json')
const projectRoot = path.resolve(__dirname, '..') // ajuste si tu index está en otra carpeta

// Excluir carpetas pesadas / irrelevantes al buscar errores
const DEFAULT_EXCLUDES = ['node_modules', '.git', 'sessions', 'sessions/Principal', 'tmp', 'coverage', '.github', '.vscode', 'dist']

/**
 * Recorre recursivamente un directorio y devuelve archivos con las extensiones dadas
 */
function walkDir(dir, exts = ['.js', '.mjs', '.cjs', '.json'], excludes = DEFAULT_EXCLUDES) {
  let results = []
  const list = fs.readdirSync(dir, { withFileTypes: true })
  for (const dirent of list) {
    const name = dirent.name
    const full = path.join(dir, name)
    const rel = path.relative(projectRoot, full)
    if (excludes.some(e => rel.split(path.sep).includes(e))) continue
    if (dirent.isDirectory()) {
      results = results.concat(walkDir(full, exts, excludes))
    } else {
      if (exts.includes(path.extname(name).toLowerCase())) results.push(full)
    }
  }
  return results
}

/**
 * Normaliza un número Whatsapp a solo dígitos para comparar
 */
function normalizeNumber(raw) {
  if (!raw) return ''
  return raw.toString().split('@')[0].replace(/\D/g, '')
}

var handler = async (m, { conn, usedPrefix, command }) => {
  try {
    await m.react?.('🕒') 
    try { conn.sendPresenceUpdate?.('composing', m.chat) } catch {}

    // Cargar owners
    let ownersRaw = {}
    try {
      const raw = fs.readFileSync(ownerFile, 'utf8')
      ownersRaw = JSON.parse(raw || '{}')
    } catch (e) {
      // Si no se puede leer owner.json, denegar por seguridad
      try { await m.react?.('✖️') } catch {}
      return conn.reply(m.chat, '* No puedes ejecutar este comando ya que no eres owner.', m)
    }

    // Construir mapa normalized -> { raw, name, enabled }
    const ownersMap = {}
    if (Array.isArray(ownersRaw)) {
      for (const num of ownersRaw) {
        const norm = num.toString().replace(/\D/g, '')
        if (norm) ownersMap[norm] = { raw: num, name: '', enabled: true }
      }
    } else {
      for (const [num, info] of Object.entries(ownersRaw || {})) {
        const norm = num.toString().replace(/\D/g, '')
        if (!norm) continue
        ownersMap[norm] = {
          raw: num,
          name: info && info.name ? info.name : '',
          enabled: !!(info && typeof info.enabled !== 'undefined' ? info.enabled : true)
        }
      }
    }

    // Verificar permiso
    const senderNumber = normalizeNumber(m.sender || m.from || '')
    const ownerEntry = ownersMap[senderNumber]
    if (!ownerEntry || !ownerEntry.enabled) {
      try { await m.react?.('✖️') } catch {}
      return conn.reply(m.chat, '* No puedes ejecutar este comando ya que no eres owner.', m)
    }

    // Buscar archivos a revisar (todo el bot)
    // Puedes ajustar las extensiones si quieres revisar otros tipos
    const filesToCheck = walkDir(projectRoot, ['.js', '.mjs', '.cjs', '.json'])

    let response = `✧ *Revisión de Syntax / Parsing Errors en el proyecto*\n\n`
    let totalErrors = 0
    const details = []

    for (const filePath of filesToCheck) {
      const relPath = path.relative(projectRoot, filePath)
      const ext = path.extname(filePath).toLowerCase()
      try {
        const content = fs.readFileSync(filePath, 'utf8')

        if (ext === '.json') {
          // Verificar JSON válido
          try {
            JSON.parse(content)
          } catch (jsonErr) {
            totalErrors++
            details.push({
              file: relPath,
              type: 'JSON Parse Error',
              message: jsonErr.message
            })
          }
        } else {
          // Verificar sintaxis JS/ESM usando syntax-error (no ejecuta el archivo)
          const err = syntaxError(content, relPath, {
            sourceType: 'module',
            allowAwaitOutsideFunction: true
          })
          if (err) {
            totalErrors++
            details.push({
              file: relPath,
              type: 'Syntax Error',
              message: err.message || err.stack || String(err),
              line: err.loc?.line || err.line || 'Desconocido'
            })
          } else {
            // Si no hay error de sintaxis, opcionalmente podríamos intentar una import dinámica
            // para detectar errores en tiempo de ejecución al cargar módulos, pero IMPORTAR
            // ejecutará código y puede producir efectos secundarios. Por seguridad NO
            // hacemos import dinámico por defecto.
            //
            // Si quieres habilitar import dinámico para detectar errores runtime en módulos,
            // puedes descomentar el bloque siguiente (¡RIESGOSO!):
            /*
            try {
              const url = pathToFileURL(filePath).href + `?update=${Date.now()}`
              await import(url)
            } catch (runtimeErr) {
              totalErrors++
              details.push({
                file: relPath,
                type: 'Runtime import error',
                message: runtimeErr.message || String(runtimeErr),
                stack: runtimeErr.stack
              })
            }
            */
          }
        }
      } catch (e) {
        // Error leyendo archivo
        totalErrors++
        details.push({
          file: relPath,
          type: 'Read Error',
          message: e.message || String(e)
        })
      }
    }

    if (totalErrors === 0) {
      response += '❀ ¡Todo está en orden! No se detectaron errores de sintaxis ni parseo en los archivos revisados.\n'
      await conn.reply(m.chat, response, m)
      try { await m.react?.('✅') } catch {}
      return
    }

    // Formatear salida con límites para evitar mensajes excesivamente largos
    response += `⚠︎ Se encontraron *${totalErrors}* error(es):\n\n`
    const MAX_ITEMS = 30
    for (let i = 0; i < Math.min(details.length, MAX_ITEMS); i++) {
      const d = details[i]
      response += `• ${d.type} en: ${d.file}\n`
      if (d.line) response += `  → Línea: ${d.line}\n`
      response += `  → Mensaje: ${d.message}\n\n`
    }
    if (details.length > MAX_ITEMS) {
      response += `...y ${details.length - MAX_ITEMS} error(es) más.\n`
    }
    response += '\nRevisa los archivos indicados. (Se revisaron extensiones .js .mjs .cjs .json)'

    await conn.reply(m.chat, response, m)
    try { await m.react?.('✅') } catch {}
  } catch (err) {
    try { await m.react?.('✖️') } catch {}
    console.error(err)
    await conn.reply(m.chat, `⚠︎ Ocurrió un error al ejecutar la revisión: ${err.message || String(err)}`, m)
  }
}

handler.command = ['detectarsyntax', 'detectar', 'revsyntax', 'rev']
handler.help = ['detectarsyntax']
handler.tags = ['tools']

export default handler