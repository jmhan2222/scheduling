export function detectConflicts(schedules) {
  const counts = {};
  schedules.forEach(({ memberName, date }) => {
    if (!memberName || !date) return;
    const key = `${memberName}|${date}`;
    counts[key] = (counts[key] || 0) + 1;
  });
  return new Set(
    Object.entries(counts)
      .filter(([, c]) => c >= 2)
      .map(([k]) => k)
  );
}
