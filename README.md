# HUZZAH! Tournament of Champions

A poker-inspired card game of timing and hand management for 2–6 players, playable online with friends (or solo against bots) in any browser, on phone or desktop.

## Playing with friends

1. Open the site, enter your name and tap **Create game**. You get a 4-letter room code.
2. Tap **Invite friends** to share the link, or just tell them the code. They open the site, tap **Join game** and enter it.
3. As host, choose the table size (2–6). Any empty seats are filled by bots when you tap **Start the tournament**.
4. Everyone picks their cards at the same time and taps **Lock in**. When the last player locks in, all cards are revealed together. Everyone taps **Continue** to move on.

If someone's connection drops, they reopen the page and rejoin their seat automatically. If a friend leaves for good, the host can tap **Let a bot play** on their seat.

**Play solo vs bots** on the home screen starts a practice game straight away.

## How it works

| File | Purpose |
| --- | --- |
| `server.js` | Node server: serves the page and runs game rooms over WebSocket. Game state lives on the server, so players only ever see their own hand. |
| `miniws.js` | Small built-in WebSocket implementation (no npm dependencies). |
| `public/engine.js` | The game rules (deal, events, nobles, objectives, scoring, bots). Shared by server and browser. |
| `public/index.html` | The game page: home, lobby and table. |
| `public/assets.js` | Card, noble and objective artwork. |
| `test/multi.test.js` | End-to-end test: host + 2 friends + a bot play a full tournament, with a reconnect. |

Run locally: `npm start`, then open http://localhost:3000 in a few browser tabs. Run the test: `npm test`.

## Deployment

Hosted on Render as a Node web service (see `render.yaml`). Every push to `main` redeploys automatically.

On Render's free plan the server sleeps after about 15 minutes without visitors; the first visit after that takes up to a minute to wake it. Rooms are kept in memory, so a redeploy or restart ends any games in progress.

## Game overview

- Four days, each with five events: Archery, Sword Fight, Joust, Grand Melee, Champion.
- Each event you play cards from your hand alongside community cards; the best poker hand wins that event's trophy card.
- Nobles reward special plays (lowest pair, biggest gap, highest Spade, and so on) with bonus points.
- Each player keeps one secret objective for extra points.
- Final score = your best five-card trophy hand + noble points + secret objective.

Tap **Rules** in the game for the full rules. The host can adjust scoring in **Playtest settings** in the lobby.
