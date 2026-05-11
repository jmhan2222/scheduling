import { useState, useRef, useEffect } from 'react';
import {
  collection, writeBatch, doc, onSnapshot, serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  parseExcel,
  normalizeScheduleRow,
  normalizeCurriculumRow,
  downloadTemplate,
} from '../utils/excelParser';

const TABS = ['월간스케줄', '커리큘럼'];

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

  const [templateCourses, setTemplateCourses] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateRows, setTemplateRows] = useState([]);

  useEffect(() => {
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setIsAdmin(snap.exists() && snap.data().role === 'admin');
      setCheckingRole(false);
    });
  }, [user.uid]);

  useEffect(() => {
    return onSnapshot(collection(db, 'curriculumTemplates'), (snap) => {
      setTemplateCourses(snap.docs.map((d) => d.id).sort());
    });
  }, []);

  useEffect(() => {
    if (!selectedTemplate) return;
    return onSnapshot(
      collection(db, 'curriculumTemplates', selectedTemplate, 'items'),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.period - b.period);
        setTemplateRows(rows.length > 0 ? rows : Array.from({ length: 8 }, (_, i) => ({
          period: i + 1, startTime: '', endTime: '', subject: '', instructor: '',
        })));
      },
    );
  }, [selectedTemplate]);

  const updateTemplateRow = (idx, field, value) => {
    setTemplateRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addTemplateRow = () => {
    setTemplateRows((prev) => [
      ...prev,
      { period: prev.length + 1, startTime: '', endTime: '', subject: '', instructor: '' },
    ]);
  };

  const removeTemplateRow = (idx) => {
    setTemplateRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveTemplate = async (courseName, rows) => {
    const colRef = collection(db, 'curriculumTemplates', courseName, 'items');
    const snap = await getDocs(colRef);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    rows.forEach((row) => {
      batch.set(doc(colRef), {
        period: Number(row.period),
        startTime: row.startTime || '',
        endTime: row.endTime || '',
        subject: row.subject || '',
        instructor: row.instructor || '',
      });
    });
    await batch.commit();
    alert('저장 완료!');
  };

  const handleFile = async (f) => {
    if (!f || !f.name.match(/\.xlsx?$/i)) {
      setStatus({ type: 'error', text: 'xlsx 파일만 업로드 가능합니다.' });
      return;
    }
    setFile(f);
    setStatus(null);
    try {
      const { scheduleData, curriculumData } = await parseExcel(f);
      setParsed({
        schedules: scheduleData.map(normalizeScheduleRow),
        curriculum: curriculumData.map(normalizeCurriculumRow),
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

      setStatus({
        type: 'success',
        text: `반영 완료: 스케줄 ${parsed.schedules.length}건, 커리큘럼 ${parsed.curriculum.length}건`,
      });
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>엑셀 업로드</h2>
        <button className="btn-secondary" onClick={downloadTemplate}>
          ⬇ 양식 다운로드
        </button>
      </div>

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
            xlsx 형식 · 시트1: 월간스케줄 / 시트2: 커리큘럼
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
                  {t} ({[parsed.schedules, parsed.curriculum][i].length}건)
                </button>
              ))}
            </div>

            <PreviewTable data={[parsed.schedules, parsed.curriculum][activeTab]} />
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

      <div className="upload-card template-manager" style={{ padding: '20px 24px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
          📚 과정 커리큘럼 마스터
        </h3>
        <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          과정별 기본 커리큘럼을 등록해두면 커리큘럼 모달에서 한 번에 불러올 수 있어요.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {templateCourses.map((name) => (
            <button
              key={name}
              onClick={() => setSelectedTemplate(name)}
              style={{
                padding: '6px 14px',
                borderRadius: 99,
                border: '1.5px solid',
                borderColor: selectedTemplate === name ? '#1e3a5f' : '#e5e7eb',
                background: selectedTemplate === name ? '#1e3a5f' : '#fff',
                color: selectedTemplate === name ? '#fff' : '#374151',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {name}
            </button>
          ))}
          <button
            onClick={() => {
              const name = prompt('새 과정명 입력:');
              if (name?.trim()) setSelectedTemplate(name.trim());
            }}
            style={{
              padding: '6px 14px',
              borderRadius: 99,
              border: '1.5px dashed #d1d5db',
              background: '#fff',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            + 새 과정 추가
          </button>
        </div>

        {selectedTemplate && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{
              background: '#1e3a5f', color: '#fff', padding: '10px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontWeight: 600 }}>{selectedTemplate}</span>
              <button
                onClick={() => saveTemplate(selectedTemplate, templateRows)}
                style={{
                  padding: '4px 12px', background: '#e07a5f', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                }}
              >
                💾 저장
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ padding: 8, fontSize: 12, width: 50 }}>교시</th>
                  <th style={{ padding: 8, fontSize: 12, width: 90 }}>시작</th>
                  <th style={{ padding: 8, fontSize: 12, width: 90 }}>종료</th>
                  <th style={{ padding: 8, fontSize: 12 }}>과목명</th>
                  <th style={{ padding: 8, fontSize: 12, width: 140 }}>강사</th>
                  <th style={{ padding: 8, fontSize: 12, width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {templateRows.map((row, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <input
                        type="number" min="1"
                        value={row.period}
                        onChange={(e) => updateTemplateRow(i, 'period', e.target.value)}
                        style={{ width: 40, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', fontSize: 12, outline: 'none' }}
                      />
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={(e) => updateTemplateRow(i, 'startTime', e.target.value)}
                        style={{ width: 80, border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', fontSize: 12, outline: 'none' }}
                      />
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <input
                        type="time"
                        value={row.endTime}
                        onChange={(e) => updateTemplateRow(i, 'endTime', e.target.value)}
                        style={{ width: 80, border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', fontSize: 12, outline: 'none' }}
                      />
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <input
                        value={row.subject}
                        onChange={(e) => updateTemplateRow(i, 'subject', e.target.value)}
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <input
                        value={row.instructor}
                        onChange={(e) => updateTemplateRow(i, 'instructor', e.target.value)}
                        style={{ width: '100%', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 6px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <button
                        onClick={() => removeTemplateRow(i)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f0f0' }}>
              <button
                onClick={addTemplateRow}
                style={{ fontSize: 13, color: '#1e3a5f', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
              >
                + 교시 추가
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="upload-card" style={{ padding: '20px 24px' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 12 }}>
          엑셀 컬럼 형식 안내
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[
            { title: '시트1: 월간스케줄', cols: ['날짜 (YYYY-MM-DD)', '이름', '과정명', '구분 (교육/평가/행정/휴무)', '시간수'] },
            { title: '시트2: 커리큘럼', cols: ['과정명', '차수', '날짜', '교시', '시작시간', '종료시간', '과목명', '강사'] },
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
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 14 }}>
          ※ 체크리스트는 앱 내 "체크리스트 → 템플릿 관리"에서 직접 입력합니다.
        </p>
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
