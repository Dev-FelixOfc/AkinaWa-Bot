module.exports = {
    command: ['antilink', 'antienlace'],
    category: 'admin',
    group: true,
    admin: true,
    botAdmin: true,
    exec: async (m, { text, args, isGroup }) => {
        if (!global.db.data.chats[m.chat]) global.db.data.chats[m.chat] = {};
        
        if (!args[0]) return m.reply(`*[!] Uso incorrecto.*\n\nEjemplo:\n#antilink on\n#antilink off`);

        if (args[0] === 'on') {
            if (global.db.data.chats[m.chat].antilink) return m.reply('*[!] El Anti-Link ya estaba activo en este grupo.*');
            global.db.data.chats[m.chat].antilink = true;
            m.reply('*[ ✓ ] Anti-Link activado correctamente.*\n\nCualquier usuario (no admin) que envíe enlaces será eliminado inmediatamente.');
        } else if (args[0] === 'off') {
            if (!global.db.data.chats[m.chat].antilink) return m.reply('*[!] El Anti-Link ya estaba desactivado.*');
            global.db.data.chats[m.chat].antilink = false;
            m.reply('*[ ✓ ] Anti-Link desactivado.*');
        } else {
            m.reply('*[!] Opción no válida. Usa "on" o "off".*');
        }
    }
};