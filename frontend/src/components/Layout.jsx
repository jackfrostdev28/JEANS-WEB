import React, { useContext } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { LayoutDashboard, PackageSearch, PackagePlus, ScanBarcode, History, Users, LogOut } from 'lucide-react';

const Layout = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/', label: 'แดชบอร์ด', icon: LayoutDashboard, adminOnly: false },
    { path: '/pos', label: 'สแกนสินค้า', icon: ScanBarcode, adminOnly: false },
    { path: '/inventory', label: 'สต๊อกสินค้าทั้งหมด', icon: PackageSearch, adminOnly: false },
    { path: '/inventory/add', label: 'เพิ่มสินค้าใหม่', icon: PackagePlus, adminOnly: true },
    { path: '/reports', label: 'ประวัติการเคลื่อนไหว', icon: History, adminOnly: false },
    { path: '/users', label: 'จัดการผู้ใช้งาน', icon: Users, adminOnly: true },
  ];

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-brand">
          ระบบจัดการสต๊อก
        </div>
        <div className="mb-4 text-center" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem' }}>
          ผู้ใช้งาน: {user?.name} ({user?.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงานขาย'})
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            if (item.adminOnly && user?.role !== 'admin') return null;
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path} 
                to={item.path} 
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <item.icon size={20} />
                {item.label}
              </Link>
            );
          })}
          
          <button onClick={handleLogout} className="nav-item" style={{ marginTop: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
            <LogOut size={20} />
            ออกจากระบบ
          </button>
        </nav>
      </aside>
      
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
