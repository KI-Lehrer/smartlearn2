const PAGE = document.body.dataset.page;

const state = {
  role: 'student',
  tasks: [],
  studentAssignments: [],
  adminUsers: [],
  importRows: [],
  selectedPromptId: null,
  exportType: 'pdf',
  auth: {
    user: null,
    profile: null,
    message: ''
  },
  backend: {
    enabled: false,
    client: null,
    auth: null,
    label: 'Lokal (localStorage)',
    error: ''
  }
};

const promptLibrary = [
  {
    id: 'p1',
    title: 'Konstruktives Deutsch-Feedback (5. Klasse)',
    subject: 'Deutsch',
    tags: ['Feedback', 'Rechtschreibung'],
    usage: 234,
    rating: 4.8,
    text: 'Gib positives, konkretes Feedback. Nenne max. 3 Verbesserungen und markiere 1 Satz als besonders gelungen.'
  },
  {
    id: 'p2',
    title: 'Mathe-Aufgaben in 3 Niveaus',
    subject: 'Mathe',
    tags: ['Differenzierung', 'Niveau'],
    usage: 189,
    rating: 4.9,
    text: 'Erstelle Aufgaben zum Thema {{THEMA}} in Basis, Standard und Knobel. Formuliere kindgerecht für 5. Klasse.'
  },
  {
    id: 'p3',
    title: 'Dossier -> KI-Quiz Generator',
    subject: 'NMG',
    tags: ['KI-Quiz', 'Dossier'],
    usage: 156,
    rating: 4.7,
    text: 'Extrahiere Lernziele aus dem Dossier und generiere 5 MC-Fragen mit Erklärungen plus 2 Transferfragen.'
  },
  {
    id: 'p4',
    title: 'Elternfreundliche Lernzusammenfassung',
    subject: 'Überfachlich',
    tags: ['Export', 'Eltern'],
    usage: 74,
    rating: 4.6,
    text: 'Fasse Fortschritte und nächste Schritte in klarer, wertschätzender Sprache für Eltern zusammen.'
  }
];

const studentActivity = [
  { name: 'Luca K.', task: 'tz/z-Übung', read: 94, improve: 71, status: 'verbessert' },
  { name: 'Mia S.', task: 'NMG Dossier-Quiz', read: 77, improve: 44, status: 'offen' },
  { name: 'Noah T.', task: 'Satzglieder', read: 68, improve: 30, status: 'erneut bearbeiten' },
  { name: 'Lea R.', task: 'Bruchrechnen', read: 92, improve: 63, status: 'verbessert' }
];

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', href: 'index.html' },
  { id: 'aufgaben', label: 'Aufgaben', href: 'aufgaben.html' },
  { id: 'prompts', label: 'Prompt-Bibliothek', href: 'prompts.html' },
  { id: 'tracking', label: 'Tracking', href: 'tracking.html' },
  { id: 'export', label: 'Export', href: 'export.html' },
  { id: 'admin', label: 'Admin', href: 'admin.html' }
];

const ALLOWED_BY_ROLE = {
  teacher: ['dashboard', 'aufgaben', 'prompts', 'tracking', 'export'],
  student: ['dashboard', 'aufgaben', 'prompts', 'tracking'],
  picts: ['dashboard', 'prompts', 'tracking', 'export'],
  super_admin: ['dashboard', 'aufgaben', 'prompts', 'tracking', 'export', 'admin']
};

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function saveLocalTasks(tasks) {
  localStorage.setItem('smartlearn_tasks', JSON.stringify(tasks));
}

function loadLocalTasks() {
  return JSON.parse(localStorage.getItem('smartlearn_tasks') || '[]');
}

function normalizeTask(task) {
  return {
    id: task.id || crypto.randomUUID(),
    title: task.title || 'Unbenannte Aufgabe',
    subject: task.subject || 'Allgemein',
    type: task.type || 'Freitext',
    level: task.level || 'Standard',
    class_id: task.class_id || '',
    prompt: task.prompt || '',
    created_at: task.created_at || new Date().toISOString()
  };
}

function roleLabel(role) {
  if (role === 'teacher') return 'Lehrperson';
  if (role === 'student') return 'Schüler:in';
  if (role === 'picts') return 'PICTS';
  if (role === 'super_admin') return 'Super-Admin';
  return role || 'Unbekannt';
}

function getSuperAdminEmails() {
  const cfg = window.SMARTLEARN_CONFIG || {};
  const emails = Array.isArray(cfg.superAdminEmails) ? cfg.superAdminEmails : [];
  return emails.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
}

function isSuperAdminEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return !!normalized && getSuperAdminEmails().includes(normalized);
}

function getFunctionsBaseUrl() {
  const cfg = window.SMARTLEARN_CONFIG || {};
  if (cfg.functionsBaseUrl) return String(cfg.functionsBaseUrl).trim().replace(/\/$/, '');
  const host = String(window.location.hostname || '').toLowerCase();
  if (host.endsWith('netlify.app') || host === 'localhost' || host === '127.0.0.1') {
    return `${window.location.origin}/.netlify/functions`;
  }
  return '';
}

async function callCloudFunction(functionName, payload) {
  const baseUrl = getFunctionsBaseUrl();
  if (!baseUrl) throw new Error('functionsBaseUrl nicht konfiguriert (z.B. https://deine-site.netlify.app/.netlify/functions)');
  if (!state.backend.auth || !state.auth.user) throw new Error('Bitte zuerst anmelden');

  const token = await state.backend.auth.currentUser.getIdToken();
  const response = await fetch(`${baseUrl}/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload || {})
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const message = data && data.error ? data.error : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function setAuthMessage(message) {
  state.auth.message = message || '';
}

async function upsertUserProfile(uid, profile) {
  if (!state.backend.enabled || !state.backend.client) return;
  await state.backend.client.collection('smartlearn_users').doc(uid).set({
    role: profile.role || 'student',
    name: profile.name || '',
    email: profile.email || '',
    created_at_iso: profile.created_at_iso || new Date().toISOString(),
    updated_at_iso: new Date().toISOString()
  }, { merge: true });
}

async function loadUserProfile(uid) {
  if (!state.backend.enabled || !state.backend.client) return null;
  const snap = await state.backend.client.collection('smartlearn_users').doc(uid).get();
  return snap.exists ? (snap.data() || null) : null;
}

async function applyAuthUser(user) {
  state.auth.user = user || null;

  if (!user) {
    state.auth.profile = null;
    state.adminUsers = [];
    state.studentAssignments = [];
    state.role = 'student';
    await loadTasks();
    render();
    return;
  }

  let profile = await loadUserProfile(user.uid);
  if (!profile) {
    profile = {
      role: 'student',
      name: user.displayName || '',
      email: user.email || '',
      created_at_iso: new Date().toISOString()
    };
    await upsertUserProfile(user.uid, profile);
  }

  if (isSuperAdminEmail(user.email)) {
    profile.role = 'super_admin';
    await upsertUserProfile(user.uid, {
      ...profile,
      role: 'super_admin',
      email: user.email || profile.email || ''
    });
  }

  state.auth.profile = profile;
  state.role = profile.role || 'student';
  await loadTasks();
  await loadStudentAssignments();
  if (state.role === 'super_admin') {
    await loadAdminUsers();
  } else {
    state.adminUsers = [];
  }
  render();
}

async function initBackend() {
  const cfg = window.SMARTLEARN_CONFIG || {};
  const firebaseCfg = cfg.firebase || {};
  const hasConfig = firebaseCfg.apiKey && firebaseCfg.projectId && firebaseCfg.appId;
  const hasLib = !!(window.firebase && window.firebase.initializeApp);

  if (!hasConfig || !hasLib) {
    state.backend.enabled = false;
    state.backend.label = 'Lokal (localStorage)';
    return;
  }

  try {
    const app = window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(firebaseCfg);
    state.backend.client = app.firestore();
    state.backend.auth = app.auth();
    state.backend.enabled = true;
    state.backend.label = 'Firebase (Firestore + Auth)';
  } catch (error) {
    state.backend.enabled = false;
    state.backend.error = error.message || 'Firebase Initialisierung fehlgeschlagen';
    state.backend.label = 'Lokal (Firebase Fehler)';
  }
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (value.toDate) return value.toDate().toISOString();
  return new Date(value).toISOString();
}

async function loadTasks() {
  const uid = state.auth.user && state.auth.user.uid;

  if (!state.backend.enabled) {
    state.tasks = loadLocalTasks().map(normalizeTask);
    return;
  }

  if (!uid) {
    state.tasks = loadLocalTasks().map(normalizeTask);
    return;
  }

  try {
    const collection = state.backend.client.collection('smartlearn_tasks');
    const snapshot = state.role === 'super_admin'
      ? await collection.limit(300).get()
      : await collection.where('owner_uid', '==', uid).limit(300).get();

    state.tasks = snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return normalizeTask({
        ...data,
        id: doc.id,
        created_at: normalizeDate(data.created_at_iso || data.created_at)
      });
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));

    if (!state.tasks.length) {
      state.tasks = loadLocalTasks().map(normalizeTask);
    }
  } catch (error) {
    state.backend.error = error.message || 'Laden fehlgeschlagen';
    state.backend.label = 'Lokal (Firebase Offline)';
    state.tasks = loadLocalTasks().map(normalizeTask);
  }
}

async function loadStudentAssignments() {
  const uid = state.auth.user && state.auth.user.uid;
  state.studentAssignments = [];

  if (!state.backend.enabled || !uid || state.role !== 'student') return;

  try {
    const db = state.backend.client;
    const enrollmentSnap = await db
      .collection('enrollments')
      .where('user_uid', '==', uid)
      .limit(50)
      .get();

    const classIds = enrollmentSnap.docs
      .map((doc) => (doc.data() || {}).class_id)
      .filter(Boolean);

    const assignmentMap = new Map();

    const directSnap = await db
      .collection('task_assignments')
      .where('target_type', '==', 'user')
      .where('target_id', '==', uid)
      .limit(120)
      .get();

    directSnap.docs.forEach((doc) => {
      assignmentMap.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
    });

    for (const classId of classIds) {
      const classSnap = await db
        .collection('task_assignments')
        .where('target_type', '==', 'class')
        .where('target_id', '==', classId)
        .limit(120)
        .get();
      classSnap.docs.forEach((doc) => {
        assignmentMap.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
      });
    }

    state.studentAssignments = Array.from(assignmentMap.values())
      .map((item) => ({
        id: item.id,
        task_id: item.task_id || '',
        task_title: item.task_title || 'Aufgabe',
        class_id: item.class_id || '',
        target_type: item.target_type || 'class',
        created_at_iso: item.created_at_iso || ''
      }))
      .sort((a, b) => String(b.created_at_iso).localeCompare(String(a.created_at_iso)));
  } catch (error) {
    state.backend.error = error.message || 'Assignments konnten nicht geladen werden';
    state.studentAssignments = [];
  }
}

async function createTask(task) {
  const normalized = normalizeTask(task);
  const uid = state.auth.user && state.auth.user.uid;

  if (!state.backend.enabled) {
    state.tasks.unshift(normalized);
    saveLocalTasks(state.tasks);
    return;
  }

  if (!uid) {
    state.backend.error = 'Nicht angemeldet. Aufgabe lokal gespeichert.';
    state.tasks.unshift(normalized);
    saveLocalTasks(state.tasks);
    return;
  }

  try {
    const payload = {
      title: normalized.title,
      subject: normalized.subject,
      type: normalized.type,
      level: normalized.level,
      class_id: normalized.class_id || '',
      prompt: normalized.prompt,
      owner_uid: uid,
      owner_role: state.role,
      created_at_iso: normalized.created_at,
      created_at: window.firebase.firestore.FieldValue.serverTimestamp()
    };

    const ref = await state.backend.client.collection('smartlearn_tasks').add(payload);
    const snap = await ref.get();
    const data = snap.data() || payload;

    if (normalized.class_id) {
      await state.backend.client.collection('task_assignments').add({
        task_id: ref.id,
        task_title: normalized.title,
        class_id: normalized.class_id,
        target_type: 'class',
        target_id: normalized.class_id,
        assigned_by_uid: uid,
        created_at_iso: new Date().toISOString(),
        created_at: window.firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    state.tasks.unshift(normalizeTask({
      ...data,
      id: snap.id,
      created_at: normalizeDate(data.created_at_iso || data.created_at)
    }));
    saveLocalTasks(state.tasks);
  } catch (error) {
    state.backend.error = error.message || 'Speichern fehlgeschlagen';
    state.backend.label = 'Lokal (Firebase Write-Fehler)';
    state.tasks.unshift(normalized);
    saveLocalTasks(state.tasks);
  }
}

async function loadAdminUsers() {
  if (!state.backend.enabled || !state.backend.client || state.role !== 'super_admin') {
    state.adminUsers = [];
    return;
  }

  try {
    const snapshot = await state.backend.client
      .collection('smartlearn_users')
      .limit(500)
      .get();

    state.adminUsers = snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        uid: doc.id,
        email: data.email || '',
        name: data.name || '',
        role: data.role || 'student',
        updated_at_iso: data.updated_at_iso || ''
      };
    }).sort((a, b) => a.email.localeCompare(b.email));
  } catch (error) {
    state.backend.error = error.message || 'User-Liste konnte nicht geladen werden';
    state.adminUsers = [];
  }
}

async function updateUserRole(uid, role) {
  if (!state.backend.enabled || !state.backend.client || state.role !== 'super_admin') return;
  const allowed = ['student', 'teacher', 'picts', 'super_admin'];
  if (!allowed.includes(role)) return;

  await state.backend.client.collection('smartlearn_users').doc(uid).set({
    role,
    updated_at_iso: new Date().toISOString()
  }, { merge: true });

  await loadAdminUsers();

  if (state.auth.user && state.auth.user.uid === uid) {
    state.role = role;
    const profile = state.auth.profile || {};
    state.auth.profile = { ...profile, role };
    await loadTasks();
  }
}

async function deleteUserData(uid) {
  if (!state.backend.enabled || !state.backend.client || state.role !== 'super_admin') return;
  if (!uid) return;

  const db = state.backend.client;

  async function deleteByQuery(collection, field, value) {
    while (true) {
      const snap = await db
        .collection(collection)
        .where(field, '==', value)
        .limit(250)
        .get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  await deleteByQuery('smartlearn_tasks', 'owner_uid', uid);
  await deleteByQuery('enrollments', 'user_uid', uid);
  await deleteByQuery('submissions', 'student_uid', uid);
  await deleteByQuery('task_assignments', 'target_id', uid);

  await db.collection('smartlearn_users').doc(uid).delete();
  await loadAdminUsers();
  await loadTasks();
}

function renderHeader() {
  const mount = document.getElementById('app-header');
  if (!mount) return;

  const allowed = ALLOWED_BY_ROLE[state.role] || ALLOWED_BY_ROLE.student;
  const nav = NAV_ITEMS.filter(item => allowed.includes(item.id));
  const isLoggedIn = !!state.auth.user;

  mount.innerHTML = `
    <header class="topbar">
      <div class="brand-row">
        <div class="brand">
          <div class="brand-logo"><img src="assets/logo.svg" alt="SmartLearn Logo"></div>
          <div class="brand-meta">
            <div class="brand-title">SmartLearn Webapp</div>
            <div class="brand-subtitle">Mehrseiten-App · Stand 15. Februar 2026 · Backend: ${esc(state.backend.label)}</div>
          </div>
        </div>
        ${isLoggedIn ? `
          <div class="auth-badge">
            <span>${esc(state.auth.user.email || '')}</span>
            <span class="badge info">${esc(roleLabel(state.role))}</span>
            <button class="btn secondary" id="authLogoutBtn">Abmelden</button>
          </div>
        ` : `
          <div class="auth-badge">
            <span class="badge warn">Bitte anmelden</span>
          </div>
        `}
      </div>
      ${isLoggedIn ? `
        <nav class="nav-tabs">
          ${nav.map(item => `<a class="nav-link ${item.id === PAGE ? 'active' : ''}" href="${item.href}">${item.label}</a>`).join('')}
        </nav>
      ` : ''}
      ${state.auth.message ? `<p class="notice">${esc(state.auth.message)}</p>` : ''}
    </header>
  `;

  const logoutBtn = mount.querySelector('#authLogoutBtn');
  if (logoutBtn && state.backend.auth) {
    logoutBtn.addEventListener('click', async () => {
      await state.backend.auth.signOut();
      setAuthMessage('Abgemeldet.');
    });
  }

}

function renderLoginPage() {
  return `
    <article class="card">
      <h1>Anmelden</h1>
      <p class="sub">Bitte melde dich an, um SmartLearn zu nutzen.</p>
      <div class="demo-note">
        <strong>Hinweis zur Demo-Version</strong>
        <p>Diese Instanz ist ein Pilot. Inhalte, Rollen und Funktionen können sich ohne Vorankündigung ändern.</p>
        <p>Bitte keine sensiblen Personendaten eintragen. Verwende für Tests nur Demo- oder anonymisierte Daten.</p>
      </div>
      <div class="auth-panel">
        <form id="loginForm" class="auth-form">
          <strong>Login</strong>
          <input required type="email" name="email" placeholder="E-Mail">
          <input required type="password" name="password" placeholder="Passwort">
          <button class="btn primary" type="submit">Anmelden</button>
        </form>
        <form id="registerForm" class="auth-form">
          <strong>Registrieren (immer Schüler:in)</strong>
          <input required name="name" placeholder="Name">
          <input required type="email" name="email" placeholder="E-Mail">
          <input required type="password" name="password" placeholder="Passwort (min. 6 Zeichen)">
          <button class="btn secondary" type="submit">Konto erstellen</button>
        </form>
      </div>
      <p class="notice">Rollen (Lehrperson/PICTS/Super-Admin) werden durch die Admin-Seite vergeben.</p>
      <div class="actions">
        <a class="btn secondary" href="demo.html">Demo-Seite ansehen</a>
      </div>
    </article>
  `;
}

function renderDemoPage() {
  const prevRole = state.role;
  state.role = 'teacher';
  const preview = renderDashboard();
  state.role = prevRole;

  return `
    <article class="card">
      <h1>SmartLearn Demo</h1>
      <p class="sub">Öffentliche Vorschau der Oberfläche ohne Login. Daten sind beispielhaft und nicht personalisiert.</p>
      <div class="demo-note">
        <strong>Demo-Hinweis</strong>
        <p>Diese Ansicht dient nur zur Präsentation von Layout und Kernfunktionen.</p>
        <p>Für echte Nutzung und Speicherung bitte über die Login-Seite anmelden.</p>
      </div>
      <div class="actions">
        <a class="btn primary" href="index.html">Zur Anmeldung</a>
      </div>
    </article>
    <div style="margin-top:14px;">${preview}</div>
  `;
}

function bindAuthForms() {
  const loginForm = document.getElementById('loginForm');
  if (loginForm && state.backend.auth) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      try {
        await state.backend.auth.signInWithEmailAndPassword(email, password);
        setAuthMessage('Anmeldung erfolgreich.');
      } catch (error) {
        setAuthMessage(`Login fehlgeschlagen: ${error.message}`);
        render();
      }
    });
  }

  const registerForm = document.getElementById('registerForm');
  if (registerForm && state.backend.auth) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(registerForm);
      const name = String(fd.get('name') || '').trim();
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');

      try {
        const cred = await state.backend.auth.createUserWithEmailAndPassword(email, password);
        if (cred.user && name) {
          await cred.user.updateProfile({ displayName: name });
        }
        await upsertUserProfile(cred.user.uid, {
          name,
          email,
          role: 'student',
          created_at_iso: new Date().toISOString()
        });
        setAuthMessage('Registrierung erfolgreich. Du bist jetzt angemeldet.');
      } catch (error) {
        setAuthMessage(`Registrierung fehlgeschlagen: ${error.message}`);
        render();
      }
    });
  }
}

function renderDashboard() {
  const titleByRole = {
    teacher: 'Lehrer-Dashboard',
    student: 'Mein Dashboard',
    picts: 'PICTS-Dashboard'
  };

  const descByRole = {
    teacher: 'Überblick über Aufgaben, KI-Nutzung, Feedback-Qualität und Differenzierung.',
    student: 'Deine aktuellen Aufgaben, KI-Feedback und nächste Lernschritte.',
    picts: 'Schulweite Nutzung von SmartLearn, Prompt-Adoption und Unterstützungsbedarf.'
  };

  const taskCount = state.tasks.length + 12;
  const completion = state.role === 'student' ? 63 : 78;
  const promptUse = state.role === 'picts' ? 438 : 126;
  const feedbackRead = state.role === 'student' ? 88 : 74;

  return `
    <div class="grid kpi">
      <article class="card"><div class="kpi-label">Aktive Aufgaben</div><div class="kpi-value">${taskCount}</div><div class="kpi-delta ok">+4 diese Woche</div></article>
      <article class="card"><div class="kpi-label">Abschlussquote</div><div class="kpi-value">${completion}%</div><div class="kpi-delta ok">stabil steigend</div></article>
      <article class="card"><div class="kpi-label">Prompt-Nutzungen</div><div class="kpi-value">${promptUse}</div><div class="kpi-delta warn">Top-Prompt: Deutsch-Feedback</div></article>
      <article class="card"><div class="kpi-label">Feedback gelesen</div><div class="kpi-value">${feedbackRead}%</div><div class="kpi-delta ok">+6% ggü. Vormonat</div></article>
    </div>

    <div class="grid cols-2" style="margin-top:14px;">
      <article class="card">
        <h2>${titleByRole[state.role]}</h2>
        <p class="sub">${descByRole[state.role]}</p>
        <div class="list">
          <div class="item"><div class="item-head"><strong>Heute priorisieren</strong><span class="badge warn">Wichtig</span></div><div class="mono">2 Schüler:innen haben Feedback gelesen, aber noch keine Verbesserung eingereicht.</div></div>
          <div class="item"><div class="item-head"><strong>Dossier -> Quiz</strong><span class="badge info">KI-Feature</span></div><div class="mono">Neues NMG-Dossier erkannt. 8 Fragen automatisch generierbar.</div></div>
          <div class="item"><div class="item-head"><strong>Differenzierung</strong><span class="badge ok">Automatisch</span></div><div class="mono">Vorschlag: 4 Aufgaben auf Niveau Basis vereinfachen, 3 auf Niveau Plus erweitern.</div></div>
        </div>
      </article>

      <article class="card">
        <h2>Status aus Klasse 5a</h2>
        <p class="sub">Live-Sicht auf Lernaktivität und Wirkung von KI-Feedback.</p>
        <table class="table">
          <thead><tr><th>Schüler:in</th><th>Aufgabe</th><th>Lesen</th><th>Status</th></tr></thead>
          <tbody>
            ${studentActivity.map(s => `
              <tr>
                <td>${esc(s.name)}</td>
                <td>${esc(s.task)}</td>
                <td>${s.read}%</td>
                <td><span class="badge ${s.status === 'verbessert' ? 'ok' : s.status === 'offen' ? 'warn' : 'danger'}">${esc(s.status)}</span></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <p class="notice">Backend-Status: ${esc(state.backend.label)}${state.backend.error ? ` · ${esc(state.backend.error)}` : ''}</p>
      </article>
    </div>
  `;
}

function renderAufgaben() {
  if (state.role === 'picts') {
    return `
      <article class="card">
        <h1>Aufgaben-Erstellung</h1>
        <p class="sub">Im PICTS-Modus liegt der Fokus auf Governance, Prompt-Qualität und Adoption. Wechsle auf Rolle "Lehrperson" für die direkte Aufgabenerstellung.</p>
      </article>
    `;
  }

  if (state.role === 'student') {
    return `
      <div class="grid cols-2">
        <article class="card">
          <h2>Aufgabe lösen</h2>
          <p class="sub">Deine zugewiesenen Aufgaben aus Klassen-Zuordnungen und direkter Zuweisung.</p>
          <label>Aufgabe</label>
          <select id="studentTask">
            ${renderStudentAssignmentOptions()}
          </select>
          <label style="margin-top:10px;">Deine Antwort</label>
          <textarea id="studentAnswer" placeholder="Schreibe hier deine Lösung..."></textarea>
          <div class="actions">
            <button class="btn primary" id="getFeedbackBtn">KI-Feedback erhalten</button>
            <button class="btn secondary" id="saveSubmissionBtn">Abgabe speichern</button>
          </div>
          <div id="feedbackBox" class="item hidden" style="margin-top:10px;"></div>
        </article>

        <article class="card">
          <h2>Selbstkontrolle</h2>
          <p class="sub">Direkte Lernhilfe vor der Wiederabgabe.</p>
          <div class="list">
            <div class="item"><strong>Was schon gut ist</strong><div class="mono">Deine Satzstruktur ist klar und nachvollziehbar.</div></div>
            <div class="item"><strong>Nächster Schritt</strong><div class="mono">Prüfe tz/z bei "schätzen", "setzen", "Platz".</div></div>
            <div class="item"><strong>Mini-Übung</strong><div class="mono">Ersetze 3 Wörter mit ähnlicher Bedeutung und achte auf korrekte Rechtschreibung.</div></div>
          </div>
        </article>
      </div>
    `;
  }

  return `
    <div class="grid cols-2">
      <article class="card">
        <h2>Neue Aufgabe erstellen</h2>
        <p class="sub">Freitext, Bild-Upload, Multiple-Choice, KI-Quiz aus Dossier. Direkt einer Klasse zuordnen.</p>
        <form id="taskForm" class="form-grid">
          <div>
            <label>Titel</label>
            <input required name="title" placeholder="z.B. Musikgeschichte: Blues" />
          </div>
          <div>
            <label>Fach</label>
            <select name="subject">
              <option>Deutsch</option>
              <option>Mathe</option>
              <option>NMG</option>
              <option>Musik</option>
            </select>
          </div>
          <div>
            <label>Aufgabentyp</label>
            <select name="type">
              <option>Freitext</option>
              <option>Bild-Upload</option>
              <option>Multiple-Choice</option>
              <option>KI-Quiz (Dossier)</option>
            </select>
          </div>
          <div>
            <label>Niveau</label>
            <select name="level">
              <option>Basis</option>
              <option>Standard</option>
              <option>Plus</option>
            </select>
          </div>
          <div>
            <label>Klassen-ID (für Zuordnung)</label>
            <input name="class_id" placeholder="z.B. 5A-2026" />
          </div>
          <div class="full">
            <label>Prompt pro Aufgabe (optional)</label>
            <select name="prompt">
              <option value="">Kein Prompt</option>
              ${promptLibrary.map(p => `<option value="${esc(p.title)}">${esc(p.title)}</option>`).join('')}
            </select>
          </div>
          <div class="full">
            <label>Aufgabenbeschreibung</label>
            <textarea name="desc" placeholder="Beschreibe die Aufgabe. Bei KI-Quiz kannst du Dossier-Inhalte referenzieren."></textarea>
          </div>
          <div class="full actions">
            <button class="btn primary" type="submit">Aufgabe speichern</button>
            <button class="btn secondary" type="button" id="taskTemplateBtn">KI-Vorschlag</button>
          </div>
        </form>
      </article>

      <article class="card">
        <h2>Erstellte Aufgaben</h2>
        <p class="sub">Lokal und optional aus Firebase geladen.</p>
        <div class="list" id="taskList">
          ${renderTaskItems()}
        </div>
      </article>
    </div>
  `;
}

function renderTaskItems() {
  if (!state.tasks.length) {
    return '<div class="item"><div class="mono">Noch keine Aufgaben gespeichert.</div></div>';
  }

  return state.tasks.slice(0, 12).map(t => `
    <div class="item">
      <div class="item-head">
        <strong>${esc(t.title)}</strong>
        <span class="badge info">${esc(t.type)}</span>
      </div>
      <div class="mono">Fach: ${esc(t.subject)} · Niveau: ${esc(t.level)} · Klasse: ${esc(t.class_id || '-')} · Prompt: ${esc(t.prompt || 'kein Prompt')}</div>
    </div>
  `).join('');
}

function renderStudentAssignmentOptions() {
  if (!state.studentAssignments.length) {
    return '<option value="">Keine zugewiesenen Aufgaben</option>';
  }

  return state.studentAssignments.map((assignment) => {
    const label = assignment.class_id
      ? `${assignment.task_title} (Klasse ${assignment.class_id})`
      : assignment.task_title;
    return `<option value="${esc(assignment.task_id || assignment.id)}">${esc(label)}</option>`;
  }).join('');
}

function renderImportPreviewMarkup() {
  if (!state.importRows.length) {
    return '<p class="notice">Noch keine Importdatei eingelesen.</p>';
  }

  return `
    <table class="table">
      <thead><tr><th>Name</th><th>E-Mail</th><th>Passwort</th></tr></thead>
      <tbody>
        ${state.importRows.slice(0, 20).map((row) => `
          <tr>
            <td>${esc(row.name || '')}</td>
            <td>${esc(row.mail || '')}</td>
            <td>${esc(String(row.passwort || '') ? '***' : '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderPrompts() {
  const poolTitle = state.role === 'picts' ? 'Schulhaus-Prompt-Pool' : 'Prompt-Bibliothek';
  const desc = state.role === 'picts'
    ? 'Kuratiere offizielle Schulhaus-Prompts und teile wirksame Vorlagen mit dem Kollegium.'
    : 'Wiederverwendbare KI-Prompts für Feedback, Differenzierung und Aufgabenerstellung.';

  return `
    <div class="grid cols-2">
      <article class="card">
        <h2>${poolTitle}</h2>
        <p class="sub">${desc}</p>
        <div class="list">
          ${promptLibrary.map(p => `
            <div class="item">
              <div class="item-head"><strong>${esc(p.title)}</strong><span class="badge info">${esc(p.subject)}</span></div>
              <div class="prompt-tags">${p.tags.map(t => `<span class="badge warn">${esc(t)}</span>`).join('')}</div>
              <div class="mono">${esc(p.text)}</div>
              <div class="item-head" style="margin-top:8px;">
                <span class="mono">${p.usage} Nutzungen · Rating ${p.rating}</span>
                <button class="btn secondary use-prompt" data-prompt-id="${p.id}">Nutzen</button>
              </div>
            </div>
          `).join('')}
        </div>
      </article>

      <article class="card">
        <h2>Ausgewählter Prompt</h2>
        <p class="sub">Direkte Übernahme in Aufgaben und Feedback-Prozesse.</p>
        <div class="item" id="selectedPromptBox"><div class="mono">Noch kein Prompt gewählt.</div></div>
        <div class="actions"><button class="btn primary" id="copyPromptBtn">In Zwischenablage kopieren</button></div>
      </article>
    </div>
  `;
}

function renderTracking() {
  const adoption = state.role === 'picts';

  return `
    <div class="grid kpi">
      <article class="card"><div class="kpi-label">Abgaben diese Woche</div><div class="kpi-value">47</div><div class="kpi-delta ok">+12%</div></article>
      <article class="card"><div class="kpi-label">Ø Bearbeitungszeit</div><div class="kpi-value">12.3m</div><div class="kpi-delta ok">-2m</div></article>
      <article class="card"><div class="kpi-label">Feedback gelesen</div><div class="kpi-value">78%</div><div class="kpi-delta ok">+5%</div></article>
      <article class="card"><div class="kpi-label">${adoption ? 'Klassen aktiv' : 'Verbessert nach Feedback'}</div><div class="kpi-value">${adoption ? '9/12' : '42%'}</div><div class="kpi-delta ${adoption ? 'warn' : 'ok'}">${adoption ? '3 Klassen brauchen Support' : '+8%'}</div></article>
    </div>

    <div class="grid cols-2" style="margin-top:14px;">
      <article class="card">
        <h2>${adoption ? 'Schulweite Adoption' : 'Lernfortschritt pro Schüler:in'}</h2>
        <p class="sub">${adoption ? 'PICTS-Sicht auf Nutzung und Support-Bedarf.' : 'Wer liest Feedback und verbessert danach?'}</p>
        <div class="list">
          ${studentActivity.map(s => `
            <div class="item">
              <div class="item-head"><strong>${esc(s.name)}</strong><span class="badge info">${esc(s.task)}</span></div>
              <div class="mono">Feedback gelesen: ${s.read}%</div>
              <div class="meter"><span style="width:${s.read}%;"></span></div>
              <div class="mono" style="margin-top:6px;">Verbesserungsquote: ${s.improve}%</div>
            </div>
          `).join('')}
        </div>
      </article>

      <article class="card">
        <h2>Interpretation</h2>
        <p class="sub">Automatische Hinweise für nächste Unterrichtsschritte.</p>
        <div class="list">
          <div class="item"><strong>Cluster A: Schnell + präzise</strong><div class="mono">6 SuS erledigen Aufgaben mit hoher Qualität. Vorschlag: Plus-Niveau aktivieren.</div></div>
          <div class="item"><strong>Cluster B: Lesen ohne Umsetzung</strong><div class="mono">4 SuS lesen Feedback, verbessern aber wenig. Vorschlag: Mini-Checkliste vor Wiederabgabe.</div></div>
          <div class="item"><strong>Cluster C: Niedrige Aktivität</strong><div class="mono">3 SuS mit geringer Abgabequote. Vorschlag: kurze Aufgaben + mündlicher Einstieg.</div></div>
        </div>
      </article>
    </div>
  `;
}

function renderExport() {
  if (state.role === 'student') {
    return '<article class="card"><h1>Export gesperrt</h1><p class="sub">Der Export-Bereich ist für Lehrpersonen und PICTS vorgesehen.</p></article>';
  }

  return `
    <div class="grid cols-2">
      <article class="card">
        <h2>Export-Center</h2>
        <p class="sub">PDF, CSV, LearningView-Transfer, JSON/API.</p>

        <label>Export-Format</label>
        <select id="exportType">
          <option value="pdf" ${state.exportType === 'pdf' ? 'selected' : ''}>PDF-Bericht</option>
          <option value="csv" ${state.exportType === 'csv' ? 'selected' : ''}>Excel / CSV</option>
          <option value="lv" ${state.exportType === 'lv' ? 'selected' : ''}>LearningView-Transfer</option>
          <option value="json" ${state.exportType === 'json' ? 'selected' : ''}>JSON / API</option>
        </select>

        <div class="list" style="margin-top:12px;">
          <div class="item"><label><input type="checkbox" checked> Aufgabenstellungen (LP21)</label></div>
          <div class="item"><label><input type="checkbox" checked> Schüler-Abgaben</label></div>
          <div class="item"><label><input type="checkbox" checked> KI-Feedback</label></div>
          <div class="item"><label><input type="checkbox"> Tracking-Statistiken</label></div>
        </div>

        <div class="actions"><button class="btn primary" id="exportRun">Export starten</button></div>
      </article>

      <article class="card">
        <h2>Vorschau</h2>
        <p class="sub">Formatabhängige Beispieldaten.</p>
        <pre class="export" id="exportPreview"></pre>
      </article>
    </div>
  `;
}

function renderAdmin() {
  if (state.role !== 'super_admin') {
    return '<article class="card"><h1>Zugriff gesperrt</h1><p class="sub">Nur Super-Admin kann diese Seite öffnen.</p></article>';
  }

  return `
    <div class="grid cols-2">
      <article class="card">
        <h2>Benutzerverwaltung</h2>
        <p class="sub">Alle neuen Registrierungen sind Schüler:innen. Rollenänderung nur hier als Super-Admin.</p>
        <div class="actions">
          <button class="btn secondary" id="adminRefreshUsers">Liste neu laden</button>
        </div>
      </article>
      <article class="card">
        <h2>Zusammenfassung</h2>
        <p class="sub">Nutzer gesamt: ${state.adminUsers.length}</p>
        <div class="list">
          <div class="item"><strong>Schüler:innen</strong><div class="mono">${state.adminUsers.filter(u => u.role === 'student').length}</div></div>
          <div class="item"><strong>Lehrpersonen</strong><div class="mono">${state.adminUsers.filter(u => u.role === 'teacher').length}</div></div>
          <div class="item"><strong>PICTS</strong><div class="mono">${state.adminUsers.filter(u => u.role === 'picts').length}</div></div>
          <div class="item"><strong>Super-Admin</strong><div class="mono">${state.adminUsers.filter(u => u.role === 'super_admin').length}</div></div>
        </div>
      </article>
    </div>

    <article class="card" style="margin-top:14px;">
      <h2>Schüler-Import (Excel)</h2>
      <p class="sub">Spalten: <span class="mono">name, mail, passwort</span>. Optional Klassen-ID setzen für automatische Zuordnung.</p>
      <div class="form-grid">
        <div class="full">
          <label>Datei (.xlsx, .xls, .csv)</label>
          <input id="studentImportFile" type="file" accept=".xlsx,.xls,.csv" />
        </div>
        <div>
          <label>Klassen-ID</label>
          <input id="studentImportClassId" placeholder=\"z.B. 5A-2026\" />
        </div>
        <div>
          <label>Vorschau</label>
          <div class="mono" id="studentImportCount">${state.importRows.length} Zeilen geladen</div>
        </div>
        <div class="full actions">
          <button class="btn secondary" type="button" id="previewImportBtn">Datei lesen</button>
          <button class="btn primary" type="button" id="runImportBtn">Import starten</button>
        </div>
      </div>
      <p class="notice" id="importStatus">Bereit für Import.</p>
      <div id="importPreviewTable">
        ${renderImportPreviewMarkup()}
      </div>
    </article>

    <article class="card" style="margin-top:14px;">
      <h2>Rollen setzen</h2>
      <p class="sub">Rolle pro Account anpassen. Eigene Super-Admin-Rolle kannst du hier auch ändern.</p>
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>E-Mail</th>
            <th>UID</th>
            <th>Rolle</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          ${state.adminUsers.map((user) => `
            <tr>
              <td>${esc(user.name || '-')}</td>
              <td>${esc(user.email || '-')}</td>
              <td class="mono">${esc(user.uid)}</td>
              <td>
                <select class="admin-role-select" data-uid="${esc(user.uid)}">
                  <option value="student" ${user.role === 'student' ? 'selected' : ''}>Schüler:in</option>
                  <option value="teacher" ${user.role === 'teacher' ? 'selected' : ''}>Lehrperson</option>
                  <option value="picts" ${user.role === 'picts' ? 'selected' : ''}>PICTS</option>
                  <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super-Admin</option>
                </select>
              </td>
              <td>
                <button class="btn secondary admin-delete-user" data-uid="${esc(user.uid)}" data-email="${esc(user.email || '')}">
                  Löschen
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="notice">Hinweis: Diese Aktion löscht smartlearn_users, smartlearn_tasks, enrollments, submissions und direkte task_assignments des Users. Den Auth-Account selbst löschst du in Firebase Authentication.</p>
    </article>
  `;
}

async function readImportRowsFromFile(file) {
  if (!file) return [];
  const lowerName = String(file.name || '').toLowerCase();
  const isCsv = lowerName.endsWith('.csv');

  if (isCsv) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const rows = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] || '';
      });
      rows.push(row);
    }

    return rows.map((row) => ({
      name: String(row.name || '').trim(),
      mail: String(row.mail || row.email || '').trim().toLowerCase(),
      passwort: String(row.passwort || row.password || '').trim()
    })).filter((row) => row.name && row.mail && row.passwort);
  }

  await ensureXlsxLibrary();
  if (!window.XLSX) throw new Error('XLSX-Library konnte nicht geladen werden');

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });

  return rows.map((row) => {
    const normalized = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      const k = String(key || '').trim().toLowerCase();
      normalized[k] = value;
    });

    return {
      name: String(normalized.name || '').trim(),
      mail: String(normalized.mail || normalized.email || '').trim().toLowerCase(),
      passwort: String(normalized.passwort || normalized.password || '').trim()
    };
  }).filter((row) => row.name && row.mail && row.passwort);
}

async function ensureXlsxLibrary() {
  if (window.XLSX) return;

  const urls = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
  ];

  for (const url of urls) {
    await new Promise((resolve) => {
      const existing = document.querySelector(`script[data-xlsx-src="${url}"]`);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', resolve, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.dataset.xlsxSrc = url;
      script.onload = resolve;
      script.onerror = resolve;
      document.head.appendChild(script);
    });

    if (window.XLSX) return;
  }
}

async function runStudentImport() {
  if (state.role !== 'super_admin') throw new Error('Nur Super-Admin kann importieren');
  if (!state.importRows.length) throw new Error('Keine Importzeilen vorhanden');

  const classId = String((document.getElementById('studentImportClassId') || {}).value || '').trim();
  const payload = {
    classId,
    students: state.importRows
  };

  const result = await callCloudFunction('importStudents', payload);
  await loadAdminUsers();
  return result;
}

function bindPageEvents() {
  if (PAGE === 'aufgaben') {
    const form = document.getElementById('taskForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        await createTask({
          title: fd.get('title') || 'Unbenannte Aufgabe',
          subject: fd.get('subject') || 'Allgemein',
          type: fd.get('type') || 'Freitext',
          level: fd.get('level') || 'Standard',
          class_id: String(fd.get('class_id') || '').trim(),
          prompt: fd.get('prompt') || ''
        });
        document.getElementById('taskList').innerHTML = renderTaskItems();
        form.reset();
      });

      const templateBtn = document.getElementById('taskTemplateBtn');
      if (templateBtn) {
        templateBtn.addEventListener('click', () => {
          const desc = form.querySelector('textarea[name="desc"]');
          desc.value = 'Erstelle zuerst 3 Leitfragen zum Thema, dann eine Transferfrage. Gib Kriterien für gute Lösungen in kindgerechter Sprache aus.';
        });
      }
    }

    const feedbackBtn = document.getElementById('getFeedbackBtn');
    if (feedbackBtn) {
      feedbackBtn.addEventListener('click', async () => {
        const text = document.getElementById('studentAnswer').value.trim();
        const taskId = document.getElementById('studentTask').value;
        const box = document.getElementById('feedbackBox');
        box.classList.remove('hidden');
        if (!text) {
          box.innerHTML = '<strong>Hinweis</strong><div class="mono">Bitte gib zuerst eine Antwort ein, damit die KI Feedback erzeugen kann.</div>';
          return;
        }
        try {
          const result = await callCloudFunction('generateFeedback', {
            taskId,
            answerText: text,
            role: state.role
          });
          box.innerHTML = `<strong>KI-Feedback</strong><div class="mono">${esc(result.feedback || 'Kein Feedback erhalten.')}</div>`;
        } catch (error) {
          box.innerHTML = `<strong>KI-Feedback (Fallback)</strong><div class="mono">Stark: klare Antwortstruktur. Verbesserung: Achte auf Rechtschreibung und ergänze ein konkretes Beispiel.<br><br>Cloud-Funktion: ${esc(error.message)}</div>`;
        }
      });
    }

    const saveSubmissionBtn = document.getElementById('saveSubmissionBtn');
    if (saveSubmissionBtn) {
      saveSubmissionBtn.addEventListener('click', async () => {
        if (!state.backend.enabled || !state.auth.user) return;
        const answerText = String(document.getElementById('studentAnswer').value || '').trim();
        const taskId = String(document.getElementById('studentTask').value || '').trim();
        if (!answerText || !taskId) return;

        const assignment = state.studentAssignments.find((a) => (a.task_id || a.id) === taskId);
        const submission = {
          task_id: taskId,
          assignment_id: assignment ? assignment.id : '',
          student_uid: state.auth.user.uid,
          answer_text: answerText,
          created_at_iso: new Date().toISOString(),
          created_at: window.firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
          await state.backend.client.collection('submissions').add(submission);
          setAuthMessage('Abgabe gespeichert.');
          renderHeader();
        } catch (error) {
          setAuthMessage(`Abgabe konnte nicht gespeichert werden: ${error.message}`);
          renderHeader();
        }
      });
    }
  }

  if (PAGE === 'prompts') {
    document.querySelectorAll('.use-prompt').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedPromptId = btn.dataset.promptId;
        updateSelectedPromptBox();
      });
    });

    const copyBtn = document.getElementById('copyPromptBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const selected = promptLibrary.find(p => p.id === state.selectedPromptId);
        if (!selected) return;
        try {
          await navigator.clipboard.writeText(selected.text);
          alert('Prompt kopiert.');
        } catch {
          alert('Kopieren im Browser blockiert.');
        }
      });
    }

    updateSelectedPromptBox();
  }

  if (PAGE === 'export') {
    const typeSelect = document.getElementById('exportType');
    const preview = document.getElementById('exportPreview');
    const runBtn = document.getElementById('exportRun');

    if (typeSelect && preview) {
      const updatePreview = () => {
        state.exportType = typeSelect.value;
        if (state.exportType === 'pdf') {
          preview.textContent = 'SmartLearn Klassenbericht\nKurs: Deutsch 5a\nZeitraum: 01.01.-14.02.2026\nSuS: 20\n\nAbgaben: 156\nFeedback-Lesequote: 78%\nVerbesserungsrate: 42%';
        } else if (state.exportType === 'csv') {
          preview.textContent = 'name,abgaben,feedback_gelesen,verbessert\nAnna M.,12,0.86,0.67\nBen K.,10,0.75,0.40';
        } else if (state.exportType === 'lv') {
          preview.textContent = 'LV_IMPORT\ncourse=Deutsch 5a\nassignment=tz-z Uebung\nprompt=Konstruktives Deutsch-Feedback';
        } else {
          preview.textContent = JSON.stringify({
            course: 'Deutsch 5a',
            week: '2026-W07',
            metrics: { submissions: 47, feedbackRead: 0.78, improved: 0.42 }
          }, null, 2);
        }
      };

      typeSelect.addEventListener('change', updatePreview);
      updatePreview();
    }

    if (runBtn) {
      runBtn.addEventListener('click', () => {
        const filename = `smartlearn-export-${state.exportType}.${state.exportType === 'csv' ? 'csv' : state.exportType === 'json' ? 'json' : 'txt'}`;
        const content = (document.getElementById('exportPreview') || { textContent: '' }).textContent;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  if (PAGE === 'admin') {
    const importStatusEl = document.getElementById('importStatus');
    const importPreviewTableEl = document.getElementById('importPreviewTable');
    const importCountEl = document.getElementById('studentImportCount');

    const refreshBtn = document.getElementById('adminRefreshUsers');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await loadAdminUsers();
        renderPage();
      });
    }

    document.querySelectorAll('.admin-role-select').forEach((select) => {
      select.addEventListener('change', async () => {
        const uid = select.dataset.uid;
        const role = select.value;
        try {
          await updateUserRole(uid, role);
          setAuthMessage(`Rolle für ${uid} auf ${roleLabel(role)} gesetzt.`);
        } catch (error) {
          setAuthMessage(`Rollenwechsel fehlgeschlagen: ${error.message}`);
        }
        render();
      });
    });

    document.querySelectorAll('.admin-delete-user').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const uid = btn.dataset.uid;
        const email = btn.dataset.email || uid;
        if (state.auth.user && uid === state.auth.user.uid) {
          setAuthMessage('Eigenes Super-Admin-Profil kann hier nicht gelöscht werden.');
          render();
          return;
        }

        const ok = window.confirm(`User-Daten löschen für ${email}?\\n\\nDies entfernt Profil und alle Aufgaben dieses Users.`);
        if (!ok) return;

        try {
          await deleteUserData(uid);
          setAuthMessage(`User-Daten gelöscht: ${email}`);
        } catch (error) {
          setAuthMessage(`Löschen fehlgeschlagen: ${error.message}`);
        }
        render();
      });
    });

    const previewImportBtn = document.getElementById('previewImportBtn');
    if (previewImportBtn) {
      previewImportBtn.addEventListener('click', async () => {
        const fileInput = document.getElementById('studentImportFile');
        const file = fileInput && fileInput.files && fileInput.files[0];
        if (importStatusEl) importStatusEl.textContent = 'Datei wird gelesen...';
        try {
          state.importRows = await readImportRowsFromFile(file);
          const msg = `Import-Vorschau geladen: ${state.importRows.length} gültige Zeilen.`;
          setAuthMessage(msg);
          if (importStatusEl) importStatusEl.textContent = msg;
        } catch (error) {
          const msg = `Import-Datei konnte nicht gelesen werden: ${error.message}`;
          setAuthMessage(msg);
          if (importStatusEl) importStatusEl.textContent = msg;
          state.importRows = [];
        }
        if (importCountEl) importCountEl.textContent = `${state.importRows.length} Zeilen geladen`;
        if (importPreviewTableEl) importPreviewTableEl.innerHTML = renderImportPreviewMarkup();
        renderHeader();
      });
    }

    const runImportBtn = document.getElementById('runImportBtn');
    if (runImportBtn) {
      runImportBtn.addEventListener('click', async () => {
        if (importStatusEl) importStatusEl.textContent = 'Import läuft...';
        try {
          const result = await runStudentImport();
          const created = Number(result.createdCount || 0);
          const updated = Number(result.updatedCount || 0);
          const failed = Number(result.failedCount || 0);
          const msg = `Import abgeschlossen. Neu: ${created}, Aktualisiert: ${updated}, Fehler: ${failed}.`;
          setAuthMessage(msg);
          if (importStatusEl) importStatusEl.textContent = msg;
          state.importRows = [];
        } catch (error) {
          const msg = `Import fehlgeschlagen: ${error.message}`;
          setAuthMessage(msg);
          if (importStatusEl) importStatusEl.textContent = msg;
        }
        if (importCountEl) importCountEl.textContent = `${state.importRows.length} Zeilen geladen`;
        if (importPreviewTableEl) importPreviewTableEl.innerHTML = renderImportPreviewMarkup();
        renderHeader();
      });
    }
  }
}

function updateSelectedPromptBox() {
  const box = document.getElementById('selectedPromptBox');
  if (!box) return;

  const selected = promptLibrary.find(p => p.id === state.selectedPromptId);
  if (!selected) {
    box.innerHTML = '<div class="mono">Noch kein Prompt gewählt.</div>';
    return;
  }

  box.innerHTML = `
    <strong>${esc(selected.title)}</strong>
    <div class="prompt-tags">${selected.tags.map(t => `<span class="badge info">${esc(t)}</span>`).join('')}</div>
    <div class="mono">${esc(selected.text)}</div>
  `;
}

function renderPage() {
  const root = document.getElementById('page-root');
  if (!root) return;

  if (PAGE !== 'demo' && state.backend.enabled && !state.auth.user) {
    root.innerHTML = renderLoginPage();
    bindAuthForms();
    return;
  }

  let html = '';
  if (PAGE === 'demo') html = renderDemoPage();
  if (PAGE === 'dashboard') html = renderDashboard();
  if (PAGE === 'aufgaben') html = renderAufgaben();
  if (PAGE === 'prompts') html = renderPrompts();
  if (PAGE === 'tracking') html = renderTracking();
  if (PAGE === 'export') html = renderExport();
  if (PAGE === 'admin') html = renderAdmin();

  root.innerHTML = html;
  bindPageEvents();
}

function guardPageByRole() {
  if (PAGE === 'demo') return;
  const allowed = ALLOWED_BY_ROLE[state.role] || ALLOWED_BY_ROLE.student;
  if (!allowed.includes(PAGE)) {
    location.href = 'index.html';
  }
}

function render() {
  guardPageByRole();
  renderHeader();
  renderPage();
}

async function initAuthListener() {
  if (!state.backend.auth) return false;

  try {
    await state.backend.auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION);
  } catch (error) {
    state.backend.error = error.message || 'Auth-Persistenz konnte nicht gesetzt werden';
  }

  await new Promise((resolve) => {
    let firstEvent = true;
    state.backend.auth.onAuthStateChanged(async (user) => {
      await applyAuthUser(user);
      if (firstEvent) {
        firstEvent = false;
        resolve();
      }
    });
  });

  return true;
}

(async function init() {
  await initBackend();
  const hasAuth = await initAuthListener();
  if (!hasAuth) {
    await loadTasks();
    render();
  }
})();
