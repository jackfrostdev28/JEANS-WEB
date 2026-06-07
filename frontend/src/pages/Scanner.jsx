import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import api from '../api';
import { ShoppingCart, PackagePlus, ClipboardList } from 'lucide-react';

const Scanner = () => {
  const [scanResult, setScanResult] = useState(null);
  const [productData, setProductData] = useState(null);
  const [error, setError] = useState(null);
  const [manualBarcode, setManualBarcode] = useState('');
  
  // Transaction Modal State
  const [showModal, setShowModal] = useState(false);
  const [actionType, setActionType] = useState('sell'); // sell, receive, adjust
  const [quantity, setQuantity] = useState(1);
  const [transactionSuccess, setTransactionSuccess] = useState('');

  useEffect(() => {
    // Initialize Scanner
    const scanner = new Html5QrcodeScanner('reader', {
      qrbox: { width: 250, height: 250 },
      fps: 5,
    });

    scanner.render(
      (text) => {
        setScanResult(text);
        scanner.pause(true); // Pause scanning when found
      },
      (err) => {
        // console.warn(err);
      }
    );

    return () => {
      scanner.clear().catch(error => console.error("Failed to clear scanner", error));
    };
  }, []);

  useEffect(() => {
    if (scanResult) {
      fetchProductByBarcode(scanResult);
    }
  }, [scanResult]);

  const fetchProductByBarcode = async (barcode) => {
    setError(null);
    setProductData(null);
    setTransactionSuccess('');
    try {
      const res = await api.get(`/scan/${barcode}`);
      setProductData(res.data);
      setShowModal(true);
    } catch (err) {
      setError(err.response?.data?.error || "Barcode not found");
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualBarcode) {
      setScanResult(manualBarcode);
    }
  };

  const executeTransaction = async () => {
    try {
      const res = await api.post('/transaction', {
        variant_id: productData.variant_id,
        type: actionType,
        quantity: quantity
      });
      setTransactionSuccess(`Success! New stock is ${res.data.newStock}`);
      setProductData({ ...productData, stock_quantity: res.data.newStock });
      setTimeout(() => {
        setShowModal(false);
        setScanResult(null);
        setManualBarcode('');
        // Resume scanner if available
        const html5QrCode = window.__html5_qrcode; // It's internal but let's just force reload or user can rescan
        window.location.reload(); // Simple way to restart scanner instance cleanly
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || "Transaction failed");
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>สแกนบาร์โค้ด</h1>
      
      <div className="dashboard-grid">
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3>สแกนผ่านกล้อง</h3>
          <div id="reader" style={{ width: '100%', maxWidth: '400px', margin: '0 auto' }}></div>
          
          <div className="mt-4">
            <p className="text-center text-muted">หรือกรอกบาร์โค้ดด้วยตนเอง (สำหรับเครื่องสแกน USB)</p>
            <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <input 
                type="text" 
                className="input-field" 
                placeholder="สแกนหรือพิมพ์บาร์โค้ดที่นี่..." 
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn btn-primary">ค้นหา</button>
            </form>
          </div>
          
          {error && <div className="badge badge-danger mt-4" style={{ display: 'block', padding: '1rem' }}>{error === "Barcode not found" ? "ไม่พบบาร์โค้ดนี้ในระบบ" : error}</div>}
        </div>
      </div>

      {showModal && productData && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>พบสินค้า</h2>
              <button className="btn btn-outline" onClick={() => { setShowModal(false); setScanResult(null); }}>ปิด</button>
            </div>
            
            <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1.5rem', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--primary-dark)' }}>{productData.name}</h3>
              <p><strong>รหัส (Serial):</strong> {productData.serial}</p>
              <p><strong>ไซส์:</strong> <span className="badge badge-success" style={{ fontSize: '1rem' }}>{productData.size}</span></p>
              <p><strong>ราคา:</strong> ฿{productData.price.toLocaleString()}</p>
              <p><strong>คงเหลือปัจจุบัน:</strong> {productData.stock_quantity}</p>
            </div>

            {transactionSuccess ? (
              <div className="badge badge-success mt-4" style={{ display: 'block', padding: '1rem', textAlign: 'center', fontSize: '1.1rem' }}>
                ทำรายการสำเร็จ! (คงเหลือ: {productData.stock_quantity})
              </div>
            ) : (
              <div style={{ marginTop: '2rem' }}>
                <label className="input-label">เลือกการทำรายการ:</label>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                  <button 
                    className={`btn ${actionType === 'sell' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActionType('sell')}
                    style={{ flex: 1 }}
                  >
                    <ShoppingCart size={18} /> ขาย
                  </button>
                  <button 
                    className={`btn ${actionType === 'receive' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActionType('receive')}
                    style={{ flex: 1 }}
                  >
                    <PackagePlus size={18} /> รับเข้า
                  </button>
                  <button 
                    className={`btn ${actionType === 'adjust' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActionType('adjust')}
                    style={{ flex: 1 }}
                  >
                    <ClipboardList size={18} /> นับสต๊อก
                  </button>
                </div>

                <div className="input-group">
                  <label className="input-label">
                    {actionType === 'adjust' ? 'ระบุจำนวนที่นับได้จริง (จำนวนคงเหลือใหม่)' : 'ระบุจำนวน'}
                  </label>
                  <input 
                    type="number" 
                    className="input-field" 
                    value={quantity} 
                    onChange={e => setQuantity(e.target.value)} 
                    min="1"
                  />
                </div>

                <button className="btn btn-primary" style={{ width: '100%' }} onClick={executeTransaction}>
                  ยืนยันทำรายการ ({actionType === 'sell' ? 'ขาย' : actionType === 'receive' ? 'รับเข้า' : 'ปรับสต๊อก'})
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Scanner;
