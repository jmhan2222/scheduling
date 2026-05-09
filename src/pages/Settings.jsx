import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function Settings({ user }) {
  const [users, setUsers] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
      setUsers(list);
      const me = list.find((u) => u.id === user.uid);
      setIsAdmin(me?.role === 'admin');
      setLoading(false);
    });
  }, [user.uid]);

  const adminCount = users.filter((u) => u.role === 'admin').length;

  const toggleRole = async (target) => {
    const isTargetAdmin = target.role === 'admin';
    if (isTargetAdmin && adminCount <= 1) {
      setError('최소 1명의 관리자가 필요합니다.');
      return;
    }
    setError(null);
    setUpdating(target.id);
    try {
      await updateDoc(doc(db, 'users', target.id), {
        role: isTargetAdmin ? 'member' : 'admin',
      });
    } catch {
      setError('변경에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) return <div className="loading">로딩 중...</div>;

  if (!isAdmin) {
    return (
      <div className="upload-page">
        <div className="admin-required">
          <p style={{ fontSize: 48 }}>🔒</p>
          <p>관리자 권한이 필요합니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="upload-page">
      <h2>사용자 관리</h2>
      {error && <div className="status-msg error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="upload-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="settings-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>구분</th>
              <th>역할</th>
              <th>변경</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isTargetAdmin = u.role === 'admin';
              const isLastAdmin = isTargetAdmin && adminCount <= 1;
              return (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.id === user.uid && (
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 6 }}>
                        (나)
                      </span>
                    )}
                  </td>
                  <td>{u.type === 'permanent' ? '정규직' : '단기'}</td>
                  <td>
                    <span className={`role-badge ${isTargetAdmin ? 'role-admin' : 'role-member'}`}>
                      {isTargetAdmin ? '관리자' : '일반'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn-role-toggle ${isTargetAdmin ? 'demote' : 'promote'}`}
                      onClick={() => toggleRole(u)}
                      disabled={!!updating || isLastAdmin}
                      title={isLastAdmin ? '마지막 관리자는 변경할 수 없습니다' : ''}
                    >
                      {updating === u.id ? '변경 중...' : isTargetAdmin ? '일반으로' : '관리자로'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
