/**
 * Generates tray icon PNG buffers programmatically.
 * No external image files required.
 */

const zlib = require('zlib');

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
		t[i] = c;
	}
	return t;
})();

function crc32(buf) {
	let c = 0xFFFFFFFF;
	for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
	return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
	const typeBuf = Buffer.from(type, 'ascii');
	const lenBuf = Buffer.allocUnsafe(4);
	lenBuf.writeUInt32BE(data.length);
	const crcBuf = Buffer.allocUnsafe(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
	return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makeCirclePng(r, g, b, size = 16) {
	const rowLen = 1 + size * 4;
	const raw = Buffer.alloc(size * rowLen, 0);
	const center = (size - 1) / 2;
	const radius = size / 2 - 1.5;

	for (let y = 0; y < size; y++) {
		raw[y * rowLen] = 0;
		for (let x = 0; x < size; x++) {
			const dx = x - center, dy = y - center;
			if (dx * dx + dy * dy <= radius * radius) {
				const i = y * rowLen + 1 + x * 4;
				raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
			}
		}
	}

	const compressed = zlib.deflateSync(raw);
	const ihdr = Buffer.alloc(13, 0);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, RGBA

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
		pngChunk('IHDR', ihdr),
		pngChunk('IDAT', compressed),
		pngChunk('IEND', Buffer.alloc(0)),
	]);
}

// Pre-built icons for each connection state
const ICONS = {
	connected:    makeCirclePng(76,  175, 80),   // green
	connecting:   makeCirclePng(255, 193, 7),    // amber
	disconnected: makeCirclePng(244, 67,  54),   // red
};

module.exports = { ICONS };
