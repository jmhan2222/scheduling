import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot,
  getDocs, doc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const INPUT_STYLE = {
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 12,
  width: '100%',
  background: '#f8fafc',
  boxSizing: 'border-box',
};

export default function CurriculumModal({ courseName, date, onClose }) {
  const [byRound, setByRound] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [selectedRound, setSelectedRound] = useState(null);
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
  const modalWidth = roundCount >= 3 ? '90vw' : roundCount === 2 ? '860px' : '480px';

  const startEditing = (round) => {
    setSelectedRound(round);
    setEditRows((byRound[round] || []).map((item) => ({ ...item })));
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setSelectedRound(null);
    setEditRows([]);
  };

  const updateRow = (idx, field, value) => {
    setEditRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    setEditRows((prev) => [
      ...prev,
      {
        period: prev.length + 1,
        startTime: '',
        endTime: '',
        subject: '',
        instructor: '',
      },
    ]);
  };

  const removeRow = (idx) => {
    setEditRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      const q = query(
        collection(db, 'curriculum'),
        where('courseName', '==', courseName),
        where('date', '==', date),
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs
        .filter((d) => (d.data().round || '1차') === selectedRound)
        .forEach((d) => batch.delete(d.ref));

      editRows.forEach((row) => {
        const ref = doc(collection(db, 'curriculum'));
        batch.set(ref, {
          courseName,
          date,
          round: selectedRound,
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
      setEditRows([]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ width: modalWidth, maxWidth: '96vw' }}
        onClick={(ev) => ev.stopPropagation()}
        id="print-area"
      >
        <div
          className="modal-header"
          style={editing ? { background: '#fff9e6' } : undefined}
        >
          <h3>
            교시별 커리큘럼
            {editing && (
              <span style={{ fontSize: 12, fontWeight: 400, color: '#b45309', marginLeft: 8 }}>
                [{selectedRound} 편집 중]
              </span>
            )}
          </h3>
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
          ) : editing ? (
            /* ── 편집 모드 ── */
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #e5e7eb', width: 60 }}>교시</th>
                    <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #e5e7eb', width: 90 }}>시작</th>
                    <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #e5e7eb', width: 90 }}>종료</th>
                    <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #e5e7eb' }}>과목명</th>
                    <th style={{ padding: '6px 8px', fontSize: 11, fontWeight: 700, borderBottom: '1px solid #e5e7eb', width: 90 }}>강사</th>
                    <th style={{ width: 32 }} />
                  </tr>
                </thead>
                <tbody>
                  {editRows.map((row, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#f9fafb' }}>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          max="12"
                          value={row.period}
                          onChange={(e) => updateRow(idx, 'period', e.target.value)}
                          style={{ ...INPUT_STYLE, width: 48, textAlign: 'center' }}
                        />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          type="time"
                          value={row.startTime}
                          onChange={(e) => updateRow(idx, 'startTime', e.target.value)}
                          style={INPUT_STYLE}
                        />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          type="time"
                          value={row.endTime}
                          onChange={(e) => updateRow(idx, 'endTime', e.target.value)}
                          style={INPUT_STYLE}
                        />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          type="text"
                          value={row.subject}
                          onChange={(e) => updateRow(idx, 'subject', e.target.value)}
                          style={INPUT_STYLE}
                        />
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <input
                          type="text"
                          value={row.instructor}
                          onChange={(e) => updateRow(idx, 'instructor', e.target.value)}
                          style={INPUT_STYLE}
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
          ) : (
            /* ── 읽기 모드 ── */
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', alignItems: 'flex-start' }}>
              {rounds.map((round) => (
                <div key={round} style={{ flex: 1, minWidth: 260 }}>
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
