import { useState } from 'react';
import {
  doc, updateDoc, deleteDoc, addDoc, collection, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

const TIMING_ORDER = ['1주전', '3일전', '1일전', '당일'];

export default function ChecklistPanel({ courseName, items, user }) {
  const [newText, setNewText] = useState('');
  const [newTiming, setNewTiming] = useState('당일');
  const [newAssignee, setNewAssignee] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [resetting, setResetting] = useState(false);

  const doneCount = items.filter((i) => {
    const done = i.done || {};
    return Object.values(done).some((v) => v.checked);
  }).length;
  const total = items.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const grouped = TIMING_ORDER.reduce((acc, t) => {
    acc[t] = items.filter((i) => i.timing === t);
    return acc;
  }, {});

  const toggleItem = async (item) => {
    const done = item.done || {};
    const myEntry = done[user.uid];
    const isChecked = myEntry?.checked;
    const newDone = { ...done };
    if (isChecked) {
      delete newDone[user.uid];
    } else {
      newDone[user.uid] = {
        checked: true,
        at: new Date().toISOString(),
        name: user.displayName,
      };
    }
    await updateDoc(doc(db, 'checklists', courseName, 'items', item.id), { done: newDone });
  };

  const deleteItem = async (itemId) => {
    if (!confirm('항목을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'checklists', courseName, 'items', itemId));
    if (editingId === itemId) { setEditingId(null); setEditForm({}); }
  };

  const addItem = async (e) => {
    e.preventDefault();
    if (!newText.trim()) return;
    await addDoc(collection(db, 'checklists', courseName, 'items'), {
      text: newText.trim(),
      timing: newTiming,
      assignee: newAssignee.trim(),
      done: {},
    });
    setNewText('');
    setNewAssignee('');
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
    await updateDoc(doc(db, 'checklists', courseName, 'items', editingId), {
      text: editForm.text.trim(),
      timing: editForm.timing,
      assignee: editForm.assignee.trim(),
      note: editForm.note.trim(),
    });
    setEditingId(null);
    setEditForm({});
  };

  const handleReset = async () => {
    if (!confirm(`"${courseName}"의 이번 회차 완료 상태를 초기화하시겠습니까?`)) return;
    setResetting(true);
    try {
      const batch = writeBatch(db);
      items.forEach((item) => {
        batch.update(doc(db, 'checklists', courseName, 'items', item.id), { done: {} });
      });
      await batch.commit();
    } finally {
      setResetting(false);
    }
  };

  const getCompletion = (item) => {
    const done = item.done || {};
    const entries = Object.values(done).filter((v) => v.checked);
    if (!entries.length) return null;
    const latest = entries.sort((a, b) => b.at.localeCompare(a.at))[0];
    const d = new Date(latest.at);
    const fmt = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${latest.name} · ${fmt}`;
  };

  const myChecked = (item) => item.done?.[user.uid]?.checked === true;

  return (
    <div className="checklist-card">
      <div className="checklist-card-header">
        <div style={{ flex: 1 }}>
          <h3>{courseName}</h3>
          <div className="progress-bar-wrap">
            <div className="progress-bar-label">{doneCount}/{total} 완료 ({pct}%)</div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <button
          className="btn-secondary"
          style={{ fontSize: 12, padding: '5px 12px', whiteSpace: 'nowrap', marginLeft: 16 }}
          onClick={handleReset}
          disabled={resetting}
        >
          {resetting ? '초기화 중...' : '이번 회차 초기화'}
        </button>
      </div>

      {TIMING_ORDER.map((timing) => {
        const timingItems = grouped[timing];
        if (!timingItems.length) return null;
        return (
          <div key={timing} className="checklist-section">
            <div className="timing-label">{timing}</div>
            {timingItems.map((item) => {
              const completion = getCompletion(item);
              const checked = myChecked(item);

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
                    <button
                      className="btn-primary"
                      style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={saveEdit}
                    >
                      저장
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: '6px 14px' }}
                      onClick={() => { setEditingId(null); setEditForm({}); }}
                    >
                      취소
                    </button>
                  </div>
                );
              }

              return (
                <div key={item.id} className="checklist-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleItem(item)}
                  />
                  <div className="checklist-item-body">
                    <div className={`checklist-item-text ${completion ? 'done' : ''}`}>
                      {item.text}
                    </div>
                    {item.assignee && (
                      <div className="checklist-item-meta">담당: {item.assignee}</div>
                    )}
                    {item.note && (
                      <div className="checklist-item-meta">비고: {item.note}</div>
                    )}
                    {completion && (
                      <div className="checklist-done-info">✓ {completion}</div>
                    )}
                  </div>
                  <div className="checklist-item-actions">
                    <button
                      className="btn-icon"
                      title="수정"
                      onClick={() => startEdit(item)}
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-icon"
                      title="삭제"
                      onClick={() => deleteItem(item.id)}
                    >
                      🗑
                    </button>
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
          {TIMING_ORDER.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          value={newAssignee}
          onChange={(e) => setNewAssignee(e.target.value)}
          placeholder="담당자"
          style={{ maxWidth: 100 }}
        />
        <button type="submit" className="btn-add">추가</button>
      </form>
    </div>
  );
}
