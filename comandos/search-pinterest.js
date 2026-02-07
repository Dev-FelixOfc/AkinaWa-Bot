import fetch from 'node-fetch'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return conn.reply(m.chat, `${usedPrefix + command} texto`, m)
    }
    
    let searching = await conn.reply(m.chat, '...', m)
    
    try {
        const apiUrl = `https://nexevo-api.vercel.app/search/pinterest?q=${encodeURIComponent(text)}`
        
        let res = await fetch(apiUrl)
        let data = await res.json()
        
        if (!data.status || !data.result) {
            await conn.reply(m.chat, '.', m)
            return
        }
        
        let images = data.result.slice(0, 10)
        
        for (let i = 0; i < images.length; i++) {
            let img = images[i]
            
            if (img.image_large_url) {
                await conn.sendFile(m.chat, img.image_large_url, '', '', m)
                
                if (i < images.length - 1) {
                    await new Promise(r => setTimeout(r, 1500))
                }
            }
        }
        
    } catch (e) {
        await conn.reply(m.chat, '.', m)
    }
}

handler.help = ['pinterest']
handler.tags = ['search']
handler.command = ['pinterest', 'pins', 'pin']
handler.register = true

export default handler