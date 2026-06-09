import {
  Camera,
  ClipboardList,
  ImagePlus,
  PackagePlus,
  RotateCcw,
  ShoppingCart,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api";
import { recognizeBarcodesFromImage } from "../utils/ocrBarcode";

const Scanner = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);      // เลือกจากแกลเลอรี่
  const cameraInputRef = useRef(null);   // เปิดกล้องโดยตรง (สำหรับ iOS)

  const [productData, setProductData] = useState(null);
  const [error, setError] = useState(null);
  const [modalError, setModalError] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [actionType, setActionType] = useState("sell");
  const [adjustStock, setAdjustStock] = useState("1");
  const [transactionSuccess, setTransactionSuccess] = useState("");
  const [transactionLoading, setTransactionLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [detectedCandidates, setDetectedCandidates] = useState([]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  // ตรวจสอบว่าเป็น iOS หรือไม่
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  const startCamera = useCallback(async () => {
    setCameraError(null);
    stopCamera();

    // iOS Safari: ใช้ input[capture] แทน getUserMedia เพราะเสถียรกว่า
    if (isIOS) {
      setCameraError(null);
      setCameraReady(false); // ไม่ใช้ video preview บน iOS
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("อุปกรณ์นี้ไม่รองรับกล้อง — ใช้เลือกรูปจากแกลเลอรี่แทน");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 16 / 9 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // iOS Safari ต้องการ setAttribute เพิ่มเติม
        videoRef.current.setAttribute('playsinline', true);
        videoRef.current.setAttribute('muted', true);
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch {
      setCameraError(
        "ไม่สามารถเปิดกล้องได้ — ลองกดปุ่ม 'เปิดกล้อง' แทนครับ",
      );
    }
  }, [stopCamera, isIOS]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const resetCapture = useCallback(() => {
    setCapturedImage(null);
    setDetectedCandidates([]);
    setError(null);
    startCamera();
  }, [startCamera]);

  const resetAfterScan = useCallback(() => {
    setShowModal(false);
    setManualBarcode("");
    setProductData(null);
    setTransactionSuccess("");
    setModalError("");
    setAdjustStock("1");
    setActionType("sell");
    resetCapture();
  }, [resetCapture]);

  const lookupBarcode = useCallback(async (barcode) => {
    const normalized = barcode.trim();
    if (!normalized) return null;

    try {
      const res = await api.get(`/scan/${encodeURIComponent(normalized)}`);
      return res.data;
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }, []);

  const fetchProductByBarcode = useCallback(
    async (barcode) => {
      const normalized = barcode.trim();
      if (!normalized) return;

      setError(null);
      setModalError("");
      setProductData(null);
      setTransactionSuccess("");
      setLookupLoading(true);

      try {
        const data = await lookupBarcode(normalized);
        if (!data) {
          setError("ไม่พบบาร์โค้ดนี้ในระบบ");
          return;
        }
        setProductData(data);
        setShowModal(true);
        stopCamera();
      } catch (err) {
        setError(err.response?.data?.error || "ค้นหาสินค้าไม่สำเร็จ");
      } finally {
        setLookupLoading(false);
      }
    },
    [lookupBarcode, stopCamera],
  );

  const fetchProductByCandidates = useCallback(
    async (candidates) => {
      setError(null);
      setModalError("");
      setProductData(null);
      setTransactionSuccess("");
      setLookupLoading(true);

      try {
        if (candidates.length === 0) {
          setError(
            "ไม่พบตัวเลขใต้บาร์โค้ดในภาพ — จ่อให้เห็นตัวเลขชัด หรือกรอกบาร์โค้ดด้านล่าง",
          );
          return;
        }

        try {
          const res = await api.post("/scan/resolve", { candidates });
          setProductData(res.data);
          setShowModal(true);
          stopCamera();
          return;
        } catch (err) {
          if (err.response?.status !== 404) throw err;
        }

        setError(
          `อ่านตัวเลขได้: ${candidates.slice(0, 3).join(", ")} — แต่ไม่พบในระบบ กรุณาเพิ่มสินค้าก่อน หรือกรอกบาร์โค้ดเอง`,
        );
      } catch (err) {
        setError(err.response?.data?.error || "ค้นหาสินค้าไม่สำเร็จ");
      } finally {
        setLookupLoading(false);
      }
    },
    [stopCamera],
  );

  const processImage = useCallback(
    async (imageSrc) => {
      setOcrLoading(true);
      setError(null);
      setDetectedCandidates([]);
      console.log("imageSrc", imageSrc);

      try {
        const { candidates } = await recognizeBarcodesFromImage(imageSrc);
        setDetectedCandidates(candidates);
        await fetchProductByCandidates(candidates);
      } catch (err) {
        console.error("recognizeBarcodesFromImage failed:", err);
        setError(
          "ประมวลผลภาพไม่สำเร็จ — ลองเลือกรูปใหม่หรือกรอกบาร์โค้ดด้วยตนเอง",
        );
      } finally {
        setOcrLoading(false);
      }
    },
    [fetchProductByCandidates],
  );

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !cameraReady) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
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
    // Reset value เพื่อให้เลือกไฟล์เดิมซ้ำได้
    setTimeout(() => { e.target.value = ""; }, 300);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      fetchProductByBarcode(manualBarcode.trim());
    }
  };

  const refreshProductData = async (barcode) => {
    const res = await api.get(`/scan/${encodeURIComponent(barcode)}`);
    setProductData(res.data);
  };

  const barcodeInStock = Number(productData?.stock_quantity) > 0;

  const executeTransaction = async () => {
    if (actionType === "sell" && !barcodeInStock) {
      setModalError("บาร์โค้ดนี้ไม่อยู่ในสต๊อก");
      return;
    }
    if (actionType === "receive" && barcodeInStock) {
      setModalError("บาร์โค้ดนี้อยู่ในสต๊อกแล้ว");
      return;
    }

    const payloadQty = actionType === "adjust" ? parseInt(adjustStock, 10) : 1;

    setTransactionLoading(true);
    setModalError("");

    try {
      await api.post("/transaction", {
        variant_id: productData.variant_id,
        type: actionType,
        quantity: payloadQty,
      });
      await refreshProductData(productData.barcode);
      setTransactionSuccess("done");
      setTimeout(resetAfterScan, 1500);
    } catch (err) {
      const msg = err.response?.data?.error;
      setModalError(msg || "ทำรายการไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setTransactionLoading(false);
    }
  };

  const closeModal = () => {
    resetAfterScan();
  };

  const busy = lookupLoading || ocrLoading;

  return (
    <div>
      <h1 style={{ marginBottom: "2rem" }}>ถ่ายภาพป้ายสินค้า</h1>

      <div className="dashboard-grid">
        <div className="glass-panel" style={{ padding: "1.5rem" }}>
          <h3>ถ่ายภาพป้ายบาร์โค้ด</h3>
          <p className="scanner-hint">
            แนบรูปที่ crop เฉพาะบาร์โค้ด + ตัวเลขด้านล่าง —
            ระบบสแกนแถบบาร์โค้ดและอ่านตัวเลขอัตโนมัติ (เร็วขึ้นถ้าเห็นเลขชัด)
          </p>

          <div className="scanner-camera-wrap">
            {capturedImage ? (
              <img
                src={capturedImage}
                alt="ภาพที่ถ่าย"
                className="scanner-captured-preview"
              />
            ) : isIOS ? (
              // iOS: แสดง placeholder แทน video (ใช้ input[capture] แทน)
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
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>

          {cameraError && !capturedImage && (
            <div
              className="badge badge-warning mt-4"
              style={{ display: "block", padding: "1rem" }}
            >
              {cameraError}
            </div>
          )}

          <div className="scanner-capture-actions">
            {!capturedImage ? (
              <>
                {/* ปุ่มถ่ายภาพ: iOS → ใช้ input[capture], Android/Desktop → ใช้ video snapshot */}
                {isIOS ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={busy}
                  >
                    <Camera size={18} /> {busy ? "กำลังอ่าน..." : "เปิดกล้องถ่ายภาพ"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={capturePhoto}
                    disabled={!cameraReady || busy}
                  >
                    <Camera size={18} /> {busy ? "กำลังอ่านตัวเลข..." : "ถ่ายภาพ"}
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

          {/* iOS: input สำหรับเปิดกล้องโดยตรง */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
          {/* input เลือกจากแกลเลอรี่ (ไม่มี capture) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />

          <div className="mt-4">
            <p className="text-center text-muted">
              หรือกรอกบาร์โค้ดด้วยตนเอง (สำหรับเครื่องสแกน USB)
            </p>
            <form
              onSubmit={handleManualSubmit}
              style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}
            >
              <input
                type="text"
                className="input-field"
                placeholder="พิมพ์บาร์โค้ดที่นี่..."
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {lookupLoading ? "ค้นหา..." : "ค้นหา"}
              </button>
            </form>
          </div>

          {ocrLoading && (
            <div
              className="badge badge-warning mt-4"
              style={{ display: "block", padding: "1rem" }}
            >
              กำลังสแกนบาร์โค้ด... (ครั้งแรกอาจใช้เวลาสักครู่)
            </div>
          )}

          {lookupLoading && !ocrLoading && (
            <div
              className="badge badge-warning mt-4"
              style={{ display: "block", padding: "1rem" }}
            >
              กำลังค้นหาสินค้าในระบบ...
            </div>
          )}

          {detectedCandidates.length > 0 && !showModal && (
            <div
              className="badge badge-warning mt-4"
              style={{ display: "block", padding: "1rem" }}
            >
              ตัวเลขที่อ่านได้: {detectedCandidates.slice(0, 3).join(", ")}
            </div>
          )}

          {error && (
            <div
              className="badge badge-danger mt-4"
              style={{ display: "block", padding: "1rem" }}
            >
              {error === "Barcode not found" ? "ไม่พบบาร์โค้ดนี้ในระบบ" : error}
            </div>
          )}
        </div>
      </div>

      {showModal && productData && (
        <div className="modal-overlay">
          <div
            className="glass-panel modal-content scanner-modal"
            style={{ padding: "2rem" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2>พบสินค้า</h2>
              <button
                type="button"
                className="btn btn-outline"
                onClick={closeModal}
                disabled={transactionLoading}
              >
                ปิด
              </button>
            </div>

            <div
              style={{
                marginTop: "1.5rem",
                background: "#f8fafc",
                padding: "1.5rem",
                borderRadius: "8px",
              }}
            >
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  marginBottom: "0.25rem",
                }}
              >
                รุ่น (Serial)
              </p>
              <h3
                style={{
                  fontSize: "1.25rem",
                  color: "var(--primary-dark)",
                  marginBottom: "0.25rem",
                }}
              >
                {productData.serial}
              </h3>
              <p style={{ marginBottom: "1rem" }}>
                {productData.name} · ฿
                {Number(productData.price).toLocaleString()}
              </p>

              <div
                style={{
                  padding: "0.75rem",
                  background: "white",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "1rem",
                }}
              >
                <p style={{ marginBottom: "0.25rem" }}>
                  <strong>บาร์โค้ดที่อ่านได้:</strong> {productData.barcode}
                </p>
                <p style={{ marginBottom: 0 }}>
                  <strong>ไซส์:</strong>{" "}
                  <span
                    className="badge badge-success"
                    style={{ fontSize: "0.9rem" }}
                  >
                    {productData.size}
                  </span>{" "}
                  · {barcodeInStock ? "ในสต๊อก (1 ชิ้น)" : "ว่าง (0 ชิ้น)"}
                </p>
              </div>

              {productData.size_stock?.length > 0 && (
                <div>
                  <p
                    style={{
                      fontWeight: 600,
                      marginBottom: "0.5rem",
                      color: "var(--primary-dark)",
                    }}
                  >
                    สต๊อกคงเหลือทั้งรุ่น {productData.serial}
                  </p>
                  <div className="scanner-size-stock-list">
                    {productData.size_stock.map((item) => {
                      const isScannedSize =
                        item.size.toLowerCase() ===
                        productData.size.toLowerCase();
                      return (
                        <div
                          key={item.size}
                          className={`scanner-size-row ${isScannedSize ? "scanner-size-row-active" : ""}`}
                        >
                          <span className="scanner-size-label">
                            {item.size}
                            {isScannedSize && " (ที่อ่านได้)"}
                          </span>
                          <span className="scanner-size-qty">
                            {item.total_pieces ?? item.barcode_count} ชิ้น
                            {(item.in_stock ?? item.total_stock) > 0 &&
                              ` (${item.in_stock ?? item.total_stock} ในสต๊อก)`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p
                    style={{
                      marginTop: "0.75rem",
                      marginBottom: 0,
                      fontWeight: 600,
                      color: "var(--primary-dark)",
                    }}
                  >
                    รวมทั้งรุ่น:{" "}
                    {productData.product_total_pieces ??
                      productData.product_total_stock}{" "}
                    ชิ้น
                    {productData.product_in_stock !== undefined &&
                      ` (${productData.product_in_stock} ในสต๊อก)`}
                  </p>
                </div>
              )}
            </div>

            {modalError && (
              <div
                className="badge badge-danger mt-4"
                style={{ display: "block", padding: "1rem" }}
              >
                {modalError}
              </div>
            )}

            {transactionSuccess ? (
              <div
                className="badge badge-success mt-4"
                style={{
                  display: "block",
                  padding: "1rem",
                  textAlign: "center",
                  fontSize: "1.1rem",
                }}
              >
                ทำรายการสำเร็จ! บาร์โค้ดนี้
                {Number(productData.stock_quantity) > 0
                  ? "อยู่ในสต๊อก"
                  : "ว่างแล้ว"}{" "}
                · รวมทั้งรุ่น{" "}
                {productData.product_total_pieces ??
                  productData.product_total_stock}{" "}
                ชิ้น
              </div>
            ) : (
              <div style={{ marginTop: "2rem" }}>
                <label className="input-label">เลือกการทำรายการ:</label>
                <div className="scanner-action-buttons">
                  <button
                    type="button"
                    className={`btn ${actionType === "sell" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setActionType("sell")}
                    disabled={transactionLoading}
                  >
                    <ShoppingCart size={18} /> ขาย
                  </button>
                  <button
                    type="button"
                    className={`btn ${actionType === "receive" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setActionType("receive")}
                    disabled={transactionLoading}
                  >
                    <PackagePlus size={18} /> รับเข้า
                  </button>
                  <button
                    type="button"
                    className={`btn ${actionType === "adjust" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setActionType("adjust")}
                    disabled={transactionLoading}
                  >
                    <ClipboardList size={18} /> นับสต๊อก
                  </button>
                </div>

                {actionType === "adjust" ? (
                  <div className="input-group">
                    <label className="input-label">
                      สถานะสต๊อกของบาร์โค้ดนี้
                    </label>
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
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-muted)",
                      marginBottom: "1rem",
                    }}
                  >
                    1 บาร์โค้ด = 1 ชิ้น —{" "}
                    {actionType === "sell"
                      ? "ขายชิ้นนี้ 1 ชิ้น"
                      : "รับเข้าชิ้นนี้ 1 ชิ้น"}
                  </p>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  onClick={executeTransaction}
                  disabled={transactionLoading}
                >
                  {transactionLoading
                    ? "กำลังทำรายการ..."
                    : `ยืนยันทำรายการ (${actionType === "sell" ? "ขาย" : actionType === "receive" ? "รับเข้า" : "ปรับสต๊อก"})`}
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
