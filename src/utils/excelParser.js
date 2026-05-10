import * as XLSX from 'xlsx';

const SCHEDULE_COLS = ['날짜', 'date', '이름', 'memberName', '과정명', 'courseName'];
const CURRICULUM_COLS = ['과정ID', 'courseId', '과목명', 'subject', '날짜', 'date'];
const CHECKLIST_COLS = ['과정ID', 'courseId', '내용', 'text', '시점', 'timing'];

function findSheetByKeywords(wb, keywords) {
  const name = wb.SheetNames.find((n) => keywords.some((kw) => n.includes(kw)));
  return name ? wb.Sheets[name] : null;
}

function sheetToJsonAutoHeader(sheet, knownCols) {
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const headerIdx = rows.findIndex((row) =>
    row.some((cell) => knownCols.includes(String(cell).trim()))
  );

  if (headerIdx === -1) {
    // fallback: first row as header
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  const headers = rows[headerIdx].map((h) => String(h).trim());
  const dataRows = rows.slice(headerIdx + 1);

  return dataRows
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = row[i] ?? '';
      });
      return obj;
    });
}

export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });

        const scheduleSheet = findSheetByKeywords(wb, ['월간', '스케줄']);
        const curriculumSheet = findSheetByKeywords(wb, ['커리큘럼']);
        const checklistSheet = findSheetByKeywords(wb, ['체크']);

        const scheduleData = sheetToJsonAutoHeader(scheduleSheet, SCHEDULE_COLS);
        const curriculumData = sheetToJsonAutoHeader(curriculumSheet, CURRICULUM_COLS);
        const checklistData = sheetToJsonAutoHeader(checklistSheet, CHECKLIST_COLS);

        console.log('[excelParser] 시트명:', wb.SheetNames);
        console.log('[excelParser] scheduleData 샘플 (첫 3행):', scheduleData.slice(0, 3));
        console.log('[excelParser] curriculumData 샘플 (첫 3행):', curriculumData.slice(0, 3));
        console.log('[excelParser] checklistData 샘플 (첫 3행):', checklistData.slice(0, 3));

        resolve({ scheduleData, curriculumData, checklistData });
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
