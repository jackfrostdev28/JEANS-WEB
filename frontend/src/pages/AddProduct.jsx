import React, { useState, useContext, useRef, useCallback, useEffect } from 'react';
import api from '../api';
import { AuthContext } from '../AuthContext';
import { Plus, Trash2, Save, Camera, ImagePlus, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SIZE_OPTIONS, getSizeSelectOptions } from '../constants/sizes';
import { recognizeBarcodesFromImage, isValidEan13 } from '../utils/ocrBarcode';

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

const pickBestBarcode = (candidates) =>
  candidates.find(isValidEan13) || candidates[0] || '';

const AddProduct = () => {
  const { user } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    serial: '',
    name: '',
    price: ''
  });
  const [variants, setVariants] = useState([
    { id: 1, size: 'S', barcode: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [filledVariantId, setFilledVariantId] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [existingProduct, setExistingProduct] = useState(null);
  const [serialLookupLoading, setSerialLookupLoading] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const navigate = useNavigate();

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    stopCamera();

    if (isIOS) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('อุปกรณ์นี้ไม่รองรับกล้อง — ใช้เลือกรูปจากแกลเลอรี่แทน');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', true);
        videoRef.current.setAttribute('muted', true);
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setCameraError('ไม่สามารถเปิดกล้องได้ — ลองเลือกรูปจากแกลเลอรี่แทน');
    }
  }, [stopCamera]);

  useEffect(() => {
    if (user?.role === 'admin') {
      startCamera();
    }
    return () => stopCamera();
  }, [startCamera, stopCamera, user?.role]);

  useEffect(() => {
    const serial = formData.serial.trim();
    if (!serial) {
      setExistingProduct(null);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setSerialLookupLoading(true);
      try {
        const res = await api.get(`/products/by-serial/${encodeURIComponent(serial)}`);
        setExistingProduct(res.data);
        setFormData((prev) => ({
          ...prev,
          name: res.data.name,
          price: String(res.data.price),
        }));
      } catch (err) {
        if (err.response?.status === 404) {
          setExistingProduct((prev) => {
            if (prev) {
              setFormData((form) => ({ ...form, name: '', price: '' }));
            }
            return null;
          });
        }
      } finally {
        setSerialLookupLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [formData.serial]);

  const resetCapture = useCallback(() => {
    setCapturedImage(null);
    setScanMessage('');
    startCamera();
  }, [startCamera]);

  const applyScanResults = useCallback((candidates, serialCandidates, detectedSize) => {
    const barcode = pickBestBarcode(candidates);
    const serial = serialCandidates[0]?.trim() || '';
    const size = detectedSize?.trim().toUpperCase() || '';

    if (!barcode && !serial && !size) {
      setScanMessage('ไม่พบข้อมูลบนป้าย — ลองถ่ายใหม่หรือกรอกด้วยตนเอง');
      return;
    }

    if (serial) {
      setFormData((prev) => ({ ...prev, serial }));
    }

    let filledId = null;

    setVariants((prev) => {
      if (barcode && prev.some((v) => v.barcode.trim() === barcode)) {
        setScanMessage(`บาร์โค้ด ${barcode} มีในรายการแล้ว`);
        return prev;
      }

      let targetIdx = -1;
      if (size) {
        targetIdx = prev.findIndex(
          (v) => !v.barcode.trim() && v.size.toUpperCase() === size
        );
      }
      if (targetIdx < 0) {
        targetIdx = prev.findIndex((v) => !v.barcode.trim());
      }

      if (targetIdx >= 0) {
        filledId = prev[targetIdx].id;
        return prev.map((v, i) =>
          i === targetIdx
            ? {
                ...v,
                ...(size ? { size } : {}),
                ...(barcode ? { barcode } : v.barcode),
              }
            : v
        );
      }

      filledId = Date.now();
      return [
        ...prev,
        {
          id: filledId,
          size: size || SIZE_OPTIONS[0],
          barcode: barcode || '',
        },
      ];
    });

    if (filledId) {
      setFilledVariantId(filledId);
      setTimeout(() => setFilledVariantId(null), 2500);
    }

    const parts = [];
    if (serial) parts.push(`Serial: ${serial}`);
    if (size) parts.push(`ไซส์: ${size}`);
    if (barcode) parts.push(`บาร์โค้ด: ${barcode}`);
    setScanMessage(
      parts.length > 0
        ? `กรอกอัตโนมัติแล้ว — ${parts.join(' · ')}`
        : 'กรอกข้อมูลจากภาพแล้ว'
    );
  }, []);

  const processImage = useCallback(
    async (imageSrc) => {
      setOcrLoading(true);
      setScanMessage('');
      setError('');

      try {
        const { candidates, serialCandidates, size } =
          await recognizeBarcodesFromImage(imageSrc);
        applyScanResults(candidates, serialCandidates, size);
      } catch {
        setScanMessage('ประมวลผลภาพไม่สำเร็จ — ลองเลือกรูปใหม่หรือกรอกด้วยตนเอง');
      } finally {
        setOcrLoading(false);
      }
    },
    [applyScanResults]
  );

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(dataUrl);
    stopCamera();
    processImage(dataUrl);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setCapturedImage(dataUrl);
      stopCamera();
      processImage(dataUrl);
    };
    reader.readAsDataURL(file);
    setTimeout(() => {
      e.target.value = '';
    }, 300);
  };

  if (user?.role !== 'admin') {
    return <div className="text-center mt-4">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะผู้ดูแลระบบ)</div>;
  }

  const handleAddVariant = () => {
    setVariants([...variants, { id: Date.now(), size: SIZE_OPTIONS[0], barcode: '' }]);
  };

  const handleRemoveVariant = (id) => {
    setVariants(variants.filter(v => v.id !== id));
  };

  const handleVariantChange = (id, field, value) => {
    setVariants(variants.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const buildSubmitPayload = () => {
    const validVariants = variants
      .filter((v) => v.size?.trim() && v.barcode?.trim())
      .map((v) => ({ size: v.size.trim(), barcode: v.barcode.trim() }));

    return {
      serial: formData.serial.trim(),
      name: formData.name.trim(),
      price: Number(formData.price),
      variants: validVariants,
    };
  };

  const validateSubmit = (payload) => {
    if (!payload.serial) {
      return 'กรุณาระบุรหัสสินค้า (Serial)';
    }

    if (!existingProduct && (!payload.name || !String(formData.price).trim() || Number.isNaN(payload.price))) {
      return 'กรุณากรอกชื่อสินค้าและราคาให้ครบถ้วน';
    }

    if (payload.variants.length === 0) {
      return 'กรุณาเพิ่มขนาดและบาร์โค้ดอย่างน้อย 1 รายการ';
    }

    const barcodeSet = new Set();
    for (const variant of payload.variants) {
      if (barcodeSet.has(variant.barcode)) {
        return `บาร์โค้ด ${variant.barcode} ซ้ำในรายการ แต่ละบาร์โค้ดต้องไม่เหมือนกัน`;
      }
      barcodeSet.add(variant.barcode);
    }

    const existingBarcodes = new Set(
      (existingProduct?.variants || []).map((v) => v.barcode.trim())
    );
    for (const variant of payload.variants) {
      if (existingBarcodes.has(variant.barcode)) {
        return `บาร์โค้ด ${variant.barcode} มีในระบบแล้วสำหรับรุ่นนี้`;
      }
    }

    return '';
  };

  const buildConfirmMessage = (payload) => {
    const serialLabel = existingProduct?.serial || payload.serial;
    const header = existingProduct
      ? `รุ่น ${serialLabel} มีในระบบแล้ว — จะเพิ่มบาร์โค้ดเข้าสต๊อก`
      : `สร้างรุ่นใหม่ ${serialLabel} และรับเข้าสต๊อก`;

    const lines = payload.variants.map(
      (variant) => `  • ไซส์ ${variant.size} · บาร์โค้ด ${variant.barcode}`
    );

    return [
      'ยืนยันรับสินค้าเข้าสต๊อก?',
      '',
      header,
      existingProduct ? `ชื่อ: ${existingProduct.name} · ราคา ${existingProduct.price} บาท` : `ชื่อ: ${payload.name} · ราคา ${payload.price} บาท`,
      '',
      `รายการ (${payload.variants.length} ชิ้น):`,
      ...lines,
    ].join('\n');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const payload = buildSubmitPayload();
    const validationError = validateSubmit(payload);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!window.confirm(buildConfirmMessage(payload))) {
      return;
    }

    setLoading(true);

    try {
      const res = await api.post('/products', payload);
      const message = res.data.added_to_existing
        ? `เพิ่มบาร์โค้ดเข้ารุ่น ${res.data.serial} เรียบร้อยแล้ว (${payload.variants.length} ชิ้น)`
        : 'รับสินค้าเข้าสต๊อกเรียบร้อยแล้ว';
      alert(message);
      navigate('/inventory');
    } catch (err) {
      const apiError = err.response?.data?.error;
      if (err.response?.status === 403 && apiError === 'Access denied. Admin only.') {
        setError('คุณไม่มีสิทธิ์เพิ่มสินค้า (เฉพาะผู้ดูแลระบบ)');
      } else {
        setError(apiError || 'เกิดข้อผิดพลาดในการบันทึกสินค้า');
      }
    } finally {
      setLoading(false);
    }
  };

  const busy = ocrLoading || loading;

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>รับสินค้าเข้าสต๊อก</h1>

      <div className="glass-panel" style={{ padding: '2rem', maxWidth: '800px', marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>สแกนป้ายสินค้า</h3>
        <p className="scanner-hint">
          ถ่ายภาพหรือเลือกจากแกลเลอรี่ — ระบบจะอ่าน Serial, ไซส์ และบาร์โค้ดแล้วกรอกให้อัตโนมัติ
        </p>

        <div className="scanner-camera-wrap">
          {capturedImage ? (
            <img
              src={capturedImage}
              alt="ภาพที่ถ่าย"
              className="scanner-captured-preview"
            />
          ) : isIOS ? (
            <div className="scanner-ios-placeholder">
              <Camera size={48} style={{ opacity: 0.4, marginBottom: '1rem' }} />
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>กดปุ่มด้านล่างเพื่อถ่ายภาพหรือเลือกรูป</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              className="scanner-camera-video"
              playsInline
              muted
              autoPlay
            />
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {cameraError && !capturedImage && (
          <div className="badge badge-warning mt-4" style={{ display: 'block', padding: '1rem' }}>
            {cameraError}
          </div>
        )}

        <div className="scanner-capture-actions">
          {!capturedImage ? (
            <>
              {isIOS ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={busy}
                >
                  <Camera size={18} /> {ocrLoading ? 'กำลังอ่าน...' : 'เปิดกล้องถ่ายภาพ'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={capturePhoto}
                  disabled={!cameraReady || busy}
                >
                  <Camera size={18} /> {ocrLoading ? 'กำลังอ่าน...' : 'ถ่ายภาพ'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                <ImagePlus size={18} /> เลือกจากแกลเลอรี่
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-outline"
              onClick={resetCapture}
              disabled={busy}
            >
              <RotateCcw size={18} /> ถ่ายใหม่
            </button>
          )}
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {ocrLoading && (
          <div className="badge badge-warning mt-4" style={{ display: 'block', padding: '1rem' }}>
            กำลังอ่านบาร์โค้ดและป้ายสินค้า... (ครั้งแรกอาจใช้เวลาสักครู่)
          </div>
        )}

        {scanMessage && !ocrLoading && (
          <div
            className={`badge mt-4 ${scanMessage.includes('error') || scanMessage.includes('ไม่พบ') ? 'badge-warning' : 'badge-success'}`}
            style={{ display: 'block', padding: '1rem' }}
          >
            {scanMessage}
          </div>
        )}
      </div>

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
              {serialLookupLoading && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  กำลังตรวจสอบรหัสสินค้า...
                </p>
              )}
              {!serialLookupLoading && existingProduct && (
                <p style={{ fontSize: '0.8rem', color: '#059669', marginTop: '0.35rem' }}>
                  พบรุ่น {existingProduct.serial} ในระบบ — จะเพิ่มบาร์โค้ดเข้ารุ่นเดิม (มี {existingProduct.variants?.length || 0} บาร์โค้ด)
                </p>
              )}
            </div>
            
            <div className="input-group" style={{ marginBottom: 0 }}>
              <label className="input-label">ชื่อสินค้า</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="เช่น Cargo Jogger"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                readOnly={!!existingProduct}
                style={existingProduct ? { background: '#f8fafc', cursor: 'not-allowed' } : undefined}
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
                readOnly={!!existingProduct}
                style={existingProduct ? { background: '#f8fafc', cursor: 'not-allowed' } : undefined}
              />
            </div>
          </div>

          <h3 style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>รายการไซส์และบาร์โค้ด</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            1 รุ่น (Serial) มีได้หลายไซส์ · 1 บาร์โค้ด = 1 ชิ้น · ทุกบาร์โค้ดต้องไม่ซ้ำกัน · บาร์โค้ดที่บันทึกจะถูกรับเข้าสต๊อกทันที
          </p>
          
          {variants.map((variant) => (
            <div
              key={variant.id}
              style={{
                display: 'flex',
                gap: '1rem',
                marginBottom: '1rem',
                alignItems: 'flex-end',
                padding: filledVariantId === variant.id ? '0.75rem' : 0,
                borderRadius: '8px',
                background: filledVariantId === variant.id ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                outline: filledVariantId === variant.id ? '2px solid var(--primary-light)' : 'none',
                transition: 'background 0.3s, outline 0.3s',
              }}
            >
              <div className="input-group" style={{ marginBottom: 0, flex: 1 }}>
                <label className="input-label">ไซส์</label>
                <select
                  className="input-field"
                  value={variant.size}
                  onChange={(e) => handleVariantChange(variant.id, 'size', e.target.value)}
                >
                  {getSizeSelectOptions(variant.size).map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
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
              <Save size={18} /> {loading ? 'กำลังบันทึก...' : 'รับเข้าสต๊อก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddProduct;
