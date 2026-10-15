// End-to-end protocol test: host + 2 friends + 1 bot play a full tournament.
const { spawn } = require('child_process');
const PORT = 3999;
const srv = spawn('node', ['server.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket('ws://localhost:' + PORT);
  const c = { ws, name, state: null, msgs: [], errors: [] };
  ws.onmessage = e => { const m = JSON.parse(e.data); c.msgs.push(m); if (m.t === 'state') c.state = m; if (m.t === 'joined') { c.code = m.code; c.token = m.token; } if (m.t === 'error') c.errors.push(m.msg); };
  c.send = m => ws.send(JSON.stringify(m));
  c.open = new Promise(r => ws.onopen = r);
  return c;
}
const until = async (f, ms = 3000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout'); await sleep(10); } };
(async () => {
  await sleep(500);
  const host = client('Nate'); await host.open; host.send({ t: 'create', name: 'Nate' });
  await until(() => host.code);
  const a = client('Ann'), b = client('Bob'); await a.open; await b.open;
  a.send({ t: 'join', code: host.code.toLowerCase(), name: 'Ann' }); b.send({ t: 'join', code: host.code, name: 'Bob' });
  await until(() => host.state && host.state.room.seats.length === 3);
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
  console.log('ALL TESTS PASSED');
  srv.kill(); process.exit(0);
})().catch(e => { console.error('FAIL', e); srv.kill(); process.exit(1); });
