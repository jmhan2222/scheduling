// 같은 멤버·날짜에 서로 다른 과정이 2개 이상일 때만 충돌로 판정
// (동일 과정 중복 업로드는 Set 중복 제거로 충돌 제외)
export function detectConflicts(schedules) {
  const groups = {};
  schedules.forEach(({ memberName, date, courseName }) => {
    if (!memberName || !date) return;
    const key = `${memberName}|${date}`;
    if (!groups[key]) groups[key] = new Set();
    groups[key].add(courseName || '');
  });
  return new Set(
    Object.entries(groups)
      .filter(([, courses]) => courses.size >= 2)
      .map(([k]) => k),
  );
}
