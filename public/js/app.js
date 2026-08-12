const NIVEAUS = ['A2','B1','B2','C1'];
const PAGE_ORDER = ['config','aufgabe','schreiben','korrektur'];
const PAGE_LABELS = { config:'Konfiguration', aufgabe:'Aufgabe', schreiben:'Text', korrektur:'Korrektur' };

const TEXTSORTEN = {
  A2: [
    { key:'email_informell', label:'Informelle E-Mail', kurz:'an Freunde/Familie' }
  ],
  B1: [
    { key:'leserbrief', label:'Leserbrief', kurz:'Reaktion auf Forum-Diskussion (Zeitschrift)',
      forumClosing:'Schreibe einen Leserbrief an die Redaktion der Zeitschrift, in der die Diskussion veröffentlicht wurde.' },
    { key:'beitrag', label:'Beitrag (Schülerzeitung)', kurz:'Forum-Diskussion + Meinung',
      forumClosing:'Schreibe einen Beitrag für die Schülerzeitung deiner Schule.' }
  ],
  B2: [
    { key:'erörterung_grafik', label:'Diskursive Erörterung mit Grafikauswertung', kurz:'DSD II (gleiche Aufgabe wie C1)',
      promptDesc:'eine diskursive Erörterung mit Grafikauswertung im echten DSD-II-Format: ein kurzer Sachtext (150-200 Wörter, mit Quellenangabe, im "quelltext"-Feld) zu einem gesellschaftlichen Thema PLUS eine Beschreibung einer fiktiven Statistik/Grafik in Worten (konkrete Zahlen/Prozentwerte), ebenfalls im "quelltext"-Feld nach dem Sachtext angehängt. Im "aufgabe"-Feld: Aufforderung, den Text zusammenzufassen, die Grafik auszuwerten und eine ausführliche Erörterung mit eigener Meinung zu schreiben. Bearbeitungszeit nennen, keine Wortzahl-Vorgabe.' }
  ],
  C1: [
    { key:'erörterung_grafik', label:'Diskursive Erörterung mit Grafikauswertung', kurz:'DSD II (gleiche Aufgabe wie B2)',
      promptDesc:'eine diskursive Erörterung mit Grafikauswertung im echten DSD-II-Format: ein kurzer Sachtext (150-200 Wörter, mit Quellenangabe, im "quelltext"-Feld) zu einem gesellschaftlichen Thema PLUS eine Beschreibung einer fiktiven Statistik/Grafik in Worten (konkrete Zahlen/Prozentwerte), ebenfalls im "quelltext"-Feld nach dem Sachtext angehängt. Im "aufgabe"-Feld: Aufforderung, den Text zusammenzufassen, die Grafik auszuwerten und eine ausführliche Erörterung mit eigener Meinung zu schreiben. Bearbeitungszeit nennen, keine Wortzahl-Vorgabe.' }
  ]
};

const NIVEAU_GROUP = { A2:'DSD-I', B1:'DSD-I', B2:'DSD-II', C1:'DSD-II' };

const state = { page:'config', maxPage:0, niveau:'B1', tipoKey:TEXTSORTEN['B1'][0].key, schwierigkeit:4, aufgabaObj:null, bank:[] };
const $ = id => document.getElementById(id);
function currentMeta(){ return TEXTSORTEN[state.niveau].find(t => t.key === state.tipoKey); }

/* ---------- Supabase ---------- */
const SUPABASE_URL = window.SCHREIBTRAINER_CONFIG?.SUPABASE_URL || "";
const SUPABASE_KEY = window.SCHREIBTRAINER_CONFIG?.SUPABASE_ANON_KEY || "";

function assertSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Supabase não está configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no Vercel."
    );
  }
}


/* ---------- Supabase Auth ---------- */
let _supabase = null;
let _session = null;

async function initAuth(){
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  _supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data } = await _supabase.auth.getSession();
  _session = data.session;
  if (!_session) {
    location.href = 'login.html';
    return false;
  }
  // Atualiza sessão se expirar
  _supabase.auth.onAuthStateChange((_event, session) => { _session = session; });
  // Mostra email no header
  const userEl = document.getElementById('userEmail');
  if (userEl) userEl.textContent = _session.user.email;
  return true;
}

async function signOut(){
  await _supabase.auth.signOut();
  location.href = 'login.html';
}

function getAuthHeader(){
  return _session?.access_token
    ? { 'Authorization': 'Bearer ' + _session.access_token }
    : { 'Authorization': 'Bearer ' + SUPABASE_KEY };
}

function sbFetch(path, options = {}) {
  const headers = Object.assign({
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json'
  }, getAuthHeader(), options.headers || {});
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, Object.assign({}, options, { headers }));
}
function rowToBankItem(r) {
  return { id: r.id, niveau: r.niveau, textsorte: r.textsorte, filename: r.filename, text: r.texto, addedAt: r.created_at };
}
async function loadBank(){
  try {
    const res = await sbFetch('modellsaetze?select=*&order=created_at.desc');
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('unexpected response');
    state.bank = data.map(rowToBankItem);
  } catch(e) {
    console.error('Supabase-Fehler beim Laden des Banco:', e);
    state.bank = [];
  }
}

/* Extrahiert die Modellsatz-Nummer aus dem filename, z.B. "DSD I Modellsatz 7 – Musik" -> 7 */
function extrairNumeroModellsatz(filename){
  const m = /Modellsatz\s*(\d+)/i.exec(filename || '');
  return m ? parseInt(m[1], 10) : null;
}

/* Wählt Referenz-Modellsätze passend zum Schwierigkeitsgrad (1-8):
   Der Regler zeigt proportional auf die Nummer des Modellsatzes im Banco —
   z.B. bei 8 vorhandenen B1-Modellsätzen zeigt Schwierigkeit 5 auf Modellsatz 5,
   und die Nachbarn (4 und 6) werden als zusätzliche Referenz mitgenommen. */
function pickReferences(){
  const grupo = NIVEAU_GROUP[state.niveau];
  const exact = state.bank.filter(b => NIVEAU_GROUP[b.niveau] === grupo && b.textsorte === state.tipoKey);
  const pool = exact.length ? exact : state.bank.filter(b => NIVEAU_GROUP[b.niveau] === grupo);
  if (!pool.length) return [];

  const comNumero = pool
    .map(b => ({ item:b, n: extrairNumeroModellsatz(b.filename) }))
    .filter(x => x.n !== null)
    .sort((a,b) => a.n - b.n);

  if (!comNumero.length) {
    const shuffled = [...pool].sort(() => Math.random()-0.5);
    return shuffled.slice(0,2);
  }

  const total = comNumero.length;
  const alvo = Math.max(1, Math.min(total, Math.round((state.schwierigkeit/8) * total)));
  const posicoes = [alvo-1, alvo, alvo+1].filter(n => n >= 1 && n <= total);
  const indices = [...new Set(posicoes)].map(pos => pos - 1);
  return indices.map(i => comNumero[i].item);
}

/* ---------- Gemini API (via Supabase Edge Function gemini-proxy) ---------- */
async function callGemini(userPrompt, maxTokens){
  assertSupabaseConfig();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/gemini-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY
    },
    body: JSON.stringify({ prompt: userPrompt, max_tokens: maxTokens || 1000 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error || data?.details || `HTTP ${response.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  if (data.error) {
    throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  }
  return data.text || "";
}
function extractJson(text){
  const cleaned = text.replace(/```json/g,'').replace(/```/g,'').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  return JSON.parse(cleaned.slice(start,end+1));
}
function escapeHtml(str){ const div = document.createElement('div'); div.textContent = str || ''; return div.innerHTML; }

/* ---------- Router ---------- */
function currentHashPage(){
  const h = location.hash.replace('#/','').split('?')[0];
  return PAGE_ORDER.includes(h) ? h : 'config';
}
function renderStepper(){
  const el = $('stepper');
  if (!el) return;
  el.innerHTML = '';
  PAGE_ORDER.forEach((p,i) => {
    const idx = PAGE_ORDER.indexOf(state.page);
    const dot = document.createElement('div');
    let cls = 'step-dot';
    if (p === state.page) cls += ' active';
    else if (i <= state.maxPage) cls += ' done';
    dot.className = cls;
    dot.innerHTML = `<span class="num">${String(i+1).padStart(2,'0')}</span><span class="lbl">${PAGE_LABELS[p]}</span>`;
    if (i <= state.maxPage && p !== state.page) dot.addEventListener('click', () => { location.hash = '#/' + p; });
    el.appendChild(dot);
  });
}
function goToPage(p){
  location.hash = '#/' + p;
}
function onHashChange(){
  const p = currentHashPage();
  const idx = PAGE_ORDER.indexOf(p);
  // guard: can't jump ahead of what's unlocked (e.g. typing URL directly)
  if (idx > state.maxPage) {
    location.hash = '#/' + PAGE_ORDER[state.maxPage];
    return;
  }
  state.page = p;
  document.querySelectorAll('.page').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('page-' + p);
  if (el) el.classList.add('active');
  renderStepper();
  window.scrollTo({top:0, behavior:'smooth'});
}
window.addEventListener('hashchange', onHashChange);

/* ---------- Page: config ---------- */
function renderNiveauRow(){
  const row = $('niveauRow');
  row.innerHTML = '';
  NIVEAUS.forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'niveau-btn' + (n === state.niveau ? ' active' : '');
    btn.textContent = n;
    btn.addEventListener('click', () => { state.niveau = n; state.tipoKey = TEXTSORTEN[n][0].key; renderNiveauRow(); renderTeileRow(); });
    row.appendChild(btn);
  });
}
function renderTeileRow(){
  const row = $('teileRow');
  row.innerHTML = '';
  TEXTSORTEN[state.niveau].forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'teil-btn' + (t.key === state.tipoKey ? ' active' : '');
    btn.innerHTML = `<span class="n">${state.niveau} · ${t.kurz}</span>${t.label}`;
    btn.addEventListener('click', () => { state.tipoKey = t.key; renderTeileRow(); });
    row.appendChild(btn);
  });
}
if ($('diffSlider')) {
  $('diffSlider').addEventListener('input', (e) => { state.schwierigkeit = parseInt(e.target.value,10); $('diffVal').textContent = state.schwierigkeit; });
}
if ($('btnToAufgabe')) {
  $('btnToAufgabe').addEventListener('click', () => {
    state.aufgabaObj = null;
    $('aufgabeText').textContent = 'Klicke auf „Neues Thema generieren".';
    $('quelltext').style.display = 'none';
    $('baloes').style.display = 'none';
    $('baloes').innerHTML = '';
    $('refNote').textContent = '';
    $('btnToSchreiben').disabled = true;
    state.maxPage = Math.max(state.maxPage, 1);
    goToPage('aufgabe');
    gerarComIA();
  });
}

/* ---------- Page: aufgabe (geração via IA) ---------- */
async function gerarComIA(){
  const meta = currentMeta();
  $('loadingIA').style.display = 'inline';
  $('btnGerarIA').disabled = true;
  $('baloes').style.display = 'none';
  $('baloes').innerHTML = '';
  try {
    if (state.niveau === 'A2' && state.tipoKey === 'email_informell') {
      await gerarA2Email(meta);
    } else if (state.niveau === 'B1' && (state.tipoKey === 'leserbrief' || state.tipoKey === 'beitrag')) {
      await gerarB1Forum(meta);
    } else {
      await gerarGenerico(meta);
    }
    $('btnToSchreiben').disabled = false;
  } catch(e) {
    console.error(e);
    $('aufgabeText').textContent = 'Fehler beim Erstellen der Aufgabe. Bitte nochmal versuchen.';
    $('btnToSchreiben').disabled = true;
  }
  $('loadingIA').style.display = 'none';
  $('btnGerarIA').disabled = false;
}

async function gerarGenerico(meta){
  const refs = pickReferences();
  let refBlock = '';
  if (refs.length) {
    refBlock = '\n\nHier sind echte Beispielaufgaben desselben Niveaus als Stil-Referenz (Format, Ton, Länge, Aufbau nachahmen, aber KEIN Thema wiederholen):\n' +
      refs.map((r,i) => `--- Beispiel ${i+1} (${r.filename}) ---\n${r.text}`).join('\n');
    $('refNote').textContent = 'Orientiert an: ' + refs.map(r=>r.filename).join(', ');
  } else {
    $('refNote').textContent = 'Kein passender Modellsatz im Banco gespeichert — Aufgabe wird nach allgemeinem DSD-Format generiert.';
  }
  const dsdHinweis = (state.niveau === 'B2' || state.niveau === 'C1')
    ? '\n\nWichtig: Bei DSD II ist die Aufgabe für B2 und C1 identisch — nur die erreichte Punktzahl in der Prüfung entscheidet, welches Niveau am Ende verliehen wird. Erstelle also eine reguläre DSD-II-Aufgabe; der Schwierigkeitsgrad-Regler darf das Thema/den Wortschatz trotzdem leicht anspruchsvoller oder zugänglicher gestalten.'
    : '';
  const prompt = `Du bist Experte für die Erstellung von Prüfungsaufgaben des Deutschen Sprachdiploms (DSD). Erstelle ${meta.promptDesc}
Schwierigkeitsgrad: ${state.schwierigkeit}/8 (1 = einfachste Umsetzung innerhalb des Niveaus ${state.niveau}, 8 = anspruchsvollste Umsetzung, nah am nächsthöheren Niveau).${dsdHinweis}${refBlock}
Erfinde ein NEUES, noch nicht verwendetes Thema. Antworte NUR mit einem JSON-Objekt, keine Einleitung, keine Markdown-Backticks. Format:
{"aufgabe": "vollständiger Aufgabentext auf Deutsch inkl. Situation/Kontext, nummerierter/aufgezählter Punkte und Bearbeitungszeit", "quelltext": "Ausgangstext oder Grafikbeschreibung falls zutreffend, sonst leerer String"}`;
  const raw = await callGemini(prompt, 4000);
  const json = extractJson(raw);
  state.aufgabaObj = json;
  $('aufgabeTag').textContent = `${state.niveau} · ${meta.label}`;
  $('aufgabeSchwierigkeit').textContent = `Schwierigkeit ${state.schwierigkeit}/8`;
  $('aufgabeText').textContent = json.aufgabe;
  if (json.quelltext) { $('quelltext').textContent = json.quelltext; $('quelltext').style.display = 'block'; }
  else { $('quelltext').style.display = 'none'; }
}

/* A2: Aussagegerüst fest, nur Einleitung/Aufforderung/4 Punkte kommen von der KI */
async function gerarA2Email(meta){
  const refs = pickReferences();
  let refBlock = '';
  if (refs.length) {
    refBlock = `\n\nStil-Referenz (Ton/Länge/Satzbau nachahmen, KEIN Thema wiederholen):\n${refs.map(r=>r.text).join('\n---\n')}`;
    $('refNote').textContent = 'Orientiert an: ' + refs.map(r=>r.filename).join(', ');
  } else {
    $('refNote').textContent = 'Kein passender Modellsatz im Banco gespeichert — Aufgabe wird nach allgemeinem Muster generiert.';
  }
  const prompt = `Du bist Experte für die Erstellung von DSD-I-Prüfungsaufgaben (Deutsches Sprachdiplom) auf A2-Niveau, Schwierigkeitsgrad ${state.schwierigkeit}/8 (1 = ganz einfaches, konkretes Alltagsthema, 8 = etwas anspruchsvolleres Thema mit mehr Wortschatz, aber immer noch A2-passend).
Wähle ein NEUES, altersgerechtes Alltagsthema für Jugendliche (nicht Ferien, Sport oder Wochenende, das ist schon oft benutzt worden — such etwas anderes, z.B. Schule, Haustiere, Hobbys, Familie, Essen, Freunde, Geburtstag, Handy, o.ä.).${refBlock}
Antworte NUR mit einem JSON-Objekt, keine Einleitung, keine Markdown-Backticks. Format:
{"thema": "ein Wort oder kurzer Begriff, z.B. 'Schule' oder 'Haustiere'", "einleitung": "zwei Sätze im Stil: '[Name] wohnt in Deutschland. Ihr schreibt euch regelmäßig E-Mails. In seiner/ihrer letzten E-Mail hat [Name] erzählt, [was er/sie erzählt hat, passend zum Thema].' (oder alternativ die Brieffreund-Variante wie im Beispiel 'Ferien')", "aufforderung": "ein Satz: 'Schreibe [Name] eine E-Mail zurück.' oder 'Beantworte [Name]s Brief.' (passend zur Einleitung)", "punkte": ["Frage/Aufforderung 1", "Frage/Aufforderung 2", "Frage/Aufforderung 3", "Frage/Aufforderung 4"]}
Die 4 Punkte sollen wie im echten Modellsatz sein: konkrete Fragen zum Thema, die eigene Erfahrung des Schreibers betreffen.`;
  const raw = await callGemini(prompt, 3000);
  const json = extractJson(raw);
  const aufgabe = `${json.thema}\n\n${json.einleitung}\n\n${json.aufforderung}\n\nSchreibe ausführlich zu diesen vier Punkten:\n\n${json.punkte.map(p=>'• '+p).join('\n')}\n\nDu hast insgesamt 45 Minuten Zeit.`;
  state.aufgabaObj = { aufgabe, quelltext:'', thema: json.thema };
  $('aufgabeTag').textContent = `${state.niveau} · ${meta.label}`;
  $('aufgabeSchwierigkeit').textContent = `Schwierigkeit ${state.schwierigkeit}/8`;
  $('aufgabeText').textContent = aufgabe;
  $('quelltext').style.display = 'none';
  $('baloes').style.display = 'none';
}

/* B1: Forumsgerüst fest, nur Thema + 4 Aussagen + 2 Fragen kommen von der KI */
async function gerarB1Forum(meta){
  const refs = pickReferences();
  let refBlock = '';
  if (refs.length) {
    refBlock = `\n\nStil-Referenz aus echten Modellsätzen nahe deinem Schwierigkeitsgrad (Ton/Länge/Satzbau nachahmen, KEIN Thema wiederholen):\n` +
      refs.map((r,i) => `--- ${r.filename} ---\n${r.text}`).join('\n');
    $('refNote').textContent = 'Orientiert an: ' + refs.map(r=>r.filename).join(', ');
  } else {
    $('refNote').textContent = 'Kein passender Modellsatz im Banco gespeichert — Aussagen werden nach allgemeinem Muster generiert.';
  }

  const schwierigkeitsHinweis = state.schwierigkeit <= 2
    ? 'Sehr konkretes, alltagsnahes Thema. Kurze, einfache Hauptsätze. Grundwortschatz.'
    : state.schwierigkeit <= 5
    ? 'Durchschnittliches B1-Thema. Mix aus Haupt- und Nebensätzen (weil, wenn, dass). Normaler B1-Wortschatz.'
    : 'Etwas abstrakteres Thema, mehr Nebensätze und Konnektoren (obwohl, trotzdem, außerdem, allerdings). WICHTIG: trotzdem im B1-Wortschatz bleiben, keine C1-Wörter — nur Satzbau und Themenwahl werden anspruchsvoller, nicht die Wortliste.';

  const prompt = `Du bist Experte für die Erstellung von DSD-I-Prüfungsaufgaben (Deutsches Sprachdiplom), Textsorte "Beitrag für die Schülerzeitung" / "Leserbrief" auf B1-Niveau.

AUFGABE: Erstelle die variablen Teile für eine neue Aufgabe im exakt gleichen Format wie die echten Modellsätze.

SCHWIERIGKEITSGRAD ${state.schwierigkeit}/8: ${schwierigkeitsHinweis}

REGELN (unbedingt einhalten):
1. Antworte NUR mit einem einzigen JSON-Objekt. Kein Text davor oder danach. Keine Markdown-Backticks (\`\`\`).
2. Das JSON muss GENAU diese Struktur haben, keine zusätzlichen oder fehlenden Felder:
   {"thema": string, "personen": [4 Objekte mit "name" und "aussage"], "frage_persoenlich": string, "frage_meinung": string}
3. "thema": ein bis zwei Wörter, groß geschrieben wie ein Titel (z.B. "Handynutzung", "Ferienjobs").
4. "personen": genau 4 Personen, mit unterschiedlichen deutschen Vornamen (Mix aus männlich/weiblich). Jede Aussage: 2-4 Sätze, Ich-Perspektive, wie ein echter Forumspost — konkret, mit eigenem Beispiel oder Grund, nicht generisch.
5. Die 4 Meinungen müssen sich WIRKLICH unterscheiden — mindestens 2 klar gegensätzliche Positionen, nicht 4x die gleiche Meinung mit anderen Worten.
6. "frage_persoenlich": eine Frage nach der eigenen Erfahrung des Schreibers zum Thema, endet mit "Berichte ausführlich." (Beispiele: "Wie sieht es an deiner Schule mit X aus? Berichte ausführlich." / "Hast du X? Berichte ausführlich.")
7. "frage_meinung": eine Bewertungsfrage (oft Ja/Nein), endet mit "Begründe deine Meinung ausführlich." (Beispiele: "Ist X sinnvoll? Begründe deine Meinung ausführlich." / "Sollte man X? Begründe deine Meinung ausführlich.")
8. Escape alle Anführungszeichen innerhalb der Strings korrekt für JSON (\\").
9. NEUES Thema — nicht: Musik, Hausaufgaben, Lesen, Zu-spät-Kommen, Nebenjobs, Haustiere, Gewalt im Fernsehen, Zu Hause mithelfen (schon oft benutzt).

BEISPIEL für die korrekte JSON-Struktur (anderes Thema, nur zur Formatreferenz — nicht kopieren):
{"thema": "Taschengeld", "personen": [{"name": "Finn", "aussage": "Ich bekomme jeden Monat 20 Euro Taschengeld. Das reicht mir eigentlich gut, weil ich nicht so viel kaufe. Nur für neue Fußballschuhe muss ich immer länger sparen."}, {"name": "Mia", "aussage": "Meine Eltern geben mir kein festes Taschengeld. Ich bekomme Geld, wenn ich etwas brauche, zum Beispiel für Kino oder Kleidung. Das finde ich eigentlich besser."}, {"name": "Ben", "aussage": "Ich finde, Taschengeld sollte man sich verdienen. Ich helfe im Garten meiner Oma und bekomme dafür Geld. So lerne ich, dass Geld nicht einfach so kommt."}, {"name": "Lea", "aussage": "Bei uns bekommen alle Geschwister gleich viel Taschengeld, egal wie alt sie sind. Ich finde das unfair, weil meine große Schwester viel mehr Sachen braucht als ich."}], "frage_persoenlich": "Bekommst du Taschengeld oder verdienst du dir dein Geld selbst? Berichte ausführlich.", "frage_meinung": "Sollten Kinder für Hausarbeit Taschengeld bekommen? Begründe deine Meinung ausführlich."}${refBlock}

Erstelle jetzt eine neue Aufgabe nach diesen Regeln.`;

  const raw = await callGemini(prompt, 4000);
  const json = extractJson(raw);
  const quelltext = json.personen.map(p => `${p.name}: ${p.aussage}`).join('\n\n');
  const aufgabe = `${json.thema}\n\nIn einem Internetforum gibt es eine Diskussion zum Thema „${json.thema}".\nDu findest hier dazu folgende Aussagen (siehe Sprechblasen oben).\n\n${meta.forumClosing}\n\nBearbeite in deinem Beitrag die folgenden drei Punkte:\n\n• Gib alle vier Aussagen aus dem Internetforum mit eigenen Worten wieder.\n• ${json.frage_persoenlich}\n• ${json.frage_meinung}\n\nDu hast insgesamt 75 Minuten Zeit.\nDu brauchst die Wörter nicht zu zählen.`;
  state.aufgabaObj = { aufgabe, quelltext, personen: json.personen, thema: json.thema };
  $('aufgabeTag').textContent = `${state.niveau} · ${meta.label}`;
  $('aufgabeSchwierigkeit').textContent = `Schwierigkeit ${state.schwierigkeit}/8`;
  $('aufgabeText').textContent = aufgabe;
  $('quelltext').style.display = 'none';
  const bal = $('baloes');
  bal.innerHTML = json.personen.map(p => `<div class="balloon"><span class="name">${escapeHtml(p.name)}</span>${escapeHtml(p.aussage)}</div>`).join('');
  bal.style.display = 'grid';
}

if ($('btnGerarIA')) $('btnGerarIA').addEventListener('click', gerarComIA);

/* ---------- Modus-Tabs na config ---------- */
let modusAtual = 'neu';
let msSeleccionado = null;

document.querySelectorAll('.modus-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    modusAtual = tab.dataset.modus;
    document.querySelectorAll('.modus-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (modusAtual === 'real') {
      $('blocoNeu').style.display = 'none';
      $('blocoReal').style.display = 'block';
      renderMsPicker();
    } else {
      $('blocoReal').style.display = 'none';
      $('blocoNeu').style.display = 'block';
    }
  });
});

function extrairTema(filename, texto){
  const dash = filename?.match(/–\s*(.+)$/);
  if (dash) return dash[1].trim();
  return texto?.split(/[\.\n]/)[0]?.trim()?.split(' ')[0] || '—';
}

function renderMsPicker(){
  // Usa o nível e tipo do seletor do modo Real (niveauRowReal / teileRowReal)
  const grid = $('msPickerGrid');
  const grupo = NIVEAU_GROUP[state.niveau];
  const lista = state.bank
    .filter(b => NIVEAU_GROUP[b.niveau] === grupo && b.textsorte === state.tipoKey)
    .sort((a,b) => (extrairNumeroModellsatz(a.filename)||99) - (extrairNumeroModellsatz(b.filename)||99));

  if (!lista.length) {
    grid.innerHTML = `<div class="ms-empty">Keine Modellsätze im Banco für dieses Niveau/Typ.</div>`;
    return;
  }
  grid.innerHTML = '';
  lista.forEach(item => {
    const num = extrairNumeroModellsatz(item.filename);
    const tema = extrairTema(item.filename, item.text);
    const card = document.createElement('div');
    card.className = 'ms-card' + (msSeleccionado?.id === item.id ? ' selected' : '');
    card.innerHTML = `
      <span class="ms-num">Modellsatz ${num ?? '—'}</span>
      <div class="ms-thema">${escapeHtml(tema)}</div>
      <div class="ms-type">${escapeHtml(item.niveau)} · ${escapeHtml(item.textsorte)}</div>`;
    card.addEventListener('click', () => {
      msSeleccionado = item;
      document.querySelectorAll('.ms-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      $('btnToSchreibenReal').disabled = false;
    });
    grid.appendChild(card);
  });
}

/* Nível/Tipo no modo Real — espelha o seletor do modo Neu */
function renderNiveauRowReal(){
  const row = $('niveauRowReal');
  if (!row) return;
  row.innerHTML = '';
  NIVEAUS.forEach(n => {
    const btn = document.createElement('button');
    btn.className = 'niveau-btn' + (n === state.niveau ? ' active' : '');
    btn.textContent = n;
    btn.addEventListener('click', () => {
      state.niveau = n;
      state.tipoKey = TEXTSORTEN[n][0].key;
      renderNiveauRowReal();
      renderTeileRowReal();
      msSeleccionado = null;
      $('btnToSchreibenReal').disabled = true;
      renderMsPicker();
    });
    row.appendChild(btn);
  });
}
function renderTeileRowReal(){
  const row = $('teileRowReal');
  if (!row) return;
  row.innerHTML = '';
  TEXTSORTEN[state.niveau].forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'teil-btn' + (t.key === state.tipoKey ? ' active' : '');
    btn.innerHTML = `<span class="n">${state.niveau} · ${t.kurz}</span>${t.label}`;
    btn.addEventListener('click', () => {
      state.tipoKey = t.key;
      renderTeileRowReal();
      msSeleccionado = null;
      $('btnToSchreibenReal').disabled = true;
      renderMsPicker();
    });
    row.appendChild(btn);
  });
}

/* Botão "Com esta tarefa escrever" → pula aufgabe, vai direto pra schreiben */
if ($('btnToSchreibenReal')) {
  $('btnToSchreibenReal').addEventListener('click', () => {
    if (!msSeleccionado) return;
    carregarModellsatzReal(msSeleccionado);
    // Prepara mini-aufgabe e vai direto pra schreiben
    const meta = currentMeta();
    $('miniAufgabe').textContent = `${meta.label} · Modellsatz ${extrairNumeroModellsatz(msSeleccionado.filename)} · ${extrairTema(msSeleccionado.filename, msSeleccionado.text)}`;
    state.maxPage = Math.max(state.maxPage, 2);
    goToPage('schreiben');
    iniciarCronometro();
  });
}

function carregarModellsatzReal(item){
  state._modoReal = true;
  const meta = currentMeta();
  const num = extrairNumeroModellsatz(item.filename);
  const tema = extrairTema(item.filename, item.text);

  if (state.niveau === 'B1' && (state.tipoKey === 'beitrag' || state.tipoKey === 'leserbrief')) {
    const linhas = item.text.split(/\n+/);
    const personen = [];
    const pessoaNomeRegex = /^([A-ZÄÖÜ][a-zäöüß]+):\s*(.+)/;
    let aufgabeLinhas = [];
    let dentroAufgabe = false;
    linhas.forEach(l => {
      const m = l.match(pessoaNomeRegex);
      if (m && !dentroAufgabe) {
        personen.push({ name: m[1], aussage: m[2] });
      } else if (l.toLowerCase().includes('schreibe') || l.toLowerCase().includes('bearbeite')) {
        dentroAufgabe = true;
        aufgabeLinhas.push(l);
      } else if (dentroAufgabe) {
        aufgabeLinhas.push(l);
      }
    });
    const aufgabe = aufgabeLinhas.join('\n').trim() || item.text;
    const quelltext = personen.map(p => `${p.name}: ${p.aussage}`).join('\n\n');
    state.aufgabaObj = { aufgabe, quelltext, personen, thema: tema };
    // Popula aufgabe card (usado pelo modal "📋 Aufgabe")
    $('aufgabeTag').textContent = `${state.niveau} · ${meta.label} · Modellsatz ${num}`;
    $('aufgabeSchwierigkeit').textContent = 'Echter Modellsatz';
    $('aufgabeText').textContent = aufgabe;
    $('quelltext').style.display = 'none';
    $('refNote').textContent = item.filename;
    if (personen.length) {
      const bal = $('baloes');
      bal.innerHTML = personen.map(p =>
        `<div class="balloon"><span class="name">${escapeHtml(p.name)}</span>${escapeHtml(p.aussage)}</div>`
      ).join('');
      bal.style.display = 'grid';
    } else {
      $('baloes').style.display = 'none';
    }
  } else {
    state.aufgabaObj = { aufgabe: item.text, quelltext: '', thema: tema };
    $('aufgabeTag').textContent = `${state.niveau} · ${meta.label} · Modellsatz ${num}`;
    $('aufgabeSchwierigkeit').textContent = 'Echter Modellsatz';
    $('aufgabeText').textContent = item.text;
    $('quelltext').style.display = 'none';
    $('baloes').style.display = 'none';
    $('refNote').textContent = item.filename;
  }
  $('btnToSchreiben').disabled = false;
}
if ($('btnBackToConfig')) $('btnBackToConfig').addEventListener('click', () => goToPage('config'));
if ($('btnToSchreiben')) $('btnToSchreiben').addEventListener('click', () => {
  const meta = currentMeta();
  $('miniAufgabe').textContent = `${meta.label} (${state.niveau}, Schwierigkeit ${state.schwierigkeit}/8): ${state.aufgabaObj.aufgabe.replace(/\n/g,' ')}`;
  state.maxPage = Math.max(state.maxPage, 2);
  goToPage('schreiben');
  iniciarCronometro();
});

/* ---------- Page: schreiben ---------- */
function updateWordCount(){
  const text = $('textInput').value.trim();
  const count = text ? text.split(/\s+/).length : 0;
  $('wortzahlEl').textContent = count + ' Wörter';
}
if ($('textInput')) $('textInput').addEventListener('input', updateWordCount);
if ($('btnBackToAufgabe')) $('btnBackToAufgabe').addEventListener('click', () => goToPage('aufgabe'));
if ($('btnSenden')) $('btnSenden').addEventListener('click', async () => {
  const text = $('textInput').value.trim();
  if (!text) return;
  pararCronometro();
  state._textoEnviado = text;
  state.maxPage = Math.max(state.maxPage, 3);
  goToPage('korrektur');
  $('loadingResult').style.display = 'block';
  $('feedback').style.display = 'none';
  await runKorrektur(text);
});

/* ---------- Page: korrektur ---------- */
async function runKorrektur(text){
  const meta = currentMeta();
  const quelltextInfo = state.aufgabaObj.quelltext
    ? `\nForum-Aussagen/Ausgangstext:\n${state.aufgabaObj.quelltext}` : '';
  const personenInfo = state.aufgabaObj.personen
    ? `\nForum-Personen: ${state.aufgabaObj.personen.map(p=>`${p.name}: ${p.aussage}`).join(' | ')}` : '';

  const prompt = `Du bist eine erfahrene DaF-Lehrkraft sowie DSD-I-Prüferin mit umfassender Erfahrung in der Korrektur und Kalibrierung von Schülertexten. Du arbeitest streng nach den offiziellen Bewertungskriterien der Schriftlichen Kommunikation (DSD I, Anlage 12), bewertest jedoch stets wohlwollend und niveaugerecht auf A2/B1-Niveau.

AUFGABE: Analysiere und bewerte die folgende Schülerarbeit zur Schriftlichen Kommunikation im DSD I in fünf Schritten.

PRÜFUNGSAUFGABE:
Textsorte: ${meta.label}
Niveau: ${state.niveau}${quelltextInfo}${personenInfo}
Aufgabentext: ${state.aufgabaObj.aufgabe}

SCHÜLERTEXT:
"""
${text}
"""

WICHTIGE BEWERTUNGSGRUNDSÄTZE:
- DSD-I-Niveau (A2/B1) als Maßstab
- Wohlwollende Bewertung
- Verständlichkeit hat Vorrang vor Fehlerfreiheit
- Strukturen (Kategorie 6) und Grammatik (Kategorie 7) STRIKT GETRENNT bewerten — Strukturen = Vielfalt und Angemessenheit, Grammatik = Korrektheit
- Jede Punktevergabe mit konkreten Textbelegen begründen
- Bei Grenzfällen transparent erläutern

Antworte NUR mit einem einzigen JSON-Objekt, keine Einleitung, keine Markdown-Backticks. Alle Felder auf Deutsch. Format:
{
  "schritt1_transkription": [{"zeile": 1, "text": "Zeile 1 des Textes..."}, {"zeile": 2, "text": "..."}],
  "schritt2_bewertung": {
    "gesamteindruck":     {"punkte": 0, "begruendung": "...", "belege_positiv": ["Z.X: '...'"], "belege_schwach": ["Z.X: '...'"]},
    "wiedergabe":         {"punkte": 0, "begruendung": "...", "belege_positiv": [], "belege_schwach": []},
    "eigene_erfahrungen": {"punkte": 0, "begruendung": "...", "belege_positiv": [], "belege_schwach": []},
    "eigene_meinung":     {"punkte": 0, "begruendung": "...", "belege_positiv": [], "belege_schwach": []},
    "wortschatz":         {"punkte": 0, "begruendung": "...", "belege_positiv": [], "belege_schwach": []},
    "strukturen":         {"punkte": 0, "begruendung": "WICHTIG: nur Vielfalt/Angemessenheit, NICHT grammatische Korrektheit", "belege_positiv": [], "belege_schwach": []},
    "grammatik":          {"punkte": 0, "begruendung": "WICHTIG: nur Korrektheit (Satzstellung, Kasus, Verbformen, Kongruenz, Artikel), NICHT Vielfalt", "belege_positiv": [], "belege_schwach": []},
    "orthografie":        {"punkte": 0, "begruendung": "...", "belege_positiv": [], "belege_schwach": []}
  },
  "schritt3_belegsammlung": {
    "gesamtpunkte": 0,
    "max_punkte": 24,
    "niveaueinschaetzung": "A2 | A2+ | B1 knapp erreicht | B1 erreicht | B1 sicher erreicht",
    "niveaubegruendung": "..."
  },
  "schritt4_sprachanalyse": {
    "gelungene_strukturen": [{"typ": "weil-Satz", "beleg": "Z.X: '...'"}],
    "grammatikfehler": [{"original": "...", "zielstruktur": "...", "kategorie": "Satzstellung|Kasus|Artikel|Verbformen|Nebensatzstellung", "zeile": 0}],
    "orthografiefehler": [{"original": "...", "zielschreibung": "...", "zeile": 0}],
    "wortschatz": {"positiv": ["..."], "auffaelligkeiten": ["..."]}
  },
  "schritt5_feedback": {
    "gut_gelungen": ["...", "...", "..."],
    "verbessern": ["...", "...", "..."],
    "naechstes_lernziel": "..."
  }
}
Punkte pro Kategorie: 0-3. Gesamt: max 24 Punkte.`;

  try {
    const raw = await callGemini(prompt, 6000);
    const json = extractJson(raw);
    renderFeedback(json);
    // Salva versão simplificada no histórico (retrocompatível)
    const feedbackSimples = {
      niveau_einschaetzung: json.schritt3_belegsammlung?.niveaueinschaetzung || '—',
      status: json.schritt3_belegsammlung?.niveaueinschaetzung || '—',
      erfuellung: json.schritt2_bewertung?.gesamteindruck?.begruendung || '',
      aufbau: json.schritt2_bewertung?.strukturen?.begruendung || '',
      sprache: json.schritt2_bewertung?.grammatik?.begruendung || '',
      tipp: json.schritt5_feedback?.naechstes_lernziel || '',
      korrekturen: (json.schritt4_sprachanalyse?.grammatikfehler || []).map(f => ({
        original: f.original, korrektur: f.zielstruktur, erklaerung: f.kategorie
      }))
    };
    await salvarHistorico(state._textoEnviado || '', feedbackSimples);
  } catch(e) {
    console.error(e);
    $('loadingResult').style.display = 'none';
    $('feedback').style.display = 'block';
    $('fbErfuellung').textContent = 'Fehler bei der Korrektur. Bitte nochmal versuchen.';
  }
}

function renderFeedback(json){
  const s2 = json.schritt2_bewertung || {};
  const s3 = json.schritt3_belegsammlung || {};
  const s4 = json.schritt4_sprachanalyse || {};
  const s5 = json.schritt5_feedback || {};

  // Carimbo
  $('stampNiveau').textContent = s3.niveaueinschaetzung || '—';
  $('stampTag').textContent = `${s3.gesamtpunkte ?? '?'} / ${s3.max_punkte ?? 24} Punkte`;

  // Seção 1: Bewertung (8 categorias em tabela)
  const kategorien = [
    { key:'gesamteindruck',     label:'Gesamteindruck' },
    { key:'wiedergabe',         label:'Wiedergabe' },
    { key:'eigene_erfahrungen', label:'Eigene Erfahrungen' },
    { key:'eigene_meinung',     label:'Eigene Meinung' },
    { key:'wortschatz',         label:'Wortschatz' },
    { key:'strukturen',         label:'Strukturen' },
    { key:'grammatik',          label:'Grammatik' },
    { key:'orthografie',        label:'Orthografie' },
  ];

  let bewertungHTML = `<table class="fb-table"><thead><tr><th>Kategorie</th><th>Pkt</th><th>Begründung</th></tr></thead><tbody>`;
  let gesamtPunkte = 0;
  kategorien.forEach(k => {
    const kat = s2[k.key] || {};
    const p = kat.punkte ?? '?';
    if (typeof p === 'number') gesamtPunkte += p;
    const pos = (kat.belege_positiv || []).map(b => `<span class="beleg-pos">✓ ${escapeHtml(b)}</span>`).join('');
    const neg = (kat.belege_schwach || []).map(b => `<span class="beleg-neg">✗ ${escapeHtml(b)}</span>`).join('');
    bewertungHTML += `<tr>
      <td class="kat-name">${k.label}</td>
      <td class="kat-punkte">${p}/3</td>
      <td>${escapeHtml(kat.begruendung||'')}${pos?'<br>'+pos:''}${neg?'<br>'+neg:''}</td>
    </tr>`;
  });
  bewertungHTML += `<tr class="gesamt-row"><td colspan="2"><strong>Gesamt</strong></td><td><strong>${s3.gesamtpunkte ?? gesamtPunkte} / 24</strong></td></tr></tbody></table>`;
  $('fbErfuellung').innerHTML = bewertungHTML;

  // Seção 2: Niveaueinschätzung
  $('fbAufbau').innerHTML = `<strong>${escapeHtml(s3.niveaueinschaetzung||'—')}</strong> — ${escapeHtml(s3.niveaubegruendung||'')}`;

  // Seção 3: Sprachanalyse
  let analyseHTML = '';

  // Gelungene Strukturen
  if ((s4.gelungene_strukturen||[]).length) {
    analyseHTML += '<strong>✓ Gelungene Strukturen</strong><ul class="analyse-list">';
    (s4.gelungene_strukturen||[]).forEach(g => {
      analyseHTML += `<li><em>${escapeHtml(g.typ)}</em> — ${escapeHtml(g.beleg)}</li>`;
    });
    analyseHTML += '</ul>';
  }

  // Grammatikfehler
  if ((s4.grammatikfehler||[]).length) {
    analyseHTML += '<strong>✗ Grammatikfehler</strong><ul class="analyse-list">';
    (s4.grammatikfehler||[]).forEach(f => {
      analyseHTML += `<li><span class="orig">${escapeHtml(f.original)}</span> → <span class="korr">${escapeHtml(f.zielstruktur)}</span><span class="erkl">${escapeHtml(f.kategorie)} (Z.${f.zeile})</span></li>`;
    });
    analyseHTML += '</ul>';
  }

  // Orthografiefehler
  if ((s4.orthografiefehler||[]).length) {
    analyseHTML += '<strong>✗ Orthografiefehler</strong><ul class="analyse-list">';
    (s4.orthografiefehler||[]).forEach(f => {
      analyseHTML += `<li><span class="orig">${escapeHtml(f.original)}</span> → <span class="korr">${escapeHtml(f.zielschreibung)}</span><span class="erkl">Z.${f.zeile}</span></li>`;
    });
    analyseHTML += '</ul>';
  }

  $('fbSprache').innerHTML = analyseHTML || '—';

  // Seção 4: Korrekturen list -> reutiliza pra Schülerfeedback
  const list = $('korrekturenList');
  list.innerHTML = '';
  const gut = s5.gut_gelungen || [];
  const verb = s5.verbessern || [];
  gut.forEach(g => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="korr">✓</span> ${escapeHtml(g)}`;
    list.appendChild(li);
  });
  verb.forEach(v => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="orig">→</span> ${escapeHtml(v)}`;
    list.appendChild(li);
  });

  $('fbTip').textContent = '🎯 Nächstes Lernziel: ' + (s5.naechstes_lernziel || '');

  $('loadingResult').style.display = 'none';
  $('feedback').style.display = 'block';
  const stamp = $('stamp');
  stamp.style.animation = 'none'; stamp.offsetHeight; stamp.style.animation = null;
}
if ($('btnNeueTextsorte')) $('btnNeueTextsorte').addEventListener('click', () => { state.maxPage = 0; goToPage('config'); });
if ($('btnNochmal')) $('btnNochmal').addEventListener('click', () => { $('textInput').value=''; updateWordCount(); goToPage('schreiben'); iniciarCronometro(); });

/* ---------- Init ---------- */
(async function init(){
  const authed = await initAuth();
  if (!authed) return;
  await loadBank();
  renderNiveauRow();
  renderTeileRow();
  renderNiveauRowReal();
  renderTeileRowReal();
  if (!location.hash) location.hash = '#/config';
  onHashChange();
})();

/* ================================================================
   CRONÔMETRO
   ================================================================ */
const TEMPO_PROVA = { A2: 45, B1: 75, B2: 90, C1: 90 }; // minutos

let timerInterval = null;
let timerSeconds = 0;

function iniciarCronometro(){
  clearInterval(timerInterval);
  const minutos = TEMPO_PROVA[state.niveau] || 75;
  timerSeconds = minutos * 60;
  renderCronometro();
  timerInterval = setInterval(() => {
    timerSeconds--;
    renderCronometro();
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      const el = $('cronometro');
      if (el) { el.classList.add('esgotado'); el.textContent = '00:00 — Zeit!'; }
    }
  }, 1000);
}

function pararCronometro(){
  clearInterval(timerInterval);
}

function renderCronometro(){
  const el = $('cronometro');
  if (!el) return;
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.classList.toggle('aviso', timerSeconds <= 300 && timerSeconds > 0);   // laranja nos últimos 5 min
  el.classList.toggle('esgotado', timerSeconds <= 0);
}

/* ================================================================
   HISTÓRICO (Supabase)
   ================================================================ */
async function salvarHistorico(texto, feedback){
  try {
    const meta = currentMeta();
    await sbFetch('historico', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: _session?.user?.id,
        niveau: state.niveau,
        textsorte: meta.label,
        schwierigkeit: state.schwierigkeit,
        thema: state.aufgabaObj?.thema || state.aufgabaObj?.aufgabe?.split('\n')[0] || '—',
        texto_aluno: texto,
        nivel_atingido: feedback.niveau_einschaetzung || null,
        status: feedback.status || null,
        erfuellung: feedback.erfuellung || null,
        aufbau: feedback.aufbau || null,
        sprache: feedback.sprache || null,
        tipp: feedback.tipp || null,
        korrekturen: JSON.stringify(feedback.korrekturen || []),
      })
    });
  } catch(e) {
    console.warn('Histórico não salvo:', e);
  }
}

async function carregarHistorico(){
  const el = $('historicoLista');
  if (!el) return;
  el.innerHTML = '<div class="hist-loading">Laden&hellip;</div>';
  try {
    const res = await sbFetch('historico?select=*&order=created_at.desc&limit=50');
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      el.innerHTML = '<div class="hist-empty">Noch keine Einträge. Nach dem ersten Korrigieren erscheinen hier deine Ergebnisse.</div>';
      return;
    }
    el.innerHTML = rows.map(r => {
      const data = new Date(r.created_at).toLocaleDateString('de-DE');
      const statusClass = r.status === 'erreicht' || r.status === 'übertroffen' ? 'gut' : r.status === 'knapp erreicht' ? 'ok' : 'schlecht';
      return `<div class="hist-card">
        <div class="hist-top">
          <span class="hist-thema">${escapeHtml(r.thema)}</span>
          <span class="hist-badge ${statusClass}">${escapeHtml(r.niveau_atingido || '—')} · ${escapeHtml(r.status || '—')}</span>
        </div>
        <div class="hist-meta">${escapeHtml(r.niveau)} · ${escapeHtml(r.textsorte)} · Schwierigkeit ${r.schwierigkeit}/8 · ${data}</div>
        <div class="hist-tipp">→ ${escapeHtml(r.tipp || '')}</div>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = '<div class="hist-empty">Fehler beim Laden des Verlaufs.</div>';
  }
}

// Hook salvar histórico depois de renderFeedback
const _renderFeedbackOriginal = renderFeedback;
// Substituir a chamada em runKorrektur para capturar texto + feedback

/* ================================================================
   MODAL AUFGABENBLATT
   ================================================================ */
function abrirModalAufgabe(){
  if (!state.aufgabaObj) return;
  const overlay = document.getElementById('aufgabenOverlay');
  const meta = currentMeta();

  document.getElementById('modalAufgabeTag').textContent =
    `${state.niveau} · ${meta.label} · Schwierigkeit ${state.schwierigkeit}/8`;

  // Balões (só B1)
  const baloesModal = document.getElementById('baloesModal');
  if (state.aufgabaObj.personen && state.aufgabaObj.personen.length) {
    baloesModal.innerHTML = state.aufgabaObj.personen
      .map(p => `<div class="balloon"><span class="name">${escapeHtml(p.name)}</span>${escapeHtml(p.aussage)}</div>`)
      .join('');
    baloesModal.style.display = 'grid';
  } else {
    baloesModal.style.display = 'none';
    baloesModal.innerHTML = '';
  }

  document.getElementById('modalAufgabeText').textContent = state.aufgabaObj.aufgabe || '';
  overlay.classList.add('show');
}

function fecharModalAufgabe(){
  document.getElementById('aufgabenOverlay')?.classList.remove('show');
}

document.getElementById('btnVerAufgabe')?.addEventListener('click', abrirModalAufgabe);
document.getElementById('btnFecharModal')?.addEventListener('click', fecharModalAufgabe);
document.getElementById('aufgabenOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'aufgabenOverlay') fecharModalAufgabe();
});
// Fecha com Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') fecharModalAufgabe();
});
