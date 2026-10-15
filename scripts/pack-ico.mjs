/**
 * Pack PNG files into a Windows .ico with multiple resolutions.
 * Usage: node scripts/pack-ico.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pngDir = path.join(root, 'build', 'icon-png');
const sizes = [16, 24, 32, 48, 64, 128, 256];

function readPngSize(buf) {
  if (buf[0] !== 0x89 || buf[1] !== 0x50) throw new Error('Not a PNG');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function packIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const entries = [];

  for (const png of pngBuffers) {
    const { width, height } = readPngSize(png);
    entries.push({
      width: width >= 256 ? 0 : width,
      height: height >= 256 ? 0 : height,
      bytes: png.length,
      offset,
      png,
    });
    offset += png.length;
  }

  const out = Buffer.alloc(offset);
  // ICONDIR
  out.writeUInt16LE(0, 0); // reserved
  out.writeUInt16LE(1, 2); // type = icon
  out.writeUInt16LE(count, 4);

  for (let i = 0; i < count; i++) {
    const e = entries[i];
    const base = 6 + i * 16;
    out.writeUInt8(e.width, base);
    out.writeUInt8(e.height, base + 1);
    out.writeUInt8(0, base + 2); // color count
    out.writeUInt8(0, base + 3); // reserved
    out.writeUInt16LE(1, base + 4); // planes
    out.writeUInt16LE(32, base + 6); // bit count
    out.writeUInt32LE(e.bytes, base + 8);
    out.writeUInt32LE(e.offset, base + 12);
  }

  for (const e of entries) {
    e.png.copy(out, e.offset);
  }
  return out;
}

const pngs = sizes.map((s) => {
  const p = path.join(pngDir, `icon-${s}.png`);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  return fs.readFileSync(p);
});

const ico = packIco(pngs);
const buildIco = path.join(root, 'build', 'icon.ico');
const electronIco = path.join(root, 'electron', 'assets', 'icon.ico');
fs.mkdirSync(path.dirname(electronIco), { recursive: true });
fs.writeFileSync(buildIco, ico);
fs.writeFileSync(electronIco, ico);
console.log(`Wrote ${buildIco} (${ico.length} bytes)`);
console.log(`Wrote ${electronIco}`);
console.log(`Sizes: ${sizes.join(', ')}`);
