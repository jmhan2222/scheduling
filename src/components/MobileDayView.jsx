const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function MobileDayView({ user, schedules, year, month }) {
  const sorted = [...schedules].sort((a, b) => a.date.localeCompare(b.date));

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  };

  return (
    <div className="mobile-day-view">
      <h3>{user.displayName}님의 {month + 1}월 일정</h3>
      {sorted.length === 0 ? (
        <div className="mobile-empty">
          <p>📅</p>
          <p>이번 달 등록된 일정이 없습니다.</p>
        </div>
      ) : (
        sorted.map((s) => (
          <div key={s.id} className={`mobile-card ${s.category}`}>
            <div className="mobile-card-date">{formatDate(s.date)}</div>
            <div className="mobile-card-course">{s.courseName}</div>
            <div className="mobile-card-meta">
              <span className={`schedule-badge badge-${s.category}`}>{s.category}</span>
              {s.hours > 0 && <span>{s.hours}시간</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
