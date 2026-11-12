// Minimal animated GIF89a encoder (LZW). Pure TypeScript, no dependencies: runs in Node and in the browser.
// Frames are palette-indexed (Uint8Array of width*height); the palette is shared by all frames.

export class GifEncoder {
  private out: number[] = [];

  constructor(readonly width: number, readonly height: number, readonly palette: [number, number, number][], loop = true) {
    if (palette.length < 2 || palette.length > 256) throw new Error('palette must have 2..256 colors');
    const bits = Math.max(1, Math.ceil(Math.log2(palette.length)));
    const size = 1 << bits;
    this.ascii('GIF89a');
    this.u16(width);
    this.u16(height);
    this.out.push(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0); // global color table, bg 0, aspect 0
    for (let i = 0; i < size; i++) {
      const c = palette[i] ?? [0, 0, 0];
      this.out.push(c[0] & 255, c[1] & 255, c[2] & 255);
    }
    if (loop) {
      this.out.push(0x21, 0xff, 0x0b);
      this.ascii('NETSCAPE2.0');
      this.out.push(0x03, 0x01, 0, 0, 0);
    }
    this.bits = bits;
  }
  private bits: number;

  /** Add a frame. `delayMs` is rounded to GIF's 10ms units. */
  addFrame(indexed: Uint8Array, delayMs = 80) {
    if (indexed.length !== this.width * this.height) throw new Error('frame size mismatch');
    const delay = Math.max(2, Math.round(delayMs / 10));
    this.out.push(0x21, 0xf9, 0x04, 0x00);
    this.u16(delay);
    this.out.push(0, 0);
    this.out.push(0x2c);
    this.u16(0);
    this.u16(0);
    this.u16(this.width);
    this.u16(this.height);
    this.out.push(0);
    const minCode = Math.max(2, this.bits);
    this.out.push(minCode);
    const data = lzw(indexed, minCode);
    for (let i = 0; i < data.length; i += 255) {
      const n = Math.min(255, data.length - i);
      this.out.push(n);
      for (let k = 0; k < n; k++) this.out.push(data[i + k]);
    }
    this.out.push(0);
  }

  finish(): Uint8Array {
    this.out.push(0x3b);
    return Uint8Array.from(this.out);
  }

  private u16(v: number) {
    this.out.push(v & 255, (v >> 8) & 255);
  }
  private ascii(s: string) {
    for (let i = 0; i < s.length; i++) this.out.push(s.charCodeAt(i));
  }
}

function lzw(pixels: Uint8Array, minCode: number): number[] {
  const clear = 1 << minCode;
  const eoi = clear + 1;
  const out: number[] = [];
  let cur = 0;
  let curBits = 0;
  let codeSize = minCode + 1;
  const emit = (code: number) => {
    cur |= code << curBits;
    curBits += codeSize;
    while (curBits >= 8) {
      out.push(cur & 255);
      cur >>>= 8;
      curBits -= 8;
    }
  };
  let dict = new Map<number, number>();
  let next = eoi + 1;
  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << codeSize && codeSize < 12) codeSize++;
    } else {
      emit(clear);
      dict = new Map();
      next = eoi + 1;
      codeSize = minCode + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (curBits > 0) out.push(cur & 255);
  return out;
}
