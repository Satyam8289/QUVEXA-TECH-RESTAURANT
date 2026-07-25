/* ============================================================
   Self-contained QR Code generator
   ------------------------------------------------------------
   Byte mode · Error-correction level M · Versions 1–10
   (capacity up to 213 bytes — plenty for a menu URL).
   Faithful implementation of the QR Model-2 standard: Galois-
   field(256) Reed–Solomon ECC, function-pattern placement,
   BCH format/version info, mask evaluation. No dependencies.
   Exposes: window.QR.encode(text) and window.QR.toSVG(text, opts)
   ============================================================ */

window.QR = (function () {
  /* ---------- Galois field GF(256) ---------- */
  const EXP = new Array(256), LOG = new Array(256);
  for (let i = 0; i < 8; i++) EXP[i] = 1 << i;
  for (let i = 8; i < 256; i++) EXP[i] = EXP[i - 4] ^ EXP[i - 5] ^ EXP[i - 6] ^ EXP[i - 8];
  for (let i = 0; i < 255; i++) LOG[EXP[i]] = i;
  const gexp = (n) => { while (n < 0) n += 255; while (n >= 256) n -= 255; return EXP[n]; };
  const glog = (n) => LOG[n];

  /* ---------- Reed–Solomon ---------- */
  function ecPolynomial(deg) {
    let p = [1];
    for (let i = 0; i < deg; i++) {
      const next = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) {
        next[j] ^= p[j];
        next[j + 1] ^= gexp(glog(p[j]) + i);
      }
      p = next;
    }
    return p;
  }
  function rsEncode(data, ecLen) {
    const gen = ecPolynomial(ecLen);
    const res = data.concat(new Array(ecLen).fill(0));
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        const lc = glog(coef);
        for (let j = 0; j < gen.length; j++) res[i + j] ^= gexp(glog(gen[j]) + lc);
      }
    }
    return res.slice(data.length);
  }

  /* ---------- Version tables (EC level M) ---------- */
  // Each entry: repeating triplets [blockCount, totalCodewords, dataCodewords]
  const RS_M = [
    [1, 26, 16], [1, 44, 28], [1, 70, 44], [2, 50, 32], [2, 67, 43],
    [4, 43, 27], [4, 49, 31], [2, 60, 38, 2, 61, 39],
    [3, 58, 36, 2, 59, 37], [4, 69, 43, 1, 70, 44],
  ];
  const ALIGN = [
    [], [6, 18], [6, 22], [6, 26], [6, 30],
    [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  ];

  function rsBlocks(v) {
    const a = RS_M[v - 1], blocks = [];
    for (let i = 0; i < a.length; i += 3)
      for (let k = 0; k < a[i]; k++) blocks.push({ total: a[i + 1], data: a[i + 2] });
    return blocks;
  }
  const dataCodewords = (v) => rsBlocks(v).reduce((s, b) => s + b.data, 0);

  /* ---------- BCH format & version info ---------- */
  const G15 = 0b10100110111, G18 = 0b1111100100101, G15_MASK = 0b101010000010010;
  const bchDigit = (d) => { let n = 0; while (d !== 0) { n++; d >>>= 1; } return n; };
  function bchTypeInfo(data) {
    let d = data << 10;
    while (bchDigit(d) - bchDigit(G15) >= 0) d ^= G15 << (bchDigit(d) - bchDigit(G15));
    return ((data << 10) | d) ^ G15_MASK;
  }
  function bchVersion(data) {
    let d = data << 12;
    while (bchDigit(d) - bchDigit(G18) >= 0) d ^= G18 << (bchDigit(d) - bchDigit(G18));
    return (data << 12) | d;
  }

  /* ---------- Data encoding ---------- */
  function toBytes(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 128) out.push(c);
      else if (c < 2048) { out.push(192 | (c >> 6), 128 | (c & 63)); }
      else { out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63)); }
    }
    return out;
  }
  function pickVersion(len) {
    for (let v = 1; v <= 10; v++) {
      const header = 4 + (v < 10 ? 8 : 16);
      if (header + len * 8 <= dataCodewords(v) * 8) return v;
    }
    throw new Error("Data too long for QR (max version 10).");
  }
  function createData(v, bytes) {
    const bits = [];
    const put = (num, len) => { for (let i = 0; i < len; i++) bits.push((num >>> (len - 1 - i)) & 1); };
    put(4, 4);                          // byte mode
    put(bytes.length, v < 10 ? 8 : 16); // char count
    bytes.forEach((b) => put(b, 8));
    const capacity = dataCodewords(v) * 8;
    if (bits.length + 4 <= capacity) put(0, 4);      // terminator
    while (bits.length % 8 !== 0) bits.push(0);      // byte align
    const pad = [0xEC, 0x11];
    for (let i = 0; bits.length < capacity; i++) put(pad[i % 2], 8);
    const cw = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      cw.push(b);
    }
    return cw;
  }
  function interleave(v, dataCW) {
    const blocks = rsBlocks(v);
    let offset = 0; const dc = [], ec = []; let maxDc = 0, maxEc = 0;
    blocks.forEach((b) => {
      const d = dataCW.slice(offset, offset + b.data); offset += b.data;
      const e = rsEncode(d, b.total - b.data);
      dc.push(d); ec.push(e);
      maxDc = Math.max(maxDc, d.length); maxEc = Math.max(maxEc, e.length);
    });
    const out = [];
    for (let i = 0; i < maxDc; i++) dc.forEach((d) => { if (i < d.length) out.push(d[i]); });
    for (let i = 0; i < maxEc; i++) ec.forEach((e) => { if (i < e.length) out.push(e[i]); });
    return out;
  }

  /* ---------- Mask ---------- */
  function maskFn(p, i, j) {
    switch (p) {
      case 0: return (i + j) % 2 === 0;
      case 1: return i % 2 === 0;
      case 2: return j % 3 === 0;
      case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
      case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
      case 7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
    }
  }

  /* ---------- Matrix building ---------- */
  function buildMatrix(v, all, mask, test) {
    const n = v * 4 + 17;
    const m = Array.from({ length: n }, () => new Array(n).fill(null));

    const probe = (row, col) => {
      for (let r = -1; r <= 7; r++) {
        if (row + r <= -1 || n <= row + r) continue;
        for (let c = -1; c <= 7; c++) {
          if (col + c <= -1 || n <= col + c) continue;
          m[row + r][col + c] =
            (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
            (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        }
      }
    };
    probe(0, 0); probe(n - 7, 0); probe(0, n - 7);

    // Alignment patterns
    const pos = ALIGN[v - 1];
    for (let i = 0; i < pos.length; i++)
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i], col = pos[j];
        if (m[row][col] !== null) continue;
        for (let r = -2; r <= 2; r++)
          for (let c = -2; c <= 2; c++)
            m[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
      }

    // Timing patterns
    for (let r = 8; r < n - 8; r++) if (m[r][6] === null) m[r][6] = r % 2 === 0;
    for (let c = 8; c < n - 8; c++) if (m[6][c] === null) m[6][c] = c % 2 === 0;

    // Format info (EC level M = 0)
    const fbits = bchTypeInfo((0 << 3) | mask);
    for (let i = 0; i < 15; i++) {
      const bit = !test && ((fbits >> i) & 1) === 1;
      if (i < 6) m[i][8] = bit; else if (i < 8) m[i + 1][8] = bit; else m[n - 15 + i][8] = bit;
    }
    for (let i = 0; i < 15; i++) {
      const bit = !test && ((fbits >> i) & 1) === 1;
      if (i < 8) m[8][n - i - 1] = bit; else if (i < 9) m[8][15 - i - 1 + 1] = bit; else m[8][15 - i - 1] = bit;
    }
    m[n - 8][8] = !test; // dark module

    // Version info (v7+)
    if (v >= 7) {
      const vbits = bchVersion(v);
      for (let i = 0; i < 18; i++) {
        const bit = !test && ((vbits >> i) & 1) === 1;
        m[Math.floor(i / 3)][(i % 3) + n - 8 - 3] = bit;
        m[(i % 3) + n - 8 - 3][Math.floor(i / 3)] = bit;
      }
    }

    // Data placement (zig-zag) + mask
    let inc = -1, row = n - 1, bitIndex = 7, byteIndex = 0;
    for (let col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (let c = 0; c < 2; c++) {
          if (m[row][col - c] === null) {
            let dark = false;
            if (byteIndex < all.length) dark = ((all[byteIndex] >>> bitIndex) & 1) === 1;
            if (maskFn(mask, row, col - c)) dark = !dark;
            m[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || n <= row) { row -= inc; inc = -inc; break; }
      }
    }
    return m;
  }

  /* ---------- Mask penalty ---------- */
  function lostPoint(m) {
    const n = m.length; let lost = 0;
    for (let row = 0; row < n; row++)
      for (let col = 0; col < n; col++) {
        let same = 0; const dark = m[row][col];
        for (let r = -1; r <= 1; r++) {
          if (row + r < 0 || n <= row + r) continue;
          for (let c = -1; c <= 1; c++) {
            if (col + c < 0 || n <= col + c || (r === 0 && c === 0)) continue;
            if (dark === m[row + r][col + c]) same++;
          }
        }
        if (same > 5) lost += 3 + same - 5;
      }
    for (let row = 0; row < n - 1; row++)
      for (let col = 0; col < n - 1; col++) {
        let count = 0;
        if (m[row][col]) count++; if (m[row + 1][col]) count++;
        if (m[row][col + 1]) count++; if (m[row + 1][col + 1]) count++;
        if (count === 0 || count === 4) lost += 3;
      }
    for (let row = 0; row < n; row++)
      for (let col = 0; col < n - 6; col++)
        if (m[row][col] && !m[row][col + 1] && m[row][col + 2] && m[row][col + 3] && m[row][col + 4] && !m[row][col + 5] && m[row][col + 6]) lost += 40;
    for (let col = 0; col < n; col++)
      for (let row = 0; row < n - 6; row++)
        if (m[row][col] && !m[row + 1][col] && m[row + 2][col] && m[row + 3][col] && m[row + 4][col] && !m[row + 5][col] && m[row + 6][col]) lost += 40;
    let dark = 0;
    for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) if (m[row][col]) dark++;
    lost += Math.abs((100 * dark) / (n * n) - 50) / 5 * 10;
    return lost;
  }

  /* ---------- Public API ---------- */
  function encode(text) {
    const bytes = toBytes(String(text));
    const v = pickVersion(bytes.length);
    const all = interleave(v, createData(v, bytes));
    let best = 0, min = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const lp = lostPoint(buildMatrix(v, all, mask, true));
      if (lp < min) { min = lp; best = mask; }
    }
    const modules = buildMatrix(v, all, best, false);
    return { size: modules.length, modules, version: v, mask: best };
  }

  function toSVG(text, opts = {}) {
    const qr = encode(text);
    const n = qr.size, quiet = opts.quiet ?? 4, dim = n + quiet * 2;
    const fg = opts.color || "#0a3d28", bg = opts.bg || "#ffffff", w = opts.width || 220;
    let path = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.modules[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${w}" height="${w}" shape-rendering="crispEdges" role="img">` +
      `<rect width="${dim}" height="${dim}" fill="${bg}"/><path d="${path}" fill="${fg}"/></svg>`;
  }

  return { encode, toSVG };
})();
