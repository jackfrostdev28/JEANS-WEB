const db = require('./database');

setTimeout(async () => {
  try {
    const products = [
      {
        serial: 'CGE-804',
        name: 'Cargo Jogger',
        price: 1380,
        variants: [
          { size: 'S', barcode: '8859651409061', stock: 1 },
          { size: 'M', barcode: '8859651409062', stock: 1 },
          { size: 'L', barcode: '8859651409063', stock: 1 },
          { size: 'XL', barcode: '8859651409064', stock: 1 },
        ],
      },
      {
        serial: 'WS701BC',
        name: 'Light NYJ Jeans',
        price: 990,
        variants: [
          { size: 'S', barcode: '8859651541421', stock: 1 },
          { size: 'M', barcode: '8859651541422', stock: 1 },
          { size: 'L', barcode: '8859651541423', stock: 1 },
          { size: 'XL', barcode: '8859651541424', stock: 0 },
        ],
      },
    ];

    for (const product of products) {
      const checkRes = await db.query('SELECT id FROM products WHERE serial = $1', [product.serial]);
      if (checkRes.rows.length > 0) {
        console.log(`Already seeded: ${product.serial}`);
        continue;
      }

      const insertProductRes = await db.query(
        'INSERT INTO products (serial, name, price) VALUES ($1, $2, $3) RETURNING id',
        [product.serial, product.name, product.price]
      );
      const productId = insertProductRes.rows[0].id;

      for (const variant of product.variants) {
        await db.query(
          'INSERT INTO product_variants (product_id, size, barcode, stock_quantity) VALUES ($1, $2, $3, $4)',
          [productId, variant.size, variant.barcode, variant.stock]
        );
      }

      console.log(`Seeded ${product.serial} successfully!`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}, 2000);
