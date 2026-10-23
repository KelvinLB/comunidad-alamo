// Uso: node scripts/iconos.mjs (necesita Playwright; CHANNEL=chrome usa el Chrome instalado)
// Genera los PNG del ícono: normal (192, 512), "maskable" con margen de seguridad (512) y el de iPhone (180)
import { chromium } from 'playwright';
const dir = new URL('../public/', import.meta.url).pathname;
const regla = `<rect x="27" y="8" width="10" height="48" fill="#F5F7F8"/><rect x="27" y="40" width="10" height="16" fill="#1E7B3E"/><rect x="27" y="30" width="10" height="10" fill="#F5C518"/><rect x="27" y="20" width="10" height="10" fill="#E06A10"/><rect x="27" y="10" width="10" height="10" fill="#C8231F"/>`;
const agua = `<path d="M4 44q7-5 14 0t14 0 14 0 14 0v16H4z" fill="#2F78A8"/>`;
// normal: igual que icono.svg, con esquinas redondas
const normal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0B1F2A"/>${regla}${agua}</svg>`;
// maskable y iPhone: fondo completo (el teléfono recorta la forma) y el dibujo más chico, dentro del círculo seguro
const lleno = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#0B1F2A"/><path d="M0 47q8-5 16 0t16 0 16 0 16 0v17H0z" fill="#2F78A8"/><g transform="translate(32 32) scale(.72) translate(-32 -32)">${regla}</g></svg>`;
const b = await chromium.launch(process.env.CHANNEL ? { channel: process.env.CHANNEL } : {});
for (const [nombre, svg, px, transp] of [['icono-192.png', normal, 192, true], ['icono-512.png', normal, 512, true], ['icono-maskable-512.png', lleno, 512, false], ['apple-touch-icon.png', lleno, 180, false]]) {
  const p = await b.newPage({ viewport: { width: px, height: px } });
  await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`);
  await p.screenshot({ path: dir + nombre, omitBackground: transp });
  await p.close();
}
await b.close();
