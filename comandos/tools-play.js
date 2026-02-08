import fetch from 'node-fetch';

let handler = async (m, { conn, text, args }) => {
  try {
    if (!text) {
      return m.reply(`*🎵 Uso correcto:*\n*#play* <nombre de la canción>\n*Ejemplo:* #play Taylor Swift`);
    }

    const waitMsg = await m.reply(`🔍 *Buscando:* ${text}\n⏳ Por favor espera...`);

    const searchQuery = encodeURIComponent(text);
    const searchUrl = `https://nexevo.onrender.com/search/youtube?q=${searchQuery}`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.status || !searchData.result || searchData.result.length === 0) {
      return m.reply(`❌ No se encontraron resultados para: *${text}*`);
    }

    const results = searchData.result.slice(0, 5);

    let listText = `🎵 *Resultados para:* ${text}\n\n`;
    results.forEach((item, index) => {
      listText += `${index + 1}. *${item.title}*\n`;
      listText += `   ⏱️ ${item.duration} | 📺 ${item.channel}\n\n`;
    });
    listText += `\n*Responde con el número (1-${results.length}) para descargar*`;

    await conn.sendMessage(m.chat, { 
      text: listText,
      contextInfo: {
        externalAdReply: {
          title: '🎶 Descargador de Música',
          body: 'Selecciona una opción',
          thumbnailUrl: results[0].imageUrl,
          sourceUrl: results[0].link,
          mediaType: 1
        }
      }
    });

    const filter = (msg) => msg.sender === m.sender && /^[1-5]$/.test(msg.text);
    const response = await m.chat.awaitMessages(filter, { max: 1, time: 30000 });

    if (!response || !response.length) {
      return m.reply('⏳ Tiempo agotado. Por favor intenta de nuevo.');
    }

    const choice = parseInt(response[0].text) - 1;
    if (choice < 0 || choice >= results.length) {
      return m.reply('❌ Opción inválida.');
    }

    const selected = results[choice];
    
    await m.reply(`⬇️ *Descargando:*\n🎵 ${selected.title}\n⏱️ ${selected.duration}\n📺 ${selected.channel}\n\n⏳ Esto puede tomar unos segundos...`);

    const videoUrl = encodeURIComponent(selected.link);
    const downloadUrl = `https://nexevo.onrender.com/download/y?url=${videoUrl}`;
    
    const downloadResponse = await fetch(downloadUrl);
    const downloadData = await downloadResponse.json();

    if (!downloadData.status || !downloadData.result || !downloadData.result.url) {
      return m.reply('❌ Error al descargar el audio.');
    }

    const audioInfo = downloadData.result.info;
    const audioUrl = downloadData.result.url;

    const caption = `✅ *Descarga completada*\n\n` +
                   `🎵 *Título:* ${audioInfo.title || selected.title}\n` +
                   `⏱️ *Duración:* ${audioInfo.duration || selected.duration}\n` +
                   `📺 *Canal:* ${audioInfo.channel || selected.channel}\n` +
                   `🎶 *Formato:* ${downloadData.result.format.toUpperCase()}\n` +
                   `💿 *Calidad:* ${downloadData.result.quality}kbps`;

    await conn.sendMessage(m.chat, {
      audio: { url: audioUrl },
      mimetype: 'audio/mpeg',
      fileName: `${selected.title}.mp3`,
      contextInfo: {
        externalAdReply: {
          title: selected.title.substring(0, 30) + (selected.title.length > 30 ? '...' : ''),
          body: selected.channel,
          thumbnailUrl: audioInfo.thumbnail || selected.imageUrl,
          sourceUrl: selected.link,
          mediaType: 1
        }
      }
    }, { quoted: m });

    await conn.sendMessage(m.chat, { text: caption }, { quoted: m });

  } catch (error) {
    console.error(error);
    await m.reply(`❌ Error: ${error.message}`);
  }
};

handler.help = ['play <búsqueda>'];
handler.tags = ['music'];
handler.command = ['play', 'music', 'song', 'descargarmusica'];

export default handler;