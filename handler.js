const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { database } = require('@Dev-FelixOfc/databaselib');

module.exports = async (conn, m) => {
    try {
        if (m.key.remoteJid === 'status@broadcast') return;

        const body = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || '').trim();
        const isCommand = global.prefix.test(body);
        const prefix = isCommand ? body.match(global.prefix)[0] : '';
        const command = isCommand ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const text = args.join(' ');
        
        const from = m.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const sender = isGroup ? m.key.participant : m.key.remoteJid;
        const pushname = m.pushName || 'Usuario';
        
        const groupMetadata = isGroup ? await conn.groupMetadata(from).catch(() => ({})) : {};
        const participants = isGroup ? groupMetadata.participants : [];
        const admins = isGroup ? participants.filter(v => v.admin !== null).map(v => v.id) : [];
        
        const isOwner = global.owner.some(o => o[0] + '@s.whatsapp.net' === sender) || m.key.fromMe;
        const isAdmin = isGroup ? admins.includes(sender) : false;
        const isBotAdmin = isGroup ? admins.includes(conn.user.id.split(':')[0] + '@s.whatsapp.net') : false;

        m.reply = async (text) => {
            return conn.sendMessage(from, { text: text }, { quoted: m });
        };

        const pluginsPath = path.join(__dirname, 'plugins');
        const pluginFiles = fs.readdirSync(pluginsPath).filter(file => file.endsWith('.js'));

        for (let file of pluginFiles) {
            const plugin = require(path.join(pluginsPath, file));
            
            const isMatch = Array.isArray(plugin.command) 
                ? plugin.command.includes(command) 
                : plugin.command === command;

            if (isMatch && isCommand) {
                
                if (plugin.rowner && !isOwner) {
                    return m.reply(global.settings.owner);
                }
                
                if (plugin.group && !isGroup) {
                    return m.reply(global.settings.group);
                }

                if (plugin.admin && !isAdmin) {
                    return m.reply(global.settings.admin);
                }

                if (plugin.botAdmin && !isBotAdmin) {
                    return m.reply('Necesito ser administrador para ejecutar este comando.');
                }

                try {
                    await plugin.exec(m, { 
                        conn, 
                        args, 
                        text, 
                        prefix, 
                        command, 
                        isGroup, 
                        sender, 
                        pushname,
                        isAdmin,
                        isBotAdmin,
                        isOwner,
                        participants,
                        groupMetadata
                    });
                } catch (e) {
                    console.error(chalk.red(`Error en plugin: ${file}`), e);
                    m.reply('Ocurrió un error al ejecutar el comando.');
                }
                return;
            }
        }

        if (isGroup && global.db?.data?.chats?.[from]?.antilink) {
            if (body.includes('chat.whatsapp.com') && !isAdmin) {
                await conn.sendMessage(from, { delete: m.key });
                await conn.groupParticipantsUpdate(from, [sender], 'remove');
            }
        }

    } catch (e) {
        console.error(chalk.red('[HANDLER ERROR]'), e);
    }
};

let file = require.resolve(__filename);
fs.watchFile(file, () => {
    fs.unwatchFile(file);
    console.log(chalk.yellowBright(`Update 'handler.js'`));
    delete require.cache[file];
    require(file);
});
