import fetch from 'node-fetch';

let handler = async (m, { conn, text }) => {
  try {
    if (!text) {
      return m.reply(`╭┈「 *YOUTUBE MUSIC PLAYER* 」
│
│ 🎵 *Uso correcto:*
│ *▶️ #play* <canción/artista>
│
│ 🔸 *Ejemplo:* 
│ *▶️ #play* Taylor Swift
│ *▶️ #play* Bad Bunny
│
╰┈「 *Akina Wa Bot* 」`);
    }

    await m.reply(`╭┈「 *BÚSQUEDA EN CURSO* 」
│
│ 🔍 *Buscando en YouTube:*
│ ${text}
│
│ ⚡ *Escaneando base de datos...*
│
╰┈「 *Akina Wa Bot* 」`);

    const searchQuery = encodeURIComponent(text);
    const searchUrl = `https://nexevo.onrender.com/search/youtube?q=${searchQuery}`;
    
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.status || !searchData.result || searchData.result.length === 0) {
      return m.reply(`╭┈「 *ERROR DE BÚSQUEDA* 」
│
│ ❌ *No se encontraron resultados para:*
│ ${text}
│
│ 💡 *Sugerencias:*
│ • Verifica el nombre
│ • Intenta otra canción
│
╰┈「 *Akina Wa Bot* 」`);
    }

    const results = searchData.result.slice(0, 5);

    let listText = `╭┈「 *RESULTADOS DE BÚSQUEDA* 」
│
│ 🎵 *Consulta:* ${text}
│ 🔢 *Resultados:* ${results.length}/5
│
│`;
    results.forEach((item, index) => {
      listText += `│ *${index + 1}.* ${item.title}\n`;
      listText += `│    ⏱️ ${item.duration} | 📺 ${item.channel}\n`;
      listText += `│\n`;
    });
    listText += `│ 💫 *Instrucción:*
│ Responde con el número (1-${results.length})
│ para iniciar la descarga.
│
╰┈「 *Akina Wa Bot* 」`;

    await conn.sendMessage(m.chat, { 
      text: listText,
      contextInfo: {
        externalAdReply: {
          title: '🎧 FUTURE MUSIC PLAYER v2.0',
          body: 'Sistema de descarga avanzado',
          thumbnailUrl: results[0].imageUrl,
          sourceUrl: results[0].link,
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    });

    conn.playSession = conn.playSession || {};
    const sessionId = m.sender + m.chat;
    conn.playSession[sessionId] = {
      results,
      timestamp: Date.now()
    };

    setTimeout(() => {
      if (conn.playSession[sessionId]) {
        delete conn.playSession[sessionId];
        conn.sendMessage(m.chat, { 
          text: `╭┈「 *SESIÓN EXPIRADA* 」
│
│ ⏳ *Sesión de búsqueda expirada*
│ 
│ 🎵 *Para buscar otra canción:*
│ ▶️ #play <nombre>
│
╰┈「 *Akina Wa Bot* 」`
        });
      }
    }, 30000);

  } catch (error) {
    console.error(error);
    await m.reply(`╭┈「 *ERROR DEL SISTEMA* 」
│
│ ⚠️ *Se produjo un error:*
│ ${error.message}
│
│ 🔄 *Intenta nuevamente*
│
╰┈「 *Akina Wa Bot* 」`);
  }
};

handler.before = async (m, { conn }) => {
  try {
    if (!m.text || !conn.playSession) return;
    
    const sessionId = m.sender + m.chat;
    const session = conn.playSession[sessionId];
    
    if (session && Date.now() - session.timestamp < 30000) {
      const choice = parseInt(m.text.trim());
      
      if (choice >= 1 && choice <= session.results.length) {
        delete conn.playSession[sessionId];
        
        const selected = session.results[choice - 1];
        
        await m.reply(`╭┈「 *DESCARGA INICIADA* 」
│
│ 🎵 *Título:* ${selected.title}
│ ⏱️ *Duración:* ${selected.duration}
│ 📺 *Canal:* ${selected.channel}
│
│ ⚡ *Procesando audio...*
│ 🔄 *Convirtiendo a MP3...*
│
╰┈「 *Akina Wa Bot* 」`);

        const videoUrl = encodeURIComponent(selected.link);
        const downloadUrl = `https://nexevo.onrender.com/download/y?url=${videoUrl}`;
        
        const downloadResponse = await fetch(downloadUrl);
        const downloadData = await downloadResponse.json();

        if (!downloadData.status || !downloadData.result || !downloadData.result.url) {
          return m.reply(`╭┈「 *ERROR DE DESCARGA* 」
│
│ ❌ *No se pudo descargar el audio*
│ 
│ 💡 *Posibles causas:*
│ • Video no disponible
│ • Restricciones de YouTube
│ • Error en el servidor
│
╰┈「 *Akina Wa Bot* 」`);
        }

        const audioInfo = downloadData.result.info;
        const audioUrl = downloadData.result.url;

        await conn.sendMessage(m.chat, {
          audio: { url: audioUrl },
          mimetype: 'audio/mpeg',
          fileName: `${selected.title.replace(/[<>:"/\\|?*]+/g, '')}.mp3`.substring(0, 100),
          contextInfo: {
            externalAdReply: {
              title: '🎧 DESCARGA COMPLETADA',
              body: 'Audio listo para reproducir',
              thumbnailUrl: audioInfo.thumbnail || selected.imageUrl,
              sourceUrl: selected.link,
              mediaType: 1,
              renderLargerThumbnail: false
            }
          }
        });
        
        return true;
      }
    }
  } catch (error) {
    console.error('Error en before:', error);
  }
};

handler.help = ['play <búsqueda>'];
handler.tags = ['music'];
handler.command = ['play', 'music', 'song', 'descargarmusica', 'p'];

export default handler;