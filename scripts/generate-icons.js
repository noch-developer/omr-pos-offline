import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

// CRC32 implementation
function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(len + 12);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, len + 8);
  chunk.writeUInt32BE(crc32(typeAndData), len + 8);
  return chunk;
}

function createPng(size, text = 'OMR') {
  // Raw RGBA pixel rows (each row begins with filter byte 0)
  const rowBytes = size * 4;
  const rawData = Buffer.alloc((rowBytes + 1) * size);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.44; // corner radius or circle

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (rowBytes + 1);
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Rounded rectangle background
      const dx = Math.max(0, Math.abs(x - cx) - (size * 0.35));
      const dy = Math.max(0, Math.abs(y - cy) - (size * 0.35));
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isInsideCard = dist <= (size * 0.12);

      if (!isInsideCard) {
        // Transparent
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
        continue;
      }

      // Emerald green #16a34a
      let red = 22;
      let green = 163;
      let blue = 74;

      // Draw simple store / circle icon in white in center
      const dCenter = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (Math.abs(dCenter - size * 0.22) < size * 0.035) {
        // White circular outline
        red = 255;
        green = 255;
        blue = 255;
      } else if (dCenter < size * 0.08) {
        // White center dot
        red = 255;
        green = 255;
        blue = 255;
      } else if (y > size * 0.58 && y < size * 0.65 && Math.abs(x - cx) < size * 0.18) {
        // White horizontal base bar
        red = 255;
        green = 255;
        blue = 255;
      }

      rawData[pxOffset] = red;
      rawData[pxOffset + 1] = green;
      rawData[pxOffset + 2] = blue;
      rawData[pxOffset + 3] = 255;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10); // compression deflate
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // IDAT (compressed)
  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), createPng(32));

console.log('PNG icons created successfully in public directory!');

