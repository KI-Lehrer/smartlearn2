const admin = require('firebase-admin');

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders()
    },
    body: JSON.stringify(payload)
  };
}

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON missing');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON invalid JSON');
  }
}

function initAdmin() {
  if (!admin.apps.length) {
    const serviceAccount = getServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  return admin;
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

async function verifyRequest(event) {
  const sdk = initAdmin();
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) throw new Error('Missing bearer token');
  return sdk.auth().verifyIdToken(token);
}

async function getUserRole(uid) {
  const sdk = initAdmin();
  const snap = await sdk.firestore().collection('smartlearn_users').doc(uid).get();
  if (!snap.exists) return '';
  const data = snap.data() || {};
  return data.role || '';
}

module.exports = {
  admin,
  corsHeaders,
  json,
  initAdmin,
  parseBody,
  verifyRequest,
  getUserRole
};
