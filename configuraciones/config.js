import { watchFile, unwatchFile } from 'fs';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import fs from 'fs';

const file = fileURLToPath(import.meta.url);
watchFile(file, () => {
  unwatchFile(file);
  console.log(chalk.greenBright("✅ Archivo 'config.js' actualizado y recargado automáticamente."));
  import(`\( {file}?update= \){Date.now()}`);
});

// Enlaces y canales
global.group = 'https://chat.whatsapp.com/Ht5ck9c1Eji2TRBXSkTHjY';
global.community = 'https://whatsapp.com/channel/0029VbBkjlfLSmbWl3SH6737';
global.channel = 'https://whatsapp.com/channel/0029VbBkjlfLSmbWl3SH6737';
global.github = 'https://github.com/Dev-FelixOfc/AkinaWa-Bot'; 
global.gmail = 'xlfelixgamer@gmail.com'; // Actualiza con tu email real

// Canales de newsletter
global.ch = {
  ch1: '120363421036863665@newsletter',
};

// APIs disponibles (con URLs y keys si es necesario)
global.APIs = {
  xyro: { url: 'https://xyro.site', key: null },
  yupra: { url: 'https://api.yupra.my.id', key: null },
  vreden: { url: 'https://api.vreden.web.id', key: null },
  delirius: { url: 'https://api.delirius.store', key: null },
  zenzxz: { url: 'https://api.zenzxz.my.id', key: null },
  siputzx: { url: 'https://api.siputzx.my.id', key: null },
};

// Dueños del bot (números de teléfono como strings en array)
global.owner = [
  '573107400303',
  '18094374392',
  '18293527611',
];

// Nombres y textos personalizados
global.botname = 'Akina Wa Bot';
global.textbot = '𝓓𝓮𝓿𝓮𝓵𝓸𝓹𝓮𝓭 𝓫𝔂 Félix';
global.dev = 'Made With ❤️ by Félix';
global.author = 'Made With ❤️ by Félix';
global.etiqueta = 'Félix Ofc';
global.currency = 'Akina Coins';
global.emoji = '🌪️';

// Etiquetas y usuarios premium
global.suittag = ['18293527611']; // Reemplaza el placeholder con números reales
global.prems = []; // Array vacío para usuarios premium (agrega según necesites)

// Assets y configuraciones visuales
global.banner = 'https://felixproyects.ooguy.com/AkinaWa-Bot.jpg';
global.icono = 'https://felixproyects.ooguy.com/AkinaWa-Bot.jpg';
global.catalogo = null;

// Otras configuraciones
global.libreria = 'Baileys Multi Device';
global.vs = '1.0';
global.nameqr = 'Akina Wa Bot';
global.sessions = 'Session';
global.jadi = 'JadiBots';
global.Jadibots = true; // Asumiendo que es 'Jadibots', corrígelo si es un typo