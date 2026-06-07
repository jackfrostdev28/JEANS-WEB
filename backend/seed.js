const db = require('./database');

setTimeout(async () => {
  try {
    console.log("Seeding Cargo Jogger to PostgreSQL...");
    
    // Check if already seeded
    const checkRes = await db.query("SELECT id FROM products WHERE serial = $1", ["CGE-804"]);
    if (checkRes.rows.length > 0) {
      console.log("Already seeded.");
      process.exit(0);
    }

    const insertProductRes = await db.query(
      "INSERT INTO products (serial, name, price) VALUES ($1, $2, $3) RETURNING id",
      ["CGE-804", "Cargo Jogger", 1380]
    );
    const productId = insertProductRes.rows[0].id;
    
    const variants = [
      { size: 'S', barcode: '8859651409061', stock: 1 },
      { size: 'M', barcode: '8859651409062', stock: 1 },
      { size: 'L', barcode: '8859651409063', stock: 1 },
      { size: 'XL', barcode: '8859651409064', stock: 1 },
    ];
    
    for (let v of variants) {
      await db.query(
        "INSERT INTO product_variants (product_id, size, barcode, stock_quantity) VALUES ($1, $2, $3, $4)",
        [productId, v.size, v.barcode, v.stock]
      );
    }
    
    console.log("Seeded Cargo Jogger successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}, 2000); // wait for DB init
