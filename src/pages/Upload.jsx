import { useState, useRef, useEffect } from 'react';
import {
  collection, addDoc, writeBatch, doc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import {
  parseExcel,
  normalizeScheduleRow,
  normalizeCurriculumRow,
  normalizeChecklistRow,
} from '../utils/excelParser';

const TABS = ['월간스케줄', '커리큘럼', '체크리스트'];

export default function Upload({ user }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [status, setStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setIsAdmin(snap.exists() && snap.data().role === 'admin');
      setCheckingRole(false);
    });
  }, [user.uid]);

  const handleFile = async (f) => {
    if (!f || !f.name.match(/\.xlsx?$/i)) {
      setStatus({ type: 'error', text: 'xlsx 파일만 업로드 가능합니다.' });
      return;
    }
    setFile(f);
    setStatus(null);
    try {
      const { scheduleData, curriculumData, checklistData } = await parseExcel(f);
      setParsed({
        schedules: scheduleData.map(normalizeScheduleRow),
        curriculum: curriculumData.map(normalizeCurriculumRow),
        checklists: checklistData.map(normalizeChecklistRow),
      });
    } catch (err) {
      setStatus({ type: 'error', text: `파싱 실패: ${err.message}` });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleApply = async () => {
    if (!parsed || !file) return;
    setUploading(true);
    setStatus(null);
    try {
      // Upload file to Storage
      const storageRef = ref(storage, `uploads/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);

      // Write to Firestore in batches (max 500 ops per batch)
      const writeAll = async (rows, colName, buildDoc) => {
        const chunks = [];
        for (let i = 0; i < rows.length; i += 400) {
          chunks.push(rows.slice(i, i + 400));
        }
        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach((row) => {
            const d = doc(collection(db, colName));
            batch.set(d, { ...buildDoc(row), createdAt: serverTimestamp() });
          });
          await batch.commit();
        }
      };

      if (parsed.schedules.length) {
        await writeAll(parsed.schedules, 'schedules', (r) => ({
          ...r, updatedAt: serverTimestamp(),
        }));
      }
      if (parsed.curriculum.length) {
        await writeAll(parsed.curriculum, 'curriculum', (r) => r);
      }
      if (parsed.checklists.length) {
        for (const row of parsed.checklists) {
          if (!row.courseId) continue;
          await addDoc(collection(db, 'checklists', row.courseId, 'items'), {
            text: row.text,
            timing: row.timing,
            assignee: row.assignee,
            done: {},
          });
        }
      }

      setStatus({ type: 'success', text: `반영 완료: 스케줄 ${parsed.schedules.length}건, 커리큘럼 ${parsed.curriculum.length}건, 체크리스트 ${parsed.checklists.length}건` });
      setParsed(null);
      setFile(null);
    } catch (err) {
      setStatus({ type: 'error', text: `저장 실패: ${err.message}` });
    } finally {
      setUploading(false);
    }
  };

  if (checkingRole) return <div className="loading">확인 중...</div>;

  if (!isAdmin) {
    return (
      <div className="upload-page">
        <div className="admin-required">
          <p style={{ fontSize: 48 }}>🔒</p>
          <p>관리자 권한이 필요합니다.</p>
          <p style={{ fontSize: 13, marginTop: 4, color: 'var(--text-secondary)' }}>
            Firestore /users/{user.uid} 에서 role을 "admin"으로 설정하세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="upload-page">
      <h2>엑셀 업로드</h2>

      <div className="upload-card">
        <div
          className={`upload-zone ${dragOver ? 'dragover' : ''}`}
          onClick={() => fileRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".xlsx,.xls"
            ref={fileRef}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <div className="upload-icon">📊</div>
          <p>
            <strong>클릭하거나 파일을 드래그하여 업로드</strong>
          </p>
          <p style={{ marginTop: 6, fontSize: 12 }}>
            xlsx 형식 · 시트1: 월간스케줄 / 시트2: 커리큘럼 / 시트3: 체크리스트
          </p>
          {file && <div className="upload-filename">📎 {file.name}</div>}
        </div>

        {status && (
          <div className={`status-msg ${status.type}`}>{status.text}</div>
        )}
      </div>

      {parsed && (
        <div className="upload-card">
          <div className="preview-section">
            <h3>파싱 미리보기</h3>
            <div className="preview-tabs">
              {TABS.map((t, i) => (
                <button
                  key={t}
                  className={`preview-tab ${activeTab === i ? 'active' : ''}`}
                  onClick={() => setActiveTab(i)}
                >
                  {t} ({[parsed.schedules, parsed.curriculum, parsed.checklists][i].length}건)
                </button>
              ))}
            </div>

            <PreviewTable
              data={[parsed.schedules, parsed.curriculum, parsed.checklists][activeTab]}
            />
          </div>

          <div className="upload-actions">
            <button
              className="btn-secondary"
              onClick={() => { setParsed(null); setFile(null); }}
            >
              취소
            </button>
            <button
              className="btn-primary"
              onClick={handleApply}
              disabled={uploading}
            >
              {uploading ? '반영 중...' : '✓ Firestore에 반영'}
            </button>
          </div>
        </div>
      )}

      <div className="upload-card" style={{ padding: '20px 24px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>
          엑셀 컬럼 형식 안내
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[
            { title: '시트1: 월간스케줄', cols: ['날짜 (YYYY-MM-DD)', '이름', '과정명', '구분 (교육/평가/행정/휴무)', '시간수', '과정ID'] },
            { title: '시트2: 커리큘럼', cols: ['과정ID', '과정명', '차수', '날짜', '교시', '시작시간', '종료시간', '과목명', '강사'] },
            { title: '시트3: 체크리스트', cols: ['과정ID', '내용', '시점 (1주전/3일전/1일전/당일)', '담당자'] },
          ].map(({ title, cols }) => (
            <div key={title}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, color: 'var(--navy)' }}>{title}</div>
              {cols.map((c) => (
                <div key={c} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '2px 0' }}>
                  • {c}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PreviewTable({ data }) {
  if (!data || data.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary)', padding: '20px 0', fontSize: 13 }}>
        데이터가 없습니다.
      </p>
    );
  }
  const keys = Object.keys(data[0]);
  return (
    <div className="preview-table-wrap">
      <table className="preview-table">
        <thead>
          <tr>{keys.map((k) => <th key={k}>{k}</th>)}</tr>
        </thead>
        <tbody>
          {data.slice(0, 50).map((row, i) => (
            <tr key={i}>
              {keys.map((k) => <td key={k}>{String(row[k] ?? '')}</td>)}
            </tr>
          ))}
          {data.length > 50 && (
            <tr>
              <td colSpan={keys.length} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                ... 외 {data.length - 50}건
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
