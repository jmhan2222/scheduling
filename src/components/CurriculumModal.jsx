import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export default function CurriculumModal({ courseName, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseName) { setLoading(false); return; }
    const q = query(
      collection(db, 'curriculum'),
      where('courseName', '==', courseName),
      orderBy('period', 'asc')
    );
    return onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
  }, [courseName]);

  const meta = items[0] || {};

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} id="print-area">
        <div className="modal-header">
          <h3>교시별 커리큘럼</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="curriculum-meta">
            <span><strong>과정명:</strong> {courseName || '-'}</span>
            {meta.round && <span><strong>차수:</strong> {meta.round}</span>}
            {meta.date && <span><strong>날짜:</strong> {meta.date}</span>}
          </div>
          {loading ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
              불러오는 중...
            </p>
          ) : items.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>
              커리큘럼 데이터가 없습니다.
            </p>
          ) : (
            <div className="curriculum-table-wrap">
              <table className="curriculum-table">
                <thead>
                  <tr>
                    <th>교시</th>
                    <th>시작</th>
                    <th>종료</th>
                    <th>과목명</th>
                    <th>강사</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.period}교시</td>
                      <td>{item.startTime}</td>
                      <td>{item.endTime}</td>
                      <td>{item.subject}</td>
                      <td>{item.instructor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-print" onClick={handlePrint}>🖨️ 인쇄</button>
          <button className="btn-secondary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
