import fs from 'fs';
import chalk from 'chalk';
import { watchFile, unwatchFile } from 'fs';
import { fileURLToPath } from 'url';

const file = fileURLToPath(import.meta.url);
watchFile(file, () => {
  unwatchFile(file);
  console.log(chalk.greenBright("✅ El archivo Config.js fue actualizado y guardado en el servidor con éxito."));
  import(`\( {file}?update= \){Date.now()}`);
});

// #_Bot Manager_#

global.botname = 'Akina Wa Bot';
global.textbot = 'developed by FélixOfc';
global.moneda = 'AkinaCoins';
global.emoji = '✨';
global.ownername = 'Félix ofc';
global.version = '*BETA*';
global.ttag = ['18094374392'];
global.prems = [];

// #_Channel Manager_#

global.newletter = '120363404822730259@newsletter';
global.channelname = 'Akina Wa Channel';

// #_Mood Manager_#

global.jadi = 'Jadibots';
global.sessions = 'Session';
global.Jadibots = true;