import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const payload = Buffer.concat([name, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  payload.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(payload), 8 + data.length);
  return chunk;
}

function makeIcon(size) {
  const rowLength = 1 + size * 4;
  const raw = Buffer.alloc(rowLength * size);
  const center = size / 2;
  const radius = size * 0.34;
  const circleWidth = Math.max(2, size * 0.025);
  const corner = size * 0.22;
  const bg = [18, 59, 50, 255];
  const mint = [143, 208, 176, 255];
  const white = [255, 255, 255, 255];

  for (let y = 0; y < size; y++) {
    const row = y * rowLength;
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let inside = true;
      const cx = x < corner ? corner : x >= size - corner ? size - corner - 1 : x;
      const cy = y < corner ? corner : y >= size - corner ? size - corner - 1 : y;
      if ((x < corner || x >= size - corner) && (y < corner || y >= size - corner)) {
        inside = Math.hypot(x - cx, y - cy) <= corner;
      }
      if (!inside) continue;

      const distance = Math.hypot(x - center, y - center);
      let color = bg;
      if (Math.abs(distance - radius) <= circleWidth / 2) color = mint;
      const vertical = Math.abs(x - center) <= size * 0.035 && y >= size * 0.17 && y <= size * 0.83;
      const horizontal = x >= size * 0.33 && x <= size * 0.67 && y >= size * 0.36 && y <= size * 0.43;
      if (vertical || horizontal) color = white;

      const offset = row + 1 + x * 4;
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      raw[offset + 3] = color[3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

mkdirSync("public", { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icon-${size}.png`, makeIcon(size));
}
