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
const SUPABASE_URL = 'https://omgsadypqptedpuokgkh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dpL6--lbprFHSsctLRlRgA_qpm_jdft';

function sbFetch(path, options = {}) {
  const headers = Object.assign({
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  }, options.headers || {});
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

function pickReferences(){
  const grupo = NIVEAU_GROUP[state.niveau];
  const exact = state.bank.filter(b => NIVEAU_GROUP[b.niveau] === grupo && b.textsorte === state.tipoKey);
  const sameGrupo = state.bank.filter(b => NIVEAU_GROUP[b.niveau] === grupo && b.textsorte !== state.tipoKey);
  const pool = exact.length ? exact : sameGrupo;
  if (!pool.length) return [];
  const shuffled = [...pool].sort(() => Math.random()-0.5);
  return shuffled.slice(0,2);
}

/* ---------- Claude API (via Supabase Edge Function claude-proxy) ---------- */
async function callClaude(userPrompt, maxTokens){
  const response = await fetch(`${SUPABASE_URL}/functions/v1/claude-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY
    },
    body: JSON.stringify({ prompt: userPrompt, max_tokens: maxTokens || 1000 })
  });
  const data = await response.json();
  if (data.error) throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  const textBlock = (data.content || []).find(c => c.type === "text");
  return textBlock ? textBlock.text : "";
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
  const raw = await callClaude(prompt, 900);
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
  const raw = await callClaude(prompt, 700);
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
    refBlock = `\n\nStil-Referenz (Ton/Länge der Aussagen nachahmen, KEIN Thema wiederholen):\n${refs[0].text}`;
    $('refNote').textContent = 'Orientiert an: ' + refs.map(r=>r.filename).join(', ');
  } else {
    $('refNote').textContent = 'Kein passender Modellsatz im Banco gespeichert — Aussagen werden nach allgemeinem Muster generiert.';
  }
  const prompt = `Du bist Experte für die Erstellung von DSD-I-Prüfungsaufgaben (Deutsches Sprachdiplom). Erstelle die Variablen für einen "Beitrag für die Schülerzeitung"-Aufgabe auf B1-Niveau, Schwierigkeitsgrad ${state.schwierigkeit}/8 (1 = einfaches, konkretes Alltagsthema, 8 = abstrakteres Thema mit anspruchsvollerem Wortschatz).
Wähle ein NEUES, altersgerechtes Thema für Jugendliche (nicht Musik, Hausaufgaben, Lesen, Zu-spät-Kommen, Nebenjobs, Haustiere, Gewalt im Fernsehen oder Zu Hause mithelfen, das ist schon oft benutzt worden — such etwas anderes, z.B. Reisen, Mode, Essen, Freundschaft, Zukunftspläne, Wohnen, Umwelt, o.ä.).${refBlock}
Antworte NUR mit einem JSON-Objekt, keine Einleitung, keine Markdown-Backticks. Format:
{"thema": "ein Wort oder kurzer Begriff, z.B. 'Sport' oder 'Haustiere'", "personen": [{"name":"Vorname 1","aussage":"2-4 Sätze in Ich-Perspektive, persönliche Erfahrung/Meinung zum Thema, wie ein Forumspost"},{"name":"Vorname 2","aussage":"..."},{"name":"Vorname 3","aussage":"..."},{"name":"Vorname 4","aussage":"..."}], "frage_persoenlich": "Ein Satz im Stil 'Welche Rolle spielt in deinem Leben das Thema \\"[Thema]\\"? Berichte ausführlich.'", "frage_meinung": "Eine Ja/Nein- oder Bewertungsfrage zum Thema im Stil '[Frage]? Was denkst du? Begründe deine Meinung ausführlich.'"}
Die 4 Personen sollen unterschiedliche, teils gegensätzliche Perspektiven haben (wie im echten Modellsatz).`;
  const raw = await callClaude(prompt, 900);
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
if ($('btnBackToConfig')) $('btnBackToConfig').addEventListener('click', () => goToPage('config'));
if ($('btnToSchreiben')) $('btnToSchreiben').addEventListener('click', () => {
  const meta = currentMeta();
  $('miniAufgabe').textContent = `${meta.label} (${state.niveau}, Schwierigkeit ${state.schwierigkeit}/8): ${state.aufgabaObj.aufgabe.replace(/\n/g,' ')}`;
  state.maxPage = Math.max(state.maxPage, 2);
  goToPage('schreiben');
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
  state.maxPage = Math.max(state.maxPage, 3);
  goToPage('korrektur');
  $('loadingResult').style.display = 'block';
  $('feedback').style.display = 'none';
  await runKorrektur(text);
});

/* ---------- Page: korrektur ---------- */
async function runKorrektur(text){
  const meta = currentMeta();
  const quelltextInfo = state.aufgabaObj.quelltext ? `\nAusgangstext/Forum-Aussagen/Grafikbeschreibung: ${state.aufgabaObj.quelltext}` : '';
  try {
    const prompt = `Du bist ein erfahrener Prüfer für Deutsch als Fremdsprache. Bewerte folgenden Schülertext für die Textsorte "${meta.label}" auf Zielniveau ${state.niveau} (Schwierigkeitsgrad der Aufgabe: ${state.schwierigkeit}/8). Sei präzise und schnell, keine langen Einleitungen.
Aufgabe: ${state.aufgabaObj.aufgabe}${quelltextInfo}
Schülertext:
"""
${text}
"""
Antworte NUR mit einem JSON-Objekt, keine Einleitung, keine Markdown-Backticks, auf Deutsch, kurz und konkret. Format:
{"niveau_einschaetzung": "z.B. A2, A2+, B1-, B1, B1+, B2-, B2, B2+, C1-, C1", "status": "erreicht" | "knapp erreicht" | "noch nicht erreicht" | "übertroffen", "erfuellung": "1-2 Sätze", "aufbau": "1-2 Sätze", "sprache": "1-2 Sätze", "korrekturen": [{"original":"kurzer fehlerhafter Ausschnitt","korrektur":"korrigierte Version","erklaerung":"kurze Erklärung"}], "tipp": "ein konkreter nächster Schritt"}
Maximal 6 Korrekturen, wichtigste zuerst.`;
    const raw = await callClaude(prompt, 1000);
    const json = extractJson(raw);
    renderFeedback(json);
  } catch(e) {
    console.error(e);
    $('loadingResult').style.display = 'none';
    $('feedback').style.display = 'block';
    $('fbErfuellung').textContent = 'Fehler bei der Korrektur. Bitte nochmal versuchen.';
  }
}
function renderFeedback(json){
  $('stampNiveau').textContent = json.niveau_einschaetzung || '—';
  $('stampTag').textContent = json.status || '';
  $('fbErfuellung').textContent = json.erfuellung || '';
  $('fbAufbau').textContent = json.aufbau || '';
  $('fbSprache').textContent = json.sprache || '';
  $('fbTip').textContent = '→ ' + (json.tipp || '');
  const list = $('korrekturenList');
  list.innerHTML = '';
  (json.korrekturen || []).forEach(k => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="orig">${escapeHtml(k.original)}</span> → <span class="korr">${escapeHtml(k.korrektur)}</span><span class="erkl">${escapeHtml(k.erklaerung)}</span>`;
    list.appendChild(li);
  });
  $('loadingResult').style.display = 'none';
  $('feedback').style.display = 'block';
  const stamp = $('stamp');
  stamp.style.animation = 'none'; stamp.offsetHeight; stamp.style.animation = null;
}
if ($('btnNeueTextsorte')) $('btnNeueTextsorte').addEventListener('click', () => { state.maxPage = 0; goToPage('config'); });
if ($('btnNochmal')) $('btnNochmal').addEventListener('click', () => { $('textInput').value=''; updateWordCount(); goToPage('schreiben'); });

/* ---------- Init ---------- */
(async function init(){
  await loadBank();
  renderNiveauRow();
  renderTeileRow();
  if (!location.hash) location.hash = '#/config';
  onHashChange();
})();
