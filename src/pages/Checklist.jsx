import { useState, useEffect } from 'react';
import {
  onSnapshot, collectionGroup, collection, addDoc, writeBatch, doc,
} from 'firebase/firestore';
import { db } from '../firebase';
import ChecklistPanel from '../components/ChecklistPanel';

const TIMING_ORDER = ['1주전', '3일전', '1일전', '당일'];
const EMPTY_ADD = { courseName: '', text: '', timing: '당일', assignee: '', note: '' };

export default function Checklist({ user }) {
  const [itemsByName, setItemsByName] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    return onSnapshot(collectionGroup(db, 'items'), (snap) => {
      const byName = {};
      snap.docs.forEach((d) => {
        const courseName = d.ref.parent.parent.id;
        if (!byName[courseName]) byName[courseName] = [];
        byName[courseName].push({ id: d.id, ...d.data() });
      });
      setItemsByName(byName);
    });
  }, []);

  const courseNames = Object.keys(itemsByName).filter((name) => itemsByName[name]?.length > 0);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.courseName.trim() || !addForm.text.trim()) return;
    setAdding(true);
    try {
      await addDoc(collection(db, 'checklists', addForm.courseName.trim(), 'items'), {
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
      Object.entries(itemsByName).forEach(([cn, items]) => {
        items.forEach((item) => allEntries.push({ cn, id: item.id }));
      });
      for (let i = 0; i < allEntries.length; i += 400) {
        const batch = writeBatch(db);
        allEntries.slice(i, i + 400).forEach(({ cn, id }) => {
          batch.update(doc(db, 'checklists', cn, 'items', id), { done: {} });
        });
        await batch.commit();
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="checklist-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
        <h2 style={{ margin: 0 }}>공유 체크리스트</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-secondary"
            onClick={() => { setShowAddForm((v) => !v); setAddForm(EMPTY_ADD); }}
          >
            {showAddForm ? '✕ 닫기' : '+ 항목 추가'}
          </button>
          <button
            className="btn-secondary"
            onClick={handleResetAll}
            disabled={resetting || courseNames.length === 0}
          >
            {resetting ? '초기화 중...' : '일괄 초기화'}
          </button>
        </div>
      </div>

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
                  {courseNames.map((cn) => <option key={cn} value={cn} />)}
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
                <select
                  value={addForm.timing}
                  onChange={(e) => setAddForm({ ...addForm, timing: e.target.value })}
                >
                  {TIMING_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>담당자</label>
                <input
                  value={addForm.assignee}
                  onChange={(e) => setAddForm({ ...addForm, assignee: e.target.value })}
                  placeholder="담당자"
                />
              </div>
              <div className="form-group">
                <label>비고</label>
                <input
                  value={addForm.note}
                  onChange={(e) => setAddForm({ ...addForm, note: e.target.value })}
                  placeholder="비고 (선택)"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="submit" className="btn-primary" disabled={adding}>
                {adding ? '추가 중...' : '추가'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowAddForm(false); setAddForm(EMPTY_ADD); }}
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {courseNames.length === 0 ? (
        <div style={{
          background: 'var(--white)', borderRadius: 'var(--radius)',
          padding: 48, textAlign: 'center', color: 'var(--text-secondary)',
          boxShadow: 'var(--shadow)',
        }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📋</p>
          <p>등록된 체크리스트가 없습니다.</p>
          <p style={{ fontSize: 12, marginTop: 8 }}>
            엑셀 업로드 또는 아래 버튼으로 항목을 추가하세요.
          </p>
          <button
            className="btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => setShowAddForm(true)}
          >
            + 첫 항목 추가하기
          </button>
        </div>
      ) : (
        courseNames.map((courseName) => (
          <ChecklistPanel
            key={courseName}
            courseName={courseName}
            items={itemsByName[courseName] || []}
            user={user}
          />
        ))
      )}
    </div>
  );
}
