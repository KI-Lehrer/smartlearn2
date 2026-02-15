const PAGE = document.body.dataset.page;

const state = {
  role: localStorage.getItem('smartlearn_role') || 'teacher',
  tasks: [],
  selectedPromptId: null,
  exportType: 'pdf',
  backend: {
    enabled: false,
    client: null,
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
  { id: 'export', label: 'Export', href: 'export.html' }
];

const ALLOWED_BY_ROLE = {
  teacher: ['dashboard', 'aufgaben', 'prompts', 'tracking', 'export'],
  student: ['dashboard', 'aufgaben', 'prompts', 'tracking'],
  picts: ['dashboard', 'prompts', 'tracking', 'export']
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
    prompt: task.prompt || '',
    created_at: task.created_at || new Date().toISOString()
  };
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
    state.backend.enabled = true;
    state.backend.label = 'Firebase Firestore';
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
  if (!state.backend.enabled) {
    state.tasks = loadLocalTasks().map(normalizeTask);
    return;
  }

  try {
    const snapshot = await state.backend.client
      .collection('smartlearn_tasks')
      .orderBy('created_at_iso', 'desc')
      .limit(150)
      .get();

    state.tasks = snapshot.docs.map((doc) => {
      const data = doc.data() || {};
      return normalizeTask({
        ...data,
        id: doc.id,
        created_at: normalizeDate(data.created_at_iso || data.created_at)
      });
    });

    if (!state.tasks.length) {
      state.tasks = loadLocalTasks().map(normalizeTask);
    }
  } catch (error) {
    state.backend.error = error.message || 'Laden fehlgeschlagen';
    state.backend.label = 'Lokal (Firebase Offline)';
    state.tasks = loadLocalTasks().map(normalizeTask);
  }
}

async function createTask(task) {
  const normalized = normalizeTask(task);

  if (!state.backend.enabled) {
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
      prompt: normalized.prompt,
      created_at_iso: normalized.created_at,
      created_at: window.firebase.firestore.FieldValue.serverTimestamp()
    };

    const ref = await state.backend.client.collection('smartlearn_tasks').add(payload);
    const snap = await ref.get();
    const data = snap.data() || payload;

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

function renderHeader() {
  const mount = document.getElementById('app-header');
  if (!mount) return;

  const allowed = ALLOWED_BY_ROLE[state.role] || ALLOWED_BY_ROLE.teacher;
  const nav = NAV_ITEMS.filter(item => allowed.includes(item.id));

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
        <div class="role-switch">
          <button class="role-btn ${state.role === 'teacher' ? 'active' : ''}" data-role="teacher">Lehrperson</button>
          <button class="role-btn ${state.role === 'student' ? 'active' : ''}" data-role="student">Schüler:in</button>
          <button class="role-btn ${state.role === 'picts' ? 'active' : ''}" data-role="picts">PICTS</button>
        </div>
      </div>
      <nav class="nav-tabs">
        ${nav.map(item => `<a class="nav-link ${item.id === PAGE ? 'active' : ''}" href="${item.href}">${item.label}</a>`).join('')}
      </nav>
    </header>
  `;

  mount.querySelectorAll('.role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.role = btn.dataset.role;
      localStorage.setItem('smartlearn_role', state.role);
      render();
    });
  });
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
          <p class="sub">Beispiel aus Wireframe: Aufgabe bearbeiten und KI-Feedback erhalten.</p>
          <label>Aufgabe</label>
          <select id="studentTask">
            <option>tz/z-Übung (Quiz)</option>
            <option>NMG Dossier-Quiz</option>
            <option>Freitext: Erlebnisbericht</option>
          </select>
          <label style="margin-top:10px;">Deine Antwort</label>
          <textarea id="studentAnswer" placeholder="Schreibe hier deine Lösung..."></textarea>
          <div class="actions"><button class="btn primary" id="getFeedbackBtn">KI-Feedback erhalten</button></div>
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
        <p class="sub">Freitext, Bild-Upload, Multiple-Choice, KI-Quiz aus Dossier.</p>
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
      <div class="mono">Fach: ${esc(t.subject)} · Niveau: ${esc(t.level)} · Prompt: ${esc(t.prompt || 'kein Prompt')}</div>
    </div>
  `).join('');
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
      feedbackBtn.addEventListener('click', () => {
        const text = document.getElementById('studentAnswer').value.trim();
        const box = document.getElementById('feedbackBox');
        box.classList.remove('hidden');
        box.innerHTML = text
          ? '<strong>KI-Feedback</strong><div class="mono">Stark: klare Antwortstruktur. Verbesserung: Achte auf 2 Rechtschreibstellen und ergänze ein Beispiel aus dem Dossier.</div>'
          : '<strong>Hinweis</strong><div class="mono">Bitte gib zuerst eine Antwort ein, damit die KI Feedback erzeugen kann.</div>';
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

  let html = '';
  if (PAGE === 'dashboard') html = renderDashboard();
  if (PAGE === 'aufgaben') html = renderAufgaben();
  if (PAGE === 'prompts') html = renderPrompts();
  if (PAGE === 'tracking') html = renderTracking();
  if (PAGE === 'export') html = renderExport();

  root.innerHTML = html;
  bindPageEvents();
}

function guardPageByRole() {
  const allowed = ALLOWED_BY_ROLE[state.role] || ALLOWED_BY_ROLE.teacher;
  if (!allowed.includes(PAGE)) {
    location.href = 'index.html';
  }
}

function render() {
  guardPageByRole();
  renderHeader();
  renderPage();
}

(async function init() {
  await initBackend();
  await loadTasks();
  render();
})();
