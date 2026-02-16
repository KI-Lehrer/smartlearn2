const functions = require('firebase-functions');
const admin = require('firebase-admin');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

admin.initializeApp();

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function verifyRequest(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) throw new Error('Missing bearer token');
  return admin.auth().verifyIdToken(token);
}

async function getUserRole(uid) {
  const snap = await admin.firestore().collection('smartlearn_users').doc(uid).get();
  if (!snap.exists) return '';
  const data = snap.data() || {};
  return data.role || '';
}

function normalizeStudentRow(row) {
  return {
    name: String(row.name || '').trim(),
    mail: String(row.mail || '').trim().toLowerCase(),
    passwort: String(row.passwort || '').trim()
  };
}

exports.importStudents = functions.https.onRequest(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const decoded = await verifyRequest(req);
    const role = await getUserRole(decoded.uid);
    if (role !== 'super_admin') {
      return res.status(403).json({ error: 'Only super_admin can import students' });
    }

    const students = Array.isArray(req.body && req.body.students) ? req.body.students : [];
    const classId = String((req.body && req.body.classId) || '').trim();

    if (!students.length) {
      return res.status(400).json({ error: 'No students provided' });
    }

    const db = admin.firestore();
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
          userRecord = await admin.auth().createUser({
            email: row.mail,
            password: row.passwort,
            displayName: row.name
          });
          createdCount += 1;
        } catch (createErr) {
          if (createErr && createErr.code === 'auth/email-already-exists') {
            userRecord = await admin.auth().getUserByEmail(row.mail);
            await admin.auth().updateUser(userRecord.uid, {
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

    return res.status(200).json({
      ok: true,
      createdCount,
      updatedCount,
      failedCount,
      failures
    });
  } catch (err) {
    return res.status(401).json({ error: err.message || 'Unauthorized' });
  }
});

exports.generateFeedback = functions.https.onRequest(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const decoded = await verifyRequest(req);
    const answerText = String((req.body && req.body.answerText) || '').trim();
    const taskId = String((req.body && req.body.taskId) || '').trim();

    if (!answerText) {
      return res.status(400).json({ error: 'answerText is required' });
    }

    let feedback = 'Gute Grundlage. Verbessere die Genauigkeit bei Fachbegriffen und ergänze ein konkretes Beispiel.';
    let source = 'fallback';

    const anthropicKeyCfg = functions.config && functions.config().anthropic && functions.config().anthropic.key;
    const anthropicKey = process.env.ANTHROPIC_API_KEY || anthropicKeyCfg;
    const openaiKeyCfg = functions.config && functions.config().openai && functions.config().openai.key;
    const openaiKey = process.env.OPENAI_API_KEY || openaiKeyCfg;

    if (anthropicKey) {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const message = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 220,
        temperature: 0.2,
        system: 'Du gibst kurzes, konstruktives Feedback für Schülerinnen und Schüler der Primarstufe. Maximal 80 Wörter.',
        messages: [
          {
            role: 'user',
            content: `Aufgaben-ID: ${taskId || '-'}\nAntwort:\n${answerText}`
          }
        ]
      });
      const text = Array.isArray(message.content)
        ? message.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim()
        : '';
      if (text) {
        feedback = text;
        source = 'anthropic';
      }
    } else if (openaiKey) {
      const client = new OpenAI({ apiKey: openaiKey });
      const completion = await client.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: 'Du gibst kurzes, konstruktives Feedback für Schülerinnen und Schüler der Primarstufe. Maximal 80 Wörter.'
          },
          {
            role: 'user',
            content: `Aufgaben-ID: ${taskId || '-'}\nAntwort:\n${answerText}`
          }
        ]
      });
      const text = (completion.output_text || '').trim();
      if (text) {
        feedback = text;
        source = 'openai';
      }
    }

    await admin.firestore().collection('ai_feedback_events').add({
      uid: decoded.uid,
      task_id: taskId,
      answer_text: answerText,
      feedback,
      created_at_iso: new Date().toISOString(),
      source
    });

    return res.status(200).json({ ok: true, feedback });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Feedback generation failed' });
  }
});
