/* ═══════════════════════════════════════════════════════
   PERE'Z BURGER — sync.js
   Login (Supabase Auth) + sincronización con la nube.

   Cómo evita perder cambios:
   · Cada cambio queda guardado primero en este navegador y
     marcado como "pendiente" hasta que la nube lo confirme.
   · Antes de subir, baja la versión de la nube y FUSIONA los
     cambios registro por registro (merge de 3 vías contra la
     última versión sincronizada), en vez de pisar todo.
   · Después de subir, vuelve a leer para verificar. Si otro
     dispositivo escribió en el medio, reintenta la fusión.
   · Si no hay conexión, reintenta solo con espera creciente.
   · Revisa la nube cada 20 s y al volver a la pestaña.
═══════════════════════════════════════════════════════ */
'use strict';

const Sync = (() => {
  const CFG = window.PB_CONFIG || {};
  const CONFIGURED = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const BASE_KEY  = 'pb_sync_base';
  const DIRTY_KEY = 'pb_sync_dirty';
  const INFLIGHT_KEY = 'pb_sync_inflight';
  const META_KEYS = ['_rev', '_updatedAt', '_lineage'];

  // Rutas cuyos números son contadores: dos dispositivos que suman
  // a la vez se suman ambos (en vez de que uno pise al otro).
  const COUNTER_PATHS = [/^productos\.[^.]+$/];

  let client = null;
  let session = null;
  let hooks = {};
  let state = 'local';
  let lastSyncAt = 0;
  let running = false, again = false;
  let timer = null, pollTimer = null, histTimer = null;
  let retryDelay = 2000;

  // ─────────────────────── utilidades ───────────────────────
  const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const rid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    const ka = Object.keys(a).filter(k => a[k] !== undefined);
    const kb = Object.keys(b).filter(k => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }

  function stripMeta(d) {
    if (!d) return d;
    const c = { ...d };
    META_KEYS.forEach(k => delete c[k]);
    return c;
  }
  const sameContent = (a, b) => deepEqual(stripMeta(a), stripMeta(b));

  // ─────────────────────── merge de 3 vías ───────────────────────
  const isRecordArray = arrs => {
    let any = false;
    for (const a of arrs) {
      if (a === undefined) continue;
      if (!Array.isArray(a)) return false;
      for (const x of a) { if (!isObj(x) || !x.id) return false; any = true; }
    }
    return any;
  };
  const isPrimArray = arrs => arrs.every(a => a === undefined || (Array.isArray(a) && a.every(x => !isObj(x) && !Array.isArray(x))));

  // Rutas que pueden contener contadores (hay que bajar aunque local y remoto coincidan,
  // porque "los dos sumaron 1" se ve igual que "los dos pusieron el mismo valor").
  const COUNTER_PREFIX = /^$|^productos(\.[^.]+)?$/;

  function merge3(base, local, remote, path = '') {
    if (deepEqual(local, remote) && (deepEqual(base, local) || !COUNTER_PREFIX.test(path))) return clone(local);
    if (deepEqual(base, local))   return clone(remote);
    if (deepEqual(base, remote))  return clone(local);

    // Los dos cambiaron.
    if (typeof local === 'number' && typeof remote === 'number' && COUNTER_PATHS.some(r => r.test(path))) {
      const b = typeof base === 'number' ? base : 0;
      return Math.max(0, b + (local - b) + (remote - b));
    }
    // Uno lo borró y el otro lo modificó → conservar el modificado (nunca perder datos).
    if (local === undefined)  return clone(remote);
    if (remote === undefined) return clone(local);

    if (isObj(local) && isObj(remote)) {
      const b = isObj(base) ? base : {};
      const out = {};
      const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
      for (const k of keys) {
        const v = merge3(b[k], local[k], remote[k], path ? `${path}.${k}` : k);
        if (v !== undefined) out[k] = v;
      }
      return out;
    }

    if (Array.isArray(local) && Array.isArray(remote)) {
      const b = Array.isArray(base) ? base : [];
      if (isRecordArray([b, local, remote])) {
        const bm = new Map(b.map(x => [x.id, x]));
        const lm = new Map(local.map(x => [x.id, x]));
        const rm = new Map(remote.map(x => [x.id, x]));
        const order = [...local.map(x => x.id), ...remote.map(x => x.id).filter(id => !lm.has(id))];
        const out = [];
        for (const id of order) {
          const v = merge3(bm.get(id), lm.get(id), rm.get(id), path ? `${path}.*` : '*');
          if (v !== undefined) out.push(v);
        }
        return out;
      }
      if (isPrimArray([b, local, remote])) {
        const bs = new Set(b.map(x => JSON.stringify(x)));
        const ls = new Set(local.map(x => JSON.stringify(x)));
        const rs = new Set(remote.map(x => JSON.stringify(x)));
        const out = [];
        const seen = new Set();
        for (const x of [...local, ...remote]) {
          const k = JSON.stringify(x);
          if (seen.has(k)) continue;
          seen.add(k);
          const removed = bs.has(k) && (!ls.has(k) || !rs.has(k));
          if (!removed) out.push(x);
        }
        return out;
      }
    }
    // Conflicto en un valor simple: gana el cambio hecho en este dispositivo.
    return clone(local);
  }

  // ─────────────────────── almacenamiento local ───────────────────────
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { hooks.onStorageError && hooks.onStorageError(e); return false; }
  }
  const isDirty  = () => localStorage.getItem(DIRTY_KEY) === '1';
  const setDirty = v => { try { v ? localStorage.setItem(DIRTY_KEY, '1') : localStorage.removeItem(DIRTY_KEY); } catch (e) {} };

  // ─────────────────────── estado visual ───────────────────────
  function setState(s, detail) {
    state = s;
    hooks.onStatus && hooks.onStatus(s, { lastSyncAt, detail, pending: isDirty() });
  }

  // ─────────────────────── nube (Supabase Storage) ───────────────────────
  async function token() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    session = data.session;
    return session ? session.access_token : null;
  }

  async function req(method, path, body, extra = {}) {
    const t = await token();
    if (!t) return { ok: false, status: 401 };
    const headers = { apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + t };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    Object.assign(headers, extra);
    try {
      const r = await fetch(`${CFG.SUPABASE_URL}/storage/v1/${path}`, {
        method, headers, cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let json = null;
      if (r.ok) { try { json = await r.json(); } catch (e) {} }
      return { ok: r.ok, status: r.status, json };
    } catch (e) {
      return { ok: false, status: 0, network: true };
    }
  }

  const objPath = p => `object/${CFG.BUCKET}/${p}`;
  async function cloudGet(p) {
    const r = await req('GET', `${objPath(p)}?t=${Date.now()}`);
    // Supabase devuelve 400 con "not_found" en algunas versiones
    if (!r.ok && (r.status === 404 || r.status === 400)) return { ok: true, notFound: true, json: null };
    return r;
  }
  const cloudPut = (p, obj) => req('POST', objPath(p), obj, { 'x-upsert': 'true', 'cache-control': 'no-cache' });
  const cloudDel = p => req('DELETE', objPath(p));
  async function cloudList(prefix) {
    const r = await req('POST', `object/list/${CFG.BUCKET}`, { prefix, limit: 1000, offset: 0 });
    return r.ok && Array.isArray(r.json) ? r.json : null;
  }

  function failState(r) {
    if (r.status === 401 || r.status === 403) {
      setState('error', 'Sin permiso para la nube. Revisá la sesión o las políticas del bucket.');
    } else {
      setState(isDirty() ? 'pending' : 'offline');
    }
  }

  // ─────────────────────── ciclo de sincronización ───────────────────────
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }

  async function run() {
    if (!CONFIGURED || !session) return;
    if (running) { again = true; return; }
    running = true;
    try {
      await syncMain();
    } catch (e) {
      console.error('[sync]', e);
      setState('error', e.message);
    } finally {
      running = false;
      if (again) { again = false; schedule(300); }
    }
  }

  async function syncMain() {
    if (hooks.isBusy && hooks.isBusy()) { schedule(2500); return; }
    setState('syncing');

    const res = await cloudGet('current.json');
    if (!res.ok) { failState(res); retry(); return; }
    const remote = res.notFound ? null : res.json;
    resolveInflight(remote);

    const localAtStart = clone(hooks.getData());
    const base = lsGet(BASE_KEY);
    const readonly = hooks.isReadonly && hooks.isReadonly();

    let merged;
    if (!remote) {
      merged = localAtStart;
    } else if (!base) {
      // Primera sincronización en este navegador: gana la versión más nueva.
      merged = (localAtStart._updatedAt || 0) > (remote._updatedAt || 0) && isDirty() ? localAtStart : remote;
    } else {
      merged = merge3(stripMeta(base), stripMeta(localAtStart), stripMeta(remote));
    }

    if (!readonly && (!remote || !sameContent(merged, remote))) {
      const rev = rid();
      const lineage = [...new Set([...((remote && remote._lineage) || []), remote && remote._rev].filter(Boolean))];
      merged = { ...stripMeta(merged), _rev: rev, _updatedAt: Date.now(), _lineage: [...lineage, rev].slice(-40) };
      // Si la subida falla, el estado local no se toca (sus cambios siguen
      // pendientes respecto de la base) y se vuelve a fusionar en el próximo intento.
      const put = await cloudPut('current.json', merged);
      if (!put.ok) { setDirty(true); failState(put); retry(); return; }
      // La subida entró: se anota como "en vuelo" hasta confirmar que no la pisaron.
      lsSet(INFLIGHT_KEY, { rev, merged, localAtStart });
      const check = await cloudGet('current.json');
      if (!check.ok || check.notFound) { setDirty(true); failState(check); retry(); return; }
      resolveInflight(check.json);
      if (check.json._rev !== rev) {
        // Otro dispositivo escribió justo en el medio: volver a fusionar.
        setDirty(true);
        setState('syncing');
        schedule(1200);
        return;
      }
    } else if (remote) {
      lsSet(BASE_KEY, remote);
      applyLocal(localAtStart, remote, remote);
    }

    retryDelay = 2000;
    lastSyncAt = Date.now();
    setState(isDirty() ? 'pending' : 'synced');
    if (isDirty()) schedule(800);
  }

  // Si una subida anterior quedó sin confirmar, decide si llegó a la nube:
  // está confirmada si la versión remota es esa o desciende de ella.
  function resolveInflight(remote) {
    const inf = lsGet(INFLIGHT_KEY);
    if (!inf) return;
    try { localStorage.removeItem(INFLIGHT_KEY); } catch (e) {}
    if (remote && (remote._rev === inf.rev || (remote._lineage || []).includes(inf.rev))) {
      lsSet(BASE_KEY, inf.merged);
      applyLocal(inf.localAtStart, inf.merged, inf.merged);
    }
    // Si no, alguien la pisó sin incluirla: el estado local conserva los
    // cambios y la próxima fusión los vuelve a aplicar.
  }

  // Aplica el resultado al estado local sin perder lo que se haya editado mientras sincronizaba.
  function applyLocal(localAtStart, merged, confirmed) {
    const current = hooks.getData();
    let next = merged;
    if (!deepEqual(current, localAtStart)) {
      next = merge3(stripMeta(localAtStart), stripMeta(current), stripMeta(merged));
      next._updatedAt = Date.now();
    }
    const changed = !sameContent(next, current);
    hooks.setData(next);
    setDirty(confirmed ? !sameContent(next, confirmed) : true);
    if (changed) hooks.onRemoteApplied && hooks.onRemoteApplied();
  }

  function retry() {
    schedule(retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  }

  // ─────────────────────── historial de meses ───────────────────────
  // Cada mes archivado es un archivo historial/<Mes_Año>.json.
  // Los borrados se registran en data._historialBorrados para que
  // se propaguen a todos los dispositivos.
  let histRunning = false;
  async function syncHistorial() {
    if (!CONFIGURED || !session || histRunning) return;
    histRunning = true;
    try {
      const files = await cloudList('historial/');
      if (!files) return;
      const readonly = hooks.isReadonly && hooks.isReadonly();
      const borrados = (hooks.getData()._historialBorrados) || {};
      let local = hooks.getHistorial();
      let changed = false;
      const cloudMap = new Map(files.filter(f => f.name && f.name.endsWith('.json'))
        .map(f => [f.name.replace(/\.json$/, ''), f.updated_at || f.created_at || '']));

      // Borrados
      for (const mesAnio of Object.keys(borrados)) {
        if (local.some(h => h.mesAnio === mesAnio)) {
          local = local.filter(h => h.mesAnio !== mesAnio); changed = true;
        }
        if (cloudMap.has(mesAnio) && !readonly) { await cloudDel(`historial/${mesAnio}.json`); cloudMap.delete(mesAnio); }
      }

      // Subir meses nuevos o editados acá
      for (const h of local) {
        if (borrados[h.mesAnio]) continue;
        if (!readonly && (h._dirty || !cloudMap.has(h.mesAnio))) {
          const snap = { ...h }; delete snap._dirty; delete snap._cloudAt;
          const r = await cloudPut(`historial/${h.mesAnio}.json`, snap);
          if (r.ok) { h._dirty = false; h._cloudAt = null; changed = true; }
        }
      }

      // Bajar meses nuevos o editados en otro dispositivo
      const after = await cloudList('historial/');
      const afterMap = after ? new Map(after.filter(f => f.name.endsWith('.json'))
        .map(f => [f.name.replace(/\.json$/, ''), f.updated_at || f.created_at || ''])) : cloudMap;
      for (const [mesAnio, cloudAt] of afterMap) {
        if (borrados[mesAnio]) continue;
        const idx = local.findIndex(h => h.mesAnio === mesAnio);
        const cur = idx >= 0 ? local[idx] : null;
        if (cur && (cur._dirty || cur._cloudAt === cloudAt)) continue;
        const r = await cloudGet(`historial/${mesAnio}.json`);
        if (!r.ok || !r.json || !r.json.mesAnio) continue;
        const snap = r.json;
        if (!cur) { local.push({ ...snap, _cloudAt: cloudAt }); changed = true; }
        else {
          const curTs = cur.updatedAt || Date.parse(cur.timestamp) || 0;
          const snapTs = snap.updatedAt || Date.parse(snap.timestamp) || 0;
          if (snapTs >= curTs) local[idx] = { ...snap, _cloudAt: cloudAt };
          else local[idx] = { ...cur, _cloudAt: cloudAt };
          changed = true;
        }
      }

      if (changed) hooks.setHistorial(local, true);
    } catch (e) {
      console.error('[sync historial]', e);
    } finally {
      histRunning = false;
    }
  }

  // ─────────────────────── auth ───────────────────────
  function toEmail(u) {
    u = (u || '').trim().toLowerCase();
    return u.includes('@') ? u : `${u}@${CFG.USER_EMAIL_DOMAIN || 'perezburger.app'}`;
  }

  async function login(user, pass) {
    const { data, error } = await client.auth.signInWithPassword({ email: toEmail(user), password: pass });
    if (error) {
      const msg = /invalid/i.test(error.message) ? 'Usuario o contraseña incorrectos.'
        : /fetch|network/i.test(error.message) ? 'No hay conexión. Probá de nuevo.'
        : error.message;
      throw new Error(msg);
    }
    session = data.session;
    return data.user;
  }

  // Antes de salir sube todo lo pendiente. Devuelve false si quedó algo sin subir
  // (en ese caso no cierra la sesión, para no perder datos).
  async function logout(force = false) {
    if (CONFIGURED && session) {
      for (let i = 0; i < 40 && running; i++) await new Promise(r => setTimeout(r, 250));
      if (isDirty()) { await run(); if (isDirty()) await run(); }
      await syncHistorial();
      const histPend = (hooks.getHistorial() || []).some(h => h._dirty);
      if (!force && (isDirty() || histPend)) return false;
    }
    if (client) await client.auth.signOut();
    session = null;
    stop();
    return true;
  }

  function start() {
    if (!CONFIGURED) { setState('local'); return; }
    run();
    syncHistorial();
    clearInterval(pollTimer); clearInterval(histTimer);
    pollTimer = setInterval(() => { if (document.visibilityState === 'visible') run(); }, 20000);
    histTimer = setInterval(() => { if (document.visibilityState === 'visible') syncHistorial(); }, 120000);
  }
  function stop() {
    clearTimeout(timer); clearInterval(pollTimer); clearInterval(histTimer);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && session) { run(); }
  });
  window.addEventListener('online', () => { if (session) { retryDelay = 2000; run(); syncHistorial(); } });
  window.addEventListener('beforeunload', e => {
    if (CONFIGURED && session && isDirty() && !(hooks.isReadonly && hooks.isReadonly())) {
      e.preventDefault(); e.returnValue = '';
    }
  });

  // ─────────────────────── API pública ───────────────────────
  return {
    CONFIGURED,
    merge3, deepEqual,

    async init(h) {
      hooks = h;
      if (!CONFIGURED) return { mode: 'local' };
      if (!window.supabase) throw new Error('No se pudo cargar Supabase');
      client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pb_auth' },
      });
      const { data } = await client.auth.getSession();
      session = data.session;
      client.auth.onAuthStateChange((evt, s) => {
        session = s;
        if (evt === 'SIGNED_OUT') hooks.onSignedOut && hooks.onSignedOut();
      });
      return { mode: 'cloud', user: session ? session.user : null };
    },
    login, logout, start, stop,

    // Llamar después de cada cambio local.
    markDirty() {
      setDirty(true);
      if (!CONFIGURED) return;
      if (state !== 'syncing') setState('pending');
      schedule(900);
    },
    syncNow() { retryDelay = 2000; run(); syncHistorial(); },
    syncHistorial,
    resetLocal() { try { [BASE_KEY, DIRTY_KEY, INFLIGHT_KEY].forEach(k => localStorage.removeItem(k)); } catch (e) {} },
    get state() { return state; },
    get user() { return session ? session.user : null; },
  };
})();
