const {
  json,
  initAdmin,
  parseBody,
  verifyRequest,
  getUserRole
} = require('./_lib');

function normalizeStudentRow(row) {
  return {
    name: String(row.name || '').trim(),
    mail: String(row.mail || '').trim().toLowerCase(),
    passwort: String(row.passwort || '').trim()
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const decoded = await verifyRequest(event);
    const role = await getUserRole(decoded.uid);
    if (role !== 'super_admin') {
      return json(403, { error: 'Only super_admin can import students' });
    }

    const body = parseBody(event);
    const students = Array.isArray(body.students) ? body.students : [];
    const classId = String(body.classId || '').trim();

    if (!students.length) {
      return json(400, { error: 'No students provided' });
    }

    const sdk = initAdmin();
    const db = sdk.firestore();
    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const raw of students) {
      const row = normalizeStudentRow(raw);
      if (!row.name || !row.mail || !row.passwort) {
        failedCount += 1;
        failures.push({ mail: row.mail || '', reason: 'Missing required fields' });
        continue;
      }

      try {
        let userRecord;
        try {
          userRecord = await sdk.auth().createUser({
            email: row.mail,
            password: row.passwort,
            displayName: row.name
          });
          createdCount += 1;
        } catch (createErr) {
          if (createErr && createErr.code === 'auth/email-already-exists') {
            userRecord = await sdk.auth().getUserByEmail(row.mail);
            await sdk.auth().updateUser(userRecord.uid, {
              password: row.passwort,
              displayName: row.name
            });
            updatedCount += 1;
          } else {
            throw createErr;
          }
        }

        const uid = userRecord.uid;
        await db.collection('smartlearn_users').doc(uid).set({
          name: row.name,
          email: row.mail,
          role: 'student',
          updated_at_iso: new Date().toISOString(),
          created_at_iso: new Date().toISOString()
        }, { merge: true });

        if (classId) {
          await db.collection('classes').doc(classId).set({
            class_id: classId,
            title: classId,
            updated_at_iso: new Date().toISOString(),
            created_by_uid: decoded.uid
          }, { merge: true });

          const enrollmentId = `${classId}_${uid}`;
          await db.collection('enrollments').doc(enrollmentId).set({
            class_id: classId,
            user_uid: uid,
            user_email: row.mail,
            created_at_iso: new Date().toISOString(),
            created_by_uid: decoded.uid
          }, { merge: true });
        }
      } catch (err) {
        failedCount += 1;
        failures.push({ mail: row.mail, reason: err.message || 'Unknown error' });
      }
    }

    return json(200, {
      ok: true,
      createdCount,
      updatedCount,
      failedCount,
      failures
    });
  } catch (err) {
    return json(401, { error: err.message || 'Unauthorized' });
  }
};
