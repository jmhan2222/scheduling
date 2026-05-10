import { useState, useEffect, useRef, useMemo } from 'react';
import {
  collection, onSnapshot, query, where, collectionGroup,
} from 'firebase/firestore';
import { db } from '../firebase';
import CalendarGrid from '../components/CalendarGrid';
import MobileDayView from '../components/MobileDayView';
import CurriculumModal from '../components/CurriculumModal';
import MemberPanel from '../components/MemberPanel';

/* ── 교관 구분 상수 ── */
export const REGULAR_NAMES = ['한재민', '김연희', '오아현', '현윤선', '박민지A', '이은비'];
export const TEMPORARY_NAMES = ['김현정', '김광민'];
export const getMemberType = (name) => {
  if (REGULAR_NAMES.includes(name)) return 'regular';
  if (TEMPORARY_NAMES.includes(name)) return 'temporary';
  return 'adjunct';
};
const TYPE_ORDER = { regular: 0, temporary: 1, adjunct: 2 };

/* ── 다중 선택 체크박스 필터 컴포넌트 ── */
function MultiSelectFilter({ emptyLabel, noun, unit, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // 패널 바깥 클릭 시 닫힘
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const allSelected = options.length > 0 && options.every((o) => selected.has(o));

  const toggleAll = () => onChange(allSelected ? new Set() : new Set(options));

  const toggle = (opt) => {
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange(next);
  };

  const count = selected.size;
  const btnLabel = count === 0 ? emptyLabel : `${noun} ${count}${unit} 선택`;

  return (
    <div className="multi-filter" ref={ref}>
      <button
        type="button"
        className={`multi-filter-btn${count > 0 ? ' active' : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        {btnLabel} <span className="multi-filter-arrow">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="multi-filter-panel">
          <button type="button" className="multi-filter-toggle-all" onClick={toggleAll}>
            {allSelected ? '전체 해제' : '전체 선택'}
          </button>
          <div className="multi-filter-list">
            {options.map((opt) => (
              <label key={opt} className="multi-filter-item">
                <input
                  type="checkbox"
                  checked={selected.has(opt)}
                  onChange={() => toggle(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 유틸 ── */
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return width;
}

function prevMonth(year, month) {
  return month === 0 ? [year - 1, 11] : [year, month - 1];
}
function nextMonth(year, month) {
  return month === 11 ? [year + 1, 0] : [year, month + 1];
}

/* ── 메인 컴포넌트 ── */
export default function Overview({ user }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [members, setMembers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);

  // 다중 선택 필터 — Set 사용
  const [filterCourses, setFilterCourses] = useState(new Set());
  const [filterMembers, setFilterMembers] = useState(new Set());

  const [curriculumModal, setCurriculumModal] = useState(null);
  const [memberPanel, setMemberPanel] = useState(null);

  const width = useWindowWidth();
  const isMobile = width < 768;

  // Load members
  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setMembers(
        snap.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, name: data.name || data.displayName || '' };
        }),
      );
    });
  }, []);

  // Load schedules for current month
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

  // Load checklist items (current month execution only)
  useEffect(() => {
    const now = new Date();
    const monthSuffix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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
  }, []);

  // users + 스케줄 기반 전체 멤버 목록 (이름 기반으로 type 결정)
  const effectiveMembers = useMemo(() => {
    const userNames = new Set(members.map((m) => m.name).filter(Boolean));
    const fromSchedules = [
      ...new Set(schedules.map((s) => s.memberName).filter(Boolean)),
    ]
      .filter((name) => !userNames.has(name) && name !== '전체')
      .map((name) => ({ id: `sched_${name}`, name }));

    return [
      ...members.filter((m) => m.name && m.name.trim()),
      ...fromSchedules,
    ]
      .map((m) => ({ ...m, type: getMemberType(m.name) }))
      .sort((a, b) =>
        (TYPE_ORDER[a.type] ?? 2) - (TYPE_ORDER[b.type] ?? 2) ||
        a.name.localeCompare(b.name, 'ko'),
      );
  }, [members, schedules]);

  // 미완료 체크리스트 courseId Set
  const incompleteIds = useMemo(() => {
    const ids = new Set();
    checklistItems.forEach((item) => {
      const done = item.done || {};
      const anyChecked = Object.values(done).some((v) => v.checked);
      if (!anyChecked && item.courseName) ids.add(item.courseName);
    });
    return ids;
  }, [checklistItems]);

  // 필터 옵션 목록
  const courses = useMemo(() => (
    [...new Set(schedules.map((s) => s.courseName).filter(Boolean))].sort()
  ), [schedules]);

  const memberNames = useMemo(() => (
    effectiveMembers.map((m) => m.name)
  ), [effectiveMembers]);

  // 다중 선택 필터 적용
  const filteredSchedules = useMemo(() => (
    schedules.filter((s) => {
      if (filterCourses.size > 0 && !filterCourses.has(s.courseName)) return false;
      if (filterMembers.size > 0 && !filterMembers.has(s.memberName)) return false;
      return true;
    })
  ), [schedules, filterCourses, filterMembers]);

  // 모바일: 현재 로그인 사용자 이름
  const myName = useMemo(() => {
    const myUser = effectiveMembers.find((m) => m.id === user.uid);
    return myUser?.name || user.displayName || '';
  }, [effectiveMembers, user.uid, user.displayName]);

  const mySchedules = useMemo(() => (
    schedules.filter((s) => s.memberName === myName)
  ), [schedules, myName]);

  const goPrev = () => {
    const [y, m] = prevMonth(year, month);
    setYear(y); setMonth(m);
  };
  const goNext = () => {
    const [y, m] = nextMonth(year, month);
    setYear(y); setMonth(m);
  };

  return (
    <div className="overview">
      <div className="overview-toolbar">
        <div className="month-nav">
          <button className="btn-nav" onClick={goPrev}>◀</button>
          <h2>{year}년 {month + 1}월</h2>
          <button className="btn-nav" onClick={goNext}>▶</button>
        </div>

        {!isMobile && (
          <div className="filters">
            <MultiSelectFilter
              emptyLabel="전체 과정"
              noun="과정"
              unit="개"
              options={courses}
              selected={filterCourses}
              onChange={setFilterCourses}
            />
            <MultiSelectFilter
              emptyLabel="전체 인원"
              noun="인원"
              unit="명"
              options={memberNames}
              selected={filterMembers}
              onChange={setFilterMembers}
            />
          </div>
        )}
      </div>

      {isMobile ? (
        <MobileDayView
          user={user}
          myName={myName}
          schedules={mySchedules}
          year={year}
          month={month}
        />
      ) : (
        <CalendarGrid
          year={year}
          month={month}
          members={effectiveMembers}
          schedules={filteredSchedules}
          incompleteIds={incompleteIds}
          onBadgeClick={setCurriculumModal}
          onMemberClick={setMemberPanel}
        />
      )}

      {curriculumModal && (
        <CurriculumModal
          courseName={curriculumModal.courseName}
          date={curriculumModal.date}
          onClose={() => setCurriculumModal(null)}
        />
      )}

      {memberPanel && (
        <MemberPanel
          member={memberPanel}
          schedules={schedules.filter((s) => s.memberName === memberPanel.name)}
          year={year}
          month={month}
          onClose={() => setMemberPanel(null)}
        />
      )}
    </div>
  );
}
