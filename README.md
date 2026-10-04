# Glyph

Entscheidungshilfe für den Champion Select in League of Legends: Welche Runen, welche Items,
gegen wen – und warum. Jede Empfehlung nennt die Zahlen, auf denen sie beruht, und jede Winrate
wird mit ihrem 95-%-Bereich gezeichnet statt mit einem erfundenen Confidence-Wert.

## Starten

```
npm install
npm run dev        # Entwicklung mit Hot Reload
npm run build      # Produktions-Build nach out/
npm start          # gebaute App starten
npm run dist       # Windows-Installer nach dist/
```

Ohne laufendes League lässt sich alles über die Suche (Strg K) öffnen: Champion, „Bard vs
Brand“, Item, Rune oder Build.

## Aufbau

```
DATA            src/main/data/opgg.ts      Statistiken holen, normalisieren, cachen
                src/main/data/updater.ts   statische Spieldaten erzeugen
                src/main/league/           League Client (LCU)
ANALYSIS        src/shared/analysis.ts     Wilson-Intervall, Summenbildung, Team-Analyse
RECOMMENDATION  src/shared/recommend.ts    Auswahl mit Begründung
UI              src/renderer/src/          zeigt nur an; rechnet nicht selbst
```

Die UI spricht ausschließlich über `window.api` (`src/preload`, Vertrag in `src/shared/types.ts`).

## Datenquellen

| Quelle | Wofür | Abruf |
| --- | --- | --- |
| OP.GG, öffentlicher MCP-Endpunkt (`mcp-api.op.gg`) | Winrate/Pick/Ban/Tier, Runenseiten, Items je Slot, Matchups, Spieldauer, Lane-Einschätzung | bei Bedarf, 24 h auf der Platte gecacht |
| Data Dragon (Riot) | Champions, Items mit Eigenschaften, Runen, Bilder | `data/static.json`, pro Patch |
| Meraki Analytics (offenes Projekt) | Riots Champion-Klassen, Wertungen 1–3, Schadensart, Positionen | `data/static.json`, pro Patch |

`npm run update-data` erzeugt `data/static.json` neu; die App bietet das bei einem neuen Patch
auch selbst in der Fußzeile an.

OP.GG liefert die tiefen Daten (mehrere Runenseiten, Item-Statistiken) nur je Matchup. Ohne
gewählten Gegner summiert Glyph deshalb die sechs meistgespielten Matchups und sagt dazu, welchen
Anteil aller Spiele das abdeckt.

## Wie Empfehlungen entstehen

- **Runen:** unter den Seiten mit mindestens 30 Spielen die mit dem höchsten unteren Rand des
  95-%-Bereichs. „Klarer Favorit“ heißt: ihr Bereich liegt vollständig über dem der nächsten.
- **Items:** je Slot das meistgekaufte. Ist „viel AD / AP / CC“ markiert (im Champion Select aus
  dem Draft abgeleitet), wird pro Markierung höchstens ein Item und die Stiefel getauscht – nur
  gegen eine Option mit passender Eigenschaft, die in mindestens 10 % der Spiele gekauft wird und
  nicht klar schlechter abschneidet.
- **Team-Analyse:** Durchschnitt von Riots Wertungen (Frontline, Crowd Control, Mobilität) und
  Anzahl der Champions bestimmter Klassen (Engage, Peel, Poke, Burst).

## Was die Quelle nicht hergibt

Kaufzeiten von Items, Früh-/Mittel-/Spätspiel je Build, Phasen-Daten je Matchup, Matchups je Rune
und benannte Build-Archetypen mit Item-Listen. Die App sagt das an der jeweiligen Stelle, statt
Werte zu erfinden. Neue Felder kommen in `parseGuide` (`opgg.ts`) dazu und stehen dann allen
Schichten zur Verfügung.

## Runen-Import

Die App legt genau eine eigene Seite an („Glyph · Champion Rolle“) und ersetzt diese bei jedem
weiteren Import. Ist kein Slot frei, fragt sie, bevor sie eine vorhandene Seite überschreibt.
