import fetch from 'node-fetch'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) throw `Ingresa texto\nEjemplo: ${usedPrefix + command} memes`
    
    await m.reply('Buscando...')
    
    try {
        const url = `https://nexevo-api.vercel.app/search/pinterest?q=${encodeURIComponent(text)}`
        const response = await fetch(url)
        const data = await response.json()
        
        if (!data.status || !data.result || data.result.length === 0) {
            throw 'Sin resultados'
        }
        
        const results = data.result.slice(0, 10)
        
        for (let i = 0; i < results.length; i++) {
            const item = results[i]
            if (i > 0) await new Promise(resolve => setTimeout(resolve, 1000))
            
            const caption = item.titulo !== "Sin título" 
                ? `${item.titulo}\n\nResultado ${i + 1} de ${results.length}\nBúsqueda: ${text}`
                : `Imagen de Pinterest\n\nResultado ${i + 1} de ${results.length}\nBúsqueda: ${text}`
            
            await conn.sendFile(m.chat, item.image_large_url, 'pinterest.jpg', caption, m)
        }
        
        await conn.sendMessage(m.chat, {
            text: `Búsqueda: ${text}\nTotal: ${results.length} imágenes\n\nUsa: ${usedPrefix + command} [texto]`
        })
    } catch (error) {
        throw 'Error en búsqueda'
    }
}

handler.help = ['pinterest']
handler.tags = ['search']
handler.command = ['pinterest', 'pins', 'pin']
handler.register = true

export default handler