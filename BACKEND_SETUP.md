# SmartLearn Backend Setup (Firebase + Auth)

## 1) Firebase Projekt
1. Firebase Console öffnen und Projekt wählen.
2. **Firestore Database** aktivieren.
3. **Authentication** aktivieren -> Sign-in method -> **Email/Password** einschalten.
4. In Projekteinstellungen unter "Ihre Apps" die Web-App-Config kopieren.

## 2) Konfiguration in der App
Datei: `/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/assets/config.js`

```js
window.SMARTLEARN_CONFIG = {
  firebase: {
    apiKey: '...',
    authDomain: '...firebaseapp.com',
    projectId: '...',
    storageBucket: '...firebasestorage.app',
    messagingSenderId: '...',
    appId: '...'
  }
};
```

## 3) Firestore Regeln (mit Login)

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /smartlearn_users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /smartlearn_tasks/{taskId} {
      allow create: if request.auth != null
        && request.resource.data.owner_uid == request.auth.uid;

      allow read, update, delete: if request.auth != null
        && resource.data.owner_uid == request.auth.uid;
    }
  }
}
```

## 4) Test
1. App öffnen: `aufgaben.html`
2. Oben im Header registrieren (Rolle: Schüler:in / Lehrperson / PICTS)
3. Danach Aufgabe speichern
4. In Firestore prüfen:
   - `smartlearn_users/<uid>` vorhanden
   - `smartlearn_tasks` mit `owner_uid`

## 5) GitHub Pages
Wenn das Repo öffentlich ist: Settings -> Pages -> Deploy from branch -> main /root.

## 6) Hinweis
Ohne Anmeldung läuft die App lokal über `localStorage` weiter. Cloud-Speicherung nutzt sie nur bei eingeloggten Accounts.
