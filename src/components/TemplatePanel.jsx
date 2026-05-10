import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
} from 'firebase/firestore';
import { db } from '../firebase';

const TIMING_ORDER = ['1주전', '3일전', '1일전', '당일'];

export default function TemplatePanel({ courseName }) {
  const [items, setItems] = useState([]);
  const [newText, setNewText] = useState('');
  const [newTiming, setNewTiming] = useState('당일');
  const [newAssignee, setNewAssignee] = useState('');
  const [newNote, setNewNote] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    return onSnapshot(collection(db, 'checklistTemplates', courseName, 'items'), (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [courseName]);

  const addItem = async (e) => {
    e.preventDefault();
    if (!newText.trim()) return;
    await addDoc(collection(db, 'checklistTemplates', courseName, 'items'), {
      text: newText.trim(),
      timing: newTiming,
      assignee: newAssignee.trim(),
      note: newNote.trim(),
    });
    setNewText('');
    setNewAssignee('');
    setNewNote('');
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({
      text: item.text || '',
      timing: item.timing || '당일',
      assignee: item.assignee || '',
      note: item.note || '',
    });
  };

  const saveEdit = async () => {
    if (!editForm.text.trim()) return;
    await updateDoc(doc(db, 'checklistTemplates', courseName, 'items', editingId), {
      text: editForm.text.trim(),
      timing: editForm.timing,
      assignee: editForm.assignee.trim(),
      note: editForm.note.trim(),
    });
    setEditingId(null);
    setEditForm({});
  };

  const deleteItem = async (id) => {
    if (!confirm('템플릿 항목을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'checklistTemplates', courseName, 'items', id));
    if (editingId === id) { setEditingId(null); setEditForm({}); }
  };

  const grouped = TIMING_ORDER.reduce((acc, t) => {
    acc[t] = items.filter((i) => i.timing === t);
    return acc;
  }, {});

  return (
    <div className="checklist-card">
      <div className="checklist-card-header">
        <div>
          <h3>
            {courseName}
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
              템플릿
            </span>
          </h3>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {items.length}개 항목 — 실행본 생성 시 복사됩니다
          </div>
        </div>
      </div>

      {TIMING_ORDER.map((timing) => {
        const timingItems = grouped[timing];
        if (!timingItems.length) return null;
        return (
          <div key={timing} className="checklist-section">
            <div className="timing-label">{timing}</div>
            {timingItems.map((item) => {
              if (editingId === item.id) {
                return (
                  <div key={item.id} className="checklist-item-edit">
                    <input
                      value={editForm.text}
                      onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                      placeholder="내용"
                      style={{ flex: 2, minWidth: 120 }}
                      autoFocus
                    />
                    <select
                      value={editForm.timing}
                      onChange={(e) => setEditForm({ ...editForm, timing: e.target.value })}
                    >
                      {TIMING_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      value={editForm.assignee}
                      onChange={(e) => setEditForm({ ...editForm, assignee: e.target.value })}
                      placeholder="담당자"
                      style={{ flex: 1, minWidth: 80 }}
                    />
                    <input
                      value={editForm.note}
                      onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                      placeholder="비고"
                      style={{ flex: 1, minWidth: 80 }}
                    />
                    <button className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={saveEdit}>저장</button>
                    <button className="btn-secondary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => { setEditingId(null); setEditForm({}); }}>취소</button>
                  </div>
                );
              }
              return (
                <div key={item.id} className="checklist-item">
                  <div className="checklist-item-body">
                    <div className="checklist-item-text">{item.text}</div>
                    {item.assignee && <div className="checklist-item-meta">담당: {item.assignee}</div>}
                    {item.note && <div className="checklist-item-meta">비고: {item.note}</div>}
                  </div>
                  <div className="checklist-item-actions">
                    <button className="btn-icon" title="수정" onClick={() => startEdit(item)}>✏️</button>
                    <button className="btn-icon" title="삭제" onClick={() => deleteItem(item.id)}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <form className="add-item-form" onSubmit={addItem}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="새 항목 내용"
          required
        />
        <select value={newTiming} onChange={(e) => setNewTiming(e.target.value)}>
          {TIMING_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          value={newAssignee}
          onChange={(e) => setNewAssignee(e.target.value)}
          placeholder="담당자"
          style={{ maxWidth: 100 }}
        />
        <input
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="비고"
          style={{ maxWidth: 100 }}
        />
        <button type="submit" className="btn-add">추가</button>
      </form>
    </div>
  );
}
