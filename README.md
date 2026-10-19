# The Pecking Order — multiplayer web game

A playable mobile-first multiplayer prototype. Each player joins on their own phone using a six-digit room code or shareable URL. No account required.

## Start locally

1. Install Node.js 20+.
2. Run `npm install` and `npm start`.
3. Visit `http://localhost:3000`.
4. To test with other phones on the same Wi-Fi, open `http://YOUR_COMPUTER_LAN_IP:3000` on each phone (allow local firewall access).

## Deploy publicly

Deploy this repository to a Node.js hosting service that supports persistent WebSocket connections (e.g. Render, Railway, Fly.io). Build command: `npm install`; start command: `npm start`. The service supplies `PORT`. Share the public URL with your players. HTTPS is provided by most hosting services.

**Important:** Rooms and scores are stored in server memory, so they reset on server restarts. A production release should add persistent storage (e.g. PostgreSQL/Redis), rate limits, moderation, reconnect timeouts, and automated tests. One server instance only: multi-instance deployments need a Socket.IO adapter and shared room state.

## Included modes

- **Classic:** Ranker secretly orders five cards; everyone else predicts the order. Exact position = 1 point, perfect order bonus = 2.
- **Defend Your Peck:** Judge assigns one card to each other player; they submit short written defenses. Judge awards 3 points to the favorite.
- **Blind Pecking:** Players receive one card at a time and insert it into their existing ranking without moving previous cards. Once everyone finishes, the server compares the result to the designated Ranker’s blind ranking and awards exact-position points. **This is a provisional scoring mechanic**: your original playtest notes do not define how blind ranking should be judged. Consider changing to a judge ranking or no-score mode.
- **Mixed:** Rotates Classic → Defend → Blind.

## Content

`cards.json` is a **curated subset** of your Google Drive Base Set, not the complete deck. Add the rest using the same `{ "id": 1, "text": "Being Kind", "category": "Golden Eggs" }` format. The current selection avoids some highly sensitive entries until the deck has a content review. `prompts.json` contains 20 How to Peck prompts. Some prompts may be a poor fit for some random card combinations; curate compatible prompt/card pools in a later version.

The original physical rulebook's winning target is inconsistent (25 vs 30 points). This prototype uses continuous play with a leaderboard and no enforced target until you decide.

## Privacy / behavior

Room codes are not passwords. Private submissions are sent only to the server and are hidden from other players until reveal. No player accounts or analytics. No server-side database or permanent player records. Room state is lost on restart. Only host can start rounds/change settings. The host must remain connected to advance. A player rejoining after game start must use their original browser's stored session token.

## Current limitations

- Category checkboxes only show categories already selected in the room; if the host deselects one and saves, it cannot be reselected without recreating the room. For production, send all available categories as separate metadata.
- If a player disconnects mid-round, the room waits only for currently connected players, but progression can require another submission event. Consider adding a host skip/force-reveal action.
- In Defend mode, the number of distinct assigned cards is limited to five; with larger rooms cards may repeat.
- Hand-drawn illustrations are not yet integrated. The design is a typography-first cream-paper prototype.
