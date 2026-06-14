/**
 * ocrBarcode.js - ระบบอ่านบาร์โค้ดจากภาพถ่าย
 * รองรับ: Android Chrome, iPhone (iOS Safari), Desktop Chrome/Firefox
 *
 * ลำดับการทำงาน:
 * 1. BarcodeDetector API (Chrome/Android — เร็วที่สุด, ไม่มีบน iOS)
 * 2. ZXing (ทำงานทุกแพลตฟอร์ม, อ่านแถบบาร์โค้ด)
 * 3. Tesseract OCR อ่านตัวเลขใต้บาร์โค้ด
 * 4. Tesseract OCR อ่าน Serial + Size บนป้ายสินค้า → resolve ผ่าน API
 */

import { createWorker, PSM } from 'tesseract.js';
import api from '../api';
import {
  MultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
} from '@zxing/library';

// ─── Shared OCR Workers ───────────────────────────────────────────────────────
let _workerDigit = null;
let _workerFull = null;

async function getDigitWorker() {
  if (!_workerDigit) {
    _workerDigit = await createWorker('eng');
    await _workerDigit.setParameters({
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
    });
  }
  return _workerDigit;
}

async function getFullWorker() {
  if (!_workerFull) {
    _workerFull = await createWorker('eng');
    await _workerFull.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-/: ',
      tessedit_pageseg_mode: PSM.AUTO,
    });
  }
  return _workerFull;
}

// ─── EAN-13 helpers ───────────────────────────────────────────────────────────
function eanCheckDigit(code12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(code12[i], 10) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

export function isValidEan13(code) {
  if (!/^\d{13}$/.test(code)) return false;
  return code[12] === eanCheckDigit(code.slice(0, 12));
}

function scoreBarcode(code) {
  if (isValidEan13(code)) return code.startsWith('885') ? 100 : 90;
  if (/^\d{13}$/.test(code)) return 50;
  if (/^\d{12}$/.test(code)) return 45;
  if (/^\d{8}$/.test(code)) return 40;
  return 0;
}

export function extractBarcodeCandidates(text) {
  const seen = new Set();
  const scored = [];
  const add = (v) => {
    if (!v || seen.has(v)) return;
    const s = scoreBarcode(v);
    if (s === 0) return;
    seen.add(v);
    scored.push({ value: v, score: s });
  };

  for (const run of text.match(/\d{8,16}/g) || []) {
    add(run);
    for (let i = 0; i <= run.length - 13; i++) add(run.slice(i, i + 13));
    for (let i = 0; i <= run.length - 12; i++) add(run.slice(i, i + 12));
    for (let i = 0; i <= run.length - 8; i++) add(run.slice(i, i + 8));
  }

  const digits = text.replace(/\D/g, '');
  for (let i = 0; i <= digits.length - 12; i++) {
    const candidate = `8${digits.slice(i, i + 12)}`;
    if (isValidEan13(candidate)) add(candidate);
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .map((x) => x.value)
    .slice(0, 10);
}

// ─── EXIF Orientation Fix (สำคัญมากสำหรับ iPhone) ───────────────────────────
/**
 * iPhone บันทึกรูปภาพแนวนอนแต่ใส่ EXIF orientation tag ไว้
 * ถ้าไม่แก้ไข รูปจะหมุนผิดทิศเมื่อเอามาประมวลผล
 */
async function fixExifOrientation(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // อ่าน EXIF จาก binary
      const orientation = getExifOrientation(dataUrl);
      if (!orientation || orientation === 1) {
        resolve(dataUrl); // ไม่ต้องแก้ไข
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const w = img.width;
      const h = img.height;

      // กำหนดขนาด canvas ตาม orientation
      if (orientation >= 5 && orientation <= 8) {
        canvas.width = h;
        canvas.height = w;
      } else {
        canvas.width = w;
        canvas.height = h;
      }

      // หมุน/พลิกตาม orientation
      switch (orientation) {
        case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
        case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
        case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
        case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
        case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
        case 7: ctx.transform(0, -1, -1, 0, h, w); break;
        case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
        default: break;
      }

      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function getExifOrientation(dataUrl) {
  try {
    // แปลง base64 เป็น binary
    const base64 = dataUrl.split(',')[1];
    if (!base64) return null;
    const binary = atob(base64.substring(0, 1024)); // อ่านแค่ header
    const view = new DataView(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));

    if (view.getUint16(0, false) !== 0xFFD8) return null; // ไม่ใช่ JPEG

    let offset = 2;
    while (offset < view.byteLength) {
      if (view.getUint16(offset, false) === 0xFFE1) {
        // APP1 segment (EXIF)
        const exifOffset = offset + 10;
        if (view.byteLength <= exifOffset) break;
        
        const littleEndian = view.getUint16(exifOffset, false) === 0x4949;
        const ifdOffset = exifOffset + view.getUint32(exifOffset + 4, littleEndian);
        if (view.byteLength <= ifdOffset + 2) break;
        
        const count = view.getUint16(ifdOffset, littleEndian);
        for (let i = 0; i < count; i++) {
          const ifd = ifdOffset + 2 + i * 12;
          if (view.byteLength <= ifd + 12) break;
          if (view.getUint16(ifd, littleEndian) === 0x0112) {
            return view.getUint16(ifd + 8, littleEndian);
          }
        }
        break;
      }
      offset += 2 + view.getUint16(offset + 2, false);
    }
  } catch { /* ignore */ }
  return null;
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('โหลดภาพไม่สำเร็จ'));
    img.src = src;
  });
}

function toCanvas(img) {
  const w = img.width ?? img.naturalWidth ?? 100;
  const h = img.height ?? img.naturalHeight ?? 100;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

function upscale(canvas, minEdge = 1800) {
  const long = Math.max(canvas.width, canvas.height);
  const scale = long < minEdge ? minEdge / long : 1;
  if (scale <= 1) return canvas;
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

function clone(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

function rotate(src, deg) {
  const rad = (deg * Math.PI) / 180;
  const s = Math.abs(Math.sin(rad)), co = Math.abs(Math.cos(rad));
  const w = Math.round(src.width * co + src.height * s);
  const h = Math.round(src.width * s + src.height * co);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rad);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

function crop(src, rx, ry, rw, rh) {
  const sx = Math.floor(src.width * rx);
  const sy = Math.floor(src.height * ry);
  const sw = Math.max(1, Math.floor(src.width * rw));
  const sh = Math.max(1, Math.floor(src.height * rh));
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  c.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  return c;
}

/** Grayscale + Binary contrast สำหรับ Tesseract */
function enhanceForOcr(src) {
  const c = clone(src);
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    const v = lum < 128 ? 0 : 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

/** กรองสีเหลือง → ขาวดำ สำหรับป้ายสีเหลือง */
function yellowToBinary(src) {
  const c = clone(src);
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const isYellow = r > 100 && g > 75 && b < 165 && r > b + 20 && g > b;
    const v = (lum < 110 || (isYellow && lum < 160)) ? 0 : 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

/** ลดแสงสะท้อน (Glare reduction) — ช่วยป้ายสีเหลืองที่มีแสงวาว */
function reduceGlare(src) {
  const c = clone(src);
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2];
    // ถ้า pixel สว่างมากทุกช่อง = แสงสะท้อน → ทำให้มืดลง
    if (r > 200 && g > 200 && b > 200) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const factor = 1 - ((lum - 200) / 200);
      d.data[i] = Math.round(r * factor);
      d.data[i + 1] = Math.round(g * factor);
      d.data[i + 2] = Math.round(b * factor);
    }
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

function toDataUrl(c) { return c.toDataURL('image/jpeg', 0.92); }

// ─── Barcode Scanners ─────────────────────────────────────────────────────────

/**
 * 1. Chrome BarcodeDetector (รวดเร็ว — Android Chrome, macOS Safari)
 *    หมายเหตุ: iOS Safari ยังไม่รองรับ API นี้
 */
async function tryNativeDetector(canvas) {
  if (typeof window.BarcodeDetector === 'undefined') return [];
  try {
    const det = new window.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'code_128', 'code_39'],
    });
    const res = await det.detect(canvas);
    return res.map((r) => r.rawValue).filter(Boolean);
  } catch { return []; }
}

/**
 * 2. ZXing MultiFormatReader (ทำงานได้ทุกแพลตฟอร์มรวมถึง iOS)
 */
function tryZxing(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const lum = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < img.data.length; i += 4, j++) {
    lum[j] = ((img.data[i] * 66 + img.data[i + 1] * 129 + img.data[i + 2] * 25 + 128) >> 8);
  }
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  try {
    const reader = new MultiFormatReader();
    reader.setHints(hints);
    const result = reader.decode(
      new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, width, height)))
    );
    return [result.getText()];
  } catch { return []; }
}

/** 3. Tesseract อ่านตัวเลข */
async function ocrDigits(canvas) {
  try {
    const worker = await getDigitWorker();
    const { data } = await worker.recognize(canvas);
    return extractBarcodeCandidates(data.text || '');
  } catch { return []; }
}

/** 4. Tesseract อ่านข้อความเต็ม → แยก Serial + Size */
async function ocrFullText(canvas) {
  try {
    const worker = await getFullWorker();
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } catch { return ''; }
}

/** แยก Serial และ Size จากข้อความบนป้าย */
export function parseSerialAndSize(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let serial = null;
  let size = null;

  for (const line of lines) {
    // จับ Serial จากรูปแบบ "Serial: WS701BC" หรือ "รหัส: ..."
    const serialMatch = line.match(/(?:serial|รหัส|:)\s*([A-Z]{1,4}[\w-]{2,10})/i);
    if (serialMatch && !serial) serial = serialMatch[1].trim();

    // Serial standalone เช่น WS701BC, CGE-804
    if (!serial && /^[A-Z]{2,4}[\d-][A-Z0-9-]{2,10}$/i.test(line)) {
      serial = line;
    }

    // จับ Size จากรูปแบบ "Size: M" หรือ "ไซส์: L"
    const sizeMatch = line.match(/(?:size|ไซส์|ขนาด|:)\s*([A-Z0-9]{1,5})/i);
    if (sizeMatch && !size) size = sizeMatch[1].trim();

    // Size standalone เช่น M, L, XL, 32, 34
    if (!size && /^(XS|S|M|L|XL|XXL|2XL|3XL|\d{2})\s*$/.test(line.toUpperCase())) {
      size = line.toUpperCase().trim();
    }
  }

  return { serial, size };
}

// ─── Build scan variants (หมุน + crop หลายมุม) ────────────────────────────────
function buildVariants(base) {
  // ลอง 4 ทิศ เพราะรูปจาก iPhone อาจหมุนค้างอยู่
  const rotations = [0, 90, 180, 270];
  const cropRegions = [
    [0, 0.20, 1, 0.60],  // กลางบน
    [0, 0.30, 1, 0.50],  // กลาง
    [0, 0.40, 1, 0.40],  // กลางแน่น
    [0, 0.50, 1, 0.50],  // ครึ่งล่าง
    [0.05, 0.25, 0.9, 0.55], // ตัดขอบ
  ];
  const variants = [];
  for (const deg of rotations) {
    const r = deg === 0 ? base : rotate(base, deg);
    variants.push(r);
    for (const [rx, ry, rw, rh] of cropRegions) {
      variants.push(crop(r, rx, ry, rw, rh));
    }
  }
  return variants;
}

async function fetchPythonBarcodes(imageSrc) {
  try {
    const { data } = await api.post('/scan/decode-image', { image: imageSrc });
    return Array.isArray(data?.candidates)
      ? data.candidates.map((value) => String(value).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function extractSerialAndSize(base) {
  const serialSet = new Set();
  let detectedSize = null;

  const textTargets = [
    base,
    yellowToBinary(clone(base)),
    reduceGlare(clone(base)),
    crop(base, 0, 0, 1, 0.65),
    crop(base, 0.05, 0.05, 0.9, 0.75),
  ];

  for (const c of textTargets) {
    const text = await ocrFullText(c);
    const { serial, size } = parseSerialAndSize(text);
    if (serial) serialSet.add(serial);
    if (size && !detectedSize) detectedSize = size;
  }

  return { serialCandidates: [...serialSet], size: detectedSize };
}

// ─── Main Export ──────────────────────────────────────────────────────────────
/**
 * อ่านบาร์โค้ดจาก dataURL
 * รองรับ: Android Chrome, iPhone iOS Safari, Desktop
 *
 * @returns {{ candidates: string[], serialCandidates: string[], size: string|null }}
 */
export async function recognizeBarcodesFromImage(imageSrc) {
  const correctedSrc = await fixExifOrientation(imageSrc);
  const img = await loadImage(correctedSrc);
  const raw = toCanvas(img);
  const base = upscale(raw);

  const barcodeSet = new Set();
  const addBarcodes = (arr) => arr.forEach((v) => { if (v) barcodeSet.add(String(v).trim()); });

  addBarcodes(await fetchPythonBarcodes(imageSrc));

  const hasValidEan = () => [...barcodeSet].some(isValidEan13);

  if (!hasValidEan()) {
    const preprocessed = [
      base,
      reduceGlare(clone(base)),
      yellowToBinary(clone(base)),
      enhanceForOcr(clone(base)),
    ];

    const scanVariants = [];
    for (const pre of preprocessed) {
      scanVariants.push(...buildVariants(pre));
    }

    for (const canvas of scanVariants) {
      addBarcodes(await tryNativeDetector(canvas));
      addBarcodes(tryZxing(canvas));
      if (hasValidEan()) break;
    }
  }

  if (!hasValidEan()) {
    const ocrTargets = [
      base,
      reduceGlare(clone(base)),
      yellowToBinary(clone(base)),
      enhanceForOcr(clone(base)),
      crop(base, 0, 0.4, 1, 0.45),
      crop(base, 0, 0.5, 1, 0.5),
    ];

    for (const c of ocrTargets) {
      const nums = await ocrDigits(c);
      nums.forEach((n) => barcodeSet.add(n));
      if (hasValidEan()) break;
    }
  }

  const { serialCandidates, size } = await extractSerialAndSize(base);

  if (!hasValidEan()) {
    const textTargets = [
      base,
      yellowToBinary(clone(base)),
      reduceGlare(clone(base)),
      crop(base, 0, 0, 1, 0.65),
    ];
    for (const c of textTargets) {
      const text = await ocrFullText(c);
      extractBarcodeCandidates(text).forEach((n) => barcodeSet.add(n));
    }
  }

  const sortedBarcodes = [...barcodeSet].sort((a, b) => scoreBarcode(b) - scoreBarcode(a));
  return {
    candidates: sortedBarcodes,
    serialCandidates,
    size,
  };
}
