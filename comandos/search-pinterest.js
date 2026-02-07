import fetch from 'node-fetch'
import moment from 'moment-timezone'
import { default as WA, proto, prepareWAMessageMedia, generateWAMessageFromContent } from '@whiskeysockets/baileys'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return m.reply(`🤡 *¿Ya no sabes qué buscar, patético?*\n\n💔 Ella te dejó y ahora ni para escribir sirves\n\n📌 Ejemplo: ${usedPrefix + command} memes`)

  try {
    await conn.sendMessage(m.chat, {
      react: {
        text: '💔',
        key: m.key
      }
    })

    const res = await fetch(`https://api.vreden.my.id/api/v1/search/pinterest?query=${encodeURIComponent(text)}`)
    const json = await res.json()

    if (!json.status || !json.result?.search_data?.length) {
      await conn.sendMessage(m.chat, {
        react: {
          text: '😭',
          key: m.key
        }
      })
      return m.reply('😒 *No encontré nada... como ella nunca te encontró interesante*')
    }

    const tiempo = moment.tz('America/Bogota').format('DD MMM YYYY')
    const tiempo2 = moment.tz('America/Bogota').format('hh:mm A')

    const cards = []
    const images = json.result.search_data.slice(0, 10)

    for (let i = 0; i < images.length; i++) {
      const imgUrl = images[i]
      let headerObj

      try {
        const imgBuffer = await (await fetch(imgUrl)).buffer()
        const media = await prepareWAMessageMedia({ image: imgBuffer }, { upload: conn.waUploadToServer })
        headerObj = proto.Message.InteractiveMessage.Header.fromObject({ hasMediaAttachment: true, imageMessage: media.imageMessage })
      } catch {
        headerObj = proto.Message.InteractiveMessage.Header.fromObject({ hasMediaAttachment: false })
      }

      const card = {
        header: headerObj,
        body: proto.Message.InteractiveMessage.Body.fromObject({ text: `🤡 *Resultado ${i + 1}*\n😏 Por si acaso te distraes de pensar en ella` }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: `💔 Ella te dejó • ${tiempo} ${tiempo2}` }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons: [] })
      }

      cards.push(card)
    }

    const interactive = proto.Message.InteractiveMessage.fromObject({
      body: proto.Message.InteractiveMessage.Body.create({ text: `😈 *Resultados para "${json.result.query}"*\n\n🤣 Mientras buscas esto, ella ya está con otro` }),
      footer: proto.Message.InteractiveMessage.Footer.create({ text: `📊 ${json.result.count} imágenes que olvidan tu triste existencia` }),
      header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
      carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards })
    })

    const messageContent = generateWAMessageFromContent(m.chat, {
      viewOnceMessage: {
        message: {
          messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
          interactiveMessage: interactive
        }
      }
    }, { quoted: m })

    await conn.relayMessage(m.chat, messageContent.message, { messageId: messageContent.key.id })

    await conn.sendMessage(m.chat, {
      react: {
        text: '💔',
        key: messageContent.key
      }
    })

    await conn.reply(m.chat, '💀 *Ella no te quiere y por eso te ignora...*\n🖕 *Siempre serás patético por eso ella te dejó*', m)

  } catch (e) {
    console.error('[Pinterest Carrusel] Error:', e)
    await conn.sendMessage(m.chat, {
      react: {
        text: '🤡',
        key: m.key
      }
    })
    await conn.reply(m.chat, '😒 *Error... como todo en tu vida*', m)
  }
}

handler.help = ['pinterest']
handler.tags = ['search']
handler.command = ['pinterest', 'pins', 'pin']
handler.register = true

export default handler