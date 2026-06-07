require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./database');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_jeans_key';

app.use(cors());
app.use(express.json());

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
    if (err) return res.sendStatus(403);
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
    const { rows } = await db.query("SELECT id, username, name, role FROM users");
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
      "INSERT INTO users (username, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id",
      [username, hash, name, role]
    );
    res.json({ id: rows[0].id, username, name, role });
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

app.post('/api/products', authenticateToken, requireAdmin, async (req, res) => {
  const { serial, name, price, variants } = req.body;
  try {
    const normalizedVariants = (variants || [])
      .filter((v) => v.size?.trim() && v.barcode?.trim())
      .map((v) => ({ size: v.size.trim(), barcode: v.barcode.trim() }));

    const barcodeSet = new Set();
    for (const variant of normalizedVariants) {
      if (barcodeSet.has(variant.barcode)) {
        return res.status(400).json({ error: `บาร์โค้ด ${variant.barcode} ซ้ำในรายการ แต่ละบาร์โค้ดต้องไม่เหมือนกัน` });
      }
      barcodeSet.add(variant.barcode);
    }

    const productRes = await db.query(
      "INSERT INTO products (serial, name, price) VALUES ($1, $2, $3) RETURNING id",
      [serial, name, price]
    );
    const productId = productRes.rows[0].id;
    
    for (const variant of normalizedVariants) {
      await db.query(
        "INSERT INTO product_variants (product_id, size, barcode, stock_quantity) VALUES ($1, $2, $3, 0)",
        [productId, variant.size, variant.barcode]
      );
    }
    res.json({ id: productId, serial, name, price, variants: normalizedVariants });
  } catch (err) {
    if (err.code === '23505' && err.constraint?.includes('barcode')) {
      return res.status(400).json({ error: 'บาร์โค้ดนี้ถูกใช้งานแล้วในระบบ' });
    }
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
app.get('/api/scan/:barcode', authenticateToken, async (req, res) => {
  const barcode = req.params.barcode;
  const sql = `
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
  try {
    const { rows } = await db.query(sql, [barcode]);
    if (rows.length === 0) return res.status(404).json({ error: "Barcode not found" });

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
      total_stock: parseInt(row.in_stock_count, 10),
      barcode_count: parseInt(row.barcode_count, 10),
    }));

    res.json({
      ...product,
      size_stock: sizeStock,
      product_total_stock: sizeStock.reduce((sum, s) => sum + s.total_stock, 0),
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
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  const today = new Date().toISOString().split('T')[0] + '%';
  const thisMonth = new Date().toISOString().substring(0, 7) + '%';
  
  const dashboard = {
    salesToday: 0,
    salesMonth: 0,
    totalItems: 0,
    lowStockItems: [],
    outOfStockItems: []
  };

  try {
    const salesTodayRes = await db.query("SELECT SUM(t.quantity * p.price) as total FROM transactions t JOIN product_variants pv ON t.variant_id = pv.id JOIN products p ON pv.product_id = p.id WHERE t.type = 'sell' AND CAST(t.timestamp AS TEXT) LIKE $1", [today]);
    if (salesTodayRes.rows[0].total) dashboard.salesToday = parseFloat(salesTodayRes.rows[0].total);

    const salesMonthRes = await db.query("SELECT SUM(t.quantity * p.price) as total FROM transactions t JOIN product_variants pv ON t.variant_id = pv.id JOIN products p ON pv.product_id = p.id WHERE t.type = 'sell' AND CAST(t.timestamp AS TEXT) LIKE $1", [thisMonth]);
    if (salesMonthRes.rows[0].total) dashboard.salesMonth = parseFloat(salesMonthRes.rows[0].total);

    const totalRes = await db.query("SELECT COUNT(*) as total FROM product_variants WHERE stock_quantity > 0");
    if (totalRes.rows[0].total) dashboard.totalItems = parseInt(totalRes.rows[0].total);

    const lowStockRes = await db.query("SELECT p.name, p.serial, pv.size, pv.stock_quantity FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE pv.stock_quantity > 0 AND pv.stock_quantity <= 5 LIMIT 10");
    dashboard.lowStockItems = lowStockRes.rows;

    const outStockRes = await db.query("SELECT p.name, p.serial, pv.size, pv.stock_quantity FROM product_variants pv JOIN products p ON pv.product_id = p.id WHERE pv.stock_quantity = 0 LIMIT 10");
    dashboard.outOfStockItems = outStockRes.rows;
    
    res.json(dashboard);
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
