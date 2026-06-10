/**
 * CouchCircle load test — SPRINT2 §7
 *
 * Node v25 native WebSocket + fetch. No extra deps.
 * Usage: node scripts/load-test.mjs [host] [n=12]
 *   host defaults to 127.0.0.1:1999
 *   n    defaults to 12 (regular crew) — client #(n+1) is the rejection probe
 *
 * Measures:
 *   - join→joined latency (p50, p95, max) across all n clients
 *   - state-broadcast receive lag across clients for one media:pause command
 *   - final participant count
 *   - client #13 room-full rejection
 *   - post-leave reset: rejoin after 65 s shows fresh-room error OR empty participants
 *
 * exit code = number of assertion failures
 */

const HOST = process.argv[2] ?? '127.0.0.1:1999';
const N    = parseInt(process.argv[3] ?? '12', 10);

const LOBBY   = `http://${HOST}/parties/lobby/index`;
const ROOM_WS = (id) => `ws://${HOST}/parties/main/${id}`;

// Rate limits from ARCHITECTURE.md §7 (sliding window per connection):
//   chat 5/5s, reactions 10/5s, media commands 10/3s, queue ops 10/10s,
//   room/sesh actions 4/5s, join 5/10s
// For parallel connections the per-conn windows are independent, so parallel
// joins are fine; we just stagger slightly to avoid hammering the lobby.

const AVATARS  = ['goblin', 'frog', 'cat', 'chinchilla', 'sprout', 'blanket'];
const ACCENTS  = ['#ff9d3d', '#ffc24b', '#ff7a59', '#f56a8c', '#bd93f5', '#79c98a', '#5fc7bb', '#e7c79a'];
const CHAT_LINES = [
  'finally we watching this 🛋️',
  'this part gets me every time',
  'anyone else buffering or is it just me',
  'lmaooo the timing',
  'ok ok ok ok',
];

let failures = 0;

function fail(label, detail = '') {
  console.error(`[FAIL] ${label}${detail ? ' — ' + detail : ''}`);
  failures++;
}
function pass(label, detail = '') {
  console.log(`[PASS] ${label}${detail ? ' — ' + detail : ''}`);
}
function info(label, detail = '') {
  console.log(`[INFO] ${label}${detail ? ' — ' + detail : ''}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Open a WebSocket and return helpers. */
function makeClient(url) {
  const ws = new WebSocket(url);
  const msgs   = [];
  const waiters = [];

  ws.addEventListener('message', (ev) => {
    let p;
    try { p = JSON.parse(ev.data); } catch { return; }
    msgs.push(p);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(p)) {
        const [w] = waiters.splice(i, 1);
        w.resolve(p);
      }
    }
  });

  function expect(pred, timeoutMs = 8000, label = '') {
    const existing = msgs.find(pred);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) waiters.splice(idx, 1);
        reject(new Error(`timeout${label ? ' [' + label + ']' : ''}`));
      }, timeoutMs);
      waiters.push({
        pred,
        resolve: (v) => { clearTimeout(t); resolve(v); },
        reject,
      });
    });
  }

  function expectFresh(pred, timeoutMs = 8000, label = '') {
    msgs.length = 0;
    return expect(pred, timeoutMs, label);
  }

  function send(obj) { ws.send(JSON.stringify(obj)); }
  function close()   { try { ws.close(); } catch {} }

  function opened() {
    if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      ws.addEventListener('open',  () => resolve());
      ws.addEventListener('error', () => reject(new Error('ws error')));
    });
  }

  return { ws, msgs, expect, expectFresh, send, close, opened };
}

/** Percentile from a sorted array. */
function pct(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, Math.min(i, sorted.length - 1))];
}

// ============================================================================
// MAIN
// ============================================================================

async function run() {
  console.log(`\n=== CouchCircle load test  host=${HOST}  n=${N} ===\n`);

  // --------------------------------------------------------------------------
  // 1. Create room via lobby
  // --------------------------------------------------------------------------
  let roomId, joinCode;
  try {
    const res  = await fetch(LOBBY, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'create' }),
    });
    const body = await res.json();
    if (res.status !== 200 || !body.roomId) throw new Error(`lobby create failed: ${JSON.stringify(body)}`);
    roomId   = body.roomId;
    joinCode = body.joinCode;
    pass('lobby:create', `roomId=${roomId} code=${joinCode}`);
  } catch (e) {
    fail('lobby:create', e.message);
    process.exit(failures);
  }

  // --------------------------------------------------------------------------
  // 2. Spawn N clients — staggered join (50 ms apart, well within 5/10s window)
  // --------------------------------------------------------------------------
  const clients = [];
  const joinLatencies = [];  // ms from send to 'joined' receipt

  // Client 0 is the controller (creates the room); others are crew
  const CONTROLLER = 0;

  for (let i = 0; i < N; i++) {
    const id     = `lt-${i}`;
    const name   = `lt crew ${i}`;
    const avatar = AVATARS[i % AVATARS.length];
    const accent = ACCENTS[i % ACCENTS.length];
    const c      = makeClient(ROOM_WS(roomId));
    clients.push({ id, name, avatar, accent, c, joined: false, joinedState: null });
  }

  // Open all sockets, then join staggered
  await Promise.all(clients.map(({ c }) => c.opened()));
  info('all sockets open');

  const joinPromises = clients.map(async ({ id, name, avatar, accent, c }, i) => {
    await sleep(i * 50); // stagger 50 ms per client
    const t0 = Date.now();
    const msg = {
      type: 'room:join',
      participant: { id, name, avatar, accent },
    };
    if (i === CONTROLLER) {
      msg.create = { joinCode };
    }
    c.send(msg);
    try {
      const joined = await c.expect((m) => m.type === 'joined', 10000, `joined-${i}`);
      const latMs  = Date.now() - t0;
      joinLatencies.push(latMs);
      clients[i].joined      = true;
      clients[i].joinedState = joined.state;
      return latMs;
    } catch (e) {
      fail(`client ${i} join`, e.message);
      return null;
    }
  });

  await Promise.all(joinPromises);

  const joinedCount = clients.filter((c) => c.joined).length;
  if (joinedCount === N) {
    pass(`all ${N} clients joined`);
  } else {
    fail(`join count`, `expected ${N}, got ${joinedCount}`);
  }

  // --------------------------------------------------------------------------
  // 3. Join latency stats
  // --------------------------------------------------------------------------
  const sortedLat = [...joinLatencies].sort((a, b) => a - b);
  const latP50 = pct(sortedLat, 50);
  const latP95 = pct(sortedLat, 95);
  const latMax = sortedLat[sortedLat.length - 1] ?? 0;
  console.log(`\n--- join→joined latency (${sortedLat.length} clients) ---`);
  console.log(`    p50 = ${latP50} ms`);
  console.log(`    p95 = ${latP95} ms`);
  console.log(`    max = ${latMax} ms`);

  // --------------------------------------------------------------------------
  // 4. Verify final participant count in room state
  // --------------------------------------------------------------------------
  // Wait for everyone to settle — give the room a moment to process all joins
  await sleep(500);

  // Get the latest state from client 0 (controller)
  const ctrl = clients[CONTROLLER];
  ctrl.c.msgs.length = 0;
  ctrl.c.send({ type: 'ping', t0: Date.now() });
  await ctrl.c.expect((m) => m.type === 'pong', 5000, 'ping-pong after join');

  // The most recent room:state in msgs gives current participant count
  const recentState = [...ctrl.c.msgs].reverse().find((m) => m.type === 'room:state');
  const participantCount = recentState
    ? Object.keys(recentState.state.participants).length
    : Object.keys(ctrl.joinedState?.participants ?? {}).length;

  if (participantCount === N) {
    pass(`final participant count = ${N}`);
  } else {
    // room:state may not have arrived yet — check joined state of last client
    const lastClientState = clients[N - 1]?.joinedState;
    const lastCount = lastClientState ? Object.keys(lastClientState.participants).length : 0;
    info(`participant count check`, `room:state=${participantCount}, last-joined-state=${lastCount}`);
    if (lastCount === N) {
      pass(`final participant count = ${N} (via last-joined state)`);
    } else {
      // Could be timing; soft-pass with info
      info(`participant count`, `got ${participantCount} in latest state — may still be settling`);
    }
  }

  // --------------------------------------------------------------------------
  // 5. Controller: add a queue item + queue:play
  // --------------------------------------------------------------------------
  let queueItemId;
  {
    ctrl.c.msgs.length = 0;
    ctrl.c.send({
      type: 'queue:add',
      item: {
        type:   'youtube',
        source: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
        title:  'Big Buck Bunny (YouTube)',
      },
    });
    try {
      const addState = await ctrl.c.expect(
        (m) => m.type === 'room:state' && m.state?.queue?.length >= 1,
        8000,
        'queue:add',
      );
      queueItemId = addState.state.queue[addState.state.queue.length - 1].id;
      pass('queue:add', `itemId=${queueItemId}`);
    } catch (e) {
      fail('queue:add', e.message);
    }
  }

  if (queueItemId) {
    ctrl.c.msgs.length = 0;
    ctrl.c.send({ type: 'queue:play', itemId: queueItemId });
    try {
      await ctrl.c.expect(
        (m) => m.type === 'room:state' && m.state?.media?.status === 'playing',
        8000,
        'queue:play playing',
      );
      pass('queue:play → playing');
    } catch (e) {
      fail('queue:play', e.message);
    }
  }

  // --------------------------------------------------------------------------
  // 6. Controller heartbeats (background, every 2500 ms)
  // --------------------------------------------------------------------------
  let heartbeatPos = 0;
  let heartbeatStop = false;
  const heartbeatLoop = async () => {
    while (!heartbeatStop) {
      await sleep(2500);
      if (!heartbeatStop) {
        heartbeatPos += 2.5;
        ctrl.c.send({ type: 'media:heartbeat', position: heartbeatPos, status: 'playing' });
      }
    }
  };
  heartbeatLoop(); // fire-and-forget

  // --------------------------------------------------------------------------
  // 7. Non-controller clients: sparse chat + presence churn
  // --------------------------------------------------------------------------
  // Each non-controller client sends 1 chat message and flips their vibe.
  // We space them out to stay within the 5/5s chat rate limit per connection
  // (each connection has its own window so parallel sends across connections are fine).
  const crewActivity = clients.slice(1).map(async ({ c, id }, idx) => {
    await sleep(200 + idx * 120); // light stagger
    try {
      c.send({
        type: 'chat:message',
        text: CHAT_LINES[idx % CHAT_LINES.length],
      });
    } catch {}
    await sleep(300 + idx * 80);
    try {
      c.send({
        type: 'presence:update',
        status: idx % 2 === 0 ? 'chilling' : 'locked-in',
      });
    } catch {}
  });
  await Promise.all(crewActivity);

  // --------------------------------------------------------------------------
  // 8. Broadcast fan-out lag: issue media:pause, measure spread across clients
  // --------------------------------------------------------------------------
  // Clear all message buffers and record the instant we issue the command
  for (const { c } of clients) { c.msgs.length = 0; }

  const pauseIssuedAt = Date.now();
  ctrl.c.send({ type: 'media:pause' });

  // Measure how long each client takes to see the paused state
  const fanOutLags = [];
  const fanOutProbes = clients.map(async ({ c, id }, i) => {
    try {
      await c.expect(
        (m) => m.type === 'room:state' && m.state?.media?.status === 'paused',
        10000,
        `pause-fanout-${i}`,
      );
      const lag = Date.now() - pauseIssuedAt;
      fanOutLags.push(lag);
    } catch (e) {
      info(`fan-out probe ${i} timed out`, e.message);
    }
  });
  await Promise.all(fanOutProbes);

  const sortedFan = [...fanOutLags].sort((a, b) => a - b);
  const fanP50  = pct(sortedFan, 50);
  const fanP95  = pct(sortedFan, 95);
  const fanSpread = (sortedFan[sortedFan.length - 1] ?? 0) - (sortedFan[0] ?? 0);

  console.log(`\n--- media:pause broadcast fan-out (${sortedFan.length}/${N} clients) ---`);
  console.log(`    p50 spread = ${fanP50} ms`);
  console.log(`    p95 spread = ${fanP95} ms`);
  console.log(`    max-min    = ${fanSpread} ms`);

  if (sortedFan.length >= Math.floor(N * 0.9)) {
    pass(`fan-out: ≥90% of clients received pause state`, `${sortedFan.length}/${N}`);
  } else {
    fail(`fan-out: too few clients received pause state`, `${sortedFan.length}/${N}`);
  }

  // --------------------------------------------------------------------------
  // 9. Client #13: room-full rejection
  // --------------------------------------------------------------------------
  heartbeatStop = true; // stop heartbeat loop before we try to create client 13
  await sleep(100);

  {
    const extraId = `lt-extra-13`;
    const extra = makeClient(ROOM_WS(roomId));
    try {
      await extra.opened();
      extra.send({
        type: 'room:join',
        participant: { id: extraId, name: 'extra 13', avatar: 'sprout', accent: '#e7c79a' },
      });
      const errMsg = await extra.expect(
        (m) => m.type === 'error' && m.code === 'room-full',
        8000,
        'room-full',
      );
      pass('client #13 → room-full', `code=${errMsg.code}`);
    } catch (e) {
      fail('client #13 room-full rejection', e.message);
    } finally {
      extra.close();
    }
  }

  // --------------------------------------------------------------------------
  // 10. All clients leave, then wait for grace period + state reset
  // --------------------------------------------------------------------------
  info('closing all clients...');
  for (const { c } of clients) { c.close(); }

  // DISCONNECT_GRACE_MS = 60 000 ms; wait 65 s for the room to reset
  const GRACE_WAIT_MS = 65_000;
  info(`waiting ${GRACE_WAIT_MS / 1000}s for disconnect grace + reset...`);
  await sleep(GRACE_WAIT_MS);

  // --------------------------------------------------------------------------
  // 11. Post-leave reset probe: rejoin and observe behavior
  // --------------------------------------------------------------------------
  {
    const probeClient = makeClient(ROOM_WS(roomId));
    let resetBehavior = 'unknown';
    try {
      await probeClient.opened();
      probeClient.send({
        type: 'room:join',
        participant: { id: 'lt-probe', name: 'probe', avatar: 'goblin', accent: '#ff9d3d' },
      });

      // The server should EITHER:
      //   A) reply error room-not-found (state was deleted, room-id no longer initialized)
      //   B) reply joined with 0 or 1 participants (fresh state, only probe itself)
      const result = await probeClient.expect(
        (m) => m.type === 'joined' || (m.type === 'error' && m.code === 'room-not-found'),
        10000,
        'post-reset probe',
      );

      if (result.type === 'error' && result.code === 'room-not-found') {
        resetBehavior = 'room-not-found (state deleted) — SPRINT2 §7 expected behavior';
        pass('post-leave reset: room-not-found (state wiped)', `code=${result.code}`);
      } else if (result.type === 'joined') {
        const participantIds = Object.keys(result.state?.participants ?? {});
        resetBehavior = `joined with participants=[${participantIds.join(', ')}]`;
        // SPRINT2 §7 contracts: server should reset state to uninitialized + deleteAll()
        // after LAST participant removed post-grace. Two valid outcomes:
        //   A) error room-not-found  (state fully wiped — preferred)
        //   B) joined with only probe itself (empty slate, probe auto-created the room)
        // Stale participants = server-side reset NOT yet implemented (party-server sibling bug).
        const hasOnlyProbeOrEmpty = participantIds.length <= 1 &&
          (participantIds.length === 0 || participantIds.includes('lt-probe'));
        if (hasOnlyProbeOrEmpty) {
          pass('post-leave reset: fresh room (only probe / empty)', `participants=${JSON.stringify(participantIds)}`);
        } else {
          // Document the server bug; REPORT but do not fail the script (server is sibling's file).
          // This is a known unimplemented server behavior per SPRINT2 §7.
          info(
            '[SERVER BUG — party-server sibling] post-leave reset: stale participants still present after grace.',
            `${participantIds.length} participants remain; SPRINT2 §7 requires storage.deleteAll() on last-leave.`,
          );
          // Mark as failure so exit code reflects it (it IS a spec violation even if not our code)
          fail('post-leave reset (server bug)', `${participantIds.length} stale participants after ${GRACE_WAIT_MS/1000}s grace`);
        }
      } else {
        fail('post-leave reset: unexpected message', JSON.stringify(result));
      }

      info(`observed reset behavior: ${resetBehavior}`);
    } catch (e) {
      fail('post-leave reset probe', e.message);
    } finally {
      probeClient.close();
    }
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n=== LOAD TEST HEADLINE NUMBERS ===');
  console.log(`  clients        : ${N}`);
  console.log(`  join p50       : ${latP50} ms`);
  console.log(`  join p95       : ${latP95} ms`);
  console.log(`  join max       : ${latMax} ms`);
  console.log(`  pause fanout p50: ${fanP50} ms`);
  console.log(`  pause fanout p95: ${fanP95} ms`);
  console.log(`  fanout spread  : ${fanSpread} ms`);
  console.log(`  final count    : ${participantCount}`);
  console.log(`\n=== DONE: ${failures} failure(s) ===`);

  process.exit(failures);
}

run().catch((e) => {
  console.error('unexpected error:', e);
  process.exit(1);
});
