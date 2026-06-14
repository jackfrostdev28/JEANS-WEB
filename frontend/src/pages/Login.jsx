import React, { useState, useContext } from 'react';
import { AuthContext } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError('ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
        <h2 className="text-center" style={{ marginBottom: '2rem' }}>เข้าสู่ระบบ</h2>
        
        {error && (
          <div className="badge badge-danger" style={{ display: 'block', marginBottom: '1rem', textAlign: 'center', padding: '0.5rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label">ชื่อผู้ใช้งาน</label>
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
                type={showPassword ? 'text' : 'password'}
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            ลงชื่อเข้าใช้
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
