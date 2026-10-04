# Glyph

Kleines Champion-Select-Tool für League of Legends: Champion erkennen → Runen, Build und
Skill Order anzeigen → Runen per Klick in den Client importieren. Sonst nichts.

## Starten

```
npm install
npm run dev        # Entwicklung mit Hot Reload
npm run build      # Produktions-Build nach out/
npm start          # gebaute App starten
npm run dist       # portable .exe nach dist/
```

Ohne laufendes League lässt sich jeder Champion über das Suchfeld manuell öffnen (Testmodus).

## Aufbau

```
UI (src/renderer)  →  window.api (src/preload)  →  LeagueService (src/main/league)  →  LCU
```

- `src/main/league/credentials.ts` – findet den Client (Lockfile, sonst Prozess-Kommandozeile)
- `src/main/league/lcu.ts` – HTTPS-Aufrufe an `127.0.0.1`
- `src/main/league/LeagueService.ts` – alle LCU-Endpunkte, inklusive Runen-Import
- `src/main/league/watcher.ts` – Polling und Zustandsmeldungen an die UI
- `src/main/data/` – Datensatz laden und aktualisieren
- `src/shared/types.ts` – Datenmodell und die API zwischen UI und Hauptprozess

Verwendete LCU-Endpunkte (geprüft gegen das Schema von Client 16.19):
`GET /lol-gameflow/v1/gameflow-phase`, `GET /lol-gameflow/v1/session`,
`GET /lol-summoner/v1/current-summoner`, `GET /lol-champ-select/v1/session`,
`GET|POST /lol-perks/v1/pages`, `DELETE /lol-perks/v1/pages/{id}`,
`GET /lol-perks/v1/inventory`, `GET|PUT /lol-perks/v1/currentpage`.

## Daten

`data/builds.json` (Runen, Items, Skill Order je Champion und Rolle, nur IDs) und
`data/static.json` (Namen und Icons aus Data Dragon). Beide werden erzeugt, nicht von Hand
gepflegt:

```
npm run update-data                   # englische Namen
npm run update-data -- --locale de_DE # deutsche Namen
```

Die App prüft beim Start, ob Data Dragon einen neueren Patch kennt, und bietet dann in der
Fußzeile an, die Daten nachzuladen.

Die Build-Statistiken stammen von einem öffentlichen, aber nicht dokumentierten Endpunkt von
u.gg. Alles, was von dessen Format abhängt, steht in `src/main/data/updater.ts` (`parseRole`).
Champion-Bilder, Item- und Runen-Icons kommen direkt von Data Dragon.

## Runen-Import

Die App legt genau eine eigene Seite an („Glyph · Champion Rolle“) und ersetzt diese bei jedem
weiteren Import. Ist kein Slot frei, fragt sie, bevor sie eine vorhandene Seite überschreibt.
