const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PYTHON = process.env.PYTHON_PATH || 'python';
const SCRIPT = path.join(__dirname, 'barcode_reader.py');

function decodeBarcodeFromBuffer(imageBuffer) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Python ไม่พร้อมใช้งาน: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `barcode_reader.py exited with code ${code}`));
        return;
      }

      try {
        const payload = JSON.parse(stdout.trim() || '{}');
        resolve({
          candidates: Array.isArray(payload.candidates) ? payload.candidates : [],
          results: Array.isArray(payload.results) ? payload.results : [],
          method: payload.method || 'unknown',
        });
      } catch (err) {
        reject(new Error(`อ่านผลจาก Python ไม่สำเร็จ: ${err.message}`));
      }
    });

    child.stdin.write(imageBuffer);
    child.stdin.end();
  });
}

function decodeBarcodeFromBase64(dataUrl) {
  const base64 = String(dataUrl || '').replace(/^data:image\/\w+;base64,/, '');
  if (!base64) {
    return Promise.resolve({ candidates: [], results: [], method: 'empty' });
  }
  return decodeBarcodeFromBuffer(Buffer.from(base64, 'base64'));
}

function decodeBarcodeFromFile(filePath) {
  return decodeBarcodeFromBuffer(fs.readFileSync(filePath));
}

module.exports = {
  decodeBarcodeFromBase64,
  decodeBarcodeFromBuffer,
  decodeBarcodeFromFile,
};
