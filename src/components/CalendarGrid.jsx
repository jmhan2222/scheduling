import { useState } from 'react';
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

function isTempActive(member, dateStr) {
  if (member.type !== 'temporary') return true;
  const start = member.startDate || '';
  const end = member.endDate || '';
  return dateStr >= start && dateStr <= end;
}

const EMPTY_FORM = { courseName: '', category: '교육', hours: 0, courseId: '' };

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
      courseId: s.courseId || '',
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
        courseId: form.courseId.trim(),
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
    if (s.courseId) {
      onBadgeClick({ courseId: s.courseId, courseName: s.courseName });
    }
  };

  // name이 없거나 공백뿐인 멤버는 렌더에서 제외 (빈 행 방지)
  const validMembers = members.filter((m) => m.name && m.name.trim());

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

  const REGULAR = ['한재민', '현윤선', '박민지A', '이은비', '오아현', '김연희'];
  const TEMP = ['김현정', '김광민'];
  const getStar = (name) => {
    if (REGULAR.includes(name)) return '⭐ ';
    if (TEMP.includes(name)) return '🔸 ';
    return '';
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
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{d}</div>
                  <div style={{ fontSize: 10, opacity: 0.75, marginTop: 1 }}>
                    {WEEKDAYS[new Date(year, month, d).getDay()]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {validMembers.map((member) => (
              <tr key={member.id}>
                {/* 파트원 이름 셀 — 타입별 별 이모지 표시 */}
                <td
                  className="col-name"
                  onClick={() => onMemberClick(member)}
                >
                  {getStar(member.name)}
                  {member.name}
                </td>

                {dayArr.map((d) => {
                  const dateStr = padDate(year, month, d);
                  const active = isTempActive(member, dateStr);
                  const cellSchedules = scheduleMap[`${member.name}|${dateStr}`] || [];
                  const conflict = hasConflict(member.name, dateStr);

                  // 오늘: background만, border 없음 / 충돌: 빨간 좌측 테두리
                  const cellStyle = isCurrentDay(d)
                    ? { background: '#FEFCE8' }
                    : undefined;

                  return (
                    <td
                      key={d}
                      className={[
                        'calendar-cell',
                        !active ? 'inactive' : '',
                        conflict ? 'conflict' : '',
                        isWeekend(year, month, d) ? 'weekend-col' : '',
                      ].filter(Boolean).join(' ')}
                      style={cellStyle}
                      onClick={() => active && openCell(member.name, dateStr)}
                    >
                      {active && cellSchedules.map((s) => (
                        <div
                          key={s.id}
                          className={`schedule-badge badge-${s.category}`}
                          onClick={(e) => handleBadgeClick(s, e)}
                          title={s.courseName}
                        >
                          <span>{s.courseName}</span>
                          {incompleteIds?.has(s.courseId) && (
                            <span className="red-dot" title="미완료 체크리스트 있음" />
                          )}
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
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
                <div className="form-group">
                  <label>과정 ID (커리큘럼 연결)</label>
                  <input
                    value={form.courseId}
                    onChange={(e) => setForm({ ...form, courseId: e.target.value })}
                    placeholder="예: COURSE-001 (선택사항)"
                  />
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
