# Schrauberbuch als APK aufs Handy bringen

Die APK baut GitHub für dich. Du brauchst nur ein kostenloses GitHub-Konto und einen Browser. Android Studio ist nicht nötig. Der erste Bau dauert etwa 8 bis 10 Minuten.

## 1. Projekt bei GitHub hochladen

1. Entpacke die ZIP-Datei auf deinem Computer.
2. Melde dich auf github.com an und lege ein neues Repository an (oben rechts "+", dann "New repository"). Name zum Beispiel `schrauberbuch`. Wähle **Private**, dann sieht niemand außer dir den Code und die APK.
3. Klicke im neuen Repository auf **"uploading an existing file"**.
4. Ziehe den **Inhalt** des entpackten Ordners in das Browserfenster (nicht den Ordner selbst). Der Ordner `.github` gehört dazu. Er ist unter macOS und Linux versteckt, anzeigen mit Cmd+Shift+Punkt (macOS) beziehungsweise Strg+H (Linux).
5. Klicke unten auf **Commit changes**.

Falls der Ordner `.github` nicht hochgeladen wurde: Klicke auf **Add file, Create new file**, tippe als Dateinamen `.github/workflows/apk.yml` ein und füge den Inhalt der Datei `workflow-apk.yml` aus dem Projekt ein. Dann **Commit changes**.

## 2. APK bauen lassen

1. Öffne im Repository den Reiter **Actions**. Der Bau startet nach dem Hochladen automatisch. Sonst: links "APK bauen", rechts "Run workflow".
2. Warte, bis vor dem Lauf ein grüner Haken steht.
3. Rot? Klicke auf den Lauf, dann auf den roten Schritt und schicke mir den Fehlertext. Ich passe das Projekt an.

## 3. Aufs Handy installieren

1. Öffne dein Repository am Handy im Browser (angemeldet), dann rechts den Bereich **Releases**.
2. Lade im neuesten Release die Datei **Schrauberbuch.apk** herunter.
3. Tippe die Datei an. Android fragt, ob dieser Quelle die Installation erlaubt sein soll (einmalig, "Unbekannte Apps installieren"). Erlauben, dann installieren.
4. Beim Start zeigt Play Protect eventuell eine Warnung, weil die App nicht aus dem Play Store kommt. "Trotzdem installieren" wählen.

## 4. Deine Daten mitnehmen

1. In der Web-Version: unten auf **Sicherung speichern** tippen.
2. Datei aufs Handy schicken (E-Mail, Cloud, Messenger).
3. In der APK unten auf **Sicherung laden** tippen und die Datei wählen.

Die Daten liegen in der APK in einer SQLite-Datenbank auf dem Handy. Sie verlassen das Gerät nicht. Mache regelmäßig eine Sicherung: Beim Deinstallieren der App wird die Datenbank gelöscht.

## 5. Updates

Änderst du Dateien im Repository (oder bekommst von mir neue), baut GitHub automatisch eine neue APK mit höherer Versionsnummer. Installiere sie einfach über die alte. Das klappt, weil die Datei `debug.keystore` im Projekt jede Version gleich signiert, und die Daten bleiben erhalten. Lösche diese Datei nicht.

## Alternative: selbst bauen mit Android Studio

Voraussetzungen: Node 22, JDK 21, Android Studio.

```
npm install
npm run build
npx cap add android
npx capacitor-assets generate --android
npx cap sync android
cp debug.keystore ~/.android/debug.keystore
cd android && ./gradlew assembleDebug
```

Die APK liegt danach in `android/app/build/outputs/apk/debug/app-debug.apk`.

## Aufbau

- `src/app.js`: die App (Oberfläche und Logik)
- `src/sql.js`: Tabellen `vehicles`, `intervals`, `specs`, `logs`, `meta`
- `src/store.js`: öffnet die SQLite-Datenbank auf dem Handy
- `capacitor.config.json`: App-Name und Paketname (`de.schrauberbuch.app`)
- `.github/workflows/apk.yml`: der Bau-Ablauf
