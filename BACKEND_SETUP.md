# SmartLearn Backend Setup (Firebase + Auth + Super-Admin)

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

Alle E-Mails in `superAdminEmails` werden beim Login automatisch als Rolle `super_admin` gesetzt.

## 3) Firestore-Regeln mit Super-Admin

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

    function isSuperAdmin() {
      return isSignedIn() &&
        get(/databases/$(database)/documents/smartlearn_users/$(request.auth.uid)).data.role == "super_admin";
    }

    match /smartlearn_users/{userId} {
      allow create: if isSelf(userId);
      allow read: if isSelf(userId) || isSuperAdmin();
      allow update: if isSelf(userId) || isSuperAdmin();
      allow delete: if isSuperAdmin();
    }

    match /smartlearn_tasks/{taskId} {
      allow create: if isSignedIn() &&
        (request.resource.data.owner_uid == request.auth.uid || isSuperAdmin());

      allow read, update, delete: if isSignedIn() &&
        (resource.data.owner_uid == request.auth.uid || isSuperAdmin());
    }
  }
}
```

## 4) Rückgängig bei falschem Schüler-Login
1. In der App auf `Abmelden` klicken.
2. Firebase Console -> Authentication -> Users:
   - falschen Schüler-User löschen (optional)
3. Firestore -> `smartlearn_users`:
   - Dokument des falschen Users löschen oder `role` anpassen.

## 5) Super-Admin nutzen
1. Eigene E-Mail in `superAdminEmails` eintragen.
2. Änderungen deployen (git push).
3. Ab- und wieder anmelden.
4. In Firestore `smartlearn_users/<deine_uid>.role` wird auf `super_admin` gesetzt.
5. Als Super-Admin siehst du alle Tasks.
