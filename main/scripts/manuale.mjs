// Genera il manuale per l'app e per la stampa, da ../docs/manuale/MANUALE.md.
//
// COME RIGENERARE:  cd main && npm run manuale
// Serve Chrome (o Edge) installato sul PC; con un percorso diverso: CHROME_PATH=... npm run manuale
// I file generati in main/public/manuale/ SONO COMMITTATI (la CI non li rigenera):
// rifai il comando e committa ogni volta che cambia MANUALE.md, le immagini o la versione in package.json.
//
// Produce in main/public/manuale/:
//   indice.json                  sezioni {id, titolo, livello} per l'indice della guida nell'app
//   contenuto.html               HTML del manuale (titoli con id, immagini "manuale/img/...")
//   img/                         immagini ridotte a 1100 px di larghezza, PNG a palette
//   Shipping-ERP-Manuale.docx    Word: copertina, sommario, titoli, immagini
//   Shipping-ERP-Manuale.pdf     PDF: copertina, sommario, numeri di pagina
// La riga "Versione X.Y.Z" di MANUALE.md viene riallineata a package.json.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const MAIN = join(QUI, '..');
const MD = join(MAIN, '..', 'docs', 'manuale', 'MANUALE.md');
const IMG_SRC = join(MAIN, '..', 'docs', 'manuale', 'img');
const OUT = join(MAIN, 'public', 'manuale');
const FIRMA = 'Powered by Francesco Foti · ITS Team Innovazione';
const ACCENTO = '#2f6196';

/** "Accesso e primo ingresso" -> "accesso-e-primo-ingresso" */
export function slug(testo) {
  return testo
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const pulisci = (t) => t.replace(/[*_`]/g, '');

/**
 * Assegna un id stabile a ogni titolo (aggiunge `id` al token).
 * h2 "A. Accesso..." -> "accesso..."; h3 ripetuti nei capitoli ("Passaggi") -> "a-passaggi".
 */
export function assegnaId(tokens) {
  const usati = new Set();
  const unico = (base) => {
    let id = base, n = 2;
    while (usati.has(id)) id = `${base}-${n++}`;
    usati.add(id);
    return id;
  };
  let prefisso = '';
  for (const t of tokens) {
    if (t.type !== 'heading') continue;
    const testo = pulisci(t.text);
    if (t.depth === 2) {
      const m = testo.match(/^([A-Z])\.\s+(.*)$/);
      prefisso = m ? m[1].toLowerCase() : slug(testo);
      t.id = unico(slug(m ? m[2] : testo));
    } else if (t.depth === 3) t.id = unico(`${prefisso}-${slug(testo)}`);
    else t.id = unico(slug(testo));
  }
}

/** Dal Markdown alle parti del manuale. */
export function leggiManuale(md, versione) {
  md = md.replace(/^Versione .*$/m, `Versione ${versione}`);
  const titolo = md.match(/^# (.+)$/m)[1];
  const corpo = md
    .replace(/^# .+\n/m, '').replace(/^Versione .*\n/m, '').replace(new RegExp(`^${FIRMA}\\n`, 'm'), '');
  const [prodotto, sotto] = titolo.split(/:\s*/);
  return { md, titolo, prodotto, sottotitolo: sotto.charAt(0).toUpperCase() + sotto.slice(1), corpo };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function ottimizzaImmagini() {
  const sharp = (await import('sharp')).default;
  rmSync(join(OUT, 'img'), { recursive: true, force: true });
  mkdirSync(join(OUT, 'img'), { recursive: true });
  const misure = {};
  for (const f of readdirSync(IMG_SRC).filter((x) => x.endsWith('.png')).sort()) {
    const { data, info } = await sharp(join(IMG_SRC, f))
      .resize({ width: 1100, withoutEnlargement: true })
      .png({ palette: true, quality: 90, effort: 7, compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    writeFileSync(join(OUT, 'img', f), data);
    misure[f] = { w: info.width, h: info.height };
  }
  return misure;
}

/** Renderer comune; `img(file, alt, misura)` decide src e attributi. */
async function creaHtml(corpo, tokens, { img, tabella }) {
  const { Marked } = await import('marked');
  const m = new Marked({ gfm: true });
  m.use({
    renderer: {
      heading({ tokens: inline, id, depth }) {
        return `<h${depth} id="${id}">${this.parser.parseInline(inline)}</h${depth}>\n`;
      },
      image({ href, text }) {
        return img(basename(href), text);
      },
      table(t) {
        const righe = (celle, tag) =>
          `<tr>${celle.map((c) => `<${tag}>${this.parser.parseInline(c.tokens)}</${tag}>`).join('')}</tr>`;
        const html = `<table class="man-tabella"><thead>${righe(t.header, 'th')}</thead><tbody>${t.rows.map((r) => righe(r, 'td')).join('')}</tbody></table>\n`;
        return tabella(html);
      },
    },
  });
  return m.parser(tokens);
}

function trovaChrome() {
  const c = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const trovato = c.find((p) => existsSync(p));
  if (!trovato) throw new Error('Chrome non trovato: imposta CHROME_PATH');
  return trovato;
}

const CSS_PDF = `
@page { size: A4; margin: 20mm 18mm 22mm;
  @bottom-left { content: "Shipping ERP · Manuale d'uso · ${FIRMA}"; font: 8pt 'Segoe UI', Arial, sans-serif; color: #64748b; }
  @bottom-right { content: counter(page); font: 9pt 'Segoe UI', Arial, sans-serif; color: #64748b; } }
@page :first { margin: 0; @bottom-left { content: none; } @bottom-right { content: none; } }
* { box-sizing: border-box; }
body { font: 10.5pt/1.5 'Segoe UI', Calibri, Arial, sans-serif; color: #1e293b; margin: 0; }
.copertina { height: 297mm; padding: 70mm 25mm 25mm; background: #f4f6f8; border-left: 14mm solid ${ACCENTO}; break-after: page; display: flex; flex-direction: column; }
.copertina h1 { font-size: 44pt; margin: 0 0 4mm; color: ${ACCENTO}; line-height: 1.1; }
.copertina .sotto { font-size: 22pt; margin: 0 0 14mm; }
.copertina .versione { font-size: 13pt; margin: 0; }
.copertina .data { font-size: 11pt; color: #566578; margin: 2mm 0 0; }
.copertina .firma { margin-top: auto; font-size: 11pt; color: #566578; }
.sommario { break-after: page; }
.sommario h2 { font-size: 20pt; color: ${ACCENTO}; margin: 0 0 6mm; }
.sommario ul { list-style: none; margin: 0; padding: 0; }
.sommario li { margin: 1.5mm 0; }
.sommario li.l2 { margin-top: 3.5mm; font-weight: 600; }
.sommario li.l3 { margin-left: 8mm; font-size: 9.5pt; }
.sommario a { color: inherit; text-decoration: none; }
h2 { font-size: 20pt; color: ${ACCENTO}; margin: 0 0 5mm; padding-bottom: 2mm; border-bottom: 2px solid ${ACCENTO}; break-before: page; break-after: avoid; }
#a-chi-serve, #come-si-entra { break-before: auto; margin-top: 10mm; }
h3 { font-size: 13pt; margin: 7mm 0 2.5mm; break-after: avoid; }
p { margin: 0 0 3mm; orphans: 3; widows: 3; }
hr { display: none; }
ul, ol { padding-left: 6mm; margin: 0 0 3mm; }
li { margin-bottom: 2mm; }
li:has(img) { break-inside: avoid; }
img { display: block; max-width: 100%; max-height: 135mm; width: auto; height: auto; margin: 3mm 0; border: 1px solid #cbd5e1; border-radius: 3px; break-inside: avoid; }
table { border-collapse: collapse; width: 100%; margin: 0 0 4mm; font-size: 9.5pt; break-inside: avoid; }
th, td { border: 1px solid #cbd5e1; padding: 1.5mm 2.5mm; text-align: left; vertical-align: top; }
th { background: #e8f0f8; }
code { font-family: Consolas, monospace; font-size: 0.9em; background: #f1f5f9; padding: 0 1mm; }
strong { color: #0f172a; }
`;

async function creaPdf(manuale, htmlCorpo, sezioni, dataTesto, versione) {
  const puppeteer = (await import('puppeteer-core')).default;
  const toc = sezioni.filter((s) => s.livello === 2)
    .map((s) => `<li class="l${s.livello}"><a href="#${s.id}">${esc(s.titolo)}</a></li>`)
    .join('');
  const pagina = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(manuale.titolo)}</title><style>${CSS_PDF}</style></head><body>
<section class="copertina"><h1>${esc(manuale.prodotto)}</h1><p class="sotto">${esc(manuale.sottotitolo)}</p>
<p class="versione">Versione ${versione}</p><p class="data">${dataTesto}</p><p class="firma">${FIRMA}</p></section>
<section class="sommario"><h2 style="border:0;break-before:auto">Sommario</h2><ul>${toc}</ul></section>
${htmlCorpo}</body></html>`;
  const tmp = join(tmpdir(), `shipping-manuale-${process.pid}.html`);
  writeFileSync(tmp, pagina);
  const browser = await puppeteer.launch({ executablePath: trovaChrome(), headless: true });
  try {
    const p = await browser.newPage();
    await p.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle0' });
    await p.pdf({ path: join(OUT, 'Shipping-ERP-Manuale.pdf'), preferCSSPageSize: true, printBackground: true, outline: true, tagged: true });
  } finally {
    await browser.close();
    rmSync(tmp, { force: true });
  }
}

async function creaDocx(manuale, tokens, sezioni, dataTesto, versione, misure) {
  const { default: HTMLtoDOCX } = await import('html-to-docx');
  const { default: JSZip } = await import('jszip');
  // In Word i titoli scalano di un livello: capitoli = Titolo 1, paragrafi = Titolo 2.
  const docTokens = tokens.map((t) => (t.type === 'heading' ? { ...t, depth: t.depth - 1 } : t));
  const corpo = await creaHtml(manuale.corpo, docTokens, {
    img: (file, alt) => {
      const { w, h } = misure[file];
      const k = Math.min(1, 600 / w, 460 / h); // 600 px = larghezza utile A4
      const dati = readFileSync(join(OUT, 'img', file)).toString('base64');
      return `<img src="data:image/png;base64,${dati}" alt="${esc(alt)}" width="${Math.round(w * k)}" height="${Math.round(h * k)}">`;
    },
    tabella: (t) => t.replace(/<(th|td)>/g, `<$1 style="border:1px solid #94a3b8;padding:4px">`),
  });
  const azzurro = `color:${ACCENTO}`;
  const html = `<!doctype html><html><body>
<p style="font-size:72pt">&nbsp;</p><p style="font-size:60pt">&nbsp;</p>
<p style="font-size:40pt;${azzurro}"><strong>${esc(manuale.prodotto)}</strong></p>
<p style="font-size:20pt">${esc(manuale.sottotitolo)}</p>
<p style="font-size:12pt">Versione ${versione}</p>
<p style="font-size:11pt;color:#566578">${dataTesto}</p>
<p style="font-size:72pt">&nbsp;</p><p style="font-size:72pt">&nbsp;</p><p style="font-size:11pt;color:#566578">${FIRMA}</p>
<div style="page-break-after:always"></div>
<p style="font-size:20pt;${azzurro}"><strong>Sommario</strong></p>
<p>@@TOC@@</p>
<div style="page-break-after:always"></div>
${corpo.replace(/<h1 id="(?!a-chi-serve|come-si-entra)/g, '<div style="page-break-after:always"></div><h1 id="').replace(/<p>(<img [^>]*>)<\/p>/g, '$1')}
</body></html>`;
  const buf = await HTMLtoDOCX(html, null, {
    title: manuale.titolo, creator: 'Francesco Foti · ITS Team Innovazione', lang: 'it-IT',
    font: 'Calibri', fontSize: 22, pageSize: { width: 11906, height: 16838 }, footer: true, pageNumber: true, skipFirstHeaderFooter: true,
    margins: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
    table: { row: { cantSplit: true } },
  }, FIRMA_HTML);
  // Sommario di Word: campo TOC con le voci gia' scritte (clic destro > Aggiorna campo per i numeri di pagina).
  const zip = await JSZip.loadAsync(buf);
  let xml = await zip.file('word/document.xml').async('string');
  const voci = sezioni.filter((s) => s.livello === 2);
  const par = (testo, ini, fine) =>
    `<w:p><w:pPr><w:spacing w:after="80"/></w:pPr>${ini ?? ''}<w:r><w:t xml:space="preserve">${esc(testo)}</w:t></w:r>${fine ?? ''}</w:p>`;
  const campo = voci.map((v, i) => par(v.titolo,
    i === 0 ? '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>' : '',
    i === voci.length - 1 ? '<w:r><w:fldChar w:fldCharType="end"/></w:r>' : '')).join('');
  const prima = xml.length;
  xml = xml.replace(/<w:p>(?:(?!<\/w:p>).)*@@TOC@@.*?<\/w:p>/s, campo);
  if (xml.length === prima) throw new Error('segnaposto del sommario non trovato nel docx');
  zip.file('word/document.xml', xml);
  writeFileSync(join(OUT, 'Shipping-ERP-Manuale.docx'), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

const FIRMA_HTML = `<p style="text-align:center;font-size:8pt;color:#64748b">Shipping ERP · Manuale d'uso · ${FIRMA}</p>`;

async function main() {
  const { version } = JSON.parse(readFileSync(join(MAIN, 'package.json'), 'utf8'));
  const { Lexer } = await import('marked');
  const sorgente = readFileSync(MD, 'utf8');
  const manuale = leggiManuale(sorgente, version);
  if (manuale.md !== sorgente) writeFileSync(MD, manuale.md);
  mkdirSync(OUT, { recursive: true });

  const tokens = new Lexer({ gfm: true }).lex(manuale.corpo);
  assegnaId(tokens);
  const sezioni = tokens
    .filter((t) => t.type === 'heading' && t.depth <= 3)
    .map((t) => ({ id: t.id, titolo: pulisci(t.text), livello: t.depth }));
  writeFileSync(join(OUT, 'indice.json'), JSON.stringify(sezioni, null, 1) + '\n');

  console.time('immagini');
  const misure = await ottimizzaImmagini();
  console.timeEnd('immagini');
  const verifica = (file) => {
    if (!misure[file]) throw new Error(`immagine mancante: ${file}`);
  };

  // contenuto.html: copertina + corpo, immagini relative alla radice del sito ("manuale/img/...").
  const corpoWeb = await creaHtml(manuale.corpo, tokens, {
    img: (file, alt) => {
      verifica(file);
      return `<img class="man-img" src="manuale/img/${file}" alt="${esc(alt)}" width="${misure[file].w}" height="${misure[file].h}" loading="lazy">`;
    },
    tabella: (t) => `<div class="man-tabella-scorri">${t}</div>`,
  });
  writeFileSync(join(OUT, 'contenuto.html'),
    `<header class="man-copertina"><h1 id="${slug(manuale.prodotto)}-manuale">${esc(manuale.prodotto)}</h1><p class="man-sotto">${esc(manuale.sottotitolo)}</p><p class="man-versione">Versione ${version}</p><p class="man-firma">${FIRMA}</p></header>\n${corpoWeb}`);

  const dataTesto = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
  // PDF: stesse immagini, ma da file locale.
  const corpoPdf = await creaHtml(manuale.corpo, tokens, {
    img: (file, alt) => {
      verifica(file);
      return `<img src="${pathToFileURL(join(OUT, 'img', file)).href}" alt="${esc(alt)}">`;
    },
    tabella: (t) => t,
  });
  console.time('pdf');
  await creaPdf(manuale, corpoPdf, sezioni, dataTesto, version);
  console.timeEnd('pdf');
  await creaDocx(manuale, tokens, sezioni, dataTesto, version, misure);
  console.log(`Manuale ${version} generato in ${OUT}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
