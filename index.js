require('./settings');
const { 
    makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore, 
    DisconnectReason, 
    Browsers 
} = require('todleys');
const P = require('pino');
const path = require('path');
const fs = require('fs-extra');
const { createInterface } = require('readline');
const chalk = require('chalk');
const CFonts = require('cfonts');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

global.conns = new Map();

async function startBot(sessionId = 'session_principal', isSubbot = false) {
    const sessionPath = path.join(__dirname, isSubbot ? `subbots/${sessionId}` : sessionId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const conn = makeWASocket({
        version,
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' })),
        },
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: true
    });

    if (!conn.authState.creds.registered) {
        let number = '';
        if (isSubbot) {
            number = sessionId.replace(/[^0-9]/g, '');
        } else {
            number = await question(chalk.cyan('\n[?] Ingresa el número del Bot Principal (ej: 535xxxxxx):\n> '));
            number = number.replace(/[^0-9]/g, '');
        }

        if (number) {
            setTimeout(async () => {
                let code = await conn.requestPairingCode(number);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(chalk.black.bgCyan(`\n[ VINCULACIÓN: ${isSubbot ? 'SUBBOT' : 'PRINCIPAL'} ]\n[ CÓDIGO: ${code} ]\n`));
            }, 3000);
        }
    }

    conn.ev.on('creds.update', saveCreds);

    conn.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                startBot(sessionId, isSubbot);
            } else {
                fs.removeSync(sessionPath);
                if (isSubbot) global.conns.delete(sessionId);
                console.log(chalk.red(`[!] Sesión de ${sessionId} eliminada.`));
            }
        } else if (connection === 'open') {
            if (!isSubbot) {
                process.stdout.write('\x1Bc');
                CFonts.say('BASE-BOT', { font: 'block', align: 'center', colors: ['cyan'] });
                console.log(chalk.green(`\n[+] Principal conectado como: ${conn.user.id.split(':')[0]}`));
                
                const subDir = path.join(__dirname, 'subbots');
                if (fs.existsSync(subDir)) {
                    const folders = fs.readdirSync(subDir);
                    for (const folder of folders) {
                        startBot(folder, true);
                    }
                }
            } else {
                global.conns.set(sessionId, conn);
                console.log(chalk.magenta(`[+] Subbot ${sessionId} conectado.`));
            }
        }
    });

    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m || !m.message) return;
            if (m.key.remoteJid === 'status@broadcast') return;
            
            require('./handler')(conn, m);
        } catch (e) {
            console.error(e);
        }
    });

    return conn;
}

startBot();