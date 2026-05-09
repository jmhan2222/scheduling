import { useState, useEffect } from 'react';
import {
  collection, onSnapshot, collectionGroup,
} from 'firebase/firestore';
import { db } from '../firebase';
import ChecklistPanel from '../components/ChecklistPanel';

export default function Checklist({ user }) {
  const [courseMap, setCourseMap] = useState({});
  const [itemsByCourse, setItemsByCourse] = useState({});

  // Build courseId→courseName map from schedules
  useEffect(() => {
    return onSnapshot(collection(db, 'schedules'), (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const { courseId, courseName } = d.data();
        if (courseId && courseName && !map[courseId]) {
          map[courseId] = courseName;
        }
      });
      setCourseMap(map);
    });
  }, []);

  // Load all checklist items
  useEffect(() => {
    return onSnapshot(collectionGroup(db, 'items'), (snap) => {
      const byId = {};
      snap.docs.forEach((d) => {
        const courseId = d.ref.parent.parent.id;
        if (!byId[courseId]) byId[courseId] = [];
        byId[courseId].push({ id: d.id, ...d.data() });
      });
      setItemsByCourse(byId);
    });
  }, []);

  // All unique courseIds that have items
  const courseIds = Object.keys(itemsByCourse);
  // Also include courseIds from courseMap that might have no items yet
  const allCourseIds = [...new Set([
    ...courseIds,
    ...Object.keys(courseMap).filter((id) => !courseIds.includes(id)),
  ])].filter((id) => id && itemsByCourse[id]?.length > 0);

  return (
    <div className="checklist-page">
      <h2>공유 체크리스트</h2>
      {allCourseIds.length === 0 ? (
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
        allCourseIds.map((courseId) => (
          <ChecklistPanel
            key={courseId}
            courseId={courseId}
            courseName={courseMap[courseId] || courseId}
            items={itemsByCourse[courseId] || []}
            user={user}
          />
        ))
      )}
    </div>
  );
}
