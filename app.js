/* ═══════════════════════════════════════════════════════
   PERE'Z BURGER — app.js v3.0
   Cambios v3: login, sincronización con fusión de cambios,
   categorías de gastos persistentes, historial editable,
   carga rápida de días trabajados y rediseño visual.
═══════════════════════════════════════════════════════ */
'use strict';

// ─────────────────────────────────────────────────────
// 0. CONSTANTES
// ─────────────────────────────────────────────────────
const MAIN_KEY          = 'hamburgueseria_data';
const AUTOBACKUP_KEY    = 'hamburgueseria_autobackups';
const HISTORIAL_KEY     = 'perez_historial_meses';
const MAX_AUTOBACKUPS   = 5;
const AUTOBACKUP_EVERY  = 10 * 60 * 1000;

const MESES_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_NAMES  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

const CATEGORIAS_DEFAULT = ['Insumos','Servicios','Mantenimiento','Otros'];

// Paleta categórica de gráficos (orden fijo, validada para daltonismo)
const SERIES = ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'];
const BRAND  = '#C8102E';
const GREEN  = '#15803D';
const GRAY   = '#A1A1AA';

const PRODUCTOS_CONFIG = [
  { key: 'burgers',  label: 'Burgers'  },
  { key: 'dips',     label: 'Dips'     },
  { key: 'papas',    label: 'Papas'    },
  { key: 'nuggets',  label: 'Nuggets'  },
  { key: 'aros',     label: 'Aros'     },
  { key: 'boniatos', label: 'Boniatos' },
  { key: 'bebidas',  label: 'Bebidas'  },
];

const ARS_DENOMS = [20000, 10000, 2000, 1000, 500, 200, 100];

// Nombre del saludo (bienvenida, login y dashboard)
const NOMBRE_SALUDO = 'Emiliano';

const IS_READONLY =new URLSearchParams(location.search).get('readonly') === '1';
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches;

// Los campos numéricos no cambian con la ruedita del mouse ni con flechas
// (evita sumar o restar sin querer al cargar cantidades y montos).
document.addEventListener('wheel', e => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'number' && document.activeElement === e.target) e.target.blur();
}, { passive: true });
document.addEventListener('keydown', e => {
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.target instanceof HTMLInputElement && e.target.type === 'number') e.preventDefault();
});

const SECTIONS = {
  cierre:       { title: 'Cierre del día',          sub: 'Registrá ventas, productos y cobros de cada jornada' },
  dashboard:    { title: 'Dashboard',               sub: 'Cómo viene el mes de un vistazo' },
  stock:        { title: 'Stock',                   sub: 'Revisión semanal: qué está OK y qué hay que reponer' },
  ventas:       { title: 'Ventas por día',          sub: 'Detalle de cada día de venta del mes' },
  productos:    { title: 'Productos',               sub: 'Unidades vendidas en el mes' },
  gastosf:      { title: 'Gastos fijos',            sub: 'Alquiler, cuotas y otros gastos mensuales' },
  gastosg:      { title: 'Gastos generales',        sub: 'Compras y gastos variables del mes' },
  sueldos:      { title: 'Sueldos',                 sub: 'Días trabajados y sueldos del personal' },
  pagos:        { title: 'Formas de pago',          sub: 'Recaudación por plataforma' },
  balance:      { title: 'Balance general',         sub: 'Ingresos, egresos y ganancia del mes' },
  distribucion: { title: 'Distribución',            sub: 'Reparto de ganancias entre socios' },
  fondocomun:   { title: 'Fondo común',             sub: 'Movimientos y saldo del fondo' },
  resumen:      { title: 'Resumen del mes',         sub: 'Todo el mes en una sola pantalla' },
  historial:    { title: 'Historial de meses',      sub: 'Meses cerrados: consultá, editá o eliminá' },
  config:       { title: 'Configuración',           sub: 'Mes, socios, plataformas y backups' },
};

// ─────────────────────────────────────────────────────
// 1. UTILIDADES
// ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
// Id determinístico para datos viejos: dos dispositivos que migran
// los mismos datos generan los mismos ids (así la fusión no duplica).
const legacyId = (coll, rec, i) => 'm' + hashStr(coll + '|' + i + '|' + JSON.stringify(rec));

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function ic(name, cls = '') { return `<svg class="ic ${cls}"><use href="#i-${name}"/></svg>`; }

function fmt(n) {
  const num = Number(n) || 0;
  return (num < 0 ? '−$' : '$') + Math.round(Math.abs(num)).toLocaleString('es-AR');
}
function fmtCompact(n) {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  if (abs >= 1e6) return '$' + (num / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M';
  if (abs >= 1e3) return '$' + Math.round(num / 1e3).toLocaleString('es-AR') + ' k';
  return '$' + num.toLocaleString('es-AR');
}
function fmtInt(n) { return (Number(n) || 0).toLocaleString('es-AR'); }
function pct(a, b) {
  if (!b) return '0%';
  return ((a / b) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + '%';
}
function num(v) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
function int(v) { const n = parseInt(v, 10); return isFinite(n) ? n : 0; }

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayNameFromISO(iso) {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return DIAS_NAMES[new Date(y, m - 1, d).getDay()];
}
function formatDate(str) {
  if (!str) return '—';
  const p = str.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : str;
}
function formatDateShort(str) {
  if (!str) return '—';
  const p = str.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}` : str;
}
function mesAnioLabel(ma) { return String(ma || '').replace('_', ' '); }
function mesAnioOrder(ma) {
  const [m, y] = String(ma || '').split('_');
  const mi = MESES_NAMES.findIndex(x => x.toLowerCase() === (m || '').toLowerCase());
  return (parseInt(y, 10) || 0) * 12 + (mi < 0 ? 0 : mi);
}

function rowActions(editCall, delCall) {
  return `<div class="row-actions">
    ${editCall ? `<button class="icon-btn edit" onclick="${editCall}" title="Editar" aria-label="Editar">${ic('edit', 'ic-sm')}</button>` : ''}
    ${delCall ? `<button class="icon-btn danger" onclick="${delCall}" title="Eliminar" aria-label="Eliminar">${ic('trash', 'ic-sm')}</button>` : ''}
  </div>`;
}
function emptyRow(cols, text, icon = 'file') {
  return `<tr><td colspan="${cols}"><div class="empty-state">${ic(icon)}<div>${text}</div></div></td></tr>`;
}
function kpi({ label, icon, value, sub = '', cls = '', spark = null }) {
  return `<div class="kpi-card ${cls}${spark ? ' has-spark' : ''}">
    <div class="kpi-label">${icon ? ic(icon) : ''}${label}</div>
    <div class="kpi-value" title="${esc(value)}">${value}</div>
    <div class="kpi-sub">${sub}</div>
    ${spark ? sparkSVG(spark) : ''}
  </div>`;
}
// Mini línea de tendencia (ej. ventas por día) para una tarjeta
function sparkSVG(values) {
  const v = values.filter(x => isFinite(x));
  if (v.length < 2) return '';
  const W = 120, H = 34, max = Math.max(...v), min = Math.min(...v, 0), span = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * W, H - 3 - ((x - min) / span) * (H - 6)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path class="spark-area" d="${line}L${W},${H}L0,${H}Z"/>
    <path class="spark-line" d="${line}" pathLength="1"/>
    <circle class="spark-dot" cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.6"/>
  </svg>`;
}

// ── Animaciones ──
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let animateNext = false;   // los gráficos solo se animan al entrar a una sección

// Cuenta los números de las tarjetas desde 0 hasta su valor
function animateCounters(root) {
  if (REDUCED_MOTION || !root) return;
  root.querySelectorAll('.kpi-value, .flow-step .amt, .partner .p-amt').forEach(el => {
    const txt = el.textContent;
    if (/\//.test(txt)) return;                       // fechas: no se animan
    const m = txt.match(/-?\d[\d.]*(?:,\d+)?/);
    if (!m) return;
    const dec = (m[0].split(',')[1] || '').length;
    const target = parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
    if (!isFinite(target) || target === 0) return;
    const pre = txt.slice(0, m.index), post = txt.slice(m.index + m[0].length);
    // Conteo suave: arranca cerca del valor final y dura poco
    const from = target * 0.85, dur = 550, t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + (from + (target - from) * e).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + post;
      if (p < 1) requestAnimationFrame(step); else el.textContent = txt;
    };
    requestAnimationFrame(step);
  });
}
function kvRow(k, v, cls = '', rowCls = '') {
  return `<div class="kv-row ${rowCls}"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;
}

// ─────────────────────────────────────────────────────
// 2. DATOS POR DEFECTO Y MIGRACIÓN
// ─────────────────────────────────────────────────────
function makeDefaultData() {
  const now = new Date();
  return {
    config: {
      mes: MESES_NAMES[now.getMonth()],
      anio: now.getFullYear(),
      pctFondoComun: 10,
      socio1Nombre: 'Juan', socio1Pct: 60,
      socio2Nombre: 'Emi',  socio2Pct: 40,
      plataformas: ['Efectivo', 'Mercado Pago 1', 'Mercado Pago 2'],
      categoriasGastos: [...CATEGORIAS_DEFAULT],
    },
    ventas: [],
    productos: { burgers: 0, dips: 0, papas: 0, nuggets: 0, aros: 0, boniatos: 0, bebidas: 0 },
    pagos: [],
    balance: { ventas: 0, compras: 0, gastosFijos: 0, sueldos: 0 },
    adelantos: [],
    fondoComun: [],
    gastosFijosDetalle: [
      { id: uid(), nombre: 'Alquiler', monto: 0 },
      { id: uid(), nombre: 'Cuota Amasadora', monto: 0 },
    ],
    gastosGenerales: [],
    egresosGanancia: [],
    sueldosDetalle: ['Peter','Nati','Nano','Lucia'].map(n => ({
      id: uid(), nombre: n, funciones: [{ id: uid(), funcion: 'General', pagoPorDia: 30000 }],
    })),
    sueldosRegistros: [],
    _historialBorrados: {},
  };
}

const RECORD_COLLECTIONS = ['ventas','gastosGenerales','gastosFijosDetalle','adelantos','fondoComun','egresosGanancia','sueldosDetalle','sueldosRegistros','stockProductos','stockChecks'];

function migrateData(d) {
  if (!d || typeof d !== 'object') d = makeDefaultData();
  const def = makeDefaultData();
  const tieneCategorias = Array.isArray(d.config?.categoriasGastos) && d.config.categoriasGastos.length > 0;
  const tieneStock = Array.isArray(d.stockProductos);
  d.config = { ...def.config, ...(d.config || {}) };
  RECORD_COLLECTIONS.forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  // Productos de stock por defecto (ids fijos para que todos los dispositivos generen los mismos)
  if (!tieneStock) d.stockProductos = STOCK_DEFAULT.map((nombre, i) => ({ id: legacyId('stockDefault', { nombre }, i), nombre }));
  if (!d.productos)  d.productos = { ...def.productos };
  if (!d.balance)    d.balance   = { ...def.balance };
  if (!Array.isArray(d.pagos)) d.pagos = [];
  if (!d._historialBorrados || typeof d._historialBorrados !== 'object') d._historialBorrados = {};
  if (!Array.isArray(d.config.plataformas)) d.config.plataformas = [...def.config.plataformas];

  // Empleados al formato multi-función
  d.sueldosDetalle = d.sueldosDetalle.map(e => {
    if (e.funciones) return e;
    const { diasTrabajados, pagoPorDia, ...rest } = e;
    return { ...rest, funciones: [{ funcion: 'General', diasTrabajados: diasTrabajados || 0, pagoPorDia: pagoPorDia || 0 }] };
  });

  // helados → boniatos
  if ('helados' in d.productos) {
    if (!('boniatos' in d.productos)) d.productos.boniatos = d.productos.helados;
    delete d.productos.helados;
  }
  PRODUCTOS_CONFIG.forEach(p => { d.productos[p.key] = Number(d.productos[p.key]) || 0; });
  d.ventas = d.ventas.map(v => {
    const pdm = v.productosDelDia;
    if (pdm && 'helados' in pdm) { if (!('boniatos' in pdm)) pdm.boniatos = pdm.helados; delete pdm.helados; }
    return { ...v, fecha: v.fecha || '', pagos: v.pagos || [], productosDelDia: pdm || null };
  });

  // Ids estables en todos los registros
  RECORD_COLLECTIONS.forEach(k => {
    d[k].forEach((rec, i) => { if (!rec.id) rec.id = legacyId(k, rec, i); });
  });
  d.sueldosDetalle.forEach(e => {
    e.funciones.forEach((f, i) => { if (!f.id) f.id = legacyId('func|' + e.id, f, i); });
  });

  // Sueldos: cada día trabajado es un registro con su propio monto.
  // Los días cargados con el sistema anterior (días × pago) se pasan a
  // un registro "carga anterior" por función, sin fecha.
  d.sueldosDetalle.forEach(e => {
    e.funciones.forEach(f => {
      const dias = Number(f.diasTrabajados) || 0;
      if (dias > 0) {
        d.sueldosRegistros.push({
          id: legacyId('sueldoLegacy|' + e.id + '|' + f.id, { dias, pago: f.pagoPorDia }, 0),
          empId: e.id, empNombre: e.nombre, fecha: '', funcion: f.funcion || 'General',
          dias, monto: dias * (Number(f.pagoPorDia) || 0), nota: 'Carga anterior',
        });
      }
      delete f.diasTrabajados;
    });
  });
  d.sueldosRegistros.forEach(r => {
    if (!r.empNombre) r.empNombre = d.sueldosDetalle.find(e => e.id === r.empId)?.nombre || '';
  });
  delete d.asistencias;

  // Categorías de gastos guardadas
  if (!tieneCategorias) {
    const cats = [...CATEGORIAS_DEFAULT];
    d.gastosGenerales.forEach(g => { if (g.categoria && !cats.includes(g.categoria)) cats.push(g.categoria); });
    d.config.categoriasGastos = cats;
  }
  // Cada categoría guardada tiene su color (en orden, así las primeras conservan el que ya tenían)
  d.config.categoriasGastos.forEach(c => assignCatColor(d.config, c));

  const gf = gfPagadoTotal(d.gastosFijosDetalle);
  if (gf > 0 || d.gastosFijosDetalle.length) d.balance.gastosFijos = gf;
  if (d.gastosGenerales.length) d.balance.compras = d.gastosGenerales.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  return d;
}

// ─────────────────────────────────────────────────────
// 3. ESTADO Y PERSISTENCIA
// ─────────────────────────────────────────────────────
let data = makeDefaultData();
let charts = {};
let currentSection = 'cierre';
let currentGastosGFilter = 'Todos';
let empFunciones = [];
let platDraft = null;
let pendingRender = false;
let lastAutoBackup = 0;

function loadData() {
  try {
    const saved = localStorage.getItem(MAIN_KEY);
    data = migrateData(saved ? JSON.parse(saved) : makeDefaultData());
  } catch (e) { data = migrateData(makeDefaultData()); }
}

function persistLocal() {
  try { localStorage.setItem(MAIN_KEY, JSON.stringify(data)); }
  catch (e) { showToast('No hay espacio en el navegador para guardar. Descargá un backup.'); }
}

// Punto único por donde pasa todo cambio de datos.
function commit({ toast, render = true } = {}) {
  if (IS_READONLY) return;
  syncAutoBalances();
  data._updatedAt = Date.now();
  persistLocal();
  maybeAutoBackup();
  Sync.markDirty();
  if (render) renderAll();
  if (toast) showToast(toast);
}
function saveData(msg) { commit({ toast: typeof msg === 'string' ? msg : 'Cambios guardados' }); }
function silentSave() { commit({ render: false }); }

function syncAutoBalances() {
  if (data.ventas.length) data.balance.ventas = data.ventas.reduce((s, v) => s + (Number(v.monto) || 0), 0);
  const gf = gfPagadoTotal(data.gastosFijosDetalle);
  if (gf > 0 || data.gastosFijosDetalle.length) data.balance.gastosFijos = gf;
  if (data.gastosGenerales.length) data.balance.compras = data.gastosGenerales.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const sueldos = calcTotalSueldos();
  if (sueldos > 0) data.balance.sueldos = sueldos;
}

// Ejecuta cálculos sobre otro conjunto de datos (ej. un mes del historial)
function withData(d, fn) {
  const prev = data;
  data = d;
  try { return fn(); } finally { data = prev; }
}

// ─────────────────────────────────────────────────────
// 4. CÁLCULOS
// ─────────────────────────────────────────────────────
function calcTotalSueldos() {
  return (data.sueldosRegistros || []).reduce((t, r) => t + (Number(r.monto) || 0), 0);
}
function calcDiasSueldos(regs = data.sueldosRegistros) {
  return (regs || []).reduce((t, r) => t + (Number(r.dias) || 1), 0);
}
function calcTotalVentas()  { return data.ventas.reduce((s, v) => s + (Number(v.monto) || 0), 0); }
function calcTotalBurgers() { return data.ventas.reduce((s, v) => s + (v.burgers || v.productosDelDia?.burgers || 0), 0); }
function calcPagosConsolidados() {
  const map = {};
  data.ventas.forEach(v => (v.pagos || []).forEach(p => {
    if (p.plataforma && p.monto) map[p.plataforma] = (map[p.plataforma] || 0) + p.monto;
  }));
  const fromVentas = Object.entries(map).map(([nombre, monto]) => ({ nombre, monto }));
  return fromVentas.length ? fromVentas : (data.pagos || []);
}
function calcTotalPagos()        { return calcPagosConsolidados().reduce((s, p) => s + p.monto, 0); }
function calcGananciaNeta()      { const b = data.balance; return (b.ventas || 0) - (b.compras || 0) - (b.gastosFijos || 0) - (b.sueldos || 0); }
function calcFondoComun()        { return calcGananciaNeta() * ((data.config.pctFondoComun || 0) / 100); }
function calcTotalEgresos()      { return (data.egresosGanancia || []).reduce((s, e) => s + (Number(e.monto) || 0), 0); }
function calcGananciaDistribuir(){ return calcGananciaNeta() - calcFondoComun() - calcTotalEgresos(); }
function calcParteSocio(key)     { return calcGananciaDistribuir() * ((data.config[key === 'juan' ? 'socio1Pct' : 'socio2Pct'] || 0) / 100); }
function calcAdelantosSocio(key) { return data.adelantos.filter(a => a.persona === key).reduce((s, a) => s + (Number(a.monto) || 0), 0); }
function calcTotalAPagar(key)    { return calcParteSocio(key) - calcAdelantosSocio(key); }
function calcSaldoFondoComun()   { return calcSaldoFC(data.fondoComun); }
function calcSaldoFC(movs)       { return (movs || []).reduce((s, m) => m.tipo === 'Ingreso' ? s + m.monto : s - m.monto, 0); }
function socioNombre(key)        { return key === 'juan' ? data.config.socio1Nombre : data.config.socio2Nombre; }

// Gastos fijos: cada uno tiene su total del mes y se marca como pagado (los cargados antes de v4.0 cuentan como pagados)
function gfPagado(g) { return g.pagado !== false; }
function gfPagadoTotal(list) { return (list || []).filter(gfPagado).reduce((s, g) => s + (Number(g.monto) || 0), 0); }
function gfTotal(list) { return (list || []).reduce((s, g) => s + (Number(g.monto) || 0), 0); }

function monthStats() {
  syncAutoBalances();
  const b = data.balance;
  const ventas = data.ventas;
  const best = ventas.length ? ventas.reduce((x, v) => v.monto > x.monto ? v : x, ventas[0]) : null;
  return {
    ingresos: b.ventas || 0, compras: b.compras || 0, fijos: b.gastosFijos || 0, sueldos: b.sueldos || 0,
    fijosTotal: data.gastosFijosDetalle.length ? gfTotal(data.gastosFijosDetalle) : (b.gastosFijos || 0),
    neta: calcGananciaNeta(), fc: calcFondoComun(), egr: calcTotalEgresos(), dist: calcGananciaDistribuir(),
    s1: calcParteSocio('juan'), s2: calcParteSocio('emi'),
    adj1: calcAdelantosSocio('juan'), adj2: calcAdelantosSocio('emi'),
    dias: ventas.length, burgers: calcTotalBurgers() || data.productos.burgers || 0,
    best, promedio: ventas.length ? (b.ventas || 0) / ventas.length : 0,
  };
}

// ─────────────────────────────────────────────────────
// 5. CATEGORÍAS DE GASTOS
// ─────────────────────────────────────────────────────
function getAllCats() {
  const cats = [...(data.config.categoriasGastos || [])];
  data.gastosGenerales.forEach(g => { if (g.categoria && !cats.includes(g.categoria)) cats.push(g.categoria); });
  return cats;
}
// Colores para categorías: cada una recibe el primero que no esté en uso.
const CAT_PALETTE = [...SERIES, '#0891b2', '#a16207', '#9333ea', '#be185d', '#1d4ed8', '#4d7c0f', '#c2410c', '#0f766e',
  '#7c3aed', '#b45309', '#0e7490', '#9f1239', '#15803d', '#6d28d9', '#ea580c', '#0284c7'];

function catColorFallback(cat) {
  // Para categorías sin color guardado (ej. de un mes viejo): color estable según el nombre
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = (h * 31 + cat.charCodeAt(i)) >>> 0;
  return CAT_PALETTE[h % CAT_PALETTE.length];
}
function assignCatColor(cfg, cat) {
  cfg.categoriaColores = cfg.categoriaColores || {};
  if (cfg.categoriaColores[cat]) return cfg.categoriaColores[cat];
  const usados = new Set(Object.values(cfg.categoriaColores));
  const libre = CAT_PALETTE.find(c => !usados.has(c));
  cfg.categoriaColores[cat] = libre || catColorFallback(cat);
  return cfg.categoriaColores[cat];
}
function getCatColor(cat) {
  return data.config.categoriaColores?.[cat] || catColorFallback(String(cat || ''));
}
function ensureCategoria(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const list = data.config.categoriasGastos;
  const found = list.find(c => c.toLowerCase() === n.toLowerCase());
  if (found) { assignCatColor(data.config, found); return found; }
  list.push(n);
  assignCatColor(data.config, n);
  return n;
}

// ─────────────────────────────────────────────────────
// 6. NAVEGACIÓN Y RENDER
// ─────────────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    navigateTo(btn.dataset.section);
    if (window.innerWidth <= 1024) toggleSidebar(false);
  });
});

function navigateTo(sec) {
  if (!SECTIONS[sec]) sec = 'cierre';
  currentSection = sec;
  try { sessionStorage.setItem('pb_section', sec); } catch (e) {}
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.section === sec));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('active', s.id === 's-' + sec));
  $('topbar-title').textContent = SECTIONS[sec].title;
  $('topbar-sub').textContent = SECTIONS[sec].sub;
  $('content').scrollTop = 0;
  // Las animaciones de entrada corren solo al entrar a la sección (no al guardar cambios)
  const secEl = $('s-' + sec);
  clearTimeout(navigateTo._t);
  document.querySelectorAll('.section.entering').forEach(s => s.classList.remove('entering'));
  animateNext = true;
  renderSection(sec);
  animateNext = false;
  if (!REDUCED_MOTION) {
    void secEl.offsetWidth;
    secEl.classList.add('entering');
    navigateTo._t = setTimeout(() => secEl.classList.remove('entering'), 1800);
  }
  animateCounters(secEl);
  if (sec === 'historial') Sync.syncHistorial();
}

function renderAll() {
  updateMonthBadge();
  renderSection(currentSection);
}

function renderSection(sec) {
  pendingRender = false;
  switch (sec) {
    case 'cierre':       renderCierreDelDia();    break;
    case 'dashboard':    renderDashboard();       break;
    case 'stock':        renderStock();           break;
    case 'ventas':       renderVentas();          break;
    case 'productos':    renderProductos();       break;
    case 'gastosf':      renderGastosFijos();     break;
    case 'gastosg':      renderGastosGenerales(); break;
    case 'sueldos':      renderSueldos();         break;
    case 'pagos':        renderPagos();           break;
    case 'balance':      renderBalance();         break;
    case 'distribucion': renderDistribucion();    break;
    case 'fondocomun':   renderFondoComun();      break;
    case 'resumen':      renderResumen();         break;
    case 'historial':    renderHistorial();       break;
    case 'config':       syncConfigForm(); renderAutoBackups(); break;
  }
}

// Re-render después de recibir cambios de otro dispositivo, sin
// interrumpir a alguien que está escribiendo en un campo.
function requestRender() {
  const a = document.activeElement;
  if (a && $('content').contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { pendingRender = true; return; }
  renderAll();
}
$('content').addEventListener('focusout', () => {
  setTimeout(() => {
    const a = document.activeElement;
    if (pendingRender && !(a && $('content').contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) renderAll();
  }, 0);
});

function updateMonthBadge() {
  $('current-month-badge').textContent = `${data.config.mes} ${data.config.anio}`;
}

// ─────────────────────────────────────────────────────
// 7. GRÁFICOS
// ─────────────────────────────────────────────────────
if (window.Chart) {
  Chart.defaults.font.family = "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#85858F';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.plugins.legend.labels.boxHeight = 8;
  Chart.defaults.plugins.legend.labels.color = '#4B4B53';
  Chart.defaults.plugins.tooltip.backgroundColor = '#18181B';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.boxPadding = 4;
  Chart.defaults.animation.duration = 900;
  Chart.defaults.animation.easing = 'easeOutQuart';
  // Las barras crecen una tras otra
  Chart.defaults.animation.delay = ctx => (ctx.type === 'data' && ctx.mode === 'default' ? ctx.dataIndex * 45 + ctx.datasetIndex * 90 : 0);
}

function destroyChart(key) { if (charts[key]) { charts[key].destroy(); delete charts[key]; } }
function makeChart(key, canvasId, config) {
  destroyChart(key);
  const el = $(canvasId);
  if (!el || !window.Chart) return;
  // Al guardar cambios se redibuja sin animar, para que no "salte" todo el tiempo
  if (!animateNext || REDUCED_MOTION) config.options = { ...(config.options || {}), animation: false };
  charts[key] = new Chart(el, config);
}
function barOptions({ money = true, legend = false, horizontal = false } = {}) {
  const valueAxis = {
    beginAtZero: true, suggestedMax: money ? 100000 : 10, border: { display: false }, grid: { color: '#EFEFF2' },
    ticks: { callback: v => money ? fmtCompact(v) : fmtInt(v) },
  };
  const catAxis = { grid: { display: false }, border: { color: '#E7E7EA' } };
  return {
    responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: legend, position: 'top', align: 'end' },
      tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${money ? fmt(c.raw) : fmtInt(c.raw)}` } },
    },
    scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
  };
}
function barDataset(label, values, color) {
  return { label, data: values, backgroundColor: color, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 38, categoryPercentage: .7, barPercentage: .9 };
}
function doughnutConfig(labels, values, colors, total) {
  return {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#fff', borderWidth: 2, hoverOffset: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '66%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt(c.raw)} (${pct(c.raw, total)})` } },
      },
    },
  };
}

// ─────────────────────────────────────────────────────
// 8. DASHBOARD
// ─────────────────────────────────────────────────────
// Saludo con la fecha y estado del cierre de hoy
let userFirstName = NOMBRE_SALUDO;
function saludoHora() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}
function renderDashHero(s) {
  const now = new Date();
  const saludo = saludoHora();
  const fecha = now.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const hoy = data.ventas.find(v => v.fecha === todayISO());
  $('dash-hero').innerHTML = `
    <div class="hero-text">
      <div class="hero-date">${esc(fecha.charAt(0).toUpperCase() + fecha.slice(1))}</div>
      <h1 class="hero-title">${saludo}${userFirstName ? ', ' + esc(userFirstName) : ''}</h1>
      <p class="hero-sub">${s.dias ? `Van <strong>${s.dias} ${s.dias === 1 ? 'día' : 'días'}</strong> de venta en ${esc(data.config.mes)}, con un promedio de <strong>${fmt(s.promedio)}</strong> por día.` : `Todavía no hay cierres cargados en ${esc(data.config.mes)}.`}</p>
    </div>
    <div class="hero-status ${hoy ? 'done' : ''}">
      ${hoy
        ? `<span class="hero-check">${ic('check')}</span><div><div class="hero-status-lbl">Cierre de hoy cargado</div><div class="hero-status-val">${fmt(hoy.monto)}</div></div>`
        : `<div><div class="hero-status-lbl">Cierre de hoy</div><div class="hero-status-val">Pendiente</div></div>
           <button class="btn btn-primary btn-sm ro-hide" onclick="navigateTo('cierre')">Cargar cierre ${ic('chevron', 'ic-sm')}</button>`}
    </div>`;
}

// ── Análisis del mes: equilibrio, proyección y comparación ──
function mesIdx(m) { return MESES_NAMES.findIndex(x => x.toLowerCase() === String(m || '').toLowerCase()); }
function diasDelMes(cfg = data.config) {
  const mi = mesIdx(cfg.mes), y = parseInt(cfg.anio, 10);
  return mi < 0 || !y ? 30 : new Date(y, mi + 1, 0).getDate();
}
function diaDeFecha(f) { const n = parseInt(String(f || '').slice(8, 10), 10); return n > 0 && n <= 31 ? n : 0; }
// Hasta qué día del mes hay datos: en el mes en curso, ayer (u hoy si ya se cargó el cierre)
function diaCorte() {
  const n = diasDelMes(), now = new Date();
  const mi = mesIdx(data.config.mes), y = parseInt(data.config.anio, 10);
  const ult = Math.max(0, ...data.ventas.map(v => diaDeFecha(v.fecha)));
  if (mi === now.getMonth() && y === now.getFullYear()) return Math.min(n, Math.max(ult, now.getDate() - 1, data.ventas.length ? 1 : 0));
  if (y * 12 + mi < now.getFullYear() * 12 + now.getMonth()) return n;
  return ult;
}
// Mes cerrado más reciente anterior al actual
function mesAnteriorSnap() {
  const cur = (parseInt(data.config.anio, 10) || 0) * 12 + Math.max(0, mesIdx(data.config.mes));
  const prev = getHistorial().filter(h => mesAnioOrder(h.mesAnio) < cur).pop();
  if (!prev) return null;
  const d = migrateData(clone(prev.data || {}));
  return { d, nombre: d.config?.mes || String(prev.mesAnio).split('_')[0], stats: withData(d, monthStats) };
}
// Ventas acumuladas día por día (1..dias)
function acumuladoPorDia(ventas, dias, campo = v => Number(v.monto) || 0) {
  const porDia = Array(dias + 1).fill(0);
  ventas.forEach((v, i) => { const dd = Math.min(dias, diaDeFecha(v.fecha) || i + 1); porDia[dd] += campo(v); });
  const acc = []; let t = 0;
  for (let i = 1; i <= dias; i++) { t += porDia[i]; acc.push(t); }
  return acc;
}
function deltaChip(actual, antes, txt = '') {
  if (!antes) return '';
  const p = (actual - antes) / antes * 100;
  const cls = p >= 0.5 ? 'up' : p <= -0.5 ? 'down' : 'flat';
  return `<span class="delta ${cls}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toLocaleString('es-AR', { maximumFractionDigits: 0 })}%</span>${txt ? ` <span class="delta-txt">${txt}</span>` : ''}`;
}
function analisisMes(s) {
  const n = diasDelMes(), corte = diaCorte();
  const costos = s.compras + s.fijos + s.sueldos;
  const ritmo = corte ? s.ingresos / corte : 0;           // venta por día corrido
  const f = corte ? n / corte : 1;
  const ventasProj = s.ingresos * f;
  const costosProj = (s.compras + s.sueldos) * f + Math.max(s.fijos, s.fijosTotal || 0);
  const prev = mesAnteriorSnap();
  let comp = null;
  if (prev) {
    const nPrev = diasDelMes(prev.d.config);
    const accA = acumuladoPorDia(data.ventas, n), accB = acumuladoPorDia(prev.d.ventas || [], nPrev);
    const burg = v => Number(v.burgers || v.productosDelDia?.burgers) || 0;
    const bA = acumuladoPorDia(data.ventas, n, burg), bB = acumuladoPorDia(prev.d.ventas || [], nPrev, burg);
    const k = Math.max(1, Math.min(corte, nPrev)) - 1;
    comp = { prev, nPrev, accA, accB, ventasA: accA[k], ventasB: accB[k], burgA: bA[k], burgB: bB[k] };
  }
  return { n, corte, costos, ritmo, ventasProj, costosProj, gananciaProj: ventasProj - costosProj, completo: corte >= n, comp };
}

function renderEquilibrio(s, a) {
  const el = $('dash-equilibrio');
  if (!a.costos) { el.innerHTML = `<div class="empty-state">${ic('receipt')}<div>Cargá gastos y sueldos del mes para calcular el punto de equilibrio.</div></div>`; return; }
  // Mes en curso: contra los costos estimados del mes completo (los cargados crecen día a día)
  const est = !a.completo && a.ritmo;
  const meta = est ? Math.max(a.costos, a.costosProj) : a.costos;
  const cub = s.ingresos / meta;
  const falta = meta - s.ingresos;
  const diaEq = a.ritmo ? Math.ceil(meta / a.ritmo) : 0;
  const deQue = est ? 'los costos estimados del mes' : 'los costos del mes';
  el.innerHTML = `
    <div class="eq-head">
      <div class="eq-pct ${cub >= 1 ? 'text-green' : ''}">${Math.round(cub * 100)}%</div>
      <div class="eq-txt">${cub >= 1
        ? `<strong>Cubriste ${deQue}.</strong> Desde acá todo suma ganancia: ${fmt(-falta)} por encima.`
        : `Cubriste el <strong>${Math.round(cub * 100)}%</strong> de ${deQue}. Te faltan <strong>${fmt(falta)}</strong> para empezar a ganar.`}</div>
    </div>
    <div class="progress-bar eq-bar"><div class="progress-fill" style="width:${Math.min(100, cub * 100).toFixed(1)}%;background:${cub >= 1 ? 'var(--green)' : 'var(--brand)'}"></div></div>
    <div class="kv mt-4">
      ${kvRow('Vendido', fmt(s.ingresos))}
      ${kvRow('Costos cargados hasta hoy', fmt(a.costos))}
      ${est ? kvRow('Costos estimados del mes', fmt(meta)) : ''}
    </div>
    ${est && cub < 1 ? `<p class="form-hint mt-4">${diaEq <= a.n
      ? `A este ritmo los cubrís alrededor del <strong>día ${diaEq}</strong> de ${esc(data.config.mes)}.`
      : `A este ritmo <strong>no llegás</strong> a cubrirlos este mes: faltarían ${fmt(meta - a.ventasProj)}.`}</p>` : ''}`;
}

function renderProyeccion(s, a) {
  const el = $('dash-proyeccion');
  if (!a.corte || !s.ingresos) { el.innerHTML = `<div class="empty-state">${ic('trend')}<div>Con los primeros cierres del mes vas a ver la proyección.</div></div>`; return; }
  const mes = esc(data.config.mes);
  el.innerHTML = a.completo ? `
    <p class="eq-txt">${mes} ya terminó: cerró en <strong>${fmt(s.ingresos)}</strong> de ventas y <strong>${fmt(s.neta)}</strong> de ganancia.</p>` : `
    <p class="eq-txt">Al ritmo actual, terminás ${mes} en</p>
    <div class="proj-grid">
      <div><div class="proj-lbl">Ventas</div><div class="proj-val">${fmt(a.ventasProj)}</div></div>
      <div><div class="proj-lbl">Ganancia</div><div class="proj-val ${a.gananciaProj >= 0 ? 'text-green' : 'text-red'}">${fmt(a.gananciaProj)}</div></div>
    </div>
    <div class="kv mt-4">
      ${kvRow('Venta por día corrido', fmt(a.ritmo))}
      ${kvRow('Días transcurridos', `${a.corte} de ${a.n}`)}
      ${a.comp ? kvRow(`${esc(a.comp.prev.nombre)} cerró en`, fmt(a.comp.prev.stats.ingresos)) : ''}
    </div>
    <p class="form-hint mt-4">Proyecta ventas, gastos generales y sueldos al ritmo de lo que va del mes. Los gastos fijos se toman completos, aunque falte pagar alguno.</p>`;
}

function renderComparacion(a) {
  const head = $('dash-comp-head'), wrap = $('chart-comp-dash').parentElement;
  if (!a.comp) {
    $('dash-comp-title').textContent = 'Comparación con el mes anterior';
    head.innerHTML = `<div class="empty-state">${ic('calendar')}<div>Cuando cierres el primer mes, acá vas a ver cómo vas contra el anterior día por día.</div></div>`;
    wrap.style.display = 'none'; destroyChart('comp-dash'); return;
  }
  const c = a.comp, prevN = esc(c.prev.nombre), dia = Math.max(1, Math.min(a.corte, c.nPrev));
  $('dash-comp-title').textContent = `${data.config.mes} contra ${c.prev.nombre}`;
  wrap.style.display = '';
  const p = c.ventasB ? (c.ventasA - c.ventasB) / c.ventasB * 100 : 0;
  head.innerHTML = c.ventasB ? `<p class="eq-txt comp-line">Día ${dia}: vas <strong class="${p >= 0 ? 'text-green' : 'text-red'}">${p >= 0 ? '+' : '−'}${Math.abs(p).toLocaleString('es-AR', { maximumFractionDigits: 0 })}%</strong> contra ${prevN} al mismo día <span class="text-muted">(${fmt(c.ventasA)} contra ${fmt(c.ventasB)})</span>.</p>`
    : `<p class="eq-txt comp-line text-muted">${prevN} no tiene ventas con fecha para comparar día por día.</p>`;
  const L = Math.max(a.n, c.nPrev);
  makeChart('comp-dash', 'chart-comp-dash', {
    type: 'line',
    data: {
      labels: Array.from({ length: L }, (_, i) => i + 1),
      datasets: [
        { label: data.config.mes, data: c.accA.slice(0, a.corte), borderColor: BRAND, backgroundColor: 'rgba(200,16,46,.08)', fill: true, borderWidth: 2.5, tension: .3, pointRadius: 0, pointHoverRadius: 4 },
        { label: c.prev.nombre, data: c.accB, borderColor: GRAY, borderDash: [5, 4], borderWidth: 2, tension: .3, pointRadius: 0, pointHoverRadius: 4, fill: false },
      ],
    },
    options: (() => {
      const o = barOptions({ legend: true });
      o.scales.x.ticks = { callback: (v, i) => (i + 1) % 5 === 0 || i === 0 ? i + 1 : '' , autoSkip: false, maxRotation: 0 };
      o.plugins.tooltip.callbacks.title = items => `Día ${items[0].label}`;
      return o;
    })(),
  });
}

function renderMediosPago() {
  const plats = data.config.plataformas || [];
  const rows = {};
  const row = k => rows[k] || (rows[k] = { entro: 0, salio: 0 });
  plats.forEach(row);
  data.ventas.forEach(v => (v.pagos || []).forEach(p => { if (p.plataforma && p.monto) row(p.plataforma).entro += Number(p.monto) || 0; }));
  const pago = g => { if (g.monto) row(g.medio || 'Sin especificar').salio += Number(g.monto) || 0; };
  data.gastosGenerales.forEach(pago); data.gastosFijosDetalle.filter(gfPagado).forEach(pago); (data.sueldosRegistros || []).forEach(pago);
  const list = Object.entries(rows).filter(([k, r]) => r.entro || r.salio || plats.includes(k));
  const tot = list.reduce((t, [, r]) => ({ entro: t.entro + r.entro, salio: t.salio + r.salio }), { entro: 0, salio: 0 });
  $('dash-medios').innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>Medio</th><th class="r">Entró (ventas)</th><th class="r">Salió (gastos y sueldos)</th><th class="r">Queda</th></tr></thead>
    <tbody>${list.map(([k, r]) => `<tr>
      <td class="fw-600">${esc(k)}</td><td class="r text-green">${r.entro ? fmt(r.entro) : '—'}</td><td class="r">${r.salio ? '− ' + fmt(r.salio) : '—'}</td>
      <td class="r fw-600 ${r.entro - r.salio < 0 ? 'text-red' : ''}">${fmt(r.entro - r.salio)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td><td class="r">${fmt(tot.entro)}</td><td class="r">− ${fmt(tot.salio)}</td><td class="r">${fmt(tot.entro - tot.salio)}</td></tr></tfoot>
  </table></div>
  <p class="form-hint mt-4">Lo cobrado en cada medio menos lo que se pagó con ese medio este mes. ${rows['Sin especificar'] ? '“Sin especificar” son gastos cargados sin indicar con qué se pagaron.' : ''}</p>`;
}

function renderDashboard() {
  const rep = stockParaReponer();
  const nRep = rep.filter(x => x.c.estado === 'reponer').length;
  $('dash-stock-alert').innerHTML = rep.length ? `
    <div class="info-box ${nRep ? 'danger' : 'warn'}" style="cursor:pointer" onclick="navigateTo('stock')">
      ${ic('alert')}<span><strong>Stock:</strong> ${nRep ? `reponer ${rep.filter(x => x.c.estado === 'reponer').map(x => esc(x.p.nombre)).join(', ')}` : ''}${nRep && rep.length > nRep ? ' · ' : ''}${rep.length > nRep ? `flojo ${rep.filter(x => x.c.estado === 'flojo').map(x => esc(x.p.nombre)).join(', ')}` : ''} <span class="link-btn">ver stock →</span></span>
    </div>` : '';
  const s = monthStats();
  const saldoFC = calcSaldoFondoComun();
  renderDashHero(s);
  const a = analisisMes(s), c = a.comp, vs = c ? `vs ${esc(c.prev.nombre)} al día ${Math.max(1, Math.min(a.corte, c.nPrev))}` : '';
  $('kpi-grid').innerHTML = [
    kpi({ label: 'Ingresos del mes', icon: 'cash', value: fmt(s.ingresos), sub: c && c.ventasB ? deltaChip(c.ventasA, c.ventasB, vs) : `${s.dias} días · ${data.config.mes} ${data.config.anio}`, cls: 'accent', spark: sortedVentas().map(v => v.monto) }),
    kpi({ label: 'Ganancia neta', icon: 'trend', value: fmt(s.neta), sub: `Margen ${pct(s.neta, s.ingresos)}`, cls: s.neta >= 0 ? 'green' : 'red' }),
    kpi({ label: 'A distribuir', icon: 'pie', value: fmt(s.dist), sub: `Fondo común ${fmt(s.fc)}` }),
    kpi({ label: 'Burgers vendidas', icon: 'burger', value: fmtInt(s.burgers), sub: (s.dias ? `${fmtInt(Math.round(s.burgers / s.dias))} por día` : 'Sin cierres') + (c && c.burgB ? ' ' + deltaChip(c.burgA, c.burgB) : '') }),
    kpi({ label: 'Promedio por día', icon: 'calendar', value: fmt(s.promedio), sub: c && c.prev.stats.promedio && s.dias ? deltaChip(s.promedio, c.prev.stats.promedio, `vs ${esc(c.prev.nombre)}`) : (s.best ? `Mejor: ${esc(s.best.dia)} ${formatDateShort(s.best.fecha)}` : '—') }),
    kpi({ label: 'Saldo fondo común', icon: 'bank', value: fmt(saldoFC), sub: `${data.fondoComun.length} movimientos`, cls: saldoFC < 0 ? 'red' : '' }),
  ].join('');
  renderEquilibrio(s, a);
  renderProyeccion(s, a);
  renderComparacion(a);
  renderMediosPago();

  const ventas = sortedVentas();
  makeChart('ventas-dash', 'chart-ventas-dash', {
    type: 'bar',
    data: { labels: ventas.map(v => formatDateShort(v.fecha) || v.dia), datasets: [barDataset('Ventas', ventas.map(v => v.monto), BRAND)] },
    options: barOptions(),
  });

  const pagos = calcPagosConsolidados();
  const total = calcTotalPagos();
  makeChart('pagos-dash', 'chart-pagos-dash', doughnutConfig(pagos.map(p => p.nombre), pagos.map(p => p.monto), pagos.map((_, i) => SERIES[i] || GRAY), total));

  $('dash-balance').innerHTML = `<div class="kv">
    ${kvRow('Ingresos', fmt(s.ingresos), 'text-green')}
    ${kvRow('Gastos generales', '− ' + fmt(s.compras))}
    ${kvRow('Gastos fijos', '− ' + fmt(s.fijos))}
    ${kvRow('Sueldos', '− ' + fmt(s.sueldos))}
    ${kvRow('Ganancia neta', fmt(s.neta), s.neta >= 0 ? 'text-green' : 'text-red', 'total')}
  </div>`;
  $('dash-dist').innerHTML = partnersHTML();
}

function sortedVentas() {
  return [...data.ventas].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
}

function partnersHTML() {
  const c = data.config;
  const row = (key, cls, nombre, pctS) => `
    <div class="partner ${cls}">
      <div class="p-name">${esc(nombre)} <span class="badge ${cls === 'p1' ? 'badge-blue' : 'badge-pink'}">${pctS}%</span></div>
      <div class="p-amt">${fmt(calcTotalAPagar(key))}</div>
      <div class="p-det">Parte ${fmt(calcParteSocio(key))} · Adelantos ${fmt(calcAdelantosSocio(key))}</div>
    </div>`;
  return `<div class="partners">${row('juan', 'p1', c.socio1Nombre, c.socio1Pct)}${row('emi', 'p2', c.socio2Nombre, c.socio2Pct)}</div>
    <p class="form-hint mt-4">Total a pagar a cada socio, ya descontados los adelantos.</p>`;
}

// ─────────────────────────────────────────────────────
// 9. VENTAS POR DÍA
// ─────────────────────────────────────────────────────
function renderVentas() {
  const total = calcTotalVentas();
  const ventas = sortedVentas();
  $('ventas-tbody').innerHTML = ventas.length ? ventas.map(v => {
    const cobros = (v.pagos || []).filter(p => p.monto > 0).map(p => `${esc(p.plataforma)} ${fmt(p.monto)}`).join(' · ') || '—';
    return `<tr>
      <td class="fw-600">${esc(v.dia)}</td>
      <td class="text-muted">${formatDate(v.fecha)}</td>
      <td class="r fw-600">${fmt(v.monto)}</td>
      <td class="r">${fmtInt(v.burgers || v.productosDelDia?.burgers)}</td>
      <td class="small text-muted hide-sm">${cobros}</td>
      <td class="r text-muted">${pct(v.monto, total)}</td>
      <td class="r">${rowActions(`editVenta('${v.id}')`, `deleteVenta('${v.id}')`)}</td>
    </tr>`;
  }).join('') : emptyRow(7, 'Todavía no hay días de venta este mes.');
  $('ventas-total').innerHTML = `<td colspan="2">Total</td><td class="r">${fmt(total)}</td><td class="r">${fmtInt(calcTotalBurgers())}</td><td class="hide-sm"></td><td></td><td></td>`;

  makeChart('ventas-full', 'chart-ventas-full', {
    type: 'bar',
    data: { labels: ventas.map(v => `${(v.dia || '').slice(0, 3)} ${formatDateShort(v.fecha)}`), datasets: [barDataset('Ventas', ventas.map(v => v.monto), BRAND)] },
    options: barOptions(),
  });
}

function openAddVentaModal() {
  $('venta-edit-index').value = '';
  $('venta-fecha').value = todayISO();
  $('venta-dia').value = dayNameFromISO(todayISO());
  $('venta-burgers').value = '';
  renderVentaPagosRows(data.config.plataformas.map(p => ({ plataforma: p, monto: 0 })));
  openModal('modal-venta');
}
function editVenta(id) {
  const v = data.ventas.find(x => x.id === id);
  if (!v) return;
  $('venta-edit-index').value = id;
  $('venta-dia').value = v.dia || dayNameFromISO(v.fecha);
  $('venta-fecha').value = v.fecha || '';
  $('venta-burgers').value = v.burgers || '';
  renderVentaPagosRows(v.pagos?.length ? v.pagos : data.config.plataformas.map(p => ({ plataforma: p, monto: 0 })));
  openModal('modal-venta');
}
function pagoRowHTML(p = {}) {
  return `<div class="cobro-row plat-row">
    <input type="text" class="pago-row-input venta-pago-plat" value="${esc(p.plataforma || '')}" placeholder="Plataforma" style="flex:1" />
    <input type="number" min="0" class="pago-row-input venta-pago-monto" value="${p.monto || ''}" placeholder="$0" style="max-width:150px" oninput="recalcVentaTotal()" />
    <button class="icon-btn danger" onclick="removeVentaPagoRow(this)" aria-label="Quitar">${ic('x', 'ic-sm')}</button>
  </div>`;
}
function renderVentaPagosRows(pagos) { $('venta-pagos-list').innerHTML = pagos.map(pagoRowHTML).join(''); recalcVentaTotal(); }
function addVentaPagoRow() { $('venta-pagos-list').insertAdjacentHTML('beforeend', pagoRowHTML()); }
function removeVentaPagoRow(btn) { btn.closest('.plat-row').remove(); recalcVentaTotal(); }
function recalcVentaTotal() {
  const total = [...document.querySelectorAll('.venta-pago-monto')].reduce((s, i) => s + num(i.value), 0);
  $('venta-total-display').value = fmt(total);
}
function saveVenta() {
  const id = $('venta-edit-index').value;
  const dia = $('venta-dia').value || dayNameFromISO($('venta-fecha').value);
  const fecha = $('venta-fecha').value;
  if (!dia) { showToast('Elegí la fecha en el calendario'); return; }
  const pagos = [];
  document.querySelectorAll('#venta-pagos-list .plat-row').forEach(row => {
    const plat = row.querySelector('.venta-pago-plat').value.trim();
    if (plat) pagos.push({ plataforma: plat, monto: num(row.querySelector('.venta-pago-monto').value) });
  });
  const monto = pagos.reduce((s, p) => s + p.monto, 0);
  const burgers = int($('venta-burgers').value);
  const i = data.ventas.findIndex(v => v.id === id);
  if (i >= 0) data.ventas[i] = { ...data.ventas[i], dia, fecha, monto, burgers, pagos };
  else data.ventas.push({ id: uid(), dia, fecha, monto, burgers, pagos, productosDelDia: null });
  closeModal('modal-venta');
  saveData('Día de venta guardado');
}
function deleteVenta(id) {
  const i = data.ventas.findIndex(v => v.id === id);
  if (i < 0 || !confirm('¿Eliminar este día de venta?')) return;
  cierreSubtractProductos(data.ventas[i]);
  data.ventas.splice(i, 1);
  if (!data.ventas.length) data.balance.ventas = 0;
  saveData('Día eliminado');
}

// ─────────────────────────────────────────────────────
// 10. PRODUCTOS
// ─────────────────────────────────────────────────────
function renderProductos() {
  $('productos-form').innerHTML = PRODUCTOS_CONFIG.map(p => `
    <div class="prod-input">
      <label for="prod-${p.key}">${p.label}</label>
      <input type="number" min="0" inputmode="numeric" id="prod-${p.key}" value="${data.productos[p.key] || 0}" onchange="silentSaveProducto(this)" />
    </div>`).join('');
  makeChart('productos', 'chart-productos', {
    type: 'bar',
    data: { labels: PRODUCTOS_CONFIG.map(p => p.label), datasets: [barDataset('Unidades', PRODUCTOS_CONFIG.map(p => data.productos[p.key] || 0), BRAND)] },
    options: barOptions({ money: false, horizontal: true }),
  });
}
function silentSaveProducto(inp) {
  const key = inp.id.replace('prod-', '');
  if (key in data.productos) data.productos[key] = Math.max(0, int(inp.value));
  silentSave();
}
function saveProductos() {
  PRODUCTOS_CONFIG.forEach(p => { data.productos[p.key] = Math.max(0, int($('prod-' + p.key).value)); });
  saveData('Cantidades guardadas');
}

// ─────────────────────────────────────────────────────
// 11. FORMAS DE PAGO
// ─────────────────────────────────────────────────────
function renderPagos() {
  const pagos = calcPagosConsolidados();
  const total = calcTotalPagos();
  $('pagos-tbody').innerHTML = pagos.length ? pagos.map((p, i) => `
    <tr>
      <td><span class="cat-dot" style="background:${SERIES[i] || GRAY}"></span>${esc(p.nombre)}</td>
      <td class="r fw-600">${fmt(p.monto)}</td>
      <td class="r text-muted">${pct(p.monto, total)}</td>
    </tr>`).join('') : emptyRow(3, 'Sin cobros registrados.');
  $('pagos-total').innerHTML = `<td>Total</td><td class="r">${fmt(total)}</td><td class="r">100%</td>`;
  $('pagos-progress').innerHTML = pagos.map((p, i) => `
    <div class="progress-wrap">
      <div class="progress-label"><span>${esc(p.nombre)}</span><span>${fmt(p.monto)} · ${pct(p.monto, total)}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${total ? (p.monto / total * 100).toFixed(1) : 0}%;background:${SERIES[i] || GRAY}"></div></div>
    </div>`).join('') || '<p class="text-muted">Sin datos.</p>';
  makeChart('pagos-full', 'chart-pagos-full', doughnutConfig(pagos.map(p => p.nombre), pagos.map(p => p.monto), pagos.map((_, i) => SERIES[i] || GRAY), total));
}

// ─────────────────────────────────────────────────────
// 12. BALANCE
// ─────────────────────────────────────────────────────
function renderBalance() {
  const s = monthStats();
  const egresos = s.compras + s.fijos + s.sueldos;
  $('balance-kpis').innerHTML = [
    kpi({ label: 'Ingresos', icon: 'cash', value: fmt(s.ingresos), sub: 'Suma de cierres diarios', cls: 'green' }),
    kpi({ label: 'Egresos', icon: 'receipt', value: fmt(egresos), sub: `${pct(egresos, s.ingresos)} de los ingresos` }),
    kpi({ label: 'Ganancia neta', icon: 'trend', value: fmt(s.neta), sub: `Margen ${pct(s.neta, s.ingresos)}`, cls: s.neta >= 0 ? 'green' : 'red' }),
  ].join('');

  const sueldosAuto = calcTotalSueldos() > 0;
  $('balance-panel-body').innerHTML = `<div class="kv">
      ${kvRow('Ingresos del mes', fmt(s.ingresos), 'text-green')}
      ${kvRow(`Gastos generales <button class="link-btn" onclick="navigateTo('gastosg')">ver</button>`, '− ' + fmt(s.compras))}
      ${kvRow(`Gastos fijos ${s.fijosTotal > s.fijos ? `<span class="text-muted">(faltan ${fmt(s.fijosTotal - s.fijos)})</span> ` : ''}<button class="link-btn" onclick="navigateTo('gastosf')">ver</button>`, '− ' + fmt(s.fijos))}
      ${kvRow(`Sueldos <button class="link-btn" onclick="navigateTo('sueldos')">ver</button>`, '− ' + fmt(s.sueldos))}
      ${kvRow('Ganancia neta', fmt(s.neta), s.neta >= 0 ? 'text-green' : 'text-red', 'total')}
      ${kvRow(`Fondo común (${data.config.pctFondoComun}%)`, '− ' + fmt(s.fc), '', 'indent')}
      ${kvRow('Egresos de ganancias', '− ' + fmt(s.egr), '', 'indent')}
      ${kvRow('A distribuir entre socios', fmt(s.dist), 'text-blue', 'total')}
    </div>
    ${sueldosAuto ? '' : `<div class="form-group mt-4 ro-hide" style="max-width:260px">
      <label for="bal-sueldos">Sueldos (carga manual)</label>
      <input type="number" min="0" id="bal-sueldos" value="${data.balance.sueldos || 0}" onchange="silentSaveBalance()" />
      <span class="form-hint">Se calcula solo si cargás días en Sueldos.</span>
    </div>`}`;

  makeChart('balance', 'chart-balance', {
    type: 'bar',
    data: {
      labels: ['Gastos generales', 'Gastos fijos', 'Sueldos', 'Ganancia neta'],
      datasets: [{ ...barDataset('Monto', [s.compras, s.fijos, s.sueldos, s.neta], [GRAY, GRAY, GRAY, s.neta >= 0 ? GREEN : BRAND]) }],
    },
    options: barOptions(),
  });
}
function silentSaveBalance() {
  const el = $('bal-sueldos');
  if (el) data.balance.sueldos = Math.max(0, num(el.value));
  commit();
}

// ─────────────────────────────────────────────────────
// 13. GASTOS FIJOS
// ─────────────────────────────────────────────────────
function renderGastosFijos() {
  const list = data.gastosFijosDetalle;
  const total = gfTotal(list), pagado = gfPagadoTotal(list), falta = total - pagado;
  const nPag = list.filter(gfPagado).length;
  const p = total ? pagado / total : 0;
  $('gastosf-kpis').innerHTML = [
    kpi({ label: 'Total del mes', icon: 'receipt', value: fmt(total), sub: `${list.length} conceptos · ${pct(total, data.balance.ventas)} de lo vendido` }),
    kpi({ label: 'Pagado', icon: 'check', value: fmt(pagado), sub: `${nPag} de ${list.length} pagados`, cls: 'green' }),
    kpi({ label: 'Falta pagar', icon: 'alert', value: fmt(falta), sub: falta ? `${list.length - nPag} pendientes` : (list.length ? 'Todo pagado' : '—'), cls: falta ? 'red' : '' }),
  ].join('');
  $('gastosf-progress').innerHTML = list.length ? `
    <div class="progress-label"><span><strong>${Math.round(p * 100)}%</strong> pagado</span><span>${fmt(pagado)} de ${fmt(total)}</span></div>
    <div class="progress-bar eq-bar"><div class="progress-fill" style="width:${(p * 100).toFixed(1)}%;background:${p >= 1 ? 'var(--green)' : 'var(--brand)'}"></div></div>` : '';
  const orden = [...list].sort((x, y) => gfPagado(x) - gfPagado(y));
  $('gastosf-tbody').innerHTML = list.length ? orden.map(g => {
    const ok = gfPagado(g);
    const acts = `<div class="gf-acts">${ok
        ? `<button class="btn btn-ghost btn-sm" onclick="desmarcarGastoFijo('${g.id}')" title="Volver a pendiente">${ic('undo', 'ic-sm')}Desmarcar</button>`
        : `<button class="btn btn-success btn-sm" onclick="openPagarGastoFijo('${g.id}')">${ic('check', 'ic-sm')}Pagar</button>`}
        ${rowActions(`editGastoFijo('${g.id}')`, `deleteGastoFijo('${g.id}')`)}</div>`;
    return `<tr class="${ok ? 'gf-ok' : ''}">
      <td class="fw-600">${esc(g.nombre)}</td>
      <td class="r fw-600">${fmt(g.monto)}</td>
      <td>${ok
        ? `<span class="badge badge-green">${ic('check', 'ic-sm')}Pagado</span> <span class="gf-det">${g.medio ? esc(g.medio) : 'Sin especificar'}${g.fechaPago ? ' · ' + formatDateShort(g.fechaPago) : ''}</span>`
        : `<span class="badge badge-amber">Pendiente</span>`}<div class="show-sm gf-acts-m">${acts}</div></td>
      <td class="r hide-sm">${acts}</td>
    </tr>`;
  }).join('') : emptyRow(4, 'No hay gastos fijos cargados. Agregá alquiler, cuotas, servicios… con su total del mes.');
  $('gastosf-total').innerHTML = list.length ? `<td>Total</td><td class="r">${fmt(total)}</td><td colspan="2" class="gf-foot"><span class="text-green">${fmt(pagado)} pagado</span>${falta ? ` · <span class="text-red">${fmt(falta)} falta</span>` : ''}</td>` : '';
}
function openAddGastoFijoModal() {
  $('gf-edit-index').value = ''; $('gf-nombre').value = ''; $('gf-monto').value = '';
  $('gf-pago-fields').style.display = 'none';
  openModal('modal-gastosf');
}
function editGastoFijo(id) {
  const g = data.gastosFijosDetalle.find(x => x.id === id);
  if (!g) return;
  $('gf-edit-index').value = id; $('gf-nombre').value = g.nombre; $('gf-monto').value = g.monto;
  const ok = gfPagado(g);
  $('gf-pago-fields').style.display = ok ? '' : 'none';
  if (ok) { fillMedioSelect('gf-medio', g.medio || ''); $('gf-fecha').value = g.fechaPago || ''; }
  openModal('modal-gastosf');
}
function saveGastoFijo() {
  const id = $('gf-edit-index').value;
  const nombre = $('gf-nombre').value.trim();
  const monto = num($('gf-monto').value);
  if (!nombre) { showToast('Completá el concepto'); return; }
  const i = data.gastosFijosDetalle.findIndex(g => g.id === id);
  if (i >= 0) {
    const g = { ...data.gastosFijosDetalle[i], nombre, monto };
    if (gfPagado(g)) { g.medio = $('gf-medio').value; g.fechaPago = $('gf-fecha').value || g.fechaPago || ''; }
    data.gastosFijosDetalle[i] = g;
  } else data.gastosFijosDetalle.push({ id: uid(), nombre, monto, pagado: false });
  closeModal('modal-gastosf');
  saveData('Gasto fijo guardado');
}
function openPagarGastoFijo(id) {
  const g = data.gastosFijosDetalle.find(x => x.id === id);
  if (!g) return;
  $('gfp-id').value = id;
  $('gfp-nombre').textContent = g.nombre;
  $('gfp-monto').value = g.monto || '';
  fillMedioSelect('gfp-medio', g.medio && (data.config.plataformas || []).includes(g.medio) ? g.medio : undefined);
  $('gfp-fecha').value = todayISO();
  openModal('modal-gf-pagar');
}
function confirmarPagoGastoFijo() {
  const i = data.gastosFijosDetalle.findIndex(g => g.id === $('gfp-id').value);
  if (i < 0) return;
  const monto = num($('gfp-monto').value);
  if (!monto) { showToast('Poné el monto que pagaste'); return; }
  data.gastosFijosDetalle[i] = { ...data.gastosFijosDetalle[i], monto, medio: $('gfp-medio').value, fechaPago: $('gfp-fecha').value || todayISO(), pagado: true };
  closeModal('modal-gf-pagar');
  saveData(`${data.gastosFijosDetalle[i].nombre}: pagado`);
}
function desmarcarGastoFijo(id) {
  const i = data.gastosFijosDetalle.findIndex(g => g.id === id);
  if (i < 0 || !confirm(`¿Volver "${data.gastosFijosDetalle[i].nombre}" a pendiente?`)) return;
  data.gastosFijosDetalle[i] = { ...data.gastosFijosDetalle[i], pagado: false, fechaPago: '' };
  saveData('Marcado como pendiente');
}
function deleteGastoFijo(id) {
  if (!confirm('¿Eliminar este gasto fijo?')) return;
  data.gastosFijosDetalle = data.gastosFijosDetalle.filter(g => g.id !== id);
  saveData('Gasto eliminado');
}

// ─────────────────────────────────────────────────────
// 14. GASTOS GENERALES
// ─────────────────────────────────────────────────────
function renderGastosGenerales() {
  const total = data.gastosGenerales.reduce((s, g) => s + (g.monto || 0), 0);
  const cats = getAllCats();
  const bycat = {};
  cats.forEach(c => { bycat[c] = 0; });
  data.gastosGenerales.forEach(g => { bycat[g.categoria] = (bycat[g.categoria] || 0) + g.monto; });
  const top = cats.filter(c => bycat[c] > 0).sort((a, b) => bycat[b] - bycat[a]);
  if (currentGastosGFilter !== 'Todos' && !cats.includes(currentGastosGFilter)) currentGastosGFilter = 'Todos';

  $('gastosg-kpis').innerHTML = [
    kpi({ label: 'Total gastos generales', icon: 'box', value: fmt(total), sub: `${data.gastosGenerales.length} gastos`, cls: 'accent' }),
    ...top.slice(0, 3).map(c => kpi({ label: `<span class="cat-dot" style="background:${getCatColor(c)}"></span>${esc(c)}`, value: fmt(bycat[c]), sub: `${pct(bycat[c], total)} del total` })),
  ].join('');

  $('gastosg-filters').innerHTML = ['Todos', ...cats].map(c => `
    <button class="chip ${currentGastosGFilter === c ? 'active' : ''}" onclick="setGastosGFilter(this.dataset.cat)" data-cat="${esc(c)}">
      ${c !== 'Todos' ? `<span class="cat-dot" style="background:${getCatColor(c)};margin-right:0"></span>` : ''}${esc(c)}
    </button>`).join('');

  renderGastosGeneralesTable();

  const activeCats = cats.filter(c => bycat[c] > 0);
  makeChart('gastosg', 'chart-gastosg', doughnutConfig(activeCats, activeCats.map(c => bycat[c]), activeCats.map(getCatColor), total));
  $('gastosg-subtotales').innerHTML = cats.map(c => `
    <div class="progress-wrap">
      <div class="progress-label"><span><span class="cat-dot" style="background:${getCatColor(c)}"></span>${esc(c)}</span><span>${fmt(bycat[c])} · ${pct(bycat[c], total)}</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${total ? (bycat[c] / total * 100).toFixed(1) : 0}%;background:${getCatColor(c)}"></div></div>
    </div>`).join('');
}
function setGastosGFilter(cat) { currentGastosGFilter = cat; renderGastosGenerales(); }

function gastoRowHTML(g, indent = false) {
  return `<tr>
    <td class="text-muted" ${indent ? 'style="padding-left:28px"' : ''}>${formatDate(g.fecha)}</td>
    <td>${esc(g.nombre)}</td>
    <td><span class="badge badge-gray"><span class="cat-dot" style="background:${getCatColor(g.categoria)};margin-right:0"></span>${esc(g.categoria)}</span></td>
    <td>${medioBadge(g.medio)}</td>
    <td class="r fw-600">${fmt(g.monto)}</td>
    <td class="r">${rowActions(`editGastoG('${g.id}')`, `deleteGastoG('${g.id}')`)}</td>
  </tr>`;
}
function renderGastosGeneralesTable() {
  const isTodos = currentGastosGFilter === 'Todos';
  const list = (isTodos ? data.gastosGenerales : data.gastosGenerales.filter(g => g.categoria === currentGastosGFilter))
    .slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const total = list.reduce((s, g) => s + g.monto, 0);
  let rows = '';
  if (!list.length) rows = emptyRow(6, isTodos ? 'Todavía no cargaste gastos este mes.' : 'No hay gastos en esta categoría.', 'box');
  else if (isTodos) {
    getAllCats().forEach(cat => {
      const items = list.filter(g => g.categoria === cat);
      if (!items.length) return;
      rows += `<tr class="group-row"><td colspan="4"><span class="cat-dot" style="background:${getCatColor(cat)}"></span>${esc(cat)} <span class="text-muted">· ${items.length}</span></td><td class="r">${fmt(items.reduce((s, g) => s + g.monto, 0))}</td><td></td></tr>`;
      rows += items.map(g => gastoRowHTML(g, true)).join('');
    });
  } else rows = list.map(g => gastoRowHTML(g)).join('');
  $('gastosg-tbody').innerHTML = rows;
  $('gastosg-total').innerHTML = `<td colspan="4">Total${isTodos ? '' : ' · ' + esc(currentGastosGFilter)}</td><td class="r">${fmt(total)}</td><td></td>`;
}

// Medio con el que se pagó un gasto (las mismas plataformas del cierre del día)
function fillMedioSelect(id, selected) {
  const plats = data.config.plataformas || [];
  const opts = [...plats];
  if (selected && !opts.includes(selected)) opts.push(selected);
  const val = selected === undefined ? (plats[0] || '') : selected;
  $(id).innerHTML = (selected === '' ? '<option value="">Sin especificar</option>' : '')
    + opts.map(p => `<option value="${esc(p)}" ${p === val ? 'selected' : ''}>${esc(p)}</option>`).join('');
}
function medioBadge(m) {
  return m ? `<span class="badge badge-gray">${esc(m)}</span>` : '<span class="text-muted">—</span>';
}

function fillCategoriaSelect(selected) {
  const cats = getAllCats();
  if (selected && !cats.includes(selected)) cats.push(selected);
  $('gg-categoria').innerHTML = cats.map(c => `<option value="${esc(c)}" ${c === selected ? 'selected' : ''}>${esc(c)}</option>`).join('')
    + '<option value="__custom__">+ Nueva categoría…</option>';
}
function toggleCategoriaCustom() {
  const isNew = $('gg-categoria').value === '__custom__';
  $('gg-custom-wrap').style.display = isNew ? '' : 'none';
  if (isNew) $('gg-categoria-custom').focus();
}
function openAddGastoGModal() {
  $('gg-edit-index').value = '';
  $('gg-fecha').value = todayISO();
  $('gg-nombre').value = '';
  $('gg-monto').value = '';
  $('gg-categoria-custom').value = '';
  const pre = currentGastosGFilter !== 'Todos' ? currentGastosGFilter : (data.config.categoriasGastos[0] || '');
  fillCategoriaSelect(pre);
  fillMedioSelect('gg-medio');
  $('gg-custom-wrap').style.display = 'none';
  openModal('modal-gastosg');
}
function editGastoG(id) {
  const g = data.gastosGenerales.find(x => x.id === id);
  if (!g) return;
  $('gg-edit-index').value = id;
  $('gg-fecha').value = g.fecha || '';
  $('gg-nombre').value = g.nombre;
  $('gg-monto').value = g.monto;
  $('gg-categoria-custom').value = '';
  fillCategoriaSelect(g.categoria);
  fillMedioSelect('gg-medio', g.medio || '');
  $('gg-custom-wrap').style.display = 'none';
  openModal('modal-gastosg');
}
function saveGastoG() {
  const id = $('gg-edit-index').value;
  const fecha = $('gg-fecha').value;
  const nombre = $('gg-nombre').value.trim();
  const monto = num($('gg-monto').value);
  let categoria = $('gg-categoria').value;
  const medio = $('gg-medio').value;
  if (!nombre) { showToast('Completá la descripción'); return; }
  if (categoria === '__custom__') {
    categoria = ensureCategoria($('gg-categoria-custom').value);
    if (!categoria) { showToast('Escribí el nombre de la nueva categoría'); return; }
  } else ensureCategoria(categoria);
  const i = data.gastosGenerales.findIndex(g => g.id === id);
  if (i >= 0) data.gastosGenerales[i] = { ...data.gastosGenerales[i], fecha, nombre, monto, categoria, medio };
  else data.gastosGenerales.push({ id: uid(), fecha, nombre, monto, categoria, medio });
  closeModal('modal-gastosg');
  saveData('Gasto guardado');
}
function deleteGastoG(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  data.gastosGenerales = data.gastosGenerales.filter(g => g.id !== id);
  if (!data.gastosGenerales.length) data.balance.compras = 0;
  saveData('Gasto eliminado');
}

// Administrar categorías
function openCategoriasModal() { renderCategoriasList(); $('nueva-categoria').value = ''; openModal('modal-categorias'); }
function renderCategoriasList() {
  const list = data.config.categoriasGastos;
  $('categorias-list').innerHTML = list.map((c, i) => {
    const usos = data.gastosGenerales.filter(g => g.categoria === c).length;
    return `<div class="list-row">
      <label class="color-swatch" title="Cambiar color" style="background:${getCatColor(c)}">
        <input type="color" value="${getCatColor(c)}" onchange="setCatColor(${i}, this.value)" aria-label="Color de ${esc(c)}" />
      </label>
      <input class="input grow" value="${esc(c)}" onchange="renameCategoria(${i}, this.value)" aria-label="Nombre de la categoría" />
      <span class="small text-muted" style="min-width:64px;text-align:right">${usos} ${usos === 1 ? 'gasto' : 'gastos'}</span>
      <button class="icon-btn danger" onclick="deleteCategoria(${i})" aria-label="Eliminar categoría">${ic('trash', 'ic-sm')}</button>
    </div>`;
  }).join('') || '<p class="text-muted">No hay categorías.</p>';
}
function setCatColor(i, color) {
  const c = data.config.categoriasGastos[i];
  if (!c) return;
  data.config.categoriaColores = { ...(data.config.categoriaColores || {}), [c]: color };
  commit({ toast: 'Color actualizado' });
  renderCategoriasList();
}
function addCategoria() {
  const name = $('nueva-categoria').value.trim();
  if (!name) return;
  if (data.config.categoriasGastos.some(c => c.toLowerCase() === name.toLowerCase())) { showToast('Esa categoría ya existe'); return; }
  data.config.categoriasGastos.push(name);
  assignCatColor(data.config, name);
  $('nueva-categoria').value = '';
  commit({ toast: 'Categoría agregada' });
  renderCategoriasList();
}
function renameCategoria(i, value) {
  const list = data.config.categoriasGastos;
  const old = list[i];
  const name = value.trim();
  if (!name || name === old) { renderCategoriasList(); return; }
  if (list.some((c, j) => j !== i && c.toLowerCase() === name.toLowerCase())) { showToast('Esa categoría ya existe'); renderCategoriasList(); return; }
  list[i] = name;
  const colores = data.config.categoriaColores || {};
  if (colores[old]) { colores[name] = colores[old]; delete colores[old]; }
  assignCatColor(data.config, name);
  data.gastosGenerales.forEach(g => { if (g.categoria === old) g.categoria = name; });
  if (currentGastosGFilter === old) currentGastosGFilter = name;
  commit({ toast: 'Categoría renombrada' });
  renderCategoriasList();
}
function deleteCategoria(i) {
  const c = data.config.categoriasGastos[i];
  const usos = data.gastosGenerales.filter(g => g.categoria === c).length;
  const msg = usos ? `¿Quitar "${c}" de la lista? Los ${usos} gastos de este mes la conservan.` : `¿Eliminar la categoría "${c}"?`;
  if (!confirm(msg)) return;
  data.config.categoriasGastos.splice(i, 1);
  // Si ningún gasto la usa, su color queda libre para la próxima categoría
  if (!usos && data.config.categoriaColores) delete data.config.categoriaColores[c];
  commit({ toast: 'Categoría eliminada' });
  renderCategoriasList();
}

// ─────────────────────────────────────────────────────
// 15. DISTRIBUCIÓN, EGRESOS Y ADELANTOS
// ─────────────────────────────────────────────────────
function renderDistribucion() {
  const s = monthStats();
  const c = data.config;
  $('dist-calculo').innerHTML = `<div class="flow">
    <div class="flow-step neta">
      <div><div class="lbl">Ganancia neta del mes</div>
      <div class="det">${fmt(s.ingresos)} ingresos − ${fmt(s.compras + s.fijos)} gastos − ${fmt(s.sueldos)} sueldos</div></div>
      <div class="amt">${fmt(s.neta)}</div>
    </div>
    <div class="flow-minus">Fondo común (${c.pctFondoComun}%): <strong>− ${fmt(s.fc)}</strong></div>
    ${s.egr ? `<div class="flow-minus">Egresos de ganancias: <strong>− ${fmt(s.egr)}</strong></div>` : ''}
    <div class="flow-step dist">
      <div><div class="lbl">A distribuir entre socios</div></div>
      <div class="amt">${fmt(s.dist)}</div>
    </div>
    <div class="partners">
      <div class="partner p1"><div class="p-name">${esc(c.socio1Nombre)} <span class="badge badge-blue">${c.socio1Pct}%</span></div><div class="p-amt">${fmt(s.s1)}</div></div>
      <div class="partner p2"><div class="p-name">${esc(c.socio2Nombre)} <span class="badge badge-pink">${c.socio2Pct}%</span></div><div class="p-amt">${fmt(s.s2)}</div></div>
    </div>
  </div>`;
  $('dist-totales').innerHTML = partnersHTML();

  $('egresos-tbody').innerHTML = data.egresosGanancia.length ? data.egresosGanancia.map(e => `
    <tr>
      <td class="text-muted">${formatDate(e.fecha)}</td>
      <td>${esc(e.detalle) || '—'}</td>
      <td class="r fw-600">${fmt(e.monto)}</td>
      <td class="r">${rowActions(`editEgreso('${e.id}')`, `deleteEgreso('${e.id}')`)}</td>
    </tr>`).join('') : emptyRow(4, 'Sin egresos de ganancias.');
  $('egresos-total').innerHTML = `<td colspan="2">Total</td><td class="r">${fmt(s.egr)}</td><td></td>`;

  $('adelantos-tbody').innerHTML = data.adelantos.length ? data.adelantos.map(a => `
    <tr>
      <td><span class="badge ${a.persona === 'juan' ? 'badge-blue' : 'badge-pink'}">${esc(socioNombre(a.persona))}</span></td>
      <td class="text-muted">${esc(a.nota) || '—'}</td>
      <td class="r fw-600">${fmt(a.monto)}</td>
      <td class="r">${rowActions(`editAdelanto('${a.id}')`, `deleteAdelanto('${a.id}')`)}</td>
    </tr>`).join('') : emptyRow(4, 'Sin adelantos este mes.');
  $('adelantos-total').innerHTML = `<td colspan="2">Total</td><td class="r">${fmt(s.adj1 + s.adj2)}</td><td></td>`;
}

function openAddEgresoModal() {
  $('egreso-edit-index').value = ''; $('egreso-fecha').value = todayISO(); $('egreso-monto').value = ''; $('egreso-detalle').value = '';
  openModal('modal-egreso');
}
function editEgreso(id) {
  const e = data.egresosGanancia.find(x => x.id === id);
  if (!e) return;
  $('egreso-edit-index').value = id; $('egreso-fecha').value = e.fecha || ''; $('egreso-monto').value = e.monto; $('egreso-detalle').value = e.detalle || '';
  openModal('modal-egreso');
}
function saveEgreso() {
  const id = $('egreso-edit-index').value;
  const entry = { fecha: $('egreso-fecha').value, monto: num($('egreso-monto').value), detalle: $('egreso-detalle').value.trim() };
  if (!entry.monto) { showToast('Completá el monto'); return; }
  const i = data.egresosGanancia.findIndex(e => e.id === id);
  if (i >= 0) data.egresosGanancia[i] = { ...data.egresosGanancia[i], ...entry };
  else data.egresosGanancia.push({ id: uid(), ...entry });
  closeModal('modal-egreso');
  saveData('Egreso guardado');
}
function deleteEgreso(id) {
  if (!confirm('¿Eliminar este egreso?')) return;
  data.egresosGanancia = data.egresosGanancia.filter(e => e.id !== id);
  saveData('Egreso eliminado');
}

function fillSocioSelect() {
  const sel = $('adelanto-persona');
  sel.options[0].text = data.config.socio1Nombre;
  sel.options[1].text = data.config.socio2Nombre;
}
function openAddAdelantoModal() {
  fillSocioSelect();
  $('adelanto-edit-index').value = ''; $('adelanto-persona').value = 'juan'; $('adelanto-monto').value = ''; $('adelanto-nota').value = '';
  openModal('modal-adelanto');
}
function editAdelanto(id) {
  const a = data.adelantos.find(x => x.id === id);
  if (!a) return;
  fillSocioSelect();
  $('adelanto-edit-index').value = id; $('adelanto-persona').value = a.persona; $('adelanto-monto').value = a.monto; $('adelanto-nota').value = a.nota || '';
  openModal('modal-adelanto');
}
function saveAdelanto() {
  const id = $('adelanto-edit-index').value;
  const entry = { persona: $('adelanto-persona').value, monto: num($('adelanto-monto').value), nota: $('adelanto-nota').value.trim() };
  if (!entry.monto) { showToast('Completá el monto'); return; }
  const i = data.adelantos.findIndex(a => a.id === id);
  if (i >= 0) data.adelantos[i] = { ...data.adelantos[i], ...entry };
  else data.adelantos.push({ id: uid(), ...entry });
  closeModal('modal-adelanto');
  saveData('Adelanto guardado');
}
function deleteAdelanto(id) {
  if (!confirm('¿Eliminar este adelanto?')) return;
  data.adelantos = data.adelantos.filter(a => a.id !== id);
  saveData('Adelanto eliminado');
}

// ─────────────────────────────────────────────────────
// 16. FONDO COMÚN
// ─────────────────────────────────────────────────────
function renderFondoComun() {
  const saldo = calcSaldoFondoComun();
  const ing = data.fondoComun.filter(m => m.tipo === 'Ingreso');
  const egr = data.fondoComun.filter(m => m.tipo === 'Egreso');
  $('fc-kpis').innerHTML = [
    kpi({ label: 'Saldo actual', icon: 'bank', value: fmt(saldo), sub: `${data.fondoComun.length} movimientos`, cls: saldo >= 0 ? 'accent' : 'red' }),
    kpi({ label: 'Ingresos', icon: 'download', value: fmt(ing.reduce((s, m) => s + m.monto, 0)), sub: `${ing.length} movimientos`, cls: 'green' }),
    kpi({ label: 'Egresos', icon: 'upload', value: fmt(egr.reduce((s, m) => s + m.monto, 0)), sub: `${egr.length} movimientos` }),
    kpi({ label: 'Aporte de este mes', icon: 'pie', value: fmt(calcFondoComun()), sub: `${data.config.pctFondoComun}% de la ganancia neta` }),
  ].join('');
  const movs = [...data.fondoComun].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  $('fc-tbody').innerHTML = movs.length ? movs.map(m => {
    const isIng = m.tipo === 'Ingreso';
    return `<tr>
      <td class="text-muted">${formatDate(m.fecha)}</td>
      <td><span class="badge ${isIng ? 'badge-green' : 'badge-red'}">${m.tipo}</span></td>
      <td>${esc(m.detalle) || '—'}</td>
      <td class="r fw-600 ${isIng ? 'text-green' : 'text-red'}">${isIng ? '+' : '−'} ${fmt(m.monto)}</td>
      <td class="r">${rowActions(`editFC('${m.id}')`, `deleteFC('${m.id}')`)}</td>
    </tr>`;
  }).join('') : emptyRow(5, 'Sin movimientos.', 'bank');
}
function openAddFCModal() {
  $('fc-edit-index').value = ''; $('fc-fecha').value = todayISO(); $('fc-tipo').value = 'Ingreso'; $('fc-monto').value = ''; $('fc-detalle').value = '';
  openModal('modal-fc');
}
function editFC(id) {
  const m = data.fondoComun.find(x => x.id === id);
  if (!m) return;
  $('fc-edit-index').value = id; $('fc-fecha').value = m.fecha || ''; $('fc-tipo').value = m.tipo; $('fc-monto').value = m.monto; $('fc-detalle').value = m.detalle || '';
  openModal('modal-fc');
}
function saveFC() {
  const id = $('fc-edit-index').value;
  const entry = { fecha: $('fc-fecha').value, tipo: $('fc-tipo').value, monto: num($('fc-monto').value), detalle: $('fc-detalle').value.trim() };
  if (!entry.monto) { showToast('Completá el monto'); return; }
  const i = data.fondoComun.findIndex(m => m.id === id);
  if (i >= 0) data.fondoComun[i] = { ...data.fondoComun[i], ...entry };
  else data.fondoComun.push({ id: uid(), ...entry });
  closeModal('modal-fc');
  saveData('Movimiento guardado');
}
function deleteFC(id) {
  if (!confirm('¿Eliminar este movimiento?')) return;
  data.fondoComun = data.fondoComun.filter(m => m.id !== id);
  saveData('Movimiento eliminado');
}

// ─────────────────────────────────────────────────────
// 17. RESUMEN DEL MES
// ─────────────────────────────────────────────────────
function flujoHTML(s, c) {
  return `<div class="kv">
    ${kvRow('Ingresos brutos', fmt(s.ingresos), 'text-green')}
    ${kvRow('Gastos generales', '− ' + fmt(s.compras))}
    ${kvRow('Gastos fijos', '− ' + fmt(s.fijos))}
    ${kvRow('Sueldos', '− ' + fmt(s.sueldos))}
    ${kvRow('Ganancia neta', fmt(s.neta), s.neta >= 0 ? 'text-green' : 'text-red', 'total')}
    ${kvRow(`Fondo común (${c.pctFondoComun}%)`, '− ' + fmt(s.fc), '', 'indent')}
    ${kvRow('Egresos de ganancias', '− ' + fmt(s.egr), '', 'indent')}
    ${kvRow('Base a distribuir', fmt(s.dist), 'text-blue', 'total')}
    ${kvRow(`${esc(c.socio1Nombre)} (${c.socio1Pct}%) − adelantos ${fmt(s.adj1)}`, fmt(s.s1 - s.adj1), 'text-blue', 'indent')}
    ${kvRow(`${esc(c.socio2Nombre)} (${c.socio2Pct}%) − adelantos ${fmt(s.adj2)}`, fmt(s.s2 - s.adj2), 'text-pink', 'indent')}
  </div>`;
}
function actividadHTML(s) {
  return `<div class="kv">
    ${kvRow('Días trabajados', fmtInt(s.dias))}
    ${kvRow('Burgers del mes', fmtInt(s.burgers))}
    ${kvRow('Promedio por día', fmt(s.promedio))}
    ${kvRow('Burgers por día', s.dias ? fmtInt(Math.round(s.burgers / s.dias)) : '—')}
    ${kvRow('Mejor día', s.best ? `${esc(s.best.dia)} ${formatDateShort(s.best.fecha)} · ${fmt(s.best.monto)}` : '—')}
  </div>`;
}
function renderResumen() {
  const s = monthStats();
  $('resumen-kpis').innerHTML = [
    kpi({ label: 'Total recaudado', icon: 'cash', value: fmt(s.ingresos), sub: `${s.dias} días trabajados`, cls: 'accent' }),
    kpi({ label: 'Ganancia neta', icon: 'trend', value: fmt(s.neta), sub: `Margen ${pct(s.neta, s.ingresos)}`, cls: s.neta >= 0 ? 'green' : 'red' }),
    kpi({ label: 'A distribuir', icon: 'pie', value: fmt(s.dist), sub: `Fondo común ${fmt(s.fc)}` }),
    kpi({ label: 'Burgers', icon: 'burger', value: fmtInt(s.burgers), sub: 'del mes' }),
  ].join('');
  $('resumen-flujo').innerHTML = flujoHTML(s, data.config);
  $('resumen-actividad').innerHTML = actividadHTML(s);
  const pagos = calcPagosConsolidados();
  const total = calcTotalPagos();
  $('resumen-pagos-tbody').innerHTML = pagos.length ? pagos.map((p, i) => `
    <tr><td><span class="cat-dot" style="background:${SERIES[i] || GRAY}"></span>${esc(p.nombre)}</td><td class="r fw-600">${fmt(p.monto)}</td><td class="r text-muted">${pct(p.monto, total)}</td></tr>`).join('')
    : emptyRow(3, 'Sin cobros registrados.');

  const hist = getHistorial().slice(-5);
  const panel = $('resumen-comparativa-panel');
  if (!hist.length) { panel.style.display = 'none'; destroyChart('comparativa'); return; }
  panel.style.display = '';
  const rows = hist.map(h => ({ label: mesAnioLabel(h.mesAnio), ...snapStats(h) }));
  rows.push({ label: `${data.config.mes} ${data.config.anio} (actual)`, ingresos: s.ingresos, neta: s.neta });
  makeChart('comparativa', 'chart-comparativa', {
    type: 'bar',
    data: { labels: rows.map(r => r.label), datasets: [barDataset('Ingresos', rows.map(r => r.ingresos), SERIES[0]), barDataset('Ganancia neta', rows.map(r => r.neta), SERIES[1])] },
    options: barOptions({ legend: true }),
  });
}

// ─────────────────────────────────────────────────────
// 18. HISTORIAL DE MESES
// ─────────────────────────────────────────────────────
let histCurrent = null;
let histTab = 'resumen';
let histSyncTimer = null;

function getHistorial() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORIAL_KEY) || '[]');
    return Array.isArray(list) ? list.sort((a, b) => mesAnioOrder(a.mesAnio) - mesAnioOrder(b.mesAnio)) : [];
  } catch (e) { return []; }
}
function setHistorial(list, fromSync = false) {
  if (fromSync) {
    // No pisar ediciones hechas acá mientras se sincronizaba
    const borrados = data._historialBorrados || {};
    getHistorial().forEach(c => {
      if (!c._dirty) return;
      const i = list.findIndex(h => h.mesAnio === c.mesAnio);
      if (i < 0) { if (!borrados[c.mesAnio]) list.push(c); }
      else if ((c.updatedAt || 0) > (list[i].updatedAt || 0)) list[i] = c;
    });
  }
  list.sort((a, b) => mesAnioOrder(a.mesAnio) - mesAnioOrder(b.mesAnio));
  try { localStorage.setItem(HISTORIAL_KEY, JSON.stringify(list)); }
  catch (e) { showToast('No hay espacio en el navegador para el historial. Descargá un backup.'); }
  if (fromSync) {
    if (currentSection === 'historial' || currentSection === 'resumen') requestRender();
    if (histCurrent && $('modal-historial-detail').classList.contains('open')) renderHistorialDetail();
  }
}
function scheduleHistSync() {
  clearTimeout(histSyncTimer);
  histSyncTimer = setTimeout(() => Sync.syncHistorial(), 600);
}
function snapStats(h) {
  const d = migrateData(clone(h.data || {}));
  return withData(d, monthStats);
}

function renderHistorial() {
  const hist = getHistorial();
  const el = $('historial-list');
  if (!hist.length) {
    $('historial-kpis').innerHTML = '';
    $('historial-chart-panel').style.display = 'none';
    destroyChart('historial');
    el.innerHTML = `<div class="empty-state">${ic('archive')}<div>Todavía no hay meses archivados.<br>Cuando hagas “Cerrar mes” en Configuración, van a aparecer acá.</div></div>`;
    return;
  }
  const rows = hist.map(h => ({ h, s: snapStats(h) }));
  const totIng = rows.reduce((t, r) => t + r.s.ingresos, 0);
  const totNeta = rows.reduce((t, r) => t + r.s.neta, 0);
  const best = rows.reduce((b, r) => r.s.neta > b.s.neta ? r : b, rows[0]);
  $('historial-kpis').innerHTML = [
    kpi({ label: 'Meses archivados', icon: 'archive', value: rows.length, sub: `${mesAnioLabel(hist[0].mesAnio)} → ${mesAnioLabel(hist[hist.length - 1].mesAnio)}` }),
    kpi({ label: 'Ingresos acumulados', icon: 'cash', value: fmt(totIng), sub: `Promedio ${fmt(totIng / rows.length)} por mes`, cls: 'accent' }),
    kpi({ label: 'Ganancia neta acumulada', icon: 'trend', value: fmt(totNeta), sub: `Promedio ${fmt(totNeta / rows.length)} por mes`, cls: totNeta >= 0 ? 'green' : 'red' }),
    kpi({ label: 'Mejor mes', icon: 'check', value: mesAnioLabel(best.h.mesAnio), sub: `Ganancia ${fmt(best.s.neta)}` }),
  ].join('');

  $('historial-chart-panel').style.display = '';
  const last = rows.slice(-12);
  makeChart('historial', 'chart-historial', {
    type: 'bar',
    data: {
      labels: last.map(r => mesAnioLabel(r.h.mesAnio)),
      datasets: [barDataset('Ingresos', last.map(r => r.s.ingresos), SERIES[0]), barDataset('Ganancia neta', last.map(r => r.s.neta), SERIES[1])],
    },
    options: barOptions({ legend: true }),
  });

  el.innerHTML = `<table>
    <thead><tr><th>Mes</th><th class="r">Ingresos</th><th class="r hide-sm">Gastos</th><th class="r hide-sm">Sueldos</th><th class="r">Ganancia neta</th><th class="r hide-sm">Margen</th><th class="r hide-sm">Días</th><th></th></tr></thead>
    <tbody>${[...rows].reverse().map(({ h, s }) => `
      <tr style="cursor:pointer" onclick="openHistorial('${esc(h.mesAnio)}')">
        <td><div class="month-name">${esc(mesAnioLabel(h.mesAnio))}</div><div class="small text-muted">Cerrado ${h.timestamp ? new Date(h.timestamp).toLocaleDateString('es-AR') : '—'}${h.updatedAt && h.timestamp && h.updatedAt - Date.parse(h.timestamp) > 60000 ? ' · editado' : ''}</div></td>
        <td class="r fw-600">${fmt(s.ingresos)}</td>
        <td class="r hide-sm">${fmt(s.compras + s.fijos)}</td>
        <td class="r hide-sm">${fmt(s.sueldos)}</td>
        <td class="r fw-700 ${s.neta >= 0 ? 'text-green' : 'text-red'}">${fmt(s.neta)}</td>
        <td class="r hide-sm text-muted">${pct(s.neta, s.ingresos)}</td>
        <td class="r hide-sm">${s.dias}</td>
        <td class="r" onclick="event.stopPropagation()">
          <div class="row-actions">
            <button class="icon-btn" onclick="openHistorial('${esc(h.mesAnio)}')" title="Ver y editar" aria-label="Ver y editar">${ic('eye', 'ic-sm')}</button>
            <button class="icon-btn danger" onclick="borrarHistorial('${esc(h.mesAnio)}')" title="Eliminar" aria-label="Eliminar">${ic('trash', 'ic-sm')}</button>
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
    <tfoot><tr><td>Total</td><td class="r">${fmt(totIng)}</td><td class="r hide-sm">${fmt(rows.reduce((t, r) => t + r.s.compras + r.s.fijos, 0))}</td><td class="r hide-sm">${fmt(rows.reduce((t, r) => t + r.s.sueldos, 0))}</td><td class="r">${fmt(totNeta)}</td><td class="r hide-sm">${pct(totNeta, totIng)}</td><td class="r hide-sm">${rows.reduce((t, r) => t + r.s.dias, 0)}</td><td></td></tr></tfoot>
  </table>`;
}

function openHistorial(mesAnio, tab = 'resumen') {
  histCurrent = mesAnio;
  histTab = tab;
  renderHistorialDetail();
  openModal('modal-historial-detail');
}
function setHistTab(tab) { histTab = tab; renderHistorialDetail(); }

function renderHistorialDetail() {
  const h = getHistorial().find(x => x.mesAnio === histCurrent);
  if (!h) { closeModal('modal-historial-detail'); return; }
  const d = migrateData(clone(h.data || {}));
  const c = d.config;
  const s = withData(d, monthStats);
  $('historial-detail-title').textContent = mesAnioLabel(h.mesAnio);
  $('historial-detail-sub').textContent = `Cerrado el ${h.timestamp ? new Date(h.timestamp).toLocaleDateString('es-AR') : '—'}${h.updatedAt ? ' · última edición ' + new Date(h.updatedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : ''}`;

  const nSueldos = d.sueldosRegistros.length;
  const tabs = [
    ['resumen', 'Resumen'],
    ['ventas', `Ventas (${d.ventas.length})`],
    ['gastos', `Gastos (${d.gastosGenerales.length + d.gastosFijosDetalle.length})`],
    ['sueldos', `Sueldos (${nSueldos})`],
    ['socios', 'Socios'],
    ['fondo', `Fondo común (${d.fondoComun.length})`],
  ];
  $('historial-tabs').innerHTML = tabs.map(([k, l]) => `<button class="tab ${histTab === k ? 'active' : ''}" onclick="setHistTab('${k}')">${l}</button>`).join('');

  const addBtn = (coll, label) => `<button class="btn btn-ghost btn-sm ro-hide" onclick="hAdd('${coll}')">${ic('plus', 'ic-sm')}${label}</button>`;
  const acts = (coll, id) => rowActions(`hEdit('${coll}','${id}')`, `hDel('${coll}','${id}')`);
  let html = '';

  if (histTab === 'resumen') {
    const pagos = withData(d, calcPagosConsolidados);
    const totalPagos = pagos.reduce((t, p) => t + p.monto, 0);
    const needsManual = !d.ventas.length || !d.gastosGenerales.length || !d.gastosFijosDetalle.length || calcTotalSueldosOf(d) === 0;
    html = `<div class="kpi-grid">
        ${kpi({ label: 'Ingresos', icon: 'cash', value: fmt(s.ingresos), sub: `${s.dias} días`, cls: 'accent' })}
        ${kpi({ label: 'Ganancia neta', icon: 'trend', value: fmt(s.neta), sub: `Margen ${pct(s.neta, s.ingresos)}`, cls: s.neta >= 0 ? 'green' : 'red' })}
        ${kpi({ label: 'A distribuir', icon: 'pie', value: fmt(s.dist), sub: `Fondo común ${fmt(s.fc)}` })}
        ${kpi({ label: 'Burgers', icon: 'burger', value: fmtInt(s.burgers), sub: s.dias ? `${fmtInt(Math.round(s.burgers / s.dias))} por día` : '—' })}
      </div>
      <div class="grid-2">
        <div>
          <div class="mini-head"><h4>Flujo de dinero</h4>
            <div class="panel-actions">
              <button class="btn btn-ghost btn-sm ro-hide" onclick="hEditConfig()">${ic('settings', 'ic-sm')}Socios y %</button>
              ${needsManual ? `<button class="btn btn-ghost btn-sm ro-hide" onclick="hEditTotales()">${ic('edit', 'ic-sm')}Totales</button>` : ''}
            </div>
          </div>
          ${flujoHTML(s, c)}
        </div>
        <div>
          <div class="mini-head"><h4>Actividad</h4></div>
          ${actividadHTML(s)}
          <div class="mini-head"><h4>Cobros por plataforma</h4></div>
          <div class="kv">${pagos.map(p => kvRow(esc(p.nombre), `${fmt(p.monto)} <span class="text-muted small">${pct(p.monto, totalPagos)}</span>`)).join('') || '<p class="text-muted small">Sin detalle.</p>'}</div>
          <div class="mini-head"><h4>Productos</h4></div>
          <div class="kv">${PRODUCTOS_CONFIG.filter(p => d.productos[p.key]).map(p => kvRow(p.label, fmtInt(d.productos[p.key]))).join('') || '<p class="text-muted small">Sin detalle.</p>'}</div>
        </div>
      </div>`;
  }

  if (histTab === 'ventas') {
    const ventas = [...d.ventas].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    html = `<div class="mini-head"><h4>Cierres del día · ${fmt(s.ingresos)}</h4>${addBtn('ventas', 'Agregar día')}</div>
      <div class="box table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Día</th><th class="r">Burgers</th><th class="hide-sm">Cobros</th><th class="r">Total</th><th></th></tr></thead>
        <tbody>${ventas.map(v => `<tr>
          <td>${formatDate(v.fecha)}</td><td>${esc(v.dia)}</td>
          <td class="r">${fmtInt(v.burgers || v.productosDelDia?.burgers)}</td>
          <td class="small text-muted hide-sm">${(v.pagos || []).filter(p => p.monto).map(p => `${esc(p.plataforma)} ${fmt(p.monto)}`).join(' · ') || '—'}</td>
          <td class="r fw-600">${fmt(v.monto)}</td><td class="r">${acts('ventas', v.id)}</td>
        </tr>`).join('') || emptyRow(6, 'Sin cierres cargados.')}</tbody>
      </table></div>`;
  }

  if (histTab === 'gastos') {
    const gg = [...d.gastosGenerales].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
    html = `<div class="mini-head"><h4>Gastos generales · ${fmt(s.compras)}</h4>${addBtn('gastosGenerales', 'Agregar gasto')}</div>
      <div class="box table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th class="hide-sm">Pagado con</th><th class="r">Monto</th><th></th></tr></thead>
        <tbody>${gg.map(g => `<tr>
          <td class="text-muted">${formatDate(g.fecha)}</td><td>${esc(g.nombre)}</td>
          <td><span class="badge badge-gray"><span class="cat-dot" style="background:${getCatColor(g.categoria)};margin-right:0"></span>${esc(g.categoria)}</span></td>
          <td class="hide-sm">${medioBadge(g.medio)}</td>
          <td class="r fw-600">${fmt(g.monto)}</td><td class="r">${acts('gastosGenerales', g.id)}</td>
        </tr>`).join('') || emptyRow(6, 'Sin gastos generales.')}</tbody>
      </table></div>
      <div class="mini-head"><h4>Gastos fijos · ${fmt(s.fijos)}</h4>${addBtn('gastosFijosDetalle', 'Agregar gasto fijo')}</div>
      <div class="box table-wrap"><table>
        <thead><tr><th>Concepto</th><th class="hide-sm">Pagado con</th><th class="r">Monto</th><th></th></tr></thead>
        <tbody>${d.gastosFijosDetalle.map(g => `<tr><td>${esc(g.nombre)}</td><td class="hide-sm">${medioBadge(g.medio)}</td><td class="r fw-600">${fmt(g.monto)}</td><td class="r">${acts('gastosFijosDetalle', g.id)}</td></tr>`).join('') || emptyRow(4, 'Sin gastos fijos.')}</tbody>
      </table></div>`;
  }

  if (histTab === 'sueldos') {
    const nombreDe = r => d.sueldosDetalle.find(e => e.id === r.empId)?.nombre || r.empNombre || '—';
    const porEmp = {};
    d.sueldosRegistros.forEach(r => {
      const n = nombreDe(r);
      porEmp[n] = porEmp[n] || { dias: 0, total: 0 };
      porEmp[n].dias += Number(r.dias) || 1;
      porEmp[n].total += Number(r.monto) || 0;
    });
    const regs = [...d.sueldosRegistros].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || nombreDe(a).localeCompare(nombreDe(b)));
    html = `<div class="mini-head"><h4>Por empleado · ${fmt(s.sueldos)}</h4></div>
      <div class="box table-wrap"><table>
        <thead><tr><th>Empleado</th><th class="r">Días</th><th class="r">Total</th></tr></thead>
        <tbody>${Object.entries(porEmp).map(([n, x]) => `<tr><td class="fw-600">${esc(n)}</td><td class="r">${x.dias}</td><td class="r fw-600">${fmt(x.total)}</td></tr>`).join('') || emptyRow(3, 'Sin sueldos cargados.')}</tbody>
      </table></div>
      <div class="mini-head"><h4>Días cargados (${calcDiasSueldos(d.sueldosRegistros)})</h4>${addBtn('sueldos', 'Agregar día')}</div>
      <div class="box table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Empleado</th><th class="hide-sm">Puesto</th><th class="r">Monto</th><th></th></tr></thead>
        <tbody>${regs.map(r => `<tr>
          <td>${r.fecha ? formatDate(r.fecha) : `<span class="text-muted">${Number(r.dias) > 1 ? r.dias + ' días' : '—'}</span>`}</td>
          <td>${esc(nombreDe(r))}${r.nota ? `<div class="small text-muted">${esc(r.nota)}</div>` : ''}</td>
          <td class="hide-sm text-muted">${esc(r.funcion)}</td>
          <td class="r fw-600">${fmt(r.monto)}</td>
          <td class="r">${acts('sueldos', r.id)}</td>
        </tr>`).join('') || emptyRow(5, 'Sin días cargados.')}</tbody>
      </table></div>`;
  }

  if (histTab === 'socios') {
    html = `<div class="partners" style="margin-bottom:6px">
        <div class="partner p1"><div class="p-name">${esc(c.socio1Nombre)} <span class="badge badge-blue">${c.socio1Pct}%</span></div><div class="p-amt">${fmt(s.s1 - s.adj1)}</div><div class="p-det">Parte ${fmt(s.s1)} · Adelantos ${fmt(s.adj1)}</div></div>
        <div class="partner p2"><div class="p-name">${esc(c.socio2Nombre)} <span class="badge badge-pink">${c.socio2Pct}%</span></div><div class="p-amt">${fmt(s.s2 - s.adj2)}</div><div class="p-det">Parte ${fmt(s.s2)} · Adelantos ${fmt(s.adj2)}</div></div>
      </div>
      <div class="mini-head"><h4>Adelantos · ${fmt(s.adj1 + s.adj2)}</h4>${addBtn('adelantos', 'Agregar adelanto')}</div>
      <div class="box table-wrap"><table>
        <thead><tr><th>Socio</th><th>Nota</th><th class="r">Monto</th><th></th></tr></thead>
        <tbody>${d.adelantos.map(a => `<tr><td>${esc(a.persona === 'juan' ? c.socio1Nombre : c.socio2Nombre)}</td><td class="text-muted">${esc(a.nota) || '—'}</td><td class="r fw-600">${fmt(a.monto)}</td><td class="r">${acts('adelantos', a.id)}</td></tr>`).join('') || emptyRow(4, 'Sin adelantos.')}</tbody>
      </table></div>
      <div class="mini-head"><h4>Egresos de ganancias · ${fmt(s.egr)}</h4>${addBtn('egresosGanancia', 'Agregar egreso')}</div>
      <div class="box table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Detalle</th><th class="r">Monto</th><th></th></tr></thead>
        <tbody>${d.egresosGanancia.map(e => `<tr><td class="text-muted">${formatDate(e.fecha)}</td><td>${esc(e.detalle) || '—'}</td><td class="r fw-600">${fmt(e.monto)}</td><td class="r">${acts('egresosGanancia', e.id)}</td></tr>`).join('') || emptyRow(4, 'Sin egresos.')}</tbody>
      </table></div>`;
  }

  if (histTab === 'fondo') {
    html = `<div class="mini-head"><h4>Movimientos · saldo ${fmt(calcSaldoFC(d.fondoComun))}</h4>${addBtn('fondoComun', 'Agregar movimiento')}</div>
      <div class="box table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th class="r">Monto</th><th></th></tr></thead>
        <tbody>${d.fondoComun.map(m => `<tr>
          <td class="text-muted">${formatDate(m.fecha)}</td>
          <td><span class="badge ${m.tipo === 'Ingreso' ? 'badge-green' : 'badge-red'}">${m.tipo}</span></td>
          <td>${esc(m.detalle || m.descripcion) || '—'}</td>
          <td class="r fw-600 ${m.tipo === 'Ingreso' ? 'text-green' : 'text-red'}">${m.tipo === 'Ingreso' ? '+' : '−'} ${fmt(m.monto)}</td>
          <td class="r">${acts('fondoComun', m.id)}</td>
        </tr>`).join('') || emptyRow(5, 'Sin movimientos.')}</tbody>
      </table></div>`;
  }

  $('historial-detail-body').innerHTML = html;
}
function calcTotalSueldosOf(d) { return withData(d, calcTotalSueldos); }

// Modifica un mes archivado y lo deja listo para sincronizar
function updateSnapshot(mesAnio, fn) {
  if (IS_READONLY) return;
  const list = getHistorial();
  const snap = list.find(h => h.mesAnio === mesAnio);
  if (!snap) return;
  snap.data = migrateData(snap.data || {});
  if (fn(snap.data, snap) === false) return;
  withData(snap.data, syncAutoBalances);
  snap.updatedAt = Date.now();
  snap._dirty = true;
  setHistorial(list);
  scheduleHistSync();
  renderHistorialDetail();
  if (currentSection === 'historial' || currentSection === 'resumen') renderSection(currentSection);
  showToast('Mes actualizado');
}

function histFieldsFor(coll, d, rec = {}) {
  const c = d.config;
  switch (coll) {
    case 'ventas': {
      const plats = [...new Set([...(c.plataformas || []), ...(rec.pagos || []).map(p => p.plataforma)])];
      return [
        { k: 'fecha', label: 'Fecha (el día se completa solo)', type: 'date', value: rec.fecha || '', full: true, required: true },
        ...PRODUCTOS_CONFIG.map(p => ({ k: 'prod:' + p.key, label: p.label, type: 'number',
          value: rec.productosDelDia ? (rec.productosDelDia[p.key] || '') : (p.key === 'burgers' ? (rec.burgers || '') : '') })),
        ...plats.map(p => ({ k: 'pago:' + p, label: `Cobrado · ${p}`, type: 'number', value: (rec.pagos || []).find(x => x.plataforma === p)?.monto || '' })),
      ];
    }
    case 'gastosGenerales': {
      const cats = [...new Set([...getAllCats(), ...d.config.categoriasGastos, rec.categoria].filter(Boolean))];
      return [
        { k: 'fecha', label: 'Fecha', type: 'date', value: rec.fecha || '' },
        { k: 'monto', label: 'Monto ($)', type: 'number', value: rec.monto ?? '' },
        { k: 'nombre', label: 'Descripción', type: 'text', value: rec.nombre || '', full: true, required: true },
        { k: 'categoria', label: 'Categoría', type: 'select', options: cats.map(x => [x, x]), value: rec.categoria || cats[0] },
        histMedioField(d, rec),
      ];
    }
    case 'gastosFijosDetalle':
      return [
        { k: 'nombre', label: 'Concepto', type: 'text', value: rec.nombre || '', full: true, required: true },
        { k: 'monto', label: 'Monto ($)', type: 'number', value: rec.monto ?? '' },
        histMedioField(d, rec),
      ];
    case 'adelantos':
      return [
        { k: 'persona', label: 'Socio', type: 'select', options: [['juan', c.socio1Nombre], ['emi', c.socio2Nombre]], value: rec.persona || 'juan' },
        { k: 'monto', label: 'Monto ($)', type: 'number', value: rec.monto ?? '', required: true },
        { k: 'nota', label: 'Nota', type: 'text', value: rec.nota || '', full: true },
      ];
    case 'egresosGanancia':
      return [
        { k: 'fecha', label: 'Fecha', type: 'date', value: rec.fecha || '' },
        { k: 'monto', label: 'Monto ($)', type: 'number', value: rec.monto ?? '', required: true },
        { k: 'detalle', label: 'Detalle', type: 'text', value: rec.detalle || '', full: true },
      ];
    case 'fondoComun':
      return [
        { k: 'fecha', label: 'Fecha', type: 'date', value: rec.fecha || '' },
        { k: 'tipo', label: 'Tipo', type: 'select', options: [['Ingreso', 'Ingreso'], ['Egreso', 'Egreso']], value: rec.tipo || 'Ingreso' },
        { k: 'monto', label: 'Monto ($)', type: 'number', value: rec.monto ?? '', required: true },
        { k: 'detalle', label: 'Detalle', type: 'text', value: rec.detalle || rec.descripcion || '' },
      ];
    case 'sueldos':
      return registroFields(d, rec);
  }
  return [];
}
function histMedioField(d, rec) {
  const plats = [...new Set([...(d.config.plataformas || []), rec.medio].filter(Boolean))];
  return { k: 'medio', label: 'Pagado con', type: 'select', options: [['', 'Sin especificar'], ...plats.map(x => [x, x])], value: rec.medio !== undefined ? rec.medio : (rec.id ? '' : (plats[0] || '')) };
}
const H_TITLES = { ventas: 'día de venta', gastosGenerales: 'gasto general', gastosFijosDetalle: 'gasto fijo', adelantos: 'adelanto', egresosGanancia: 'egreso', fondoComun: 'movimiento', sueldos: 'día trabajado' };

function histApply(coll, d, id, v) {
  if (coll === 'ventas') {
    const pagos = Object.keys(v).filter(k => k.startsWith('pago:')).map(k => ({ plataforma: k.slice(5), monto: num(v[k]) })).filter(p => p.monto);
    const monto = pagos.reduce((t, p) => t + p.monto, 0);
    const productosDelDia = {};
    PRODUCTOS_CONFIG.forEach(p => { productosDelDia[p.key] = Math.max(0, int(v['prod:' + p.key])); });
    const i = d.ventas.findIndex(x => x.id === id);
    if (i >= 0) withData(d, () => cierreSubtractProductos(d.ventas[i]));
    PRODUCTOS_CONFIG.forEach(p => { d.productos[p.key] = (d.productos[p.key] || 0) + productosDelDia[p.key]; });
    const entry = { fecha: v.fecha, dia: dayNameFromISO(v.fecha), burgers: productosDelDia.burgers, pagos, monto, productosDelDia };
    if (i >= 0) d.ventas[i] = { ...d.ventas[i], ...entry };
    else d.ventas.push({ id: uid(), ...entry });
    return;
  }
  if (coll === 'sueldos') { applyRegistro(d, id, v); return; }
  const fields = {};
  histFieldsFor(coll, d).forEach(f => { fields[f.k] = f.type === 'number' ? num(v[f.k]) : v[f.k]; });
  if (coll === 'gastosGenerales' && fields.categoria) ensureCategoriaIn(d, fields.categoria);
  const arr = d[coll];
  const i = arr.findIndex(x => x.id === id);
  if (i >= 0) arr[i] = { ...arr[i], ...fields };
  else arr.push({ id: uid(), ...fields });
}
function ensureCategoriaIn(d, cat) {
  if (!d.config.categoriasGastos.includes(cat)) d.config.categoriasGastos.push(cat);
  assignCatColor(d.config, cat);
  ensureCategoria(cat);
}

function hFindRecord(coll, d, id) {
  if (coll === 'sueldos') return d.sueldosRegistros.find(x => x.id === id) || null;
  return d[coll].find(x => x.id === id) || null;
}
function hEdit(coll, id) {
  const snap = getHistorial().find(h => h.mesAnio === histCurrent);
  if (!snap) return;
  const d = migrateData(clone(snap.data || {}));
  const rec = hFindRecord(coll, d, id);
  if (!rec) return;
  const mesAnio = histCurrent;
  openForm({
    title: `Editar ${H_TITLES[coll]} · ${mesAnioLabel(mesAnio)}`,
    fields: histFieldsFor(coll, d, rec),
    onSave: v => updateSnapshot(mesAnio, dd => histApply(coll, dd, id, v)),
  });
}
function hAdd(coll) {
  const snap = getHistorial().find(h => h.mesAnio === histCurrent);
  if (!snap) return;
  const d = migrateData(clone(snap.data || {}));
  const mesAnio = histCurrent;
  openForm({
    title: `Agregar ${H_TITLES[coll]} · ${mesAnioLabel(mesAnio)}`,
    fields: histFieldsFor(coll, d),
    onSave: v => updateSnapshot(mesAnio, dd => histApply(coll, dd, null, v)),
  });
}
function hDel(coll, id) {
  if (!confirm(`¿Eliminar este ${H_TITLES[coll]} del mes archivado?`)) return;
  updateSnapshot(histCurrent, d => {
    if (coll === 'sueldos') {
      d.sueldosRegistros = d.sueldosRegistros.filter(x => x.id !== id);
      if (!d.sueldosRegistros.length) d.balance.sueldos = 0;
      return;
    }
    if (coll === 'ventas') {
      const v = d.ventas.find(x => x.id === id);
      if (v) withData(d, () => cierreSubtractProductos(v));
    }
    d[coll] = d[coll].filter(x => x.id !== id);
    if (coll === 'ventas' && !d.ventas.length) d.balance.ventas = 0;
    if (coll === 'gastosGenerales' && !d.gastosGenerales.length) d.balance.compras = 0;
  });
}
function hEditConfig() {
  const snap = getHistorial().find(h => h.mesAnio === histCurrent);
  if (!snap) return;
  const c = migrateData(clone(snap.data || {})).config;
  const mesAnio = histCurrent;
  openForm({
    title: `Socios y porcentajes · ${mesAnioLabel(mesAnio)}`,
    fields: [
      { k: 'pctFondoComun', label: '% fondo común', type: 'number', value: c.pctFondoComun, full: true },
      { k: 'socio1Nombre', label: 'Socio 1', type: 'text', value: c.socio1Nombre },
      { k: 'socio1Pct', label: '% socio 1', type: 'number', value: c.socio1Pct },
      { k: 'socio2Nombre', label: 'Socio 2', type: 'text', value: c.socio2Nombre },
      { k: 'socio2Pct', label: '% socio 2', type: 'number', value: c.socio2Pct },
    ],
    onSave: v => updateSnapshot(mesAnio, d => {
      Object.assign(d.config, {
        pctFondoComun: num(v.pctFondoComun), socio1Nombre: v.socio1Nombre || d.config.socio1Nombre, socio1Pct: num(v.socio1Pct),
        socio2Nombre: v.socio2Nombre || d.config.socio2Nombre, socio2Pct: num(v.socio2Pct),
      });
    }),
  });
}
// Para meses viejos que sólo tienen totales (sin detalle cargado)
function hEditTotales() {
  const snap = getHistorial().find(h => h.mesAnio === histCurrent);
  if (!snap) return;
  const d = migrateData(clone(snap.data || {}));
  const b = d.balance;
  const fields = [];
  if (!d.ventas.length)             fields.push({ k: 'ventas', label: 'Ingresos del mes', type: 'number', value: b.ventas || 0 });
  if (!d.gastosGenerales.length)    fields.push({ k: 'compras', label: 'Gastos generales', type: 'number', value: b.compras || 0 });
  if (!d.gastosFijosDetalle.length) fields.push({ k: 'gastosFijos', label: 'Gastos fijos', type: 'number', value: b.gastosFijos || 0 });
  if (calcTotalSueldosOf(d) === 0)  fields.push({ k: 'sueldos', label: 'Sueldos', type: 'number', value: b.sueldos || 0 });
  const mesAnio = histCurrent;
  openForm({
    title: `Totales del mes · ${mesAnioLabel(mesAnio)}`,
    note: 'Sólo se pueden editar los totales que no tienen detalle cargado. El resto se calcula solo.',
    fields,
    onSave: v => updateSnapshot(mesAnio, dd => { fields.forEach(f => { dd.balance[f.k] = Math.max(0, num(v[f.k])); }); }),
  });
}

function borrarHistorial(mesAnio) {
  if (IS_READONLY) return;
  if (!confirm(`¿Eliminar ${mesAnioLabel(mesAnio)} del historial?\n\nSe borra en todos los dispositivos. Esta acción no se puede deshacer (te conviene descargarlo antes).`)) return;
  data._historialBorrados = { ...(data._historialBorrados || {}), [mesAnio]: Date.now() };
  setHistorial(getHistorial().filter(h => h.mesAnio !== mesAnio));
  commit({ toast: 'Mes eliminado del historial' });
  scheduleHistSync();
  if (histCurrent === mesAnio) closeModal('modal-historial-detail');
}
function borrarHistorialActual() { if (histCurrent) borrarHistorial(histCurrent); }
function descargarHistorialActual() {
  const h = getHistorial().find(x => x.mesAnio === histCurrent);
  if (h) downloadJSON(h.data, `PerezBurger_${h.mesAnio}.json`);
}

// ─────────────────────────────────────────────────────
// 19. FORMULARIO GENÉRICO
// ─────────────────────────────────────────────────────
let formOnSave = null;
let formFields = [];
function openForm({ title, fields, onSave, note }) {
  formOnSave = onSave;
  formFields = fields;
  $('form-title').textContent = title;
  $('form-fields').innerHTML = (note ? `<p class="form-hint full" style="grid-column:1/-1">${esc(note)}</p>` : '') + fields.map((f, i) => {
    const id = 'ff-' + i;
    let input;
    if (f.type === 'select') {
      input = `<select id="${id}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(f.value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    } else {
      const list = f.suggest?.length ? `list="${id}-list" autocomplete="off"` : '';
      input = `<input id="${id}" type="${f.type}" ${f.type === 'number' ? 'min="0" step="any" inputmode="decimal"' : ''} ${list} value="${esc(f.value ?? '')}" />`
        + (list ? `<datalist id="${id}-list">${f.suggest.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>` : '');
    }
    return `<div class="form-group ${f.full ? 'full' : ''}"><label for="${id}">${esc(f.label)}</label>${input}</div>`;
  }).join('');
  openModal('modal-form');
  // En pantallas táctiles no se enfoca solo, para que no salte el teclado
  if (!IS_TOUCH) setTimeout(() => { const first = $('form-fields').querySelector('input,select'); if (first) first.focus(); }, 50);
}
$('form-save').addEventListener('click', () => {
  const values = {};
  for (let i = 0; i < formFields.length; i++) {
    const f = formFields[i];
    const v = $('ff-' + i).value.trim();
    if (f.required && !v) { showToast(`Completá "${f.label}"`); $('ff-' + i).focus(); return; }
    values[f.k] = v;
  }
  closeModal('modal-form');
  if (formOnSave) formOnSave(values);
});

// ─────────────────────────────────────────────────────
// 20. CERRAR MES
// ─────────────────────────────────────────────────────
function cerrarMes() {
  if (IS_READONLY) return;
  const { mes, anio } = data.config;
  const mesAnio = `${mes}_${anio}`;
  if (!confirm(`¿Cerrar ${mes} ${anio} y comenzar el mes siguiente?\n\nTodo el mes queda guardado en el historial.`)) return;

  const hist = getHistorial();
  if (hist.some(h => h.mesAnio === mesAnio) &&
      !confirm(`Ya existe ${mes} ${anio} en el historial. ¿Reemplazarlo con los datos actuales?`)) return;

  const mantenerFijos = data.gastosFijosDetalle.length > 0 &&
    confirm('¿Mantener los gastos fijos (alquiler, cuotas, etc.) para el mes nuevo?\n\nAceptar = mantener · Cancelar = empezar sin gastos fijos');

  syncAutoBalances();
  const snapData = clone(data);
  delete snapData._rev; delete snapData._updatedAt; delete snapData._historialBorrados;
  const now = Date.now();
  const snapshot = { mesAnio, timestamp: new Date(now).toISOString(), updatedAt: now, data: snapData, _dirty: true };
  setHistorial([...hist.filter(h => h.mesAnio !== mesAnio), snapshot]);

  const idx = MESES_NAMES.findIndex(m => m.toLowerCase() === String(mes).toLowerCase());
  const nextMes = MESES_NAMES[idx === -1 ? 0 : (idx + 1) % 12];
  const nextAnio = idx === 11 ? Number(anio) + 1 : Number(anio);

  const borrados = { ...(data._historialBorrados || {}) };
  delete borrados[mesAnio];

  data = migrateData({
    config: { ...data.config, mes: nextMes, anio: nextAnio },
    ventas: [],
    productos: {},
    pagos: [],
    balance: { ventas: 0, compras: 0, gastosFijos: 0, sueldos: 0 },
    adelantos: [],
    fondoComun: [],
    gastosFijosDetalle: mantenerFijos ? data.gastosFijosDetalle.map(g => { const c = { ...g, id: uid(), pagado: false }; delete c.fechaPago; return c; }) : [],
    gastosGenerales: [],
    egresosGanancia: [],
    sueldosDetalle: clone(data.sueldosDetalle),
    sueldosRegistros: [],
    // El stock no se reinicia: pasan los productos con su último estado
    stockProductos: clone(data.stockProductos),
    stockChecks: data.stockProductos.map(p => ultimoCheck(p.id)).filter(Boolean)
      .map(c => ({ ...c, id: uid(), arrastre: true })),
    _historialBorrados: borrados,
  });
  resetCierreForm(true);
  commit({ toast: `${mes} ${anio} archivado. Comenzando ${nextMes} ${nextAnio}.` });
  scheduleHistSync();
  navigateTo('dashboard');
}

// ─────────────────────────────────────────────────────
// 21. CONFIGURACIÓN
// ─────────────────────────────────────────────────────
function syncConfigForm() {
  const c = data.config;
  const mesSel = $('cfg-mes');
  const meses = MESES_NAMES.includes(c.mes) ? MESES_NAMES : [...MESES_NAMES, c.mes];
  mesSel.innerHTML = meses.map(m => `<option ${m === c.mes ? 'selected' : ''}>${esc(m)}</option>`).join('');
  $('cfg-anio').value = c.anio;
  $('cfg-pct-fc').value = c.pctFondoComun;
  $('cfg-s1-nombre').value = c.socio1Nombre;
  $('cfg-s1-pct').value = c.socio1Pct;
  $('cfg-s2-nombre').value = c.socio2Nombre;
  $('cfg-s2-pct').value = c.socio2Pct;
  $('readonly-link-input').value = `${location.origin}${location.pathname}?readonly=1`;
  renderPlataformasConfig();
}
function silentSaveConfig() {
  const c = data.config;
  c.mes = $('cfg-mes').value || c.mes;
  c.anio = int($('cfg-anio').value) || c.anio;
  c.pctFondoComun = num($('cfg-pct-fc').value);
  c.socio1Nombre = $('cfg-s1-nombre').value.trim() || c.socio1Nombre;
  c.socio1Pct = num($('cfg-s1-pct').value);
  c.socio2Nombre = $('cfg-s2-nombre').value.trim() || c.socio2Nombre;
  c.socio2Pct = num($('cfg-s2-pct').value);
  commit({ render: false });
  updateMonthBadge();
  if (c.socio1Pct + c.socio2Pct !== 100) showToast(`Ojo: los % de los socios suman ${c.socio1Pct + c.socio2Pct}%, no 100%`);
  else showToast('Configuración guardada');
}

function renderPlataformasConfig() {
  const list = platDraft || data.config.plataformas;
  $('cfg-plataformas-list').innerHTML = list.map((p, i) => `
    <div class="list-row">
      <input type="text" class="input cfg-plat-input" value="${esc(p)}" placeholder="Nombre de la plataforma" oninput="platDraftFromInputs()" />
      <button class="icon-btn danger ro-hide" onclick="removePlataforma(${i})" aria-label="Quitar">${ic('trash', 'ic-sm')}</button>
    </div>`).join('') || '<p class="text-muted">No hay plataformas.</p>';
}
function platDraftFromInputs() { platDraft = [...document.querySelectorAll('.cfg-plat-input')].map(i => i.value); }
function addPlataforma() { platDraftFromInputs(); platDraft.push(''); renderPlataformasConfig(); const ins = document.querySelectorAll('.cfg-plat-input'); ins[ins.length - 1]?.focus(); }
function removePlataforma(i) { platDraftFromInputs(); platDraft.splice(i, 1); renderPlataformasConfig(); }
function savePlataformas() {
  platDraftFromInputs();
  data.config.plataformas = platDraft.map(s => s.trim()).filter(Boolean);
  platDraft = null;
  saveData('Plataformas guardadas');
}

function resetData() {
  if (!confirm('¿Borrar todos los datos del mes actual (ventas, gastos, adelantos, días trabajados)?\n\nNo se guarda en el historial. Empleados, categorías y configuración se mantienen.')) return;
  data.ventas = []; data.gastosGenerales = []; data.adelantos = []; data.egresosGanancia = [];
  data.fondoComun = []; data.sueldosRegistros = []; data.pagos = [];
  PRODUCTOS_CONFIG.forEach(p => { data.productos[p.key] = 0; });
  data.balance = { ventas: 0, compras: 0, gastosFijos: data.balance.gastosFijos, sueldos: 0 };
  saveData('Datos del mes borrados');
}

// ─────────────────────────────────────────────────────
// 22. MODALES, MENÚS Y TOAST
// ─────────────────────────────────────────────────────
function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) {
  $(id).classList.remove('open');
  if (id === 'modal-historial-detail') histCurrent = null;
  if (pendingRender && !anyModalOpen()) renderAll();
}
function anyModalOpen() { return !!document.querySelector('.modal-overlay.open'); }
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('mousedown', e => { if (e.target === o) closeModal(o.id); });
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal-overlay.open')];
  if (open.length) closeModal(open[open.length - 1].id);
  document.querySelectorAll('.dropdown.open').forEach(d => d.classList.remove('open'));
});

function toggleDropdown(id, ev) {
  ev && ev.stopPropagation();
  $(id).classList.toggle('open');
}
document.addEventListener('click', e => {
  document.querySelectorAll('.dropdown.open').forEach(d => {
    if (!d.contains(e.target) || e.target.closest('.dropdown-item')) d.classList.remove('open');
  });
});

let toastTimer;
function showToast(msg, opts = {}) {
  const t = $('toast');
  t.querySelector('.toast-msg').textContent = msg;
  const btn = t.querySelector('.toast-action');
  btn.textContent = opts.action || '';
  btn.onclick = opts.onAction ? () => { t.classList.remove('show'); opts.onAction(); } : null;
  const ms = opts.action ? 6000 : 2600;
  t.style.setProperty('--toast-ms', ms + 'ms');
  t.classList.remove('show');
  void t.offsetWidth;            // reinicia la barra de tiempo si ya estaba visible
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function toggleSidebar(force) {
  const open = typeof force === 'boolean' ? force : !$('sidebar').classList.contains('open');
  $('sidebar').classList.toggle('open', open);
  $('sidebar-overlay').classList.toggle('open', open);
}

// ─────────────────────────────────────────────────────
// 23. EXPORTAR / BACKUPS
// ─────────────────────────────────────────────────────
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadJSON(obj, name) { downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), name); }

function exportCSV() {
  const rows = [];
  const c = data.config;
  rows.push([`RESUMEN MENSUAL — ${c.mes} ${c.anio}`], []);
  rows.push(['VENTAS POR DÍA'], ['Día', 'Fecha', 'Total ($)', 'Burgers', 'Cobros por plataforma']);
  sortedVentas().forEach(v => rows.push([v.dia, v.fecha, v.monto, v.burgers, (v.pagos || []).map(p => `${p.plataforma}: $${p.monto}`).join(' | ')]));
  rows.push([], ['FORMAS DE PAGO'], ['Plataforma', 'Monto', 'Incidencia']);
  const tp = calcTotalPagos();
  calcPagosConsolidados().forEach(p => rows.push([p.nombre, p.monto, pct(p.monto, tp)]));
  rows.push([], ['GASTOS FIJOS'], ['Concepto', 'Monto']);
  data.gastosFijosDetalle.forEach(g => rows.push([g.nombre, g.monto]));
  rows.push([], ['GASTOS GENERALES'], ['Fecha', 'Descripción', 'Categoría', 'Monto']);
  data.gastosGenerales.forEach(g => rows.push([g.fecha, g.nombre, g.categoria, g.monto]));
  rows.push([], ['SUELDOS'], ['Fecha', 'Empleado', 'Función', 'Días', 'Monto', 'Nota']);
  [...data.sueldosRegistros].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).forEach(r => rows.push([r.fecha, regNombre(r), r.funcion, Number(r.dias) || 1, r.monto, r.nota || '']));
  rows.push([], ['STOCK (último estado)'], ['Producto', 'Estado', 'Fecha de revisión', 'Nota']);
  data.stockProductos.forEach(p => { const c = ultimoCheck(p.id); rows.push([p.nombre, c ? STOCK_ESTADOS[c.estado].label : 'Sin revisar', c?.fecha || '', c?.nota || '']); });
  const s = monthStats();
  rows.push([], ['BALANCE'], ['Ingresos', 'Gastos generales', 'Gastos fijos', 'Sueldos', 'Ganancia neta']);
  rows.push([s.ingresos, s.compras, s.fijos, s.sueldos, s.neta]);
  rows.push([], ['DISTRIBUCIÓN'], ['Fondo común', s.fc], ['Egresos de ganancia', s.egr]);
  rows.push([c.socio1Nombre, s.s1, `Adelantos: ${s.adj1}`, `A pagar: ${s.s1 - s.adj1}`]);
  rows.push([c.socio2Nombre, s.s2, `Adelantos: ${s.adj2}`, `A pagar: ${s.s2 - s.adj2}`]);
  const csv = rows.map(r => r.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), `Resumen_${c.mes}_${c.anio}.csv`);
  showToast('CSV exportado');
}

function exportJSON() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  downloadJSON({ ...data, _historial: getHistorial().map(h => { const x = { ...h }; delete x._dirty; delete x._cloudAt; return x; }) },
    `PerezBurger_${data.config.mes}_${data.config.anio}_${ts}.json`);
  showToast('Backup descargado');
}

function importJSON(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.config || !parsed.ventas || !parsed.balance) { showToast('Archivo inválido: no parece un backup del panel'); return; }
      const hist = Array.isArray(parsed._historial) ? parsed._historial : [];
      const msg = `¿Restaurar los datos de ${parsed.config.mes} ${parsed.config.anio}? Se reemplazan los datos del mes actual.` +
        (hist.length ? `\n\nTambién incluye ${hist.length} meses de historial (se agregan o actualizan).` : '');
      if (!confirm(msg)) return;
      delete parsed._historial;
      const borrados = data._historialBorrados;
      data = migrateData(parsed);
      data._historialBorrados = { ...(borrados || {}) };
      if (hist.length) {
        const cur = getHistorial();
        hist.forEach(h => {
          if (!h.mesAnio) return;
          delete data._historialBorrados[h.mesAnio];
          const i = cur.findIndex(x => x.mesAnio === h.mesAnio);
          const snap = { ...h, updatedAt: Date.now(), _dirty: true };
          if (i >= 0) cur[i] = snap; else cur.push(snap);
        });
        setHistorial(cur);
        scheduleHistSync();
      }
      resetCierreForm(true);
      saveData('Datos restaurados desde el backup');
    } catch (err) {
      showToast('Error al leer el archivo: ' + err.message);
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

function maybeAutoBackup() {
  const now = Date.now();
  if (now - lastAutoBackup < AUTOBACKUP_EVERY) return;
  lastAutoBackup = now;
  try {
    const list = JSON.parse(localStorage.getItem(AUTOBACKUP_KEY) || '[]');
    list.unshift({ ts: new Date(now).toISOString(), label: `${data.config.mes} ${data.config.anio}`, data: clone(data) });
    localStorage.setItem(AUTOBACKUP_KEY, JSON.stringify(list.slice(0, MAX_AUTOBACKUPS)));
  } catch (e) { /* sin espacio: no bloquea */ }
}
function renderAutoBackups() {
  const el = $('autobackup-list');
  let list = [];
  try { list = JSON.parse(localStorage.getItem(AUTOBACKUP_KEY) || '[]'); } catch (e) {}
  el.innerHTML = list.length ? list.map((b, i) => `
    <div class="list-row">
      ${ic('file')}
      <div class="grow"><div class="fw-600">${esc(b.label)}</div><div class="small text-muted">${new Date(b.ts).toLocaleString('es-AR')}</div></div>
      <button class="btn btn-ghost btn-sm ro-hide" onclick="restoreAutoBackup(${i})">${ic('undo', 'ic-sm')}Restaurar</button>
      <button class="icon-btn" onclick="downloadAutoBackup(${i})" title="Descargar" aria-label="Descargar">${ic('download', 'ic-sm')}</button>
    </div>`).join('') : '<p class="text-muted">Todavía no hay copias automáticas.</p>';
}
function restoreAutoBackup(i) {
  const list = JSON.parse(localStorage.getItem(AUTOBACKUP_KEY) || '[]');
  if (!list[i] || !confirm(`¿Restaurar la copia del ${new Date(list[i].ts).toLocaleString('es-AR')}? Se reemplazan los datos actuales.`)) return;
  const borrados = data._historialBorrados;
  data = migrateData(list[i].data);
  data._historialBorrados = borrados;
  resetCierreForm(true);
  saveData('Copia restaurada');
}
function downloadAutoBackup(i) {
  const list = JSON.parse(localStorage.getItem(AUTOBACKUP_KEY) || '[]');
  if (list[i]) downloadJSON(list[i].data, `PerezBurger_autobackup_${i + 1}.json`);
}

// ─────────────────────────────────────────────────────
// 24. CIERRE DEL DÍA
// ─────────────────────────────────────────────────────
function renderCierreDelDia() {
  // Conserva lo que se esté cargando aunque llegue una sincronización
  const prevProd = {};
  PRODUCTOS_CONFIG.forEach(p => { const el = $('cierre-prod-' + p.key); if (el) prevProd[p.key] = el.value; });
  const prevPagos = {};
  document.querySelectorAll('.cierre-pago-input').forEach(el => { prevPagos[el.dataset.plat] = el.value; });

  $('cierre-productos-grid').innerHTML = PRODUCTOS_CONFIG.map(p => `
    <div class="prod-input">
      <label for="cierre-prod-${p.key}">${p.label}</label>
      <input type="number" min="0" inputmode="numeric" id="cierre-prod-${p.key}" value="${esc(prevProd[p.key] ?? '')}" placeholder="0" />
    </div>`).join('');
  $('cierre-pagos-grid').innerHTML = data.config.plataformas.map((plat, i) => `
    <div class="cobro-row">
      <label class="cobro-label" for="cierre-pago-${i}">${esc(plat)}</label>
      <input type="number" min="0" inputmode="decimal" id="cierre-pago-${i}" class="pago-row-input cierre-pago-input"
             data-plat="${esc(plat)}" value="${esc(prevPagos[plat] ?? '')}" placeholder="$0" oninput="recalcCierreTotal()" />
    </div>`).join('') || '<p class="text-muted">Agregá plataformas de cobro en Configuración.</p>';

  if (!$('arqueo-rows').children.length) {
    $('arqueo-rows').innerHTML = ARS_DENOMS.map(d => `
      <div class="arqueo-row">
        <span class="arqueo-denom">$${d.toLocaleString('es-AR')}</span>
        <input type="number" min="0" inputmode="numeric" class="input arqueo-qty" id="ars-${d}" value="" placeholder="0" oninput="recalcArqueo()" />
        <span class="arqueo-sub" id="sub-ars-${d}">$0</span>
      </div>`).join('');
  }
  if (!$('cierre-fecha').value) { $('cierre-fecha').value = todayISO(); $('cierre-dia').value = dayNameFromISO(todayISO()); }
  recalcCierreTotal();
  renderUltimosCierres();
}

function onCierreFechaChange() {
  const f = $('cierre-fecha').value;
  if (f) $('cierre-dia').value = dayNameFromISO(f);
}
function recalcCierreTotal() {
  const total = [...document.querySelectorAll('.cierre-pago-input')].reduce((s, el) => s + num(el.value), 0);
  $('cierre-total-display').textContent = fmt(total);
}

function saveCierre() {
  if (IS_READONLY) return;
  const fecha = $('cierre-fecha').value;
  const dia = $('cierre-dia').value || dayNameFromISO(fecha);
  const editF = $('cierre-edit-fecha').value;
  if (!fecha) { showToast('Completá la fecha'); return; }

  const pagos = [...document.querySelectorAll('.cierre-pago-input')].map(el => ({ plataforma: el.dataset.plat, monto: num(el.value) }));
  const monto = pagos.reduce((s, p) => s + p.monto, 0);
  const productosDelDia = {};
  PRODUCTOS_CONFIG.forEach(p => { productosDelDia[p.key] = Math.max(0, int($('cierre-prod-' + p.key).value)); });
  if (!monto && !Object.values(productosDelDia).some(Boolean) && !confirm('El cierre está vacío (sin cobros ni productos). ¿Guardarlo igual?')) return;

  const existIdx = data.ventas.findIndex(v => v.fecha === (editF || fecha));
  const clashIdx = editF && editF !== fecha ? data.ventas.findIndex(v => v.fecha === fecha) : -1;
  if (!editF && existIdx >= 0 && !confirm(`Ya hay un cierre del ${formatDate(fecha)}. ¿Reemplazarlo?`)) return;
  if (clashIdx >= 0 && !confirm(`Ya hay otro cierre del ${formatDate(fecha)}. ¿Reemplazarlo?`)) return;

  const entry = { dia, fecha, monto, burgers: productosDelDia.burgers || 0, pagos, productosDelDia, arqueo: readArqueo() };
  if (clashIdx >= 0) { cierreSubtractProductos(data.ventas[clashIdx]); data.ventas.splice(clashIdx, 1); }
  const i = data.ventas.findIndex(v => v.fecha === (editF || fecha));
  if (i >= 0) {
    cierreSubtractProductos(data.ventas[i]);
    data.ventas[i] = { ...data.ventas[i], ...entry };
  } else {
    data.ventas.push({ id: uid(), ...entry });
  }
  PRODUCTOS_CONFIG.forEach(p => { data.productos[p.key] = (data.productos[p.key] || 0) + (productosDelDia[p.key] || 0); });
  resetCierreForm(true);
  saveData(`Cierre del ${formatDate(fecha)} guardado`);
}

function cierreSubtractProductos(venta) {
  if (venta.productosDelDia) {
    PRODUCTOS_CONFIG.forEach(p => { data.productos[p.key] = Math.max(0, (data.productos[p.key] || 0) - (venta.productosDelDia[p.key] || 0)); });
  } else {
    data.productos.burgers = Math.max(0, (data.productos.burgers || 0) - (venta.burgers || 0));
  }
}

function editCierre(id) {
  const v = data.ventas.find(x => x.id === id);
  if (!v) return;
  $('cierre-edit-fecha').value = v.fecha;
  $('cierre-fecha').value = v.fecha || '';
  $('cierre-dia').value = v.dia || dayNameFromISO(v.fecha);
  PRODUCTOS_CONFIG.forEach(p => {
    const el = $('cierre-prod-' + p.key);
    if (el) el.value = v.productosDelDia ? (v.productosDelDia[p.key] || '') : (p.key === 'burgers' ? v.burgers || '' : '');
  });
  document.querySelectorAll('.cierre-pago-input').forEach(el => {
    const p = (v.pagos || []).find(x => x.plataforma === el.dataset.plat);
    el.value = p && p.monto ? p.monto : '';
  });
  recalcCierreTotal();
  fillArqueo(v.arqueo || null);
  $('cierre-panel').classList.add('editing');
  $('cierre-cancel-btn').style.display = '';
  $('content').scrollTop = 0;
}
function deleteCierre(id) {
  const v = data.ventas.find(x => x.id === id);
  if (!v || !confirm(`¿Eliminar el cierre del ${formatDate(v.fecha)}?`)) return;
  cierreSubtractProductos(v);
  data.ventas = data.ventas.filter(x => x.id !== id);
  if (!data.ventas.length) data.balance.ventas = 0;
  if ($('cierre-edit-fecha').value === v.fecha) resetCierreForm(true);
  saveData('Cierre eliminado');
}
function resetCierreForm(silent) {
  clearArqueo();
  $('cierre-edit-fecha').value = '';
  $('cierre-fecha').value = todayISO();
  $('cierre-dia').value = dayNameFromISO(todayISO());
  PRODUCTOS_CONFIG.forEach(p => { const el = $('cierre-prod-' + p.key); if (el) el.value = ''; });
  document.querySelectorAll('.cierre-pago-input').forEach(el => { el.value = ''; });
  recalcCierreTotal();
  $('cierre-panel').classList.remove('editing');
  $('cierre-cancel-btn').style.display = 'none';
  if (silent !== true) renderUltimosCierres();
}

function renderUltimosCierres() {
  const el = $('cierre-ultimos');
  $('cierre-count-badge').textContent = `${data.ventas.length} ${data.ventas.length === 1 ? 'día' : 'días'} · ${fmt(calcTotalVentas())}`;
  if (!data.ventas.length) {
    el.innerHTML = `<div class="empty-state">${ic('calendar')}<div>No hay cierres registrados este mes.<br>Cargá el primero con el formulario.</div></div>`;
    return;
  }
  const total = calcTotalVentas();
  el.innerHTML = [...data.ventas].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).map(v => {
    const cobros = (v.pagos || []).filter(p => p.monto > 0).map(p => `${esc(p.plataforma)} <strong>${fmt(p.monto)}</strong>`).join('<span>·</span>');
    const prods = v.productosDelDia
      ? PRODUCTOS_CONFIG.filter(p => v.productosDelDia[p.key] > 0).map(p => `${p.label} <strong>${v.productosDelDia[p.key]}</strong>`).join('<span>·</span>')
      : `Burgers <strong>${v.burgers || 0}</strong>`;
    return `<div class="cierre-card">
      <div class="cierre-top">
        <div><span class="cierre-dia">${esc(v.dia)}</span><span class="cierre-fecha">${formatDate(v.fecha)}</span></div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="cierre-monto">${fmt(v.monto)}</span>
          <span class="small text-muted hide-sm">${pct(v.monto, total)}</span>
          ${rowActions(`editCierre('${v.id}')`, `deleteCierre('${v.id}')`)}
        </div>
      </div>
      ${prods ? `<div class="cierre-meta">${prods}</div>` : ''}
      ${cobros ? `<div class="cierre-meta">${cobros}</div>` : ''}
    </div>`;
  }).join('');
}

// Arqueo de caja
function toggleArqueo(force) {
  const open = typeof force === 'boolean' ? force : !$('arqueo-body').classList.contains('open');
  $('arqueo-toggle-btn').classList.toggle('open', open);
  $('arqueo-body').classList.toggle('open', open);
}
function recalcArqueo() {
  let total = 0;
  ARS_DENOMS.forEach(d => {
    const sub = int($('ars-' + d)?.value) * d;
    total += sub;
    const el = $('sub-ars-' + d);
    if (el) el.textContent = fmt(sub);
  });
  $('arqueo-total-ars').textContent = fmt(total);
}
function readArqueo() {
  const pesos = {};
  ARS_DENOMS.forEach(d => { pesos[d] = Math.max(0, int($('ars-' + d)?.value)); });
  return Object.values(pesos).some(v => v > 0) ? { pesos } : null;
}
function fillArqueo(arqueo) {
  clearArqueo();
  if (!arqueo) return;
  ARS_DENOMS.forEach(d => { const el = $('ars-' + d); if (el && arqueo.pesos?.[d]) el.value = arqueo.pesos[d]; });
  recalcArqueo();
  toggleArqueo(true);
}
function clearArqueo() {
  ARS_DENOMS.forEach(d => { const el = $('ars-' + d); if (el) el.value = ''; });
  recalcArqueo();
  toggleArqueo(false);
}

// ─────────────────────────────────────────────────────
// 25. SUELDOS
// ─────────────────────────────────────────────────────
// Carga 100% manual: cada día trabajado es un registro con empleado,
// fecha, función y el monto de ese día. Un mismo empleado puede tener
// varias funciones y montos distintos según el día.
function empById(id) { return data.sueldosDetalle.find(e => e.id === id); }
function regNombre(r) { return empById(r.empId)?.nombre || r.empNombre || '(sin nombre)'; }

const diasTxt = n => `${fmtInt(n)} ${n === 1 ? "día" : "días"}`;
function regsDe(empId, funcion) {
  return data.sueldosRegistros.filter(r => r.empId === empId && (funcion === undefined || r.funcion === funcion));
}
// Puestos de un empleado: los configurados + los que aparecen en días cargados
function puestosDe(e) {
  const list = e.funciones.map(f => ({ funcion: f.funcion, pagoPorDia: f.pagoPorDia || 0, funcId: f.id }));
  regsDe(e.id).forEach(r => {
    if (!list.some(p => p.funcion === r.funcion)) list.push({ funcion: r.funcion, pagoPorDia: 0, funcId: null });
  });
  return list;
}
// Para pasar nombres de puesto dentro de onclick sin romper las comillas
const encArg = s => encodeURIComponent(s).replace(/'/g, '%27');

function renderSueldos() {
  const regs = data.sueldosRegistros;
  const total = calcTotalSueldos();
  const dias = calcDiasSueldos();
  $('sueldos-kpis').innerHTML = [
    kpi({ label: 'Total sueldos del mes', icon: 'users', value: fmt(total), sub: `${data.sueldosDetalle.length} empleados`, cls: 'accent' }),
    kpi({ label: 'Días trabajados', icon: 'calendar', value: fmtInt(dias), sub: 'entre todos los empleados' }),
    kpi({ label: 'Promedio por día', icon: 'cash', value: fmt(dias ? total / dias : 0), sub: 'por empleado y día' }),
    kpi({ label: 'Sobre ingresos', icon: 'pie', value: pct(total, data.balance.ventas), sub: 'Porcentaje de lo vendido' }),
  ].join('');

  // Tarjeta por empleado: nombre arriba y una fila por puesto
  $('sueldos-emps').innerHTML = data.sueldosDetalle.map(e => {
    const empTotal = regsDe(e.id).reduce((t, r) => t + (Number(r.monto) || 0), 0);
    const puestos = puestosDe(e);
    return `<div class="emp-card">
      <div class="emp-card-head">
        <div>
          <div class="emp-card-name">${esc(e.nombre)}</div>
          <div class="small text-muted">${diasTxt(calcDiasSueldos(regsDe(e.id)))} · total ${fmt(empTotal)}</div>
          ${mediosResumen(regsDe(e.id))}
        </div>
        ${rowActions(`editEmpleado('${e.id}')`, `deleteEmpleado('${e.id}')`)}
      </div>
      <div class="puesto-head"><span>Puesto</span><span class="c">Días trabajados</span><span>Pago por día</span><span class="r">Total en el puesto</span></div>
      ${puestos.map(p => {
        const pr = regsDe(e.id, p.funcion);
        const n = calcDiasSueldos(pr);
        const tot = pr.reduce((t, r) => t + (Number(r.monto) || 0), 0);
        const fa = encArg(p.funcion);
        return `<div class="puesto-row">
          <div class="puesto-name">${esc(p.funcion)}</div>
          <div class="puesto-dias">
            <div class="stepper">
              <button onclick="quitarDia('${e.id}','${fa}')" ${n ? '' : 'disabled'} aria-label="Quitar un día de ${esc(p.funcion)}">${ic('minus', 'ic-sm')}</button>
              <span class="stepper-val">${n}</span>
              <button onclick="agregarDia('${e.id}','${fa}')" aria-label="Agregar un día de ${esc(p.funcion)}">${ic('plus', 'ic-sm')}</button>
            </div>
          </div>
          <div class="puesto-pago">
            <span class="puesto-lbl">Pago por día</span>
            <div class="money-input"><span>$</span><input type="number" min="0" inputmode="decimal" value="${p.pagoPorDia || ''}" placeholder="0"
              onchange="setPagoPorDia('${e.id}','${fa}', this.value)" aria-label="Pago por día de ${esc(p.funcion)}" /></div>
          </div>
          <div class="puesto-total"><span class="puesto-lbl">Total</span><strong>${fmt(tot)}</strong></div>
        </div>`;
      }).join('')}
      <button class="btn btn-ghost btn-sm ro-hide" style="margin-top:10px" onclick="agregarPuesto('${e.id}')">${ic('plus', 'ic-sm')}Agregar puesto</button>
    </div>`;
  }).join('') || `<div class="empty-state">${ic('users')}<div>No hay empleados cargados.<br>Agregá el primero con “Nuevo empleado”.</div></div>`;

  const sinEmpleado = regs.filter(r => !empById(r.empId));
  $('sueldos-total').innerHTML = `<span>Total sueldos del mes${sinEmpleado.length ? ` <span class="small text-muted">(incluye ${sinEmpleado.length} días de empleados eliminados)</span>` : ''}</span><strong>${fmt(total)}</strong>`;
}

// Medio con el que se le pagó el último día (para proponerlo en el próximo)
function ultimoMedioDe(empId) {
  const r = regsDe(empId).filter(x => x.medio !== undefined).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')).pop();
  return r ? r.medio : (data.config.plataformas || [])[0] || '';
}
// "Efectivo $X · Mercado Pago 1 $Y" de un grupo de pagos
function mediosResumen(list) {
  const m = {};
  list.forEach(r => { if (r.monto) { const k = r.medio || 'Sin especificar'; m[k] = (m[k] || 0) + (Number(r.monto) || 0); } });
  const parts = Object.entries(m);
  return parts.length ? `<div class="medios-mini">${parts.map(([k, v]) => `<span class="badge badge-gray">${esc(k)} · ${fmt(v)}</span>`).join('')}</div>` : '';
}

// + : cargar un día en ese puesto eligiendo la fecha en el calendario
function agregarDia(empId, funcEnc) {
  if (IS_READONLY) return;
  const e = empById(empId);
  const funcion = decodeURIComponent(funcEnc);
  if (!e) return;
  const p = puestosDe(e).find(x => x.funcion === funcion);
  openForm({
    title: `Agregar día · ${e.nombre} · ${funcion}`,
    fields: [
      { k: 'fecha', label: 'Fecha', type: 'date', value: todayISO(), required: true },
      { k: 'monto', label: 'Pago de ese día ($)', type: 'number', value: p?.pagoPorDia || '', required: true },
      histMedioField(data, { medio: ultimoMedioDe(empId) }),
      { k: 'nota', label: 'Nota (opcional)', type: 'text', value: '', full: true },
    ],
    onSave: v => {
      const monto = num(v.monto);
      if (!monto) { showToast('Cargá el pago de ese día'); return; }
      if (regsDe(empId, funcion).some(r => r.fecha === v.fecha) &&
          !confirm(`${e.nombre} ya tiene cargado el ${formatDate(v.fecha)} como ${funcion}. ¿Cargarlo otra vez?`)) return;
      const reg = { id: uid(), empId, empNombre: e.nombre, fecha: v.fecha, funcion, monto, medio: v.medio || '', nota: v.nota || '' };
      data.sueldosRegistros.push(reg);
      commit();
      showToast(`${e.nombre} · ${formatDate(v.fecha)} · ${fmt(monto)} cargado`, { action: 'Deshacer', onAction: () => deleteRegistro(reg.id, true) });
    },
  });
}

// − : quitar el último día cargado en ese puesto
function quitarDia(empId, funcEnc) {
  if (IS_READONLY) return;
  const e = empById(empId);
  const funcion = decodeURIComponent(funcEnc);
  const pr = regsDe(empId, funcion).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const r = pr[0];
  if (!r) return;
  const nombre = e?.nombre || r.empNombre;
  if (Number(r.dias) > 1) {
    // Carga anterior con varios días juntos: se resta uno
    const porDia = r.monto / r.dias;
    if (!confirm(`¿Quitar 1 día de ${nombre} (${funcion})? Quedan ${r.dias - 1} días de la carga anterior.`)) return;
    r.dias -= 1;
    r.monto = Math.round(porDia * r.dias);
    commit({ toast: 'Día quitado' });
    return;
  }
  if (!confirm(`¿Quitar el día ${r.fecha ? formatDate(r.fecha) + ' (' + dayNameFromISO(r.fecha) + ')' : ''} de ${nombre} como ${funcion} (${fmt(r.monto)})?`)) return;
  data.sueldosRegistros = data.sueldosRegistros.filter(x => x.id !== r.id);
  if (!data.sueldosRegistros.length) data.balance.sueldos = 0;
  commit();
  showToast('Día quitado', { action: 'Deshacer', onAction: () => { data.sueldosRegistros.push(r); commit({ toast: 'Día restaurado' }); } });
}

// Cambiar el pago por día de un puesto (opcionalmente también en los días ya cargados)
function setPagoPorDia(empId, funcEnc, value) {
  if (IS_READONLY) return;
  const e = empById(empId);
  const funcion = decodeURIComponent(funcEnc);
  if (!e) return;
  const pago = Math.max(0, num(value));
  let f = e.funciones.find(x => x.funcion === funcion);
  if (!f) { f = { id: uid(), funcion, pagoPorDia: pago }; e.funciones.push(f); }
  f.pagoPorDia = pago;
  const pr = regsDe(empId, funcion).filter(r => (Number(r.monto) || 0) !== pago * (Number(r.dias) || 1));
  if (pr.length && pago && confirm(`¿Actualizar también los ${pr.length} días ya cargados de ${e.nombre} como ${funcion} a ${fmt(pago)} por día?\n\nAceptar = actualizar los días cargados · Cancelar = usar el valor solo para los días nuevos`)) {
    pr.forEach(r => { r.monto = pago * (Number(r.dias) || 1); });
    commit({ toast: 'Pago por día actualizado en todos los días' });
  } else {
    commit({ toast: 'Pago por día guardado' });
  }
}

function agregarPuesto(empId) {
  const e = empById(empId);
  if (!e) return;
  openForm({
    title: `Agregar puesto · ${e.nombre}`,
    fields: [
      { k: 'funcion', label: 'Puesto', type: 'text', value: '', required: true, suggest: [...new Set(data.sueldosDetalle.flatMap(x => x.funciones.map(f => f.funcion)))] },
      { k: 'pago', label: 'Pago por día ($)', type: 'number', value: '' },
    ],
    onSave: v => {
      if (e.funciones.some(f => f.funcion.toLowerCase() === v.funcion.toLowerCase())) { showToast('Ese puesto ya existe'); return; }
      e.funciones.push({ id: uid(), funcion: v.funcion, pagoPorDia: num(v.pago) });
      saveData('Puesto agregado');
    },
  });
}

function registroFields(d, r = {}) {
  const emps = d.sueldosDetalle;
  const funcs = [...new Set([...emps.flatMap(e => e.funciones.map(f => f.funcion)), ...d.sueldosRegistros.map(x => x.funcion)].filter(Boolean))];
  return [
    { k: 'empNombre', label: 'Empleado', type: 'text', value: r.empId ? (emps.find(e => e.id === r.empId)?.nombre || r.empNombre) : (r.empNombre || ''), suggest: emps.map(e => e.nombre), required: true },
    { k: 'fecha', label: 'Fecha', type: 'date', value: r.fecha || '' },
    { k: 'funcion', label: 'Puesto', type: 'text', value: r.funcion || '', suggest: funcs, required: true },
    { k: 'monto', label: 'Pago de ese día ($)', type: 'number', value: r.monto ?? '', required: true },
    histMedioField(d, r),
    ...(Number(r.dias) > 1 ? [{ k: 'dias', label: 'Cantidad de días (carga anterior)', type: 'number', value: r.dias }] : []),
    { k: 'nota', label: 'Nota', type: 'text', value: r.nota || '', full: true },
  ];
}
// Aplica un registro de sueldo sobre un conjunto de datos (mes actual o archivado)
function applyRegistro(d, id, v) {
  const nombre = v.empNombre.trim();
  let e = d.sueldosDetalle.find(x => x.nombre.toLowerCase() === nombre.toLowerCase());
  if (!e) { e = { id: uid(), nombre, funciones: [] }; d.sueldosDetalle.push(e); }
  const funcion = v.funcion.trim() || 'General';
  if (!e.funciones.some(f => f.funcion.toLowerCase() === funcion.toLowerCase())) e.funciones.push({ id: uid(), funcion, pagoPorDia: num(v.monto) });
  const reg = { empId: e.id, empNombre: e.nombre, fecha: v.fecha, funcion, monto: num(v.monto), nota: v.nota || '' };
  if (v.medio !== undefined) reg.medio = v.medio;
  if (v.dias !== undefined) reg.dias = Math.max(1, int(v.dias));
  const i = d.sueldosRegistros.findIndex(x => x.id === id);
  if (i >= 0) d.sueldosRegistros[i] = { ...d.sueldosRegistros[i], ...reg };
  else d.sueldosRegistros.push({ id: uid(), ...reg });
}
function editRegistro(id) {
  const r = data.sueldosRegistros.find(x => x.id === id);
  if (!r) return;
  openForm({
    title: 'Editar día trabajado',
    fields: registroFields(data, r),
    onSave: v => { applyRegistro(data, id, v); saveData('Día actualizado'); },
  });
}
function deleteRegistro(id, skipConfirm) {
  const r = data.sueldosRegistros.find(x => x.id === id);
  if (!r) return;
  if (!skipConfirm && !confirm(`¿Eliminar el día ${r.fecha ? formatDate(r.fecha) : ''} de ${regNombre(r)} (${fmt(r.monto)})?`)) return;
  data.sueldosRegistros = data.sueldosRegistros.filter(x => x.id !== id);
  if (!data.sueldosRegistros.length) data.balance.sueldos = 0;
  saveData('Día eliminado');
}

// Modal empleado: nombre + funciones con sueldo sugerido
function empRenderFunciones() {
  $('emp-funciones-list').innerHTML = empFunciones.map((f, i) => `
    <div class="emp-func-grid">
      <div class="form-group">${i === 0 ? '<label>Puesto</label>' : ''}<input type="text" value="${esc(f.funcion)}" placeholder="Ej: Cocina" oninput="empFunciones[${i}].funcion=this.value" /></div>
      <div class="form-group">${i === 0 ? '<label>Pago por día ($)</label>' : ''}<input type="number" min="0" inputmode="decimal" value="${f.pagoPorDia || ''}" placeholder="0" oninput="empFunciones[${i}].pagoPorDia=parseFloat(this.value)||0" /></div>
      <div>${empFunciones.length > 1 ? `<button class="icon-btn danger" onclick="empRemoveFuncion(${i})" aria-label="Quitar puesto">${ic('trash', 'ic-sm')}</button>` : '<span style="display:block;width:32px"></span>'}</div>
    </div>`).join('');
}
function empAddFuncion() { empFunciones.push({ id: uid(), funcion: '', pagoPorDia: 0 }); empRenderFunciones(); }
function empRemoveFuncion(i) { if (empFunciones.length > 1) { empFunciones.splice(i, 1); empRenderFunciones(); } }
function openAddEmpleadoModal() {
  empFunciones = [{ id: uid(), funcion: 'General', pagoPorDia: 0 }];
  $('emp-edit-index').value = ''; $('emp-nombre').value = '';
  empRenderFunciones();
  openModal('modal-empleado');
}
function editEmpleado(id) {
  const e = empById(id);
  if (!e) return;
  empFunciones = clone(e.funciones);
  $('emp-edit-index').value = id; $('emp-nombre').value = e.nombre;
  empRenderFunciones();
  openModal('modal-empleado');
}
function saveEmpleado() {
  const id = $('emp-edit-index').value;
  const nombre = $('emp-nombre').value.trim();
  if (!nombre) { showToast('Completá el nombre'); return; }
  if (data.sueldosDetalle.some(e => e.id !== id && e.nombre.toLowerCase() === nombre.toLowerCase())) { showToast('Ya existe un empleado con ese nombre'); return; }
  const funciones = empFunciones.map(f => ({ id: f.id || uid(), funcion: (f.funcion || '').trim() || 'General', pagoPorDia: num(f.pagoPorDia) }));
  const i = data.sueldosDetalle.findIndex(e => e.id === id);
  if (i >= 0) {
    const old = data.sueldosDetalle[i];
    // Si se renombra una función, se actualizan sus días cargados
    old.funciones.forEach(of => {
      const nf = funciones.find(f => f.id === of.id);
      if (nf && nf.funcion !== of.funcion) data.sueldosRegistros.forEach(r => { if (r.empId === id && r.funcion === of.funcion) r.funcion = nf.funcion; });
    });
    data.sueldosRegistros.forEach(r => { if (r.empId === id) r.empNombre = nombre; });
    data.sueldosDetalle[i] = { ...old, nombre, funciones };
  } else {
    data.sueldosDetalle.push({ id: uid(), nombre, funciones });
  }
  closeModal('modal-empleado');
  saveData('Empleado guardado');
}
function deleteEmpleado(id) {
  const e = empById(id);
  if (!e) return;
  const n = data.sueldosRegistros.filter(r => r.empId === id).length;
  const msg = n ? `¿Eliminar a ${e.nombre}?\n\nTiene ${n} días cargados este mes: se mantienen y siguen sumando en el total.` : `¿Eliminar a ${e.nombre}?`;
  if (!confirm(msg)) return;
  data.sueldosDetalle = data.sueldosDetalle.filter(x => x.id !== id);
  saveData('Empleado eliminado');
}

// ─────────────────────────────────────────────────────
// 25b. STOCK
// ─────────────────────────────────────────────────────
// Control manual: en cada revisión (ej. semanal) se marca cada producto
// como OK, Flojo o Reponer. El estado actual es el de la última revisión.
// Los productos y su último estado pasan al mes siguiente.
const STOCK_ESTADOS = {
  ok:      { label: 'OK',      badge: 'badge-green', cls: 'ok' },
  flojo:   { label: 'Flojo',   badge: 'badge-amber', cls: 'flojo' },
  reponer: { label: 'Reponer', badge: 'badge-red',   cls: 'reponer' },
};
const STOCK_DEFAULT = ['Bebidas', 'Sazonador', 'Packaging', 'Parafinado', 'Aceite oleico', 'Nuggets', 'Aros de cebolla', 'Not burgers'];

function stockProd(id) { return data.stockProductos.find(p => p.id === id); }
function ultimoCheck(prodId, checks = data.stockChecks) {
  return checks.filter(c => c.prodId === prodId)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || 0) - (a.creado || 0))[0] || null;
}
function stockParaReponer() {
  return data.stockProductos.map(p => ({ p, c: ultimoCheck(p.id) })).filter(x => x.c && x.c.estado !== 'ok');
}
function diasDesde(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((new Date(new Date().toDateString()) - new Date(y, m - 1, d)) / 86400000);
}
function haceTxt(iso) {
  const d = diasDesde(iso);
  if (d === null) return '';
  return d <= 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`;
}

function renderStock() {
  if (!$('stock-fecha').value) $('stock-fecha').value = todayISO();
  const prods = data.stockProductos;
  const estados = prods.map(p => ultimoCheck(p.id)?.estado);
  const ultimaRev = data.stockChecks.reduce((max, c) => (c.fecha > max ? c.fecha : max), '');
  $('stock-kpis').innerHTML = [
    kpi({ label: 'OK', icon: 'check', value: estados.filter(e => e === 'ok').length, sub: `de ${prods.length} productos`, cls: 'green' }),
    kpi({ label: 'Flojo', icon: 'alert', value: estados.filter(e => e === 'flojo').length, sub: 'queda poco' }),
    kpi({ label: 'Reponer', icon: 'x', value: estados.filter(e => e === 'reponer').length, sub: 'hay que comprar', cls: estados.includes('reponer') ? 'red' : '' }),
    kpi({ label: 'Última revisión', icon: 'calendar', value: ultimaRev ? formatDateShort(ultimaRev) : '—', sub: ultimaRev ? haceTxt(ultimaRev) : 'Todavía no se revisó' }),
  ].join('');

  const fechaRev = $('stock-fecha').value;
  $('stock-list').innerHTML = prods.length ? prods.map(p => {
    const c = ultimoCheck(p.id);
    const est = c ? STOCK_ESTADOS[c.estado] : null;
    const hoy = c && c.fecha === fechaRev;
    return `<div class="stock-row ${est ? 'is-' + est.cls : ''}">
      <div class="stock-info">
        <div class="stock-name">${esc(p.nombre)}</div>
        <div class="small text-muted">${c ? `${est.label} · ${formatDateShort(c.fecha)} (${haceTxt(c.fecha)})${c.nota ? ' · ' + esc(c.nota) : ''}` : 'Sin revisar'}</div>
      </div>
      <div class="stock-toggle" role="group" aria-label="Estado de ${esc(p.nombre)}">
        ${Object.entries(STOCK_ESTADOS).map(([k, e]) => `
          <button class="st-btn st-${k} ${hoy && c.estado === k ? 'active' : ''}" onclick="marcarStock('${p.id}','${k}')">${e.label}</button>`).join('')}
      </div>
      <div class="stock-extra">
        <button class="icon-btn edit" onclick="notaStock('${p.id}')" title="Agregar nota" aria-label="Nota de ${esc(p.nombre)}">${ic('file', 'ic-sm')}</button>
        ${rowActions(`openStockProducto('${p.id}')`, `deleteStockProducto('${p.id}')`)}
      </div>
    </div>`;
  }).join('') : `<div class="empty-state">${ic('stock')}<div>No hay productos en el control de stock.</div></div>`;

  // Lista para reponer
  const lista = stockParaReponer().sort((a, b) => (a.c.estado === 'reponer' ? 0 : 1) - (b.c.estado === 'reponer' ? 0 : 1));
  $('stock-reponer').innerHTML = lista.length ? `<div class="kv">${lista.map(({ p, c }) =>
    kvRow(`${esc(p.nombre)}${c.nota ? ` <span class="small text-muted">· ${esc(c.nota)}</span>` : ''}`, `<span class="badge ${STOCK_ESTADOS[c.estado].badge}">${STOCK_ESTADOS[c.estado].label}</span>`)).join('')}</div>`
    : `<div class="empty-state" style="padding:18px">${ic('check')}<div>Todo OK, no hay nada para reponer.</div></div>`;

  // Historial
  const filtro = $('stock-filtro');
  const prev = filtro.value || 'todos';
  filtro.innerHTML = `<option value="todos">Todos los productos</option>` + prods.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('');
  filtro.value = prods.some(p => p.id === prev) ? prev : 'todos';
  const checks = data.stockChecks.filter(c => filtro.value === 'todos' || c.prodId === filtro.value)
    .slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.creado || 0) - (a.creado || 0));
  $('stock-movs').innerHTML = checks.length ? checks.map(c => {
    const e = STOCK_ESTADOS[c.estado] || STOCK_ESTADOS.ok;
    return `<tr>
      <td>${formatDate(c.fecha)}</td>
      <td class="fw-600">${esc(stockProd(c.prodId)?.nombre || c.prodNombre || '—')}</td>
      <td><span class="badge ${e.badge}">${e.label}</span>${c.arrastre ? ' <span class="small text-muted">(mes anterior)</span>' : ''}</td>
      <td class="hide-sm text-muted">${esc(c.nota) || '—'}</td>
      <td class="r">${c.arrastre ? '' : rowActions(null, `deleteStockCheck('${c.id}')`)}</td>
    </tr>`;
  }).join('') : emptyRow(5, 'Todavía no hay revisiones este mes.', 'list');
}

// Marca el estado de un producto en la fecha elegida (si ya se revisó ese día, lo reemplaza)
function marcarStock(prodId, estado) {
  if (IS_READONLY) return;
  const p = stockProd(prodId);
  if (!p) return;
  const fecha = $('stock-fecha').value || todayISO();
  const mismoDia = data.stockChecks.find(c => c.prodId === prodId && c.fecha === fecha && !c.arrastre);
  if (mismoDia) {
    if (mismoDia.estado === estado) return;
    mismoDia.estado = estado;
    mismoDia.creado = Date.now();
  } else {
    data.stockChecks.push({ id: uid(), prodId, prodNombre: p.nombre, fecha, estado, nota: '', creado: Date.now() });
  }
  commit({ toast: `${p.nombre}: ${STOCK_ESTADOS[estado].label}` });
}
function notaStock(prodId) {
  const p = stockProd(prodId);
  if (!p) return;
  const fecha = $('stock-fecha').value || todayISO();
  const c = data.stockChecks.find(x => x.prodId === prodId && x.fecha === fecha && !x.arrastre);
  const actual = ultimoCheck(prodId);
  openForm({
    title: `Nota · ${p.nombre}`,
    note: c ? '' : 'Si todavía no marcaste el estado de hoy, se guarda junto con el último estado.',
    fields: [
      { k: 'nota', label: 'Nota (ej: quedan 2 bidones, pedir el lunes)', type: 'text', value: c?.nota || '', full: true },
      ...(c ? [] : [{ k: 'estado', label: 'Estado', type: 'select', options: Object.entries(STOCK_ESTADOS).map(([k, e]) => [k, e.label]), value: actual?.estado || 'ok', full: true }]),
    ],
    onSave: v => {
      if (c) c.nota = v.nota;
      else data.stockChecks.push({ id: uid(), prodId, prodNombre: p.nombre, fecha, estado: v.estado, nota: v.nota, creado: Date.now() });
      saveData('Nota guardada');
    },
  });
}
function deleteStockCheck(id) {
  const c = data.stockChecks.find(x => x.id === id);
  if (!c || !confirm(`¿Borrar la revisión de ${stockProd(c.prodId)?.nombre || c.prodNombre} del ${formatDate(c.fecha)}?`)) return;
  data.stockChecks = data.stockChecks.filter(x => x.id !== id);
  saveData('Revisión borrada');
}

function copiarListaReposicion() {
  const lista = stockParaReponer();
  if (!lista.length) { showToast('No hay nada para reponer'); return; }
  const linea = ({ p, c }) => `• ${p.nombre}${c.nota ? ' (' + c.nota + ')' : ''}`;
  const rep = lista.filter(x => x.c.estado === 'reponer');
  const flo = lista.filter(x => x.c.estado === 'flojo');
  const txt = [`Perez's Burger · Stock ${formatDate(todayISO())}`,
    ...(rep.length ? ['', 'REPONER:', ...rep.map(linea)] : []),
    ...(flo.length ? ['', 'FLOJO:', ...flo.map(linea)] : [])].join('\n');
  navigator.clipboard.writeText(txt)
    .then(() => showToast('Lista copiada: pegala en WhatsApp'))
    .catch(() => { prompt('Copiá la lista:', txt); });
}

// Productos
function openStockProducto(id) {
  const p = id ? stockProd(id) : null;
  openForm({
    title: p ? `Editar ${p.nombre}` : 'Nuevo producto de stock',
    fields: [{ k: 'nombre', label: 'Producto', type: 'text', value: p?.nombre || '', required: true, full: true }],
    onSave: v => {
      const nombre = v.nombre.trim();
      if (data.stockProductos.some(x => x.id !== id && x.nombre.toLowerCase() === nombre.toLowerCase())) { showToast('Ya existe ese producto'); return; }
      if (p) p.nombre = nombre;
      else data.stockProductos.push({ id: uid(), nombre });
      saveData(p ? 'Producto actualizado' : 'Producto agregado');
    },
  });
}
function deleteStockProducto(id) {
  const p = stockProd(id);
  if (!p || !confirm(`¿Quitar ${p.nombre} del control de stock?`)) return;
  data.stockProductos = data.stockProductos.filter(x => x.id !== id);
  data.stockChecks = data.stockChecks.filter(c => c.prodId !== id);
  saveData('Producto quitado');
}

// ─────────────────────────────────────────────────────
// 26. LOGIN, SESIÓN Y SINCRONIZACIÓN
// ─────────────────────────────────────────────────────
function updateSyncUI(state, info = {}) {
  const el = $('sync-indicator');
  const MAP = {
    synced:  ['Guardado', 'Todo sincronizado con la nube'],
    syncing: ['Guardando…', 'Sincronizando con la nube'],
    pending: ['Pendiente', 'Hay cambios guardados en este equipo que todavía no subieron a la nube. Se reintenta solo.'],
    offline: ['Sin conexión', 'Sin conexión con la nube. Los cambios quedan guardados acá y se suben al volver la conexión.'],
    error:   ['Error', info.detail || 'Error de sincronización'],
    local:   ['Local', 'Modo local: los datos se guardan sólo en este navegador'],
  };
  const [text, title] = MAP[state] || MAP.local;
  el.dataset.state = state;
  el.querySelector('.sync-text').textContent = text;
  el.title = title + (info.lastSyncAt ? ` · Última sincronización ${new Date(info.lastSyncAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : '');
}
function manualSync() {
  if (!Sync.CONFIGURED) { showToast('Modo local: los datos se guardan en este navegador'); return; }
  Sync.syncNow();
  showToast('Sincronizando…');
}

function setUserUI(user) {
  const email = user?.email || '';
  const name = user ? (user.user_metadata?.nombre || email.split('@')[0]) : 'Modo local';
  $('user-name').textContent = name.charAt(0).toUpperCase() + name.slice(1);
  $('user-role').textContent = IS_READONLY ? 'Solo lectura' : (user ? 'Edición' : 'Sin login');
  $('user-avatar').textContent = (name[0] || '·').toUpperCase();
  $('logout-btn').style.display = user ? '' : 'none';
}

async function logout() {
  if (!confirm('¿Cerrar sesión?\n\nSe borran los datos guardados en este navegador (quedan en la nube).')) return;
  showToast('Subiendo cambios pendientes…');
  if (!await Sync.logout()) {
    if (!confirm('Hay cambios que todavía no se pudieron subir a la nube (¿sin conexión?).\n\nSi cerrás sesión ahora se pierden. ¿Cerrar igual?\n\nRecomendado: Cancelar, esperar a tener conexión y volver a intentar.')) return;
    await Sync.logout(true);
  }
  [MAIN_KEY, HISTORIAL_KEY, AUTOBACKUP_KEY].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  Sync.resetLocal();
  location.reload();
}

function showLogin() {
  $('login-title').textContent = `${saludoHora()}, ${NOMBRE_SALUDO}`;
  document.body.classList.remove('is-loading');
  document.body.classList.add('is-locked');
  if (!IS_TOUCH) setTimeout(() => $('login-user').focus(), 700);
}

// Bienvenida: logo + saludo, y después el Dashboard con su animación
function boot() {
  const body = document.body;
  $('splash-greet').textContent = `${saludoHora()}, ${NOMBRE_SALUDO}`;
  body.classList.remove('is-locked', 'login-out', 'is-loading');
  body.classList.add('splash');
  if (IS_READONLY) body.classList.add('readonly');
  updateMonthBadge();
  const wait = REDUCED_MOTION ? 400 : 1300;
  setTimeout(() => {
    body.classList.add('splash-out');
    // Siempre abre en el Dashboard, con animación de entrada
    body.classList.add('intro');
    navigateTo('dashboard');
    setTimeout(() => body.classList.remove('splash', 'splash-out'), REDUCED_MOTION ? 0 : 550);
    setTimeout(() => body.classList.remove('intro'), 1200);
  }, wait);
}

$('login-pass-toggle').addEventListener('click', () => {
  const inp = $('login-pass');
  inp.type = inp.type === 'password' ? 'text' : 'password';
});
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const user = $('login-user').value.trim();
  const pass = $('login-pass').value;
  const err = $('login-error');
  err.classList.remove('show');
  if (!user || !pass) { err.textContent = 'Completá usuario y contraseña.'; err.classList.add('show'); return; }
  const btn = $('login-submit');
  btn.disabled = true; btn.textContent = 'Ingresando…';
  try {
    const u = await Sync.login(user, pass);
    $('login-pass').value = '';
    setUserUI(u);
    document.body.classList.add('login-out');
    await new Promise(r => setTimeout(r, REDUCED_MOTION ? 0 : 380));
    boot();
    Sync.start();
  } catch (ex) {
    err.textContent = ex.message; err.classList.add('show');
  } finally {
    btn.disabled = false; btn.textContent = 'Ingresar';
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  loadData();
  const hooks = {
    getData: () => data,
    setData: d => { data = migrateData(clone(d)); persistLocal(); },
    onRemoteApplied: () => { updateMonthBadge(); if (!anyModalOpen()) requestRender(); else pendingRender = true; },
    isBusy: anyModalOpen,
    isReadonly: () => IS_READONLY,
    getHistorial,
    setHistorial,
    onStatus: updateSyncUI,
    onSignedOut: () => { if (!document.body.classList.contains('is-locked')) location.reload(); },
    onStorageError: () => showToast('No hay espacio en el navegador. Descargá un backup.'),
  };
  try {
    const r = await Sync.init(hooks);
    if (r.mode === 'local') {
      document.body.classList.add('local-mode');
      setUserUI(null);
      updateSyncUI('local');
      boot();
    } else if (r.user) {
      setUserUI(r.user);
      boot();
      Sync.start();
    } else {
      showLogin();
    }
  } catch (e) {
    console.error(e);
    $('login-error').textContent = 'No se pudo conectar con el servidor de login. Revisá la conexión y recargá.';
    $('login-error').classList.add('show');
    showLogin();
  }
});
