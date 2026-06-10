/**
 * CouchCircle smoke test — protocol checks a-n.
 * Node v25, native fetch + WebSocket. No extra deps.
 * Exit code = number of failures.
 */

const LOBBY = 'http://127.0.0.1:1999/parties/lobby/index';
const ROOM_WS = (id) => `ws://127.0.0.1:1999/parties/main/${id}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let failures = 0;

function log(ok, label, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

/** Open a WebSocket and return a client object with helpers. */
function makeClient(url) {
  const ws = new WebSocket(url);
  const msgs = [];       // parsed server messages
  const waiters = [];    // { pred, resolve, reject }

  ws.addEventListener('message', (ev) => {
    let parsed;
    try { parsed = JSON.parse(ev.data); } catch { return; }
    msgs.push(parsed);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(parsed)) {
        const [w] = waiters.splice(i, 1);
        w.resolve(parsed);
      }
    }
  });

  /** Wait until a predicate is satisfied (on any buffered OR future message). */
  function expect(pred, timeoutMs = 3000, label = '') {
    // Check already-buffered
    const existing = msgs.find(pred);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const idx = waiters.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) waiters.splice(idx, 1);
        reject(new Error(`timeout waiting for predicate${label ? ' ' + label : ''}`));
      }, timeoutMs);
      waiters.push({
        pred,
        resolve: (v) => { clearTimeout(t); resolve(v); },
        reject,
      });
    });
  }

  /** Expect any message matching pred, clearing ALL buffered msgs first so we
   *  only match future messages from this point forward. Use after a command. */
  function expectFresh(pred, timeoutMs = 3000, label = '') {
    msgs.length = 0;
    return expect(pred, timeoutMs, label);
  }

  function send(obj) {
    ws.send(JSON.stringify(obj));
  }

  function close() {
    try { ws.close(); } catch {}
  }

  /** Wait until the socket is open. */
  function opened() {
    if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (e) => reject(new Error('ws error')));
    });
  }

  return { ws, msgs, expect, expectFresh, send, close, opened };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function run() {
  // -------------------------------------------------------------------------
  // a. Lobby create
  // -------------------------------------------------------------------------
  let roomId, joinCode;
  try {
    const res = await fetch(LOBBY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create' }),
    });
    const body = await res.json();
    const ok = res.status === 200 && typeof body.roomId === 'string' && typeof body.joinCode === 'string';
    log(ok, 'a. lobby:create', ok ? `roomId=${body.roomId} joinCode=${body.joinCode}` : JSON.stringify(body));
    roomId = body.roomId;
    joinCode = body.joinCode;
    if (!ok) throw new Error('lobby create failed — cannot continue');
  } catch (e) {
    log(false, 'a. lobby:create', e.message);
    process.exit(failures);
  }

  // -------------------------------------------------------------------------
  // b. Lobby resolve
  // -------------------------------------------------------------------------
  try {
    const res = await fetch(`${LOBBY}?code=${encodeURIComponent(joinCode)}`);
    const body = await res.json();
    const ok = res.status === 200 && body.roomId === roomId;
    log(ok, 'b. lobby:resolve (good code)', `status=${res.status} roomId=${body.roomId}`);
  } catch (e) {
    log(false, 'b. lobby:resolve (good code)', e.message);
  }

  try {
    const res = await fetch(`${LOBBY}?code=GARBAGE-INVALID-CODE-XYZ`);
    const ok = res.status === 404;
    log(ok, 'b. lobby:resolve (garbage → 404)', `status=${res.status}`);
  } catch (e) {
    log(false, 'b. lobby:resolve (garbage → 404)', e.message);
  }

  // -------------------------------------------------------------------------
  // c. Client A joins as creator
  // -------------------------------------------------------------------------
  const clientA = makeClient(ROOM_WS(roomId));
  await clientA.opened();
  clientA.send({
    type: 'room:join',
    participant: { id: 'smoke-a', name: 'Smokey', avatar: 'goblin', accent: '#d49a6a' },
    create: { joinCode },
  });

  let joinedA;
  try {
    joinedA = await clientA.expect((m) => m.type === 'joined', 5000, 'joined(A)');
    const ok =
      joinedA.selfId === 'smoke-a' &&
      joinedA.state?.joinCode === joinCode &&
      joinedA.state?.hostId === 'smoke-a';
    log(ok, 'c. A joined with selfId + joinCode + hostId',
      `selfId=${joinedA.selfId} hostId=${joinedA.state?.hostId} joinCode=${joinedA.state?.joinCode}`);
  } catch (e) {
    log(false, 'c. A joined', e.message);
    process.exit(failures);
  }

  // -------------------------------------------------------------------------
  // d. Client B joins; A receives room:state with both participants
  // -------------------------------------------------------------------------
  const clientB = makeClient(ROOM_WS(roomId));
  await clientB.opened();
  clientB.send({
    type: 'room:join',
    participant: { id: 'smoke-b', name: 'Biscuit', avatar: 'frog', accent: '#6f8f6a' },
  });

  let joinedB;
  try {
    joinedB = await clientB.expect((m) => m.type === 'joined', 5000, 'joined(B)');
    log(joinedB?.selfId === 'smoke-b', 'd. B joined', `selfId=${joinedB?.selfId}`);
  } catch (e) {
    log(false, 'd. B joined', e.message);
  }

  // A should receive a room:state with both participants
  try {
    // Clear buffered, wait for next broadcast after B joined
    const stateWithBoth = await clientA.expect(
      (m) => m.type === 'room:state' && m.state?.participants?.['smoke-b'] !== undefined,
      5000,
      'state with B',
    );
    const hasBoth =
      stateWithBoth.state.participants['smoke-a'] !== undefined &&
      stateWithBoth.state.participants['smoke-b'] !== undefined;
    log(hasBoth, 'd. A sees both participants', `keys=${Object.keys(stateWithBoth.state.participants).join(',')}`);
  } catch (e) {
    log(false, 'd. A sees both participants', e.message);
  }

  // -------------------------------------------------------------------------
  // e. Ping → pong
  // -------------------------------------------------------------------------
  try {
    const t0 = Date.now();
    clientA.msgs.length = 0;
    clientA.send({ type: 'ping', t0 });
    const pong = await clientA.expect((m) => m.type === 'pong', 3000, 'pong');
    const t0ok = pong.t0 === t0;
    const snOk = typeof pong.serverNow === 'number' && pong.serverNow >= t0 && pong.serverNow <= Date.now() + 500;
    log(t0ok && snOk, 'e. ping → pong', `t0match=${t0ok} serverNow=${pong.serverNow} sanity=${snOk}`);
  } catch (e) {
    log(false, 'e. ping → pong', e.message);
  }

  // -------------------------------------------------------------------------
  // f. Chat message — both see room:state with chat length 1
  // -------------------------------------------------------------------------
  try {
    const beforeSnA = Date.now();
    // clear A's buffer and B's buffer
    clientA.msgs.length = 0;
    clientB.msgs.length = 0;
    clientA.send({ type: 'chat:message', text: 'hello from the couch' });
    const [stateA, stateB] = await Promise.all([
      clientA.expect((m) => m.type === 'room:state' && m.state?.chat?.length >= 1, 3000, 'chat state A'),
      clientB.expect((m) => m.type === 'room:state' && m.state?.chat?.length >= 1, 3000, 'chat state B'),
    ]);
    const chatTextA = stateA.state.chat[stateA.state.chat.length - 1]?.text;
    const chatTextB = stateB.state.chat[stateB.state.chat.length - 1]?.text;
    const ok = chatTextA === 'hello from the couch' && chatTextB === 'hello from the couch';
    log(ok, 'f. chat:message both see chat length 1+', `textA="${chatTextA}" textB="${chatTextB}"`);
  } catch (e) {
    log(false, 'f. chat:message', e.message);
  }

  // -------------------------------------------------------------------------
  // g. queue:add + queue:play
  // -------------------------------------------------------------------------
  let queueItemId;
  let seqBeforePlay;
  let serverNowBeforePlay;
  try {
    clientA.msgs.length = 0;
    clientA.send({
      type: 'queue:add',
      item: { type: 'youtube', source: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
    });
    const addState = await clientA.expect(
      (m) => m.type === 'room:state' && m.state?.queue?.length >= 1,
      3000,
      'queue add',
    );
    log(addState.state.queue.length >= 1, 'g. queue:add → queue length 1+', `len=${addState.state.queue.length}`);
    queueItemId = addState.state.queue[addState.state.queue.length - 1].id;
    seqBeforePlay = addState.state.media.seq;
    serverNowBeforePlay = addState.serverNow;
  } catch (e) {
    log(false, 'g. queue:add', e.message);
  }

  if (queueItemId) {
    try {
      clientA.msgs.length = 0;
      clientA.send({ type: 'queue:play', itemId: queueItemId });
      const playState = await clientA.expect(
        (m) => m.type === 'room:state' && m.state?.media?.status === 'playing',
        3000,
        'queue:play',
      );
      const m = playState.state.media;
      const seqIncreased = m.seq > seqBeforePlay;
      const futureTs = m.updatedAtServerMs > serverNowBeforePlay;
      const adapterOk = m.adapter === 'youtube';
      const ok = m.status === 'playing' && seqIncreased && futureTs && adapterOk;
      log(ok, 'g. queue:play → playing+seq+future+adapter',
        `status=${m.status} seq=${m.seq}(was ${seqBeforePlay}) updatedAt=${m.updatedAtServerMs} serverNow=${serverNowBeforePlay} adapter=${m.adapter}`);
    } catch (e) {
      log(false, 'g. queue:play', e.message);
    }
  } else {
    log(false, 'g. queue:play', 'skipped — no queueItemId');
  }

  // -------------------------------------------------------------------------
  // h. B media:pause → error not-allowed (mode='request', B is not controller)
  // -------------------------------------------------------------------------
  try {
    clientB.msgs.length = 0;
    clientB.send({ type: 'media:pause' });
    const errMsg = await clientB.expect((m) => m.type === 'error' && m.code === 'not-allowed', 3000, 'not-allowed');
    log(true, 'h. B media:pause → error not-allowed', `code=${errMsg.code}`);

    // Verify state unchanged (still playing)
    // Get a fresh state for A
    clientA.msgs.length = 0;
    clientA.send({ type: 'ping', t0: Date.now() }); // trigger no state, but check current state
    // Actually check B's latest joined state
    const latestState = joinedB?.state;
    // We need to check that media is still playing — get a fresh state via B
    // The error was sent; no broadcast — so check via a fresh expect on next broadcast
    // Actually the server did NOT mutate state on error, so let's do a ping from A
    // and then request state indirectly. Let's rely on the pong + check A's last known state.
    // Check from the last room:state we have
    // We sent a ping to A — no state is broadcast. Let's check B's buffered messages for no playing→paused change
    // The simplest: send a harmless ping from A and verify we didn't get a paused state
    clientA.msgs.length = 0;
    clientA.send({ type: 'ping', t0: Date.now() });
    await clientA.expect((m) => m.type === 'pong', 1000);
    // Check none of the recent A messages changed media to paused
    const pausedInA = clientA.msgs.find((m) => m.type === 'room:state' && m.state?.media?.status === 'paused');
    log(!pausedInA, 'h. state still playing after B not-allowed', pausedInA ? 'got paused state' : 'no paused state');
  } catch (e) {
    log(false, 'h. B media:pause → not-allowed', e.message);
  }

  // -------------------------------------------------------------------------
  // i. A remote:pass to B; B media:pause succeeds
  // -------------------------------------------------------------------------
  try {
    clientA.msgs.length = 0;
    clientA.send({ type: 'remote:pass', toId: 'smoke-b' });
    const passState = await clientA.expect(
      (m) => m.type === 'room:state' && m.state?.remote?.controllerId === 'smoke-b',
      3000,
      'remote pass',
    );
    log(true, 'i. remote:pass → controllerId=smoke-b', `controllerId=${passState.state.remote.controllerId}`);
  } catch (e) {
    log(false, 'i. remote:pass', e.message);
  }

  try {
    clientB.msgs.length = 0;
    clientB.send({ type: 'media:pause' });
    const pauseState = await clientB.expect(
      (m) => m.type === 'room:state' && m.state?.media?.status === 'paused',
      3000,
      'pause',
    );
    log(pauseState.state.media.status === 'paused', 'i. B media:pause succeeds', `status=${pauseState.state.media.status}`);
  } catch (e) {
    log(false, 'i. B media:pause', e.message);
  }

  // Wait for A's action rate-limit window to clear before section j
  // (remote:pass in i consumes 1 slot; we need fresh budget for j)
  await sleep(5100);

  // -------------------------------------------------------------------------
  // j. Sesh mode
  // -------------------------------------------------------------------------
  try {
    // A sesh:enable true
    clientA.msgs.length = 0;
    clientA.send({ type: 'sesh:enable', enabled: true });
    const seshState = await clientA.expect(
      (m) => m.type === 'room:state' && m.state?.sesh?.enabled === true,
      3000,
      'sesh:enable',
    );
    log(seshState.state.sesh.enabled, 'j. sesh:enable', `enabled=${seshState.state.sesh.enabled}`);

    // A + B sesh:rotation:join
    await sleep(100);
    clientA.msgs.length = 0;
    clientA.send({ type: 'sesh:rotation:join' });
    await clientA.expect(
      (m) => m.type === 'room:state' && m.state?.sesh?.rotationIds?.includes('smoke-a'),
      3000,
      'rotation:join A',
    );
    await sleep(100);
    clientB.msgs.length = 0;
    clientB.send({ type: 'sesh:rotation:join' });
    const bothJoined = await clientB.expect(
      (m) => m.type === 'room:state' && m.state?.sesh?.rotationIds?.length >= 2,
      3000,
      'rotation:join B',
    );
    log(bothJoined.state.sesh.rotationIds.length >= 2, 'j. both in rotation',
      `rotationIds=${JSON.stringify(bothJoined.state.sesh.rotationIds)}`);

    // A sesh:rotation:start
    await sleep(100);
    clientA.msgs.length = 0;
    clientA.send({ type: 'sesh:rotation:start' });
    const rotActive = await clientA.expect(
      (m) => m.type === 'room:state' && m.state?.sesh?.rotationActive === true,
      3000,
      'rotation:start',
    );
    log(rotActive.state.sesh.rotationActive && rotActive.state.sesh.currentRotationIndex === 0,
      'j. rotation:start active index=0',
      `active=${rotActive.state.sesh.rotationActive} idx=${rotActive.state.sesh.currentRotationIndex}`);

    // A sesh:rotation:pass
    await sleep(100);
    clientA.msgs.length = 0;
    clientA.send({ type: 'sesh:rotation:pass' });
    const passed = await clientA.expect(
      (m) => m.type === 'room:state' && m.state?.sesh?.currentRotationIndex === 1,
      3000,
      'rotation:pass',
    );
    log(passed.state.sesh.currentRotationIndex === 1, 'j. rotation:pass → index 1',
      `idx=${passed.state.sesh.currentRotationIndex}`);

    // Wait for action rate-limit window to clear before countdown
    await sleep(5100);
    // A sesh:countdown:start 2
    const preCountdown = Date.now();
    clientA.msgs.length = 0;
    clientA.send({ type: 'sesh:countdown:start', seconds: 2 });
    const cdState = await clientA.expect(
      (m) => m.type === 'room:state' && typeof m.state?.sesh?.sparkCountdownEndsAt === 'number',
      3000,
      'countdown:start',
    );
    const endsAt = cdState.state.sesh.sparkCountdownEndsAt;
    const inFuture = endsAt > preCountdown;
    log(inFuture, 'j. sparkCountdownEndsAt in future', `endsAt=${endsAt} now=${preCountdown}`);

    // Wait ~2.5s for countdown to fire and clear
    await sleep(2500);
    // Check any subsequent room:state has sparkCountdownEndsAt cleared
    const cleared = clientA.msgs.find(
      (m) => m.type === 'room:state' && m.state?.sesh?.sparkCountdownEndsAt === undefined,
    );
    log(!!cleared, 'j. sparkCountdownEndsAt cleared after countdown', cleared ? 'cleared' : 'still set');
  } catch (e) {
    log(false, 'j. sesh checks', e.message);
  }

  // -------------------------------------------------------------------------
  // k. media:heartbeat from controller B with drifted position
  // -------------------------------------------------------------------------
  try {
    // B is controller; media is paused — first resume play so heartbeat is processed
    clientB.msgs.length = 0;
    clientB.send({ type: 'media:play' });
    const playing = await clientB.expect(
      (m) => m.type === 'room:state' && m.state?.media?.status === 'playing',
      3000,
      'play for heartbeat',
    );
    const seqBeforeHB = playing.state.media.seq;
    await sleep(600); // wait a tick so authoritative position advances a bit

    // Send a drifted heartbeat (position far off)
    const driftedPos = 99.9;
    clientB.msgs.length = 0;
    clientB.send({ type: 'media:heartbeat', position: driftedPos, status: 'playing' });
    const hbState = await clientB.expect(
      (m) => m.type === 'room:state' && Math.abs(m.state?.media?.position - driftedPos) < 2,
      3000,
      'heartbeat adopted',
    );
    const seqAfterHB = hbState.state.media.seq;
    const posAdopted = Math.abs(hbState.state.media.position - driftedPos) < 2;
    const seqUnchanged = seqAfterHB === seqBeforeHB;
    log(posAdopted && seqUnchanged, 'k. media:heartbeat adopts position, seq unchanged',
      `pos=${hbState.state.media.position}(want ~${driftedPos}) seq=${seqAfterHB}(was ${seqBeforeHB})`);
  } catch (e) {
    log(false, 'k. media:heartbeat', e.message);
  }

  // -------------------------------------------------------------------------
  // l. ready check
  // -------------------------------------------------------------------------
  try {
    // A is host; A starts ready check
    clientA.msgs.length = 0;
    clientA.send({ type: 'ready:start' });
    const rcState = await clientA.expect(
      (m) => m.type === 'room:state' && m.state?.readyCheck?.active === true,
      3000,
      'ready:start',
    );
    log(rcState.state.readyCheck.active, 'l. ready:start → readyCheck.active', `active=${rcState.state.readyCheck.active}`);

    // Both set ready
    clientA.msgs.length = 0;
    clientB.msgs.length = 0;
    clientA.send({ type: 'ready:set', ready: true });
    clientB.send({ type: 'ready:set', ready: true });

    // When everyone is ready, server clears readyCheck
    const clearedRC = await Promise.race([
      clientA.expect(
        (m) => m.type === 'room:state' && (m.state?.readyCheck === undefined || m.state?.readyCheck === null || m.state?.readyCheck?.active === false),
        5000,
        'ready cleared A',
      ),
      clientB.expect(
        (m) => m.type === 'room:state' && (m.state?.readyCheck === undefined || m.state?.readyCheck === null || m.state?.readyCheck?.active === false),
        5000,
        'ready cleared B',
      ),
    ]);
    const cleared = !clearedRC.state?.readyCheck || clearedRC.state.readyCheck.active === false;
    log(cleared, 'l. readyCheck cleared when everyone ready',
      `readyCheck=${JSON.stringify(clearedRC.state?.readyCheck)}`);
  } catch (e) {
    log(false, 'l. ready check', e.message);
  }

  // -------------------------------------------------------------------------
  // m. Password room
  // -------------------------------------------------------------------------
  let roomId2, joinCode2;
  try {
    const res = await fetch(LOBBY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create' }),
    });
    const body = await res.json();
    roomId2 = body.roomId;
    joinCode2 = body.joinCode;
    log(typeof roomId2 === 'string', 'm. second lobby:create', `roomId2=${roomId2} joinCode2=${joinCode2}`);
  } catch (e) {
    log(false, 'm. second lobby:create', e.message);
  }

  if (roomId2 && joinCode2) {
    // Brief pause to let the new room actor initialize
    await sleep(500);
    // Client C creates password room
    const clientC = makeClient(ROOM_WS(roomId2));
    await clientC.opened();
    clientC.send({
      type: 'room:join',
      participant: { id: 'smoke-c', name: 'Chalky', avatar: 'cat', accent: '#c97f9a' },
      // Creator must supply the password at top-level AND in create options:
      // create.password sets the room password; msg.password passes the gate.
      password: 'puff',
      create: { joinCode: joinCode2, password: 'puff' },
    });

    try {
      const joinedC = await clientC.expect((m) => m.type === 'joined', 10000, 'joined C');
      log(joinedC.selfId === 'smoke-c', 'm. C creates password room', `selfId=${joinedC.selfId}`);
    } catch (e) {
      log(false, 'm. C creates password room', e.message);
    }

    // Client D: no password → password-required
    const clientD1 = makeClient(ROOM_WS(roomId2));
    await clientD1.opened();
    clientD1.send({
      type: 'room:join',
      participant: { id: 'smoke-d', name: 'Dusty', avatar: 'sprout', accent: '#8aa9a0' },
    });
    try {
      const errNoPass = await clientD1.expect((m) => m.type === 'error', 3000, 'no-password error');
      log(errNoPass.code === 'password-required', 'm. D no password → password-required', `code=${errNoPass.code}`);
    } catch (e) {
      log(false, 'm. D no password → password-required', e.message);
    }
    clientD1.close();

    // Client D: wrong password → wrong-password
    const clientD2 = makeClient(ROOM_WS(roomId2));
    await clientD2.opened();
    clientD2.send({
      type: 'room:join',
      participant: { id: 'smoke-d', name: 'Dusty', avatar: 'sprout', accent: '#8aa9a0' },
      password: 'wrongpass',
    });
    try {
      const errWrong = await clientD2.expect((m) => m.type === 'error', 3000, 'wrong-password error');
      log(errWrong.code === 'wrong-password', 'm. D wrong password → wrong-password', `code=${errWrong.code}`);
    } catch (e) {
      log(false, 'm. D wrong password → wrong-password', e.message);
    }
    clientD2.close();

    // Client D: correct password → joined
    const clientD3 = makeClient(ROOM_WS(roomId2));
    await clientD3.opened();
    clientD3.send({
      type: 'room:join',
      participant: { id: 'smoke-d', name: 'Dusty', avatar: 'sprout', accent: '#8aa9a0' },
      password: 'puff',
    });
    try {
      const joinedD = await clientD3.expect((m) => m.type === 'joined', 5000, 'joined D');
      log(joinedD.selfId === 'smoke-d', 'm. D correct password → joined', `selfId=${joinedD.selfId}`);
    } catch (e) {
      log(false, 'm. D correct password → joined', e.message);
    }
    clientC.close();
    clientD3.close();
  } else {
    log(false, 'm. password room skipped', 'no roomId2');
  }

  // -------------------------------------------------------------------------
  // n. WebRTC relay: B → A
  // -------------------------------------------------------------------------
  try {
    clientA.msgs.length = 0;
    clientB.send({ type: 'webrtc:offer', toId: 'smoke-a', sdp: 'fake' });
    const offer = await clientA.expect(
      (m) => m.type === 'webrtc:offer' && m.fromId === 'smoke-b',
      3000,
      'webrtc offer relay',
    );
    log(offer.fromId === 'smoke-b' && offer.sdp === 'fake', 'n. webrtc:offer relayed A←B',
      `fromId=${offer.fromId} sdp=${offer.sdp}`);
  } catch (e) {
    log(false, 'n. webrtc:offer relay', e.message);
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  clientA.close();
  clientB.close();

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(`\n=== SMOKE TEST DONE: ${failures} failure(s) ===`);
  process.exit(failures);
}

run().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
