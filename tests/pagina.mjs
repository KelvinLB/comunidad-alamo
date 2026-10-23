// Prueba de la página en un navegador (se corre en CI): node tests/pagina.mjs http://localhost:8000/
// Abre ?demo=alerta a 390 y 360 px y revisa, sin errores en consola ni scroll horizontal:
// 1. la portada pide elegir comunidad y la franja muestra el aviso del municipio;
// 2. el aviso de todo el municipio dice "SÍ · Peligro muy alto" y el mapa tiene las 460 comunidades;
// 3. al buscar y elegir una comunidad lejos del río se despliega su edición;
// 4. al volver a abrir la página, abre directo en esa comunidad;
// 5. el botón de WhatsApp arma el mensaje y su liga abre esa comunidad sin guardarla. Guarda capturas.
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
  const falla = t => fallas.push(`${ancho}px: ${t}`);
  const scroll = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const texto = id => page.evaluate(i => document.getElementById(i).textContent.trim(), id);
  const vista = () => page.evaluate(() => ({ elegir: !document.getElementById('elegir').hidden, edicion: !document.getElementById('edic').hidden }));

  await page.goto(base + '?demo=alerta', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  // 1. Portada
  let v = await vista();
  if (!v.elegir || v.edicion) falla('la portada no pide elegir comunidad');
  if (!/alerta/i.test(await texto('edicion'))) falla(`la franja del municipio dice "${await texto('edicion')}"`);
  if (await page.locator('#top8 button').count() !== 8) falla('no aparecen las 8 comunidades más pobladas');
  if (await page.isHidden('#demo')) falla('no aparece la franja de datos de ejemplo');
  if (await scroll() > 0) falla(`portada con scroll horizontal de ${await scroll()}px`);
  await page.screenshot({ path: `capturas/portada-${ancho}.png`, fullPage: true });

  // 2. Aviso de todo el municipio
  await page.click('#general');
  await page.waitForTimeout(1200);
  const ans = (await texto('ans')).toUpperCase(), sub = await texto('sub');
  if (ans !== 'SÍ' || sub !== 'Peligro muy alto') falla(`el municipio dice "${ans} · ${sub}"`);
  const puntos = await page.evaluate(() => [...document.querySelectorAll('#msvg circle')].filter(c => !c.classList.contains('pulse')).length);
  if (puntos < 460) falla(`el mapa tiene ${puntos} puntos`);
  if (await scroll() > 0) falla(`municipio con scroll horizontal de ${await scroll()}px`);
  await page.screenshot({ path: `capturas/alerta-${ancho}.png`, fullPage: true });

  // 3. Buscar y elegir una comunidad lejos del río
  await page.click('#cambiar');
  await page.fill('#q', 'canas');
  await page.locator('#results button').first().click();
  await page.waitForTimeout(800);
  const ante = await texto('ante'), ans2 = await texto('ans');
  if (!/Cañas/.test(ante) || ans2 !== 'Puede ser') falla(`la comunidad dice "${ante} ${ans2}"`);
  if (await page.isHidden('#municipio')) falla('no aparece el recuadro del resto del municipio');
  // botón de WhatsApp: mensaje con la comunidad, la respuesta y la liga que la abre
  const wa = await page.getAttribute('#compartir', 'href');
  const msj = wa && wa.startsWith('https://wa.me/?text=') ? decodeURIComponent(wa.slice(20)) : '';
  const ligaWa = (msj.match(/https?:\/\/\S+\?c=[-\d.,]+/) || [''])[0];
  if (!/Cañas de Abajo/.test(msj) || !/Puede ser/.test(msj) || !/no oficial/.test(msj) || !ligaWa) falla(`el mensaje de WhatsApp no está completo: ${msj.slice(0, 120)}`);
  if (await scroll() > 0) falla(`comunidad con scroll horizontal de ${await scroll()}px`);
  await page.screenshot({ path: `capturas/comunidad-${ancho}.png`, fullPage: true });

  // 4. Al volver, abre directo en su comunidad
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  v = await vista();
  if (v.elegir || !v.edicion || !/Cañas/.test(await texto('ante'))) falla('al volver a abrir no recuerda la comunidad');

  // 5. Quien recibe la liga ve esa comunidad, pero no se le guarda como suya
  const otra = await browser.newPage({ viewport: { width: ancho, height: 844 }, locale: 'es-MX' });
  otra.on('pageerror', e => errores.push(String(e)));
  await otra.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await otra.goto(ligaWa.replace(/^https?:\/\/[^/]+\//, base) + '&demo=alerta', { waitUntil: 'networkidle' });
  await otra.waitForTimeout(800);
  const recibida = await otra.evaluate(() => ({ ante: document.getElementById('ante').textContent, guardada: localStorage.getItem('mi_comunidad') }));
  if (!/Cañas de Abajo/.test(recibida.ante) || recibida.guardada) falla(`la liga compartida abre "${recibida.ante}" (guardada: ${recibida.guardada})`);
  await otra.close();

  const propios = errores.filter(e => !/fonts\.g|ERR_FAILED/.test(e));
  if (propios.length) falla(`errores en consola: ${propios.join(' | ')}`);
  console.log(`${ancho}px`, JSON.stringify({ ans, sub, puntos, ante, ans2 }));
  await page.close();
}

await browser.close();
if (fallas.length) { console.error('FALLAS:\n' + fallas.join('\n')); process.exit(1); }
console.log('La página pasó la prueba.');
