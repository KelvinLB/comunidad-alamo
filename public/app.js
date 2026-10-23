/* Alerta Pantepec · Álamo Temapache
   La página lee data.json (lo escribe el bot cada 3 horas) y geo.json (comunidades, río y costa).
   Sin frameworks: todo se dibuja con DOM y SVG. */
'use strict';
(() => {

const TZ = 'America/Mexico_City';
const HORAS_ATRASO = 12;
const RECARGA_MS = 15 * 60e3;
const ESCENARIOS = ['normal', 'vigilancia', 'alerta'];
const $ = id => document.getElementById(id);
const root = document.documentElement;

/* ---------- Íconos (dibujados, sin imágenes externas) ---------- */
const svg24 = (body, w = 2.2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const IC = {
  eye: svg24('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="currentColor"/>', 2.4),
  run: svg24('<circle cx="14" cy="4.5" r="2" fill="currentColor"/><path d="M8 21l3-6 3 2v5M6 12l3-4h5l2 4 3 1M11 15l1-5"/>', 2.4),
  phone: svg24('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>'),
  bag: svg24('<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M9 7V5a3 3 0 0 1 6 0v2M4 13h16"/>'),
  map: svg24('<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>'),
  nocross: svg24('<circle cx="12" cy="12" r="9.5"/><path d="M5.3 18.7L18.7 5.3"/><path d="M6 14c2 1.5 4 1.5 6 0s4-1.5 6 0"/>'),
  box: svg24('<path d="M3 10h18M6 10v10h12V10M12 3l-6 4h12l-6-4z"/><path d="M12 13v5M10 15l2-2 2 2"/>'),
  plug: svg24('<path d="M13 2L5 13h6l-1 9 8-11h-6l1-9z"/>'),
  ear: svg24('<path d="M4 18V12a8 8 0 0 1 16 0v6M4 18a2 2 0 0 0 2 2h1v-6H6a2 2 0 0 0-2 2zM20 18a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z"/>'),
};

/* ---------- Niveles: color, nombre y qué hacer ---------- */
const LV = [
  {head: 'Sin peligro', c: 'var(--g)', on: 'var(--on-g)', todo: [
    ['eye', 'Viva su día normal. Revise esta página una vez al día en temporada de lluvias.'],
    ['bag', 'Tenga lista una mochila: papeles en bolsa de plástico, medicinas, lámpara, agua y cargador.'],
    ['map', 'Sepa a dónde iría: la casa de un familiar en lo alto o el refugio temporal.']]},
  {head: 'Esté atento', c: 'var(--y)', on: 'var(--on-y)', todo: [
    ['eye', 'Revise esta página y la radio varias veces al día, también en la noche.'],
    ['box', 'Suba a lo alto sus papeles, aparatos y comida.'],
    ['nocross', 'No cruce arroyos ni vados con agua corriendo, ni a pie ni en carro.'],
    ['phone', 'Platique con su familia a dónde irían si el río se sale.']]},
  {head: 'Peligro', c: 'var(--o)', on: 'var(--on-o)', todo: [
    ['bag', 'Ponga la mochila junto a la puerta y cargue el celular.'],
    ['run', 'Si vive cerca del río o en zona baja, váyase antes de que oscurezca a casa de familiares o al refugio.'],
    ['plug', 'Si el agua empieza a entrar, apague la luz y cierre el gas.'],
    ['ear', 'Haga caso de inmediato si Protección Civil pide salir.']]},
  {head: 'Peligro muy alto', c: 'var(--r)', on: 'var(--on-r)', todo: [
    ['run', 'Si le piden salir, salga ya hacia el refugio o a un lugar alto.'],
    ['bag', 'No regrese por sus cosas si el agua ya está subiendo.'],
    ['nocross', 'No camine ni maneje por calles con agua: aunque se vea poca, la corriente lo puede tumbar.'],
    ['phone', 'Llame al 911 si usted o alguien más está en peligro.']]},
];
const ANS = [
  {a: 'No', sub: 'Hoy no hay peligro'},
  {a: 'Puede ser', sub: 'Esté atento'},
  {a: 'Sí', sub: 'Peligro: prepárese'},
  {a: 'Sí', sub: 'Peligro muy alto'},
];
// Con datos atrasados nunca se dice "No, sin peligro"
const ANS_ATRASADO = {a: 'Sin datos', sub: 'No podemos confirmar que no hay peligro'};
const TAGS = ['Info', 'Atento', 'Alerta', 'Emergencia'];

/* ---------- Estado ---------- */
const S = {
  data: null,        // data.json en uso
  demo: null,        // escenario de ejemplo, o null
  atrasado: false,   // data.actualizado tiene más de 12 horas
  sinRed: false,     // la última carga falló y se muestra lo guardado
  cargadoEn: 0,
  geo: null, locs: [], alamo: null, sel: null,
};
const nivelDia = () => S.data ? S.data.riesgo.nivel : 0;
const apagado = n => S.atrasado && n === 0;
const etiqueta = n => apagado(n) ? 'Sin datos recientes' : LV[n].head;
const todoDe = n => apagado(n) ? LV[1].todo : LV[n].todo;
const respuesta = n => apagado(n) ? ANS_ATRASADO : ANS[n];

/* ---------- Utilidades ---------- */
const fmt = n => Math.round(n).toLocaleString('es-MX');
function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    if (k === 'style') e.style.cssText = attrs[k];
    else if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of kids) if (c != null) e.append(c instanceof Node ? c : document.createTextNode(c));
  return e;
}
const horasDesde = iso => (Date.now() - new Date(iso)) / 36e5;
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 6e4);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.round(m / 60);
  if (h < 48) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  return `hace ${Math.round(h / 24)} días`;
}
function dayName(iso, i) {
  if (i === 0) return 'Hoy';
  if (i === 1) return 'Mañana';
  const s = new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', {weekday: 'long', timeZone: TZ});
  return s[0].toUpperCase() + s.slice(1);
}
const dtime = iso => new Date(iso).toLocaleString('es-MX', {day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: TZ});
function lerp(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = pts[i - 1], [c, d] = pts[i];
    if (x <= c) return b + (d - b) * (x - a) / (c - a || 1);
  }
  return pts[pts.length - 1][1];
}
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
// SVG no acepta var() en atributos de presentación: se pasan a style.
function fixVars(svg) {
  return svg.replace(/<[^>]+>/g, tag => {
    const st = [];
    tag = tag.replace(/\s(fill|stroke)="((?:var|color-mix)\([^"]*\))"/g, (m, p, v) => { st.push(p + ':' + v); return ''; });
    if (!st.length) return tag;
    if (/\sstyle="/.test(tag)) return tag.replace(/\sstyle="/, ' style="' + st.join(';') + ';');
    return tag.replace(/(\s*\/?>)$/, ' style="' + st.join(';') + '"$1');
  });
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* modo privado */ } },
};
function setText(id, txt) { const e = $(id); if (e.textContent !== txt) e.textContent = txt; }

/* ---------- Lluvia en palabras e íconos ---------- */
function rainCat(mm) {
  if (mm < 5) return {w: 'Sin lluvia', k: 0};
  if (mm < 20) return {w: 'Poca lluvia', k: 1};
  if (mm < 50) return {w: 'Lluvia fuerte', k: 2};
  if (mm < 100) return {w: 'Mucha lluvia', k: 3};
  return {w: 'Lluvia peligrosa', k: 4};
}
function rainIcon(k, attrs = 'aria-hidden="true"') {
  if (k === 0) return `<svg viewBox="0 0 56 56" ${attrs}><circle cx="28" cy="28" r="10" fill="#F2B705"/><g stroke="#F2B705" stroke-width="3.5" stroke-linecap="round"><path d="M28 6v6M28 44v6M6 28h6M44 28h6M12.4 12.4l4.2 4.2M39.4 39.4l4.2 4.2M12.4 43.6l4.2-4.2M39.4 16.6l4.2-4.2"/></g></svg>`;
  const cloud = k >= 3 ? '#5E6B78' : '#9AA9B6', n = [0, 1, 3, 4, 5][k];
  let drops = '';
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 28 : 14 + i * (28 / (n - 1));
    drops += `<path d="M${x} 40 l-3 7" stroke="var(--river)" stroke-width="3.5" stroke-linecap="round"/>`;
  }
  const bolt = k === 4 ? '<path d="M30 34l-5 9h5l-3 8 8-11h-5l3-6z" fill="#F2B705"/>' : '';
  return `<svg viewBox="0 0 56 56" ${attrs}><path d="M16 36a9 9 0 0 1 1-18 12 12 0 0 1 23 3 7.5 7.5 0 0 1-1 15z" fill="${cloud}"/>${drops}${bolt}</svg>`;
}

/* ---------- Escena del puente ---------- */
const SKY = [['#7EC3EA', '#CBE8F7'], ['#9AB1C2', '#D3DEE5'], ['#6D7F8C', '#AAB7BF'], ['#3D4A55', '#73818B']];
const SKY_DARK = [['#173247', '#25506B'], ['#1C2B36', '#2E4250'], ['#141E26', '#26343E'], ['#0B1117', '#1B252D']];
const isDark = () => root.dataset.theme === 'dark' || (root.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);

// Altura del agua en el dibujo (y del viewBox): 232 = fondo, 170 = orilla.
const waterY = (q, U) => lerp(q, [[0, 226], [U.rp2 * 0.5, 200], [U.rp2, 170], [U.rp5, 140], [U.rp20, 108], [U.rp20 * 1.4, 92]]);
const nivelRio = (q, U) => q >= U.rp5 ? 3 : q >= U.rp2 ? 2 : q >= U.rp2 * 0.5 ? 1 : 0;
const PALABRA_RIO = ['Normal', 'Alto', 'Se sale', 'Inunda'];

function serieRio(D) {
  const S_ = (D.rio && D.rio.serie) || [];
  return {U: D.rio && D.rio.umbrales, past: S_.filter(s => !s.pron), fut: S_.filter(s => s.pron).slice(0, 7)};
}

function sceneSVG(D) {
  const G = D.riesgo.nivel, sky = (isDark() ? SKY_DARK : SKY)[G];
  const {U, past, fut} = serieRio(D);
  const hasR = U && past.length && fut.length;
  const qNow = hasR ? past[past.length - 1].caudal : 0, qPk = hasR ? Math.max(...fut.map(s => s.caudal)) : 0;
  const yNow = hasR ? waterY(qNow, U) : 220, yPk = hasR ? waterY(qPk, U) : 220;
  const iPk = hasR ? fut.findIndex(s => s.caudal === qPk) : 0;
  let rain = '';
  if (G >= 1) {
    const n = [0, 14, 26, 40][G];
    for (let i = 0; i < n; i++) rain += `<path d="M${(i * 37) % 420 - 10} ${(i * 53) % 110} l-4 12"/>`;
  }
  const clouds = G === 0 ? '<circle cx="330" cy="40" r="20" fill="#FFD23F"/>'
    : `<g fill="${G >= 2 ? '#5B6873' : '#C3CED6'}"><ellipse cx="90" cy="30" rx="70" ry="22"/><ellipse cx="150" cy="22" rx="60" ry="22"/><ellipse cx="290" cy="34" rx="80" ry="24"/><ellipse cx="370" cy="26" rx="50" ry="20"/></g>`;
  // regla de colores sobre la pila del puente
  const gx = 144, gw = 26, bands = [[170, 232, 'var(--g)'], [140, 170, 'var(--y)'], [108, 140, 'var(--o)'], [78, 108, 'var(--r)']];
  let gauge = bands.map(([a, b, c]) => `<rect x="${gx}" y="${a}" width="${gw}" height="${b - a}" fill="${c}"/>`).join('');
  for (let y = 80; y < 232; y += 6) gauge += `<path d="M${gx} ${y}h${y % 30 === 2 ? gw * 0.7 : gw * 0.35}" stroke="#14110A" stroke-width="1.4"/>`;
  gauge += `<rect x="${gx}" y="78" width="${gw}" height="154" fill="none" stroke="#14110A" stroke-width="2"/>`;
  const casa = (x, y) => `<g><rect x="${x}" y="${y - 30}" width="40" height="30" fill="#EADBC2" stroke="#4C3B28" stroke-width="2"/><path d="M${x - 5} ${y - 28}L${x + 20} ${y - 48}L${x + 45} ${y - 28}Z" fill="#B24A2E" stroke="#4C3B28" stroke-width="2"/><rect x="${x + 15}" y="${y - 16}" width="10" height="16" fill="#4C3B28"/></g>`;
  const wave = `M-40 0 ${Array.from({length: 14}, () => 'q10 -5 20 0 t20 0').join(' ')} V200 H-40 Z`;
  const label = (x, y, txt, size, anchor = 'start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="800" fill="var(--ink)" stroke="${sky[1]}" stroke-width="4" paint-order="stroke" font-family="Barlow Condensed, Arial Narrow, sans-serif">${txt}</text>`;
  return `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>
  <rect width="400" height="250" fill="url(#sky)"/>${clouds}
  <path d="M0 120 C60 90 120 110 180 96 C240 82 300 104 400 88 V250 H0Z" fill="var(--hill)" opacity=".75"/>
  ${casa(300, 170)}${casa(348, 170)}
  <rect x="150" y="70" width="14" height="170" fill="#8D8F90"/>${gauge}
  <g class="water" id="wgroup" style="transform:translateY(${(yNow - 232).toFixed(1)}px)"><g transform="translate(0 232)"><path class="waves" d="${wave}" fill="var(--water)" opacity=".92"/></g></g>
  <path d="M0 150 L40 150 L105 232 L262 232 L292 170 L400 170 L400 250 L0 250 Z" fill="#7E6448"/>
  <path d="M0 150 L40 150 L105 232 L262 232 L292 170 L400 170" fill="none" stroke="#4C3B28" stroke-width="3"/>
  <rect x="0" y="58" width="270" height="14" fill="#A5A7A8" stroke="#55585A" stroke-width="2"/>
  <path d="M0 58V44M30 58V44M60 58V44M90 58V44M120 58V44M150 58V44M180 58V44M210 58V44M240 58V44M270 58V44M0 46H270" stroke="#55585A" stroke-width="2.5" fill="none"/>
  <g class="rain" stroke="${G >= 2 ? '#E8EEF2' : '#5C7A8C'}" stroke-width="2" stroke-linecap="round" opacity=".8">${rain}</g>
  ${hasR ? `<g><path d="M${gx + gw + 2} ${yNow.toFixed(1)} h18" stroke="var(--ink)" stroke-width="3"/><path d="M${gx + gw + 2} ${yNow.toFixed(1)} l8 -5 v10z" fill="var(--ink)"/>${label(gx + gw + 24, (yNow + 6).toFixed(1), 'HOY', 18)}</g>` : ''}
  ${hasR && yPk < yNow - 14 ? `<path d="M${gx - 30} ${yPk.toFixed(1)} H${gx + gw + 80}" stroke="var(--ink)" stroke-width="2.5" stroke-dasharray="7 5"/>${label(gx - 34, (yPk + 5).toFixed(1), iPk === 0 ? 'MAÑANA' : 'EN ' + (iPk + 1) + ' DÍAS', 16, 'end')}` : ''}`;
}

function sceneLabel(D) {
  const {U, past, fut} = serieRio(D);
  if (!U || !past.length) return 'Dibujo del río bajo el puente con la regla de colores.';
  const hoy = PALABRA_RIO[nivelRio(past[past.length - 1].caudal, U)].toLowerCase();
  const pico = fut.length ? PALABRA_RIO[nivelRio(Math.max(...fut.map(s => s.caudal)), U)].toLowerCase() : hoy;
  return `Dibujo del río bajo el puente. Hoy el río está ${hoy}; en los próximos días se espera ${pico}.`;
}

function renderScene(D) {
  const sc = $('scene');
  sc.innerHTML = fixVars(sceneSVG(D));
  sc.setAttribute('aria-label', sceneLabel(D));
  const wg = sc.querySelector('#wgroup');
  if (wg) {  // el agua sube desde abajo al cargar
    const fin = wg.style.transform;
    wg.style.transform = 'translateY(0px)';
    requestAnimationFrame(() => requestAnimationFrame(() => { wg.style.transform = fin; }));
  }
}

/* ---------- La semana en reglitas ---------- */
function renderWeek(D) {
  const {U, past, fut} = serieRio(D), now = past[past.length - 1];
  const mk = (232 - 170) / (232 - 78) * 100;
  $('week').innerHTML = (D.lluvia || []).slice(0, 7).map((d, i) => {
    const q = i === 0 && now ? now.caudal : (fut[i - 1] || fut[fut.length - 1] || {caudal: 0}).caudal;
    const f = U ? Math.max(.06, Math.min(1, (232 - waterY(q, U)) / (232 - 78))) : .1;
    const lv = U ? nivelRio(q, U) : 0, w = PALABRA_RIO[lv], rc = rainCat(d.mm);
    const dia = dayName(d.fecha, i);
    return `<div class="wd" style="--c:${LV[lv].c}"><div class="dn" aria-hidden="true">${i === 0 ? 'Hoy' : dia.slice(0, 3)}</div>${fixVars(rainIcon(rc.k, `class="ri" role="img" aria-label="${rc.w}"`))}<div class="tube" role="img" aria-label="${dia}: río ${w.toLowerCase()}, ${rc.w.toLowerCase()}"><div class="fill" style="height:${(f * 100).toFixed(0)}%"></div>${U ? `<div class="mark" style="bottom:${mk.toFixed(0)}%"></div>` : ''}</div><div class="ww">${w}</div></div>`;
  }).join('');
}

/* ---------- Gráfica técnica del caudal ---------- */
function renderChart(D) {
  const box = $('chart'), rio = D.rio || {};
  const Sx = rio.serie || [], U = rio.umbrales;
  if (!Sx.length || !U || !$('tech').open) return;
  const W = Math.max(300, box.clientWidth || 600), H = 220, m = {l: 50, r: 10, t: 10, b: 26};
  const ymax = Math.max(U.rp20 * 1.08, ...Sx.map(s => s.max ?? s.caudal)) * 1.02;
  const x = i => m.l + (W - m.l - m.r) * i / (Sx.length - 1), y = v => m.t + (H - m.t - m.b) * (1 - v / ymax);
  let g = '';
  const raw = ymax / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), stp = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => k >= raw);
  for (let v = 0; v <= ymax; v += stp) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--soft)"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  [[U.rp2, 'var(--y)', '2 años'], [U.rp5, 'var(--o)', '5 años'], [U.rp20, 'var(--r)', '20 años']].forEach(([v, c, t]) => {
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${c}" stroke-width="2" stroke-dasharray="5 4"/><text x="${W - m.r - 2}" y="${y(v) - 4}" text-anchor="end">${t}</text>`;
  });
  let i0 = Sx.findIndex(s => s.pron);
  if (i0 < 1) i0 = Sx.length;
  const P = Sx.map((s, i) => [i, s]).filter(([i, s]) => i >= i0 - 1 && s.max != null);
  if (P.length > 1) {
    const band = [...P.map(([i, s]) => `${x(i)},${y(s.max)}`), ...[...P].reverse().map(([i, s]) => `${x(i)},${y(s.min ?? s.caudal)}`)];
    g += `<polygon points="${band.join(' ')}" fill="var(--river)" opacity=".22"/>`;
  }
  g += `<path d="${Sx.slice(0, i0).map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(s.caudal)}`).join('')}" fill="none" stroke="var(--river)" stroke-width="2.2"/>`;
  if (i0 < Sx.length) g += `<path d="${Sx.slice(i0 - 1).map((s, j) => `${j ? 'L' : 'M'}${x(i0 - 1 + j)},${y(s.caudal)}`).join('')}" fill="none" stroke="var(--river)" stroke-width="2.2" stroke-dasharray="6 3"/>`;
  g += `<text x="${x(i0 - 1)}" y="${H - 6}" text-anchor="middle">hoy</text><text x="${x(0)}" y="${H - 6}" text-anchor="start">−${i0 - 1} d</text><text x="${x(Sx.length - 1)}" y="${H - 6}" text-anchor="end">+${Sx.length - i0} d</text>`;
  box.innerHTML = fixVars(`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfica del caudal del río: últimos días y pronóstico">${g}</svg>`);
}

/* ---------- Respuesta y secciones ---------- */
function renderEstado(D) {
  const b = $('stale');
  let txt = '';
  if (S.atrasado) txt = `⚠ Datos atrasados: la última revisión fue ${ago(D.actualizado)}. Consulte la radio y a Protección Civil.`;
  else if (S.sinRed) txt = `⚠ Sin conexión: se muestra la última revisión guardada (${dtime(D.actualizado)}, ${ago(D.actualizado)}). Consulte la radio y a Protección Civil.`;
  if (S.atrasado && S.sinRed) txt += ' No hay conexión a internet.';
  setText('staletxt', txt);
  b.hidden = !txt;
  $('retry').hidden = !S.sinRed;
}

function renderHero(D) {
  const R = D.riesgo, n = R.nivel, L = LV[n], A = respuesta(n);
  const h = $('hero');
  h.style.setProperty('--c', L.c);
  h.style.setProperty('--on', L.on);
  setText('ans', A.a);
  setText('sub', A.sub);
  setText('msg', S.atrasado ? `Información de ${ago(D.actualizado)}, puede haber cambiado: ${R.resumen}` : R.resumen);
  setText('chance', `${Math.round(R.probabilidad)} de cada 100`);
  setText('when', `Revisado ${ago(D.actualizado)} · cada 3 horas`);
  document.title = `¿Se inunda Álamo? · Hoy: ${A.a}`;
  renderMine();
}

function renderTodo(D) {
  const n = D.riesgo.nivel, L = LV[n], tp = $('todopanel');
  tp.style.setProperty('--c', L.c);
  tp.style.setProperty('--on', L.on);
  $('todo').replaceChildren(...todoDe(n).map(([ic, t]) => el('li', null, el('div', {class: 'ti', html: IC[ic]}), el('span', null, t))));
}

function renderAlerts(D) {
  const AV = D.avisos || [];
  if (!AV.length) {
    $('alerts').replaceChildren(el('li', null, el('span', null, 'No hay avisos vigentes de las autoridades para Álamo.')));
    return;
  }
  $('alerts').replaceChildren(...AV.map(a => el('li', {style: `--c:${LV[a.nivel].c};--on:${LV[a.nivel].on}`},
    el('span', {class: 'tag'}, TAGS[a.nivel]),
    el('div', null,
      el('div', {class: 't'}, a.url ? el('a', {href: a.url, target: '_blank', rel: 'noopener'}, a.titulo) : a.titulo),
      el('div', {class: 'small'}, `${a.fuente} · ${dtime(a.fecha)}`)))));
}

function renderTech(D) {
  $('factors').replaceChildren(...D.riesgo.factores.map(f => {
    const lv = f.valor >= .75 ? 3 : f.valor >= .5 ? 2 : f.valor >= .25 ? 1 : 0;
    return el('li', null,
      el('div', null, el('b', null, f.nombre), el('div', {class: 'small mono'}, f.detalle)),
      el('div', {class: 'meter', role: 'img', 'aria-label': `${Math.round(f.valor * 100)} de 100`},
        el('span', {style: `width:${Math.max(3, f.valor * 100)}%;background:${LV[lv].c}`})));
  }));
  $('sources').replaceChildren(...(D.fuentes || []).map(s => el('tr', null,
    el('td', null, s.url ? el('a', {href: s.url, target: '_blank', rel: 'noopener'}, s.nombre) : s.nombre),
    el('td', null, s.aporta),
    el('td', null, el('span', {class: 'dot', style: `color:${s.ok ? '#1E7B3E' : 'var(--r)'}`}, s.ok ? '✓ ' : '✗ '),
      s.ok ? `${s.manual ? 'Captura manual · archivo revisado' : 'Funciona ·'} ${ago(s.fecha)}` : (s.fecha ? `Sin respuesta; se usa la lectura de ${ago(s.fecha)}` : 'Sin respuesta')))));
  renderChart(D);
}

function render() {
  const D = S.data;
  if (!D) return;
  S.atrasado = !D.ejemplo && horasDesde(D.actualizado) > HORAS_ATRASO;
  root.classList.toggle('atrasado', S.atrasado);
  setText('key0', S.atrasado ? 'Sin datos recientes' : 'Sin peligro');
  $('demo').hidden = !S.demo;
  renderEstado(D);
  renderHero(D);
  renderScene(D);
  renderWeek(D);
  renderTodo(D);
  renderAlerts(D);
  renderTech(D);
  renderComunidad();
  mapa.dibujar();
  $('osmbtn').hidden = !!D.ejemplo || !S.geo;
}

function sinDatos() {
  S.atrasado = true;  // sin datos tampoco se muestra verde
  root.classList.add('atrasado');
  setText('key0', 'Sin datos recientes');
  const h = $('hero');
  h.style.setProperty('--c', 'var(--na)');
  h.style.setProperty('--on', 'var(--on-na)');
  setText('ans', 'Sin datos');
  setText('sub', 'No se pudo cargar el aviso');
  setText('msg', 'Revise su conexión a internet y vuelva a intentar. Mientras, escuche la radio y siga los avisos de Protección Civil.');
  setText('chance', '—');
  setText('when', '');
  setText('staletxt', '⚠ Sin conexión: no se pudo cargar la información.');
  $('stale').hidden = false;
  $('retry').hidden = false;
}

/* ---------- Comunidades ---------- */
const COSL = Math.cos(20.95 * Math.PI / 180), KM = 111.2;
function distSeg(lat, lon, a, b) {  // km de un punto a un segmento (proyección plana a 20.95°)
  const px = lon * COSL, py = lat, ax = a[0] * COSL, ay = a[1], bx = b[0] * COSL, by = b[1];
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * KM;
}
function distRio(lat, lon) {
  let m = 1e9;
  for (let i = 1; i < S.geo.river.length; i++) m = Math.min(m, distSeg(lat, lon, S.geo.river[i - 1], S.geo.river[i]));
  return m;
}
const distKm = (a, b) => Math.hypot((a.lon - b.lon) * COSL, a.lat - b.lat) * KM;
const ZONAS = {
  junto: {drop: 0, txt: 'Está en zona baja junto al río. Si el río crece, el agua puede llegar aquí de las primeras.'},
  cerca: {drop: 1, txt: 'Está cerca del río. Si el río crece mucho, se pueden inundar las partes bajas y los caminos.'},
  lejos: {drop: 2, txt: 'Está lejos del río Pantepec. El peligro principal son los arroyos que crecen y los caminos que se cortan.'},
};
const zona = l => l.d <= 1.5 && l.alt <= 45 ? 'junto' : l.d <= 4 && l.alt <= 80 ? 'cerca' : 'lejos';
const commLevel = l => Math.max(0, nivelDia() - ZONAS[l.z].drop);
const kmTxt = d => d < 1 ? 'menos de 1 km' : (d < 10 ? d.toFixed(1).replace('.', ',') : Math.round(d)) + ' km';
const sinParentesis = n => n.replace(/\s*\(.*\)$/, '');

function prepararGeo(geo) {
  S.geo = geo;
  S.locs = geo.locs.map(([n, lat, lon, alt, pri]) => {
    const l = {n, lat, lon, alt, pri, key: norm(n)};
    l.d = distRio(lat, lon);
    l.z = zona(l);
    return l;
  });
  S.alamo = S.locs.find(l => l.pri === 1) || S.locs[0];
  for (const l of S.locs) l.dA = distKm(l, S.alamo);
  try {
    const m = JSON.parse(store.get('mi_comunidad') || 'null');
    if (m) S.sel = S.locs.find(l => l.n === m.n && Math.abs(l.lat - m.lat) < 1e-3 && Math.abs(l.lon - m.lon) < 1e-3) || null;
  } catch (e) { /* valor viejo o roto */ }
}

function selectLoc(l, zoom) {
  S.sel = l;
  store.set('mi_comunidad', JSON.stringify({n: l.n, lat: l.lat, lon: l.lon}));
  if (zoom) mapa.centrar(l);
  renderComunidad();
  renderMine();
  mapa.dibujar();
}

function renderChips() {
  const top = S.locs.filter(l => l.pri).sort((a, b) => a.pri - b.pri).slice(0, 8);
  $('chips').replaceChildren(...top.map(l => {
    const b = el('button', {type: 'button', 'aria-pressed': String(S.sel === l), style: `--c:${LV[commLevel(l)].c}`},
      el('i', {'aria-hidden': 'true'}), sinParentesis(l.n), el('span', {class: 'vh'}, `: ${etiqueta(commLevel(l))}`));
    b.onclick = () => { selectLoc(l, true); $('q').value = ''; };
    return b;
  }));
}

function renderCard() {
  const c = $('ccard'), l = S.sel;
  if (!l || !S.data) { c.hidden = true; return; }
  const lv = commLevel(l), L = LV[lv];
  c.style.setProperty('--c', L.c);
  c.style.setProperty('--on', L.on);
  c.replaceChildren(
    el('h3', null, l.n),
    el('div', {class: 'lvl'}, 'Hoy: ' + etiqueta(lv)),
    el('p', null, ZONAS[l.z].txt),
    el('div', {class: 'facts'},
      el('div', null, el('b', null, kmTxt(l.d)), el('span', null, 'del río Pantepec')),
      el('div', null, el('b', null, l.alt + ' m'), el('span', null, 'de altura')),
      el('div', null, el('b', null, l === S.alamo ? '—' : kmTxt(l.dA)), el('span', null, 'del centro de Álamo'))),
    el('p', {class: 'note'}, 'Riesgo estimado con la distancia al río y la altura. No toma en cuenta los arroyos.'));
  c.hidden = false;
}

function renderMine() {
  const m = $('mine');
  if (!S.sel || !S.data) { m.hidden = true; return; }
  setText('mine', `Su comunidad, ${S.sel.n}: ${etiqueta(commLevel(S.sel)).toLowerCase()}.`);
  m.hidden = false;
}

function renderComunidad() {
  if (!S.geo) return;
  renderChips();
  renderCard();
}

/* búsqueda sin importar acentos */
function initBusqueda() {
  const q = $('q'), res = $('results');
  function buscar() {
    const t = norm(q.value.trim());
    if (t.length < 2 || !S.geo) { res.hidden = true; return; }
    const hits = S.locs.filter(l => l.key.includes(t))
      .sort((a, b) => (a.key.startsWith(t) ? 0 : 1) - (b.key.startsWith(t) ? 0 : 1) || (a.pri || 999) - (b.pri || 999) || a.dA - b.dA)
      .slice(0, 8);
    res.replaceChildren(...(hits.length
      ? hits.map(l => {
        const b = el('button', {type: 'button'}, l.n, el('small', null, `A ${kmTxt(l.dA)} del centro de Álamo · ${l.alt} m de altura`));
        b.onclick = () => { selectLoc(l, true); res.hidden = true; q.value = l.n; q.blur(); $('ccard').scrollIntoView({block: 'nearest', behavior: 'smooth'}); };
        return el('li', null, b);
      })
      : [el('li', {class: 'none'}, 'No encontramos esa comunidad. Pruebe con otra parte del nombre.')]));
    res.hidden = false;
  }
  q.addEventListener('input', buscar);
  q.addEventListener('focus', buscar);
  q.addEventListener('keydown', e => {
    if (e.key === 'Escape') res.hidden = true;
    if (e.key === 'Enter') { const b = res.querySelector('button'); if (b) b.click(); }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) res.hidden = true; });
}

/* "Usar mi ubicación": solo si la persona lo toca; no se guarda su posición. */
function initUbicacion() {
  if (!('geolocation' in navigator)) return;
  const btn = $('locate'), msg = $('locmsg');
  btn.hidden = false;
  btn.onclick = () => {
    if (!S.geo) return;
    msg.hidden = false;
    msg.textContent = 'Buscando su ubicación…';
    navigator.geolocation.getCurrentPosition(p => {
      const yo = {lat: p.coords.latitude, lon: p.coords.longitude};
      let best = null, bd = 1e9;
      for (const l of S.locs) { const d = distKm(l, yo); if (d < bd) { bd = d; best = l; } }
      if (bd > 6) { msg.textContent = `Usted está a ${kmTxt(bd)} de la comunidad más cercana del municipio. Elija su comunidad en la lista.`; return; }
      selectLoc(best, true);
      msg.textContent = `Elegimos ${best.n}, la comunidad más cercana a usted (a ${kmTxt(bd)}).`;
    }, () => { msg.textContent = 'No pudimos saber su ubicación. Elija su comunidad en la lista.'; },
    {enableHighAccuracy: false, timeout: 15000, maximumAge: 600000});
  };
}

/* ---------- Mapa de comunidades (SVG propio) ---------- */
const mapa = (() => {
  const box = $('mapbox'), svg = $('msvg');
  const M = {lon: -97.705, lat: 21.0, k: 0, kDef: 0, W: 0, H: 0};
  const REG = {lon0: -98.40, lon1: -97.20, lat0: 20.38, lat1: 21.22};
  const INICIO = {lon: -97.705, lat: 21.0};
  const RIOS = [['Río Pantepec', 20.946, -97.76], ['Río Tuxpan', 20.975, -97.47], ['Río Cazones', 20.585, -97.52]];
  let raf = 0;

  function medir() {
    M.W = box.clientWidth;
    M.H = box.clientHeight;
    M.kDef = Math.min(M.W / (0.46 * COSL), M.H / 0.42) * 0.95;
  }
  const kMin = () => Math.min(M.W / ((REG.lon1 - REG.lon0) * COSL), M.H / (REG.lat1 - REG.lat0));
  const kMax = () => M.kDef * 14;
  const P = (lat, lon) => [M.W / 2 + (lon - M.lon) * M.k * COSL, M.H / 2 - (lat - M.lat) * M.k];
  const unP = (x, y) => [M.lat - (y - M.H / 2) / M.k, M.lon + (x - M.W / 2) / (M.k * COSL)];
  function clamp() {
    M.k = Math.max(kMin(), Math.min(kMax(), M.k));
    M.lon = Math.max(REG.lon0, Math.min(REG.lon1, M.lon));
    M.lat = Math.max(REG.lat0, Math.min(REG.lat1, M.lat));
  }
  function zoomAt(x, y, f) {
    const [la, lo] = unP(x, y);
    M.k *= f; clamp();
    const [x2, y2] = P(la, lo);
    M.lon += (x2 - x) / (M.k * COSL);
    M.lat -= (y2 - y) / M.k;
    clamp(); dibujar();
  }
  function dibujar() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); }

  function paint() {
    if (!S.geo || !M.W) return;
    if (!M.k) { M.k = M.kDef; clamp(); }
    const W = M.W, H = M.H, G = nivelDia(), GEO = S.geo;
    const line = pts => pts.map((p, i) => (i ? 'L' : 'M') + P(p[1], p[0]).map(v => v.toFixed(1)).join(',')).join('');
    const rw = Math.max(3, Math.min(9, M.k / 120));
    let s = `<rect width="${W}" height="${H}" fill="var(--land)"/>`;
    s += `<path d="${line([...GEO.coast, [-96.0, 21.6], [-96.0, 20.2]])}Z" fill="var(--sea)"/>`;
    s += `<path d="${line(GEO.cazones)}" fill="none" stroke="var(--river)" stroke-width="${(rw * 0.6).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>`;
    s += `<path d="${line(GEO.river)}" fill="none" stroke="var(--river)" stroke-width="${rw.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += `<path class="flow" d="${line(GEO.river)}" fill="none" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="${Math.max(1.5, rw / 3).toFixed(1)}" stroke-dasharray="3 17" stroke-linecap="round"/>`;

    // etiquetas sin encimarse: primero las importantes, luego el resto si cabe
    const boxes = [{x: W - 68, y: 0, w: 68, h: 176}, {x: 0, y: H - 46, w: 130, h: 46}], labels = [];
    const fits = b => b.x >= 2 && b.y >= 2 && b.x + b.w <= W - 2 && b.y + b.h <= H - 2 && !boxes.some(o => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
    function tryLabel(x, y, txt, size, weight, color, r) {
      const w = txt.length * size * 0.56 + 4, h = size + 4;
      for (const [dx, dy, anchor] of [[r + 5, 0, 'start'], [-r - 5, 0, 'end'], [0, -(r + size * 0.75), 'middle'], [0, r + size * 0.75, 'middle']]) {
        const b = {x: anchor === 'start' ? x + dx : anchor === 'end' ? x + dx - w : x - w / 2, y: y + dy - h / 2, w, h};
        if (fits(b)) {
          boxes.push(b);
          labels.push(`<text x="${(x + dx).toFixed(1)}" y="${(y + dy + size * 0.36).toFixed(1)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}" stroke="var(--land)" stroke-width="4" stroke-linejoin="round" paint-order="stroke">${esc(txt)}</text>`);
          return true;
        }
      }
      return false;
    }
    const inView = ([x, y], m = 20) => x > -m && x < W + m && y > -m && y < H + m;

    for (const [t, la, lo] of RIOS) { const p = P(la, lo); if (inView(p, 0)) tryLabel(p[0], p[1], t, 15, 700, 'var(--river)', 0); }
    // la sierra, de donde baja el agua, con la lluvia de los próximos 3 días
    const sp = P(20.56, -98.17);
    if (inView(sp, 40)) {
      const rs = ((S.data && S.data.lluvia) || []).slice(0, 3).reduce((a, d) => a + (d.cuenca_mm || 0), 0) / 1.5, rc = rainCat(rs);
      if (rc.k >= 2) s += `<g transform="translate(${(sp[0] - 28).toFixed(1)} ${(sp[1] - 62).toFixed(1)})">${rainIcon(rc.k, 'width="56" height="56"')}</g>`;
      tryLabel(sp[0] - 6, sp[1], 'SIERRA: aquí nace el río', 15, 700, 'var(--ink)', 0);
    }
    const towns = [];
    for (const [t, la, lo] of GEO.towns) {
      const p = P(la, lo);
      if (!inView(p)) continue;
      s += `<rect x="${(p[0] - 5).toFixed(1)}" y="${(p[1] - 5).toFixed(1)}" width="10" height="10" fill="var(--surface)" stroke="var(--ink)" stroke-width="2"/>`;
      towns.push([p, t]);
    }

    // comunidades
    const zoomed = M.k / M.kDef, rBase = zoomed < 0.6 ? 2.2 : zoomed < 1.5 ? 3.6 : zoomed < 4 ? 5 : 6.5;
    const vis = [];
    for (const l of S.locs) { const p = P(l.lat, l.lon); if (inView(p)) vis.push([l, p]); }
    vis.sort((a, b) => (a[0].pri || 999) - (b[0].pri || 999));
    for (let i = vis.length - 1; i >= 0; i--) {
      const [l, p] = vis[i];
      if (l === S.alamo) continue;
      const r = l.pri && l.pri <= 40 ? rBase + 1.5 : rBase;
      s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${r}" fill="${LV[commLevel(l)].c}" stroke="var(--ink)" stroke-width="${r > 4 ? 1.6 : 1}"/>`;
    }
    const pa = P(S.alamo.lat, S.alamo.lon), ca = LV[commLevel(S.alamo)].c;
    if (inView(pa, 40)) {
      if (G >= 2) s += `<circle class="pulse" cx="${pa[0].toFixed(1)}" cy="${pa[1].toFixed(1)}" r="14" fill="none" stroke="${ca}" stroke-width="5"/>`;
      s += `<circle cx="${pa[0].toFixed(1)}" cy="${pa[1].toFixed(1)}" r="12" fill="${ca}" stroke="var(--ink)" stroke-width="3"/>`;
    }
    if (S.sel) {
      const p = P(S.sel.lat, S.sel.lon);
      if (inView(p, 40)) s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${rBase + 9}" fill="none" stroke="var(--ink)" stroke-width="3.5"/><circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${rBase + 12}" fill="none" stroke="var(--surface)" stroke-width="2"/>`;
    }

    // orden de etiquetas: seleccionada, Álamo, pueblos, comunidades por población
    if (S.sel) { const p = P(S.sel.lat, S.sel.lon); if (inView(p, 0)) tryLabel(p[0], p[1], S.sel.n, 18, 700, 'var(--ink)', rBase + 12); }
    if (inView(pa, 0) && S.sel !== S.alamo) tryLabel(pa[0], pa[1], 'ÁLAMO', 22, 700, 'var(--ink)', 13);
    for (const [p, t] of towns) tryLabel(p[0], p[1], t, 14, 700, 'var(--muted)', 6);
    const maxLabels = zoomed < 0.6 ? 0 : zoomed < 1.5 ? 40 : 999;
    let n = 0;
    for (const [l, p] of vis) {
      if (l === S.alamo || l === S.sel) continue;
      if (!l.pri && zoomed < 2.5) continue;
      if (n >= maxLabels) break;
      if (tryLabel(p[0], p[1], sinParentesis(l.n), zoomed >= 3 ? 14 : 13, l.pri && l.pri <= 15 ? 700 : 400, 'var(--ink)', rBase + 1.5)) n++;
    }
    s += labels.join('');
    // escala en km
    const km10 = 10 / KM * M.k * COSL, km = km10 > 160 ? 5 : km10 < 40 ? 20 : 10, px = km / KM * M.k * COSL;
    s += `<g transform="translate(12 ${H - 16})"><rect x="-6" y="-24" width="${(px + 20).toFixed(0)}" height="34" rx="6" fill="var(--surface)" opacity=".85"/><path d="M0 0h${px.toFixed(1)}M0 -5v10M${px.toFixed(1)} -5v10" stroke="var(--ink)" stroke-width="2.5"/><text x="${(px / 2).toFixed(1)}" y="-9" font-size="12" text-anchor="middle" fill="var(--ink)">${km} km</text></g>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = fixVars(s);
  }

  // gestos: arrastrar, pellizcar, rueda y tocar un punto
  const ptrs = new Map();
  let moved = false, pinch = null, startPt = null;
  const pos = e => { const r = svg.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, pos(e));
    if (ptrs.size === 1) { moved = false; startPt = pos(e); }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = {d: Math.hypot(a[0] - b[0], a[1] - b[1])}; moved = true; }
  });
  svg.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId), cur = pos(e);
    ptrs.set(e.pointerId, cur);
    if (ptrs.size === 1) {
      if (Math.hypot(cur[0] - startPt[0], cur[1] - startPt[1]) > 6) moved = true;
      if (!moved) return;
      M.lon -= (cur[0] - prev[0]) / (M.k * COSL);
      M.lat += (cur[1] - prev[1]) / M.k;
      clamp(); dibujar();
    } else if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d > 0) { zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch.d); pinch.d = d; }
    }
  });
  function endPtr(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0 && !moved && e.type === 'pointerup' && S.geo) {
      const [x, y] = pos(e);
      let best = null, bd = 24;
      for (const l of S.locs) { const p = P(l.lat, l.lon), d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = l; } }
      if (best) selectLoc(best, false);
    }
  }
  svg.addEventListener('pointerup', endPtr);
  svg.addEventListener('pointercancel', endPtr);
  svg.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = pos(e); zoomAt(x, y, Math.exp(-e.deltaY * 0.0018)); }, {passive: false});
  $('zin').onclick = () => zoomAt(M.W / 2, M.H / 2, 1.6);
  $('zout').onclick = () => zoomAt(M.W / 2, M.H / 2, 1 / 1.6);
  $('zreset').onclick = () => { Object.assign(M, INICIO); M.k = M.kDef; clamp(); dibujar(); };
  new ResizeObserver(() => {
    const k0 = M.kDef;
    medir();
    if (k0 && M.k) M.k *= M.kDef / k0; else M.k = M.kDef;
    clamp(); dibujar();
  }).observe(box);

  function centrar(l) { M.lon = l.lon; M.lat = l.lat; M.k = Math.max(M.k, M.kDef * 3.2); clamp(); }
  return {dibujar, centrar};
})();

/* Mapa con calles (OpenStreetMap + Leaflet), solo con datos reales y si la persona lo pide */
function initOSM() {
  const btn = $('osmbtn'), box = $('osmmap');
  let osm = null;
  btn.onclick = () => {
    if (!box.hidden) { box.hidden = true; btn.textContent = 'Ver mapa con calles'; return; }
    box.hidden = false;
    btn.textContent = 'Volver al mapa sencillo';
    const color = c => getComputedStyle(root).getPropertyValue(c.slice(4, -1)).trim();
    const go = () => {
      if (osm) { osm.invalidateSize(); return; }
      const L = window.L;
      osm = L.map(box).setView([20.99, -97.70], 11);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(osm);
      for (const l of S.locs) {
        L.circleMarker([l.lat, l.lon], {radius: l === S.alamo ? 9 : 5, color: '#222', weight: 1, fillOpacity: .9, fillColor: color(LV[commLevel(l)].c)})
          .bindPopup(`<b>${esc(l.n)}</b><br>${kmTxt(l.d)} del río · ${l.alt} m`).on('click', () => selectLoc(l, false)).addTo(osm);
      }
    };
    if (window.L) return go();
    const css = el('link', {rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'});
    const sc = el('script', {src: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'});
    sc.onload = go;
    sc.onerror = () => { box.hidden = true; btn.textContent = 'Ver mapa con calles'; };
    document.head.append(css, sc);
  };
}

/* ---------- Escuchar ---------- */
function initEscuchar() {
  if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return;
  const btn = $('listen'), lbl = $('listenlbl'), ss = speechSynthesis;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    if (ss.speaking) { ss.cancel(); lbl.textContent = 'Escuchar'; return; }
    const D = S.data;
    if (!D) return;
    const n = D.riesgo.nivel, A = respuesta(n);
    let t = S.atrasado ? `Atención: esta información es de ${ago(D.actualizado)}. Consulte la radio y a Protección Civil. ` : '';
    t += `¿Se va a inundar Álamo? ${A.a}. ${A.sub}. ${D.riesgo.resumen}`;
    if (S.sel) t += ` Su comunidad, ${S.sel.n}: ${etiqueta(commLevel(S.sel))}.`;
    t += ` Qué hacer hoy: ${todoDe(n).map(x => x[1]).join(' ')}`;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'es-MX';
    u.rate = 0.9;
    const voces = ss.getVoices();
    const v = voces.find(v => v.lang === 'es-MX' || v.lang === 'es_MX') || voces.find(v => v.lang && v.lang.startsWith('es'));
    if (v) u.voice = v;
    u.onend = u.onerror = () => { lbl.textContent = 'Escuchar'; };
    lbl.textContent = 'Detener';
    try { ss.speak(u); } catch (e) { lbl.textContent = 'Escuchar'; }
  });
}

/* ---------- Tamaño de letra ---------- */
function initLetra() {
  const SIZES = [17, 19, 22, 25];
  let i = SIZES.indexOf(+store.get('letra'));
  if (i < 0) i = 1;
  const apply = () => {
    root.style.setProperty('--fs', SIZES[i] + 'px');
    $('font-down').disabled = i === 0;
    $('font-up').disabled = i === SIZES.length - 1;
    store.set('letra', SIZES[i]);
  };
  $('font-up').onclick = () => { i = Math.min(SIZES.length - 1, i + 1); apply(); };
  $('font-down').onclick = () => { i = Math.max(0, i - 1); apply(); };
  apply();
}

/* ---------- Datos de ejemplo (modo demostración) ---------- */
function ejemplo(sc) {
  const now = new Date(), day = 864e5, iso = d => new Date(now.getTime() + d * day).toISOString().slice(0, 10);
  const P = {
    normal: {prob: 9, lvl: 0, base: 70, peak: 95, rain: [2, 0, 4, 11, 6, 1, 0], up: [3, 1, 6, 14, 9, 2, 1], pr: [20, 10, 30, 45, 35, 15, 10],
      msg: 'El río está normal. No se espera lluvia fuerte esta semana.',
      alerts: [{src: 'Servicio Meteorológico Nacional', t: 'No hay huracanes ni tormentas cerca de Veracruz.', lv: 0, h: 2}]},
    vigilancia: {prob: 46, lvl: 1, base: 240, peak: 780, rain: [12, 30, 40, 18, 6, 2, 0], up: [20, 45, 60, 25, 8, 3, 1], pr: [70, 90, 95, 75, 40, 20, 10],
      msg: 'El río va a subir, pero se espera que siga dentro de su cauce. Va a llover fuerte en la sierra, de donde baja el agua. Hay avisos de las autoridades; léalos más abajo. Esté pendiente.',
      alerts: [{src: 'Servicio Meteorológico Nacional', t: 'Frente frío: lluvias muy fuertes en el norte de Veracruz y la sierra de Puebla.', lv: 1, h: 3}, {src: 'Protección Civil Veracruz', t: 'Vigilan los ríos Pantepec, Vinazco y Tuxpan.', lv: 1, h: 5}]},
    alerta: {prob: 84, lvl: 3, base: 600, peak: 2350, rain: [95, 180, 140, 60, 20, 5, 2], up: [140, 260, 210, 90, 30, 8, 3], pr: [100, 100, 100, 90, 60, 30, 20],
      msg: 'El río puede salirse de su cauce y meterse a las calles. Va a llover muchísimo en la sierra, de donde baja el agua. Hay avisos de las autoridades; léalos más abajo. Si vive cerca del río, salga a un lugar alto.',
      alerts: [{src: 'Protección Civil Veracruz', t: 'Alerta roja en Álamo Temapache, Tuxpan y Poza Rica. Refugios temporales abiertos.', lv: 3, h: 1}, {src: 'Servicio Meteorológico Nacional', t: 'Huracán frente a la costa de Veracruz: lluvias extraordinarias en el norte del estado.', lv: 3, h: 1}, {src: 'Centro Nacional de Huracanes', t: 'Aviso de tormenta tropical de Tuxpan a Cabo Rojo.', lv: 2, h: 2}]},
  }[sc];
  const umbrales = {rp2: 900, rp5: 1500, rp20: 2600}, serie = [];
  for (let i = -14; i <= 9; i++) {
    let q = i <= 0 ? P.base * (0.75 + 0.25 * Math.sin((i + 14) / 3)) + (i > -3 ? P.base * 0.15 * (i + 3) : 0)
      : P.base + (P.peak - P.base) * Math.exp(-Math.pow((i - 2.5) / 1.6, 2));
    q = Math.max(15, Math.round(q));
    const sp = i > 0 ? Math.round(q * (0.12 + 0.05 * i)) : 0;
    serie.push({fecha: iso(i), caudal: q, min: i > 0 ? Math.max(5, q - sp) : null, max: i > 0 ? q + sp * 1.6 : null, pron: i > 0});
  }
  const sum3 = a => a.slice(0, 3).reduce((x, y) => x + y, 0), peakQ = Math.max(...serie.filter(s => s.pron).map(s => s.caudal));
  const t = m => new Date(now.getTime() - m * 60e3).toISOString();
  return {
    ejemplo: true, actualizado: t(38),
    riesgo: {nivel: P.lvl, probabilidad: P.prob, resumen: P.msg, factores: [
      {nombre: 'Caudal pronosticado', detalle: `Pico de ${fmt(peakQ)} m³/s; crecida de 2 años: ${fmt(umbrales.rp2)} m³/s`, valor: Math.min(1, peakQ / umbrales.rp20)},
      {nombre: 'Lluvia en la sierra (72 h)', detalle: `${fmt(sum3(P.up))} mm`, valor: Math.min(1, sum3(P.up) / 250)},
      {nombre: 'Lluvia en Álamo (72 h)', detalle: `${fmt(sum3(P.rain))} mm`, valor: Math.min(1, sum3(P.rain) / 300)},
      {nombre: 'Avisos oficiales', detalle: `${P.alerts.length} aviso(s) vigente(s)`, valor: Math.max(...P.alerts.map(a => a.lv)) / 3}]},
    rio: {umbrales, serie},
    lluvia: P.rain.map((mm, i) => ({fecha: iso(i), mm, cuenca_mm: P.up[i], prob: P.pr[i]})),
    avisos: P.alerts.map(a => ({fuente: a.src, titulo: a.t, nivel: a.lv, fecha: t(a.h * 60), url: ''})),
    fuentes: [
      {nombre: 'GloFAS v4 (Copernicus) vía Open-Meteo', aporta: 'Caudal simulado y pronóstico', ok: true, fecha: t(40)},
      {nombre: 'Open-Meteo', aporta: 'Lluvia en Álamo y en la sierra', ok: true, fecha: t(40)},
      {nombre: 'SMN · Conagua', aporta: 'Pronóstico oficial para Temapache', ok: true, fecha: t(41)},
      {nombre: 'NHC · NOAA', aporta: 'Huracanes y tormentas cercanos', ok: true, fecha: t(41)},
      {nombre: 'Protección Civil Veracruz', aporta: 'Alertas y refugios (captura manual)', ok: sc !== 'normal', fecha: sc !== 'normal' ? t(300) : null}],
  };
}

function modoDemo(sc) {
  S.demo = ESCENARIOS.includes(sc) ? sc : 'normal';
  S.sinRed = false;
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sc === S.demo)));
  try { speechSynthesis.cancel(); } catch (e) { /* sin voz */ }
  S.data = ejemplo(S.demo);
  render();
}

/* ---------- Carga de datos ---------- */
const valido = d => d && d.riesgo && Number.isInteger(d.riesgo.nivel) && d.riesgo.nivel >= 0 && d.riesgo.nivel <= 3
  && typeof d.actualizado === 'string' && !isNaN(new Date(d.actualizado)) && Array.isArray(d.riesgo.factores);

function guardado() {
  try { const d = JSON.parse(store.get('ultimo_data') || 'null'); return valido(d) ? d : null; } catch (e) { return null; }
}

async function cargar() {
  const pedido = new URLSearchParams(location.search).get('demo');
  if (pedido) return modoDemo(pedido);
  S.cargadoEn = Date.now();
  try {
    const r = await fetch('data.json', {cache: 'no-store'});
    if (r.status === 404) throw Object.assign(new Error('sin data.json'), {noHay: true});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (!valido(d)) throw new Error('data.json con formato inválido');
    store.set('ultimo_data', JSON.stringify(d));
    S.sinRed = false;
    S.demo = null;
    S.data = d;
    render();
  } catch (e) {
    if (S.data && !S.demo) { S.sinRed = true; render(); return; }  // se queda lo que ya se ve
    const g = guardado();
    if (g) { S.sinRed = true; S.data = g; render(); return; }
    if (e.noHay || location.protocol === 'file:') return modoDemo(S.demo || 'normal');
    sinDatos();
  }
}

async function cargarGeo() {
  try {
    const r = await fetch('geo.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    prepararGeo(await r.json());
    renderComunidad();
    renderMine();
    mapa.dibujar();
    if (S.data) $('osmbtn').hidden = !!S.data.ejemplo;
  } catch (e) {
    $('mapbox').replaceChildren(el('p', {class: 'maperr'}, 'No se pudo cargar el mapa. Vuelva a abrir la página más tarde.'));
    $('chips').replaceChildren();
  }
}

/* ---------- Arranque ---------- */
function tick() {
  const s = new Date().toLocaleDateString('es-MX', {weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ});
  setText('date', s[0].toUpperCase() + s.slice(1));
  if (!S.data) return;
  const atrasado = !S.data.ejemplo && horasDesde(S.data.actualizado) > HORAS_ATRASO;
  if (atrasado !== S.atrasado) render();
  else { setText('when', `Revisado ${ago(S.data.actualizado)} · cada 3 horas`); renderEstado(S.data); }
}

document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
  const u = new URL(location.href);
  if (u.searchParams.has('demo')) { u.searchParams.set('demo', b.dataset.sc); history.replaceState(null, '', u); }
  modoDemo(b.dataset.sc);
}));
$('retry').onclick = () => cargar();
$('tech').addEventListener('toggle', () => {
  if (!$('tech').open) return;
  if (!document.querySelector('link[data-mono]')) {
    document.head.append(el('link', {rel: 'stylesheet', 'data-mono': '', href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap'}));
  }
  if (S.data) renderChart(S.data);
});
window.addEventListener('resize', () => { if (S.data && $('tech').open) renderChart(S.data); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.data) renderScene(S.data); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !S.demo && Date.now() - S.cargadoEn > RECARGA_MS) cargar();
});
setInterval(() => { if (document.visibilityState === 'visible' && !S.demo) cargar(); }, RECARGA_MS);
setInterval(tick, 60e3);

initLetra();
initEscuchar();
initBusqueda();
initUbicacion();
initOSM();
tick();
cargar();
cargarGeo();
})();
