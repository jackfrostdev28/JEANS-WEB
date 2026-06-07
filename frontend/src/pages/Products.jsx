import React, { useContext, useEffect, useState } from 'react';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../api';
import { AuthContext } from '../AuthContext';

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

const groupVariantsBySize = (variants) => {
  const groups = new Map();

  variants.forEach((variant) => {
    const displaySize = variant.size.trim();
    const sizeKey = displaySize.toLowerCase();
    if (!groups.has(sizeKey)) {
      groups.set(sizeKey, { size: displaySize, variants: [], totalStock: 0 });
    }
    const group = groups.get(sizeKey);
    group.variants.push(variant);
    group.totalStock += Number(variant.stock_quantity) || 0;
  });

  return Array.from(groups.values()).sort((a, b) => {
    const aIndex = SIZE_ORDER.indexOf(a.size.toUpperCase());
    const bIndex = SIZE_ORDER.indexOf(b.size.toUpperCase());
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.size.localeCompare(b.size, 'th');
  });
};

const getProductSummary = (variants) => {
  const groups = groupVariantsBySize(variants);
  const totalStock = variants.reduce((sum, v) => sum + (Number(v.stock_quantity) || 0), 0);
  return {
    totalStock,
    sizeCount: groups.length,
    barcodeCount: variants.length,
    sizeGroups: groups,
  };
};

const getImageUrl = (imageUrl) => {
  if (!imageUrl) return null;
  const base = import.meta.env.DEV ? 'http://localhost:5000' : 'https://jeans-api.onrender.com';
  return `${base}${imageUrl}`;
};

const Products = () => {
  const { user } = useContext(AuthContext);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [variantForm, setVariantForm] = useState({ size: '', barcode: '' });
  const [variantError, setVariantError] = useState('');
  const [variantLoading, setVariantLoading] = useState(false);
  const [expandedSizes, setExpandedSizes] = useState({});

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

  const toggleSizeExpand = (productId, size) => {
    const key = `${productId}-${size}`;
    setExpandedSizes((prev) => ({ ...prev, [key]: !prev[key] }));
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
      <div className="inventory-header">
        <h1>สต๊อกสินค้าทั้งหมด</h1>
        <p className="inventory-subtitle">รวมจำนวนชิ้นจากบาร์โค้ดทั้งหมดในแต่ละรุ่น</p>
      </div>

      {products.length === 0 ? (
        <div className="glass-panel inventory-empty">ไม่พบข้อมูลสินค้า</div>
      ) : (
        <div className="inventory-list">
          {products.map((product) => {
            const summary = getProductSummary(product.variants);

            return (
              <div key={product.id} className="glass-panel inventory-card">
                <div className="inventory-card-top">
                  <div className="inventory-card-image">
                    {product.image_url ? (
                      <img src={getImageUrl(product.image_url)} alt={product.name} />
                    ) : (
                      <span>ไม่มีรูป</span>
                    )}
                  </div>

                  <div className="inventory-card-info">
                    <div className="inventory-card-serial">{product.serial}</div>
                    <div className="inventory-card-name">{product.name}</div>
                    <div className="inventory-card-price">฿{Number(product.price).toLocaleString()}</div>
                    <div className="inventory-card-stats">
                      <span>{summary.sizeCount} ไซส์</span>
                      <span>·</span>
                      <span>{summary.barcodeCount} บาร์โค้ด</span>
                    </div>
                  </div>

                  <div className="inventory-card-total">
                    <span className="inventory-total-label">รวมทั้งรุ่น</span>
                    <span className="inventory-total-value">{summary.totalStock}</span>
                    <span className="inventory-total-unit">ชิ้น</span>
                  </div>
                </div>

                <div className="inventory-size-grid">
                  {summary.sizeGroups.map((group) => {
                    const expandKey = `${product.id}-${group.size}`;
                    const hasMultipleBarcodes = group.variants.length > 1;
                    const isExpanded = expandedSizes[expandKey] ?? false;

                    return (
                      <div key={group.size} className="inventory-size-item">
                        <button
                          type="button"
                          className={`inventory-size-chip ${hasMultipleBarcodes ? 'inventory-size-chip-expandable' : ''}`}
                          onClick={() => hasMultipleBarcodes && toggleSizeExpand(product.id, group.size)}
                          disabled={!hasMultipleBarcodes}
                        >
                          <span className="inventory-size-name">{group.size}</span>
                          <span className="inventory-size-qty">{group.totalStock}</span>
                          {hasMultipleBarcodes && (
                            <span className="inventory-size-barcode-count">
                              {group.variants.length} บาร์โค้ด
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </span>
                          )}
                        </button>

                        {hasMultipleBarcodes && isExpanded && (
                          <div className="inventory-barcode-list">
                            {group.variants.map((v, index) => (
                              <div key={v.id} className="inventory-barcode-item">
                                <span>#{index + 1} {v.barcode}</span>
                                <strong>{v.stock_quantity} ชิ้น</strong>
                              </div>
                            ))}
                          </div>
                        )}

                        {!hasMultipleBarcodes && group.variants[0] && (
                          <div className="inventory-single-barcode">{group.variants[0].barcode}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isAdmin && (
                  <div className="inventory-card-actions">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => openAddVariantModal(product)}
                    >
                      <Plus size={16} /> เพิ่มไซส์/บาร์โค้ด
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

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
