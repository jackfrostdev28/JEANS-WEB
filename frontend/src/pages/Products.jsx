import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Plus, ChevronDown, ChevronUp, Pencil, Trash2, Settings2, Search } from 'lucide-react';
import api from '../api';
import { AuthContext } from '../AuthContext';
import { SIZE_ORDER, SIZE_OPTIONS, getSizeSelectOptions } from '../constants/sizes';

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
  const totalPieces = variants.length;
  const inStock = variants.filter(isInStock).length;
  return {
    totalPieces,
    inStock,
    sizeCount: groups.length,
    barcodeCount: variants.length,
    sizeGroups: groups,
  };
};

const StockBadge = ({ inStock }) => (
  <span className={`stock-badge ${inStock ? 'stock-badge-in' : 'stock-badge-out'}`}>
    {inStock ? 'ในสต๊อก' : 'ว่าง'}
  </span>
);

const normalizeSearchQuery = (query) => query.trim().toLowerCase();

const matchesProductSearch = (product, query) => {
  const q = normalizeSearchQuery(query);
  if (!q) return true;

  if (product.serial.toLowerCase().includes(q)) return true;
  if (product.name.toLowerCase().includes(q)) return true;

  const priceQuery = q.replace(/[฿,\s]/g, '');
  if (priceQuery && String(product.price).includes(priceQuery)) return true;

  return product.variants?.some((v) => v.size.toLowerCase().includes(q)) ?? false;
};

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
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({ serial: '', name: '', price: '' });
  const [productError, setProductError] = useState('');
  const [productLoading, setProductLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = user?.role === 'admin';

  const filteredProducts = useMemo(
    () => products.filter((product) => matchesProductSearch(product, searchQuery)),
    [products, searchQuery],
  );

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
    setVariantForm({ size: SIZE_OPTIONS[0], barcode: '' });
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

  const openEditProductModal = (product) => {
    setEditingProduct(product);
    setProductForm({
      serial: product.serial,
      name: product.name,
      price: String(product.price),
    });
    setProductError('');
  };

  const closeEditProductModal = () => {
    setEditingProduct(null);
    setProductForm({ serial: '', name: '', price: '' });
    setProductError('');
  };

  const handleEditProduct = async (e) => {
    e.preventDefault();
    if (!editingProduct) return;

    const serial = productForm.serial.trim();
    const name = productForm.name.trim();
    const price = productForm.price.trim();

    if (!serial || !name || !price) {
      setProductError('กรุณากรอกข้อมูลรุ่นให้ครบถ้วน');
      return;
    }

    setProductLoading(true);
    setProductError('');

    try {
      await api.put(`/products/${editingProduct.id}`, {
        serial,
        name,
        price: Number(price),
      });
      await fetchProducts();
      closeEditProductModal();
    } catch (err) {
      setProductError(err.response?.data?.error || 'แก้ไขรุ่นไม่สำเร็จ');
    } finally {
      setProductLoading(false);
    }
  };

  const handleDeleteProduct = async (product) => {
    const summary = getProductSummary(product.variants);
    const message = `ลบรุ่น ${product.serial} (${product.name}) และบาร์โค้ดทั้งหมด ${summary.barcodeCount} รายการ?`;
    if (!window.confirm(message)) return;

    setProductLoading(true);

    try {
      await api.delete(`/products/${product.id}`);
      await fetchProducts();
      if (manageProduct?.id === product.id) closeManageModal();
      if (selectedProduct?.id === product.id) closeAddVariantModal();
      if (editingProduct?.id === product.id) closeEditProductModal();
    } catch (err) {
      alert(err.response?.data?.error || 'ลบรุ่นไม่สำเร็จ');
    } finally {
      setProductLoading(false);
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
        <p className="inventory-subtitle">1 บาร์โค้ด = 1 ชิ้น · รวมทั้งรุ่น = จำนวนบาร์โค้ดทั้งหมดในรุ่นนั้น</p>
        <div className="inventory-search">
          <Search size={18} className="inventory-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="input-field inventory-search-input"
            placeholder="ค้นหารหัสรุ่น, ชื่อสินค้า, ราคา, ไซส์..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {products.length === 0 ? (
        <div className="glass-panel inventory-empty">ไม่พบข้อมูลสินค้า</div>
      ) : filteredProducts.length === 0 ? (
        <div className="glass-panel inventory-empty">ไม่พบสินค้าที่ตรงกับ &quot;{searchQuery.trim()}&quot;</div>
      ) : (
        <div className="inventory-list">
          {filteredProducts.map((product) => {
            const summary = getProductSummary(product.variants);

            return (
              <div key={product.id} className="glass-panel inventory-card">
                <div className="inventory-card-top">
                  <div className="inventory-card-info">
                    <div className="inventory-card-serial">{product.serial}</div>
                    <div className="inventory-card-name">{product.name}</div>
                    <div className="inventory-card-price">฿{Number(product.price).toLocaleString()}</div>
                    <div className="inventory-card-stats">
                      <span>{summary.sizeCount} ไซส์</span>
                      <span>·</span>
                      <span>{summary.barcodeCount} บาร์โค้ด</span>
                      <span>·</span>
                      <span>{summary.inStock} ชิ้นในสต๊อก</span>
                    </div>
                  </div>

                  <div className="inventory-card-total">
                    <span className="inventory-total-label">รวมทั้งรุ่น</span>
                    <span className="inventory-total-value">{summary.totalPieces}</span>
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
                          <span className="inventory-size-qty">{group.variants.length}</span>
                          <span className="inventory-size-barcode-count">
                            {group.inStock}/{group.variants.length} ในสต๊อก
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
                    <button type="button" className="btn btn-outline" onClick={() => openEditProductModal(product)}>
                      <Pencil size={16} /> แก้ไขรุ่น
                    </button>
                    <button type="button" className="btn btn-outline btn-danger" onClick={() => handleDeleteProduct(product)} disabled={productLoading}>
                      <Trash2 size={16} /> ลบรุ่น
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => openAddVariantModal(product)}>
                      <Plus size={16} /> เพิ่มบาร์โค้ด
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => openManageModal(product)}>
                      <Settings2 size={16} /> แก้ไข/ลบบาร์โค้ด
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingProduct && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2>แก้ไขรุ่น</h2>
              <button type="button" className="btn btn-outline" onClick={closeEditProductModal}>ปิด</button>
            </div>

            {productError && (
              <div className="badge badge-danger mb-4" style={{ display: 'block', padding: '1rem' }}>{productError}</div>
            )}

            <form onSubmit={handleEditProduct}>
              <div className="input-group">
                <label className="input-label">รหัสรุ่น (Serial)</label>
                <input
                  type="text"
                  className="input-field"
                  value={productForm.serial}
                  onChange={(e) => setProductForm({ ...productForm, serial: e.target.value })}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">ชื่อสินค้า</label>
                <input
                  type="text"
                  className="input-field"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="input-group">
                <label className="input-label">ราคา (บาท)</label>
                <input
                  type="number"
                  className="input-field"
                  min="0"
                  step="1"
                  value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={productLoading}>
                {productLoading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </form>
          </div>
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
                <select
                  className="input-field"
                  value={variantForm.size}
                  onChange={(e) => setVariantForm({ ...variantForm, size: e.target.value })}
                  required
                >
                  {SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
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
                  <select
                    className="input-field"
                    value={editForm.size}
                    onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                    required
                  >
                    {getSizeSelectOptions(editForm.size).map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
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
