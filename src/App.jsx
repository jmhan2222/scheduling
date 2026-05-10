import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, getDocs, collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import Overview from './pages/Overview';
import WeeklyView from './pages/WeeklyView';
import Checklist from './pages/Checklist';
import Upload from './pages/Upload';
import Settings from './pages/Settings';

async function checkDayBeforeNotifications(user) {
  if (!('Notification' in window)) return;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  const today = new Date().toISOString().split('T')[0];
  const notifiedKey = `d1_notified_${user.uid}_${today}`;
  if (localStorage.getItem(notifiedKey)) return;

  const userSnap = await getDoc(doc(db, 'users', user.uid));
  if (!userSnap.exists()) return;
  const memberName = userSnap.data().name;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const q = query(
    collection(db, 'schedules'),
    where('date', '==', tomorrowStr),
    where('memberName', '==', memberName)
  );
  const snap = await getDocs(q);

  if (!snap.empty) {
    snap.forEach((docSnap) => {
      const s = docSnap.data();
      new Notification('내일 교육 일정 알림 ✈️', {
        body: `${s.courseName}${s.category ? ` (${s.category})` : ''}`,
        icon: '/icon.png',
      });
    });
  }

  localStorage.setItem(notifiedKey, '1');
}

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        checkDayBeforeNotifications(u).catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setIsAdmin(snap.exists() && snap.data().role === 'admin');
    });
  }, [user]);

  const handleLogin = () => signInWithPopup(auth, googleProvider).catch(console.error);
  const handleLogout = () => signOut(auth);

  if (loading) return <div className="loading">로딩 중...</div>;

  if (!user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">✈️</div>
          <h1>교육 스케줄 관리</h1>
          <p>항공사 서비스팀 교육 일정 관리 시스템</p>
          <button onClick={handleLogin} className="btn-google">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Google로 로그인
          </button>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <div className="header-left">
            <span className="header-logo">✈️</span>
            <h1>교육 스케줄 관리</h1>
          </div>
          <nav className="header-nav">
            <NavLink to="/" end>월간 현황</NavLink>
            <NavLink to="/weekly">주간 시간표</NavLink>
            <NavLink to="/checklist">체크리스트</NavLink>
            {isAdmin && <NavLink to="/upload">엑셀 업로드</NavLink>}
            {isAdmin && <NavLink to="/settings">사용자 관리</NavLink>}
          </nav>
          <div className="header-right">
            <span className="user-name">{user.displayName}</span>
            <button onClick={handleLogout} className="btn-logout">로그아웃</button>
          </div>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Overview user={user} />} />
            <Route path="/weekly" element={<WeeklyView user={user} />} />
            <Route path="/checklist" element={<Checklist user={user} isAdmin={isAdmin} />} />
            <Route path="/upload" element={<Upload user={user} />} />
            <Route path="/settings" element={<Settings user={user} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
