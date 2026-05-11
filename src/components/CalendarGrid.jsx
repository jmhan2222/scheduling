import React, { useState } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const CATEGORIES = ['교육', '평가', '행정', '휴무'];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const GROUPS = [
  { label: '전임교관', type: 'regular', bg: '#1e3a5f' },
  { label: '단기 전임교관', type: 'temporary', bg: '#2d5288' },
  { label: '겸임교관', type: 'adjunct', bg: '#6b7280' },
];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function padDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isWeekend(year, month, day) {
  const d = new Date(year, month, day).getDay();
  return d === 0 || d === 6;
}

function isActiveInMonth(member, year, month) {
  if (member.type !== 'temporary') return true;
  if (!member.startDate || !member.endDate) return true;
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const mStart = new Date(member.startDate);
  const mEnd = new Date(member.endDate);
  return mStart <= monthEnd && mEnd >= monthStart;
}

const EMPTY_FORM = { courseName: '', category: '교육', hours: 0 };

const REGULAR = ['한재민', '김연희', '오아현', '현윤선', '박민지A', '이은비'];
const TEMP = ['김현정', '김광민'];
function getStar(name) {
  if (REGULAR.includes(name)) return '⭐ ';
  if (TEMP.includes(name)) return '🔸 ';
  return '';
}

export default function CalendarGrid({
  year, month, members, schedules, incompleteIds,
  onBadgeClick, onMemberClick,
}) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const days = getDaysInMonth(year, month);
  const dayArr = Array.from({ length: days }, (_, i) => i + 1);

  const _now = new Date();
  const isCurrentDay = (d) =>
    year === _now.getFullYear() && month === _now.getMonth() && d === _now.getDate();

const scheduleMap = {};
  schedules.forEach((s) => {
    const key = `${s.memberName}|${s.date}`;
    if (!scheduleMap[key]) scheduleMap[key] = [];
    scheduleMap[key].push(s);
  });

  const wholeDayMap = {};
  schedules
    .filter((s) => s.memberName === '전체')
    .forEach((s) => { wholeDayMap[padDate(year, month, parseInt(s.date.slice(-2)))] = s.courseName || ''; });

  // rebuild wholeDayMap by date string directly
  const wholeDayMapByDate = {};
  schedules
    .filter((s) => s.memberName === '전체')
    .forEach((s) => { wholeDayMapByDate[s.date] = s.courseName || ''; });

  const openCell = (memberName, date) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date, memberName });
    setModal({ type: 'cell', date, memberName });
  };

  const startEdit = (s, e) => {
    e.stopPropagation();
    setEditingId(s.id);
    setForm({
      courseName: s.courseName || '',
      category: s.category || '교육',
      hours: s.hours || 0,
    });
    setModal({ type: 'cell', date: s.date, memberName: s.memberName });
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('일정을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'schedules', id));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.courseName.trim()) return;
    setSaving(true);
    try {
      const data = {
        date: modal.date,
        memberName: modal.memberName,
        courseName: form.courseName.trim(),
        category: form.category,
        hours: Number(form.hours) || 0,
        updatedAt: serverTimestamp(),
      };
      if (editingId) {
        await updateDoc(doc(db, 'schedules', editingId), data);
      } else {
        await addDoc(collection(db, 'schedules'), { ...data, createdAt: serverTimestamp() });
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setModal(null);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const NO_CURRICULUM = [
    'VAC', 'SKD', '근로자의 날', '어린이날',
    '대체 휴일', '항지센/본부 회의', 'AI DX 회의', 'J-LOG 교육',
  ];

  const handleBadgeClick = (s, e) => {
    e.stopPropagation();
    if (!s.courseName) return;
    if (NO_CURRICULUM.some((n) => s.courseName.includes(n))) return;
    onBadgeClick({ courseName: s.courseName, date: s.date });
  };

  const validMembers = members.filter((m) => m.name && m.name.trim() && m.name !== '전체');

  const totals = validMembers.map((m) => {
    const ms = schedules.filter((s) => s.memberName === m.name);
    const eduHours = ms.filter((s) => ['교육', '평가'].includes(s.category))
      .reduce((sum, s) => sum + (Number(s.hours) || 0), 0);
    const adminHours = ms.filter((s) => s.category === '행정')
      .reduce((sum, s) => sum + (Number(s.hours) || 0), 0);
    const restDays = new Set(ms.filter((s) => s.category === '휴무').map((s) => s.date)).size;
    return { name: m.name, eduHours, adminHours, restDays };
  });

  const existingForCell = modal
    ? (scheduleMap[`${modal.memberName}|${modal.date}`] || [])
    : [];

  const thBase = {
    padding: '7px 2px',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 500,
    borderBottom: '1px solid #e5e7eb',
    borderLeft: '1px solid #e5e7eb',
    minWidth: 52,
    whiteSpace: 'nowrap',
  };

  return (
    <>
      {/* 그룹별 테이블 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {GROUPS.map((group) => {
          const groupMembers = validMembers.filter((m) => m.type === group.type);
          if (groupMembers.length === 0) return null;

          return (
            <div key={group.type}>
              {/* 섹션 라벨 — 테이블 완전 밖 */}
              <div style={{
                background: group.bg,
                color: '#fff',
                padding: '6px 16px',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.5px',
                borderRadius: '8px 8px 0 0',
              }}>
                {group.label} ({groupMembers.length}명)
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  background: '#fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  borderRadius: '0 0 8px 8px',
                  overflow: 'hidden',
                }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{
                        width: 88,
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#374151',
                        borderBottom: '1px solid #e5e7eb',
                        position: 'sticky',
                        left: 0,
                        background: '#f1f5f9',
                        zIndex: 2,
                        whiteSpace: 'nowrap',
                      }}>
                        파트원
                      </th>
                      {dayArr.map((d) => {
                        const dateStr = padDate(year, month, d);
                        const isHoliday = !!wholeDayMapByDate[dateStr];
                        const isVac = wholeDayMapByDate[dateStr] === 'VAC';
                        const wknd = isWeekend(year, month, d);
                        const today = isCurrentDay(d);
                        return (
                          <th key={d} style={{
                            ...thBase,
                            color: wknd ? '#9ca3af' : today ? '#e07a5f' : '#374151',
                            background: isHoliday
                              ? (isVac ? '#f3f4f6' : '#fce7f3')
                              : '#f1f5f9',
                            fontWeight: today ? 800 : 500,
                          }}>
                            <div style={{ color: today ? '#e07a5f' : 'inherit' }}>{d}</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>
                              {WEEKDAYS[new Date(year, month, d).getDay()]}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {groupMembers.map((member, idx) => {
                      const memberActive = isActiveInMonth(member, year, month);
                      const rowBg = idx % 2 === 0 ? '#fff' : '#fafafa';
                      return (
                        <tr key={member.id} style={{ background: rowBg }}>
                          <td
                            style={{
                              padding: '6px 12px',
                              fontSize: 13,
                              fontWeight: 500,
                              color: '#1f2937',
                              borderBottom: '1px solid #f0f0f0',
                              position: 'sticky',
                              left: 0,
                              background: rowBg,
                              zIndex: 1,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                            onClick={() => onMemberClick(member)}
                          >
                            {getStar(member.name)}{member.name}
                          </td>
                          {dayArr.map((d) => {
                            const dateStr = padDate(year, month, d);
                            const cellSchedules = scheduleMap[`${member.name}|${dateStr}`] || [];
                            const holidayName = wholeDayMapByDate[dateStr] || '';
                            const isHoliday = !!holidayName;
                            const isVac = holidayName === 'VAC';
                            const today = isCurrentDay(d);
                            const wknd = isWeekend(year, month, d);

                            return (
                              <td
                                key={d}
                                onClick={() => memberActive && openCell(member.name, dateStr)}
                                style={{
                                  padding: '4px 3px',
                                  verticalAlign: 'top',
                                  borderBottom: '1px solid #f0f0f0',
                                  borderLeft: '1px solid #f0f0f0',
                                  background: today
                                    ? 'rgba(224,122,95,0.08)'
                                    : isHoliday
                                      ? (isVac ? 'rgba(243,244,246,0.6)' : 'rgba(252,231,243,0.5)')
                                      : wknd ? 'rgba(0,0,0,0.02)' : 'transparent',
                                  cursor: memberActive ? 'pointer' : 'default',
                                  minWidth: 52,
                                  opacity: !memberActive ? 0.35 : 1,
                                }}
                                title={isHoliday ? holidayName : undefined}
                              >
                                {cellSchedules.map((s) => (
                                  <div
                                    key={s.id}
                                    className={`schedule-badge badge-${s.category}`}
                                    onClick={(e) => handleBadgeClick(s, e)}
                                    title={s.courseName}
                                  >
                                    <span>{s.courseName}</span>
                                    {incompleteIds?.has(s.courseName) && (
                                      <span className="red-dot" title="미완료 체크리스트 있음" />
                                    )}
                                  </div>
                                ))}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* 월간 집계 */}
      <div className="monthly-totals">
        <h3>파트원별 월간 집계</h3>
        <table className="totals-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>교육·평가 시간</th>
              <th>행정 시간</th>
              <th>휴무 일수</th>
            </tr>
          </thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td>
                <td>{t.eduHours}시간</td>
                <td>{t.adminHours}시간</td>
                <td>{t.restDays}일</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 일정 추가/수정 모달 */}
      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal.date} · {modal.memberName}</h3>
              <button className="modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              {existingForCell.length > 0 && !editingId && (
                <div className="existing-schedules">
                  <h4>등록된 일정</h4>
                  {existingForCell.map((s) => (
                    <div key={s.id} className="existing-item">
                      <div className="existing-item-info">
                        <span className={`schedule-badge badge-${s.category}`}>
                          {s.category}
                        </span>{' '}
                        <strong>{s.courseName}</strong>
                        {s.hours > 0 && ` · ${s.hours}시간`}
                      </div>
                      <div className="existing-item-actions">
                        <button className="btn-edit" onClick={(e) => startEdit(s, e)}>수정</button>
                        <button className="btn-delete" onClick={(e) => handleDelete(s.id, e)}>삭제</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0 0', paddingTop: 16 }}>
                    <strong style={{ fontSize: 13, color: 'var(--navy)' }}>새 일정 추가</strong>
                  </div>
                </div>
              )}
              <form onSubmit={handleSave}>
                <div className="form-group">
                  <label>과정명 *</label>
                  <input
                    value={form.courseName}
                    onChange={(e) => setForm({ ...form, courseName: e.target.value })}
                    placeholder="과정명을 입력하세요"
                    required
                    autoFocus
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>구분</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>시간수</label>
                    <input
                      type="number" min="0" step="0.5"
                      value={form.hours}
                      onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-footer" style={{ padding: 0, borderTop: 'none', marginTop: 8 }}>
                  {editingId && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}
                    >
                      취소
                    </button>
                  )}
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? '저장 중...' : editingId ? '수정 완료' : '일정 추가'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
