// Deterministic elementary functions: a pure-JavaScript port of fdlibm, bit-for-bit identical to
// the fdlibm code that V8 (Node) uses for its Math functions (v8/src/base/ieee754.cc, V8 12.4).
// Only +, -, *, /, comparisons, sqrt and the raw bits of a Float64 (via DataView) are used, so
// every engine yields exactly the same results.
//
// Exports: sin cos tan asin acos atan atan2 exp expm1 log log1p log2 log10 sinh cosh tanh
//          asinh acosh atanh cbrt pow
//
// The algorithms and constants are taken from fdlibm (http://www.netlib.org/fdlibm) as adapted
// in V8 (src/base/ieee754.cc). Original license notices:
//
// ====================================================
// Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
//
// Developed at SunSoft, a Sun Microsystems, Inc. business.
// Permission to use, copy, modify, and distribute this
// software is freely granted, provided that this notice
// is preserved.
// ====================================================
//
// The V8 adaptation is Copyright 2016 the V8 project authors (BSD-style license).
//
// Notes on parity with V8:
//  - pow follows V8's variant of e_pow.c (e.g. pow(+-1, +-Infinity) is NaN, as in ECMAScript).
//  - sin/cos are the fdlibm versions; V8 builds that route sine and cosine to the system libm
//    (flag use_libm_trig_functions) may differ in the last bit for some inputs.

// ---------------------------------------------------------------------------------------------
// Bit access helpers (big-endian DataView; independent of the host byte order)

const dv = new DataView(new ArrayBuffer(8));

/** High 32 bits of a double as a signed int. @param {number} x @returns {number} */
function hiw(x) {
  dv.setFloat64(0, x);
  return dv.getInt32(0);
}

/** Low 32 bits of a double as an unsigned int. @param {number} x @returns {number} */
function low(x) {
  dv.setFloat64(0, x);
  return dv.getUint32(4);
}

/** Replace the high word. @param {number} x @param {number} h @returns {number} */
function setHi(x, h) {
  dv.setFloat64(0, x);
  dv.setInt32(0, h | 0);
  return dv.getFloat64(0);
}

/** Replace the low word. @param {number} x @param {number} l @returns {number} */
function setLo(x, l) {
  dv.setFloat64(0, x);
  dv.setUint32(4, l >>> 0);
  return dv.getFloat64(0);
}

/** Build a double from its two words. @param {number} h @param {number} l @returns {number} */
function mk(h, l) {
  dv.setInt32(0, h | 0);
  dv.setUint32(4, l >>> 0);
  return dv.getFloat64(0);
}

/** 2^n for n in [-1022, 1023]. @param {number} n @returns {number} */
function pow2(n) {
  return mk((n + 1023) << 20, 0);
}

/**
 * x * 2^n, correctly rounded (also into the subnormal range).
 * @param {number} x
 * @param {number} n
 * @returns {number}
 */
function scalbn(x, n) {
  if (n > 1023) {
    x *= 8.98846567431158e307; // 2^1023
    n -= 1023;
    if (n > 1023) {
      x *= 8.98846567431158e307;
      n -= 1023;
      if (n > 1023) n = 1023;
    }
  } else if (n < -1022) {
    // 2^-1022 * 2^53 keeps the intermediate steps free of double rounding
    x *= 2.2250738585072014e-308 * 9007199254740992;
    n += 1022 - 53;
    if (n < -1022) {
      x *= 2.2250738585072014e-308 * 9007199254740992;
      n += 1022 - 53;
      if (n < -1022) n = -1022;
    }
  }
  return x * pow2(n);
}

const TWO24 = 1.6777216e7;
const TWON24 = 5.9604644775390625e-8;

// ---------------------------------------------------------------------------------------------
// Argument reduction

const TWO_OVER_PI = [
  0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C,
  0x439041, 0xFE5163, 0xABDEBB, 0xC561B7, 0x246E3A, 0x424DD2, 0xE00649,
  0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44,
  0x84E99C, 0x7026B4, 0x5F7E41, 0x3991D6, 0x398353, 0x39F49C, 0x845F8B,
  0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D,
  0x367ECF, 0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5,
  0xF17B3D, 0x0739F7, 0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08, 0x560330,
  0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E, 0xE61B08,
  0x659985, 0x5F14A0, 0x68408D, 0xFFD880, 0x4D7327, 0x310606, 0x1556CA,
  0x73A8C9, 0x60E27B, 0xC08C6B,
];

const NPIO2_HW = [
  0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C,
  0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C,
  0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A,
  0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
  0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
  0x404858EB, 0x404921FB,
];

const PIO2 = [
  1.57079625129699707031e+00,
  7.54978941586159635335e-08,
  5.39030252995776476554e-15,
  3.28200341580791294123e-22,
  1.27065575308067607349e-29,
  1.22933308981111328932e-36,
  2.73370053816464559624e-44,
  2.16741683877804819444e-51,
];

const INIT_JK = [2, 3, 4, 6];

// scratch arrays (the functions are not re-entrant, which is fine for synchronous JS)
const Y = new Float64Array(2);
const TX = new Float64Array(3);
const IQ = new Int32Array(20);
const F = new Float64Array(20);
const FQ = new Float64Array(20);
const Q = new Float64Array(20);

/**
 * __kernel_rem_pio2 for prec = 2 (the only use): y[0..1] = x*2^e0 - N*pi/2, returns N mod 8.
 * @param {Float64Array} x
 * @param {Float64Array} y
 * @param {number} e0
 * @param {number} nx
 * @returns {number}
 */
function kernelRemPio2(x, y, e0, nx) {
  const prec = 2;
  const jk = INIT_JK[prec];
  const jp = jk;
  const iq = IQ, f = F, fq = FQ, q = Q;
  let i, j, k, n, ih, z, fw;

  const jx = nx - 1;
  let jv = ((e0 - 3) / 24) | 0;
  if (jv < 0) jv = 0;
  let q0 = e0 - 24 * (jv + 1);

  j = jv - jx;
  const m = jx + jk;
  for (i = 0; i <= m; i++, j++) f[i] = j < 0 ? 0 : TWO_OVER_PI[j];

  for (i = 0; i <= jk; i++) {
    for (j = 0, fw = 0.0; j <= jx; j++) fw += x[j] * f[jx + i - j];
    q[i] = fw;
  }

  let jz = jk;
  for (;;) {
    // distill q[] into iq[] reversingly
    for (i = 0, j = jz, z = q[jz]; j > 0; i++, j--) {
      fw = (TWON24 * z) | 0;
      iq[i] = (z - TWO24 * fw) | 0;
      z = q[j - 1] + fw;
    }

    // compute n
    z = scalbn(z, q0);
    z -= 8.0 * Math.floor(z * 0.125);
    n = z | 0;
    z -= n;
    ih = 0;
    if (q0 > 0) {
      i = iq[jz - 1] >> (24 - q0);
      n += i;
      iq[jz - 1] -= i << (24 - q0);
      ih = iq[jz - 1] >> (23 - q0);
    } else if (q0 === 0) {
      ih = iq[jz - 1] >> 23;
    } else if (z >= 0.5) {
      ih = 2;
    }

    if (ih > 0) {
      n += 1;
      let carry = 0;
      for (i = 0; i < jz; i++) {
        j = iq[i];
        if (carry === 0) {
          if (j !== 0) {
            carry = 1;
            iq[i] = 0x1000000 - j;
          }
        } else {
          iq[i] = 0xffffff - j;
        }
      }
      if (q0 > 0) {
        switch (q0) {
          case 1:
            iq[jz - 1] &= 0x7fffff;
            break;
          case 2:
            iq[jz - 1] &= 0x3fffff;
            break;
        }
      }
      if (ih === 2) {
        z = 1.0 - z;
        if (carry !== 0) z -= scalbn(1.0, q0);
      }
    }

    // check if recomputation is needed
    if (z === 0) {
      j = 0;
      for (i = jz - 1; i >= jk; i--) j |= iq[i];
      if (j === 0) {
        for (k = 1; jk >= k && iq[jk - k] === 0; k++) {
          // k = number of terms needed
        }
        for (i = jz + 1; i <= jz + k; i++) {
          f[jx + i] = TWO_OVER_PI[jv + i];
          for (j = 0, fw = 0.0; j <= jx; j++) fw += x[j] * f[jx + i - j];
          q[i] = fw;
        }
        jz += k;
        continue;
      }
    }
    break;
  }

  // chop off zero terms
  if (z === 0.0) {
    jz -= 1;
    q0 -= 24;
    while (iq[jz] === 0) {
      jz--;
      q0 -= 24;
    }
  } else {
    z = scalbn(z, -q0);
    if (z >= TWO24) {
      fw = (TWON24 * z) | 0;
      iq[jz] = (z - TWO24 * fw) | 0;
      jz += 1;
      q0 += 24;
      iq[jz] = fw;
    } else {
      iq[jz] = z | 0;
    }
  }

  // convert integer "bit" chunk to floating-point value
  fw = scalbn(1.0, q0);
  for (i = jz; i >= 0; i--) {
    q[i] = fw * iq[i];
    fw *= TWON24;
  }

  // compute PIo2[0,...,jp]*q[jz,...,0]
  for (i = jz; i >= 0; i--) {
    for (fw = 0.0, k = 0; k <= jp && k <= jz - i; k++) fw += PIO2[k] * q[i + k];
    fq[jz - i] = fw;
  }

  // compress fq[] into y[] (prec 2)
  fw = 0.0;
  for (i = jz; i >= 0; i--) fw += fq[i];
  y[0] = ih === 0 ? fw : -fw;
  fw = fq[0] - fw;
  for (i = 1; i <= jz; i++) fw += fq[i];
  y[1] = ih === 0 ? fw : -fw;
  return n & 7;
}

/**
 * __ieee754_rem_pio2: x rem pi/2 into y[0]+y[1]; returns the quadrant count (may be negative).
 * @param {number} x
 * @param {Float64Array} y
 * @returns {number}
 */
function remPio2(x, y) {
  const invpio2 = 6.36619772367581382433e-1;
  const pio2_1 = 1.57079632673412561417;
  const pio2_1t = 6.07710050650619224932e-11;
  const pio2_2 = 6.0771005063039659766e-11;
  const pio2_2t = 2.02226624879595063154e-21;
  const pio2_3 = 2.0222662487111664558e-21;
  const pio2_3t = 8.47842766036889956997e-32;

  let z, w, t, r, fn;
  let e0, i, j, n;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    y[0] = x;
    y[1] = 0;
    return 0;
  }
  if (ix < 0x4002d97c) {
    if (hx > 0) {
      z = x - pio2_1;
      if (ix !== 0x3ff921fb) {
        y[0] = z - pio2_1t;
        y[1] = z - y[0] - pio2_1t;
      } else {
        z -= pio2_2;
        y[0] = z - pio2_2t;
        y[1] = z - y[0] - pio2_2t;
      }
      return 1;
    }
    z = x + pio2_1;
    if (ix !== 0x3ff921fb) {
      y[0] = z + pio2_1t;
      y[1] = z - y[0] + pio2_1t;
    } else {
      z += pio2_2;
      y[0] = z + pio2_2t;
      y[1] = z - y[0] + pio2_2t;
    }
    return -1;
  }
  if (ix <= 0x413921fb) {
    t = Math.abs(x);
    n = (t * invpio2 + 0.5) | 0;
    fn = n;
    r = t - fn * pio2_1;
    w = fn * pio2_1t;
    if (n < 32 && ix !== NPIO2_HW[n - 1]) {
      y[0] = r - w;
    } else {
      j = ix >> 20;
      y[0] = r - w;
      i = j - ((hiw(y[0]) >>> 20) & 0x7ff);
      if (i > 16) {
        t = r;
        w = fn * pio2_2;
        r = t - w;
        w = fn * pio2_2t - (t - r - w);
        y[0] = r - w;
        i = j - ((hiw(y[0]) >>> 20) & 0x7ff);
        if (i > 49) {
          t = r;
          w = fn * pio2_3;
          r = t - w;
          w = fn * pio2_3t - (t - r - w);
          y[0] = r - w;
        }
      }
    }
    y[1] = r - y[0] - w;
    if (hx < 0) {
      y[0] = -y[0];
      y[1] = -y[1];
      return -n;
    }
    return n;
  }
  if (ix >= 0x7ff00000) {
    y[0] = y[1] = x - x;
    return 0;
  }
  // large arguments: z = scalbn(|x|, ilogb(x) - 23)
  e0 = (ix >> 20) - 1046;
  z = mk(ix - (e0 << 20), low(x));
  for (i = 0; i < 2; i++) {
    TX[i] = z | 0;
    z = (z - TX[i]) * TWO24;
  }
  TX[2] = z;
  let nx = 3;
  while (TX[nx - 1] === 0) nx--;
  n = kernelRemPio2(TX, y, e0, nx);
  if (hx < 0) {
    y[0] = -y[0];
    y[1] = -y[1];
    return -n;
  }
  return n;
}

/**
 * Cosine kernel on [-pi/4, pi/4].
 * @param {number} x
 * @param {number} y tail of x
 * @returns {number}
 */
function kernelCos(x, y) {
  const C1 = 4.16666666666666019037e-2;
  const C2 = -1.38888888888741095749e-3;
  const C3 = 2.48015872894767294178e-5;
  const C4 = -2.75573143513906633035e-7;
  const C5 = 2.0875723212981748279e-9;
  const C6 = -1.13596475577881948265e-11;
  let ix = hiw(x) & 0x7fffffff;
  if (ix < 0x3e400000) return 1.0; // |x| < 2^-27
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1.0 - (0.5 * z - (z * r - x * y));
  let qx;
  if (ix > 0x3fe90000) qx = 0.28125;
  else qx = mk(ix - 0x00200000, 0);
  const iz = 0.5 * z - qx;
  const a = 1.0 - qx;
  return a - (iz - (z * r - x * y));
}

/**
 * Sine kernel on [-pi/4, pi/4].
 * @param {number} x
 * @param {number} y tail of x
 * @param {number} iy 0 if y is to be ignored
 * @returns {number}
 */
function kernelSin(x, y, iy) {
  const S1 = -1.66666666666666324348e-1;
  const S2 = 8.33333333332248946124e-3;
  const S3 = -1.98412698298579493134e-4;
  const S4 = 2.75573137070700676789e-6;
  const S5 = -2.50507602534068634195e-8;
  const S6 = 1.58969099521155010221e-10;
  const ix = hiw(x) & 0x7fffffff;
  if (ix < 0x3e400000) return x; // |x| < 2^-27
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

const KT = [
  3.33333333333334091986e-1, 1.33333333333201242699e-1, 5.39682539762260521377e-2,
  2.18694882948595424599e-2, 8.86323982359930005737e-3, 3.59207910759131235356e-3,
  1.45620945432529025516e-3, 5.88041240820264096874e-4, 2.46463134818469906812e-4,
  7.8179444293955709230e-5, 7.14072491382608190305e-5, -1.85586374855275456654e-5,
  2.59073051863633712884e-5,
];

/**
 * Tangent kernel on [-pi/4, pi/4].
 * @param {number} x
 * @param {number} y tail of x
 * @param {number} iy 1 for tan, -1 for -1/tan
 * @returns {number}
 */
function kernelTan(x, y, iy) {
  const one = 1.0;
  const pio4 = 7.85398163397448278999e-1;
  const pio4lo = 3.06161699786838301793e-17;
  const T = KT;
  let z, r, v, w, s;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  if (ix < 0x3e300000) {
    // |x| < 2^-28
    if (((ix | low(x)) | (iy + 1)) === 0) return one / Math.abs(x);
    if (iy === 1) return x;
    // compute -1 / (x+y) carefully
    w = x + y;
    z = setLo(w, 0);
    v = y - (z - x);
    const a = -one / w;
    const t = setLo(a, 0);
    s = one + t * z;
    return t + a * (s + t * v);
  }
  if (ix >= 0x3fe59428) {
    if (hx < 0) {
      x = -x;
      y = -y;
    }
    z = pio4 - x;
    w = pio4lo - y;
    x = z + w;
    y = 0.0;
  }
  z = x * x;
  w = z * z;
  r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))));
  v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))));
  s = z * x;
  r = y + z * (s * (r + v) + y);
  r += T[0] * s;
  w = x + r;
  if (ix >= 0x3fe59428) {
    v = iy;
    return (1 - ((hx >> 30) & 2)) * (v - 2.0 * (x - (w * w / (w + v) - r)));
  }
  if (iy === 1) return w;
  // compute -1.0 / (x+r) accurately
  z = setLo(w, 0);
  v = r - (z - x);
  const a = -1.0 / w;
  const t = setLo(a, 0);
  s = 1.0 + t * z;
  return t + a * (s + t * v);
}

// ---------------------------------------------------------------------------------------------
// Trigonometric functions

/**
 * Sine.
 * @param {number} x
 * @returns {number}
 */
export function sin(x) {
  const ix = hiw(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelSin(x, 0.0, 0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x, Y);
  switch (n & 3) {
    case 0:
      return kernelSin(Y[0], Y[1], 1);
    case 1:
      return kernelCos(Y[0], Y[1]);
    case 2:
      return -kernelSin(Y[0], Y[1], 1);
    default:
      return -kernelCos(Y[0], Y[1]);
  }
}

/**
 * Cosine.
 * @param {number} x
 * @returns {number}
 */
export function cos(x) {
  const ix = hiw(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelCos(x, 0.0);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x, Y);
  switch (n & 3) {
    case 0:
      return kernelCos(Y[0], Y[1]);
    case 1:
      return -kernelSin(Y[0], Y[1], 1);
    case 2:
      return -kernelCos(Y[0], Y[1]);
    default:
      return kernelSin(Y[0], Y[1], 1);
  }
}

/**
 * Tangent.
 * @param {number} x
 * @returns {number}
 */
export function tan(x) {
  const ix = hiw(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kernelTan(x, 0.0, 1);
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x, Y);
  return kernelTan(Y[0], Y[1], 1 - ((n & 1) << 1));
}

const pS0 = 1.66666666666666657415e-1;
const pS1 = -3.25565818622400915405e-1;
const pS2 = 2.01212532134862925881e-1;
const pS3 = -4.00555345006794114027e-2;
const pS4 = 7.91534994289814532176e-4;
const pS5 = 3.4793310759602116757e-5;
const qS1 = -2.40339491173441421878;
const qS2 = 2.02094576023350569471;
const qS3 = -6.8828397160545329303e-1;
const qS4 = 7.70381505559019352791e-2;
const PIO2_HI = 1.570796326794896558;
const PIO2_LO = 6.12323399573676603587e-17;
const PIO4_HI = 7.85398163397448278999e-1;
const PI = 3.141592653589793116;

/**
 * Arc cosine.
 * @param {number} x
 * @returns {number}
 */
export function acos(x) {
  let z, p, q, r, w, s, c, df;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | low(x)) === 0) {
      if (hx > 0) return 0.0;
      return PI + 2.0 * PIO2_LO;
    }
    return NaN;
  }
  if (ix < 0x3fe00000) {
    if (ix <= 0x3c600000) return PIO2_HI + PIO2_LO;
    z = x * x;
    p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))));
    q = 1.0 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)));
    r = p / q;
    return PIO2_HI - (x - (PIO2_LO - x * r));
  } else if (hx < 0) {
    z = (1.0 + x) * 0.5;
    p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))));
    q = 1.0 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)));
    s = Math.sqrt(z);
    r = p / q;
    w = r * s - PIO2_LO;
    return PI - 2.0 * (s + w);
  }
  z = (1.0 - x) * 0.5;
  s = Math.sqrt(z);
  df = setLo(s, 0);
  c = (z - df * df) / (s + df);
  p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))));
  q = 1.0 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)));
  r = p / q;
  w = r * s + c;
  return 2.0 * (df + w);
}

/**
 * Arc sine.
 * @param {number} x
 * @returns {number}
 */
export function asin(x) {
  let t = 0, w, p, q, c, r, s;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | low(x)) === 0) return x * PIO2_HI + x * PIO2_LO;
    return NaN;
  } else if (ix < 0x3fe00000) {
    if (ix < 0x3e400000) {
      return x; // |x| < 2^-27
    }
    t = x * x;
    p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))));
    q = 1.0 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)));
    w = p / q;
    return x + x * w;
  }
  w = 1.0 - Math.abs(x);
  t = w * 0.5;
  p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))));
  q = 1.0 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)));
  s = Math.sqrt(t);
  if (ix >= 0x3fef3333) {
    w = p / q;
    t = PIO2_HI - (2.0 * (s + s * w) - PIO2_LO);
  } else {
    w = setLo(s, 0);
    c = (t - w * w) / (s + w);
    r = p / q;
    p = 2.0 * s * r - (PIO2_LO - 2.0 * c);
    q = PIO4_HI - 2.0 * w;
    t = PIO4_HI - (p - q);
  }
  return hx > 0 ? t : -t;
}

const ATANHI = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1,
  1.570796326794896558,
];
const ATANLO = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17,
  6.12323399573676603587e-17,
];
const AT = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1,
  -1.1111110405462355788e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2,
  6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2,
  -3.6531572744216915527e-2, 1.62858201153657823623e-2,
];

/**
 * Arc tangent.
 * @param {number} x
 * @returns {number}
 */
export function atan(x) {
  let w, s1, s2, z, id;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x44100000) {
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && low(x) !== 0)) return x + x;
    if (hx > 0) return ATANHI[3] + ATANLO[3];
    return -ATANHI[3] - ATANLO[3];
  }
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e400000) return x; // |x| < 2^-27
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) {
        id = 0;
        x = (2.0 * x - 1.0) / (2.0 + x);
      } else {
        id = 1;
        x = (x - 1.0) / (x + 1.0);
      }
    } else if (ix < 0x40038000) {
      id = 2;
      x = (x - 1.5) / (1.0 + 1.5 * x);
    } else {
      id = 3;
      x = -1.0 / x;
    }
  }
  z = x * x;
  w = z * z;
  s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  z = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return hx < 0 ? -z : z;
}

/**
 * Two-argument arc tangent.
 * @param {number} y
 * @param {number} x
 * @returns {number}
 */
export function atan2(y, x) {
  const tiny = 1.0e-300;
  const pi_o_4 = 7.85398163397448279e-1;
  const pi_o_2 = 1.570796326794896558;
  const pi = 3.141592653589793116;
  const pi_lo = 1.2246467991473531772e-16;
  let z, k, m;
  const hx = hiw(x);
  const lx = low(x);
  const ix = hx & 0x7fffffff;
  const hy = hiw(y);
  const ly = low(y);
  const iy = hy & 0x7fffffff;
  if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lx !== 0) || iy > 0x7ff00000 || (iy === 0x7ff00000 && ly !== 0)) {
    return x + y;
  }
  if (hx === 0x3ff00000 && lx === 0) return atan(y);
  m = ((hy >> 31) & 1) | ((hx >> 30) & 2);

  if ((iy | ly) === 0) {
    switch (m) {
      case 0:
      case 1:
        return y;
      case 2:
        return pi + tiny;
      case 3:
        return -pi - tiny;
    }
  }
  if ((ix | lx) === 0) return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny;

  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) {
      switch (m) {
        case 0:
          return pi_o_4 + tiny;
        case 1:
          return -pi_o_4 - tiny;
        case 2:
          return 3.0 * pi_o_4 + tiny;
        case 3:
          return -3.0 * pi_o_4 - tiny;
      }
    } else {
      switch (m) {
        case 0:
          return 0.0;
        case 1:
          return -0.0;
        case 2:
          return pi + tiny;
        case 3:
          return -pi - tiny;
      }
    }
  }
  if (iy === 0x7ff00000) return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny;

  k = (iy - ix) >> 20;
  if (k > 60) {
    z = pi_o_2 + 0.5 * pi_lo;
    m &= 1;
  } else if (hx < 0 && k < -60) {
    z = 0.0;
  } else {
    z = atan(Math.abs(y / x));
  }
  switch (m) {
    case 0:
      return z;
    case 1:
      return -z;
    case 2:
      return pi - (z - pi_lo);
    default:
      return (z - pi_lo) - pi;
  }
}

// ---------------------------------------------------------------------------------------------
// Exponential and logarithmic functions

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const TWO54 = 1.8014398509481984e16;
const Lg1 = 6.66666666666673513e-1;
const Lg2 = 3.999999999940941908e-1;
const Lg3 = 2.857142874366239149e-1;
const Lg4 = 2.222219843214978396e-1;
const Lg5 = 1.818357216161805012e-1;
const Lg6 = 1.531383769920937332e-1;
const Lg7 = 1.479819860511658591e-1;

/**
 * e^x.
 * @param {number} x
 * @returns {number}
 */
export function exp(x) {
  const o_threshold = 7.09782712893383973096e2;
  const u_threshold = -7.4513321910194110842e2;
  const invln2 = 1.442695040888963387;
  const P1 = 1.66666666666666019037e-1;
  const P2 = -2.77777777770155933842e-3;
  const P3 = 6.61375632143793436117e-5;
  const P4 = -1.6533902205465251539e-6;
  const P5 = 4.1381367970572384604e-8;
  const twom1000 = 9.3326361850321887899e-302;
  const two1023 = 8.988465674311579539e307;

  let y, hi = 0.0, lo = 0.0, c, t, twopk, k = 0;
  let hx = hiw(x) >>> 0;
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;

  if (hx >= 0x40862e42) {
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | low(x)) !== 0) return x + x;
      return xsb === 0 ? x : 0.0;
    }
    if (x > o_threshold) return Infinity;
    if (x < u_threshold) return twom1000 * twom1000;
  }

  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      if (x === 1.0) return 2.718281828459045;
      hi = x - (xsb === 0 ? LN2_HI : -LN2_HI);
      lo = xsb === 0 ? LN2_LO : -LN2_LO;
      k = 1 - xsb - xsb;
    } else {
      k = (invln2 * x + (xsb === 0 ? 0.5 : -0.5)) | 0;
      t = k;
      hi = x - t * LN2_HI;
      lo = t * LN2_LO;
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    return 1.0 + x;
  } else {
    k = 0;
  }

  t = x * x;
  if (k >= -1021) twopk = mk(0x3ff00000 + (k << 20), 0);
  else twopk = mk(0x3ff00000 + ((k + 1000) << 20), 0);
  c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1.0 - ((x * c) / (c - 2.0) - x);
  y = 1.0 - ((lo - (x * c) / (2.0 - c)) - hi);
  if (k >= -1021) {
    if (k === 1024) return y * 2.0 * two1023;
    return y * twopk;
  }
  return y * twopk * twom1000;
}

/**
 * exp(x) - 1.
 * @param {number} x
 * @returns {number}
 */
export function expm1(x) {
  const o_threshold = 7.09782712893383973096e2;
  const invln2 = 1.442695040888963387;
  const Q1 = -3.33333333333331316428e-2;
  const Q2 = 1.58730158725481460165e-3;
  const Q3 = -7.93650757867487942473e-5;
  const Q4 = 4.00821782732936239552e-6;
  const Q5 = -2.01099218183624371326e-7;
  const tiny = 1.0e-300;
  const huge = 1.0e300;

  let y, hi, lo, c = 0, t, e, hxs, hfx, r1, twopk, k;
  let hx = hiw(x) >>> 0;
  const xsb = hx & 0x80000000;
  hx &= 0x7fffffff;

  if (hx >= 0x4043687a) {
    if (hx >= 0x40862e42) {
      if (hx >= 0x7ff00000) {
        if (((hx & 0xfffff) | low(x)) !== 0) return x + x;
        return xsb === 0 ? x : -1.0;
      }
      if (x > o_threshold) return Infinity;
    }
    if (xsb !== 0) {
      if (x + tiny < 0.0) return tiny - 1.0;
    }
  }

  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      if (xsb === 0) {
        hi = x - LN2_HI;
        lo = LN2_LO;
        k = 1;
      } else {
        hi = x + LN2_HI;
        lo = -LN2_LO;
        k = -1;
      }
    } else {
      k = (invln2 * x + (xsb === 0 ? 0.5 : -0.5)) | 0;
      t = k;
      hi = x - t * LN2_HI;
      lo = t * LN2_LO;
    }
    x = hi - lo;
    c = (hi - x) - lo;
  } else if (hx < 0x3c900000) {
    t = huge + x;
    return x - (t - (huge + x));
  } else {
    k = 0;
  }

  hfx = 0.5 * x;
  hxs = x * hfx;
  r1 = 1.0 + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))));
  t = 3.0 - r1 * hfx;
  e = hxs * ((r1 - t) / (6.0 - x * t));
  if (k === 0) return x - (x * e - hxs);
  twopk = mk(0x3ff00000 + (k << 20), 0);
  e = x * (e - c) - c;
  e -= hxs;
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) {
    if (x < -0.25) return -2.0 * (e - (x + 0.5));
    return 1.0 + 2.0 * (x - e);
  }
  if (k <= -2 || k > 56) {
    y = 1.0 - (e - x);
    if (k === 1024) y = y * 2.0 * 8.98846567431158e307;
    else y = y * twopk;
    return y - 1.0;
  }
  t = 1.0;
  if (k < 20) {
    t = setHi(t, 0x3ff00000 - (0x200000 >> k));
    y = t - (e - x);
    y = y * twopk;
  } else {
    t = setHi(t, (0x3ff - k) << 20);
    y = x - (e + t);
    y += 1.0;
    y = y * twopk;
  }
  return y;
}

/**
 * Natural logarithm.
 * @param {number} x
 * @returns {number}
 */
export function log(x) {
  let hfsq, f, s, z, R, w, t1, t2, dk, i, j;
  let hx = hiw(x);
  const lx = low(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54;
    hx = hiw(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  i = (hx + 0x95f64) & 0x100000;
  x = setHi(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  f = x - 1.0;
  if ((0x000fffff & (2 + hx)) < 3) {
    if (f === 0) {
      if (k === 0) return 0.0;
      dk = k;
      return dk * LN2_HI + dk * LN2_LO;
    }
    R = f * f * (0.5 - 0.33333333333333333 * f);
    if (k === 0) return f - R;
    dk = k;
    return dk * LN2_HI - ((R - dk * LN2_LO) - f);
  }
  s = f / (2.0 + f);
  dk = k;
  z = s * s;
  i = hx - 0x6147a;
  w = z * z;
  j = 0x6b851 - hx;
  t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  i |= j;
  R = t2 + t1;
  if (i > 0) {
    hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + R));
    return dk * LN2_HI - ((hfsq - (s * (hfsq + R) + dk * LN2_LO)) - f);
  }
  if (k === 0) return f - s * (f - R);
  return dk * LN2_HI - ((s * (f - R) - dk * LN2_LO) - f);
}

/**
 * log(1 + x).
 * @param {number} x
 * @returns {number}
 */
export function log1p(x) {
  const Lp1 = 6.66666666666673513e-1;
  const Lp2 = 3.999999999940941908e-1;
  const Lp3 = 2.857142874366239149e-1;
  const Lp4 = 2.222219843214978396e-1;
  const Lp5 = 1.818357216161805012e-1;
  const Lp6 = 1.531383769920937332e-1;
  const Lp7 = 1.479819860511658591e-1;

  let hfsq, f = 0, c = 0, s, z, R, u, hu = 0;
  const hx = hiw(x);
  const ax = hx & 0x7fffffff;
  let k = 1;
  if (hx < 0x3fda827a) {
    if (ax >= 0x3ff00000) {
      if (x === -1.0) return -Infinity;
      return NaN;
    }
    if (ax < 0x3e200000) {
      if (ax < 0x3c900000) return x;
      return x - x * x * 0.5;
    }
    if (hx > 0 || hx <= (0xbfd2bec4 | 0)) {
      k = 0;
      f = x;
      hu = 1;
    }
  }
  if (hx >= 0x7ff00000) return x + x;
  if (k !== 0) {
    if (hx < 0x43400000) {
      u = 1.0 + x;
      hu = hiw(u);
      k = (hu >> 20) - 1023;
      c = k > 0 ? 1.0 - (u - x) : x - (u - 1.0);
      c /= u;
    } else {
      u = x;
      hu = hiw(u);
      k = (hu >> 20) - 1023;
      c = 0;
    }
    hu &= 0x000fffff;
    if (hu < 0x6a09e) {
      u = setHi(u, hu | 0x3ff00000);
    } else {
      k += 1;
      u = setHi(u, hu | 0x3fe00000);
      hu = (0x00100000 - hu) >> 2;
    }
    f = u - 1.0;
  }
  hfsq = 0.5 * f * f;
  if (hu === 0) {
    if (f === 0) {
      if (k === 0) return 0.0;
      c += k * LN2_LO;
      return k * LN2_HI + c;
    }
    R = hfsq * (1.0 - 0.66666666666666666 * f);
    if (k === 0) return f - R;
    return k * LN2_HI - ((R - (k * LN2_LO + c)) - f);
  }
  s = f / (2.0 + f);
  z = s * s;
  R = z * (Lp1 + z * (Lp2 + z * (Lp3 + z * (Lp4 + z * (Lp5 + z * (Lp6 + z * Lp7))))));
  if (k === 0) return f - (hfsq - s * (hfsq + R));
  return k * LN2_HI - ((hfsq - (s * (hfsq + R) + (k * LN2_LO + c))) - f);
}

/**
 * Base-2 logarithm.
 * @param {number} x
 * @returns {number}
 */
export function log2(x) {
  const ivln2hi = 1.4426950407214462757;
  const ivln2lo = 1.67517131648865118353e-10;
  let f, hfsq, hi, lo, r, val_hi, val_lo, w, y, i, s, z, t1, t2, R;
  let hx = hiw(x);
  const lx = low(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54;
    hx = hiw(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  if (hx === 0x3ff00000 && lx === 0) return 0.0;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  i = (hx + 0x95f64) & 0x100000;
  x = setHi(x, hx | (i ^ 0x3ff00000));
  k += i >> 20;
  y = k;
  f = x - 1.0;
  hfsq = 0.5 * f * f;
  // k_log1p(f)
  s = f / (2.0 + f);
  z = s * s;
  w = z * z;
  t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  R = t2 + t1;
  r = s * (hfsq + R);

  hi = f - hfsq;
  hi = setLo(hi, 0);
  lo = (f - hi) - hfsq + r;
  val_hi = hi * ivln2hi;
  val_lo = (lo + hi) * ivln2lo + lo * ivln2hi;

  w = y + val_hi;
  val_lo += (y - w) + val_hi;
  val_hi = w;
  return val_lo + val_hi;
}

/**
 * Base-10 logarithm.
 * @param {number} x
 * @returns {number}
 */
export function log10(x) {
  const ivln10 = 4.34294481903251816668e-1;
  const log10_2hi = 3.01029995663611771306e-1;
  const log10_2lo = 3.69423907715893078616e-13;
  let hx = hiw(x);
  let lx = low(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54;
    x *= TWO54;
    hx = hiw(x);
    lx = low(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  if (hx === 0x3ff00000 && lx === 0) return 0.0;
  k += (hx >> 20) - 1023;
  const i = k >>> 31;
  hx = (hx & 0x000fffff) | ((0x3ff - i) << 20);
  const y = k + i;
  x = mk(hx, lx);
  const z = y * log10_2lo + ivln10 * log(x);
  return z + y * log10_2hi;
}

// ---------------------------------------------------------------------------------------------
// Hyperbolic functions

/**
 * Hyperbolic sine.
 * @param {number} x
 * @returns {number}
 */
export function sinh(x) {
  const KSINH_OVERFLOW = 710.4758600739439;
  const TWO_M28 = 3.725290298461914e-9;
  const LOG_MAXD = 709.7822265625;
  const shuge = 1.0e307;
  const h = x < 0 ? -0.5 : 0.5;
  const ax = Math.abs(x);
  if (ax < 22) {
    if (ax < TWO_M28) return x;
    const t = expm1(ax);
    if (ax < 1) return h * (2 * t - t * t / (t + 1));
    return h * (t + t / (t + 1));
  }
  if (ax < LOG_MAXD) return h * exp(ax);
  if (ax <= KSINH_OVERFLOW) {
    const w = exp(0.5 * ax);
    const t = h * w;
    return t * w;
  }
  return x * shuge;
}

/**
 * Hyperbolic cosine.
 * @param {number} x
 * @returns {number}
 */
export function cosh(x) {
  const KCOSH_OVERFLOW = 710.4758600739439;
  const ix = hiw(x) & 0x7fffffff;
  if (ix < 0x3fd62e43) {
    const t = expm1(Math.abs(x));
    const w = 1.0 + t;
    if (ix < 0x3c800000) return w;
    return 1.0 + (t * t) / (w + w);
  }
  if (ix < 0x40360000) {
    const t = exp(Math.abs(x));
    return 0.5 * t + 0.5 / t;
  }
  if (ix < 0x40862e42) return 0.5 * exp(Math.abs(x));
  if (Math.abs(x) <= KCOSH_OVERFLOW) {
    const w = exp(0.5 * Math.abs(x));
    const t = 0.5 * w;
    return t * w;
  }
  if (ix >= 0x7ff00000) return x * x;
  return Infinity;
}

/**
 * Hyperbolic tangent.
 * @param {number} x
 * @returns {number}
 */
export function tanh(x) {
  const tiny = 1.0e-300;
  let t, z;
  const jx = hiw(x);
  const ix = jx & 0x7fffffff;
  if (ix >= 0x7ff00000) {
    if (jx >= 0) return 1.0 / x + 1.0;
    return 1.0 / x - 1.0;
  }
  if (ix < 0x40360000) {
    if (ix < 0x3e300000) return x; // |x| < 2^-28
    if (ix >= 0x3ff00000) {
      t = expm1(2.0 * Math.abs(x));
      z = 1.0 - 2.0 / (t + 2.0);
    } else {
      t = expm1(-2.0 * Math.abs(x));
      z = -t / (t + 2.0);
    }
  } else {
    z = 1.0 - tiny;
  }
  return jx >= 0 ? z : -z;
}

/**
 * Inverse hyperbolic sine.
 * @param {number} x
 * @returns {number}
 */
export function asinh(x) {
  const ln2 = 6.93147180559945286227e-1;
  let t, w;
  const hx = hiw(x);
  const ix = hx & 0x7fffffff;
  if (ix >= 0x7ff00000) return x + x;
  if (ix < 0x3e300000) return x; // |x| < 2^-28
  if (ix > 0x41b00000) {
    w = log(Math.abs(x)) + ln2;
  } else if (ix > 0x40000000) {
    t = Math.abs(x);
    w = log(2.0 * t + 1.0 / (Math.sqrt(x * x + 1.0) + t));
  } else {
    t = x * x;
    w = log1p(Math.abs(x) + t / (1.0 + Math.sqrt(1.0 + t)));
  }
  return hx > 0 ? w : -w;
}

/**
 * Inverse hyperbolic cosine.
 * @param {number} x
 * @returns {number}
 */
export function acosh(x) {
  const ln2 = 6.93147180559945286227e-1;
  let t;
  const hx = hiw(x);
  const lx = low(x);
  if (hx < 0x3ff00000) return NaN;
  if (hx >= 0x41b00000) {
    if (hx >= 0x7ff00000) return x + x;
    return log(x) + ln2;
  }
  if (((hx - 0x3ff00000) | lx) === 0) return 0.0;
  if (hx > 0x40000000) {
    t = x * x;
    return log(2.0 * x - 1.0 / (x + Math.sqrt(t - 1.0)));
  }
  t = x - 1.0;
  return log1p(t + Math.sqrt(2.0 * t + t * t));
}

/**
 * Inverse hyperbolic tangent.
 * @param {number} x
 * @returns {number}
 */
export function atanh(x) {
  let t;
  const hx = hiw(x);
  const lx = low(x);
  const ix = hx & 0x7fffffff;
  if (ix > 0x3ff00000 || (ix === 0x3ff00000 && lx !== 0)) return NaN;
  if (ix === 0x3ff00000) return x > 0 ? Infinity : -Infinity;
  if (ix < 0x3e300000) return x; // |x| < 2^-28
  x = setHi(x, ix);
  if (ix < 0x3fe00000) {
    t = x + x;
    t = 0.5 * log1p(t + t * x / (1.0 - x));
  } else {
    t = 0.5 * log1p((x + x) / (1.0 - x));
  }
  return hx >= 0 ? t : -t;
}

/**
 * Cube root.
 * @param {number} x
 * @returns {number}
 */
export function cbrt(x) {
  const B1 = 715094163;
  const B2 = 696219795;
  const P0 = 1.87595182427177009643;
  const P1 = -1.88497979543377169875;
  const P2 = 1.62142972010535446614;
  const P3 = -0.758397934778766047437;
  const P4 = 0.145996192886612446982;

  let r, s, t, w;
  const hxs = hiw(x);
  const lw = low(x);
  const sign = (hxs & 0x80000000) >>> 0;
  const hx = hxs & 0x7fffffff;
  if (hx >= 0x7ff00000) return x + x;
  if (hx < 0x00100000) {
    if ((hx | lw) === 0) return x;
    t = 18014398509481984 * x; // 2^54 * x
    const high = hiw(t);
    t = mk((sign | (((high & 0x7fffffff) / 3) | 0) + B2) >>> 0, 0);
  } else {
    t = mk((sign | ((hx / 3) | 0) + B1) >>> 0, 0);
  }
  r = t * t * (t / x);
  t = t * ((P0 + r * (P1 + r * P2)) + ((r * r) * r) * (P3 + r * P4));

  // round t away from zero to 23 bits: (bits + 0x80000000) & 0xFFFFFFFFC0000000
  const l = low(t) + 0x80000000;
  const nh = (hiw(t) + (l >= 0x100000000 ? 1 : 0)) | 0;
  t = mk(nh, (l >>> 0) & 0xc0000000);

  s = t * t;
  r = x / s;
  w = t + t;
  r = (r - t) / (w + r);
  t = t + t * r;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Power function

const BP = [1.0, 1.5];
const DP_H = [0.0, 5.84962487220764160156e-1];
const DP_L = [0.0, 1.35003920212974897128e-8];

/**
 * x raised to the power y (ECMAScript semantics, as in V8's ieee754::pow).
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
export function pow(x, y) {
  const two53 = 9007199254740992.0;
  const huge = 1.0e300;
  const tiny = 1.0e-300;
  const L1 = 5.99999999999994648725e-1;
  const L2 = 4.28571428578550184252e-1;
  const L3 = 3.33333329818377432918e-1;
  const L4 = 2.72728123808534006489e-1;
  const L5 = 2.30660745775561754067e-1;
  const L6 = 2.06975017800338417784e-1;
  const P1 = 1.66666666666666019037e-1;
  const P2 = -2.77777777770155933842e-3;
  const P3 = 6.61375632143793436117e-5;
  const P4 = -1.6533902205465251539e-6;
  const P5 = 4.13813679705723846039e-8;
  const lg2 = 6.93147180559945286227e-1;
  const lg2_h = 6.93147182464599609375e-1;
  const lg2_l = -1.90465429995776804525e-9;
  const ovt = 8.0085662595372944372e-17;
  const cp = 9.61796693925975554329e-1;
  const cp_h = 9.61796700954437255859e-1;
  const cp_l = -7.02846165095275826516e-9;
  const ivln2 = 1.442695040888963387;
  const ivln2_h = 1.44269502162933349609;
  const ivln2_l = 1.92596299112661746887e-8;

  let z, ax, z_h, z_l, p_h, p_l;
  let y1, t1, t2, r, s, t, u, v, w;
  let i, j, k, yisint, n;
  const hx = hiw(x);
  const lx = low(x);
  const hy = hiw(y);
  const ly = low(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;

  if ((iy | ly) === 0) return 1.0;

  if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lx !== 0) || iy > 0x7ff00000 || (iy === 0x7ff00000 && ly !== 0)) {
    return x + y;
  }

  yisint = 0;
  if (hx < 0) {
    if (iy >= 0x43400000) {
      yisint = 2;
    } else if (iy >= 0x3ff00000) {
      k = (iy >> 20) - 0x3ff;
      if (k > 20) {
        j = (ly >>> (52 - k)) | 0;
        if (j << (52 - k) === (ly | 0)) yisint = 2 - (j & 1);
      } else if (ly === 0) {
        j = iy >> (20 - k);
        if (j << (20 - k) === iy) yisint = 2 - (j & 1);
      }
    }
  }

  if (ly === 0) {
    if (iy === 0x7ff00000) {
      if (((ix - 0x3ff00000) | lx) === 0) return y - y; // (+-1)**+-inf is NaN
      else if (ix >= 0x3ff00000) return hy >= 0 ? y : 0.0;
      return hy < 0 ? -y : 0.0;
    }
    if (iy === 0x3ff00000) {
      if (hy < 0) return 1.0 / x;
      return x;
    }
    if (hy === 0x40000000) return x * x;
    if (hy === 0x3fe00000) {
      if (hx >= 0) return Math.sqrt(x);
    }
  }

  ax = Math.abs(x);
  if (lx === 0) {
    if (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000) {
      z = ax;
      if (hy < 0) z = 1.0 / z;
      if (hx < 0) {
        if (((ix - 0x3ff00000) | yisint) === 0) z = NaN;
        else if (yisint === 1) z = -z;
      }
      return z;
    }
  }

  n = (hx >> 31) + 1;
  if ((n | yisint) === 0) return NaN;

  s = 1.0;
  if ((n | (yisint - 1)) === 0) s = -1.0;

  if (iy > 0x41e00000) {
    if (iy > 0x43f00000) {
      if (ix <= 0x3fefffff) return hy < 0 ? huge * huge : tiny * tiny;
      if (ix >= 0x3ff00000) return hy > 0 ? huge * huge : tiny * tiny;
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * huge * huge : s * tiny * tiny;
    if (ix > 0x3ff00000) return hy > 0 ? s * huge * huge : s * tiny * tiny;
    t = ax - 1.0;
    w = (t * t) * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
    u = ivln2_h * t;
    v = t * ivln2_l - w * ivln2;
    t1 = setLo(u + v, 0);
    t2 = v - (t1 - u);
  } else {
    let ss, s2, s_h, s_l, t_h, t_l;
    n = 0;
    if (ix < 0x00100000) {
      ax *= two53;
      n -= 53;
      ix = hiw(ax);
    }
    n += (ix >> 20) - 0x3ff;
    j = ix & 0x000fffff;
    ix = j | 0x3ff00000;
    if (j <= 0x3988e) {
      k = 0;
    } else if (j < 0xbb67a) {
      k = 1;
    } else {
      k = 0;
      n += 1;
      ix -= 0x00100000;
    }
    ax = setHi(ax, ix);

    u = ax - BP[k];
    v = 1.0 / (ax + BP[k]);
    ss = u * v;
    s_h = setLo(ss, 0);
    t_h = mk(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0);
    t_l = ax - (t_h - BP[k]);
    s_l = v * ((u - s_h * t_h) - s_h * t_l);
    s2 = ss * ss;
    r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += s_l * (s_h + ss);
    s2 = s_h * s_h;
    t_h = setLo(3.0 + s2 + r, 0);
    t_l = r - ((t_h - 3.0) - s2);
    u = s_h * t_h;
    v = s_l * t_h + t_l * ss;
    p_h = setLo(u + v, 0);
    p_l = v - (p_h - u);
    z_h = cp_h * p_h;
    z_l = cp_l * p_h + p_l * cp + DP_L[k];
    t = n;
    t1 = setLo(((z_h + z_l) + DP_H[k]) + t, 0);
    t2 = z_l - (((t1 - t) - DP_H[k]) - z_h);
  }

  y1 = setLo(y, 0);
  p_l = (y - y1) * t1 + y * t2;
  p_h = y1 * t1;
  z = p_l + p_h;
  j = hiw(z);
  i = low(z);
  if (j >= 0x40900000) {
    if (((j - 0x40900000) | i) !== 0) return s * huge * huge;
    if (p_l + ovt > z - p_h) return s * huge * huge;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {
    if ((j >>> 0) !== 0xc090cc00 || i !== 0) return s * tiny * tiny;
    if (p_l <= z - p_h) return s * tiny * tiny;
  }

  i = j & 0x7fffffff;
  k = (i >> 20) - 0x3ff;
  n = 0;
  if (i > 0x3fe00000) {
    n = j + (0x00100000 >> (k + 1));
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    t = mk(n & ~(0x000fffff >> k), 0);
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    p_h -= t;
  }
  t = setLo(p_l + p_h, 0);
  u = t * lg2_h;
  v = (p_l - (t - p_h)) * lg2 + t * lg2_l;
  z = u + v;
  w = v - (z - u);
  t = z * z;
  t1 = z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  r = (z * t1) / ((t1 - 2.0) - (w + z * w));
  z = 1.0 - (r - z);
  j = hiw(z);
  j += n << 20;
  if (j >> 20 <= 0) z = scalbn(z, n);
  else z = setHi(z, hiw(z) + (n << 20));
  return s * z;
}
