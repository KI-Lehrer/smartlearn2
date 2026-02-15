# SmartLearn Setup: Schema, Import, KI (Schritt 1-4)

## 1) Firestore Schema + Regeln
Die App nutzt diese Collections:
- `smartlearn_users` (Profil + Rolle)
- `classes` (Klassen)
- `enrollments` (Zuordnung Schüler -> Klasse)
- `smartlearn_tasks` (Aufgaben)
- `task_assignments` (Aufgaben-Zuordnung an Klasse/User)
- `submissions` (Schülerabgaben)
- `ai_feedback_events` (KI-Feedback-Logs)

Regeln liegen in:
- `/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/firestore.rules`

Deploy der Regeln:
```bash
firebase deploy --only firestore:rules
```

## 2) Admin Upload (Excel)
Admin-Seite:
- `/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/admin.html`

Importformat (erste Tabelle):
- `name`
- `mail`
- `passwort`

Ablauf:
1. Datei wählen (`.xlsx`, `.xls`, `.csv`)
2. Klassen-ID setzen (optional)
3. `Datei lesen`
4. `Import starten`

## 3) Cloud Function: Bulk User Import
Function:
- `importStudents`
- Datei: `/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/functions/index.js`

Was passiert:
- nur `super_admin` darf importieren
- erstellt/aktualisiert Firebase Auth User
- legt `smartlearn_users` mit Rolle `student` an
- legt optional `classes` + `enrollments` an

Deploy:
```bash
cd "/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/functions"
npm install
cd ..
firebase deploy --only functions
```

## 4) Cloud Function: KI Feedback
Function:
- `generateFeedback`

Nutzt OpenAI wenn gesetzt, sonst Fallback-Text.

OpenAI Key setzen (Functions Env):
```bash
firebase functions:config:set openai.key="YOUR_OPENAI_API_KEY"
```

Hinweis: In `functions/index.js` wird aktuell `process.env.OPENAI_API_KEY` verwendet. Setze alternativ beim Deploy als Umgebungsvariable oder passe auf `functions.config().openai.key` an.

## Frontend-Konfiguration
Datei:
- `/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/assets/config.js`

Wichtige Felder:
```js
window.SMARTLEARN_CONFIG = {
  superAdminEmails: ["luescher.sascha@gmail.com"],
  functionsBaseUrl: "", // optional, sonst auto: https://us-central1-<project>.cloudfunctions.net
  firebase: {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  }
};
```
