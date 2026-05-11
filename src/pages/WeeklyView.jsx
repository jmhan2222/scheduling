import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, onSnapshot, query, where, collectionGroup,
} from 'firebase/firestore';
import { db } from '../firebase';
import CurriculumModal from '../components/CurriculumModal';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const REGULAR = ['한재민', '김연희', '오아현', '현윤선', '박민지A', '이은비'];
const TEMPORARY = ['김현정', '김광민'];
const NO_CURRICULUM = [
  'VAC', 'SKD', '근로자의 날', '어린이날',
  '대체 휴일', '항지센/본부 회의', 'AI DX 회의', 'J-LOG 교육',
];

function padDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getStar(name) {
  if (REGULAR.includes(name)) return '⭐ ';
  if (TEMPORARY.includes(name)) return '🔸 ';
  return '';
}

function getMonthWeeks(year, month) {
  const weeks = [];
  const firstOfMonth = new Date(year, month, 1);
  const dow = firstOfMonth.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  let curr = new Date(year, month, 1 - offset);
  const lastOfMonth = new Date(year, month + 1, 0);

  while (curr <= lastOfMonth) {
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(curr);
      d.setDate(curr.getDate() + i);
      return d;
    });
    if (week.some((d) => d.getMonth() === month)) weeks.push(week);
    curr.setDate(curr.getDate() + 7);
  }
  return weeks;
}

export default function WeeklyView({ user }) {
  const now = new Date();
  const todayStr = padDate(now);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [schedules, setSchedules] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);
  const [curriculumModal, setCurriculumModal] = useState(null);

  const weeks = useMemo(() => getMonthWeeks(year, month), [year, month]);

  const defaultWeekIdx = useMemo(() => {
    const idx = weeks.findIndex((week) =>
      week.some((d) => padDate(d) === todayStr && d.getMonth() === month),
    );
    return idx >= 0 ? idx : 0;
  }, [weeks, todayStr, month]);

  const [selectedWeekIdx, setSelectedWeekIdx] = useState(defaultWeekIdx);
  useEffect(() => { setSelectedWeekIdx(0); }, [year, month]);

  useEffect(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const start = `${year}-${pad(month + 1)}-01`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;
    const q = query(
      collection(db, 'schedules'),
      where('date', '>=', start),
      where('date', '<=', end),
    );
    return onSnapshot(q, (snap) => {
      setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [year, month]);

  useEffect(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const monthSuffix = `${year}-${pad(month + 1)}`;
    return onSnapshot(collectionGroup(db, 'items'), (snap) => {
      setChecklistItems(
        snap.docs
          .filter((d) => d.ref.path.startsWith('checklists/'))
          .filter((d) => d.ref.parent.parent.id.endsWith(`_${monthSuffix}`))
          .map((d) => ({
            id: d.id,
            courseName: d.ref.parent.parent.id.replace(`_${monthSuffix}`, ''),
            ...d.data(),
          })),
      );
    });
  }, [year, month]);

  const selectedWeek = useMemo(() => weeks[selectedWeekIdx] || [], [weeks, selectedWeekIdx]);
  const weekDateStrs = useMemo(() => selectedWeek.map((d) => padDate(d)), [selectedWeek]);

  const weekSchedules = useMemo(
    () => schedules.filter((s) => weekDateStrs.includes(s.date)),
    [schedules, weekDateStrs],
  );

  const weekCourseNames = useMemo(
    () => [...new Set(weekSchedules.map((s) => s.courseName).filter(Boolean))],
    [weekSchedules],
  );

  const incompleteIds = useMemo(() => {
    const ids = new Set();
    checklistItems.forEach((item) => {
      if (!weekCourseNames.includes(item.courseName)) return;
      const done = item.done || {};
      if (!Object.values(done).some((v) => v.checked)) ids.add(item.courseName);
    });
    return ids;
  }, [checklistItems, weekCourseNames]);

  // 날짜별 과정 중심 행 데이터 구성
  const weekRows = useMemo(() => {
    return selectedWeek
      .filter((d) => d.getMonth() === month)
      .map((d) => {
        const date = padDate(d);
        const isToday = date === todayStr;
        const isWknd = d.getDay() === 0 || d.getDay() === 6;
        const dateLabel = `${d.getDate()} ${WEEKDAYS[d.getDay()]}`;
        const dayScheds = weekSchedules.filter((s) => s.date === date);

        // 개인 VAC 인원 (courseName==='VAC', memberName!=='전체', 당일 다른 교육 없는 인원만)
        const vacMembers = dayScheds
          .filter((s) => s.courseName === 'VAC' && s.memberName !== '전체')
          .map((s) => s.memberName)
          .filter((name) => !dayScheds.some(
            (s) => s.memberName === name && s.courseName !== 'VAC',
          ));

        // 과정 그룹핑 대상: 전체 행 제외, VAC 제외
        const courseScheds = dayScheds.filter(
          (s) => s.memberName !== '전체' && s.courseName !== 'VAC',
        );

        if (courseScheds.length === 0 && vacMembers.length === 0 && dayScheds.length === 0) {
          return { date, dateLabel, isToday, isWknd, type: 'empty', vacMembers: [] };
        }

        if (courseScheds.length === 0 && dayScheds.length > 0) {
          // VAC만 있는 날
          return { date, dateLabel, isToday, isWknd, type: 'empty', vacMembers };
        }

        // 과정명 기준으로 그룹핑
        const courseMap = new Map();
        courseScheds.forEach((s) => {
          const key = s.courseName || '(과정명 없음)';
          if (!courseMap.has(key)) {
            courseMap.set(key, {
              courseName: key,
              category: s.category,
              hours: s.hours || 0,
              members: [],
            });
          }
          const entry = courseMap.get(key);
          if (s.memberName && !entry.members.includes(s.memberName)) {
            entry.members.push(s.memberName);
          }
          if (!entry.hours && s.hours) entry.hours = s.hours;
        });

        return {
          date,
          dateLabel,
          isToday,
          isWknd,
          type: 'courses',
          courses: [...courseMap.values()],
          vacMembers,
        };
      });
  }, [selectedWeek, weekSchedules, month, todayStr]);

  const goPrev = () => {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  };
  const goNext = () => {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  };

  const formatWeekRange = (week) => {
    const inMonth = week.filter((d) => d.getMonth() === month);
    if (!inMonth.length) return '';
    const first = inMonth[0];
    const last = inMonth[inMonth.length - 1];
    return `${first.getMonth() + 1}/${first.getDate()}(${WEEKDAYS[first.getDay()]})~${last.getMonth() + 1}/${last.getDate()}(${WEEKDAYS[last.getDay()]})`;
  };

  return (
    <div className="weekly-view">
      <div className="overview-toolbar">
        <div className="month-nav">
          <button className="btn-nav" onClick={goPrev}>◀</button>
          <h2>{year}년 {month + 1}월</h2>
          <button className="btn-nav" onClick={goNext}>▶</button>
        </div>
      </div>

      <div className="week-selector">
        {weeks.map((week, idx) => (
          <button
            key={idx}
            className={`week-btn${selectedWeekIdx === idx ? ' active' : ''}`}
            onClick={() => setSelectedWeekIdx(idx)}
          >
            {idx + 1}주차
            <span className="week-btn-range">{formatWeekRange(week)}</span>
          </button>
        ))}
      </div>

      <div className="wc-card">
        <table className="wc-table">
          <thead>
            <tr>
              <th className="wc-th-date">날짜</th>
              <th className="wc-th-course">과정명</th>
              <th className="wc-th-hours">시간</th>
              <th className="wc-th-members">투입교관</th>
            </tr>
          </thead>
          <tbody>
            {weekRows.map((row) => {
              const trClass = [
                row.isWknd ? 'wc-weekend' : '',
                row.isToday ? 'wc-today' : '',
              ].filter(Boolean).join(' ') || undefined;
              const dateTdStyle = row.isToday ? { background: '#FEF9C3' } : undefined;

              const vacLine = row.vacMembers?.length > 0 ? (
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                  ✈ VAC: {row.vacMembers.join(', ')}
                </div>
              ) : null;

              if (row.type === 'empty') {
                return (
                  <tr key={row.date} className={trClass}>
                    <td
                      className="wc-td-date"
                      style={{ ...dateTdStyle, cursor: 'pointer' }}
                      onClick={() => setCurriculumModal({ courseName: '', date: row.date })}
                      title="클릭하여 커리큘럼 추가"
                    >
                      {row.dateLabel}
                      <div style={{ fontSize: 10, color: '#d1d5db', marginTop: 2 }}>+ 추가</div>
                      {vacLine}
                    </td>
                    <td colSpan={3} className="wc-empty">일정 없음</td>
                  </tr>
                );
              }

              return row.courses.map((course, cIdx) => (
                <tr key={`${row.date}-${cIdx}`} className={trClass}>
                  {cIdx === 0 && (
                    <td
                      className="wc-td-date"
                      rowSpan={row.courses.length}
                      style={dateTdStyle}
                    >
                      {row.dateLabel}
                      {vacLine}
                    </td>
                  )}
                  <td
                    className={`wc-td-course badge-${course.category}`}
                    onClick={() => {
                      if (!course.courseName) return;
                      if (NO_CURRICULUM.some((n) => course.courseName.includes(n))) return;
                      setCurriculumModal({ courseName: course.courseName, date: row.date });
                    }}
                  >
                    {course.courseName}
                    {incompleteIds.has(course.courseName) && (
                      <span className="red-dot" title="미완료 체크리스트 있음" />
                    )}
                  </td>
                  <td className="wc-td-hours">
                    {course.hours > 0 ? `${course.hours}h` : '—'}
                  </td>
                  <td className="wc-td-members">
                    {course.members.map((n) => getStar(n) + n).join(' · ')}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {curriculumModal && (
        <CurriculumModal
          courseName={curriculumModal.courseName}
          date={curriculumModal.date}
          onClose={() => setCurriculumModal(null)}
        />
      )}
    </div>
  );
}
