import fetch from 'node-fetch'

let handler = async (m, { conn }) => {
  let q = m.quoted ? m.quoted : m;
  let mime = (q.msg || q).mimetype || '';

  if (!mime) throw '⚠️ Responde a una imagen para convertirla en sticker';
  if (!/image/.test(mime)) throw '⚠️ Solo se aceptan imágenes';

  let media = await q.download();

  let res = await fetch(`https://api.lolhuman.xyz/api/sticker?apikey=TU_API_KEY`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: media
  });

  if (!res.ok) throw 'Error al generar el sticker';
  let buffer = await res.buffer();

  await conn.sendFile(m.chat, buffer, 'sticker.webp', '', m);
};

handler.help = ['sticker'];
handler.tags = ['fun'];
handler.command = ['s', 'sticker'];
handler.register = true;

export default handler;