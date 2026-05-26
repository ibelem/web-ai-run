// Gravatar requires MD5 of the lowercased trimmed email.
// Minimal MD5 implementation (RFC 1321) — no dependencies.
function md5(str: string): string {
  function safeAdd(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff);
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }
  function bitRotateLeft(num: number, cnt: number) { return (num << cnt) | (num >>> (32 - cnt)); }

  function utf8Encode(s: string): string {
    return unescape(encodeURIComponent(s));
  }

  function strToUint8(s: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return out;
  }

  function md5Core(bytes: number[]): number[] {
    const length8 = bytes.length;
    const extra = (64 - ((length8 + 8) % 64)) % 64;
    bytes.push(0x80);
    for (let i = 0; i < extra; i++) bytes.push(0);
    const bitLen = length8 * 8;
    bytes.push(bitLen & 0xff, (bitLen >> 8) & 0xff, (bitLen >> 16) & 0xff, (bitLen >> 24) & 0xff, 0, 0, 0, 0);

    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

    for (let i = 0; i < bytes.length; i += 64) {
      const M: number[] = [];
      for (let j = 0; j < 16; j++) {
        M[j] = bytes[i + j * 4] | (bytes[i + j * 4 + 1] << 8) | (bytes[i + j * 4 + 2] << 16) | (bytes[i + j * 4 + 3] << 24);
      }
      let [aa, bb, cc, dd] = [a, b, c, d];
      a = md5ff(a,b,c,d,M[0],7,-680876936);   d = md5ff(d,a,b,c,M[1],12,-389564586);  c = md5ff(c,d,a,b,M[2],17,606105819);    b = md5ff(b,c,d,a,M[3],22,-1044525330);
      a = md5ff(a,b,c,d,M[4],7,-176418897);   d = md5ff(d,a,b,c,M[5],12,1200080426);  c = md5ff(c,d,a,b,M[6],17,-1473231341);  b = md5ff(b,c,d,a,M[7],22,-45705983);
      a = md5ff(a,b,c,d,M[8],7,1770035416);   d = md5ff(d,a,b,c,M[9],12,-1958414417); c = md5ff(c,d,a,b,M[10],17,-42063);       b = md5ff(b,c,d,a,M[11],22,-1990404162);
      a = md5ff(a,b,c,d,M[12],7,1804603682);  d = md5ff(d,a,b,c,M[13],12,-40341101);  c = md5ff(c,d,a,b,M[14],17,-1502002290); b = md5ff(b,c,d,a,M[15],22,1236535329);
      a = md5gg(a,b,c,d,M[1],5,-165796510);   d = md5gg(d,a,b,c,M[6],9,-1069501632);  c = md5gg(c,d,a,b,M[11],14,643717713);   b = md5gg(b,c,d,a,M[0],20,-373897302);
      a = md5gg(a,b,c,d,M[5],5,-701558691);   d = md5gg(d,a,b,c,M[10],9,38016083);    c = md5gg(c,d,a,b,M[15],14,-660478335);  b = md5gg(b,c,d,a,M[4],20,-405537848);
      a = md5gg(a,b,c,d,M[9],5,568446438);    d = md5gg(d,a,b,c,M[14],9,-1019803690); c = md5gg(c,d,a,b,M[3],14,-187363961);   b = md5gg(b,c,d,a,M[8],20,1163531501);
      a = md5gg(a,b,c,d,M[13],5,-1444681467); d = md5gg(d,a,b,c,M[2],9,-51403784);    c = md5gg(c,d,a,b,M[7],14,1735328473);   b = md5gg(b,c,d,a,M[12],20,-1926607734);
      a = md5hh(a,b,c,d,M[5],4,-378558);      d = md5hh(d,a,b,c,M[8],11,-2022574463); c = md5hh(c,d,a,b,M[11],16,1839030562);  b = md5hh(b,c,d,a,M[14],23,-35309556);
      a = md5hh(a,b,c,d,M[1],4,-1530992060);  d = md5hh(d,a,b,c,M[4],11,1272893353);  c = md5hh(c,d,a,b,M[7],16,-155497632);   b = md5hh(b,c,d,a,M[10],23,-1094730640);
      a = md5hh(a,b,c,d,M[13],4,681279174);   d = md5hh(d,a,b,c,M[0],11,-358537222);  c = md5hh(c,d,a,b,M[3],16,-722521979);   b = md5hh(b,c,d,a,M[6],23,76029189);
      a = md5hh(a,b,c,d,M[9],4,-640364487);   d = md5hh(d,a,b,c,M[12],11,-421815835); c = md5hh(c,d,a,b,M[15],16,530742520);   b = md5hh(b,c,d,a,M[2],23,-995338651);
      a = md5ii(a,b,c,d,M[0],6,-198630844);   d = md5ii(d,a,b,c,M[7],10,1126891415);  c = md5ii(c,d,a,b,M[14],15,-1416354905); b = md5ii(b,c,d,a,M[5],21,-57434055);
      a = md5ii(a,b,c,d,M[12],6,1700485571);  d = md5ii(d,a,b,c,M[3],10,-1894986606); c = md5ii(c,d,a,b,M[10],15,-1051523);    b = md5ii(b,c,d,a,M[1],21,-2054922799);
      a = md5ii(a,b,c,d,M[8],6,1873313359);   d = md5ii(d,a,b,c,M[15],10,-30611744);  c = md5ii(c,d,a,b,M[6],15,-1560198380);  b = md5ii(b,c,d,a,M[13],21,1309151649);
      a = md5ii(a,b,c,d,M[4],6,-145523070);   d = md5ii(d,a,b,c,M[11],10,-1120210379);c = md5ii(c,d,a,b,M[2],15,718787259);    b = md5ii(b,c,d,a,M[9],21,-343485551);
      a = safeAdd(a, aa); b = safeAdd(b, bb); c = safeAdd(c, cc); d = safeAdd(d, dd);
    }
    return [a, b, c, d];
  }

  function uint32ToHex(n: number): string {
    return ((n & 0xff).toString(16).padStart(2, '0')) +
           (((n >> 8) & 0xff).toString(16).padStart(2, '0')) +
           (((n >> 16) & 0xff).toString(16).padStart(2, '0')) +
           (((n >> 24) & 0xff).toString(16).padStart(2, '0'));
  }

  const bytes = strToUint8(utf8Encode(str));
  const [a, b, c, d] = md5Core(bytes);
  return uint32ToHex(a) + uint32ToHex(b) + uint32ToHex(c) + uint32ToHex(d);
}

export function gravatarUrl(email: string, size = 40): string {
  const hash = md5(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}
