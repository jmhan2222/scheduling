import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export default function CurriculumModal({ courseName, date, onClose }) {
  const [byRound, setByRound] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseName) { setLoading(false); return; }
    const q = date
      ? query(
          collection(db, 'curriculum'),
          where('courseName', '==', courseName),
          where('date', '==', date),
        )
      : query(
          collection(db, 'curriculum'),
          where('courseName', '==', courseName),
        );

    return onSnapshot(q, (snap) => {
      const grouped = {};
      snap.docs.forEach((d) => {
        const item = { id: d.id, ...d.data() };
        const r = item.round || '1차';
        if (!grouped[r]) grouped[r] = [];
        grouped[r].push(item);
      });
      // 교시 순 정렬
      Object.keys(grouped).forEach((r) => {
        grouped[r].sort((a, b) => (a.period || 0) - (b.period || 0));
      });
      setByRound(grouped);
      setLoading(false);
    });
  }, [courseName, date]);

  const rounds = Object.keys(byRound).sort();
  const roundCount = rounds.length;

  // 차수 수에 따라 모달 너비 결정
  const modalWidth = roundCount >= 3 ? '90vw' : roundCount === 2 ? '860px' : '480px';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ width: modalWidth, maxWidth: '96vw' }}
        onClick={(ev) => ev.stopPropagation()}
        id="print-area"
      >
        <div className="modal-header">
          <h3>교시별 커리큘럼</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="curriculum-meta">
            <span><strong>과정명:</strong> {courseName || '-'}</span>
            <span><strong>날짜:</strong> {date || '-'}</span>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>
              불러오는 중...
            </p>
          ) : roundCount === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>
              해당 날짜의 커리큘럼 데이터가 없습니다.
            </p>
          ) : (
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', alignItems: 'flex-start' }}>
              {rounds.map((round) => (
                <div key={round} style={{ flex: 1, minWidth: 260 }}>
                  {/* 차수 헤더 */}
                  <div style={{
                    background: '#1e3a5f',
                    color: '#fff',
                    padding: '6px 12px',
                    borderRadius: '8px 8px 0 0',
                    fontSize: 13,
                    fontWeight: 600,
                  }}>
                    {round}
                  </div>

                  {/* 교시 테이블 */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>교시</th>
                        <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #e5e7eb' }}>시간</th>
                        <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #e5e7eb' }}>과목명</th>
                        <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #e5e7eb' }}>강사</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byRound[round].map((item, i) => (
                        <tr
                          key={item.id}
                          style={{
                            background: i % 2 === 0 ? '#fff' : '#f9fafb',
                            color: item.instructor ? 'inherit' : '#9ca3af',
                          }}
                        >
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>
                            {item.period}교시
                          </td>
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                            {item.startTime && item.endTime
                              ? `${item.startTime}~${item.endTime}`
                              : item.startTime || ''}
                          </td>
                          <td style={{ padding: '6px 8px' }}>{item.subject}</td>
                          <td style={{ padding: '6px 8px', color: item.instructor ? '#374151' : '#9ca3af' }}>
                            {item.instructor || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
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
