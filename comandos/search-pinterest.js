import fetch from 'node-fetch'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return conn.reply(m.chat, `*📌 Uso correcto:* ${usedPrefix + command} *texto*\n*Ejemplo:* ${usedPrefix + command} memes`, m)
    }
    
    let wait = await conn.reply(m.chat, '🔍 *Buscando imágenes...*', m)
    
    try {
        const apiUrl = `https://nexevo-api.vercel.app/search/pinterest?q=${encodeURIComponent(text)}`
        
        let response = await fetch(apiUrl)
        let data = await response.json()
        
        if (!data.status || !data.result || data.result.length === 0) {
            await conn.reply(m.chat, '❌ *No se encontraron resultados*', m)
            return
        }
        
        let results = data.result.slice(0, 5)
        
        await conn.sendMessage(m.chat, {
            text: `✅ *Resultados de Pinterest*\n\n🔍 *Búsqueda:* ${text}\n📊 *Encontrados:* ${results.length} imágenes\n━━━━━━━━━━━━━━━━`
        })
        
        for (let i = 0; i < results.length; i++) {
            let item = results[i]
            
            try {
                let imageUrl = item.image_large_url || item.image_medium_url || item.image_small_url
                
                if (imageUrl) {
                    let caption = `📌 *${i + 1}/${results.length}*`
                    if (item.titulo && item.titulo !== "Sin título") {
                        caption += `\n📝 ${item.titulo}`
                    }
                    caption += `\n🔍 *Búsqueda:* ${text}`
                    
                    await conn.sendFile(m.chat, imageUrl, 'pinterest.jpg', caption, m)
                }
                
                if (i < results.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000))
                }
            } catch (imgError) {
                continue
            }
        }
        
    } catch (error) {
        await conn.reply(m.chat, '❌ *Error en la búsqueda*', m)
    }
}

handler.help = ['pinterest']
handler.tags = ['search']
handler.command = ['pinterest', 'pins', 'pin']
handler.register = true

export default handler