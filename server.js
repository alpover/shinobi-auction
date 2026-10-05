const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 10000);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const rawMatch = html.match(/const raw=([\s\S]*?);\s*\/\/ Boruto/);
if (!rawMatch) throw new Error('Karakter verisi index.html içinden okunamadı.');
const raw = vm.runInNewContext('(' + rawMatch[1] + ')');
const borutoNames = new Set(['Shibai Otsutsuki','Jura','Daemon','Isshiki Otsutsuki','Momoshiki Otsutsuki','Boruto Uzumaki','Kawaki','Code','Jigen','Kinshiki Otsutsuki','Toneri Otsutsuki','Mitsuki','Sarada Uchiha','Delta','Boro','Eida','Koji Kashin']);
const slugify = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const rebalancePowerScore = rawScore => Math.max(1, Math.min(10000, Math.round(10000 * Math.pow(rawScore / 9650, 3.2))));
const characters = raw.slice(0, 100).filter(x => !borutoNames.has(x[0])).map((x, i) => ({
  id: i, name: x[0], version: x[1], village: x[2], description: x[3],
  powerScore: rebalancePowerScore(x[4]), image: 'assets/characters/' + slugify(x[0]) + '.png', purchasePrice: null
}));

const rooms = new Map();
const makeCode = () => { let code; do code = Math.random().toString(36).slice(2, 6).toUpperCase(); while (rooms.has(code)); return code; };
const publicCharacter = (c, reveal = false) => {
  if (!c) return null;
  const safe = { id: c.id, name: c.name, version: c.version, village: c.village, description: c.description, image: c.image, purchasePrice: c.purchasePrice ?? null };
  if (reveal) safe.powerScore = c.powerScore;
  return safe;
};
const publicState = (room, reveal = room.gameOver) => ({
  roomCode: room.code,
  roleNames: room.players.map(p => p ? p.name : null),
  players: room.players.map(p => p ? ({ name: p.name, budget: p.budget, team: p.team.map(c => publicCharacter(c, reveal)) }) : null),
  characterPool: Array.from({ length: room.characterPool.length }, (_, i) => i),
  currentCharacter: publicCharacter(room.currentCharacter, reveal), auctionNumber: room.auctionNumber,
  history: room.history, gameOver: room.gameOver, locked: room.locked, starterPlayer: room.starterPlayer,
  turnPlayer: room.turnPlayer, currentBid: room.currentBid, currentBidder: room.currentBidder, reveal
});
const send = (client, payload) => { if (client.readyState === 1) client.send(JSON.stringify(payload)); };
const broadcast = room => room.clients.forEach(client => send(client, { type: 'state', state: publicState(room) }));
const broadcastLobby = room => room.clients.forEach(client => send(client, { type: 'lobby', state: publicState(room, false) }));
const shuffle = list => [...list].sort(() => Math.random() - 0.5);
function startAuction(room) {
  if (room.players.every(p => p.team.length >= 5) || room.characterPool.length === 0) { room.gameOver = true; room.locked = true; broadcast(room); return; }
  room.currentCharacter = room.characterPool.pop();
  room.auctionNumber++;
  room.locked = false;
  const opening = room.players[room.starterPlayer].team.length >= 5 ? 1 - room.starterPlayer : room.starterPlayer;
  room.currentBidder = opening;
  room.turnPlayer = 1 - opening;
  room.currentBid = 1;
  room.starterPlayer = 1 - room.starterPlayer;
  broadcast(room);
}
function finishAuction(room, label) {
  if (room.locked) return;
  room.locked = true;
  const winner = room.currentBidder;
  const character = room.currentCharacter;
  character.purchasePrice = room.currentBid;
  room.players[winner].budget -= room.currentBid;
  room.players[winner].team.push(character);
  room.history.unshift({ name: character.name, result: room.players[winner].name + ' | ' + label + ' • ' + room.currentBid });
  broadcast(room);
  setTimeout(() => { if (!room.gameOver) startAuction(room); }, 750);
}
function action(room, playerIndex, type) {
  if (!room || room.gameOver || room.locked || room.players[playerIndex] == null) return;
  if (room.turnPlayer !== playerIndex) return;
  const player = room.players[playerIndex];
  if (type === 'raise') {
    if (player.budget <= room.currentBid || player.team.length >= 5) return;
    room.currentBid++;
    room.currentBidder = playerIndex;
    room.turnPlayer = 1 - playerIndex;
    broadcast(room);
  } else if (type === 'stay') finishAuction(room, 'KAL');
}

const app = express();
app.use(express.static(ROOT));
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
wss.on('connection', socket => {
  socket.roomCode = null; socket.playerIndex = null;
  send(socket, { type: 'connected' });
  socket.on('message', buffer => {
    let message; try { message = JSON.parse(buffer.toString()); } catch { return; }
    if (message.type === 'create') {
      const code = makeCode();
      const room = { code, clients: new Set([socket]), players: [{ name: String(message.name || 'Oyuncu 1').slice(0, 22), budget: 20, team: [] }, null], characterPool: shuffle(characters), currentCharacter: null, auctionNumber: 0, history: [], gameOver: false, locked: false, starterPlayer: 0, turnPlayer: 0, currentBid: 0, currentBidder: 0 };
      rooms.set(code, room); socket.roomCode = code; socket.playerIndex = 0; send(socket, { type: 'room-created', state: publicState(room, false), playerIndex: 0 });
    } else if (message.type === 'join') {
      const code = String(message.room || '').trim().toUpperCase(); const room = rooms.get(code);
      if (!room) return send(socket, { type: 'error', message: 'Bu oda bulunamadı.' });
      if (room.players[1]) return send(socket, { type: 'error', message: 'Bu oda zaten dolu.' });
      room.players[1] = { name: String(message.name || 'Oyuncu 2').slice(0, 22), budget: 20, team: [] };
      room.clients.add(socket); socket.roomCode = code; socket.playerIndex = 1;
      room.clients.forEach(client => send(client, { type: 'game-start', state: publicState(room, false), playerIndex: client.playerIndex }));
      startAuction(room);
    } else if (message.type === 'action') action(rooms.get(socket.roomCode), socket.playerIndex, message.action);
  });
  socket.on('close', () => { const room = rooms.get(socket.roomCode); if (!room) return; room.clients.delete(socket); if (!room.clients.size) rooms.delete(room.code); else broadcastLobby(room); });
});
server.listen(PORT, '0.0.0.0', () => console.log('Shinobi Auction server listening on port ' + PORT));
