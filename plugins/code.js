const { startBot } = require('../index');

module.exports = {
    command: ['code', 'serbot', 'jadibot'],
    category: 'principal',
    exec: async (m, { conn, isGroup }) => {
        if (isGroup) return m.reply('*[!] Este comando solo puede ser usado en el chat privado del bot.*');

        const userId = m.sender.split('@')[0];
        
        try {
            m.reply('*[ PROCESO ]* Generando tu código de vinculación. Por favor, espera...');
            
            const subBotConn = await startBot(userId, true);

            subBotConn.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    await conn.sendMessage(m.sender, { text: '*[ ✓ ] ¡Vinculación exitosa!* Ahora eres un subbot oficial.' });
                }

                if (connection === 'close') {
                    const reason = lastDisconnect?.error?.output?.statusCode;
                    if (reason === 401) {
                        await conn.sendMessage(m.sender, { text: '*[!] Error:* La sesión fue cerrada desde WhatsApp. Intenta de nuevo.' });
                    }
                }
            });

        } catch (e) {
            console.error(e);
            m.reply('*[ ERROR ]* No se pudo generar el código. Inténtalo más tarde.');
        }
    }
};