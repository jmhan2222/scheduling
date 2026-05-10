import { useState, useEffect } from 'react';
import {
  onSnapshot, collectionGroup, collection, addDoc, writeBatch, doc, getDocs, query, where,
} from 'firebase/firestore';
import { db } from '../firebase';
import ChecklistPanel from '../components/ChecklistPanel';
import TemplatePanel from '../components/TemplatePanel';

const TIMING_ORDER = ['1주전', '3일전', '1일전', '당일'];
const EMPTY_ADD = { courseName: '', text: '', timing: '당일', assignee: '', note: '' };

export default function Checklist({ user, isAdmin }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const pad = (n) => String(n).padStart(2, '0');
  const monthSuffix = `${year}-${pad(month + 1)}`;

  const [activeTab, setActiveTab] = useState('check');
  const [itemsByExec, setItemsByExec] = useState({});
  const [templateCourseNames, setTemplateCourseNames] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState(null);
  const [newTemplateCourse, setNewTemplateCourse] = useState('');
  const [pendingCourses, setPendingCourses] = useState([]);

  // Load execution items (current month only)
  useEffect(() => {
    return onSnapshot(collectionGroup(db, 'items'), (snap) => {
      const byExec = {};
      snap.docs.forEach((d) => {
        if (!d.ref.path.startsWith('checklists/')) return;
        const execId = d.ref.parent.parent.id;
        if (!execId.endsWith(`_${monthSuffix}`)) return;
        if (!byExec[execId]) byExec[execId] = [];
        byExec[execId].push({ id: d.id, ...d.data() });
      });
      setItemsByExec(byExec);
    });
  }, [monthSuffix]);

  // Load template course names
  useEffect(() => {
    return onSnapshot(collectionGroup(db, 'items'), (snap) => {
      const names = new Set();
      snap.docs.forEach((d) => {
        if (!d.ref.path.startsWith('checklistTemplates/')) return;
        names.add(d.ref.parent.parent.id);
      });
      setTemplateCourseNames([...names].sort());
    });
  }, []);

  const execIds = Object.keys(itemsByExec);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.courseName.trim() || !addForm.text.trim()) return;
    setAdding(true);
    const execId = `${addForm.courseName.trim()}_${monthSuffix}`;
    try {
      await addDoc(collection(db, 'checklists', execId, 'items'), {
        text: addForm.text.trim(),
        timing: addForm.timing,
        assignee: addForm.assignee.trim(),
        note: addForm.note.trim(),
        done: {},
      });
      setAddForm(EMPTY_ADD);
      setShowAddForm(false);
    } finally {
      setAdding(false);
    }
  };

  const handleResetAll = async () => {
    if (!confirm('전체 체크리스트의 완료 상태를 초기화하시겠습니까?')) return;
    setResetting(true);
    try {
      const allEntries = [];
      Object.entries(itemsByExec).forEach(([execId, items]) => {
        items.forEach((item) => allEntries.push({ execId, id: item.id }));
      });
      for (let i = 0; i < allEntries.length; i += 400) {
        const batch = writeBatch(db);
        allEntries.slice(i, i + 400).forEach(({ execId, id }) => {
          batch.update(doc(db, 'checklists', execId, 'items', id), { done: {} });
        });
        await batch.commit();
      }
    } finally {
      setResetting(false);
    }
  };

  const handleGenerate = async () => {
    if (!confirm(`${year}년 ${month + 1}월 실행본을 생성하시겠습니까?\n이미 존재하는 과정은 스킵됩니다.`)) return;
    setGenerating(true);
    setGenStatus(null);
    try {
      const startDate = `${year}-${pad(month + 1)}-01`;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const endDate = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;

      const schedsSnap = await getDocs(query(
        collection(db, 'schedules'),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
      ));
      const courseNames = [...new Set(
        schedsSnap.docs.map((d) => d.data().courseName).filter(Boolean)
      )];

      let created = 0; let skipped = 0; let noTemplate = 0;

      for (const cn of courseNames) {
        const execId = `${cn}_${monthSuffix}`;
        const existSnap = await getDocs(collection(db, 'checklists', execId, 'items'));
        if (!existSnap.empty) { skipped++; continue; }

        const tplSnap = await getDocs(collection(db, 'checklistTemplates', cn, 'items'));
        if (tplSnap.empty) { noTemplate++; continue; }

        const batch = writeBatch(db);
        tplSnap.docs.forEach((d) => {
          const ref = doc(collection(db, 'checklists', execId, 'items'));
          batch.set(ref, { ...d.data(), done: {} });
        });
        await batch.commit();
        created++;
      }

      setGenStatus(`완료: ${created}개 과정 생성 / ${skipped}개 스킵 (이미 존재) / ${noTemplate}개 템플릿 없음`);
    } catch (err) {
      setGenStatus(`오류: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const allCourseNames = [...new Set([
    ...execIds.map((id) => id.replace(`_${monthSuffix}`, '')),
    ...templateCourseNames,
  ])].sort();

  const allTemplateCoursesDisplay = [...new Set([
    ...templateCourseNames,
    ...pendingCourses,
  ])].sort();

  const addTemplateCourse = (e) => {
    e.preventDefault();
    const name = newTemplateCourse.trim();
    if (!name || allTemplateCoursesDisplay.includes(name)) return;
    setPendingCourses((prev) => [...prev, name]);
    setNewTemplateCourse('');
  };

  return (
    <div className="checklist-page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 style={{ margin: 0 }}>공유 체크리스트</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{year}년 {month + 1}월</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {activeTab === 'check' && (
            <>
              <button className="btn-secondary" onClick={() => { setShowAddForm((v) => !v); setAddForm(EMPTY_ADD); }}>
                {showAddForm ? '✕ 닫기' : '+ 항목 추가'}
              </button>
              <button className="btn-secondary" onClick={handleResetAll} disabled={resetting || execIds.length === 0}>
                {resetting ? '초기화 중...' : '일괄 초기화'}
              </button>
              {isAdmin && (
                <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
                  {generating ? '생성 중...' : '이번 달 실행본 생성'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="checklist-subtabs">
        <button
          className={`checklist-subtab${activeTab === 'check' ? ' active' : ''}`}
          onClick={() => setActiveTab('check')}
        >
          이번 달 체크
        </button>
        {isAdmin && (
          <button
            className={`checklist-subtab${activeTab === 'template' ? ' active' : ''}`}
            onClick={() => setActiveTab('template')}
          >
            템플릿 관리
          </button>
        )}
      </div>

      {genStatus && (
        <div className={`status-msg ${genStatus.startsWith('오류') ? 'error' : 'success'}`}>
          {genStatus}
        </div>
      )}

      {/* ── 이번 달 체크 탭 ── */}
      {activeTab === 'check' && (
        <>
          {showAddForm && (
            <div className="checklist-add-form-card">
              <form onSubmit={handleAdd}>
                <div className="form-row">
                  <div className="form-group">
                    <label>과정명 *</label>
                    <input
                      list="course-datalist"
                      value={addForm.courseName}
                      onChange={(e) => setAddForm({ ...addForm, courseName: e.target.value })}
                      placeholder="과정명 입력 또는 선택"
                      required
                      autoFocus
                    />
                    <datalist id="course-datalist">
                      {allCourseNames.map((cn) => <option key={cn} value={cn} />)}
                    </datalist>
                  </div>
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>내용 *</label>
                    <input
                      value={addForm.text}
                      onChange={(e) => setAddForm({ ...addForm, text: e.target.value })}
                      placeholder="체크리스트 항목 내용"
                      required
                    />
                  </div>
                </div>
                <div className="form-row" style={{ marginTop: 10 }}>
                  <div className="form-group">
                    <label>시점</label>
                    <select value={addForm.timing} onChange={(e) => setAddForm({ ...addForm, timing: e.target.value })}>
                      {TIMING_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>담당자</label>
                    <input value={addForm.assignee} onChange={(e) => setAddForm({ ...addForm, assignee: e.target.value })} placeholder="담당자" />
                  </div>
                  <div className="form-group">
                    <label>비고</label>
                    <input value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} placeholder="비고 (선택)" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button type="submit" className="btn-primary" disabled={adding}>{adding ? '추가 중...' : '추가'}</button>
                  <button type="button" className="btn-secondary" onClick={() => { setShowAddForm(false); setAddForm(EMPTY_ADD); }}>취소</button>
                </div>
              </form>
            </div>
          )}

          {execIds.length === 0 ? (
            <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 48, textAlign: 'center', color: 'var(--text-secondary)', boxShadow: 'var(--shadow)' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>📋</p>
              <p>{year}년 {month + 1}월 체크리스트가 없습니다.</p>
              <p style={{ fontSize: 12, marginTop: 8 }}>
                {isAdmin ? '"이번 달 실행본 생성"으로 템플릿에서 자동 생성하거나, ' : ''}
                "+ 항목 추가"로 직접 입력하세요.
              </p>
              <button className="btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAddForm(true)}>
                + 첫 항목 추가하기
              </button>
            </div>
          ) : (
            execIds.map((execId) => {
              const courseName = execId.replace(`_${monthSuffix}`, '');
              return (
                <ChecklistPanel
                  key={execId}
                  execId={execId}
                  courseName={courseName}
                  items={itemsByExec[execId] || []}
                  user={user}
                />
              );
            })
          )}
        </>
      )}

      {/* ── 템플릿 관리 탭 ── */}
      {activeTab === 'template' && isAdmin && (
        <>
          <div className="checklist-add-form-card" style={{ marginBottom: 0 }}>
            <form onSubmit={addTemplateCourse} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>새 과정 템플릿 추가</label>
                <input
                  value={newTemplateCourse}
                  onChange={(e) => setNewTemplateCourse(e.target.value)}
                  placeholder="과정명 입력"
                  list="template-course-list"
                />
                <datalist id="template-course-list">
                  {templateCourseNames.map((cn) => <option key={cn} value={cn} />)}
                </datalist>
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '9px 18px' }}>
                + 과정 추가
              </button>
            </form>
          </div>

          {allTemplateCoursesDisplay.length === 0 ? (
            <div style={{ background: 'var(--white)', borderRadius: 'var(--radius)', padding: 48, textAlign: 'center', color: 'var(--text-secondary)', boxShadow: 'var(--shadow)' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>📝</p>
              <p>등록된 템플릿이 없습니다.</p>
              <p style={{ fontSize: 12, marginTop: 8 }}>위에서 과정명을 입력하여 템플릿을 시작하세요.</p>
            </div>
          ) : (
            allTemplateCoursesDisplay.map((cn) => (
              <TemplatePanel key={cn} courseName={cn} />
            ))
          )}
        </>
      )}
    </div>
  );
}
