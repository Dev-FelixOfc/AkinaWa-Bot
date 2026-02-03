import fs from 'fs'
import { join } from 'path'

let handler = async (m, { conn }) => {
  try {
    let taguser = '@' + m.sender.split('@')[0]
    let nombreBot = 'Akina Wa'
    let bannerFinal = 'https://felixproyects.ooguy.com/AkinaWa-Bot.jpg'

    const botActual = conn.user?.jid?.split('@')[0]?.replace(/\D/g, '')
    const configPath = join('./JadiBots', botActual || '', 'config.json')
    if (botActual && fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath))
        if (config.name) nombreBot = config.name
        if (config.banner) bannerFinal = config.banner
      } catch (e) {
        console.error(e)
      }
    }

    const tipo = conn.user?.jid === global.conn?.user?.jid ? '✿' : '(𝐒𝐮𝐛-𝐁𝐨𝐭)'
    const devby = `${nombreBot}, ${dev}`

    let menu = `𝐇𝐨𝐥𝐚! 𝐒𝐨𝐲 *${nombreBot}* *${tipo}*
Aǫᴜɪ ᴛɪᴇɴᴇs ʟᴀ ʟɪsᴛᴀ ᴅᴇ ᴄᴏᴍᴀɴᴅᴏs`

    await conn.sendMessage(m.chat, {
      text: menu,
      contextInfo: {
        mentionedJid: [m.sender],
        externalAdReply: {
          title: devby,
          sourceUrl: 'https://yotsuba.giize.com',
          mediaType: 1,
          renderLargerThumbnail: true,
          thumbnailUrl: bannerFinal
        }
      }
    }, { quoted: m })

  } catch (e) {
    await m.reply(`✘ Ocurrió un error al mostrar el menú.\n\n${e}`)
  }
}

handler.help = ['menu']
handler.tags = ['main']
handler.command = ['menu', 'help', 'menú', 'asistenciabot', 'comandosbot', 'listadecomandos', 'menucompleto']

export default handler