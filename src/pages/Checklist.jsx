import { useState, useEffect } from 'react';
import { onSnapshot, collectionGroup } from 'firebase/firestore';
import { db } from '../firebase';
import ChecklistPanel from '../components/ChecklistPanel';

export default function Checklist({ user }) {
  const [itemsByName, setItemsByName] = useState({});

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

  return (
    <div className="checklist-page">
      <h2>공유 체크리스트</h2>
      {courseNames.length === 0 ? (
        <div style={{
          background: 'var(--white)', borderRadius: 'var(--radius)',
          padding: 48, textAlign: 'center', color: 'var(--text-secondary)',
          boxShadow: 'var(--shadow)',
        }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>📋</p>
          <p>등록된 체크리스트가 없습니다.</p>
          <p style={{ fontSize: 12, marginTop: 8 }}>
            엑셀 업로드 또는 과정 배지 클릭 후 체크리스트 항목을 추가하세요.
          </p>
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
