import React, { useContext, useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { LayoutDashboard, PackageSearch, PackagePlus, ScanBarcode, History, Users, LogOut, Menu, X } from 'lucide-react';

const Layout = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    setSidebarOpen(false);
    logout();
    navigate('/login');
  };

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const navItems = [
    { path: '/', label: 'แดชบอร์ด', icon: LayoutDashboard, adminOnly: false },
    { path: '/pos', label: 'ถ่ายภาพสินค้า', icon: ScanBarcode, adminOnly: false },
    { path: '/inventory', label: 'สต๊อกสินค้าทั้งหมด', icon: PackageSearch, adminOnly: false },
    { path: '/inventory/add', label: 'รับสินค้าเข้าสต๊อก', icon: PackagePlus, adminOnly: true },
    { path: '/reports', label: 'ประวัติการเคลื่อนไหว', icon: History, adminOnly: false },
    { path: '/users', label: 'จัดการผู้ใช้งาน', icon: Users, adminOnly: true },
  ];

  return (
    <div className="app-container">
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">ระบบจัดการสต๊อก</div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            aria-label="ปิดเมนู"
          >
            <X size={22} />
          </button>
        </div>
        <div className="sidebar-user">
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
          
          <button onClick={handleLogout} className="nav-item nav-item-logout">
            <LogOut size={20} />
            ออกจากระบบ
          </button>
        </nav>
      </aside>
      
      <div className="content-wrapper">
        <header className="mobile-header">
          <button
            type="button"
            className="menu-toggle-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="เปิดเมนู"
          >
            <Menu size={22} />
          </button>
          <span className="mobile-header-title">ระบบจัดการสต๊อก</span>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
