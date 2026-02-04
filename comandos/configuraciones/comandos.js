import { readdirSync, existsSync, readFileSync, watch } from 'fs'
import { join, resolve } from 'path'
import { format } from 'util'
import syntaxerror from 'syntax-error'
import importFile from './import.js'
import Helper from './manejador.js'

const __dirname = manejador.__dirname(import.meta)
const manejadorFolder = manejador.__dirname(join(__dirname, './comandos/index'))
const comandosFilter = filename => /\.(mc)?js$/.test(filename)


let watcher, manejador, comandosFolders = []
watcher = comandos = {}

async function filesInit(comandosFolder = comandosFolder, comandosFilter = comandosFilter, conn) {
    const folder = resolve(comandosFolder)
    if (folder in watcher) return
    comandosFolders.push(folder)

    await Promise.all(readdirSync(folder).filter(comandosFilter).map(async filename => {
        try {
            let file = globalThis.__filename(join(folder, filename))
            const module = await import(file)
            if (module) comandos[filename] = 'default' in module ? module.default : module
        } catch (e) {
            conn?.logger.error(e)
            delete comandos[filename]
        }
    }))


    const watching = watch(folder, reload.bind(null, conn, folder, comandosFilter))
    watching.on('close', () => deletecomandosFolder(folder, true))
    watcher[folder] = watching

    return plugins
}

function deletecomandosFolder(folder, isAlreadyClosed = false) {
    const resolved = resolve(folder)
    if (!(resolved in watcher)) return
    if (!isAlreadyClosed) watcher[resolved].close()
    delete watcher[resolved]
    comandosFolders.splice(comandosFolders.indexOf(resolved), 1)
}

async function reload(conn, comandosFolder = comandosFolder, comandosFilter = comandosFilter, _ev, filename) {
    if (comandosFilter(filename)) {
        let dir = globalThis.__filename(join(pluginFolder, filename), true)
        if (filename in comandos) {
            if (existsSync(dir)) conn.logger.info(` updated comando - '${filename}'`)
            else {
                conn?.logger.warn(`deleted comando - '${filename}'`)
                return delete comandos[filename]
            }
        } else conn?.logger.info(`new comando - '${filename}'`)
        let err = syntaxerror(readFileSync(dir), filename, {
            sourceType: 'module',
            allowAwaitOutsideFunction: true
        })
        if (err) conn.logger.error(`syntax error while loading '${filename}'\n${format(err)}`)
        else try {
            const module = await importFile(globalThis.__filename(dir)).catch(console.error)
            if (module) comandos[filename] = module
        } catch (e) {
            conn?.logger.error(`error require comandos '${filename}\n${format(e)}'`)
        } finally {
            comandos = Object.fromEntries(Object.entries(comandos).sort(([a], [b]) => a.localeCompare(b)))
        }
    }
}

export { comandosFolder, comandosFilter, comandos, watcher, comandosFolders, filesInit, deletecomandosFolder, reload }