// SQUIRE end-to-end protocol test on the shared server: host + 2 friends + 1 bot play a full tournament.
const { spawn } = require('child_process');
const PORT = 3998;
const srv = spawn('node', ['server.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket('ws://localhost:' + PORT);
  const c = { ws, name, state: null, msgs: [], errors: [] };
  ws.onmessage = e => { const m = JSON.parse(e.data); c.msgs.push(m); if (m.t === 'state') c.state = m; if (m.t === 'joined') { c.code = m.code; c.token = m.token; } if (m.t === 'error') c.errors.push(m.msg); };
  c.send = m => ws.send(JSON.stringify(Object.assign({ game: 'squire' }, m)));
  c.sendRaw = m => ws.send(JSON.stringify(m));
  c.open = new Promise(r => ws.onopen = r);
  return c;
}
const HZE = require('../public/squire/engine.js');
/* SQUIRE: place any pending trophies/boons (first legal space) before continuing */
async function placeAll(c) { for (let t = 0; t < 8; t++) { const me = c.state.room.you, p = c.state.g.P[me]; if (!p.pd || !p.pd.length) return; const n = p.pd.length; c.send({ t: 'place', col: HZE.legal(p, p.pd[0])[0] }); await until(() => !c.state.g.P[me].pd || c.state.g.P[me].pd.length < n); } }
const until = async (f, ms = 3000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); await sleep(10); } };
(async () => {
  await sleep(500);
  const host = client('Nate'); await host.open; host.send({ t: 'create', name: 'Nate' });
  await until(() => host.code);
  const a = client('Ann'), b = client('Bob'); await a.open; await b.open;
  a.send({ t: 'join', code: host.code.toLowerCase(), name: 'Ann' }); b.send({ t: 'join', code: host.code, name: 'Bob' });
  await until(() => host.state && host.state.room.seats.length === 3);
  const hz = client('Hz'); await hz.open; hz.sendRaw({ t: 'join', code: host.code, name: 'Hz' }); await until(() => hz.errors.length);
  if (!/SQUIRE/.test(hz.errors[0])) throw new Error('HUZZAH client joined a SQUIRE room'); console.log('cross-game join blocked:', hz.errors[0]);
  host.send({ t: 'size', size: 4 });
  a.send({ t: 'start' }); // non-host start must be ignored
  await sleep(100); if (host.state.g) throw new Error('non-host started game');
  host.send({ t: 'start' });
  await until(() => [host, a, b].every(c => c.state && c.state.g));
  const P = [host, a, b];
  // hidden info check
  const v = a.state.g; if (v.P[0].hand !== null || v.P[1].hand === null || v.P[0].oc !== null) throw new Error('leaked hidden info');
  // try to play before choosing objective -> rejected
  a.send({ t: 'play', cards: v.P[1].hand.slice(0, 2) }); await until(() => a.errors.length);
  P.forEach((c, i) => c.send({ t: 'obj', k: i % 2 }));
  let events = 0, reconnected = false;
  while (true) {
    await sleep(30);
    const g = host.state.g;
    if (g.phase === 'end') break;
    if (g.phase === 'pick') {
      for (const c of P) {
        const me = c.state.room.you, mine = c.state.g.P[me];
        if (!mine.locked) {
          // illegal play: card not in hand
          if (events === 0 && c === b) c.send({ t: 'play', cards: [{ s: 9, r: 99 }, { s: 0, r: 2 }] });
          const k = [2, 2, 2, 2, 1][c.state.g.ev];
          c.send({ t: 'play', cards: mine.hand.slice(0, k) });
        }
      }
      await until(() => host.state.g.phase !== 'pick');
      events++;
      if (events === 7 && !reconnected) { // Bob drops and rejoins mid-game
        const code = b.code, token = b.token; b.ws.close(); await sleep(150);
        const nb = client('Bob'); await nb.open; nb.send({ t: 'rejoin', code, token });
        await until(() => nb.state && nb.state.g); P[2] = nb; reconnected = true;
        if (nb.state.room.you !== 2) throw new Error('rejoin got wrong seat');
      }
    } else if (g.phase === 'show') {
      const before = g.ev + g.wave * 5;
      for (const c of P) await placeAll(c);
      P[0].send({ t: 'cont' }); await sleep(50);
      if (host.state.g.phase !== 'show') throw new Error('advanced before everyone continued');
      P[1].send({ t: 'cont' }); P[2].send({ t: 'cont' });
      await until(() => host.state.g.phase !== 'show');
    }
  }
  const g = host.state.g;
  const objsVisible = g.P.every(p => p.ob !== null);
  console.log('events played:', events, '| trophies:', g.P.map(p => p.n + ' ' + p.tr.length).join(', '), '| objectives revealed at end:', objsVisible, '| reconnect ok:', reconnected);
  if (events !== 20 || !objsVisible) throw new Error('bad end state');
  // play again
  host.send({ t: 'again' }); await until(() => host.state.g.phase === 'pick' && host.state.g.hist.length === 0);
  // solo
  const s = client('Solo'); await s.open; s.send({ t: 'solo', name: 'Me', size: 6 });
  await until(() => s.state && s.state.g); if (s.state.g.P.length !== 6) throw new Error('solo size');
  // setup options + objective refills: 1 noble, deal 3 objectives, unlimited refills
  const o = client('Opt'); await o.open; o.send({ t: 'create', name: 'Opt' });
  await until(() => o.state && o.state.room);
  o.send({ t: 'cfg', cfg: { nn: 1, od: 3, rfl: 99 } }); o.send({ t: 'size', size: 4 });
  await until(() => o.state.room.cfg.rfl === 99 && o.state.room.size === 4);
  o.send({ t: 'start' }); await until(() => o.state.g);
  if (o.state.g.nobles.length !== 1) throw new Error('noble count option');
  if (o.state.g.P[0].oc.length !== 3) throw new Error('objective deal option');
  let refills = 0;
  while (o.state.g.phase !== 'end') {
    const g2 = o.state.g, mine = g2.P[0];
    if (mine.ob == null && mine.oc.length) { if (g2.hist.length) refills++; o.send({ t: 'obj', k: 0 }); await until(() => o.state.g.P[0].ob != null); continue; }
    if (g2.phase === 'pick' && !mine.locked) { o.send({ t: 'play', cards: mine.hand.slice(0, [2, 2, 2, 2, 1][g2.ev]) }); await until(() => o.state.g.phase !== 'pick' || o.state.g.P[0].locked || (o.state.g.P[0].ob == null && o.state.g.P[0].oc.length > 0)); await sleep(10); }
    else if (g2.phase === 'show') { await placeAll(o); const at = g2.wave * 5 + g2.ev; o.send({ t: 'cont' }); await until(() => o.state.g.phase !== 'show' || o.state.g.wave * 5 + o.state.g.ev !== at); }
    else await sleep(10);
  }
  const ge = o.state.g, done = ge.P.reduce((a, p) => a + p.done.length, 0);
  // completed objectives must be unique across the table
  const all = ge.P.flatMap(p => p.done.concat(p.ob != null ? [p.ob] : []));
  if (new Set(all).size !== all.length) throw new Error('duplicate objectives after refills');
  console.log('options game: nobles 1, deal 3 | objectives completed + refilled:', done, '| your refill picks:', refills);
  // engine-level refill check over many all-bot games
  const HZ = require('../public/squire/engine.js');
  let rf = 0, once = 0;
  for (let n = 0; n < 60; n++) {
    for (const rfl of [99, 1]) {
      const eg = HZ.newGame([1, 2, 3, 4].map(k => ({ name: 'B' + k, bot: true })), { od: 2, rfl, nn: 2 });
      while (eg.phase !== 'end') { HZ.reveal(eg); HZ.nxt(eg); }
      eg.P.forEach((p, i) => {
        if (p.rf > rfl) throw new Error('refill cap broken');
        if (rfl === 1 && p.rf) once++;
        const pts = p.done.reduce((a, ob) => a + HZ.obv(eg, ob), 0) + (p.ob != null && HZ.ach(eg, HZ.OBJ[p.ob], i) ? HZ.obv(eg, p.ob) : 0);
        if (pts !== HZ.obp(eg, i)) throw new Error('objective scoring mismatch');
        rf += p.rf;
      });
    }
  }
  console.log('engine refill check: refills across 120 bot games:', rf, '| capped-at-once games with a refill:', once);
  if (!rf || !once) throw new Error('no refills happened');
  console.log('ALL TESTS PASSED');
  srv.kill(); process.exit(0);
})().catch(e => { console.error('FAIL', e); srv.kill(); process.exit(1); });
