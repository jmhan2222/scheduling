import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export default function CurriculumModal({ courseName, date, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseName) { setLoading(false); return; }
    let q;
    if (date) {
      q = query(
        collection(db, 'curriculum'),
        where('courseName', '==', courseName),
        where('date', '==', date),
      );
    } else {
      q = query(
        collection(db, 'curriculum'),
        where('courseName', '==', courseName),
      );
    }
    return onSnapshot(q, (snap) => {
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.period || 0) - (b.period || 0));
      setItems(sorted);
      setLoading(false);
    });
  }, [courseName, date]);

  const meta = items[0] || {};

  const formatTime = (s, e) => {
    if (s && e) return `${s}~${e}`;
    if (s) return s;
    return '';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(ev) => ev.stopPropagation()} id="print-area">
        <div className="modal-header">
          <h3>교시별 커리큘럼</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="curriculum-meta">
            <span><strong>과정명:</strong> {courseName || '-'}</span>
            {meta.round && <span><strong>차수:</strong> {meta.round}</span>}
            <span><strong>날짜:</strong> {date || meta.date || '-'}</span>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
              불러오는 중...
            </p>
          ) : items.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
              해당 날짜의 커리큘럼 데이터가 없습니다.
            </p>
          ) : (
            <div className="curriculum-table-wrap">
              <table className="curriculum-table">
                <thead>
                  <tr>
                    <th>교시</th>
                    <th>시간</th>
                    <th>과목명</th>
                    <th>강사</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      style={!item.instructor ? { color: 'var(--text-muted)' } : undefined}
                    >
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.period}교시</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatTime(item.startTime, item.endTime)}</td>
                      <td>{item.subject}</td>
                      <td style={{ color: item.instructor ? 'inherit' : 'var(--text-muted)' }}>
                        {item.instructor || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-print" onClick={() => window.print()}>🖨️ 인쇄</button>
          <button className="btn-secondary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
