import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot,
  getDocs, doc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const EMPTY_ROW = (period) => ({
  period,
  startTime: '',
  endTime: '',
  subject: '',
  instructor: '',
});

const inputStyle = {
  width: '100%',
  padding: '5px 8px',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  fontSize: 12,
  background: '#f8fafc',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function CurriculumModal({ courseName, date, onClose }) {
  const [byRound, setByRound] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [selectedRound, setSelectedRound] = useState(null);
  const [editRound, setEditRound] = useState('');
  const [editCourseName, setEditCourseName] = useState(courseName || '');
  const [editRows, setEditRows] = useState([]);
  const [saving, setSaving] = useState(false);

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
      Object.keys(grouped).forEach((r) => {
        grouped[r].sort((a, b) => (a.period || 0) - (b.period || 0));
      });
      setByRound(grouped);
      setLoading(false);
    });
  }, [courseName, date]);

  const rounds = Object.keys(byRound).sort();
  const roundCount = rounds.length;

  const startEditing = (round) => {
    setSelectedRound(round);
    setEditRound(round);
    setEditRows((byRound[round] || []).map((item) => ({ ...item })));
    setEditing(true);
  };

  const startNew = () => {
    setSelectedRound(null);
    setEditRound('');
    setEditRows(Array.from({ length: 8 }, (_, i) => EMPTY_ROW(i + 1)));
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setSelectedRound(null);
    setEditRound('');
    setEditRows([]);
  };

  const updateRow = (idx, field, value) => {
    setEditRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    setEditRows((prev) => [...prev, EMPTY_ROW(prev.length + 1)]);
  };

  const removeRow = (idx) => {
    setEditRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveEdits = async () => {
    setSaving(true);
    const finalCourseName = editCourseName.trim() || courseName;
    const finalRound = editRound.trim() || selectedRound || '1차';
    try {
      const batch = writeBatch(db);

      if (finalCourseName && date) {
        const q = query(
          collection(db, 'curriculum'),
          where('courseName', '==', finalCourseName),
          where('date', '==', date),
        );
        const snap = await getDocs(q);
        snap.docs
          .filter((d) => (d.data().round || '1차') === (selectedRound || finalRound))
          .forEach((d) => batch.delete(d.ref));
      }

      editRows.forEach((row) => {
        const ref = doc(collection(db, 'curriculum'));
        batch.set(ref, {
          courseName: finalCourseName,
          date,
          round: finalRound,
          period: Number(row.period),
          startTime: row.startTime || '',
          endTime: row.endTime || '',
          subject: row.subject || '',
          instructor: row.instructor || '',
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();
      setEditing(false);
      setSelectedRound(null);
      setEditRound('');
      setEditRows([]);
    } finally {
      setSaving(false);
    }
  };

  const displayName = editCourseName || courseName || '-';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          width: '90vw',
          maxWidth: 900,
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(ev) => ev.stopPropagation()}
        id="print-area"
      >
        {/* 헤더 */}
        <div
          className="modal-header"
          style={editing ? { background: '#fff9e6', flexShrink: 0 } : { flexShrink: 0 }}
        >
          <h3>
            교시별 커리큘럼
            {editing && (
              <span style={{ fontSize: 12, fontWeight: 400, color: '#b45309', marginLeft: 8 }}>
                [{editRound || selectedRound || '새 항목'} 편집 중]
              </span>
            )}
          </h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* 바디 */}
        <div className="modal-body" style={{ flex: 1, overflow: 'auto' }}>
          {/* 메타 정보 */}
          <div className="curriculum-meta" style={{ marginBottom: 12 }}>
            {!courseName ? (
              <span>
                <label style={{ fontSize: 12, color: '#6b7280', marginRight: 4 }}>과정명 *</label>
                <input
                  value={editCourseName}
                  onChange={(e) => setEditCourseName(e.target.value)}
                  placeholder="과정명 입력"
                  style={{
                    padding: '4px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 13,
                    width: 200,
                    outline: 'none',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#1e3a5f'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; }}
                />
              </span>
            ) : (
              <span><strong>과정명:</strong> {displayName}</span>
            )}
            <span><strong>날짜:</strong> {date || '-'}</span>
          </div>

          {loading ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>
              불러오는 중...
            </p>
          ) : editing ? (
            /* ── 편집 모드 ── */
            <div>
              {/* 차수 입력 */}
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>차수</label>
                <input
                  value={editRound}
                  onChange={(e) => setEditRound(e.target.value)}
                  placeholder="예: 26-1차"
                  style={{
                    padding: '4px 10px',
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    fontSize: 13,
                    width: 160,
                    outline: 'none',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#1e3a5f'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; }}
                />
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <colgroup>
                  <col style={{ width: 60 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 'auto' }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 40 }} />
                </colgroup>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>교시</th>
                    <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #e5e7eb' }}>시작시간</th>
                    <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #e5e7eb' }}>종료시간</th>
                    <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #e5e7eb' }}>과목명</th>
                    <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #e5e7eb' }}>강사</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {editRows.map((row, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={row.period}
                          onChange={(e) => updateRow(idx, 'period', e.target.value)}
                          style={{ ...inputStyle, width: 52, textAlign: 'center' }}
                          onFocus={(e) => { e.target.style.borderColor = '#1e3a5f'; }}
                          onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; }}
                        />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          type="time"
                          value={row.startTime}
                          onChange={(e) => updateRow(idx, 'startTime', e.target.value)}
                          style={inputStyle}
                          onFocus={(e) => { e.target.style.borderColor = '#1e3a5f'; }}
                          onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; }}
                        />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          type="time"
                          value={row.endTime}
                          onChange={(e) => updateRow(idx, 'endTime', e.target.value)}
                          style={inputStyle}
                          onFocus={(e) => { e.target.style.borderColor = '#1e3a5f'; }}
                          onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; }}
                        />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          type="text"
                          value={row.subject}
                          onChange={(e) => updateRow(idx, 'subject', e.target.value)}
                          style={inputStyle}
                          onFocus={(e) => { e.target.style.borderColor = '#1e3a5f'; }}
                          onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; }}
                        />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          type="text"
                          value={row.instructor}
                          onChange={(e) => updateRow(idx, 'instructor', e.target.value)}
                          style={inputStyle}
                          onFocus={(e) => { e.target.style.borderColor = '#1e3a5f'; }}
                          onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; }}
                        />
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                        <button
                          onClick={() => removeRow(idx)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#ef4444' }}
                          title="행 삭제"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button
                onClick={addRow}
                style={{
                  marginTop: 8,
                  padding: '6px 14px',
                  fontSize: 12,
                  border: '1.5px dashed #1e3a5f',
                  borderRadius: 6,
                  background: '#f0f4ff',
                  color: '#1e3a5f',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                + 교시 추가
              </button>
            </div>
          ) : roundCount === 0 ? (
            /* ── 데이터 없음 ── */
            <div style={{ textAlign: 'center', padding: '24px' }}>
              <p style={{ color: '#9ca3af', marginBottom: 16 }}>
                커리큘럼 데이터가 없습니다.
              </p>
              <button
                onClick={startNew}
                style={{
                  padding: '8px 20px',
                  background: '#1e3a5f',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                ✏️ 커리큘럼 새로 입력
              </button>
            </div>
          ) : (
            /* ── 읽기 모드 ── */
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', alignItems: 'flex-start' }}>
              {rounds.map((round) => (
                <div key={round} style={{ flex: 1, minWidth: 280 }}>
                  <div style={{
                    background: '#1e3a5f',
                    color: '#fff',
                    padding: '6px 12px',
                    borderRadius: '8px 8px 0 0',
                    fontSize: 13,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <span>{round}</span>
                    <button
                      onClick={() => startEditing(round)}
                      style={{
                        background: 'rgba(255,255,255,0.15)',
                        border: 'none',
                        borderRadius: 4,
                        color: '#fff',
                        fontSize: 11,
                        padding: '2px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      ✏️ 편집
                    </button>
                  </div>

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
                          style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}
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

              {/* 차수 추가 버튼 */}
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: 40 }}>
                <button
                  onClick={startNew}
                  style={{
                    padding: '8px 14px',
                    fontSize: 12,
                    border: '1.5px dashed #1e3a5f',
                    borderRadius: 8,
                    background: '#f0f4ff',
                    color: '#1e3a5f',
                    cursor: 'pointer',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  + 차수 추가
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="modal-footer" style={{ flexShrink: 0 }}>
          {editing ? (
            <>
              <button
                className="btn-primary"
                onClick={saveEdits}
                disabled={saving}
                style={{ opacity: saving ? 0.6 : 1 }}
              >
                {saving ? '저장 중...' : '💾 저장'}
              </button>
              <button className="btn-secondary" onClick={cancelEditing} disabled={saving}>
                취소
              </button>
            </>
          ) : (
            <>
              <button className="btn-print" onClick={() => window.print()}>🖨️ 인쇄</button>
              <button className="btn-secondary" onClick={onClose}>닫기</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
