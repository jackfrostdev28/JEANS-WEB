import React, { useContext, useEffect, useState } from 'react';
import { Plus, ChevronDown, ChevronUp, Pencil, Trash2, Settings2 } from 'lucide-react';
import api from '../api';
import { AuthContext } from '../AuthContext';

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

const isInStock = (variant) => Number(variant.stock_quantity) > 0;

const groupVariantsBySize = (variants) => {
  const groups = new Map();

  variants.forEach((variant) => {
    const displaySize = variant.size.trim();
    const sizeKey = displaySize.toLowerCase();
    if (!groups.has(sizeKey)) {
      groups.set(sizeKey, { size: displaySize, variants: [], inStock: 0 });
    }
    const group = groups.get(sizeKey);
    group.variants.push(variant);
    if (isInStock(variant)) group.inStock += 1;
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
  const totalStock = variants.filter(isInStock).length;
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

const StockBadge = ({ inStock }) => (
  <span className={`stock-badge ${inStock ? 'stock-badge-in' : 'stock-badge-out'}`}>
    {inStock ? 'ในสต๊อก' : 'ว่าง'}
  </span>
);

const Products = () => {
  const { user } = useContext(AuthContext);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [manageProduct, setManageProduct] = useState(null);
  const [editingVariant, setEditingVariant] = useState(null);
  const [variantForm, setVariantForm] = useState({ size: '', barcode: '' });
  const [editForm, setEditForm] = useState({ size: '', barcode: '', in_stock: false });
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

  const openManageModal = (product) => {
    setManageProduct(product);
    setEditingVariant(null);
    setVariantError('');
  };

  const closeManageModal = () => {
    setManageProduct(null);
    setEditingVariant(null);
    setVariantError('');
  };

  const startEditVariant = (variant) => {
    setEditingVariant(variant);
    setEditForm({
      size: variant.size,
      barcode: variant.barcode,
      in_stock: isInStock(variant),
    });
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

  const handleEditVariant = async (e) => {
    e.preventDefault();
    if (!editingVariant) return;

    const size = editForm.size.trim();
    const barcode = editForm.barcode.trim();

    if (!size || !barcode) {
      setVariantError('กรุณากรอกไซส์และบาร์โค้ด');
      return;
    }

    setVariantLoading(true);
    setVariantError('');

    try {
      await api.put(`/variants/${editingVariant.id}`, {
        size,
        barcode,
        stock_quantity: editForm.in_stock ? 1 : 0,
      });
      await fetchProducts();
      const refreshed = (await api.get('/products')).data.find((p) => p.id === manageProduct.id);
      setManageProduct(refreshed);
      setEditingVariant(null);
    } catch (err) {
      setVariantError(err.response?.data?.error || 'แก้ไขไม่สำเร็จ');
    } finally {
      setVariantLoading(false);
    }
  };

  const handleDeleteVariant = async (variant) => {
    if (!window.confirm(`ลบบาร์โค้ด ${variant.barcode} ?`)) return;

    setVariantLoading(true);
    setVariantError('');

    try {
      await api.delete(`/variants/${variant.id}`);
      await fetchProducts();
      const refreshed = (await api.get('/products')).data.find((p) => p.id === manageProduct.id);
      if (!refreshed || refreshed.variants.length === 0) {
        closeManageModal();
      } else {
        setManageProduct(refreshed);
      }
      if (editingVariant?.id === variant.id) setEditingVariant(null);
    } catch (err) {
      setVariantError(err.response?.data?.error || 'ลบไม่สำเร็จ');
    } finally {
      setVariantLoading(false);
    }
  };

  if (loading) return <div>กำลังโหลดข้อมูลสินค้า...</div>;

  return (
    <div>
      <div className="inventory-header">
        <h1>สต๊อกสินค้าทั้งหมด</h1>
        <p className="inventory-subtitle">1 บาร์โค้ด = 1 ชิ้น · รวมชิ้น = จำนวนบาร์โค้ดที่อยู่ในสต๊อก</p>
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
                      <span>·</span>
                      <span>{summary.totalStock} ชิ้นในสต๊อก</span>
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
                    const isExpanded = expandedSizes[expandKey] ?? group.variants.length > 1;

                    return (
                      <div key={group.size} className="inventory-size-item">
                        <button
                          type="button"
                          className="inventory-size-chip inventory-size-chip-expandable"
                          onClick={() => toggleSizeExpand(product.id, group.size)}
                        >
                          <span className="inventory-size-name">{group.size}</span>
                          <span className="inventory-size-qty">{group.inStock}</span>
                          <span className="inventory-size-barcode-count">
                            {group.inStock}/{group.variants.length} ชิ้น
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="inventory-barcode-list">
                            {group.variants.map((v, index) => (
                              <div key={v.id} className="inventory-barcode-item">
                                <span>#{index + 1} {v.barcode}</span>
                                <StockBadge inStock={isInStock(v)} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isAdmin && (
                  <div className="inventory-card-actions">
                    <button type="button" className="btn btn-outline" onClick={() => openAddVariantModal(product)}>
                      <Plus size={16} /> เพิ่มบาร์โค้ด
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => openManageModal(product)}>
                      <Settings2 size={16} /> แก้ไข/ลบ
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
              <h2>เพิ่มบาร์โค้ดให้รุ่นเดิม</h2>
              <button type="button" className="btn btn-outline" onClick={closeAddVariantModal}>ปิด</button>
            </div>

            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <strong>{selectedProduct.serial}</strong> — {selectedProduct.name}
            </p>

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
                <label className="input-label">รหัสบาร์โค้ด (1 บาร์โค้ด = 1 ชิ้น)</label>
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
                บันทึกแล้วสถานะเริ่มต้นเป็น &quot;ว่าง&quot; — ไปหน้าสแกนสินค้าแล้วกดรับเข้าเพื่อลงสต๊อก
              </p>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={variantLoading}>
                {variantLoading ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </form>
          </div>
        </div>
      )}

      {manageProduct && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2>แก้ไข / ลบรายการ</h2>
              <button type="button" className="btn btn-outline" onClick={closeManageModal}>ปิด</button>
            </div>

            <p style={{ marginBottom: '1rem' }}>
              <strong>{manageProduct.serial}</strong> — {manageProduct.name}
            </p>

            {variantError && (
              <div className="badge badge-danger mb-4" style={{ display: 'block', padding: '1rem' }}>{variantError}</div>
            )}

            {editingVariant ? (
              <form onSubmit={handleEditVariant}>
                <div className="input-group">
                  <label className="input-label">ไซส์</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editForm.size}
                    onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                    required
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">บาร์โค้ด</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editForm.barcode}
                    onChange={(e) => setEditForm({ ...editForm, barcode: e.target.value })}
                    required
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">สถานะสต๊อก</label>
                  <select
                    className="input-field"
                    value={editForm.in_stock ? '1' : '0'}
                    onChange={(e) => setEditForm({ ...editForm, in_stock: e.target.value === '1' })}
                  >
                    <option value="0">ว่าง (ยังไม่รับเข้า / ขายแล้ว)</option>
                    <option value="1">ในสต๊อก (1 ชิ้น)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setEditingVariant(null)}>
                    ยกเลิก
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={variantLoading}>
                    {variantLoading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="manage-variant-list">
                {groupVariantsBySize(manageProduct.variants).map((group) => (
                  <div key={group.size} className="size-group">
                    <div className="size-group-header">
                      <strong>{group.size}</strong>
                      <span className="size-group-meta">
                        {group.inStock}/{group.variants.length} ชิ้นในสต๊อก
                      </span>
                    </div>
                    <div className="size-group-barcodes">
                      {group.variants.map((v, index) => (
                        <div key={v.id} className="manage-variant-row">
                          <div>
                            <span className="barcode-code">#{index + 1} {v.barcode}</span>
                            <StockBadge inStock={isInStock(v)} />
                          </div>
                          <div className="manage-variant-actions">
                            <button type="button" className="btn btn-outline btn-icon" onClick={() => startEditVariant(v)} title="แก้ไข">
                              <Pencil size={16} />
                            </button>
                            <button type="button" className="btn btn-outline btn-icon btn-danger" onClick={() => handleDeleteVariant(v)} title="ลบ">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
