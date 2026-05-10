import { useState, useEffect, useMemo } from 'react';
import {
  collection, onSnapshot, query, where, collectionGroup,
} from 'firebase/firestore';
import { db } from '../firebase';
import CurriculumModal from '../components/CurriculumModal';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function padDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const [members, setMembers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);
  const [curriculumModal, setCurriculumModal] = useState(null);

  const weeks = useMemo(() => getMonthWeeks(year, month), [year, month]);

  const defaultWeekIdx = useMemo(() => {
    const idx = weeks.findIndex((week) =>
      week.some((d) => padDate(d) === todayStr && d.getMonth() === month)
    );
    return idx >= 0 ? idx : 0;
  }, [weeks, todayStr, month]);

  const [selectedWeekIdx, setSelectedWeekIdx] = useState(defaultWeekIdx);

  useEffect(() => { setSelectedWeekIdx(0); }, [year, month]);

  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setMembers(snap.docs.map((d) => ({
        id: d.id, ...d.data(),
        name: d.data().name || d.data().displayName || '',
      })));
    });
  }, []);

  useEffect(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const start = `${year}-${pad(month + 1)}-01`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const end = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;
    const q = query(collection(db, 'schedules'), where('date', '>=', start), where('date', '<=', end));
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
          }))
      );
    });
  }, [year, month]);

  const selectedWeek = weeks[selectedWeekIdx] || [];
  const weekDateStrs = selectedWeek.map((d) => padDate(d));

  const weekSchedules = useMemo(() =>
    schedules.filter((s) => weekDateStrs.includes(s.date)),
    [schedules, weekDateStrs]
  );

  const scheduleMap = useMemo(() => {
    const map = {};
    weekSchedules.forEach((s) => {
      const key = `${s.memberName}|${s.date}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [weekSchedules]);

  const validMembers = useMemo(() =>
    members.filter((m) => m.name && m.name.trim())
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [members]
  );

  const weekCourseNames = useMemo(() =>
    [...new Set(weekSchedules.map((s) => s.courseName).filter(Boolean))],
    [weekSchedules]
  );

  const incompleteByExec = useMemo(() => {
    const result = {};
    checklistItems.forEach((item) => {
      if (!weekCourseNames.includes(item.courseName)) return;
      const done = item.done || {};
      const anyChecked = Object.values(done).some((v) => v.checked);
      if (!anyChecked) {
        if (!result[item.courseName]) result[item.courseName] = [];
        result[item.courseName].push(item);
      }
    });
    return result;
  }, [checklistItems, weekCourseNames]);

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

      <div className="calendar-wrapper">
        <table className="calendar-table">
          <thead>
            <tr>
              <th className="col-name">파트원</th>
              {selectedWeek.map((d, i) => {
                const isInMonth = d.getMonth() === month;
                const isToday = padDate(d) === todayStr;
                const isWknd = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <th
                    key={i}
                    className={[
                      isWknd ? 'weekend' : '',
                      isToday ? 'today-th' : '',
                    ].filter(Boolean).join(' ') || undefined}
                    style={!isInMonth ? { opacity: 0.3 } : undefined}
                  >
                    {isInMonth ? `${d.getDate()} ${WEEKDAYS[d.getDay()]}` : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {validMembers.map((member) => (
              <tr key={member.id}>
                <td className="col-name">{member.name}</td>
                {selectedWeek.map((d, i) => {
                  const isInMonth = d.getMonth() === month;
                  const dateStr = padDate(d);
                  const cellSchedules = scheduleMap[`${member.name}|${dateStr}`] || [];
                  const isWknd = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = dateStr === todayStr;

                  return (
                    <td
                      key={i}
                      className={[
                        'calendar-cell',
                        isWknd ? 'weekend-col' : '',
                        !isInMonth ? 'inactive' : '',
                      ].filter(Boolean).join(' ')}
                      style={isToday ? { background: '#FEFCE8' } : undefined}
                    >
                      {isInMonth && cellSchedules.map((s) => (
                        <div
                          key={s.id}
                          className={`schedule-badge badge-${s.category}`}
                          title={s.courseName}
                          onClick={() => s.courseName && setCurriculumModal({ courseName: s.courseName, date: s.date })}
                        >
                          <span>{s.courseName}</span>
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

      {Object.keys(incompleteByExec).length > 0 && (
        <div className="weekly-checklist-summary">
          <h3>이번 주 미완료 체크리스트</h3>
          {Object.entries(incompleteByExec).map(([cn, items]) => (
            <div key={cn} className="weekly-checklist-course">
              <div className="weekly-checklist-header">
                <strong>{cn}</strong>
                <span className="weekly-checklist-count">{items.length}건 미완료</span>
              </div>
              <div className="weekly-checklist-items">
                {items.slice(0, 5).map((item) => (
                  <span key={item.id} className="weekly-checklist-item">
                    [{item.timing}] {item.text}
                  </span>
                ))}
                {items.length > 5 && (
                  <span className="weekly-checklist-more">... 외 {items.length - 5}건</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
