import {promises} from 'fs';
import {join} from 'path';
import {spawn} from 'child_process';

function ffmpeg(buffer, args = [], ext = '', ext2 = '') {
  return new Promise(async (resolve, reject) => {
    try {
      const temporal = join(globalThis.__dirname(import.meta.url), './temporal', + new Date + '.' + ext);
      const out = temporal + '.' + ext2;
      await promises.writeFile(temporal, buffer);
      spawn('ffmpeg', [
        '-y',
        '-i', temporal,
        ...args,
        out,
      ])
          .on('error', reject)
          .on('close', async (code) => {
            try {
              await promises.unlink(temporal);
              if (code !== 0) return reject(code);
              resolve({
                data: await promises.readFile(out),
                filename: out,
                delete() {
                  return promises.unlink(out);
                },
              });
            } catch (e) {
              reject(e);
            }
          });
    } catch (e) {
      reject(e);
    }
  });
}

function toPTT(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-vbr', 'on',
  ], ext, 'ogg');
}

function toAudio(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-vbr', 'on',
    '-compression_level', '10',
  ], ext, 'opus');
}

function toVideo(buffer, ext) {
  return ffmpeg(buffer, [
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-ab', '128k',
    '-ar', '44100',
    '-crf', '32',
    '-preset', 'slow',
  ], ext, 'mp4');
}

export {
  toAudio,
  toPTT,
  toVideo,
  ffmpeg,
};