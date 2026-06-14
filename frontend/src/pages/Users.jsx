import React, { useEffect, useState, useContext } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import api from '../api';
import { AuthContext } from '../AuthContext';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useContext(AuthContext);

  // Form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('temporary');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPasswords, setShowPasswords] = useState(true);
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/users', { username, password, name, role });
      setUsers([...users, res.data]);
      setSuccess('เพิ่มผู้ใช้งานสำเร็จ');
      setUsername('');
      setPassword('');
      setName('');
      setRole('temporary');
    } catch (err) {
      setError(err.response?.data?.error || 'เกิดข้อผิดพลาดในการเพิ่มผู้ใช้งาน');
    }
  };

  if (user?.role !== 'admin') {
    return <div className="text-center mt-4">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะผู้ดูแลระบบ)</div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>จัดการผู้ใช้งาน</h1>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        
        {/* User List */}
        <div className="glass-panel" style={{ flex: 2, padding: '1.5rem', minWidth: '300px' }}>
          <h3 style={{ marginBottom: '1.5rem' }}>รายชื่อผู้ใช้งานในระบบ</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ชื่อผู้ใช้งาน (Username)</th>
                  <th>ชื่อ-นามสกุล</th>
                  <th>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      รหัสผ่าน
                      <button
                        type="button"
                        className="password-toggle-btn"
                        style={{ position: 'static', transform: 'none', padding: '0.25rem' }}
                        onClick={() => setShowPasswords((prev) => !prev)}
                        aria-label={showPasswords ? 'ซ่อนรหัสผ่านทั้งหมด' : 'แสดงรหัสผ่านทั้งหมด'}
                      >
                        {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </span>
                  </th>
                  <th>ระดับสิทธิ์ (Role)</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.name}</td>
                    <td>
                      {u.plain_password
                        ? (showPasswords ? u.plain_password : '••••••••')
                        : '—'}
                    </td>
                    <td>
                      {u.role === 'admin' ? (
                        <span className="badge badge-success">ผู้ขายประจำ (Admin)</span>
                      ) : (
                        <span className="badge badge-warning">ผู้ขายชั่วคราว</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Add User Form */}
        <div className="glass-panel" style={{ flex: 1, padding: '1.5rem', minWidth: '300px' }}>
          <h3 style={{ marginBottom: '1.5rem' }}>เพิ่มผู้ใช้งานใหม่</h3>
          
          {error && <div className="badge badge-danger mb-4" style={{ display: 'block', padding: '1rem' }}>{error}</div>}
          {success && <div className="badge badge-success mb-4" style={{ display: 'block', padding: '1rem' }}>{success}</div>}

          <form onSubmit={handleAddUser}>
            <div className="input-group">
              <label className="input-label">ชื่อผู้ใช้งาน (Username)</label>
              <input 
                type="text" 
                className="input-field" 
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
            </div>
            
            <div className="input-group">
              <label className="input-label">รหัสผ่าน</label>
              <div className="password-input-wrap">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  className="input-field"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={showNewPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                >
                  {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <div className="input-group">
              <label className="input-label">ชื่อ-นามสกุล / ชื่อเล่น</label>
              <input 
                type="text" 
                className="input-field" 
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">สิทธิ์การใช้งาน (Role)</label>
              <select 
                className="input-field" 
                value={role}
                onChange={e => setRole(e.target.value)}
              >
                <option value="temporary">ผู้ขายชั่วคราว</option>
                <option value="admin">ผู้ขายประจำ (Admin)</option>
              </select>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
              บันทึกผู้ใช้งาน
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default Users;
