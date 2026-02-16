# SmartLearn Setup: Netlify Functions + Firebase

## Architektur
- Frontend: GitHub Pages oder Netlify
- Auth + Daten: Firebase Auth + Firestore
- Serverlogik: Netlify Functions
  - `importStudents`
  - `generateFeedback`

## 1) Firestore-Regeln deployen
Regeln liegen in:
- `/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/firestore.rules`

Deploy:
```bash
firebase deploy --only firestore:rules
```

## 2) Netlify Functions bereitstellen
Dateien:
- `/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/netlify/functions/importStudents.js`
- `/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/netlify/functions/generateFeedback.js`
- `/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/netlify/functions/_lib.js`
- `/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/netlify.toml`

In Netlify (Site settings -> Environment variables) setzen:
- `ANTHROPIC_API_KEY` = dein Key
- `FIREBASE_SERVICE_ACCOUNT_JSON` = kompletter JSON-String des Firebase Service Accounts
- optional: `OPENAI_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_MODEL`

Hinweis für `FIREBASE_SERVICE_ACCOUNT_JSON`:
- Firebase Console -> Project settings -> Service Accounts -> Generate new private key
- JSON-Inhalt als eine Zeile in die Env-Variable kopieren

## 3) Frontend-Konfiguration
Datei:
- `/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/assets/config.js`

Wenn Frontend auf Netlify läuft:
- `functionsBaseUrl` kann leer bleiben (auto: `/.netlify/functions`)

Wenn Frontend auf GitHub Pages läuft:
```js
functionsBaseUrl: "https://DEINE-NETLIFY-SITE.netlify.app/.netlify/functions",
```

## 4) Schüler-Import (Excel)
Admin-Seite:
- `admin.html`

Format:
- `name`
- `mail`
- `passwort`

Ablauf:
1. Datei wählen (`.xlsx`, `.xls`, `.csv`)
2. Klassen-ID optional setzen
3. `Datei lesen`
4. `Import starten`

## 5) Aufgaben-Zuordnung
- Lehrperson erstellt Aufgabe mit `Klassen-ID`
- App erstellt automatisch `task_assignments`
- Schüler sehen Zuweisungen über `enrollments` + `task_assignments`
