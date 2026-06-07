import React, { useEffect, useState } from 'react';
import api from '../api';

const Reports = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const res = await api.get('/transactions');
      setTransactions(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type) => {
    switch(type) {
      case 'sell': return <span className="badge badge-success">ขาย</span>;
      case 'receive': return <span className="badge" style={{ background: '#dbeafe', color: '#1e40af' }}>รับเข้า</span>;
      case 'adjust': return <span className="badge badge-warning">ปรับสต๊อก</span>;
      case 'return': return <span className="badge badge-danger">คืนสินค้า</span>;
      default: return type;
    }
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleString('th-TH');
  };

  if (loading) return <div>กำลังโหลดข้อมูล...</div>;

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>ประวัติการเคลื่อนไหว</h1>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>วันเวลา</th>
                <th>ประเภทรายการ</th>
                <th>รหัสสินค้า</th>
                <th>ชื่อสินค้า</th>
                <th>ไซส์</th>
                <th>จำนวน</th>
                <th>ผู้ทำรายการ</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id}>
                  <td>{formatDate(t.timestamp)}</td>
                  <td>{getTypeLabel(t.type)}</td>
                  <td>{t.serial}</td>
                  <td>{t.name}</td>
                  <td>{t.size}</td>
                  <td style={{ fontWeight: 'bold' }}>
                    {t.type === 'sell' ? '-' : '+'}{t.quantity}
                  </td>
                  <td>{t.user}</td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center text-muted">ยังไม่มีประวัติการทำรายการ</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
