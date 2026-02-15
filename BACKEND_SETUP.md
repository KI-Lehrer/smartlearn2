# SmartLearn Backend Setup (Firebase)

## 1) Firebase Projekt erstellen
1. Öffne Firebase Console.
2. Erstelle ein neues Projekt.
3. Aktiviere **Firestore Database** (Production oder Test Mode).
4. Erstelle eine **Web App** und kopiere die Config-Werte.

## 2) Konfiguration in der App
Öffne `assets/config.js` und trage deine Werte ein:

```js
window.SMARTLEARN_CONFIG = {
  firebase: {
    apiKey: '...',
    authDomain: '...firebaseapp.com',
    projectId: '... ',
    storageBucket: '...appspot.com',
    messagingSenderId: '...',
    appId: '...'
  }
};
```

Wenn Felder leer bleiben, läuft die App automatisch lokal über `localStorage`.

## 3) Firestore Regeln (einfacher Start)
Für den schnellen Einstieg (ohne Login):

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /smartlearn_tasks/{document=**} {
      allow read, write: if true;
    }
  }
}
```

Wichtig: Diese Regeln sind offen und nur für Prototyping geeignet.

## 4) Datentest
1. Öffne `aufgaben.html`.
2. Speichere eine Aufgabe.
3. Prüfe in Firestore die Collection `smartlearn_tasks`.

## 5) GitHub Pages Deployment
1. Lege ein GitHub Repo an und pushe die Dateien.
2. In GitHub: `Settings -> Pages`.
3. Source: `Deploy from a branch`, Branch `main`, Folder `/ (root)`.
4. Nach wenigen Sekunden ist die App online.

## 6) Wichtiger Sicherheitshinweis
`assets/config.js` enthält öffentliche Firebase Web-Config (normal), aber keine Admin-Secrets.
Die echte Sicherheit erfolgt über Firestore-Regeln und optional Firebase Auth.

## 7) Nächster Ausbau
- Firebase Auth (Lehrpersonen-Login)
- Rollenbasierte Regeln (Lehrperson, PICTS, SuS)
- Collections: `classes`, `submissions`, `feedback_events`, `prompt_pool`
