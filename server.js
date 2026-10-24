// HUZZAH! online server: serves the game pages (HUZZAH! at /, SQUIRE at /squire/) and runs game rooms over WebSocket.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { WebSocketServer } = require('./miniws.js');
const ENGINES = { huzzah: require('./public/engine.js'), squire: require('./public/squire/engine.js') };
const HZ = ENGINES.huzzah;
const E = room => ENGINES[room.game] || HZ; // each room runs its own game's rules
const gameOf = m => (m.game === 'squire' ? 'squire' : 'huzzah');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

/* ---------- static files (cached + gzipped in memory) ---------- */
const cache = new Map();
function getFile(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const full = path.join(PUB, rel);
  if (!full.startsWith(PUB) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  const raw = fs.readFileSync(full);
  const f = { raw, gz: zlib.gzipSync(raw), type: TYPES[path.extname(full)] || 'application/octet-stream' };
  cache.set(rel, f);
  return f;
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/squire') { res.writeHead(301, { Location: '/squire/' + url.search }); return res.end(); }
  if (rel === '/' || rel === '') rel = '/index.html';
  else if (rel.endsWith('/')) rel += 'index.html';
  const f = getFile(rel);
  if (!f) { res.writeHead(404); return res.end('Not found'); }
  const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  res.writeHead(200, {
    'Content-Type': f.type,
    'Cache-Control': rel === '/assets.js' ? 'public, max-age=3600' : 'no-cache', // only the big artwork file is cached; rules and page always revalidate
    ...(gz ? { 'Content-Encoding': 'gzip' } : {}),
  });
  res.end(gz ? f.gz : f.raw);
});

/* ---------- rooms ---------- */
const rooms = new Map(); // code -> room
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => CODE_CH[Math.random() * CODE_CH.length | 0]).join(''); } while (rooms.has(c)); return c; };
const newToken = () => crypto.randomBytes(16).toString('hex');
const clean = (s, d) => (String(s || '').replace(/[<>&"'`]/g, '').trim().slice(0, 16)) || d;

function applyCfg(cfg, c) {
  c = c || {};
  if (c.nord === 'asc' || c.nord === 'desc') cfg.nord = c.nord;
  if (typeof c.obon === 'boolean') cfg.od = c.obon ? (cfg.od || 2) : 0; // older clients
  if ([0, 1, 2, 3].includes(c.nn)) cfg.nn = c.nn;
  if ([0, 1, 2, 3].includes(c.od)) cfg.od = c.od;
  if ([0, 1, 99].includes(c.rfl)) cfg.rfl = c.rfl;
  if (['easy', 'normal', 'hard'].includes(c.bd)) cfg.bd = c.bd;
  if (c.brd === 'a' || c.brd === 'b') cfg.brd = c.brd; // SQUIRE scorecard
  if (c.sm === 'pts' || c.sm === 'hand') cfg.sm = c.sm;
  if (Array.isArray(c.hp) && c.hp.length === 10) cfg.hp = c.hp.map(x => Math.max(0, Math.min(99, x | 0)));
  if (Array.isArray(c.obv) && c.obv.length === HZ.OBJ.length) cfg.obv = c.obv.map(x => Math.max(0, Math.min(99, x | 0)));
  cfg.obon = cfg.od > 0;
}
function makeRoom(hostName, game) {
  game = game || 'huzzah';
  const room = { code: newCode(), game, size: 4, cfg: ENGINES[game].defaultCfg(), seats: [], g: null, touched: Date.now() };
  rooms.set(room.code, room);
  addSeat(room, hostName);
  return room;
}
function addSeat(room, name) {
  const used = new Set(room.seats.map(s => s.name.toLowerCase()));
  let nm = name, k = 2;
  while (used.has(nm.toLowerCase())) nm = name + ' ' + (k++);
  const seat = { token: newToken(), name: nm, bot: false, ws: null };
  room.seats.push(seat);
  return seat;
}
const humans = room => room.seats.filter(s => !s.bot);
const hostSeat = room => room.seats.findIndex(s => !s.bot); // first human is host

function roomInfo(room, me) {
  return {
    code: room.code, size: room.size, cfg: room.cfg, started: !!room.g, you: me, host: hostSeat(room),
    seats: room.seats.map(s => ({ name: s.name, bot: s.bot, online: s.bot || !!(s.ws && s.ws.readyState === 1) })),
  };
}
function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room) {
  room.touched = Date.now();
  room.seats.forEach((s, i) => {
    if (s.ws) send(s.ws, { t: 'state', room: roomInfo(room, i), g: room.g ? E(room).view(room.g, i) : null });
  });
}
function startGame(room) {
  // fill empty seats with bots up to the chosen table size
  let b = 1;
  while (room.seats.length < room.size) {
    let nm; do { nm = 'Bot ' + (b++); } while (room.seats.some(s => s.name === nm));
    room.seats.push({ token: newToken(), name: nm, bot: true, ws: null });
  }
  room.g = E(room).newGame(room.seats.map(s => ({ name: s.name, bot: s.bot })), room.cfg);
}
function maybeReveal(room) {
  const g = room.g;
  if (g && E(room).allIn(g)) E(room).reveal(g);
}
function maybeAdvance(room) {
  const g = room.g;
  if (!g || g.phase !== 'show') return;
  // advance when every connected human has pressed Continue (at least one)
  const live = room.seats.map((s, i) => i).filter(i => !room.seats[i].bot && room.seats[i].ws && room.seats[i].ws.readyState === 1);
  if (live.length && live.every(i => g.P[i].cont)) E(room).nxt(g);
}

/* ---------- websocket protocol ---------- */
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
wss.on('connection', ws => {
  ws.room = null; ws.seat = -1; ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  const err = m => send(ws, { t: 'error', msg: m });
  const bind = (room, i) => {
    const s = room.seats[i];
    if (s.ws && s.ws !== ws) { send(s.ws, { t: 'kicked', msg: 'You opened this game somewhere else.' }); s.ws.room = null; }
    s.ws = ws; ws.room = room; ws.seat = i;
    send(ws, { t: 'joined', code: room.code, token: s.token });
    broadcast(room);
  };
  ws.on('message', data => {
    let m; try { m = JSON.parse(data); } catch { return; }
    const room = ws.room, i = ws.seat;
    const isHost = room && i === hostSeat(room);
    switch (m.t) {
      case 'create': { const r = makeRoom(clean(m.name, 'Host'), gameOf(m)); return bind(r, 0); }
      case 'solo': {
        const r = makeRoom(clean(m.name, 'You'), gameOf(m));
        r.size = Math.max(2, Math.min(6, m.size | 0 || 4));
        applyCfg(r.cfg, m.cfg);
        startGame(r); return bind(r, 0);
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return err('No game with that code. Check the code with your host.');
        if (r.game !== gameOf(m)) return err(r.game === 'squire' ? 'That code is for a SQUIRE game. Open SQUIRE to join it.' : 'That code is for a HUZZAH! game. Open HUZZAH! to join it.');
        if (r.g) return err('That game has already started.');
        if (r.seats.length >= r.size) return err('That table is full.');
        const s = addSeat(r, clean(m.name, 'Player'));
        return bind(r, r.seats.indexOf(s));
      }
      case 'rejoin': {
        const r = rooms.get(String(m.code || '').toUpperCase());
        const idx = r && r.game === gameOf(m) ? r.seats.findIndex(s => s.token === m.token && !s.bot) : -1;
        if (idx < 0) return send(ws, { t: 'gone' });
        return bind(r, idx);
      }
    }
    if (!room) return;
    const g = room.g;
    switch (m.t) {
      case 'size':
        if (!isHost || g) return;
        room.size = Math.max(Math.max(2, room.seats.length), Math.min(6, m.size | 0));
        break;
      case 'cfg': {
        if (!isHost || g) return;
        applyCfg(room.cfg, m.cfg);
        break;
      }
      case 'kick': {
        const k = m.seat | 0;
        if (!isHost || g || k === i || !room.seats[k]) return;
        const s = room.seats.splice(k, 1)[0];
        if (s.ws) { send(s.ws, { t: 'kicked', msg: 'The host removed you from the table.' }); s.ws.room = null; }
        room.seats.forEach((st, j) => { if (st.ws) st.ws.seat = j; });
        break;
      }
      case 'start':
        if (!isHost || g) return;
        startGame(room);
        break;
      case 'obj':
        if (!g || !E(room).pickObj(g, i, m.k)) return;
        break;
      case 'play':
        if (!g || !E(room).play(g, i, m.cards)) return err('Those cards can’t be played right now.');
        maybeReveal(room);
        break;
      case 'unplay':
        if (!g || !E(room).unplay(g, i)) return;
        break;
      case 'place': // SQUIRE: put an earned trophy, crown or boon on your scorecard
        if (!g || !E(room).place || !E(room).place(g, i, m.col | 0)) return err('That piece can’t go there.');
        break;
      case 'cont':
        if (!g || g.phase !== 'show') return;
        if (g.P[i].pd && g.P[i].pd.length) return err('Place your pieces on your board first.');
        g.P[i].cont = true;
        maybeAdvance(room);
        break;
      case 'botify': { // host hands a disconnected player's seat to a bot
        const k = m.seat | 0, s = room.seats[k];
        if (!isHost || !g || !s || s.bot || k === i) return;
        if (s.ws && s.ws.readyState === 1) return err('That player is still connected.');
        s.bot = true; g.P[k].bot = true; g.P[k].sel = null;
        if (g.P[k].ob == null && g.P[k].oc.length) g.P[k].ob = g.P[k].oc[0];
        maybeReveal(room); maybeAdvance(room);
        break;
      }
      case 'again':
        if (!isHost || !g || g.phase !== 'end') return;
        room.g = E(room).newGame(room.seats.map(s => ({ name: s.name, bot: s.bot })), room.cfg);
        break;
      case 'lobby': // host returns everyone to the lobby after a game
        if (!isHost || !g || g.phase !== 'end') return;
        room.g = null; room.seats = room.seats.filter(s => !s.bot);
        room.seats.forEach((st, j) => { if (st.ws) st.ws.seat = j; });
        room.size = Math.max(room.size, room.seats.length);
        break;
      case 'leave': {
        if (g) { // mid-game: a bot takes over the seat
          const s = room.seats[i]; s.bot = true; g.P[i].bot = true; g.P[i].sel = null; s.ws = null;
          if (g.P[i].ob == null && g.P[i].oc.length) g.P[i].ob = g.P[i].oc[0];
          maybeReveal(room); maybeAdvance(room);
        } else {
          room.seats.splice(i, 1);
          room.seats.forEach((st, j) => { if (st.ws) st.ws.seat = j; });
        }
        ws.room = null; ws.seat = -1;
        if (!humans(room).length) { rooms.delete(room.code); return; }
        break;
      }
      default: return;
    }
    broadcast(room);
  });
  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    const s = room.seats[ws.seat];
    if (s && s.ws === ws) s.ws = null;
    if (room.g) maybeAdvance(room); // a leaver shouldn't stall "Continue"
    broadcast(room);
  });
});

// keep connections healthy and drop abandoned rooms
setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.alive) return ws.terminate(); ws.alive = false; try { ws.ping(); } catch {} });
  const now = Date.now();
  for (const [code, r] of rooms) {
    const online = r.seats.some(s => s.ws && s.ws.readyState === 1);
    if (!online && now - r.touched > 6 * 3600e3) rooms.delete(code);
  }
}, 30000);

server.listen(PORT, () => console.log('HUZZAH! server on port ' + PORT));
