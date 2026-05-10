import { useState, useEffect, useMemo } from 'react';
import {
  collection, onSnapshot, query, where, collectionGroup,
} from 'firebase/firestore';
import { db } from '../firebase';
import CalendarGrid from '../components/CalendarGrid';
import MobileDayView from '../components/MobileDayView';
import CurriculumModal from '../components/CurriculumModal';
import MemberPanel from '../components/MemberPanel';

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

export default function Overview({ user }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [members, setMembers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);
  const [filterCourse, setFilterCourse] = useState('');
  const [filterMember, setFilterMember] = useState('');
  const [curriculumModal, setCurriculumModal] = useState(null);
  const [memberPanel, setMemberPanel] = useState(null);

  const width = useWindowWidth();
  const isMobile = width < 768;

  // Load members — name 필드가 없으면 displayName 폴백
  useEffect(() => {
    return onSnapshot(collection(db, 'users'), (snap) => {
      setMembers(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            name: data.name || data.displayName || '',
          };
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

  // Load all checklist items via collection group
  useEffect(() => {
    return onSnapshot(collectionGroup(db, 'items'), (snap) => {
      setChecklistItems(
        snap.docs.map((d) => ({
          id: d.id,
          courseId: d.ref.parent.parent.id,
          ...d.data(),
        })),
      );
    });
  }, []);

  // users 컬렉션 + 스케줄에 등장하는 이름을 합쳐서 완전한 멤버 목록 구성
  // → users에 아직 로그인하지 않은 파트원도 달력에 표시
  const effectiveMembers = useMemo(() => {
    const userNames = new Set(members.map((m) => m.name).filter(Boolean));
    const fromSchedules = [
      ...new Set(schedules.map((s) => s.memberName).filter(Boolean)),
    ]
      .filter((name) => !userNames.has(name))
      .map((name) => ({ id: `sched_${name}`, name, type: 'regular' }));

    return [
      ...members.filter((m) => m.name),
      ...fromSchedules,
    ].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [members, schedules]);

  // Compute Set of courseIds that have incomplete items
  const incompleteIds = useMemo(() => {
    const ids = new Set();
    checklistItems.forEach((item) => {
      const done = item.done || {};
      const anyChecked = Object.values(done).some((v) => v.checked);
      if (!anyChecked && item.courseId) ids.add(item.courseId);
    });
    return ids;
  }, [checklistItems]);

  const courses = useMemo(() => (
    [...new Set(schedules.map((s) => s.courseName).filter(Boolean))]
  ), [schedules]);

  const filteredSchedules = useMemo(() => (
    schedules.filter((s) => {
      if (filterCourse && s.courseName !== filterCourse) return false;
      if (filterMember && s.memberName !== filterMember) return false;
      return true;
    })
  ), [schedules, filterCourse, filterMember]);

  // 모바일: 현재 로그인 사용자의 일정 (users 컬렉션 name 우선 사용)
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
            <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
              <option value="">전체 과정</option>
              {courses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterMember} onChange={(e) => setFilterMember(e.target.value)}>
              <option value="">전체 인원</option>
              {effectiveMembers.map((m) => (
                <option key={m.id} value={m.name}>{m.name}</option>
              ))}
            </select>
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
          courseId={curriculumModal.courseId}
          courseName={curriculumModal.courseName}
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
