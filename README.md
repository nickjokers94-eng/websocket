# Worti WebSocket Server
### Repository: https://github.com/nickjokers94-eng/websocket
Dies ist der WebSocket-Server für das Wortratespiel Worti von Nick Jokers und Paul Troschke.

## Voraussetzungen

- [Node.js](https://nodejs.org/) (Version 16 oder höher)
- Optional: Ein Backend-Server für Wörter und Highscores (siehe `BACKEND_URL` in `server.js`)
- Optional: Ein Frontend (UI), um das Spiel im Browser zu spielen

## Installation

1. **Repository klonen**

```bash
git clone https://github.com/nickjokers94-eng/websocket.git
cd websocket
```

2. **Abhängigkeiten installieren**

```bash
npm install
```

## Starten des Servers

Du kannst den WebSocket-Server mit folgendem Befehl starten:

```bash
node server.js
```

Alternativ kannst du auch das npm-Skript verwenden:

```bash
npm start
```

Der Server läuft dann standardmäßig auf Port **3000**.

## Entwicklung (mit automatischem Neustart)

```bash
npm run dev
```

## Frontend (UI)

Um das Spiel im Browser zu spielen, benötigst du ein passendes Frontend.  
Ein einfaches Beispiel findest du in der Datei `index.html`.  
Öffne diese Datei im Browser, während der WebSocket-Server läuft.

## Backend (API)

Für die Verwaltung von Wörtern und Highscores wird ein separates Backend benötigt.  
Die URL dazu ist in `server.js` als `BACKEND_URL` konfiguriert.  
Ohne Backend werden Fallback-Wörter genutzt und Highscores nicht gespeichert.

## Testen der Verbindung

Öffne die Datei `index.html` im Browser und stelle sicher, dass der Server läuft.  
Du kannst auch mit einem WebSocket-Client (z.B. [websocat](https://github.com/vi/websocat) oder Browser-Tools) testen.

## Konfiguration

- Die wichtigsten Einstellungen findest du oben in der Datei `server.js`:
  - `PORT`: Port des WebSocket-Servers (Standard: 3000)
  - `BACKEND_URL`: URL deines Backend-Servers (Standard: `http://localhost:8080`)
  - `ROUND_DURATION`: Dauer einer Spielrunde in Sekunden (Standard: 60)

## Hinweise

- Die maximale Spieleranzahl ist aktuell auf 3 begrenzt.
- Für das Backend werden Standard-Zugangsdaten (`user` / `passwordtest`) verwendet.
- Ohne Backend werden Fallback-Wörter genutzt und Highscores nicht gespeichert.

## Lizenz

MIT License

---

**Autor:** Nick Jokers