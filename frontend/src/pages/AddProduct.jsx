import React, { useState } from 'react';
import api from '../api';
import { Plus, Trash2, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AddProduct = () => {
  const [formData, setFormData] = useState({
    serial: '',
    name: '',
    price: ''
  });
  const [variants, setVariants] = useState([
    { id: 1, size: 'S', barcode: '' },
    { id: 2, size: 'M', barcode: '' },
    { id: 3, size: 'L', barcode: '' },
    { id: 4, size: 'XL', barcode: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleAddVariant = () => {
    setVariants([...variants, { id: Date.now(), size: '', barcode: '' }]);
  };

  const handleRemoveVariant = (id) => {
    setVariants(variants.filter(v => v.id !== id));
  };

  const handleVariantChange = (id, field, value) => {
    setVariants(variants.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // Validate
    if (!formData.serial || !formData.name || !formData.price) {
      setError('กรุณากรอกข้อมูลสินค้าหลักให้ครบถ้วน');
      setLoading(false);
      return;
    }

    const validVariants = variants
      .filter(v => v.size?.trim() && v.barcode?.trim())
      .map(v => ({ size: v.size.trim(), barcode: v.barcode.trim() }));

    if (validVariants.length === 0) {
      setError('กรุณาเพิ่มขนาดและบาร์โค้ดอย่างน้อย 1 รายการ');
      setLoading(false);
      return;
    }

    const barcodeSet = new Set();
    for (const variant of validVariants) {
      if (barcodeSet.has(variant.barcode)) {
        setError(`บาร์โค้ด ${variant.barcode} ซ้ำในรายการ แต่ละบาร์โค้ดต้องไม่เหมือนกัน`);
        setLoading(false);
        return;
      }
      barcodeSet.add(variant.barcode);
    }

    try {
      await api.post('/products', {
        serial: formData.serial,
        name: formData.name,
        price: Number(formData.price),
        variants: validVariants
      });
      alert('บันทึกสินค้าเรียบร้อยแล้ว');
      navigate('/inventory');
    } catch (err) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการบันทึกสินค้า');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>เพิ่มสินค้าใหม่</h1>

      <div className="glass-panel" style={{ padding: '2rem', maxWidth: '800px' }}>
        {error && <div className="badge badge-danger mb-4" style={{ display: 'block', padding: '1rem' }}>{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">รหัสสินค้า (Serial)</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="เช่น CGE-804"
                value={formData.serial}
                onChange={e => setFormData({...formData, serial: e.target.value})}
              />
            </div>
            
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">ชื่อสินค้า</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="เช่น Cargo Jogger"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">ราคา (บาท)</label>
              <input 
                type="number" 
                className="input-field" 
                placeholder="1380"
                value={formData.price}
                onChange={e => setFormData({...formData, price: e.target.value})}
              />
            </div>
          </div>

          <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>รายการไซส์และบาร์โค้ด</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            1 รุ่น (Serial) มีได้หลายไซส์ · 1 บาร์โค้ด = 1 ชิ้น · ทุกบาร์โค้ดต้องไม่ซ้ำกัน
          </p>
          
          {variants.map((variant, index) => (
            <div key={variant.id} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
              <div className="input-group" style={{ marginBottom: 0, flex: 1 }}>
                <label className="input-label">ไซส์</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="เช่น S, M, L, XL หรือ 32, 34"
                  value={variant.size}
                  onChange={e => handleVariantChange(variant.id, 'size', e.target.value)}
                />
              </div>
              <div className="input-group" style={{ marginBottom: 0, flex: 2 }}>
                <label className="input-label">รหัสบาร์โค้ด (Barcode)</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="สแกนหรือพิมพ์บาร์โค้ด..."
                  value={variant.barcode}
                  onChange={e => handleVariantChange(variant.id, 'barcode', e.target.value)}
                />
              </div>
              <button type="button" className="btn btn-outline btn-danger" onClick={() => handleRemoveVariant(variant.id)} style={{ padding: '0.75rem', height: '46px' }}>
                <Trash2 size={20} />
              </button>
            </div>
          ))}

          <button type="button" className="btn btn-outline" onClick={handleAddVariant} style={{ marginTop: '0.5rem', marginBottom: '2rem' }}>
            <Plus size={18} /> เพิ่มไซส์/บาร์โค้ด
          </button>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/inventory')}>ยกเลิก</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Save size={18} /> {loading ? 'กำลังบันทึก...' : 'บันทึกสินค้า'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProduct;
