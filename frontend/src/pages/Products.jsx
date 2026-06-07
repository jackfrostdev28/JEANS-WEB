import React, { useContext, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import api from '../api';
import { AuthContext } from '../AuthContext';

const groupVariantsBySize = (variants) => {
  const groups = new Map();

  variants.forEach((variant) => {
    const sizeKey = variant.size.trim();
    if (!groups.has(sizeKey)) {
      groups.set(sizeKey, { size: sizeKey, variants: [], totalStock: 0 });
    }
    const group = groups.get(sizeKey);
    group.variants.push(variant);
    group.totalStock += variant.stock_quantity;
  });

  return Array.from(groups.values());
};

const Products = () => {
  const { user } = useContext(AuthContext);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [variantForm, setVariantForm] = useState({ size: '', barcode: '' });
  const [variantError, setVariantError] = useState('');
  const [variantLoading, setVariantLoading] = useState(false);

  const isAdmin = user?.role === 'admin';

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

  const openAddVariantModal = (product) => {
    setSelectedProduct(product);
    setVariantForm({ size: '', barcode: '' });
    setVariantError('');
  };

  const closeAddVariantModal = () => {
    setSelectedProduct(null);
    setVariantForm({ size: '', barcode: '' });
    setVariantError('');
  };

  const handleAddVariant = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;

    const size = variantForm.size.trim();
    const barcode = variantForm.barcode.trim();

    if (!size || !barcode) {
      setVariantError('กรุณากรอกไซส์และบาร์โค้ด');
      return;
    }

    const duplicateBarcode = selectedProduct.variants.some((v) => v.barcode === barcode);
    if (duplicateBarcode) {
      setVariantError('บาร์โค้ดนี้มีในรุ่นนี้แล้ว แต่ละบาร์โค้ดต้องไม่เหมือนกัน');
      return;
    }

    setVariantLoading(true);
    setVariantError('');

    try {
      await api.post(`/products/${selectedProduct.id}/variants`, { size, barcode });
      await fetchProducts();
      closeAddVariantModal();
    } catch (err) {
      setVariantError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการเพิ่มไซส์');
    } finally {
      setVariantLoading(false);
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
                {isAdmin && <th>จัดการ</th>}
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
                      <div className="size-groups">
                        {groupVariantsBySize(product.variants).map((group) => (
                          <div key={group.size} className="size-group">
                            <div className="size-group-header">
                              <strong>{group.size}</strong>
                              <span className="size-group-meta">
                                {group.variants.length} บาร์โค้ด · รวม {group.totalStock} ชิ้น
                              </span>
                            </div>
                            <div className="size-group-barcodes">
                              {group.variants.map((v, index) => (
                                <div key={v.id} className="barcode-row">
                                  <span className="barcode-code">#{index + 1} {v.barcode}</span>
                                  <span className="barcode-stock">{v.stock_quantity} ชิ้น</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--primary-dark)', marginTop: '0.5rem' }}>
                        รวมทั้งหมด: {totalStock}
                      </div>
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}
                          onClick={() => openAddVariantModal(product)}
                        >
                          <Plus size={16} /> เพิ่มไซส์/บาร์โค้ด
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="text-center text-muted">ไม่พบข้อมูลสินค้า</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProduct && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2>เพิ่มไซส์ / บาร์โค้ดให้รุ่นเดิม</h2>
              <button type="button" className="btn btn-outline" onClick={closeAddVariantModal}>ปิด</button>
            </div>

            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
              <p><strong>รหัส (Serial):</strong> {selectedProduct.serial}</p>
              <p><strong>ชื่อสินค้า:</strong> {selectedProduct.name}</p>
              <div style={{ marginBottom: 0 }}>
                <strong>รายการที่มีอยู่:</strong>
                {selectedProduct.variants.length === 0 ? (
                  <p style={{ marginTop: '0.5rem', marginBottom: 0 }}>-</p>
                ) : (
                  <div className="size-groups" style={{ marginTop: '0.5rem' }}>
                    {groupVariantsBySize(selectedProduct.variants).map((group) => (
                      <div key={group.size} className="size-group">
                        <div className="size-group-header">
                          <strong>{group.size}</strong>
                          <span className="size-group-meta">
                            {group.variants.length} บาร์โค้ด · รวม {group.totalStock} ชิ้น
                          </span>
                        </div>
                        <div className="size-group-barcodes">
                          {group.variants.map((v, index) => (
                            <div key={v.id} className="barcode-row">
                              <span className="barcode-code">#{index + 1} {v.barcode}</span>
                              <span className="barcode-stock">{v.stock_quantity} ชิ้น</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {variantError && (
              <div className="badge badge-danger mb-4" style={{ display: 'block', padding: '1rem' }}>{variantError}</div>
            )}

            <form onSubmit={handleAddVariant}>
              <div className="input-group">
                <label className="input-label">ไซส์</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="เช่น XL, 32, 34"
                  value={variantForm.size}
                  onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">รหัสบาร์โค้ด (Barcode / QR)</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="สแกนหรือพิมพ์บาร์โค้ด..."
                  value={variantForm.barcode}
                  onChange={(e) => setVariantForm({ ...variantForm, barcode: e.target.value })}
                  required
                />
              </div>

              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                แต่ละไซส์มีได้หลายบาร์โค้ด แต่บาร์โค้ดต้องไม่ซ้ำกัน — สต๊อกเริ่มต้นที่ 0 หลังบันทึกแล้วไปหน้าสแกนสินค้าเพื่อรับเข้า
              </p>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={variantLoading}>
                {variantLoading ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
