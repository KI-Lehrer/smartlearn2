# SmartLearn Backend Setup (Firebase + Auth + Rollensteuerung)

## 1) Firebase aktivieren
1. Firestore Database aktivieren.
2. Authentication -> Sign-in method -> Email/Password aktivieren.

## 2) App-Konfiguration
Datei:
`/Users/saschaluscher/Library/CloudStorage/OneDrive-Persönlich/1-Meine Ablage/1-Projekte als PICTS/SmartLearn Kopie/Planung und Dokumente/assets/config.js`

```js
window.SMARTLEARN_CONFIG = {
  superAdminEmails: [
    "deine-admin-email@beispiel.ch"
  ],
  firebase: {
    apiKey: "...",
    authDomain: "...firebaseapp.com",
    projectId: "...",
    storageBucket: "...firebasestorage.app",
    messagingSenderId: "...",
    appId: "..."
  }
};
```

Hinweis:
- Selbstregistrierung ist in der App immer Rolle `student`.
- Rollenwechsel erfolgt ausschließlich auf `admin.html` durch Super-Admin.

## 3) Firestore-Regeln (Rolle nur durch Super-Admin änderbar)

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function isSelf(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }

    function myRole() {
      return get(/databases/$(database)/documents/smartlearn_users/$(request.auth.uid)).data.role;
    }

    function isSuperAdmin() {
      return isSignedIn() && myRole() == "super_admin";
    }

    match /smartlearn_users/{userId} {
      // Erstes eigenes Profil darf nur als student erstellt werden.
      allow create: if isSelf(userId)
        && request.resource.data.role == "student";

      allow read: if isSelf(userId) || isSuperAdmin();

      // User darf eigenes Profil aktualisieren, aber Rolle nicht verändern.
      allow update: if (isSelf(userId)
          && request.resource.data.role == resource.data.role)
        || isSuperAdmin();

      allow delete: if isSuperAdmin();
    }

    match /smartlearn_tasks/{taskId} {
      allow create: if isSignedIn()
        && (request.resource.data.owner_uid == request.auth.uid || isSuperAdmin());

      allow read, update, delete: if isSignedIn()
        && (resource.data.owner_uid == request.auth.uid || isSuperAdmin());
    }
  }
}
```

## 4) Versehentliche Schüler-Anmeldung rückgängig
1. In der App auf `Abmelden`.
2. Firebase -> Authentication -> Users: falschen Account löschen (optional).
3. Firestore -> `smartlearn_users`: Profil löschen oder auf gewünschte Rolle setzen (als Super-Admin).

## 5) Super-Admin aktivieren
1. Eigene E-Mail in `superAdminEmails` eintragen.
2. Deployen (`git push`).
3. Ab- und wieder anmelden.
4. Danach erscheint `Admin` im Menü (`admin.html`).
5. Dort Rollen für andere Nutzer setzen.

## 6) User löschen (Admin-Seite)
- Auf `admin.html` kann Super-Admin einen User löschen.
- Dabei löscht die App:
  - `smartlearn_users/<uid>`
  - alle `smartlearn_tasks` mit `owner_uid == uid`
- Der Firebase-Auth-Account selbst bleibt bestehen und kann in Firebase Console unter `Authentication -> Users` gelöscht werden.
