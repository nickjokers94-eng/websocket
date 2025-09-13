const WebSocket = require('ws');
const http = require('http');
const axios = require('axios');

const PORT = 3000;
const BACKEND_URL = 'http://localhost:8080';
const ROUND_DURATION = 60;

class GameState {
  constructor() {
    this.currentRound = null;
    this.players = new Map();
    this.roundNumber = 0;
    this.timer = null;
    this.timeRemaining = 0;
    this.guesses = [];
    this.lastRoundSolution = null;
    this.backendUrl = BACKEND_URL;
    this.roundStartTime = null;
    this.totalGuesses = 0;
    this.roundActive = false;
  }

  async fetchRandomWord() {
    try {
      console.log('Zufälliges Wort vom Backend abrufen...');
      const response = await axios.get(`${this.backendUrl}/words/randomWord`, {
        auth: { username: 'user', password: 'passwordtest' }
      });
      const word = response.data.toUpperCase();
      console.log(`Wort vom Backend erhalten: ${word}`);
      return word;
    } catch (error) {
      console.error('Fehler bei Backend-API:', error.message);
      const fallbackWords = ['HOUSE', 'MAGIC', 'PHONE', 'WORLD', 'BREAD', 'MUSIC', 'LIGHT'];
      const word = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
      console.log(`Fallback-Wort wird genutzt: ${word}`);
      return word;
    }
  }

  addPlayer(username, socket) {
    if (this.players.size >= 6) {
      socket.send(JSON.stringify({ type: 'error', message: 'Lobby ist voll! Maximal 6 Spieler erlaubt.' }));
      socket.close();
      return;
    }
    if (this.players.has(username)) {
      socket.send(JSON.stringify({ type: 'error', message: 'Benutzername ist bereits verbunden.' }));
      socket.close();
      return;
    }
    this.players.set(username, {
      socket,
      joinTime: Date.now(),
      guessCount: 0,
      totalScore: 0,
      roundScore: 0
    });
    console.log(`Spieler ${username} beigetreten. Gesamtanzahl Spieler: ${this.players.size}`);
    this.sendGameState(username);
    this.broadcast({ type: 'playerList', players: this.getPlayerList() });
    this.players.forEach((player, uname) => {
      this.sendGameState(uname);
    });
  }

  removePlayer(username) {
    if (this.players.has(username)) {
      this.players.delete(username);
      console.log(`Spieler ${username} hat das Spiel verlassen. Gesamtanzahl Spieler: ${this.players.size}`);
      this.broadcast({ type: 'playerList', players: this.getPlayerList() });
      this.players.forEach((player, uname) => {
        this.sendGameState(uname);
      });
    }
  }

  sendGameState(username) {
    const player = this.players.get(username);
    if (!player) return;
    const gameState = {
      type: 'gameState',
      currentWord: this.currentRound?.word || null,
      timeRemaining: this.timeRemaining,
      roundNumber: this.roundNumber,
      lastWord: this.lastRoundSolution,
      players: this.getPlayerList(),
      guesses: this.guesses,
      playerGuessCount: player.guessCount,
      maxGuesses: this.getMaxGuessesForPlayer(),
      gameActive: this.currentRound !== null,
      timestamp: Date.now()
    };
    this.sendToPlayer(username, gameState);
  }

  getMaxGuessesForPlayer() {
    const playerCount = this.players.size;
    if (playerCount <= 1) return 6;
    if (playerCount === 2) return 3;
    return 2;
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    this.players.forEach((player, username) => {
      if (player.socket.readyState === WebSocket.OPEN) {
        try {
          player.socket.send(data);
        } catch (error) {
          console.error(`Fehler beim Senden an ${username}:`, error);
          this.removePlayer(username);
        }
      }
    });
  }

  sendToPlayer(username, message) {
    const player = this.players.get(username);
    if (player && player.socket.readyState === WebSocket.OPEN) {
      try {
        player.socket.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Fehler beim Senden an ${username}:`, error);
        this.removePlayer(username);
      }
    }
  }

  async startNewRound() {
    if (this.players.size === 0) return;
    this.roundNumber++;
    this.timeRemaining = ROUND_DURATION;
    this.guesses = [];
    this.totalGuesses = 0;
    this.roundStartTime = Date.now();
    this.roundActive = true;
    this.players.forEach(player => {
      player.guessCount = 0;
      player.roundScore = 0;
    });
    const currentWord = await this.fetchRandomWord();
    this.currentRound = {
      word: currentWord,
      startTime: Date.now(),
      roundNumber: this.roundNumber
    };
    console.log(`Runde ${this.roundNumber} gestartet mit Wort: ${currentWord}`);
    this.broadcast({
      type: 'newRound',
      word: currentWord,
      roundNumber: this.roundNumber,
      duration: ROUND_DURATION,
      lastWord: this.lastRoundSolution,
      maxGuesses: this.getMaxGuessesForPlayer(),
      timestamp: Date.now()
    });
    this.startTimer();
  }

  startTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.timeRemaining--;
      this.broadcast({
        type: 'timer',
        secondsLeft: this.timeRemaining,
        timestamp: Date.now()
      });
      if (this.timeRemaining <= 0) {
        console.log('Zeit abgelaufen, Runde wird beendet.');
        this.endRound('timeout');
      }
    }, 1000);
  }

  // Neue Punkteberechnung: Keine Trostpunkte mehr für falsche Versuche!
  calculateScore(player, guessNumber, timeUsed, correct) {
    let score = 0;
    if (correct) {
      score += 1000;
      score += Math.max(0, (this.getMaxGuessesForPlayer() - guessNumber + 1) * 200);
      const timeBonus = Math.max(0, (ROUND_DURATION - timeUsed) * 10);
      score += timeBonus;
      if (this.players.size > 1) {
        score += this.players.size * 100;
      }
    }
    return Math.round(score);
  }

  async endRound(reason = 'completed') {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.currentRound) return;
    const solution = this.currentRound.word;
    this.lastRoundSolution = solution;
    this.roundActive = false;
    for (const [username, player] of this.players) {
      if (player.roundScore > 0) {
        await this.savePlayerScore(username, player.roundScore);
        player.totalScore += player.roundScore;
      }
    }
    console.log(`Runde ${this.roundNumber} beendet. Lösung: ${solution}, Grund: ${reason}`);
    this.broadcast({
      type: 'roundEnded',
      solution: solution,
      roundNumber: this.roundNumber,
      reason: reason,
      guesses: this.guesses,
      duration: ROUND_DURATION - this.timeRemaining,
      playerScores: this.getPlayerScores(),
      timestamp: Date.now()
    });
    this.currentRound = null;
    if (this.players.size > 0) {
      setTimeout(async () => {
        await this.startNewRound();
      }, 5000);
    }
  }

  getPlayerScores() {
    const scores = {};
    this.players.forEach((player, username) => {
      scores[username] = {
        roundScore: player.roundScore,
        totalScore: player.totalScore,
        guessCount: player.guessCount
      };
    });
    return scores;
  }

  // Highscore-Logik: Nur speichern, wenn neuer Score höher ist
  async savePlayerScore(username, score) {
    try {
      // Hole aktuellen Highscore vom Backend
      const res = await axios.get(`${this.backendUrl}/highscores`, {
        auth: { username: 'user', password: 'passwordtest' }
      });
      const userEntry = res.data.find(entry => entry.username === username);
      const currentHighscore = userEntry ? userEntry.score : 0;

      // Nur speichern, wenn neuer Score höher ist
      if (score > currentHighscore) {
        await axios.post(`${this.backendUrl}/highscores/save`,
          { username, score },
          {
            auth: { username: 'user', password: 'passwordtest' }
          }
        );
        console.log(`Punkte für ${username} gespeichert: ${score}`);
      } else {
        console.log(`Kein neuer Highscore für ${username}: ${score} <= ${currentHighscore}`);
      }
    } catch (error) {
      console.error(`Fehler beim Speichern der Punkte für ${username}:`, error.message);
    }
  }

  addGuess(username, guess) {
    const player = this.players.get(username);
    if (!player) return false;
    const maxGuesses = this.getMaxGuessesForPlayer();

    if (player.guessCount >= maxGuesses) {
      this.sendToPlayer(username, {
        type: 'error',
        message: `Maximale Anzahl Versuche erreicht! (${player.guessCount}/${maxGuesses})`
      });
      return false;
    }
    if (this.totalGuesses >= 6) {
      this.sendToPlayer(username, {
        type: 'error',
        message: 'Maximale Gesamtanzahl von 6 Versuchen erreicht!'
      });
      return false;
    }
    player.guessCount++;
    this.totalGuesses++;
    const timeUsed = Math.floor((Date.now() - this.roundStartTime) / 1000);
    const isCorrect = this.currentRound && guess.toUpperCase() === this.currentRound.word;
    const score = this.calculateScore(player, player.guessCount, timeUsed, isCorrect);
    player.roundScore += score;
    const guessData = {
      user: username,
      guess: guess.toUpperCase(),
      timestamp: Date.now(),
      guessNumber: player.guessCount,
      totalGuessNumber: this.totalGuesses,
      correct: isCorrect,
      score: score,
      timeUsed: timeUsed
    };
    this.guesses.push(guessData);
    console.log(`${username} hat geraten: ${guess.toUpperCase()} (${player.guessCount}/${maxGuesses}, Gesamt: ${this.totalGuesses}/6) - ${score} Punkte`);
    this.broadcast({
      type: 'guess',
      ...guessData
    });
    if (isCorrect) {
      console.log(`${username} hat das richtige Wort erraten!`);
      this.broadcast({
        type: 'correctGuess',
        user: username,
        word: this.currentRound.word,
        score: score,
        timestamp: Date.now()
      });
      setTimeout(() => this.endRound('solved'), 2000);
      return true;
    } else if (this.totalGuesses >= 6) {
      console.log('Maximale Gesamtanzahl von 6 Versuchen erreicht, Runde wird beendet.');
      setTimeout(() => this.endRound('max_guesses'), 2000);
      return true;
    }
    return true;
  }

  getPlayerList() {
    return Array.from(this.players.entries()).map(([username, player]) => ({
      name: username,
      guessCount: player.guessCount,
      maxGuesses: this.getMaxGuessesForPlayer(),
      roundScore: player.roundScore,
      totalScore: player.totalScore,
      joinTime: player.joinTime
    }));
  }

  async testBackendConnection() {
    try {
      const response = await axios.get(`${this.backendUrl}/words`, {
        auth: { username: 'user', password: 'passwordtest' }
      });
      console.log(`Backend-Verbindung erfolgreich! ${response.data.length} Wörter in der Datenbank gefunden.`);
      return true;
    } catch (error) {
      console.error(`Backend-Verbindung fehlgeschlagen:`, error.message);
      return false;
    }
  }
}

const server = http.createServer();
const wss = new WebSocket.Server({ server });
const gameState = new GameState();

wss.on('connection', (ws, request) => {
  let username = null;
  console.log('Neue WebSocket-Verbindung');
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      console.log('Nachricht vom Client:', message);
      handleClientMessage(ws, message);
    } catch (error) {
      console.error('Fehler beim Parsen der Nachricht:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Ungültiges Nachrichtenformat'
      }));
    }
  });

  ws.on('close', () => {
    if (ws.username) {
      console.log(`Verbindung von ${ws.username} geschlossen`);
      gameState.removePlayer(ws.username);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket-Fehler:', error);
  });
  ws.username = username;
});

function handleClientMessage(socket, message) {
  switch (message.type) {
    case 'playerJoin':
      socket.username = message.user;
      gameState.addPlayer(socket.username, socket);
      socket.send(JSON.stringify({
        type: 'welcome',
        username: socket.username,
        message: 'Erfolgreich verbunden',
        timestamp: Date.now()
      }));
      gameState.broadcast({ type: 'userJoined', username: socket.username, timestamp: Date.now() });
      gameState.broadcast({ type: 'playerList', players: gameState.getPlayerList() });
      gameState.players.forEach((player, uname) => {
        gameState.sendGameState(uname);
      });
      if (gameState.players.size === 1 && !gameState.currentRound) {
        gameState.startNewRound();
      }
      break;
    case 'guess':
      if (socket.username && message.guess) {
        gameState.addGuess(socket.username, message.guess);
      }
      break;
    case 'requestGameState':
      if (socket.username) {
        gameState.sendGameState(socket.username);
      }
      break;
    case 'ping':
      socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    default:
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Unbekannter Event-Typ: ' + message.type
      }));
  }
}

server.listen(PORT, async () => {
  console.log(`WebSocket-Game-Server läuft auf Port ${PORT}`);
  console.log(`WebSocket-Endpunkt: ws://localhost:${PORT}`);
  console.log('Teste Backend-Verbindung...');
  const backendOnline = await gameState.testBackendConnection();
  if (backendOnline) {
    console.log('Backend ist online! Datenbank-Wörter werden genutzt.');
  } else {
    console.log('Backend offline! Fallback-Wörter werden genutzt.');
  }
});

process.on('SIGTERM', () => {
  console.log('WebSocket-Server wird heruntergefahren...');
  wss.clients.forEach((client) => {
    client.close();
  });
  server.close();
});

process.on('SIGINT', () => {
  console.log('\nServer wird heruntergefahren...');
  process.exit(0);
});

module.exports = { gameState, wss };