# Trainingsplan-PWA – Umsetzungsplan

## 1. Ziel

Private Trainingsplan- und Workout-Tracker-App fürs iPhone als Progressive Web App (PWA).

- Läuft **vollständig offline**, alle Daten bleiben lokal auf dem Gerät (IndexedDB).
- Eine Person als Nutzer, kein Login, kein Backend, keine Konten.
- Nutzungskontext: ca. 4 Trainings pro Woche à ca. 40 Minuten, Push/Pull-Aufteilung. Bedient wird die App im Gym, meist einhändig und zwischen den Sätzen. Deshalb gilt: wenige Taps, große Touch-Flächen, schnelle Eingabe.

## 2. Rahmenbedingungen

- **Technik:** Vanilla JavaScript (ES Modules), HTML, CSS. Kein Framework, kein Build-Schritt, keine Runtime-Abhängigkeiten.
- **Speicher:** IndexedDB über einen eigenen kleinen Promise-Wrapper (`js/db.js`, keine Bibliothek).
- **Diagramme:** eigenes SVG-Rendering, keine Chart-Bibliothek.
- **Hosting:** GitHub Pages (HTTPS ist für Service Worker nötig). Das Repo darf öffentlich sein, weil keine Nutzerdaten im Repo liegen. Alle Pfade sind **relativ**, weil die App unter `/<repo-name>/` läuft.
- **Zielplattform:** aktuelles iOS, Safari und installierte PWA (Zum Home-Bildschirm).
- **Sprache:** UI komplett Deutsch, Code und Bezeichner Englisch.
- **Design:** dunkles Theme, Touch-Ziele mindestens 44×44 px, Safe-Area-Insets beachten.
- **Zahlen und Zeit:** Anzeige im deutschen Format. Eingabe von Gewichten akzeptiert Komma und Punkt (`inputmode="decimal"`). Zeitstempel werden als Epoch-Millisekunden gespeichert, Kalendertage in lokaler Zeit.
- **Routing:** Hash-Routing (`#/today`, `#/calendar`, `#/plans`, `#/progress`, `#/settings`, `#/workout`, `#/session/<id>`). GitHub Pages kennt keine Rewrites, und der Service Worker muss so nur `index.html` ausliefern.
- **IDs:** einheitlich `crypto.randomUUID()` (Strings) für alle Datensätze, auch für Übungseinträge und Sätze innerhalb eines Workouts.
- **Tests:** minimales `package.json` (`{"type":"module","scripts":{"test":"node --test"}}`), ohne Abhängigkeiten.

### 2.1 Architektur

- **Schichten:** `db.js` (IndexedDB-Zugriff) → `store.js` (Cache, Schreibfunktionen, Events) → Views/Komponenten. Views greifen nie direkt auf `db.js` zu. `js/lib/` enthält reine Funktionen ohne DOM und ohne IndexedDB.
- **In-Memory-Cache:** `store.js` lädt beim Start alle Stores einmal in den Speicher (bei ca. 200 Trainings pro Jahr unkritisch). Lesezugriffe gehen auf den Cache. Schreibzugriffe aktualisieren erst IndexedDB und dann den Cache und lösen danach ein Änderungs-Event aus (`subscribe(fn)`). PR, „Letzte Werte", Diagramm-Metriken und das Ranking der Autovervollständigung rechnen die `lib`-Funktionen aus den Arrays im Cache. Es gibt deshalb keine zusätzlichen Indizes und keine denormalisierten Felder.
- **Rendern:** Jede View hat `render()` mit Template-Strings und Event-Delegation am View-Root. Ausnahme ist die Satzzeile: Eingabefelder werden während der Eingabe nicht neu gerendert, weil sonst Fokus und Tastatur verloren gehen. Haken, PR-Icon und Ähnliches werden gezielt aktualisiert.
- **Speichern des aktiven Workouts:** Texteingaben werden mit Debounce (~300 ms) gespeichert. Sofort gespeichert wird beim Abhaken und beim Hinzufügen oder Entfernen von Sätzen und Übungen. Bei `visibilitychange` (hidden) und `pagehide` wird ein ausstehender Debounce sofort ausgeführt, weil iOS PWAs im Hintergrund ohne Vorwarnung beendet.
- **IndexedDB-Regeln (`db.js`):** Innerhalb einer Transaktion werden nur IDB-Requests abgewartet, keine anderen Promises. Safari committet die Transaktion sonst automatisch. Daten für den Import werden deshalb **vor** dem Öffnen der Transaktion validiert und migriert. `onversionchange` schließt die DB und zeigt einen Reload-Hinweis. `onblocked` wird behandelt.
- **Versionierung und Migrationen:** Eine Konstante `DATA_VERSION` in `js/lib/migrate.js` mit der reinen Funktion `migrate(data, fromVersion)`. `onupgradeneeded` legt nur Stores und Indizes an oder ändert sie. Datenmigrationen nutzen dieselben reinen Funktionen wie der Import alter Backups, damit beides dieselbe getestete Logik verwendet.

## 3. Feature-Überblick

**Kern**
- Übungsbibliothek mit Autovervollständigung
- Trainings aus Templates **und** als Freitext-Training, beide spontan anpassbar
- Sätze loggen mit Gewicht und Wiederholungen, dazu die letzten Werte der Übung
- Pausentimer und Gesamtdauer-Counter
- Offline-Betrieb und JSON-Backup

**Zusatz**
- Dauerhafte Übungsnotizen und Satznotizen
- Aufwärmsätze markieren
- Optionales RPE pro Satz
- PR-Erkennung als kompaktes Icon
- Monatskalender mit allen absolvierten Sessions
- Training nachträglich bearbeiten
- Körpergewicht-Tracking
- Diagramm-Baukasten (selbst gebaute, gespeicherte Diagramme)
- Backup-Erinnerung

## 4. Navigation

Untere Tab-Leiste mit fünf Tabs:

1. **Heute:** Training starten, laufendes Training fortsetzen, Körpergewicht eintragen, Backup-Hinweis
2. **Kalender:** Monatsansicht aller Sessions
3. **Pläne:** Templates und Übungsbibliothek
4. **Fortschritt:** Diagramm-Baukasten
5. **Einstellungen:** Timer, Schrittweite, RPE, Backup

Das aktive Workout ist eine Vollbild-Ansicht über den Tabs.

## 5. Datenmodell (IndexedDB)

Datenbankname `trainingsplan`, Version = `DATA_VERSION` (siehe 2.1).

```
exercises   { id, name, nameNorm, note, archived, createdAt }
            Index: nameNorm (unique)
templates   { id, name, items: [{ id, exerciseId, plannedSets }], createdAt, updatedAt }
workouts    { id, name, templateId|null, status: 'active'|'finished',
              startedAt, endedAt|null, updatedAt,
              items: [{ id, exerciseId, sets: [Set] }] }
            Index: startedAt, status
Set         { id, type: 'work'|'warmup', weight|null, reps|null, rpe|null,
              note, done, doneAt|null }
bodyweights { date: 'YYYY-MM-DD' (keyPath), kg }
charts      { id, title,
              source: { kind: 'exercise'|'bodyweight'|'duration', exerciseId? },
              metric, range: '4w'|'3m'|'6m'|'1y'|'all', chartType: 'line'|'bar', order }
kv          { key, value }
            'settings'  → { restSeconds: 90, weightStep: 2.5, rpeEnabled: false,
                            backupReminderDays: 14 }                   (wird exportiert)
            'backup'    → { lastExportAt|null, lastChangeAt|null, snoozedUntil|null }
            'restTimer' → { endAt|null }
            'seeded'    → true
```

Regeln:
- `nameNorm` = Name in Kleinbuchstaben, ohne Akzente/Diakritika, getrimmt, mehrfache Leerzeichen zusammengefasst.
- Dauer eines Trainings = `endedAt - startedAt`.
- Im `kv`-Store wird nur `settings` exportiert und importiert. `backup`, `restTimer` und `seeded` sind gerätelokal.
- Jede Schreiboperation auf Nutzerdaten setzt `kv.backup.lastChangeAt = Date.now()`, und zwar zentral im Schreib-Wrapper von `store.js` in derselben Transaktion. „Ungesicherte Änderungen" heißt `lastChangeAt > (lastExportAt ?? 0)`.
- Ein Workout referenziert Übungen über `exerciseId`. Übungen, die in einem Workout, einem Template oder einem Diagramm vorkommen, werden nie hart gelöscht, sondern nur archiviert.
- Dieselbe Übung kommt pro Workout und pro Template höchstens einmal vor. Der `exercise-picker` blendet bereits enthaltene Übungen aus.
- Es gibt höchstens ein Workout mit `status: 'active'`. Das setzt `store.startWorkout()` durch.
- **Abgeschlossene Workouts enthalten nur Sätze mit `done: true`** (siehe 6.3 und 6.12).
- **Zahlen:** Gewicht und kg werden beim Speichern auf 2 Nachkommastellen gerundet. Die ±-Schritte werden in Hundertstel-Ganzzahlen gerechnet, damit keine Fließkommafehler entstehen. `weight = 0` gilt als ausgefüllt (Körpergewichtsübungen), nur `null` gilt als leer.
- **Erststart:** Starterübungen (6.1) und Standard-Diagramme (6.14) werden nur angelegt, wenn `kv.seeded` fehlt. Danach wird `seeded` gesetzt, auch nach einem Import.

## 6. Spezifikation der Features

### 6.1 Übungsbibliothek und Autovervollständigung
- Jede neu eingetippte Übung wird in `exercises` angelegt und steht danach überall zur Verfügung.
- Komponente `exercise-picker`: Eingabefeld mit Vorschlagsliste direkt darunter (max. 6 Treffer).
- Matching auf `nameNorm`: Teilstring-Suche. Ranking: Anfang des Namens, dann Wortanfang, dann irgendwo enthalten. Bei Gleichstand zählen Nutzungshäufigkeit und Aktualität.
- Beispiel: Wer „hi" tippt, bekommt „High Row" vorgeschlagen. „row" findet ebenfalls „High Row".
- Gibt es keinen exakten Treffer (nach Normalisierung), erscheint zusätzlich der Eintrag „„<Eingabe>" neu anlegen". Dubletten wie „High Row" und „high row" werden verhindert.
- Archivierte Übungen werden nicht vorgeschlagen. Wird ein Name eingegeben, dessen `nameNorm` zu einer archivierten Übung gehört, wird diese wieder aktiviert statt neu angelegt.
- Eine kleine Starterliste wird beim ersten Start angelegt: Bankdrücken (Langhantel), Schrägbankdrücken (Kurzhantel), Schulterdrücken (Kurzhantel), Seitheben (Kurzhantel), Butterfly (Maschine), Trizepsdrücken (Kabel), Latzug, High Row, Rudern am Kabel (sitzend), Face Pulls, Bizeps-Curls (SZ-Stange), Reverse Butterfly.
- Verwaltung im Tab „Pläne": suchen, umbenennen (Name bleibt eindeutig, eine Kollision wird auch mit archivierten Übungen geprüft und mit klarer Meldung abgelehnt), Notiz bearbeiten, archivieren. Löschen ist nur erlaubt, wenn die Übung in keinem Workout, Template oder Diagramm vorkommt.

### 6.2 Templates
- Ein Template hat einen Namen und eine geordnete Übungsliste. Pro Übung gibt es `plannedSets` (Default 3).
- Anlegen, umbenennen, duplizieren, löschen. Übungen hinzufügen über den `exercise-picker`, entfernen, Reihenfolge per Hoch/Runter-Buttons ändern.
- Ein gestartetes Template-Training erzeugt ein Workout mit den Übungen und der geplanten Anzahl leerer Sätze. Das Training lässt sich spontan ändern (Übung hinzufügen oder entfernen, Sätze hinzufügen oder entfernen). Das verändert **nicht** das Template.

### 6.3 Workout-Ablauf
- Start auf „Heute": ein Button je Template plus „Freitext-Training".
- **Freitext-Training:** startet leer mit dem Namen „Training". Der Name lässt sich im Workout-Kopf ändern. „Übung hinzufügen" öffnet den `exercise-picker` (siehe 6.1). Gewählte Übungen zeigen wie üblich die letzten Werte.
- Ein Satz hat: Satznummer oder Warm-up-Marker, Gewicht (±-Buttons in `weightStep` plus Direkteingabe), Wiederholungen, optional RPE, Haken „erledigt", Notiz-Icon, PR-Icon.
- Der Haken ist nur aktiv, wenn Gewicht und Wiederholungen ausgefüllt sind (Gewicht 0 zählt als ausgefüllt). Beim Abhaken startet der Pausentimer.
- „Satz hinzufügen" je Übung. Sätze sind per Swipe oder Menü löschbar.
- Das aktive Workout wird laufend in IndexedDB gespeichert (Debounce und Sofort-Speichern siehe 2.1). Nach App-Neustart oder Absturz zeigt „Heute" ein Banner „Training fortsetzen".
- **Beenden:** setzt `endedAt` und `status: 'finished'`. Nicht abgehakte, aber ausgefüllte Sätze werden als erledigt übernommen (`doneAt = endedAt`). Leere Sätze werden verworfen, ebenso Übungen ohne Sätze. Hat ein Training keinen erledigten Satz, fragt die App, ob es verworfen werden soll. Danach folgt eine kurze Zusammenfassung (Dauer, Anzahl Sätze, Volumen, PRs).

### 6.4 Letzte Werte
- Pro Übung wird die letzte abgeschlossene Session gesucht, die diese Übung mit mindestens einem Arbeitssatz enthält (unabhängig vom Template). Dabei wird das aktuelle Workout ausgeschlossen.
- Anzeige als Zeile über den Sätzen, z. B. „Letztes Mal (Do., 22.10.): 40×10 · 40×9 · 40×8", bei vorhandenem RPE ergänzt.
- Die Werte der Satznummer n stehen zusätzlich als Platzhalter (grau) in den Eingabefeldern von Satz n. Es wird nichts automatisch übernommen.
- Nur Arbeitssätze zählen, Aufwärmsätze nicht.

### 6.5 Aufwärmsätze
- Jeder Satz hat einen Typ-Schalter (Arbeitssatz oder Aufwärmsatz), erreichbar über Tap auf die Satznummer. Aufwärmsätze werden als „W" und optisch gedämpft dargestellt.
- Aufwärmsätze zählen **nicht** für Volumen, Maximalgewicht, 1RM, PR-Erkennung, „Letzte Werte" und Diagramme.

### 6.6 RPE (optional)
- In den Einstellungen ein- und ausschaltbar (Default: aus).
- Wenn aktiv, hat jeder Satz ein RPE-Feld mit Werten von 6 bis 10 in 0,5er-Schritten, jederzeit leerbar.
- Gespeicherte RPE-Werte bleiben auch bei ausgeschaltetem Schalter erhalten, werden dann aber nur nicht angezeigt.

### 6.7 Notizen
- **Dauerhafte Übungsnotiz** (`exercises.note`): z. B. Sitzhöhe, Griffbreite, Gerät. Sie erscheint in jedem Workout bei der Übung als aufklappbare Zeile (Icon am Übungsnamen, gefüllt, wenn eine Notiz existiert) und ist dort direkt bearbeitbar.
- **Satznotiz** (`Set.note`): einmalig für diesen Satz, über ein kleines Icon an der Satzzeile.

### 6.8 Pausentimer
- Startet automatisch beim Abhaken eines Satzes, Default `restSeconds` (90 s), einstellbar.
- Feste Leiste am unteren Rand mit der Restzeit, Buttons ±15 s und „Überspringen".
- Der Timer arbeitet mit einem **Ziel-Zeitstempel** (`endAt`), nicht mit `setInterval`-Zählung, damit er nach App-Wechsel oder Sperrbildschirm korrekt bleibt. `endAt` liegt in `kv.restTimer`, damit der Timer auch ein Beenden der App übersteht.
- Bei 0: Signalton (Web Audio, der Audio-Kontext wird beim ersten Tap im Workout entsperrt) und deutlich sichtbares Blinken. Vibration gibt es auf iOS-Safari nicht.
- Der Bildschirm bleibt im Workout per Wake Lock an. Er wird bei `visibilitychange` neu angefordert. Fehlt die Unterstützung, wird das still ignoriert.

### 6.9 Gesamtdauer
- Kopfzeile im Workout zeigt die laufende Dauer (`mm:ss`, ab einer Stunde `h:mm:ss`), berechnet aus `startedAt`.
- Die Dauer ist die Grundlage für die Datenquelle „Trainingsdauer" in den Diagrammen.

### 6.10 PR-Erkennung (kompaktes Icon)
- Ein kleines Pokal- oder Medaillen-Icon neben dem Satz, der einen persönlichen Rekord darstellt. Keine eigene Liste oder Ansicht.
- Ein Arbeitssatz ist ein PR, wenn
  - sein Gewicht über dem bisherigen Maximalgewicht der Übung liegt **oder**
  - sein geschätztes 1RM nach Epley (`weight × (1 + reps / 30)`, bei 1 Wiederholung = Gewicht) über dem bisherigen Maximum liegt.
- Es gibt keine PRs beim allerersten Training einer Übung (kein Vergleichswert).
- Pro Übung und Training wird höchstens **ein** Satz markiert, nämlich der beste.
- Die Berechnung erfolgt zur Laufzeit chronologisch über alle abgeschlossenen Workouts (reine Funktion in `js/lib/pr.js`), plus das aktive Workout. Dadurch stimmen die Icons auch nach nachträglichem Bearbeiten.
- Das Icon erscheint im aktiven Workout, in der Zusammenfassung und im Session-Detail.

### 6.11 Monatskalender
- Tab „Kalender": Raster Mo–So, Kopfzeile mit Monat und Jahr, Pfeile für Vor und Zurück und ein „Heute"-Button.
- Tage mit absolvierten Sessions zeigen Punkte (ein Punkt je Session, höchstens 3 sichtbar). Der heutige Tag ist hervorgehoben.
- Unter dem Kalender steht eine Zeile „X Trainings in diesem Monat".
- Tap auf einen Tag mit Sessions öffnet eine Liste dieses Tages (Name, Uhrzeit, Dauer, Anzahl Übungen). Tap auf eine Session öffnet das Session-Detail.
- Session-Detail: Datum, Dauer, Übungen mit allen Sätzen (Warm-up-Markierung, RPE, Notizen, PR-Icons).

### 6.12 Training nachträglich bearbeiten
- Im Session-Detail über „Bearbeiten". Der Bearbeitungsmodus nutzt dieselbe Satzzeilen-Komponente wie das Live-Workout, nur ohne Timer.
- Bearbeitbar: Name, Startdatum und -uhrzeit, Dauer (Minuten, setzt `endedAt = startedAt + Dauer`), Sätze (Gewicht, Wiederholungen, RPE, Typ, Notiz), Sätze und Übungen hinzufügen und entfernen. Es gibt hier keinen Haken: Beim Speichern gelten dieselben Regeln wie beim Beenden (ausgefüllte Sätze sind `done`, leere werden verworfen). `updatedAt` wird gesetzt.
- „Training löschen" mit Bestätigungsdialog.
- Nach dem Speichern werden PRs und „Letzte Werte" automatisch neu berechnet, weil sie nie gespeichert, sondern abgeleitet werden.

### 6.13 Körpergewicht
- Eintrag auf „Heute" (kleine Karte): Gewicht in kg, ein Eintrag pro Tag (erneutes Eintragen am selben Tag überschreibt, ein einfaches `put` mit `date` als Schlüssel).
- Verlauf lässt sich in einem Sheet ansehen, bearbeiten und löschen.
- Ist Datenquelle für den Diagramm-Baukasten.

### 6.14 Diagramm-Baukasten
- Tab „Fortschritt": Liste der gespeicherten Diagramme, dazu ein Button „+ Diagramm".
- **Builder** (Bottom-Sheet) in vier Schritten:
  1. **Datenquelle:** Übung (über `exercise-picker`), Körpergewicht oder Trainingsdauer
  2. **Metrik** (abhängig von der Quelle)
     - Übung: Maximalgewicht, Gesamtvolumen (Σ Gewicht × Wiederholungen), geschätztes 1RM (bester Wert je Training), Wiederholungen gesamt, Ø RPE (nur wenn RPE-Daten existieren)
     - Körpergewicht: kg
     - Trainingsdauer: Minuten
  3. **Zeitraum:** 4 Wochen, 3 Monate, 6 Monate, 1 Jahr, Alles
  4. **Typ:** Linie oder Balken
- Ein Datenpunkt entspricht einem Training (bei Körpergewicht einem Tag). Aufwärmsätze zählen nicht.
- Der Titel wird automatisch vorgeschlagen (z. B. „High Row · Maximalgewicht") und ist änderbar.
- Gespeicherte Diagramme sind sitzungsübergreifend in `charts` abgelegt und werden beim Start wieder gerendert. Pro Diagramm gibt es ein Menü: Bearbeiten, Nach oben oder unten, Löschen.
- Beim ersten Start gibt es zwei Standard-Diagramme, die nicht von Übungen abhängen: Körpergewicht und Trainingsdauer.
- **Rendering** (`js/components/chart.js`): SVG mit `viewBox` (skaliert mit der Breite), Datumsachse, gut gerundete Achsenwerte, Tap auf einen Punkt zeigt Wert und Datum. Dazu eine Zeile mit letztem Wert und der Änderung im Zeitraum. Es gibt einen leeren Zustand („Noch keine Daten"), und mit nur einem Datenpunkt wird ein einzelner Punkt gezeichnet.
- Berechnung der Metriken in der reinen Logikschicht `js/lib/stats.js`. Dort stehen auch die Konstanten für `source.kind`, `metric`, `range` und `chartType`.

### 6.15 Backup (Export, Import, Erinnerung)
- **Export:** JSON-Datei `trainingsplan-backup-YYYY-MM-DD.json` mit
  `{ app: 'trainingsplan', schemaVersion: DATA_VERSION, exportedAt, data: { exercises, templates, workouts, bodyweights, charts, settings } }`.
- Primär über die Web Share API mit Datei (damit der iOS-Dialog „In Dateien sichern" erscheint), Fallback ist ein Download-Link. Nach erfolgreichem Export wird `kv.backup.lastExportAt` auf den Zeitpunkt gesetzt, zu dem die Daten gelesen wurden (nicht den Zeitpunkt nach dem Teilen). So bleiben Änderungen, die während des Exports passieren, als ungesichert markiert.
- **Import:** Datei wählen, validieren (App-Kennung, Schema-Version, Struktur), mit `migrate()` auf `DATA_VERSION` bringen, Zusammenfassung zeigen (Anzahl Übungen, Trainings, …), nach Bestätigung alles in **einer Transaktion** ersetzen (Validierung und Migration passieren vorher, siehe 2.1). Bei Fehlern bleibt der alte Datenbestand unverändert. Ein aktives Workout auf dem Gerät wird dabei ebenfalls ersetzt, darauf weist die Bestätigung hin.
- **Erinnerung:** Auf „Heute" erscheint ein Banner „Zeit für ein Backup" mit den Buttons „Jetzt exportieren" und „Später", wenn
  - es ungesicherte Änderungen gibt (`lastChangeAt > lastExportAt`) **und**
  - der letzte Export länger als `backupReminderDays` zurückliegt oder es noch nie einen Export gab (und mindestens ein abgeschlossenes Training existiert) **und**
  - `snoozedUntil` nicht in der Zukunft liegt.
- „Später" setzt `snoozedUntil` auf +3 Tage. In den Einstellungen lässt sich das Intervall wählen (7, 14, 30 Tage, aus), und es gibt dort außerdem Export und Import.

## 7. Projektstruktur

```
/
├── index.html
├── manifest.webmanifest
├── package.json                # nur "type": "module" und "test", keine Abhängigkeiten
├── sw.js                       # APP_VERSION, Precache-Liste
├── css/
│   └── styles.css
├── icons/                      # 192, 512, maskable 512, apple-touch-icon 180
├── js/
│   ├── app.js                  # Bootstrap, Hash-Router, Tab-Leiste, Service-Worker-Updates
│   ├── nav.js                  # navigate() ohne zyklische Importe
│   ├── db.js                   # IndexedDB-Wrapper, Stores und Indizes
│   ├── store.js                # In-Memory-Cache, Schreibfunktionen, subscribe()
│   ├── lib/                    # reine Logik ohne DOM (testbar)
│   │   ├── normalize.js        # nameNorm, Suche und Ranking
│   │   ├── workout.js          # Satz-/Workout-Regeln, Beenden, Epley-1RM
│   │   ├── numbers.js          # Zahlen parsen, runden, im deutschen Format ausgeben
│   │   ├── html.js             # esc(), newId()
│   │   ├── pr.js               # PR-Berechnung
│   │   ├── stats.js            # Metriken für Diagramme und Zusammenfassung
│   │   ├── history.js          # "Letzte Werte", Nutzungsstatistik
│   │   ├── time.js             # Formatierung, Kalenderlogik
│   │   ├── migrate.js          # DATA_VERSION, migrate(data, fromVersion)
│   │   └── backup.js           # Exportformat, Validierung, Erinnerungslogik
│   ├── components/
│   │   ├── exercise-picker.js
│   │   ├── workout-editor.js   # Übungen und Satzzeilen (Live-Workout und Bearbeiten)
│   │   ├── rest-timer.js
│   │   ├── chart.js
│   │   ├── backup-actions.js   # Export (Share/Download), Import mit Bestätigung
│   │   ├── sheet.js            # Bottom-Sheet und Dialoge
│   │   ├── toast.js
│   │   └── icons.js
│   └── views/
│       ├── today.js
│       ├── workout.js
│       ├── calendar.js
│       ├── session-detail.js   # inkl. Zusammenfassung und Bearbeitungsmodus
│       ├── plans.js            # Templates, Template-Editor, Übungsbibliothek
│       ├── progress.js
│       └── settings.js
├── tools/
│   ├── make-icons.mjs          # Icons erzeugen
│   └── update-precache.mjs     # PRECACHE-Liste in sw.js aktualisieren
├── test/                       # node --test: js/lib und Precache-Vollständigkeit
└── README.md
```

## 8. Umsetzungsphasen

Nach jeder Phase: committen, die Abnahmekriterien prüfen und erst dann weitermachen.

### Phase 0 – Grundgerüst und PWA-Shell
- Projektstruktur anlegen, `index.html`, Router, untere Tab-Leiste mit leeren Views, dunkles Basis-Theme mit Safe-Areas.
- `manifest.webmanifest` (Name, `display: standalone`, `start_url` und `scope` relativ, Theme- und Hintergrundfarbe, Icons) und iOS-Meta-Tags. Icons per Skript erzeugen, ein einfaches Hantel-Motiv genügt.
- `sw.js`: Precache aller App-Dateien, Cache-Name aus `APP_VERSION`, Cache-first für die App-Shell, Aufräumen alter Caches. Update-Ablauf mit Hinweis „Neue Version verfügbar" und Reload-Button (`SKIP_WAITING` per `postMessage`).
- `package.json` und ein Test, der prüft, dass jede Datei unter `js/`, `css/` und `icons/` in der Precache-Liste steht.
- Beim Start `navigator.storage.persist()` aufrufen.
- Deployment auf GitHub Pages (Branch `main`, Root).
- **Abnahme:** Auf dem iPhone installierbar, startet im Standalone-Modus, funktioniert im Flugmodus, Update-Hinweis erscheint nach einer neuen Version.

### Phase 1 – Datenschicht und Übungsbibliothek
- `db.js` mit allen Stores, Indizes und `DATA_VERSION`. `migrate.js` (Version 1, noch ohne Schritte). `store.js` mit Cache, Schreib-Wrapper (`lastChangeAt`) und `subscribe()`. `normalize.js` mit Tests.
- Starterübungen beim ersten Start, `exercise-picker` mit Ranking und „neu anlegen", Verwaltung der Übungen im Tab „Pläne" (inklusive Notiz und Archivieren).
- **Abnahme:** „High Row" einmal anlegen, danach liefert „Hi" den Vorschlag. Keine Dubletten durch Groß-/Kleinschreibung oder Leerzeichen. Tests für `normalize.js` laufen grün.

### Phase 2 – Templates
- Template-Liste und Editor im Tab „Pläne" (anlegen, umbenennen, duplizieren, löschen, Übungen mit `plannedSets` hinzufügen, entfernen, sortieren).
- **Abnahme:** Templates überleben einen Neustart, Reihenfolge und Satzanzahl stimmen.

### Phase 3 – Workout-Kern
- „Heute" mit Template-Buttons und Freitext-Training, Workout-Ansicht mit Satzzeilen, Gewicht-Stepper, Wiederholungen, Haken, Satz hinzufügen und löschen, Übung hinzufügen oder entfernen.
- Laufende Persistenz, Banner „Training fortsetzen", Beenden mit Zusammenfassung, Gesamtdauer-Counter.
- „Letzte Werte" (`history.js` mit Tests), Aufwärmsätze, optionales RPE, dauerhafte Übungsnotiz und Satznotiz.
- **Abnahme:** Ein komplettes Training lässt sich ohne Internet durchführen, beenden und in der Datenbank wiederfinden. Nach hartem Schließen der App während des Trainings wird es fortgesetzt. Die Dauer stimmt nach App-Wechsel. Aufwärmsätze tauchen in „Letzte Werte" nicht auf.

### Phase 4 – Pausentimer
- `rest-timer.js` mit Ziel-Zeitstempel, ±15 s, Überspringen, Signalton, visuellem Blinken und Wake Lock. Einstellungen für die Dauer.
- **Abnahme:** Timer läuft nach Sperren und Entsperren korrekt weiter. Der Ton kommt bei geöffneter App. Der Bildschirm bleibt im Workout an, soweit iOS das unterstützt.

### Phase 5 – PR-Icon
- `pr.js` mit Tests (kein PR beim ersten Training, Gewichts-PR, 1RM-PR, höchstens ein PR pro Übung und Training, Aufwärmsätze ignoriert), Icon in Workout, Zusammenfassung und später im Session-Detail.
- **Abnahme:** Die Tests laufen grün, und das Icon erscheint im Workout bei einem neuen Bestwert.

### Phase 6 – Kalender und Bearbeiten
- Monatskalender mit Punkten, Monatszeile, Tagesliste, Session-Detail, Bearbeitungsmodus (siehe 6.11 und 6.12), Löschen mit Bestätigung. `time.js` mit Tests für die Kalenderlogik (Monatsgrenzen, Wochenstart Montag).
- **Abnahme:** Eine Session erscheint am richtigen Tag. Das Bearbeiten eines Satzes ändert „Letzte Werte" und PR-Icon entsprechend. Wird das Datum geändert, wandert die Session im Kalender.

### Phase 7 – Körpergewicht und Diagramm-Baukasten
- Körpergewicht-Karte und Verlauf. `stats.js` mit Tests. `chart.js` (Linie und Balken, Tooltip, Leerzustand). Builder-Sheet, Speicherung in `charts`, Bearbeiten, Sortieren, Löschen, Standard-Diagramme.
- **Abnahme:** Ein selbst gebautes Diagramm (z. B. „High Row · Maximalgewicht · 3 Monate · Linie") bleibt nach App-Neustart erhalten. Die Werte stimmen stichprobenartig mit den Rohdaten überein. Der Zeitraumfilter wirkt.

### Phase 8 – Backup
- `backup.js` mit Export (Share-Sheet plus Fallback), Import mit Validierung und Transaktion, Erinnerungsbanner, Einstellungen (Intervall). Tests für Validierung, Round-Trip und Erinnerungslogik.
- **Abnahme:** Export, App-Daten löschen, Import ergibt identische Daten (inklusive Diagramme und Einstellungen). Eine defekte Datei wird abgelehnt, ohne Daten zu verändern. Das Banner erscheint nach dem eingestellten Intervall.

### Phase 9 – Feinschliff
- Offline-Härtung (alle Assets im Precache, Test im Flugmodus nach frischer Installation), Fehlerbehandlung bei IndexedDB-Fehlern mit verständlicher Meldung, Performance-Check mit etwa 500 Beispiel-Trainings, Accessibility (Labels, Kontrast, Fokus), `README.md` mit Setup, Deployment und Test.
- **Abnahme:** Siehe Checkliste in Abschnitt 9.

## 9. iOS-Besonderheiten und Abnahme-Checkliste

Besonderheiten:
- Die installierte PWA hat einen **eigenen Speicher**, getrennt vom Safari-Tab. Daten, die im Tab erzeugt wurden, erscheinen nicht in der installierten App. Nach der Installation also nur noch dort arbeiten, und zum Übertragen Backup und Import nutzen.
- Eingabefelder brauchen mindestens 16 px Schriftgröße, sonst zoomt iOS beim Fokussieren.
- `viewport-fit=cover` plus `env(safe-area-inset-*)` für Notch und Home-Indikator.
- Kein Vibrations-API, Audio erst nach einer Nutzergeste. Der Signalton kommt nur bei geöffneter App, nicht im Sperrbildschirm oder Hintergrund. Lokale Benachrichtigungen ohne Push-Server gibt es auf iOS nicht.
- Service-Worker-Updates greifen auf iOS erst nach dem Schließen und erneuten Öffnen der App. Deshalb der Update-Hinweis.
- Lokal testen geht mit `localhost` auf dem Mac (z. B. `npx serve` oder `python3 -m http.server`). Das echte Verhalten auf dem iPhone wird nach dem Deployment auf GitHub Pages geprüft.

Checkliste (manuell auf dem iPhone):
- [ ] Installiert, startet im Standalone-Modus, funktioniert im Flugmodus
- [ ] Training mit Template und Freitext durchführen, beenden, im Kalender wiederfinden
- [ ] „Hi" → „High Row" wird vorgeschlagen, letzte Werte erscheinen
- [ ] Aufwärmsatz zählt nicht in Diagrammen und PRs
- [ ] Pausentimer und Gesamtdauer stimmen nach Sperrbildschirm
- [ ] PR-Icon erscheint und verschwindet korrekt nach nachträglicher Bearbeitung
- [ ] Eigenes Diagramm bleibt nach Neustart erhalten
- [ ] Export und Import funktionieren, Erinnerungsbanner erscheint

## 10. Nicht im Umfang (mögliche spätere Ideen)

Bewusst **nicht** Teil dieser Umsetzung:
- „Wie letztes Mal"-Button, der alle Sätze mit den Werten der letzten Session vorbelegt
- Wochenübersicht und Wochen-Serie
- Wochenvolumen pro Muskelgruppe (mit Muskelgruppen-Tags)
- Zeitwarnung bei Überschreitung der geplanten Trainingsdauer
- Eigene PR-Liste oder PR-Ansicht
- Training nachträglich komplett neu anlegen (aus dem Kalender)
- Freitext-Training als Template speichern
- Zusammenführen doppelter Übungen
- HealthKit, Cloud-Sync, Mehrbenutzer

## 11. Arbeitsweise für Claude Code

- Diese Datei ist die verbindliche Spezifikation. Bei Unklarheiten zuerst hier nachlesen und sinnvolle Annahmen treffen. Nur bei echten Blockern nachfragen.
- Phasen der Reihe nach umsetzen. Nach jeder Phase ein Commit mit klarer Nachricht und eine kurze Zusammenfassung, was fertig ist und wie die Abnahme geprüft wurde.
- Reine Logik (`js/lib/`) bleibt frei von DOM-Zugriffen und wird mit dem eingebauten Test-Runner (`node --test`) getestet, ohne zusätzliche Abhängigkeiten.
- Keine neuen Abhängigkeiten und kein Build-Tool einführen. Wenn etwas davon nötig erscheint, zuerst begründen und nachfragen.
- Bei Änderungen am Datenmodell `DATA_VERSION` erhöhen und einen Schritt in `migrate.js` mit Test ergänzen.
- Bei jeder Änderung an App-Dateien `APP_VERSION` in `sw.js` erhöhen und die Precache-Liste aktuell halten (der Precache-Test prüft das).
