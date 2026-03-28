const SCRAPER_URL = '/api/showtimes';

// --- State ---
let scraperEvents = [];
let scraperLoaded = false;
let selectedTheater = null;
let filmFilterActive = false;
let _groupIdCounter = 0;

// --- Title normalization ---
function normalizeTitle(t) {
  return t
    .toLowerCase()
    .replace(/^(the|a|an|la|le|les|l'|un|une|des)\s+/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const TITLE_ALIASES = {
  "jeanne dielman 23 quai du commerce 1080 bruxelles": ["jeanne dielman"],
  "regle du jeu":            ["the rules of the game", "rules of the game"],
  "cleo from 5 to 7":        ["cleo de 5 a 7"],
  "400 blows":               ["les quatre cents coups", "four hundred blows"],
  "latalante":               ["atalante"],
  "man with a movie camera": ["chelovek s kino-apparatom"],
  "passion of joan of arc":  ["la passion de jeanne darc"],
  "au hasard balthazar":     ["balthazar"],
  "8":                       ["otto e mezzo", "8 1/2", "federico fellini 8"],
  "andrei rublev":           ["andrei rublyov"],
  "bicycle thieves":         ["ladri di biciclette", "bicycle thief"],
  "bout de souffle":         ["breathless", "a bout de souffle"],
  "dolce vita":              ["la dolce vita"],
  "avventura":               ["lavventura"],
  "conformist":              ["il conformista"],
  "leopard":                 ["il gattopardo"],
  "spirit of beehive":       ["el espiritu de la colmena"],
  "spirit of the beehive":   ["el espiritu de la colmena"],
  "werckmeister harmonies":  ["werckmeister harmoniák"],
  "satantango":              ["sátántangó"],
  "colour of pomegranates":  ["sayat nova", "color of pomegranates"],
  "touki bouki":             ["journey of the hyena"],
  "ugetsu monogatari":       ["ugetsu"],
  "memories of underdevelopment": ["memorias del subdesarrollo"],
  "gospel according to st matthew": ["il vangelo secondo matteo", "gospel according to matthew"],
  "eclisse":                 ["leclisse", "eclipse"],
  "mepris":                  ["contempt", "le mepris"],
  "mulholland dr":           ["mulholland drive"],
  "beau travail":            ["beau work"],
  "satantango":              ["satantango", "the satan tango"],
  "vivre sa vie":            ["my life to live"],
  "bout de souffle":         ["breathless"],
  "close-up":                ["close up", "nema-ye nazdik"],
  "night of the hunter":     ["the night of the hunter"],
  "fear eats the soul":      ["ali fear eats the soul", "angst essen seele auf"],
  "my neighbour totoro":     ["my neighbor totoro"],
};

function titlesMatch(ssTitle, tmdbTitle, tmdbOrigTitle) {
  const ssNorm = normalizeTitle(ssTitle);
  const tmdbNorm = normalizeTitle(tmdbTitle);
  const tmdbOrigNorm = tmdbOrigTitle ? normalizeTitle(tmdbOrigTitle) : '';
  if (ssNorm === tmdbNorm || (tmdbOrigNorm && ssNorm === tmdbOrigNorm)) return true;
  const aliases = TITLE_ALIASES[ssNorm] || [];
  for (const alias of aliases) {
    const aliasNorm = normalizeTitle(alias);
    if (aliasNorm === tmdbNorm || (tmdbOrigNorm && aliasNorm === tmdbOrigNorm)) return true;
  }
  return false;
}

function findSSMatch(tmdbMovie) {
  const tmdbYear = tmdbMovie.release_date ? parseInt(tmdbMovie.release_date.slice(0, 4)) : null;
  for (const ssFilm of SS250_CANONICAL) {
    if (titlesMatch(ssFilm.title, tmdbMovie.title, tmdbMovie.original_title)) {
      if (!tmdbYear || Math.abs(ssFilm.year - tmdbYear) <= 2) return ssFilm;
    }
  }
  return null;
}

// Match scraper title against S&S list — handles "in 35mm", "(Alt Title)", combined programs
function findSSMatchByTitle(rawTitle) {
  const stripFormats = t => t.replace(/\s+in\s+(35mm|70mm|16mm|4k|4K|DCP|HD|IMAX|digital)(\s+.*)?$/i, '').trim();
  const stripParens  = t => t.replace(/\s*\([^)]+\)/g, '').trim();

  const variants = new Set([rawTitle]);
  variants.add(stripFormats(rawTitle));
  variants.add(stripParens(rawTitle));
  variants.add(stripParens(stripFormats(rawTitle)));

  // Strip "Prefix: " colon-prefixes (e.g. "Calm Morning: My Neighbor Totoro")
  const colonIdx = rawTitle.indexOf(': ');
  if (colonIdx > 0) {
    const afterColon = rawTitle.slice(colonIdx + 2).trim();
    variants.add(afterColon);
    variants.add(stripFormats(afterColon));
    variants.add(stripParens(afterColon));
  }

  // Split double features: strip year annotations first so "(1972)" doesn't block matching
  const cleanForSplit = stripParens(rawTitle);
  for (const sep of [' with ', ' + ', ' / ', ' & ', '/']) {
    const src = rawTitle.includes(sep) ? rawTitle : (cleanForSplit.includes(sep) ? cleanForSplit : null);
    if (!src) continue;
    for (const part of src.split(sep)) {
      variants.add(part.trim());
      variants.add(stripParens(part.trim()));
      variants.add(stripFormats(part.trim()));
      variants.add(stripParens(stripFormats(part.trim())));
    }
  }

  for (const v of variants) {
    if (!v) continue;
    for (const ss of SS250_CANONICAL) {
      if (titlesMatch(ss.title, v, '')) return ss;
    }
  }
  return null;
}

// For a double-feature event, return the partner film title (the non-SS match).
// Returns empty string if not a double feature or no distinct partner.
function doubleFeaturePartner(rawTitle, ss) {
  const sep = rawTitle.includes(' / ') ? ' / ' : rawTitle.includes('/') ? '/' : null;
  if (!sep) return '';
  const parts = rawTitle.split(sep).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  // Strip year suffix before matching so "(1972)" doesn't break comparison
  const bare = p => p.replace(/\s*\(\d{4}\)\s*$/, '').trim();
  return parts.filter(p => !titlesMatch(ss.title, bare(p), '')).join(' / ');
}

// Returns true if the S&S film appears second in the raw double-feature title.
function ssIsSecondFilm(rawTitle, ss) {
  const sep = rawTitle.includes(' / ') ? ' / ' : rawTitle.includes('/') ? '/' : null;
  if (!sep) return false;
  const parts = rawTitle.split(sep).map(p => p.trim()).filter(Boolean);
  const bare = p => p.replace(/\s*\(\d{4}\)\s*$/, '').trim();
  return parts.length >= 2 && titlesMatch(ss.title, bare(parts[parts.length - 1]), '');
}

// Render the partner film portion of a double-feature title.
// partnerSS: pre-computed findSSMatchByTitle result for the partner (or null).
// If both in S&S 250: italic + year inline separated by " / ", same visual weight.
// If partner not in S&S: block below, smaller muted text, "followed by" / "preceded by".
function partnerHtml(partner, ssSecond, partnerSS) {
  if (!partner) return '';
  if (partnerSS) {
    return ` / <em>${escHtml(partnerSS.title)}</em> <span class="screening-year">(${partnerSS.year})</span>`;
  }
  const yearMatch = partner.match(/\((\d{4})\)/);
  const year = yearMatch ? ` (${yearMatch[1]})` : '';
  const cleanTitle = partner.replace(/\s*\(\d{4}\)/, '').trim();
  const prefix = ssSecond ? 'preceded by' : 'followed by';
  return `<span class="screening-partner-line">${prefix} ${escHtml(cleanTitle)}${escHtml(year)}</span>`;
}

// --- Helpers ---
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function stripEntities(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#8217;/g, '\u2019')
          .replace(/&#8216;/g, '\u2018').replace(/&#8220;/g, '\u201C')
          .replace(/&#8221;/g, '\u201D');
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function formatScreeningDate(dateStr) {
  // Parse date parts directly to avoid timezone/DST fractional-day issues
  const [y, m, day] = dateStr.split('-').map(Number);
  const eventDate = new Date(y, m - 1, day); // local midnight
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // local midnight
  const diff = Math.round((eventDate - todayDate) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// --- Double-bill deduplication ---
// When the scraper returns separate events for each film in a double bill
// (same theater, date, and times), merge them into one row showing both films.
// Parse a 12-hour time string like "9:00 AM" or "11:30 PM" into minutes since midnight.
function _timeToMinutes(t) {
  const m = (t || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const pm = m[3].toUpperCase() === 'PM';
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + min;
}

// Also merges multiple showtimes of the same film on the same day at the same theater.
function mergeDoubleBills(matches) {
  const slotMap = new Map();
  for (const m of matches) {
    const timeKey = (m.ev.times || []).slice().sort().join('|');
    const key = `${m.ev.theater}__${m.ev.date}__${timeKey}`;
    if (!slotMap.has(key)) slotMap.set(key, []);
    slotMap.get(key).push(m);
  }
  // First pass: merge same-film repeat screenings (same theater+date+ss, different times)
  const filmDayMap = new Map();
  for (const m of matches) {
    const id = `${m.ev.theater}__${m.ev.date}__${m.ss.title}`;
    if (!filmDayMap.has(id)) filmDayMap.set(id, []);
    filmDayMap.get(id).push(m);
  }
  const mergedMatches = [];
  const seenFilmDay = new Set();
  for (const m of matches) {
    const id = `${m.ev.theater}__${m.ev.date}__${m.ss.title}`;
    if (seenFilmDay.has(id)) continue;
    seenFilmDay.add(id);
    const group = filmDayMap.get(id);
    if (group.length > 1) {
      // Merge all times from repeat screenings into the first entry, sorted chronologically
      const allTimes = [...new Set(group.flatMap(g => g.ev.times || []))].sort((a, b) => _timeToMinutes(a) - _timeToMinutes(b));
      mergedMatches.push({ ev: { ...group[0].ev, times: allTimes }, ss: group[0].ss });
    } else {
      mergedMatches.push(m);
    }
  }
  // Second pass: detect double bills (same theater+date+times, different SS films)
  const slotMap2 = new Map();
  for (const m of mergedMatches) {
    const timeKey = (m.ev.times || []).slice().sort().join('|');
    const key = `${m.ev.theater}__${m.ev.date}__${timeKey}`;
    if (!slotMap2.has(key)) slotMap2.set(key, []);
    slotMap2.get(key).push(m);
  }
  const used = new Set();
  const out = [];
  for (const m of mergedMatches) {
    const id = `${m.ev.theater}__${m.ev.date}__${m.ss.title}`;
    if (used.has(id)) continue;
    const timeKey = (m.ev.times || []).slice().sort().join('|');
    const slotKey = `${m.ev.theater}__${m.ev.date}__${timeKey}`;
    const slot = slotMap2.get(slotKey) || [];
    if (slot.length > 1 && timeKey !== '') {
      // Multiple SS films in same time slot = double bill — merge into one entry
      const sorted = [...slot].sort((a, b) => a.ss.rank - b.ss.rank);
      for (const s of sorted) used.add(`${s.ev.theater}__${s.ev.date}__${s.ss.title}`);
      const primary = sorted[0];
      const partnerTitles = sorted.slice(1).map(s => s.ss.title).join(' / ');
      out.push({
        ev: { ...primary.ev, title: `${primary.ss.title} / ${partnerTitles}` },
        ss: primary.ss,
      });
    } else {
      used.add(id);
      out.push(m);
    }
  }
  return out;
}

// --- Scraper data ---
function getUpcomingSSForTheater(theaterName) {
  const today = todayStr();
  const matches = scraperEvents
    .filter(e => e.theater === theaterName && e.date >= today)
    .map(ev => ({ ev, ss: findSSMatchByTitle(stripEntities(ev.title)) }))
    .filter(({ ss }) => ss !== null)
    .sort((a, b) => a.ev.date.localeCompare(b.ev.date));
  return mergeDoubleBills(matches);
}

function theatersWithMatches() {
  return LA_THEATERS.filter(t => getUpcomingSSForTheater(t.name).length > 0);
}

// --- SS250 panel ---
let ss250Data = null;
let ss250Loading = false;
let ss250Query = '';
let ss250Sort = 'rank';

async function loadSS250Data() {
  if (ss250Data || ss250Loading) return;
  ss250Loading = true;
  const detail = document.getElementById('theater-detail');
  detail.innerHTML = `<p class="detail-empty" style="padding:3rem 0;text-align:center">Loading full list…</p>`;
  detail.classList.remove('hidden');
  try {
    const res = await fetch('/api/ss250', { signal: AbortSignal.timeout(30000) });
    ss250Data = await res.json();
  } catch (e) {
    ss250Data = [];
  }
  ss250Loading = false;
  renderSS250Panel();
}

function renderSS250Grid() {
  const container = document.getElementById('ss250-grid');
  if (!container || !ss250Data) return;

  const q = ss250Query.trim().toLowerCase();
  let films = [...ss250Data];
  if (q) films = films.filter(f =>
    f.title.toLowerCase().includes(q) ||
    (f.director && f.director.toLowerCase().includes(q)) ||
    String(f.year).includes(q)
  );
  if (ss250Sort === 'title') films.sort((a, b) => a.title.localeCompare(b.title));
  else if (ss250Sort === 'year') films.sort((a, b) => a.year - b.year || a.rank - b.rank);
  else films.sort((a, b) => a.rank - b.rank);

  if (films.length === 0) {
    container.innerHTML = `<p class="detail-empty" style="grid-column:1/-1;text-align:center;padding:2rem 0">No films match "${escHtml(ss250Query)}"</p>`;
    return;
  }

  container.innerHTML = films.map(f => `
    <div class="ss250-card">
      <a class="ss250-poster-link" href="${escHtml(f.imdb_url || '#')}" target="_blank" rel="noopener">
        <div class="ss250-poster-wrap">
          ${f.poster
            ? `<img src="${escHtml(f.poster)}" alt="${escHtml(f.title)}" loading="lazy">`
            : `<div class="ss250-poster-placeholder">🎬</div>`}
          <span class="ss250-rank">${rankLabel(f.rank)}</span>
        </div>
      </a>
      <div class="ss250-card-info">
        <div class="ss250-card-title"><em>${escHtml(f.title)}</em></div>
        ${f.director ? `<div class="ss250-card-director">Dir. ${escHtml(f.director)}</div>` : ''}
        <div class="ss250-card-meta">
          <span class="ss250-card-year">${f.year}</span>
          ${f.countries && f.countries.length ? `<span class="ss250-card-countries">${escHtml(f.countries.join(', '))}</span>` : ''}
        </div>
      </div>
    </div>`).join('');
}

function renderSS250Panel() {
  const detail = document.getElementById('theater-detail');

  const about = `
    <div class="ss250-about">
      <h2 class="ss250-about-title"><a href="https://www.bfi.org.uk/sight-and-sound/greatest-films-all-time" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">The Sight &amp; Sound 250</a></h2>
      <p>Since 1952, the British Film Institute's <em>Sight &amp; Sound</em> magazine has polled critics,
      programmers, curators, and academics every decade to name the greatest films ever made. For half
      a century Orson Welles's <em>Citizen Kane</em> held the top spot almost without interruption —
      until 2012, when Alfred Hitchcock's <em>Vertigo</em> finally unseated it.</p>
      <p>The 2022 edition was the most wide-ranging in the poll's history: nearly 1,639 voters from
      across the globe participated, the largest turnout ever. The result was a seismic upheaval.
      Chantal Akerman's <em>Jeanne Dielman, 23, quai du Commerce, 1080 Bruxelles</em> rose to #1,
      making it the first film directed by a woman to lead the list. The poll also expanded from
      100 to 250 films, opening the canon to more global and contemporary cinema.</p>
      <p>Below is the full 2022 list — 250 films that, according to the world's leading film minds,
      represent the pinnacle of cinema. Each title links to its Sight &amp; Sound entry.</p>
    </div>`;

  if (!ss250Data) {
    loadSS250Data();
    return;
  }

  const toolbar = `
    <div class="ss250-toolbar">
      <input class="ss250-search" type="text" placeholder="Search films…" value="${escHtml(ss250Query)}"
        oninput="ss250Query=this.value;renderSS250Grid()">
      <div class="ss250-sort-btns">
        <button class="ss250-sort-btn${ss250Sort === 'rank'  ? ' active' : ''}" onclick="ss250Sort='rank';renderSS250Grid();this.parentNode.querySelectorAll('.ss250-sort-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">Rank</button>
        <button class="ss250-sort-btn${ss250Sort === 'title' ? ' active' : ''}" onclick="ss250Sort='title';renderSS250Grid();this.parentNode.querySelectorAll('.ss250-sort-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">Title</button>
        <button class="ss250-sort-btn${ss250Sort === 'year'  ? ' active' : ''}" onclick="ss250Sort='year';renderSS250Grid();this.parentNode.querySelectorAll('.ss250-sort-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">Year</button>
      </div>
    </div>`;

  detail.innerHTML = about + toolbar + `<div class="ss250-grid" id="ss250-grid"></div>`;
  detail.classList.remove('hidden');
  renderSS250Grid();
}

// --- Theater nav ---
function renderTheaterNav() {
  const nav = document.getElementById('theater-nav');

  if (!scraperLoaded) {
    nav.innerHTML = `<div class="nav-loading">
      <svg class="reel-spinner" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <!-- Disk body -->
        <circle cx="40" cy="40" r="36" fill="currentColor"/>
        <!-- Three large oval openings (split-reel windows) -->
        <ellipse cx="40" cy="17" rx="6.5" ry="11.5" fill="var(--bg)"/>
        <ellipse cx="40" cy="17" rx="6.5" ry="11.5" fill="var(--bg)" transform="rotate(120 40 40)"/>
        <ellipse cx="40" cy="17" rx="6.5" ry="11.5" fill="var(--bg)" transform="rotate(240 40 40)"/>
        <!-- Hub cutout -->
        <circle cx="40" cy="40" r="10.5" fill="var(--bg)"/>
        <!-- Hub collar ring -->
        <circle cx="40" cy="40" r="10.5" fill="none" stroke="currentColor" stroke-width="2.5"/>
        <!-- Centre spindle -->
        <circle cx="40" cy="40" r="4.5" fill="currentColor"/>
      </svg>
      <span id="reel-spinner-text">Loading schedules…</span>
    </div>`;
    nav.classList.remove('hidden');
    return;
  }

  const theaterName = selectedTheater && selectedTheater !== '__all__' && selectedTheater !== '__ss250__' ? selectedTheater : null;
  const dropdownLabel = theaterName ? escHtml(theaterName) : 'Theaters';

  nav.innerHTML = `
    <button class="theater-btn${selectedTheater === '__all__' ? ' active' : ''}" data-theater="__all__">All Upcoming</button>
    <div class="theater-dropdown-wrap">
      <button class="theater-btn theater-dropdown-btn${theaterName ? ' active' : ''}" id="theater-dropdown-btn">
        ${dropdownLabel} ▾
      </button>
      <div class="theater-dropdown-menu hidden" id="theater-dropdown-menu">
        ${[...LA_THEATERS].sort((a, b) => a.name.localeCompare(b.name)).map(t => `
          <button class="dropdown-item${selectedTheater === t.name ? ' active' : ''}" data-theater="${escHtml(t.name)}">
            ${escHtml(t.name)}
          </button>`).join('')}
      </div>
    </div>
    <button class="theater-btn${selectedTheater === '__ss250__' ? ' active' : ''}" id="ss250-btn">S&amp;S 250</button>`;

  const allBtn = nav.querySelector('[data-theater="__all__"]');
  allBtn.addEventListener('click', () => {
    selectedTheater = '__all__';
    closeDropdown();
    renderTheaterNav();
    renderTheaterDetail();
  });

  nav.querySelector('#ss250-btn').addEventListener('click', () => {
    selectedTheater = '__ss250__';
    closeDropdown();
    renderTheaterNav();
    renderSS250Panel();
  });

  const dropBtn = nav.querySelector('#theater-dropdown-btn');
  const menu    = nav.querySelector('#theater-dropdown-menu');

  dropBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  menu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedTheater = item.dataset.theater;
      closeDropdown();
      renderTheaterNav();
      renderTheaterDetail();
    });
  });

  nav.classList.remove('hidden');
}

function closeDropdown() {
  const menu = document.getElementById('theater-dropdown-menu');
  if (menu) menu.classList.add('hidden');
}

document.addEventListener('click', closeDropdown);

// --- Rank label helper ---
const _tiedRanks = (() => {
  const counts = {};
  SS250.forEach(f => { counts[f.rank] = (counts[f.rank] || 0) + 1; });
  return new Set(Object.keys(counts).filter(r => counts[r] > 1).map(Number));
})();

function rankLabel(rank) {
  return (_tiedRanks.has(rank) ? '=' : '') + rank;
}

// --- Multi-day run helpers ---
function dateRangeLabel(dates) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (dates.length === 1) return formatScreeningDate(dates[0]);
  const [, fm, fd] = dates[0].split('-').map(Number);
  const [, lm, ld] = dates[dates.length - 1].split('-').map(Number);
  if (fm === lm) return `${months[fm-1]} ${fd}–${ld}`;
  return `${months[fm-1]} ${fd} – ${months[lm-1]} ${ld}`;
}

function toggleGroup(id) {
  const children = document.getElementById(`group-children-${id}`);
  const arrow = document.getElementById(`group-arrow-${id}`);
  if (!children) return;
  const isHidden = children.classList.toggle('hidden');
  if (arrow) arrow.textContent = (isHidden ? '▶' : '▼') + ' ' + arrow.dataset.count;
}

function buildSingleRow(ev, ss, includeTheater, hashRank = false) {
  const rawT = stripEntities(ev.title);
  const partner = doubleFeaturePartner(rawT, ss);
  const ssSecond = ssIsSecondFilm(rawT, ss);
  const partnerSS = partner ? findSSMatchByTitle(partner) : null;
  const rl = r => hashRank ? `#${r}` : rankLabel(r);
  const rankStr = partnerSS ? `${rl(ss.rank)} / ${rl(partnerSS.rank)}` : rl(ss.rank);
  const sep = (partner && !partnerSS) ? ' / ' : ', ';
  const times = (ev.times || []).join(sep);
  const fmt = (ev.format || '').split(',').map(f => f.trim()).join(' / ');
  const dateLabel = formatScreeningDate(ev.date);
  const theater = LA_THEATERS.find(t => t.name === ev.theater);
  const scheduleUrl = theater ? (typeof theater.scheduleUrl === 'function' ? theater.scheduleUrl() : theater.scheduleUrl) : '#';
  return `
    <a class="screening-row" href="${escHtml(ev.url || scheduleUrl)}" target="_blank" rel="noopener">
      <span class="screening-date">${escHtml(dateLabel)}</span>
      <span class="screening-rank">${escHtml(rankStr)}</span>
      <div class="screening-main">
        <div class="screening-title"><em>${escHtml(ss.title)}</em> <span class="screening-year">(${ss.year})</span>${partnerHtml(partner, ssSecond, partnerSS)}</div>
        <div class="screening-meta">
          ${includeTheater ? `<span class="screening-theater">${escHtml(ev.theater)}</span>` : ''}
          ${fmt ? `<span class="screening-format">${escHtml(fmt)}</span>` : ''}
          ${times ? `<span class="screening-time">${escHtml(times)}</span>` : ''}
        </div>
      </div>
    </a>`;
}

function buildGroupRow(group, includeTheater, hashRank = false) {
  const id = _groupIdCounter++;
  const dates = group.map(m => m.ev.date);
  const rangeLabel = dateRangeLabel(dates);
  const { ev, ss } = group[0];
  const rawT = stripEntities(ev.title);
  const partner = doubleFeaturePartner(rawT, ss);
  const ssSecond = ssIsSecondFilm(rawT, ss);
  const partnerSS = partner ? findSSMatchByTitle(partner) : null;
  const rl = r => hashRank ? `#${r}` : rankLabel(r);
  const rankStr = partnerSS ? `${rl(ss.rank)} / ${rl(partnerSS.rank)}` : rl(ss.rank);
  const fmt = (ev.format || '').split(',').map(f => f.trim()).join(' / ');
  const theater = LA_THEATERS.find(t => t.name === ev.theater);
  const scheduleUrl = theater ? (typeof theater.scheduleUrl === 'function' ? theater.scheduleUrl() : theater.scheduleUrl) : '#';

  const header = `
    <div class="screening-row screening-group-header" onclick="toggleGroup(${id})" onkeydown="if(event.key==='Enter'||event.key===' ')toggleGroup(${id})" role="button" tabindex="0">
      <span class="screening-date">${escHtml(rangeLabel)}</span>
      <span class="screening-rank">${escHtml(rankStr)}</span>
      <div class="screening-main">
        <div class="screening-title"><em>${escHtml(ss.title)}</em> <span class="screening-year">(${ss.year})</span>${partnerHtml(partner, ssSecond, partnerSS)}</div>
        <div class="screening-meta">
          ${includeTheater ? `<span class="screening-theater">${escHtml(ev.theater)}</span>` : ''}
          ${fmt ? `<span class="screening-format">${escHtml(fmt)}</span>` : ''}
          <span class="screening-count" id="group-arrow-${id}" data-count="${dates.length}">▶ ${dates.length}</span>
        </div>
      </div>
    </div>`;

  const sep = (partner && !partnerSS) ? ' / ' : ', ';
  const children = group.map(({ ev: cev }) => {
    const times = (cev.times || []).join(sep);
    const childDate = formatScreeningDate(cev.date);
    return `
      <a class="screening-row screening-row-child" href="${escHtml(cev.url || scheduleUrl)}" target="_blank" rel="noopener">
        <span class="screening-date">${escHtml(childDate)}</span>
        <span class="screening-rank"></span>
        <div class="screening-main">
          <div class="screening-meta">
            ${times ? `<span class="screening-time">${escHtml(times)}</span>` : ''}
          </div>
        </div>
      </a>`;
  }).join('');

  return `
    <div class="screening-group">
      ${header}
      <div class="screening-group-children hidden" id="group-children-${id}">${children}</div>
    </div>`;
}

function buildScreeningRowsList(matches, includeTheater, hashRank = false) {
  // Returns array of rendered HTML strings, one per unique (title, theater) group
  const groupMap = new Map();
  for (const m of matches) {
    const key = `${m.ss.title}__${m.ev.theater}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(m);
  }
  const rendered = new Set();
  const rows = [];
  for (const m of matches) {
    const key = `${m.ss.title}__${m.ev.theater}`;
    if (rendered.has(key)) continue;
    rendered.add(key);
    const group = groupMap.get(key);
    rows.push(group.length === 1
      ? buildSingleRow(m.ev, m.ss, includeTheater, hashRank)
      : buildGroupRow(group, includeTheater, hashRank));
  }
  return rows;
}

function buildScreeningRows(matches, includeTheater, hashRank = false) {
  return buildScreeningRowsList(matches, includeTheater, hashRank).join('');
}

// --- Theater detail ---
function renderTheaterDetail() {
  const detail = document.getElementById('theater-detail');

  if (!selectedTheater) {
    detail.classList.add('hidden');
    return;
  }

  if (selectedTheater === '__ss250__') {
    renderSS250Panel();
    return;
  }

  // Reset film filter when leaving All Upcoming
  if (selectedTheater !== '__all__') filmFilterActive = false;

  // "All Upcoming" view
  if (selectedTheater === '__all__') {
    const today = todayStr();
    const _FILM_RE = /\b(16mm|35mm|70mm)\b/i;
    const all = mergeDoubleBills(
      scraperEvents
        .filter(e => e.date >= today && (!filmFilterActive || _FILM_RE.test(e.format || '')))
        .map(ev => ({ ev, ss: findSSMatchByTitle(stripEntities(ev.title)) }))
        .filter(({ ss }) => ss !== null)
        .sort((a, b) => a.ev.date.localeCompare(b.ev.date) || a.ss.rank - b.ss.rank)
    );

    const metaText = filmFilterActive
      ? 'Every Sight &amp; Sound screening across LA playing on either 16mm, 35mm, or 70mm'
      : 'Every Sight &amp; Sound screening across all LA venues';
    const emptyText = filmFilterActive
      ? 'No upcoming film screenings found.'
      : 'No upcoming Sight &amp; Sound screenings found.';
    const header = `
      <div class="detail-header">
        <div class="detail-header-left">
          <div class="detail-title-row">
            <div class="detail-theater-name">All Upcoming</div>
            <button class="theater-btn film-btn${filmFilterActive ? ' film-active' : ''}" onclick="filmFilterActive=!filmFilterActive;renderTheaterDetail()">ON FILM</button>
          </div>
          <div class="detail-meta">${metaText}</div>
        </div>
      </div>`;

    if (all.length === 0) {
      detail.innerHTML = header + `<p class="detail-empty">${emptyText}</p>`;
    } else {
      const rows = buildScreeningRowsList(all, true, true);
      const LIMIT = 12;
      let listHtml;
      if (rows.length <= LIMIT) {
        listHtml = rows.join('');
      } else {
        const moreCount = rows.length - LIMIT;
        listHtml = rows.slice(0, LIMIT).join('')
          + `<div id="all-screenings-more" class="hidden">${rows.slice(LIMIT).join('')}</div>`
          + `<button class="show-more-btn" id="show-more-btn" onclick="
              var m=document.getElementById('all-screenings-more');
              var hidden=m.classList.toggle('hidden');
              this.textContent=hidden?'Show all \u2014 ${moreCount} more':'Show less';
            ">Show all \u2014 ${moreCount} more</button>`;
      }
      detail.innerHTML = header + `<div class="screening-list">${listHtml}</div>`;
    }
    detail.classList.remove('hidden');
    return;
  }

  const theater = LA_THEATERS.find(t => t.name === selectedTheater);
  if (!theater) { detail.classList.add('hidden'); return; }

  const matches = getUpcomingSSForTheater(selectedTheater);
  const typeLabel = { repertory: 'Repertory', arthouse: 'Arthouse', mainstream: 'Mainstream' }[theater.type] || '';

  // Load theater font if specified
  if (theater.fontUrl) {
    const fontId = `gfont-${theater.name.replace(/\s+/g, '-')}`;
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href = theater.fontUrl;
      document.head.appendChild(link);
    }
  }
  const nameStyle = theater.fontFamily ? ` style="font-family:${theater.fontFamily}"` : '';

  const sortedTheaters = [...LA_THEATERS].sort((a, b) => a.name.localeCompare(b.name));
  const tIdx = sortedTheaters.findIndex(t => t.name === selectedTheater);
  const prevTheater = sortedTheaters[(tIdx - 1 + sortedTheaters.length) % sortedTheaters.length];
  const nextTheater = sortedTheaters[(tIdx + 1) % sortedTheaters.length];

  const header = `
    <div class="detail-header">
      <div class="detail-header-left">
        <div class="detail-title-row">
          <div class="detail-theater-name"${nameStyle}>${escHtml(theater.name)}</div>
        </div>
        <div class="detail-meta">
          ${escHtml(theater.neighborhood)}
          &nbsp;·&nbsp;<span class="theater-type ${theater.type}">${typeLabel}</span>
          ${theater.opened ? `&nbsp;·&nbsp;<span class="detail-opened">${theater.openedLabel || 'Est.'} ${theater.opened}</span>` : ''}
        </div>
        ${theater.conservancyUrl ? `<a class="conservancy-badge" href="${theater.conservancyUrl}" target="_blank" rel="noopener">&#9733; <span>Historic Designation by LA Conservancy</span></a>` : ''}
        ${theater.history ? `<p class="detail-history">${escHtml(theater.history)}</p>` : ''}
      </div>
      <div class="detail-header-right">
        <a class="detail-schedule-link" href="${typeof theater.scheduleUrl === 'function' ? theater.scheduleUrl() : theater.scheduleUrl}" target="_blank" rel="noopener">Full schedule ↗</a>
        <div class="theater-nav-arrows">
          <button class="theater-nav-arrow" title="${escHtml(prevTheater.name)}" onclick="selectedTheater='${escHtml(prevTheater.name)}';renderTheaterNav();renderTheaterDetail()">&#8249;</button>
          <button class="theater-nav-arrow" title="${escHtml(nextTheater.name)}" onclick="selectedTheater='${escHtml(nextTheater.name)}';renderTheaterNav();renderTheaterDetail()">&#8250;</button>
        </div>
      </div>
    </div>`;

  if (matches.length === 0) {
    detail.innerHTML = header + `<p class="detail-empty">No upcoming Sight &amp; Sound screenings found.</p>`;
  } else {
    detail.innerHTML = header + `<div class="screening-list">${buildScreeningRows(matches, false)}</div>`;
  }

  detail.classList.remove('hidden');
}


// --- Load scraper data ---
async function loadScraperData() {
  // Poll until the server cache is ready, updating the spinner with progress
  while (true) {
    try {
      const res = await fetch('/api/loading-status', { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const status = await res.json();
        if (status.total > 0) {
          const el = document.getElementById('reel-spinner-text');
          if (el) el.textContent = `Loading venues… ${status.done} / ${status.total}`;
        }
        if (status.ready) break;
      }
    } catch (e) { /* server not up yet, keep polling */ }
    await new Promise(r => setTimeout(r, 1200));
  }

  try {
    const res = await fetch(SCRAPER_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return;
    const data = await res.json();
    scraperEvents = data.events || [];
    scraperLoaded = true;
  } catch (e) {
    scraperLoaded = false;
  }
}

async function initPage() {
  renderTheaterNav(); // show spinner immediately while polling
  await loadScraperData();

  selectedTheater = '__all__';

  renderTheaterNav();
  renderTheaterDetail();

  const saved = localStorage.getItem(LS_KEY);
  if (saved) {
    currentApiKey = saved;
    loadAndRender();
  }
}

document.addEventListener('DOMContentLoaded', initPage);
