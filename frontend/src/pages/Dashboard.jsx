import React, { useEffect, useMemo, useState } from 'react';
import api from '../api';
import { DollarSign, Package, AlertTriangle, XCircle, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

const EMPTY_PAGINATION = {
  items: [],
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1,
};

const formatMoney = (value) => `฿${(value ?? 0).toLocaleString()}`;

const formatDate = (dateValue) => {
  const date = new Date(dateValue);
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const PaginationBar = ({ data, pageSize, onPageChange, onPageSizeChange, loading }) => {
  const { page, total, totalPages } = data;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="pagination-bar">
      <div className="pagination-info text-muted">
        แสดง {start.toLocaleString()}–{end.toLocaleString()} จาก {total.toLocaleString()} รายการ
      </div>
      <div className="pagination-controls">
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-muted">ต่อหน้า</span>
          <select
            className="input-field"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            style={{ minWidth: '5rem' }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-outline"
          disabled={loading || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="pagination-page-label">
          หน้า {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn btn-outline"
          disabled={loading || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthlyPage, setMonthlyPage] = useState(1);
  const [monthlyPageSize, setMonthlyPageSize] = useState(10);
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyPageSize, setDailyPageSize] = useState(10);
  const [data, setData] = useState({
    salesToday: 0,
    salesMonth: 0,
    totalItems: 0,
    lowStockItems: [],
    outOfStockItems: [],
  });
  const [monthlySales, setMonthlySales] = useState(EMPTY_PAGINATION);
  const [dailySales, setDailySales] = useState(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [dailyLoading, setDailyLoading] = useState(true);

  const yearOptions = useMemo(() => {
    const currentYear = now.getFullYear();
    return Array.from({ length: 6 }, (_, index) => currentYear - index);
  }, [now]);

  const selectedMonthLabel = `${THAI_MONTHS[month - 1]} ${year}`;

  useEffect(() => {
    fetchDashboard();
  }, [year, month]);

  useEffect(() => {
    fetchMonthlySales();
  }, [year, monthlyPage, monthlyPageSize]);

  useEffect(() => {
    fetchDailySales();
  }, [year, month, dailyPage, dailyPageSize]);

  useEffect(() => {
    setMonthlyPage(1);
  }, [year, monthlyPageSize]);

  useEffect(() => {
    setDailyPage(1);
  }, [year, month, dailyPageSize]);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dashboard', { params: { year, month } });
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMonthlySales = async () => {
    setMonthlyLoading(true);
    try {
      const res = await api.get('/dashboard/monthly-sales', {
        params: { year, page: monthlyPage, pageSize: monthlyPageSize },
      });
      setMonthlySales(res.data);
    } catch (err) {
      console.error(err);
      setMonthlySales(EMPTY_PAGINATION);
    } finally {
      setMonthlyLoading(false);
    }
  };

  const fetchDailySales = async () => {
    setDailyLoading(true);
    try {
      const res = await api.get('/dashboard/daily-sales', {
        params: { year, month, page: dailyPage, pageSize: dailyPageSize },
      });
      setDailySales(res.data);
    } catch (err) {
      console.error(err);
      setDailySales(EMPTY_PAGINATION);
    } finally {
      setDailyLoading(false);
    }
  };

  if (loading && data.totalItems === 0 && !data.salesToday) {
    return <div>กำลังโหลดข้อมูล...</div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>แดชบอร์ด (สรุปยอดขายและสต๊อก)</h1>

      <div className="dashboard-grid">
        <div className="glass-panel stat-card">
          <div className="stat-icon"><DollarSign size={24} /></div>
          <div className="stat-info">
            <h3>ยอดขายวันนี้</h3>
            <div className="value">{formatMoney(data.salesToday)}</div>
          </div>
        </div>

        <div className="glass-panel stat-card">
          <div className="stat-icon"><DollarSign size={24} /></div>
          <div className="stat-info">
            <h3>ยอดขาย {selectedMonthLabel}</h3>
            <div className="value">{formatMoney(data.salesMonth)}</div>
          </div>
        </div>

        <div className="glass-panel stat-card">
          <div className="stat-icon"><Package size={24} /></div>
          <div className="stat-info">
            <h3>สินค้าคงคลังทั้งหมด</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>1 บาร์โค้ด = 1 ชิ้น</p>
            <div className="value">{data.totalItems?.toLocaleString() || 0}</div>
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Calendar size={20} /> สรุปยอดขาย
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="text-muted">ปี</span>
              <select
                className="input-field"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{ minWidth: '6rem' }}
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="text-muted">เดือน</span>
              <select
                className="input-field"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                style={{ minWidth: '8rem' }}
              >
                {THAI_MONTHS.map((label, index) => (
                  <option key={label} value={index + 1}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <h4 style={{ marginBottom: '0.75rem' }}>ยอดขายรายเดือน ปี {year}</h4>
        <PaginationBar
          data={monthlySales}
          pageSize={monthlyPageSize}
          loading={monthlyLoading}
          onPageChange={setMonthlyPage}
          onPageSizeChange={setMonthlyPageSize}
        />
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>เดือน</th>
                <th>รุ่น (Serial)</th>
                <th>ชื่อสินค้า</th>
                <th>ไซส์</th>
                <th>จำนวนที่ขาย</th>
                <th>ยอดขาย</th>
              </tr>
            </thead>
            <tbody>
              {monthlyLoading ? (
                <tr>
                  <td colSpan="6" className="text-center text-muted">กำลังโหลดข้อมูล...</td>
                </tr>
              ) : monthlySales.items.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center text-muted">ไม่มียอดขายในปีนี้</td>
                </tr>
              ) : (
                monthlySales.items.map((row, index) => (
                  <tr key={`${row.month}-${row.serial}-${row.size}-${index}`}>
                    <td>
                      {THAI_MONTHS[row.month - 1]}
                      {row.month === month && (
                        <span className="badge" style={{ marginLeft: '0.5rem', background: '#dbeafe', color: '#1e40af' }}>
                          เลือกอยู่
                        </span>
                      )}
                    </td>
                    <td>{row.serial}</td>
                    <td>{row.name}</td>
                    <td>{row.size}</td>
                    <td>{row.quantity.toLocaleString()}</td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(row.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <h4 style={{ margin: '1.5rem 0 0.75rem' }}>ยอดขายรายวัน {selectedMonthLabel}</h4>
        <PaginationBar
          data={dailySales}
          pageSize={dailyPageSize}
          loading={dailyLoading}
          onPageChange={setDailyPage}
          onPageSizeChange={setDailyPageSize}
        />
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>รุ่น (Serial)</th>
                <th>ชื่อสินค้า</th>
                <th>ไซส์</th>
                <th>จำนวนที่ขาย</th>
                <th>ยอดขาย</th>
              </tr>
            </thead>
            <tbody>
              {dailyLoading ? (
                <tr>
                  <td colSpan="6" className="text-center text-muted">กำลังโหลดข้อมูล...</td>
                </tr>
              ) : dailySales.items.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center text-muted">ไม่มียอดขายในเดือนนี้</td>
                </tr>
              ) : (
                dailySales.items.map((row, index) => (
                  <tr key={`${row.date}-${row.serial}-${row.size}-${index}`}>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.serial}</td>
                    <td>{row.name}</td>
                    <td>{row.size}</td>
                    <td>{row.quantity.toLocaleString()}</td>
                    <td style={{ fontWeight: 600 }}>{formatMoney(row.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
