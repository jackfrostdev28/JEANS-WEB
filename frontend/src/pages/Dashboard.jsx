import React, { useEffect, useState } from 'react';
import api from '../api';
import { DollarSign, Package, AlertTriangle, XCircle } from 'lucide-react';

const Dashboard = () => {
  const [data, setData] = useState({
    salesToday: 0,
    salesMonth: 0,
    totalItems: 0,
    lowStockItems: [],
    outOfStockItems: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/dashboard');
      setData(res.data);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  if (loading) return <div>กำลังโหลดข้อมูล...</div>;

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>แดชบอร์ด (สรุปยอดขายและสต๊อก)</h1>
      
      <div className="dashboard-grid">
        <div className="glass-panel stat-card">
          <div className="stat-icon"><DollarSign size={24} /></div>
          <div className="stat-info">
            <h3>ยอดขายวันนี้</h3>
            <div className="value">฿{data.salesToday?.toLocaleString() || 0}</div>
          </div>
        </div>
        
        <div className="glass-panel stat-card">
          <div className="stat-icon"><DollarSign size={24} /></div>
          <div className="stat-info">
            <h3>ยอดขายเดือนนี้</h3>
            <div className="value">฿{data.salesMonth?.toLocaleString() || 0}</div>
          </div>
        </div>
        
        <div className="glass-panel stat-card">
          <div className="stat-icon"><Package size={24} /></div>
          <div className="stat-info">
            <h3>สินค้าคงคลังทั้งหมด</h3>
            <div className="value">{data.totalItems?.toLocaleString() || 0}</div>
          </div>
        </div>
      </div>
      
      <div className="dashboard-grid">
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)' }}>
            <AlertTriangle size={20} /> สินค้าใกล้หมด
          </h3>
          {data.lowStockItems.length === 0 ? (
            <p className="text-muted">ไม่มีสินค้าใกล้หมดสต๊อก</p>
          ) : (
            <div className="table-container mt-4">
              <table>
                <thead>
                  <tr>
                    <th>รหัส (Serial)</th>
                    <th>ชื่อสินค้า</th>
                    <th>ไซส์</th>
                    <th>คงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lowStockItems.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.serial}</td>
                      <td>{item.name}</td>
                      <td>{item.size}</td>
                      <td><span className="badge badge-warning">{item.stock_quantity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
            <XCircle size={20} /> สินค้าหมดสต๊อก
          </h3>
          {data.outOfStockItems.length === 0 ? (
            <p className="text-muted">ไม่มีสินค้าที่หมดสต๊อก</p>
          ) : (
            <div className="table-container mt-4">
              <table>
                <thead>
                  <tr>
                    <th>รหัส (Serial)</th>
                    <th>ชื่อสินค้า</th>
                    <th>ไซส์</th>
                  </tr>
                </thead>
                <tbody>
                  {data.outOfStockItems.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.serial}</td>
                      <td>{item.name}</td>
                      <td>{item.size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
