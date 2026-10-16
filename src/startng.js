// start.ng owns sign-in, players and the leaderboard. The game talks to it through the hidden
// start.ng/connect page with postMessage. It never sees passwords, emails or tokens.

function findStartNg() {
  if (location.hostname.endsWith('.start.ng')) return 'https://start.ng';
  return null; // opened locally or elsewhere: no start.ng, so the game plays as a guest
}

/** start.ng's address, or null when the game runs somewhere start.ng can't answer. */
export const START_NG = findStartNg();

let frame;
function connectFrame() {
  frame ??= new Promise((resolve, reject) => {
    const el = document.createElement('iframe');
    el.src = `${START_NG}/connect`;
    el.hidden = true;
    el.title = 'start.ng connection';
    el.addEventListener('load', () => resolve(el), { once: true });
    el.addEventListener('error', reject, { once: true });
    document.body.append(el);
  });
  return frame;
}

// Sends a message to start.ng/connect; resolves to its reply, or undefined if it didn't answer.
async function ask(message, replyType, timeoutMs = 5000) {
  if (!START_NG) return undefined;
  let el;
  try {
    el = await connectFrame();
  } catch {
    return undefined;
  }
  return new Promise((resolve) => {
    const requestId = Math.random().toString(36).slice(2);
    const done = (reply) => {
      clearTimeout(timer);
      removeEventListener('message', onMessage);
      resolve(reply);
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    function onMessage(e) {
      if (e.origin !== START_NG || e.source !== el.contentWindow) return;
      if (e.data?.type === replyType && e.data.requestId === requestId) done(e.data);
    }
    addEventListener('message', onMessage);
    el.contentWindow.postMessage({ ...message, requestId }, START_NG);
  });
}

const LOCAL_GUEST = { name: 'Guest', style: null, face: null };

/**
 * Who's playing: { user, guest } where user is the signed-in player ({ id, name, account, style,
 * face }) or null. Resolves to undefined if start.ng didn't answer.
 */
export async function whoami() {
  if (!START_NG) return { user: null, guest: LOCAL_GUEST };
  const reply = await ask({ type: 'startng:whoami' }, 'startng:user');
  if (!reply) return undefined;
  return { user: reply.user ?? null, guest: reply.guest ?? LOCAL_GUEST };
}

/** Calls fn with a fresh whoami() when the player comes back to this tab. */
export function onPlayerChange(fn) {
  const recheck = async () => {
    if (document.visibilityState !== 'visible') return;
    const who = await whoami();
    if (who) fn(who);
  };
  document.addEventListener('visibilitychange', recheck);
  addEventListener('focus', recheck);
}

/** Saves a run (the stats in startng.json). Resolves to { ok, result } or { ok: false, error }. */
export async function saveRun(stats) {
  const reply = await ask({ type: 'startng:score', stats }, 'startng:scoreSaved', 8000);
  return reply ?? { ok: false, error: "start.ng didn't answer" };
}

/** The top of the board: an array of entries, or null if it couldn't be read. */
export async function leaderboard(limit = 10) {
  const reply = await ask({ type: 'startng:leaderboard', limit }, 'startng:leaderboardData');
  return reply?.ok ? reply.entries : null;
}

/** Sends the player to start.ng to sign in; start.ng brings them back here. */
export function signIn() {
  location.href = `https://start.ng/?return_to=${encodeURIComponent(location.origin + location.pathname)}`;
}

/** True when start.ng opened the game for someone who chose to play as a guest. */
export const choseGuest = new URLSearchParams(location.search).has('guest');
