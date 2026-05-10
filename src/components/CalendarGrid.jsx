import React, { useState } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

const CATEGORIES = ['교육', '평가', '행정', '휴무'];
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

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

  // 충돌 감지: 같은 멤버·날짜에 서로 다른 과정명이 2개 이상일 때만 true
  const hasConflict = (memberName, date) => {
    const daySchedules = schedules.filter(
      (s) => s.memberName === memberName && s.date === date,
    );
    const uniqueCourses = new Set(daySchedules.map((s) => s.courseName));
    return uniqueCourses.size >= 2;
  };

  const scheduleMap = {};
  schedules.forEach((s) => {
    const key = `${s.memberName}|${s.date}`;
    if (!scheduleMap[key]) scheduleMap[key] = [];
    scheduleMap[key].push(s);
  });

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

  const handleBadgeClick = (s, e) => {
    e.stopPropagation();
    if (s.courseName) {
      onBadgeClick({ courseName: s.courseName, date: s.date });
    }
  };

  // name이 없거나 공백뿐인 멤버 제외, '전체' 행 제외
  const validMembers = members.filter((m) => m.name && m.name.trim());
  const renderMembers = validMembers.filter((m) => m.name !== '전체');

  // 날짜별 전체 일정(공휴일/전사VAC) 맵 — memberName==='전체'인 행
  const wholeDayMap = {};
  schedules
    .filter((s) => s.memberName === '전체')
    .forEach((s) => { wholeDayMap[s.date] = s.courseName || ''; });

  const totals = renderMembers.map((m) => {
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

  const REGULAR = ['한재민', '김연희', '오아현', '현윤선', '박민지A', '이은비'];
  const TEMP = ['김현정', '김광민'];
  const getStar = (name) => {
    if (REGULAR.includes(name)) return '⭐ ';
    if (TEMP.includes(name)) return '🔸 ';
    return '';
  };

  const MEMBER_ORDER = (m) => {
    if (m.type === 'regular') return 0;
    if (m.type === 'temporary') return 1;
    return 2; // adjunct
  };

  const getLabelInfo = (order) => {
    if (order === 0) return { text: '전임교관', bg: '#1e3a5f' };
    if (order === 1) return { text: '단기 전임교관', bg: '#2d5288' };
    return { text: '겸임교관', bg: '#6b7280' };
  };

  return (
    <>
      <div className="calendar-wrapper">
        <table className="calendar-table">
          {/* thead: tr 하나만 — 날짜·요일 헤더 */}
          <thead>
            <tr>
              <th className="col-name">파트원</th>
              {dayArr.map((d) => (
                <th
                  key={d}
                  className={[
                    isWeekend(year, month, d) ? 'weekend' : '',
                    isCurrentDay(d) ? 'today-th' : '',
                  ].filter(Boolean).join(' ') || undefined}
                >
                  {d} {WEEKDAYS[new Date(year, month, d).getDay()]}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {renderMembers.map((member, idx) => {
              const order = MEMBER_ORDER(member);
              const prevOrder = idx > 0 ? MEMBER_ORDER(renderMembers[idx - 1]) : -1;
              const showLabel = order !== prevOrder;
              const isNewSection = showLabel && idx > 0;
              const { text: labelText, bg: labelBg } = getLabelInfo(order);
              return (
                <React.Fragment key={member.id}>
                  {showLabel && (
                    <tr style={{ background: labelBg }}>
                      <td
                        colSpan={999}
                        style={{
                          padding: '4px 12px',
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.5px',
                          color: '#fff',
                        }}
                      >
                        {labelText}
                      </td>
                    </tr>
                  )}
                  <tr>
                    {/* 파트원 이름 셀 */}
                    <td
                      className="col-name"
                      onClick={() => onMemberClick(member)}
                    >
                      {getStar(member.name)}
                      {member.name}
                    </td>

                    {(() => {
                      const memberActive = isActiveInMonth(member, year, month);
                      return dayArr.map((d) => {
                        const dateStr = padDate(year, month, d);
                        const cellSchedules = scheduleMap[`${member.name}|${dateStr}`] || [];
                        const conflict = hasConflict(member.name, dateStr);

                        const holidayName = wholeDayMap[dateStr] || '';
                        const isHoliday = !!holidayName;
                        const isVac = holidayName === 'VAC';

                        const cellBg = isCurrentDay(d)
                          ? '#FEFCE8'
                          : isHoliday
                            ? (isVac ? '#f3f4f6' : '#fce7f3')
                            : undefined;
                        const cellStyle = cellBg ? { background: cellBg } : undefined;

                        return (
                          <td
                            key={d}
                            className={[
                              'calendar-cell',
                              !memberActive ? 'inactive' : '',
                              conflict ? 'conflict' : '',
                              isWeekend(year, month, d) ? 'weekend-col' : '',
                            ].filter(Boolean).join(' ')}
                            style={cellStyle}
                            title={isHoliday ? holidayName : undefined}
                            onClick={() => memberActive && openCell(member.name, dateStr)}
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
                      });
                    })()}
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Monthly totals */}
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

      {/* Schedule Add/Edit Modal */}
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
<div className="modal-footer" style={{ padding: '0', borderTop: 'none', marginTop: 8 }}>
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
