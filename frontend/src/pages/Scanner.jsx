import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import api from '../api';
import { ShoppingCart, PackagePlus, ClipboardList } from 'lucide-react';

const SCANNER_CONFIG = {
  fps: 10,
  qrbox: (viewfinderWidth, viewfinderHeight) => {
    const width = Math.min(Math.floor(viewfinderWidth * 0.9), 300);
    const height = Math.min(Math.floor(viewfinderHeight * 0.5), 120);
    return { width, height };
  },
  aspectRatio: 1.333333,
  disableFlip: false,
  formatsToSupport: [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.QR_CODE,
  ],
  rememberLastUsedCamera: true,
  showTorchButtonIfSupported: true,
};

const Scanner = () => {
  const scannerRef = useRef(null);
  const [scanResult, setScanResult] = useState(null);
  const [productData, setProductData] = useState(null);
  const [error, setError] = useState(null);
  const [modalError, setModalError] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [actionType, setActionType] = useState('sell');
  const [adjustStock, setAdjustStock] = useState('1');
  const [transactionSuccess, setTransactionSuccess] = useState('');
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);

  const resumeScanner = useCallback(() => {
    try {
      scannerRef.current?.resume();
    } catch {
      // scanner may not be ready yet
    }
  }, []);

  const resetAfterScan = useCallback(() => {
    setShowModal(false);
    setScanResult(null);
    setManualBarcode('');
    setProductData(null);
    setTransactionSuccess('');
    setModalError('');
    setAdjustStock('1');
    setActionType('sell');
    resumeScanner();
  }, [resumeScanner]);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner('reader', SCANNER_CONFIG, false);
    scannerRef.current = scanner;

    scanner.render(
      (text) => {
        const barcode = text.trim();
        if (!barcode) return;
        setScanResult(barcode);
        scanner.pause(true);
      },
      () => {}
    );

    return () => {
      scannerRef.current = null;
      scanner.clear().catch(() => {});
    };
  }, []);

  const fetchProductByBarcode = useCallback(async (barcode) => {
    const normalized = barcode.trim();
    if (!normalized) return;

    setError(null);
    setModalError('');
    setProductData(null);
    setTransactionSuccess('');
    setLookupLoading(true);

    try {
      const res = await api.get(`/scan/${encodeURIComponent(normalized)}`);
      setProductData(res.data);
      setShowModal(true);
    } catch (err) {
      setError(err.response?.data?.error || 'ไม่พบบาร์โค้ดนี้ในระบบ');
      resumeScanner();
    } finally {
      setLookupLoading(false);
    }
  }, [resumeScanner]);

  useEffect(() => {
    if (scanResult) {
      fetchProductByBarcode(scanResult);
    }
  }, [scanResult, fetchProductByBarcode]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      setScanResult(manualBarcode.trim());
    }
  };

  const refreshProductData = async (barcode) => {
    const res = await api.get(`/scan/${encodeURIComponent(barcode)}`);
    setProductData(res.data);
  };

  const barcodeInStock = Number(productData?.stock_quantity) > 0;

  const executeTransaction = async () => {
    if (actionType === 'sell' && !barcodeInStock) {
      setModalError('บาร์โค้ดนี้ไม่อยู่ในสต๊อก');
      return;
    }
    if (actionType === 'receive' && barcodeInStock) {
      setModalError('บาร์โค้ดนี้อยู่ในสต๊อกแล้ว');
      return;
    }

    const payloadQty = actionType === 'adjust' ? parseInt(adjustStock, 10) : 1;

    setTransactionLoading(true);
    setModalError('');

    try {
      await api.post('/transaction', {
        variant_id: productData.variant_id,
        type: actionType,
        quantity: payloadQty,
      });
      await refreshProductData(productData.barcode);
      setTransactionSuccess('done');
      setTimeout(resetAfterScan, 1500);
    } catch (err) {
      const msg = err.response?.data?.error;
      setModalError(msg || 'ทำรายการไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setTransactionLoading(false);
    }
  };

  const closeModal = () => {
    resetAfterScan();
  };

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>สแกนบาร์โค้ด</h1>

      <div className="dashboard-grid">
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3>สแกนผ่านกล้อง</h3>
          <p className="scanner-hint">จ่อบาร์โค้ดให้อยู่ในกรอบแนวนอน ใช้ไฟฉายถ้ามืด</p>
          <div id="reader" className="scanner-reader" />

          <div className="mt-4">
            <p className="text-center text-muted">หรือกรอกบาร์โค้ดด้วยตนเอง (สำหรับเครื่องสแกน USB)</p>
            <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <input
                type="text"
                className="input-field"
                placeholder="สแกนหรือพิมพ์บาร์โค้ดที่นี่..."
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={lookupLoading}>
                {lookupLoading ? 'ค้นหา...' : 'ค้นหา'}
              </button>
            </form>
          </div>

          {lookupLoading && (
            <div className="badge badge-warning mt-4" style={{ display: 'block', padding: '1rem' }}>
              กำลังค้นหาสินค้า...
            </div>
          )}

          {error && (
            <div className="badge badge-danger mt-4" style={{ display: 'block', padding: '1rem' }}>
              {error === 'Barcode not found' ? 'ไม่พบบาร์โค้ดนี้ในระบบ' : error}
            </div>
          )}
        </div>
      </div>

      {showModal && productData && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content scanner-modal" style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>พบสินค้า</h2>
              <button type="button" className="btn btn-outline" onClick={closeModal} disabled={transactionLoading}>
                ปิด
              </button>
            </div>

            <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1.5rem', borderRadius: '8px' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>รุ่น (Serial)</p>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--primary-dark)', marginBottom: '0.25rem' }}>{productData.serial}</h3>
              <p style={{ marginBottom: '1rem' }}>{productData.name} · ฿{Number(productData.price).toLocaleString()}</p>

              <div style={{ padding: '0.75rem', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                <p style={{ marginBottom: '0.25rem' }}><strong>บาร์โค้ดที่สแกน:</strong> {productData.barcode}</p>
                <p style={{ marginBottom: 0 }}>
                  <strong>ไซส์:</strong>{' '}
                  <span className="badge badge-success" style={{ fontSize: '0.9rem' }}>{productData.size}</span>
                  {' '}· {barcodeInStock ? 'ในสต๊อก (1 ชิ้น)' : 'ว่าง (0 ชิ้น)'}
                </p>
              </div>

              {productData.size_stock?.length > 0 && (
                <div>
                  <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--primary-dark)' }}>
                    สต๊อกคงเหลือทั้งรุ่น {productData.serial}
                  </p>
                  <div className="scanner-size-stock-list">
                    {productData.size_stock.map((item) => {
                      const isScannedSize = item.size.toLowerCase() === productData.size.toLowerCase();
                      return (
                        <div
                          key={item.size}
                          className={`scanner-size-row ${isScannedSize ? 'scanner-size-row-active' : ''}`}
                        >
                          <span className="scanner-size-label">
                            {item.size}
                            {isScannedSize && ' (ที่สแกน)'}
                          </span>
                          <span className="scanner-size-qty">
                            {item.total_stock}/{item.barcode_count} ชิ้นในสต๊อก
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ marginTop: '0.75rem', marginBottom: 0, fontWeight: 600, color: 'var(--primary-dark)' }}>
                    รวมทั้งรุ่น: {productData.product_total_stock} ชิ้น
                  </p>
                </div>
              )}
            </div>

            {modalError && (
              <div className="badge badge-danger mt-4" style={{ display: 'block', padding: '1rem' }}>
                {modalError}
              </div>
            )}

            {transactionSuccess ? (
              <div className="badge badge-success mt-4" style={{ display: 'block', padding: '1rem', textAlign: 'center', fontSize: '1.1rem' }}>
                ทำรายการสำเร็จ! บาร์โค้ดนี้{Number(productData.stock_quantity) > 0 ? 'อยู่ในสต๊อก' : 'ว่างแล้ว'} · รวมทั้งรุ่น {productData.product_total_stock} ชิ้น
              </div>
            ) : (
              <div style={{ marginTop: '2rem' }}>
                <label className="input-label">เลือกการทำรายการ:</label>
                <div className="scanner-action-buttons">
                  <button
                    type="button"
                    className={`btn ${actionType === 'sell' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActionType('sell')}
                    disabled={transactionLoading}
                  >
                    <ShoppingCart size={18} /> ขาย
                  </button>
                  <button
                    type="button"
                    className={`btn ${actionType === 'receive' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActionType('receive')}
                    disabled={transactionLoading}
                  >
                    <PackagePlus size={18} /> รับเข้า
                  </button>
                  <button
                    type="button"
                    className={`btn ${actionType === 'adjust' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActionType('adjust')}
                    disabled={transactionLoading}
                  >
                    <ClipboardList size={18} /> นับสต๊อก
                  </button>
                </div>

                {actionType === 'adjust' ? (
                  <div className="input-group">
                    <label className="input-label">สถานะสต๊อกของบาร์โค้ดนี้</label>
                    <select
                      className="input-field"
                      value={adjustStock}
                      onChange={(e) => setAdjustStock(e.target.value)}
                      disabled={transactionLoading}
                    >
                      <option value="1">ในสต๊อก (1 ชิ้น)</option>
                      <option value="0">ว่าง (0 ชิ้น)</option>
                    </select>
                  </div>
                ) : (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    1 บาร์โค้ด = 1 ชิ้น — {actionType === 'sell' ? 'ขายชิ้นนี้ 1 ชิ้น' : 'รับเข้าชิ้นนี้ 1 ชิ้น'}
                  </p>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={executeTransaction}
                  disabled={transactionLoading}
                >
                  {transactionLoading
                    ? 'กำลังทำรายการ...'
                    : `ยืนยันทำรายการ (${actionType === 'sell' ? 'ขาย' : actionType === 'receive' ? 'รับเข้า' : 'ปรับสต๊อก'})`}
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
