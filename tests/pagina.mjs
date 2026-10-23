// Prueba de la página en un navegador (se corre en CI): node tests/pagina.mjs http://localhost:8000/
// Abre ?demo=alerta a 390 px, revisa que no haya errores en consola ni scroll horizontal,
// que diga "SÍ · Peligro muy alto" y que el mapa tenga las 460 comunidades. Guarda una captura.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const base = process.argv[2] || 'http://localhost:8000/';
mkdirSync('capturas', { recursive: true });
// CHANNEL=chrome usa el Chrome instalado en lugar del Chromium de Playwright
const browser = await chromium.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {});
const fallas = [];

for (const ancho of [390, 360]) {
  const page = await browser.newPage({ viewport: { width: ancho, height: 844 }, locale: 'es-MX' });
  const errores = [];
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('pageerror', e => errores.push(String(e)));
  // Las fuentes de Google no son necesarias para la prueba y pueden fallar sin red
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(base + '?demo=alerta', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ans: document.getElementById('ans').textContent.trim().toUpperCase(),
    sub: document.getElementById('sub').textContent.trim(),
    puntos: [...document.querySelectorAll('#msvg circle')].filter(c => !c.classList.contains('pulse')).length,
    demo: !document.getElementById('demo').hidden,
  }));
  const propios = errores.filter(e => !/fonts\.g|ERR_FAILED/.test(e));
  if (propios.length) fallas.push(`${ancho}px: errores en consola: ${propios.join(' | ')}`);
  if (r.scroll > 0) fallas.push(`${ancho}px: hay scroll horizontal de ${r.scroll}px`);
  if (r.ans !== 'SÍ' || r.sub !== 'Peligro muy alto') fallas.push(`${ancho}px: la respuesta es "${r.ans} · ${r.sub}"`);
  if (r.puntos < 460) fallas.push(`${ancho}px: el mapa tiene ${r.puntos} puntos`);
  if (!r.demo) fallas.push(`${ancho}px: no aparece la franja de datos de ejemplo`);
  await page.screenshot({ path: `capturas/alerta-${ancho}.png`, fullPage: true });
  console.log(`${ancho}px`, JSON.stringify(r));
  await page.close();
}

await browser.close();
if (fallas.length) { console.error('FALLAS:\n' + fallas.join('\n')); process.exit(1); }
console.log('La página pasó la prueba.');
