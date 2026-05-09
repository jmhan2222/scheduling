import * as XLSX from 'xlsx';

export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });

        const toJson = (idx) => {
          const sheet = wb.Sheets[wb.SheetNames[idx]];
          return sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '' }) : [];
        };

        resolve({
          scheduleData: toJson(0),
          curriculumData: toJson(1),
          checklistData: toJson(2),
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Map Korean column names from Excel to Firestore fields
export function normalizeScheduleRow(row) {
  return {
    date: String(row['날짜'] || row.date || '').trim(),
    memberName: String(row['이름'] || row.memberName || '').trim(),
    courseName: String(row['과정명'] || row.courseName || '').trim(),
    category: String(row['구분'] || row.category || '교육').trim(),
    hours: Number(row['시간수'] || row.hours || 0),
    courseId: String(row['과정ID'] || row.courseId || '').trim(),
  };
}

export function normalizeCurriculumRow(row) {
  return {
    courseId: String(row['과정ID'] || row.courseId || '').trim(),
    courseName: String(row['과정명'] || row.courseName || '').trim(),
    round: String(row['차수'] || row.round || '').trim(),
    date: String(row['날짜'] || row.date || '').trim(),
    period: Number(row['교시'] || row.period || 0),
    startTime: String(row['시작시간'] || row.startTime || '').trim(),
    endTime: String(row['종료시간'] || row.endTime || '').trim(),
    subject: String(row['과목명'] || row.subject || '').trim(),
    instructor: String(row['강사'] || row.instructor || '').trim(),
  };
}

export function normalizeChecklistRow(row) {
  return {
    courseId: String(row['과정ID'] || row.courseId || '').trim(),
    text: String(row['내용'] || row.text || '').trim(),
    timing: String(row['시점'] || row.timing || '당일').trim(),
    assignee: String(row['담당자'] || row.assignee || '').trim(),
  };
}
