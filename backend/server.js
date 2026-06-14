require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database');
const path = require('path');
const multer = require('multer');
const { decodeBarcodeFromBase64 } = require('./barcodeService');

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_jeans_key';

app.use(cors());
app.use(express.json({ limit: '15mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});
const upload = multer({ storage: storage });

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }
  next();
}

// --- Auth Routes ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const { rows } = await db.query("SELECT * FROM users WHERE username = $1", [username]);
    if (rows.length === 0) return res.status(400).json({ error: "User not found" });

    const user = rows[0];
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, SECRET_KEY, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err), stack: err.stack });
  }
});

app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT id, username, name, role, plain_password FROM users");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
  const { username, password, name, role } = req.body;
  const hash = bcrypt.hashSync(password, 8);
  try {
    const { rows } = await db.query(
      "INSERT INTO users (username, password, plain_password, name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [username, hash, password, name, role]
    );
    res.json({ id: rows[0].id, username, name, role, plain_password: password });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Product Routes ---
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    const productsRes = await db.query("SELECT * FROM products");
    const variantsRes = await db.query("SELECT * FROM product_variants");
    
    const result = productsRes.rows.map(p => ({
      ...p,
      variants: variantsRes.rows.filter(v => v.product_id === p.id)
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/by-serial/:serial', authenticateToken, async (req, res) => {
  const normalizedSerial = String(req.params.serial || '').trim();
  if (!normalizedSerial) {
    return res.status(400).json({ error: 'กรุณาระบุรหัสสินค้า (Serial)' });
  }

  try {
    const productRes = await db.query(
      'SELECT * FROM products WHERE UPPER(serial) = UPPER($1)',
      [normalizedSerial]
    );
    if (productRes.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบสินค้า' });
    }

    const product = productRes.rows[0];
    const variantsRes = await db.query(
      'SELECT * FROM product_variants WHERE product_id = $1 ORDER BY size, barcode',
      [product.id]
    );

    res.json({ ...product, variants: variantsRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', authenticateToken, requireAdmin, async (req, res) => {
  const { serial, name, price, variants } = req.body;
  const normalizedSerial = String(serial || '').trim();

  if (!normalizedSerial) {
    return res.status(400).json({ error: 'กรุณาระบุรหัสสินค้า (Serial)' });
  }

  const normalizedVariants = (variants || [])
    .filter((v) => v.size?.trim() && v.barcode?.trim())
    .map((v) => ({ size: v.size.trim(), barcode: v.barcode.trim() }));

  if (normalizedVariants.length === 0) {
    return res.status(400).json({ error: 'กรุณาเพิ่มขนาดและบาร์โค้ดอย่างน้อย 1 รายการ' });
  }

  const barcodeSet = new Set();
  for (const variant of normalizedVariants) {
    if (barcodeSet.has(variant.barcode)) {
      return res.status(400).json({ error: `บาร์โค้ด ${variant.barcode} ซ้ำในรายการ แต่ละบาร์โค้ดต้องไม่เหมือนกัน` });
    }
    barcodeSet.add(variant.barcode);
  }

  for (const variant of normalizedVariants) {
    const duplicateBarcode = await db.query(
      'SELECT id FROM product_variants WHERE barcode = $1',
      [variant.barcode]
    );
    if (duplicateBarcode.rows.length > 0) {
      return res.status(400).json({ error: `บาร์โค้ด ${variant.barcode} ถูกใช้งานแล้วในระบบ` });
    }
  }

  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const existingProductRes = await client.query(
      'SELECT * FROM products WHERE UPPER(serial) = UPPER($1)',
      [normalizedSerial]
    );
    const isExistingProduct = existingProductRes.rows.length > 0;

    if (!isExistingProduct) {
      if (!name?.trim() || price === undefined || price === null || price === '') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'กรุณากรอกข้อมูลสินค้าหลักให้ครบถ้วน' });
      }
    }

    let productId;
    let productName;
    let productPrice;

    if (isExistingProduct) {
      const existing = existingProductRes.rows[0];
      productId = existing.id;
      productName = existing.name;
      productPrice = existing.price;
    } else {
      const productRes = await client.query(
        'INSERT INTO products (serial, name, price) VALUES ($1, $2, $3) RETURNING id, name, price',
        [normalizedSerial, name.trim(), price]
      );
      productId = productRes.rows[0].id;
      productName = productRes.rows[0].name;
      productPrice = productRes.rows[0].price;
    }

    const insertedVariants = [];

    for (const variant of normalizedVariants) {
      const variantRes = await client.query(
        'INSERT INTO product_variants (product_id, size, barcode, stock_quantity) VALUES ($1, $2, $3, 1) RETURNING *',
        [productId, variant.size, variant.barcode]
      );

      await client.query(
        'INSERT INTO transactions (variant_id, user_id, type, quantity) VALUES ($1, $2, $3, $4)',
        [variantRes.rows[0].id, req.user.id, 'receive', 1]
      );

      insertedVariants.push(variantRes.rows[0]);
    }

    await client.query('COMMIT');
    res.json({
      id: productId,
      serial: isExistingProduct ? existingProductRes.rows[0].serial : normalizedSerial,
      name: productName,
      price: productPrice,
      variants: insertedVariants,
      added_to_existing: isExistingProduct,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505' && err.constraint?.includes('barcode')) {
      return res.status(400).json({ error: 'บาร์โค้ดนี้ถูกใช้งานแล้วในระบบ' });
    }
    if (err.code === '23505' && err.constraint?.includes('serial')) {
      return res.status(400).json({ error: 'รหัสสินค้า (Serial) นี้มีในระบบแล้ว — ระบบจะเพิ่มบาร์โค้ดเข้ารุ่นเดิม' });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.put('/api/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const { serial, name, price } = req.body;

  if (!serial?.trim() || !name?.trim() || price === undefined || price === null || price === '') {
    return res.status(400).json({ error: 'กรุณากรอกข้อมูลรุ่นให้ครบถ้วน' });
  }

  try {
    const existing = await db.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบสินค้า' });
    }

    const normalizedSerial = serial.trim();
    const duplicate = await db.query(
      'SELECT id FROM products WHERE serial = $1 AND id != $2',
      [normalizedSerial, productId]
    );
    if (duplicate.rows.length > 0) {
      return res.status(400).json({ error: 'รหัสรุ่น (Serial) นี้ถูกใช้งานแล้ว' });
    }

    const result = await db.query(
      'UPDATE products SET serial = $1, name = $2, price = $3 WHERE id = $4 RETURNING *',
      [normalizedSerial, name.trim(), Number(price), productId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'รหัสรุ่น (Serial) นี้ถูกใช้งานแล้ว' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  const productId = parseInt(req.params.id, 10);

  try {
    const existing = await db.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบสินค้า' });
    }

    await db.query('DELETE FROM products WHERE id = $1', [productId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/:id/variants', authenticateToken, requireAdmin, async (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const { size, barcode } = req.body;

  if (!size?.trim() || !barcode?.trim()) {
    return res.status(400).json({ error: 'กรุณากรอกไซส์และบาร์โค้ด' });
  }

  const normalizedSize = size.trim();
  const normalizedBarcode = barcode.trim();

  try {
    const productRes = await db.query('SELECT id, serial, name FROM products WHERE id = $1', [productId]);
    if (productRes.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบสินค้า' });
    }

    const existingBarcode = await db.query(
      'SELECT id FROM product_variants WHERE barcode = $1',
      [normalizedBarcode]
    );
    if (existingBarcode.rows.length > 0) {
      return res.status(400).json({ error: 'บาร์โค้ดนี้ถูกใช้งานแล้ว' });
    }

    const variantRes = await db.query(
      'INSERT INTO product_variants (product_id, size, barcode, stock_quantity) VALUES ($1, $2, $3, 0) RETURNING *',
      [productId, normalizedSize, normalizedBarcode]
    );

    res.json({
      product: productRes.rows[0],
      variant: variantRes.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/:id/upload', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image file provided" });
  const imageUrl = `/uploads/${req.file.filename}`;
  try {
    await db.query("UPDATE products SET image_url = $1 WHERE id = $2", [imageUrl, req.params.id]);
    res.json({ imageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Scanner / Transactions ---
const SCAN_PRODUCT_SQL = `
  SELECT pv.id as variant_id, pv.size, pv.barcode, pv.stock_quantity,
         p.id as product_id, p.serial, p.name, p.price, p.image_url,
         (SELECT COUNT(*) FROM product_variants pv2
          WHERE pv2.product_id = p.id AND LOWER(pv2.size) = LOWER(pv.size) AND pv2.stock_quantity > 0) as size_total_stock,
         (SELECT COUNT(*) FROM product_variants pv2
          WHERE pv2.product_id = p.id AND LOWER(pv2.size) = LOWER(pv.size)) as size_barcode_count
  FROM product_variants pv
  JOIN products p ON pv.product_id = p.id
  WHERE pv.barcode = $1
`;

async function buildScanResponse(barcode) {
  const { rows } = await db.query(SCAN_PRODUCT_SQL, [barcode]);
  if (rows.length === 0) return null;

  const product = rows[0];
  const sizeStockRes = await db.query(
    `SELECT MIN(size) as size,
            COUNT(*) FILTER (WHERE stock_quantity > 0) as in_stock_count,
            COUNT(*) as barcode_count
     FROM product_variants
     WHERE product_id = $1
     GROUP BY LOWER(size)
     ORDER BY MIN(size)`,
    [product.product_id]
  );

  const sizeStock = sizeStockRes.rows.map((row) => ({
    size: row.size,
    total_pieces: parseInt(row.barcode_count, 10),
    in_stock: parseInt(row.in_stock_count, 10),
    barcode_count: parseInt(row.barcode_count, 10),
  }));

  const totalPiecesRes = await db.query(
    'SELECT COUNT(*) as total FROM product_variants WHERE product_id = $1',
    [product.product_id]
  );
  const inStockRes = await db.query(
    'SELECT COUNT(*) as total FROM product_variants WHERE product_id = $1 AND stock_quantity > 0',
    [product.product_id]
  );

  return {
    ...product,
    size_stock: sizeStock,
    product_total_pieces: parseInt(totalPiecesRes.rows[0].total, 10),
    product_in_stock: parseInt(inStockRes.rows[0].total, 10),
    product_total_stock: parseInt(totalPiecesRes.rows[0].total, 10),
  };
}

app.get('/api/scan/:barcode', authenticateToken, async (req, res) => {
  try {
    const result = await buildScanResponse(req.params.barcode);
    if (!result) return res.status(404).json({ error: 'Barcode not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scan/decode-image', authenticateToken, async (req, res) => {
  const { image } = req.body;

  if (!image) {
    return res.status(400).json({ error: 'กรุณาส่งรูปภาพ (image base64)' });
  }

  try {
    const result = await decodeBarcodeFromBase64(image);
    res.json(result);
  } catch (err) {
    res.status(503).json({
      error: 'ระบบอ่านบาร์โค้ด Python ยังไม่พร้อม',
      detail: err.message,
      candidates: [],
    });
  }
});

app.post('/api/scan/resolve', authenticateToken, async (req, res) => {
  const { candidates = [], serialCandidates = [], size } = req.body;

  const uniqueBarcodes = [...new Set(
    (Array.isArray(candidates) ? candidates : []).map((c) => String(c).trim()).filter(Boolean)
  )].slice(0, 20);

  const uniqueSerials = [...new Set(
    (Array.isArray(serialCandidates) ? serialCandidates : []).map((s) => String(s).trim()).filter(Boolean)
  )].slice(0, 10);

  const normalizedSize = size ? String(size).trim() : null;

  try {
    for (const barcode of uniqueBarcodes) {
      const result = await buildScanResponse(barcode);
      if (result) {
        return res.json({ ...result, matched_barcode: barcode, match_method: 'barcode' });
      }
    }

    if (uniqueSerials.length > 0) {
      for (const serial of uniqueSerials) {
        const lookupSize = normalizedSize || null;
        const sql = lookupSize
          ? `SELECT pv.barcode
             FROM product_variants pv
             JOIN products p ON pv.product_id = p.id
             WHERE UPPER(p.serial) LIKE $1
               AND LOWER(pv.size) = LOWER($2)
             LIMIT 1`
          : `SELECT pv.barcode
             FROM product_variants pv
             JOIN products p ON pv.product_id = p.id
             WHERE UPPER(p.serial) LIKE $1
             LIMIT 1`;
        const params = lookupSize ? [`${serial.toUpperCase()}%`, lookupSize] : [`${serial.toUpperCase()}%`];
        const { rows } = await db.query(sql, params);
        if (rows.length > 0) {
          const result = await buildScanResponse(rows[0].barcode);
          if (result) {
            return res.json({
              ...result,
              matched_barcode: rows[0].barcode,
              match_method: 'serial_size',
              matched_serial: serial,
            });
          }
        }
      }
    }

    return res.status(404).json({
      error: 'Barcode not found',
      tried: uniqueBarcodes,
      tried_serials: uniqueSerials,
      tried_size: normalizedSize,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/variants/:id', authenticateToken, requireAdmin, async (req, res) => {
  const variantId = parseInt(req.params.id, 10);
  const { size, barcode, stock_quantity } = req.body;

  try {
    const existing = await db.query('SELECT * FROM product_variants WHERE id = $1', [variantId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการบาร์โค้ด' });
    }

    const current = existing.rows[0];
    const nextSize = size?.trim() || current.size;
    const nextBarcode = barcode?.trim() || current.barcode;
    let nextStock = current.stock_quantity;

    if (stock_quantity !== undefined) {
      const parsedStock = parseInt(stock_quantity, 10);
      if (![0, 1].includes(parsedStock)) {
        return res.status(400).json({ error: 'สต๊อกต่อบาร์โค้ดต้องเป็น 0 หรือ 1 เท่านั้น' });
      }
      nextStock = parsedStock;
    }

    if (nextBarcode !== current.barcode) {
      const duplicate = await db.query('SELECT id FROM product_variants WHERE barcode = $1 AND id != $2', [nextBarcode, variantId]);
      if (duplicate.rows.length > 0) {
        return res.status(400).json({ error: 'บาร์โค้ดนี้ถูกใช้งานแล้ว' });
      }
    }

    const updated = await db.query(
      'UPDATE product_variants SET size = $1, barcode = $2, stock_quantity = $3 WHERE id = $4 RETURNING *',
      [nextSize, nextBarcode, nextStock > 0 ? 1 : 0, variantId]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/variants/:id', authenticateToken, requireAdmin, async (req, res) => {
  const variantId = parseInt(req.params.id, 10);

  try {
    const existing = await db.query('SELECT * FROM product_variants WHERE id = $1', [variantId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบรายการบาร์โค้ด' });
    }

    await db.query('DELETE FROM product_variants WHERE id = $1', [variantId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transaction', authenticateToken, async (req, res) => {
  const { variant_id, type, quantity } = req.body;

  try {
    const { rows } = await db.query('SELECT stock_quantity FROM product_variants WHERE id = $1', [variant_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Variant not found' });

    const currentStock = rows[0].stock_quantity > 0 ? 1 : 0;
    let newStock = currentStock;
    let actualChange = 0;

    if (type === 'sell') {
      if (currentStock < 1) return res.status(400).json({ error: 'บาร์โค้ดนี้ไม่อยู่ในสต๊อก' });
      newStock = 0;
      actualChange = 1;
    } else if (type === 'receive' || type === 'return') {
      if (currentStock >= 1) return res.status(400).json({ error: 'บาร์โค้ดนี้อยู่ในสต๊อกแล้ว' });
      newStock = 1;
      actualChange = 1;
    } else if (type === 'adjust') {
      const targetStock = parseInt(quantity, 10);
      if (![0, 1].includes(targetStock)) {
        return res.status(400).json({ error: 'สต๊อกต่อบาร์โค้ดต้องเป็น 0 หรือ 1 เท่านั้น' });
      }
      actualChange = targetStock - currentStock;
      newStock = targetStock;
    } else {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    await db.query('UPDATE product_variants SET stock_quantity = $1 WHERE id = $2', [newStock, variant_id]);

    await db.query(
      'INSERT INTO transactions (variant_id, user_id, type, quantity) VALUES ($1, $2, $3, $4)',
      [variant_id, req.user.id, type, actualChange]
    );

    res.json({ success: true, newStock });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Dashboard & Reports ---
const SALES_JOIN_SQL = `
  FROM transactions t
  JOIN product_variants pv ON t.variant_id = pv.id
  JOIN products p ON pv.product_id = p.id
  WHERE t.type = 'sell'
`;

function parsePagination(query, defaults = { page: 1, pageSize: 10 }) {
  const page = Math.max(1, parseInt(query.page, 10) || defaults.page);
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || defaults.pageSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function buildPaginatedResponse(items, total, page, pageSize) {
  const totalCount = parseInt(total, 10) || 0;
  return {
    items,
    page,
    pageSize,
    total: totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

app.get('/api/dashboard', authenticateToken, async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const month = parseInt(req.query.month, 10) || (now.getMonth() + 1);

  if (month < 1 || month > 12) {
    return res.status(400).json({ error: 'เดือนไม่ถูกต้อง' });
  }
  if (year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'ปีไม่ถูกต้อง' });
  }

  const today = now.toISOString().split('T')[0];

  const dashboard = {
    salesToday: 0,
    salesMonth: 0,
    year,
    month,
    totalItems: 0,
    lowStockItems: [],
    outOfStockItems: []
  };

  try {
    const salesTodayRes = await db.query(
      `SELECT COALESCE(SUM(t.quantity * p.price), 0) as total ${SALES_JOIN_SQL} AND DATE(t.timestamp) = $1::date`,
      [today]
    );
    dashboard.salesToday = parseFloat(salesTodayRes.rows[0].total);

    const salesMonthRes = await db.query(
      `SELECT COALESCE(SUM(t.quantity * p.price), 0) as total ${SALES_JOIN_SQL}
       AND EXTRACT(YEAR FROM t.timestamp) = $1
       AND EXTRACT(MONTH FROM t.timestamp) = $2`,
      [year, month]
    );
    dashboard.salesMonth = parseFloat(salesMonthRes.rows[0].total);

    const totalRes = await db.query('SELECT COUNT(*) as total FROM product_variants');
    dashboard.totalItems = parseInt(totalRes.rows[0].total, 10) || 0;

    const lowStockRes = await db.query("SELECT p.name, p.serial, pv.size, pv.stock_quantity FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE pv.stock_quantity > 0 AND pv.stock_quantity <= 5 LIMIT 10");
    dashboard.lowStockItems = lowStockRes.rows;

    const outStockRes = await db.query("SELECT p.name, p.serial, pv.size, pv.stock_quantity FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE pv.stock_quantity = 0 LIMIT 10");
    dashboard.outOfStockItems = outStockRes.rows;

    res.json(dashboard);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/monthly-sales', authenticateToken, async (req, res) => {
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();
  const { page, pageSize, offset } = parsePagination(req.query);

  if (year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'ปีไม่ถูกต้อง' });
  }

  try {
    const countRes = await db.query(
      `SELECT COUNT(*) as total FROM (
         SELECT 1
         ${SALES_JOIN_SQL}
         AND EXTRACT(YEAR FROM t.timestamp) = $1
         GROUP BY EXTRACT(MONTH FROM t.timestamp), p.serial, p.name, pv.size
       ) grouped`,
      [year]
    );

    const { rows } = await db.query(
      `SELECT
         EXTRACT(MONTH FROM t.timestamp)::int as month,
         p.serial,
         p.name,
         pv.size,
         COALESCE(SUM(t.quantity), 0)::int as quantity,
         COALESCE(SUM(t.quantity * p.price), 0) as total
       ${SALES_JOIN_SQL}
       AND EXTRACT(YEAR FROM t.timestamp) = $1
       GROUP BY EXTRACT(MONTH FROM t.timestamp), p.serial, p.name, pv.size
       ORDER BY month DESC, p.serial, pv.size
       LIMIT $2 OFFSET $3`,
      [year, pageSize, offset]
    );

    res.json(buildPaginatedResponse(
      rows.map((row) => ({
        month: row.month,
        serial: row.serial,
        name: row.name,
        size: row.size,
        quantity: row.quantity,
        total: parseFloat(row.total),
      })),
      countRes.rows[0].total,
      page,
      pageSize
    ));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/daily-sales', authenticateToken, async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const month = parseInt(req.query.month, 10) || (now.getMonth() + 1);
  const { page, pageSize, offset } = parsePagination(req.query);

  if (month < 1 || month > 12) {
    return res.status(400).json({ error: 'เดือนไม่ถูกต้อง' });
  }
  if (year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'ปีไม่ถูกต้อง' });
  }

  try {
    const countRes = await db.query(
      `SELECT COUNT(*) as total FROM (
         SELECT 1
         ${SALES_JOIN_SQL}
         AND EXTRACT(YEAR FROM t.timestamp) = $1
         AND EXTRACT(MONTH FROM t.timestamp) = $2
         GROUP BY DATE(t.timestamp), p.serial, p.name, pv.size
       ) grouped`,
      [year, month]
    );

    const { rows } = await db.query(
      `SELECT
         DATE(t.timestamp) as date,
         p.serial,
         p.name,
         pv.size,
         COALESCE(SUM(t.quantity), 0)::int as quantity,
         COALESCE(SUM(t.quantity * p.price), 0) as total
       ${SALES_JOIN_SQL}
       AND EXTRACT(YEAR FROM t.timestamp) = $1
       AND EXTRACT(MONTH FROM t.timestamp) = $2
       GROUP BY DATE(t.timestamp), p.serial, p.name, pv.size
       ORDER BY date DESC, p.serial, pv.size
       LIMIT $3 OFFSET $4`,
      [year, month, pageSize, offset]
    );

    res.json(buildPaginatedResponse(
      rows.map((row) => ({
        date: row.date,
        serial: row.serial,
        name: row.name,
        size: row.size,
        quantity: row.quantity,
        total: parseFloat(row.total),
      })),
      countRes.rows[0].total,
      page,
      pageSize
    ));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/transactions', authenticateToken, async (req, res) => {
  const sql = `
    SELECT t.id, t.type, t.quantity, t.timestamp, p.name, p.serial, pv.size, u.username as user
    FROM transactions t
    JOIN product_variants pv ON t.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    JOIN users u ON t.user_id = u.id
    ORDER BY t.timestamp DESC
    LIMIT 100
  `;
  try {
    const { rows } = await db.query(sql);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
