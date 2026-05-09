import { useEffect, useState } from 'react';

const CATEGORY_COLORS = { 교육: '#1d4ed8', 평가: '#6d28d9', 행정: '#c2410c', 휴무: '#4b5563' };

export default function MemberPanel({ member, schedules, year, month, onClose }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setOpen(true));
    return () => setOpen(false);
  }, []);

  const sorted = [...schedules].sort((a, b) => a.date.localeCompare(b.date));

  const eduItems = schedules.filter((s) => ['교육', '평가'].includes(s.category));
  const eduHours = eduItems.reduce((sum, s) => sum + (Number(s.hours) || 0), 0);
  const adminHours = schedules
    .filter((s) => s.category === '행정')
    .reduce((sum, s) => sum + (Number(s.hours) || 0), 0);
  const restDays = new Set(
    schedules.filter((s) => s.category === '휴무').map((s) => s.date)
  ).size;

  const handleClose = () => {
    setOpen(false);
    setTimeout(onClose, 280);
  };

  return (
    <>
      <div className="member-panel-overlay" onClick={handleClose} />
      <div className={`member-panel ${open ? 'open' : ''}`}>
        <div className="member-panel-header">
          <h3>
            {member.name}
            {member.type === 'temporary' && (
              <span className="badge-temp" style={{ marginLeft: 8 }}>단기</span>
            )}
            <span style={{ fontSize: 13, opacity: 0.75, marginLeft: 8 }}>
              {year}년 {month + 1}월
            </span>
          </h3>
          <button className="member-panel-close" onClick={handleClose}>×</button>
        </div>
        <div className="member-panel-summary">
          <div className="summary-chip">
            <div className="value">{eduItems.length}</div>
            <div className="label">교육 건수</div>
          </div>
          <div className="summary-chip">
            <div className="value">{eduHours}h</div>
            <div className="label">교육 시간</div>
          </div>
          <div className="summary-chip">
            <div className="value">{adminHours}h</div>
            <div className="label">행정 시간</div>
          </div>
          <div className="summary-chip">
            <div className="value">{restDays}일</div>
            <div className="label">휴무</div>
          </div>
        </div>
        <div className="member-panel-list">
          {sorted.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>
              이번 달 일정이 없습니다.
            </p>
          ) : (
            sorted.map((s) => (
              <div key={s.id} className="member-schedule-item">
                <div className="msi-date">{s.date}</div>
                <div className="msi-course">{s.courseName}</div>
                <div className="msi-meta">
                  <span
                    className={`schedule-badge badge-${s.category}`}
                    style={{ fontSize: 11 }}
                  >
                    {s.category}
                  </span>
                  {s.hours > 0 && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>
                      {s.hours}시간
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
