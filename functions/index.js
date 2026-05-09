const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

admin.initializeApp();

exports.dailyNotification = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'Asia/Seoul' },
  async () => {
    const db = admin.firestore();
    const messaging = admin.messaging();

    // Tomorrow's date (KST)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const pad = (n) => String(n).padStart(2, '0');
    const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;

    // Schedules for tomorrow
    const schedulesSnap = await db.collection('schedules')
      .where('date', '==', tomorrowStr)
      .get();

    if (schedulesSnap.empty) return;

    // Group by memberName
    const byMember = {};
    schedulesSnap.docs.forEach((d) => {
      const s = d.data();
      if (!byMember[s.memberName]) byMember[s.memberName] = [];
      byMember[s.memberName].push(s);
    });

    // FCM tokens by uid
    const tokensSnap = await db.collection('fcmTokens').get();
    const tokenMap = {};
    tokensSnap.docs.forEach((d) => { tokenMap[d.id] = d.data().token; });

    // Users
    const usersSnap = await db.collection('users').get();

    const sends = [];
    for (const userDoc of usersSnap.docs) {
      const { name } = userDoc.data();
      const token = tokenMap[userDoc.id];
      if (!token || !byMember[name]) continue;

      for (const s of byMember[name]) {
        let body = `내일 [${s.courseName}]이 있습니다.`;

        // Check incomplete checklist items for D-1 timing
        if (s.courseId) {
          const itemsSnap = await db
            .collection('checklists').doc(s.courseId)
            .collection('items')
            .where('timing', '==', '1일전')
            .get();

          const incompleteCount = itemsSnap.docs.filter((d) => {
            const done = d.data().done || {};
            return !Object.values(done).some((v) => v.checked);
          }).length;

          if (incompleteCount > 0) {
            body += ` D-1 미완료 항목 ${incompleteCount}개 있습니다. 확인해주세요.`;
          }
        }

        sends.push(
          messaging.send({
            token,
            notification: { title: '✈️ 교육 일정 알림', body },
            webpush: {
              notification: { icon: '/icon.png', badge: '/icon.png' },
            },
          }).catch((err) => {
            console.warn(`Failed to send to ${name}:`, err.message);
          })
        );
      }
    }

    await Promise.all(sends);
    console.log(`Sent ${sends.length} notifications for ${tomorrowStr}`);
  }
);
