import React, { useEffect, useState } from 'react';
import api from '../api';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products');
      setProducts(res.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  if (loading) return <div>กำลังโหลดข้อมูลสินค้า...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>สต๊อกสินค้าทั้งหมด</h1>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>รูปภาพ</th>
                <th>รหัส (Serial)</th>
                <th>ชื่อสินค้า</th>
                <th>ราคา</th>
                <th>ไซส์ & คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => {
                const totalStock = product.variants.reduce((acc, v) => acc + v.stock_quantity, 0);
                return (
                  <tr key={product.id}>
                    <td>
                      {product.image_url ? (
                        <img src={`http://localhost:5000${product.image_url}`} alt={product.name} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }} />
                      ) : (
                        <div style={{ width: '50px', height: '50px', background: '#e2e8f0', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: '#64748b' }}>ไม่มีรูป</div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{product.serial}</td>
                    <td>{product.name}</td>
                    <td>฿{product.price.toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        {product.variants.map(v => (
                          <div key={v.id} style={{ padding: '0.25rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.875rem' }}>
                            <strong>{v.size}:</strong> {v.stock_quantity}
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{v.barcode}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--primary-dark)' }}>
                        รวมทั้งหมด: {totalStock}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center text-muted">ไม่พบข้อมูลสินค้า</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Products;
