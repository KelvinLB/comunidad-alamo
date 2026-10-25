// Prueba de la página en un navegador (se corre en CI): node tests/pagina.mjs http://localhost:8000/
// Abre ?demo=alerta a 390 y 360 px y revisa, sin errores en consola ni scroll horizontal:
// 1. la portada pide elegir comunidad y la franja muestra el aviso del municipio;
// 2. el aviso de todo el municipio dice "SÍ · Peligro muy alto" y el mapa tiene las 460 comunidades;
// 3. al buscar y elegir una comunidad lejos del río se despliega su edición;
// 4. al volver a abrir la página, abre directo en esa comunidad;
// 5. el botón de WhatsApp arma el mensaje y su liga abre esa comunidad sin guardarla; la de la familia sí la guarda;
//    "Qué hacer hoy" solo sale con alerta; con peligro sale el aviso a pantalla completa; la hoja trae QR;
// 6. se puede poner en el teléfono (PWA) y abre sin señal con el aviso "Sin conexión";
// 7. el botón "Instalar en mi teléfono" siempre se ve y su guía cambia en iPhone, Android y dentro de Facebook;
// 8. el parte de 7 días trae la fecha y la temperatura de cada día, cada día se abre al tocarlo y,
//    con datos de ayer, ayer no sale como "Hoy";
// 9. la temperatura de ahora sale en grande, animada, y cambia sola al pasar la hora;
//    con "reducir movimiento" no se mueve. Guarda capturas.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const base = process.argv[2] || 'http://localhost:8000/';
mkdirSync('capturas', { recursive: true });
// CHANNEL=chrome usa el Chrome instalado en lugar del Chromium de Playwright
const browser = await chromium.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {});
const fallas = [];
// "25 de octubre" de hoy (o de otro día) en Álamo
const TZ = 'America/Mexico_City', DIA = 864e5;
const fechaMx = (t = Date.now()) => new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: TZ });
const isoMx = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });

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
  // 1. Con peligro muy alto, primero sale el aviso a pantalla completa
  if (await page.isHidden('#peligro') || !/Peligro muy alto/.test(await texto('pel-t'))) falla('no sale el aviso de peligro a pantalla completa');
  await page.screenshot({ path: `capturas/peligro-${ancho}.png` });
  await page.click('#pel-ok');
  if (await page.isVisible('#peligro')) falla('el aviso de peligro no se cierra');
  // Portada
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
  // el parte de 7 días: "Hoy" con la fecha de hoy, y cada día con su fecha
  const dias = await page.evaluate(() => [...document.querySelectorAll('#parte .pd-fila .d')].map(td => td.innerText.replace(/\s+/g, ' ').trim()));
  if (dias.length !== 7 || dias[0] !== `Hoy ${fechaMx()}` || !dias[1].startsWith('Mañana ') || !dias.every(d => / \d{1,2} de [a-z]+$/.test(d))) falla(`el parte de 7 días no trae las fechas: ${dias.join(' | ')}`);
  // cada día se abre al tocarlo: "Hoy" empieza abierto; al tocar el miércoles se abre ese y se cierra hoy
  const abiertos = () => page.evaluate(() => [...document.querySelectorAll('#parte .pd-fila')].map(b => b.getAttribute('aria-expanded') === 'true' && !document.getElementById(b.getAttribute('aria-controls')).hidden));
  if ((await abiertos()).join() !== 'true,false,false,false,false,false,false') falla(`al abrir, "Hoy" no está abierto: ${await abiertos()}`);
  await page.locator('#parte .pd-fila').nth(3).click();
  const det = await page.evaluate(() => document.getElementById('pd-3').innerText);
  if ((await abiertos()).join() !== 'false,false,false,true,false,false,false' || !/Probabilidad de que llueva: 90 %/.test(det) || !/Máxima 25°, mínima 22°/.test(det)) falla(`al tocar un día no se abre bien: ${det.slice(0, 160)}`);
  if (await scroll() > 0) falla(`parte abierto con scroll horizontal de ${await scroll()}px`);
  await page.locator('#parte .pd-fila').nth(3).screenshot({ path: `capturas/parte-dia-${ancho}.png` });
  await page.locator('#parte .pd-fila').nth(3).click();
  if ((await abiertos()).some(Boolean)) falla('al tocar otra vez el día abierto no se cierra');
  // la temperatura de ahora, en grande, con las próximas horas
  const clima = await page.evaluate(() => document.getElementById('clima').hidden ? '' : document.getElementById('clima').innerText.replace(/\s+/g, ' '));
  if (!/^Ahora en Álamo \d+° Tormenta Máxima 27° Mínima 23° 23° ahora 27°( \d{1,2} [ap]\.m\. \d+°){5} Temperatura estimada/i.test(clima)) falla(`el recuadro del clima dice "${clima}"`);
  // los dibujos del clima se mueven (la tormenta: lluvia y rayo)
  const mueve = await page.evaluate(() => ['.gota', '.rayo'].map(c => getComputedStyle(document.querySelector('#clima ' + c)).animationName));
  if (mueve.includes('none')) falla(`los dibujos del clima no se mueven: ${mueve}`);
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
  if (await page.isHidden('#sec-que')) falla('con "Esté atento" no sale "Qué hacer hoy"');
  // para la familia: la liga ?mi= deja la comunidad guardada
  const fam = decodeURIComponent((await page.getAttribute('#fam-wa', 'href')).slice(20));
  const ligaFam = (fam.match(/https?:\/\/\S+\?mi=[-\d.,]+/) || [''])[0];
  if (!ligaFam || !/Cañas de Abajo/.test(fam)) falla(`el mensaje para la familia no está completo: ${fam.slice(0, 120)}`);
  // hoja para imprimir, con código QR
  await page.evaluate(() => { window.print = () => {}; });
  await page.click('#imprimir');
  await page.waitForFunction(() => document.getElementById('hoja').innerHTML.length > 200, null, { timeout: 15000 }).catch(() => {});
  const hoja = await page.evaluate(() => ({ txt: document.getElementById('hoja').textContent, qr: !!document.querySelector('#hoja .hj-qr svg') }));
  if (!/Cañas de Abajo/.test(hoja.txt) || !/911/.test(hoja.txt)) falla('la hoja para imprimir no tiene la comunidad o el 911');
  if (!hoja.qr) falla('la hoja para imprimir no tiene el código QR');
  // en papel no hay "hoy" ni "mañana": solo el día con su fecha
  const diasHoja = await page.evaluate(() => [...document.querySelectorAll('#hoja tbody td:first-child')].map(td => td.textContent.trim()));
  const tempHoja = await page.evaluate(() => [...document.querySelectorAll('#hoja tbody td:last-child')].map(td => td.textContent.trim()));
  if (!tempHoja.every(t => /^\d+° \/ \d+°$/.test(t))) falla(`la hoja no trae la temperatura: ${tempHoja.join(' | ')}`);
  if (diasHoja.length !== 7 || !diasHoja.every(d => /^[A-ZÁÉ][a-záé]+,? \d{1,2} de [a-z]+$/.test(d))) falla(`la hoja no trae los días con fecha: ${diasHoja.join(' | ')}`);
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: `capturas/hoja-${ancho}.png`, fullPage: true });
  await page.emulateMedia({ media: 'screen' });
  await page.screenshot({ path: `capturas/comunidad-${ancho}.png`, fullPage: true });
  // con "Sin peligro" no sale "Qué hacer hoy", ni en el mensaje de WhatsApp
  await page.click('.seg button[data-sc="normal"]');
  await page.waitForTimeout(400);
  const msjNormal = decodeURIComponent((await page.getAttribute('#compartir', 'href')).slice(20));
  if (await page.isVisible('#sec-que') || /Qué hacer hoy/.test(msjNormal)) falla('con "Sin peligro" sigue saliendo "Qué hacer hoy"');
  await page.click('.seg button[data-sc="alerta"]');
  await page.waitForTimeout(400);
  if (await page.isHidden('#peligro')) falla('al subir a peligro muy alto no vuelve a salir el aviso a pantalla completa');
  await page.click('#pel-ok');

  // 4. Al volver, abre directo en su comunidad
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  v = await vista();
  if (v.elegir || !v.edicion || !/Cañas/.test(await texto('ante'))) falla('al volver a abrir no recuerda la comunidad');
  if (!/Cañas de Abajo: esté atento/.test(await texto('pel-com'))) falla(`el aviso de peligro no menciona su comunidad: "${await texto('pel-com')}"`);

  // 5. Quien recibe la liga ve esa comunidad, pero no se le guarda como suya
  const otra = await browser.newPage({ viewport: { width: ancho, height: 844 }, locale: 'es-MX' });
  otra.on('pageerror', e => errores.push(String(e)));
  await otra.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await otra.goto(ligaWa.replace(/^https?:\/\/[^/]+\//, base) + '&demo=alerta', { waitUntil: 'networkidle' });
  await otra.waitForTimeout(800);
  const recibida = await otra.evaluate(() => ({ ante: document.getElementById('ante').textContent, guardada: localStorage.getItem('mi_comunidad') }));
  if (!/Cañas de Abajo/.test(recibida.ante) || recibida.guardada) falla(`la liga compartida abre "${recibida.ante}" (guardada: ${recibida.guardada})`);
  await otra.close();
  // la liga de la familia sí la deja guardada
  const papas = await browser.newPage({ viewport: { width: ancho, height: 844 }, locale: 'es-MX' });
  papas.on('pageerror', e => errores.push(String(e)));
  await papas.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await papas.goto(ligaFam.replace(/^https?:\/\/[^/]+\//, base) + '&demo=alerta', { waitUntil: 'networkidle' });
  await papas.waitForTimeout(800);
  const dePapas = await papas.evaluate(() => ({ ante: document.getElementById('ante').textContent, guardada: localStorage.getItem('mi_comunidad'), url: location.search }));
  if (!/Cañas de Abajo/.test(dePapas.ante) || !/Cañas de Abajo/.test(dePapas.guardada || '') || /mi=/.test(dePapas.url)) falla(`la liga de la familia no guarda la comunidad: ${JSON.stringify(dePapas)}`);
  await papas.close();

  const propios = errores.filter(e => !/fonts\.g|ERR_FAILED/.test(e));
  if (propios.length) falla(`errores en consola: ${propios.join(' | ')}`);
  console.log(`${ancho}px`, JSON.stringify({ ans, sub, puntos, ante, ans2 }));
  await page.close();
}

// 6. Se puede poner en el teléfono y abre sin señal, con el aviso de "Sin conexión"
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-MX', userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(String(e)));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(base, { waitUntil: 'networkidle' });
  const manifiesto = await page.evaluate(async () => (await (await fetch(document.querySelector('link[rel=manifest]').href)).json()).icons.length);
  if (manifiesto < 3) fallas.push('el manifiesto no tiene los íconos');
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (await page.isHidden('#inst-barra')) fallas.push('no está a la vista el botón "Instalar en mi teléfono"');
  await page.waitForTimeout(800);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const sin = await page.evaluate(() => ({ franja: document.getElementById('edicion').textContent, aviso: document.getElementById('stale').hidden ? '' : document.getElementById('staletxt').textContent }));
  if (!/^⚠ (Sin conexión|Datos atrasados)/.test(sin.aviso) || /Cargando/.test(sin.franja)) fallas.push(`sin señal no abre bien: ${JSON.stringify(sin)}`);
  if (errores.length) fallas.push(`sin señal, errores: ${errores.join(' | ')}`);
  console.log('sin señal', JSON.stringify(sin));
  await page.screenshot({ path: 'capturas/sin-senal.png' });
  await ctx.close();
}

// 7. El botón de instalar está siempre a la vista y la guía cambia según el teléfono
for (const [nom, ua, espera] of [
  ['iphone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', /Instalar en su iPhone[\s\S]*Agregar a inicio/],
  ['iphone-facebook', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]', /Ábrala en Safari[\s\S]*Copiar la dirección/],
  ['android', 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', /Instalar en su teléfono[\s\S]*Instalar aplicación/],
]) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, locale: 'es-MX', userAgent: ua });
  const page = await ctx.newPage();
  // sin la ventana propia del navegador, para probar la guía escrita
  await page.addInitScript(() => addEventListener('beforeinstallprompt', e => e.stopImmediatePropagation(), true));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.goto(base + '?demo=normal', { waitUntil: 'networkidle' });
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  const barra = await page.evaluate(() => { const r = document.getElementById('inst-btn').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0 && r.height > 40; });
  if (!barra) fallas.push(`${nom}: el botón de instalar no se ve al bajar la página`);
  await page.click('#inst-btn');
  const guia = await page.evaluate(() => document.getElementById('inst-modal').hidden ? '' : document.getElementById('inst-modal').innerText);
  if (!espera.test(guia)) fallas.push(`${nom}: la guía de instalar no es la correcta: ${guia.slice(0, 100)}`);
  await page.screenshot({ path: `capturas/instalar-${nom}.png` });
  await page.click('#inst-ok');
  if (await page.isVisible('#inst-modal')) fallas.push(`${nom}: la guía de instalar no se cierra`);
  await ctx.close();
}

// 8. Con datos de ayer, el día de ayer no sale como "Hoy": el parte empieza en la fecha de hoy
{
  const page = await browser.newPage({ viewport: { width: 360, height: 844 }, locale: 'es-MX' });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await page.route(/data\.json/, async r => {
    const d = await (await r.fetch()).json();
    d.ejemplo = false;
    d.actualizado = new Date(Date.now() - 20 * 36e5).toISOString();
    d.lluvia = d.lluvia.slice(0, 7).map((x, i) => ({ ...x, fecha: isoMx(Date.now() + (i - 1) * DIA) }));
    await r.fulfill({ json: d });
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  if (await page.isVisible('#peligro')) await page.click('#pel-ok');
  await page.click('#general');
  await page.waitForTimeout(600);
  const dias = await page.evaluate(() => [...document.querySelectorAll('#parte .pd-fila .d')].map(td => td.innerText.replace(/\s+/g, ' ').trim()));
  if (dias.length !== 6 || dias[0] !== `Hoy ${fechaMx()}` || dias.some(d => d.endsWith(fechaMx(Date.now() - DIA)))) fallas.push(`con datos de ayer, el parte dice: ${dias.join(' | ')}`);
  console.log('datos de ayer', JSON.stringify(dias));
  await page.close();
}

// 9. La temperatura de ahora cambia sola al pasar la hora, sin recargar (y no se inventa si los datos no llegan).
//    Con "reducir movimiento" en el teléfono, nada se mueve y el número sale directo.
{
  const page = await browser.newPage({ viewport: { width: 360, height: 844 }, locale: 'es-MX', reducedMotion: 'reduce' });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const t0 = Math.floor(Date.now() / 36e5) * 36e5 + 10 * 60e3;  // las tantas y 10
  const horaMx = t => `${isoMx(t)}T${new Date(t).toLocaleString('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: TZ })}:00`;
  await page.route(/data\.json/, async r => {
    const d = await (await r.fetch()).json();
    d.ejemplo = false;
    d.actualizado = new Date(t0 - 5 * 60e3).toISOString();
    d.horas = [[0, 27, 0], [1, 23, 3], [2, 21, 61]].map(([o, t, cod]) => ({ hora: horaMx(t0 + o * 36e5), t, cod, dia: true }));
    await r.fulfill({ json: d });
  });
  await page.clock.install({ time: t0 });
  await page.goto(base, { waitUntil: 'networkidle' });
  const grande = () => page.evaluate(() => document.getElementById('clima').hidden ? 'oculto' : document.querySelector('.cl-t b').textContent + ' ' + document.querySelector('.cl-txt b').textContent);
  const antes = await grande();
  const quieto = await page.evaluate(() => [...document.querySelectorAll('#clima svg, #clima svg *, #clima li, #clima i')].every(e => getComputedStyle(e).animationName === 'none'));
  if (!quieto) fallas.push('con "reducir movimiento" el clima se sigue moviendo');
  await page.clock.runFor(60 * 60e3);
  const despues = await grande();
  await page.clock.runFor(3 * 60 * 60e3);
  const sinDato = await grande();
  if (antes !== '27° Despejado' || despues !== '23° Nublado' || sinDato !== 'oculto') fallas.push(`la temperatura de ahora no cambia con la hora: ${antes} → ${despues} → ${sinDato}`);
  console.log('clima', JSON.stringify([antes, despues, sinDato]));
  await page.close();
}

await browser.close();
if (fallas.length) { console.error('FALLAS:\n' + fallas.join('\n')); process.exit(1); }
console.log('La página pasó la prueba.');
