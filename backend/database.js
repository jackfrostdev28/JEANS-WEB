const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

async function initializeDatabase() {
  try {
    // 1. Users Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        plain_password VARCHAR(255),
        name VARCHAR(255),
        role VARCHAR(50) NOT NULL DEFAULT 'temporary'
      )
    `);

    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password VARCHAR(255)
    `);

    // 2. Products Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        serial VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        price NUMERIC NOT NULL,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. Product Variants Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
        size VARCHAR(50) NOT NULL,
        barcode VARCHAR(255) UNIQUE NOT NULL,
        stock_quantity INTEGER DEFAULT 0
      )
    `);

    // 4. Transactions Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        variant_id INTEGER NOT NULL REFERENCES product_variants (id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
        type VARCHAR(50) NOT NULL,
        quantity INTEGER NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 1 barcode = 1 piece: normalize legacy rows that stored quantity > 1
    await pool.query('UPDATE product_variants SET stock_quantity = 1 WHERE stock_quantity > 1');

    // Seed Admin User
    const res = await pool.query("SELECT id FROM users WHERE username = $1", ["admin"]);
    if (res.rows.length === 0) {
      const hash = bcrypt.hashSync("admin123", 8);
      await pool.query(
        "INSERT INTO users (username, password, plain_password, name, role) VALUES ($1, $2, $3, $4, $5)",
        ["admin", hash, "admin123", "Administrator", "admin"]
      );
      console.log("Admin user created in PostgreSQL (username: admin, password: admin123)");
    } else {
      await pool.query(
        "UPDATE users SET plain_password = $1 WHERE username = $2 AND plain_password IS NULL",
        ["admin123", "admin"]
      );
      console.log("Connected to PostgreSQL successfully.");
    }
  } catch (err) {
    console.error("Error initializing PostgreSQL database:", err);
  }
}

// Automatically init database on connect
initializeDatabase();

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};
