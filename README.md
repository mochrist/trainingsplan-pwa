# Trainingsplan

Private Trainingsplan- und Workout-Tracker-App fürs iPhone als Progressive Web App.
Läuft vollständig offline, alle Daten bleiben lokal auf dem Gerät (IndexedDB). Kein Backend, kein Login.

Die verbindliche Spezifikation steht in [`plan.md`](plan.md).

## Technik

- Vanilla JavaScript (ES Modules), HTML, CSS – kein Framework, kein Build-Schritt, keine Abhängigkeiten
- IndexedDB über einen kleinen eigenen Wrapper (`js/db.js`), darüber ein In-Memory-Cache (`js/store.js`)
- Reine Logik ohne DOM in `js/lib/`, getestet mit dem eingebauten Test-Runner von Node
- Service Worker (`sw.js`) mit Precache aller App-Dateien

```
js/
├── app.js            Bootstrap, Hash-Router, Service-Worker-Updates
├── nav.js            navigate()
├── db.js             IndexedDB: Schema, Lesen, atomares Schreiben
├── store.js          Cache, Schreibfunktionen, Seed, Backup-Status
├── lib/              normalize, workout, history, pr, stats, numbers, time, backup, migrate, html
├── components/       exercise-picker, workout-editor, rest-timer, chart, sheet, toast, icons, backup-actions
└── views/            today, workout, calendar, session-detail, plans, progress, settings
tools/
├── make-icons.mjs    App-Icons erzeugen
└── update-precache.mjs  PRECACHE-Liste in sw.js neu schreiben
```

## Lokal starten

Ein beliebiger statischer Server genügt, z. B.:

```sh
python -m http.server 8000
# oder
npx serve .
```

Dann `http://localhost:8000` öffnen. Service Worker funktionieren auf `localhost` auch ohne HTTPS.

## Tests

```sh
npm test        # = node --test (Node 20 oder neuer)
```

Getestet werden alle Module in `js/lib/` sowie die Vollständigkeit der Precache-Liste.

## Änderungen ausliefern

Bei jeder Änderung an App-Dateien:

1. Neue Dateien in die Precache-Liste aufnehmen: `node tools/update-precache.mjs`
2. `APP_VERSION` in `sw.js` erhöhen – sonst bekommt das iPhone die neue Version nicht
3. `npm test`
4. Committen und pushen

Bei Änderungen am Datenmodell zusätzlich `DATA_VERSION` in `js/lib/migrate.js` erhöhen und einen
Migrationsschritt mit Test ergänzen (siehe `plan.md`, Abschnitt 2.1).

## Deployment (GitHub Pages)

1. Repository auf GitHub anlegen (darf öffentlich sein, es liegen keine Nutzerdaten im Repo) und pushen:
   ```sh
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
2. Im Repository unter **Settings → Pages** „Deploy from a branch“ wählen, Branch `main`, Ordner `/ (root)`.
3. Nach ein bis zwei Minuten ist die App unter `https://<user>.github.io/<repo>/` erreichbar.
   Alle Pfade sind relativ, die App läuft deshalb auch im Unterordner.

## Auf dem iPhone installieren

1. Die GitHub-Pages-Adresse in **Safari** öffnen.
2. Teilen → **Zum Home-Bildschirm**.
3. Ab jetzt nur noch die installierte App verwenden: Sie hat einen eigenen Speicher, getrennt vom Safari-Tab.
   Daten zwischen beiden lassen sich nur per Backup und Import übertragen.

Updates: Nach einem neuen Deployment zeigt die App „Neue Version verfügbar“. Auf iOS greift ein Update
manchmal erst, nachdem die App einmal ganz geschlossen und neu geöffnet wurde.

## Datensicherung

Die Daten liegen ausschließlich auf dem Gerät. Unter **Einstellungen → Backup** lässt sich eine JSON-Datei
exportieren (iOS: „In Dateien sichern“) und wieder importieren. Die App erinnert an ein Backup, wenn es
ungesicherte Änderungen gibt und der letzte Export länger als das eingestellte Intervall zurückliegt.
