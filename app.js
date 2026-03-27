const SCRAPER_URL = '/api/showtimes';

// --- State ---
let scraperEvents = [];
let scraperLoaded = false;
let selectedTheater = null;

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
  const variants = new Set([rawTitle]);
  variants.add(rawTitle.replace(/\s+in\s+(35mm|70mm|16mm|4k|4K|DCP|HD|IMAX|digital)(\s+.*)?$/i, '').trim());
  variants.add(rawTitle.replace(/\s*\([^)]+\)/g, '').trim());
  const noSuffix = rawTitle.replace(/\s+in\s+(35mm|70mm|16mm|4k|4K|DCP|HD|IMAX|digital)(\s+.*)?$/i, '').trim();
  variants.add(noSuffix.replace(/\s*\([^)]+\)/g, '').trim());
  for (const sep of [' with ', ' + ', ' / ', ' & ']) {
    if (rawTitle.includes(sep)) {
      for (const part of rawTitle.split(sep)) {
        variants.add(part.trim());
        variants.add(part.replace(/\s*\([^)]+\)/g, '').trim());
        variants.add(part.replace(/\s+in\s+(35mm|70mm|16mm|4k|4K|DCP|HD|IMAX|digital)(\s+.*)?$/i, '').trim());
      }
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

// --- Scraper data ---
function getUpcomingSSForTheater(theaterName) {
  const today = todayStr();
  return scraperEvents
    .filter(e => e.theater === theaterName && e.date >= today)
    .map(ev => ({ ev, ss: findSSMatchByTitle(stripEntities(ev.title)) }))
    .filter(({ ss }) => ss !== null)
    .sort((a, b) => a.ev.date.localeCompare(b.ev.date));
}

function theatersWithMatches() {
  return LA_THEATERS.filter(t => getUpcomingSSForTheater(t.name).length > 0);
}

// --- SS250 panel ---
let ss250Data = null;
let ss250Loading = false;

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

function renderSS250Panel() {
  const detail = document.getElementById('theater-detail');

  const about = `
    <div class="ss250-about">
      <h2 class="ss250-about-title">The Sight &amp; Sound 250</h2>
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

  const films = [...ss250Data].sort((a, b) => a.rank - b.rank);
  const cards = films.map(f => `
    <div class="ss250-card">
      <div class="ss250-poster-wrap">
        ${f.poster
          ? `<img src="${escHtml(f.poster)}" alt="${escHtml(f.title)}" loading="lazy">`
          : `<div class="ss250-poster-placeholder">🎬</div>`}
        <span class="ss250-rank">#${f.rank}</span>
      </div>
      <div class="ss250-card-info">
        <div class="ss250-card-title"><em>${escHtml(f.title)}</em></div>
        <div class="ss250-card-year">${f.year}</div>
      </div>
    </div>`).join('');

  detail.innerHTML = about + `<div class="ss250-grid">${cards}</div>`;
  detail.classList.remove('hidden');
}

// --- Theater nav ---
function renderTheaterNav() {
  const nav = document.getElementById('theater-nav');

  if (!scraperLoaded) {
    nav.innerHTML = '<span class="nav-loading">Loading schedules…</span>';
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
        ${LA_THEATERS.map(t => `
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

  // "All Upcoming" view
  if (selectedTheater === '__all__') {
    const today = todayStr();
    const all = scraperEvents
      .filter(e => e.date >= today)
      .map(ev => ({ ev, ss: findSSMatchByTitle(stripEntities(ev.title)) }))
      .filter(({ ss }) => ss !== null)
      .sort((a, b) => a.ev.date.localeCompare(b.ev.date) || a.ss.rank - b.ss.rank);

    const header = `
      <div class="detail-header">
        <div class="detail-header-left">
          <div class="detail-theater-name">All Upcoming</div>
          <div class="detail-meta">Every Sight &amp; Sound screening across all LA venues</div>
        </div>
      </div>`;

    if (all.length === 0) {
      detail.innerHTML = header + `<p class="detail-empty">No upcoming Sight &amp; Sound screenings found.</p>`;
    } else {
      const rows = all.map(({ ev, ss }) => {
        const times = (ev.times || []).join(', ');
        const fmt = ev.format || '';
        const dateLabel = formatScreeningDate(ev.date);
        const theater = LA_THEATERS.find(t => t.name === ev.theater);
        const scheduleUrl = theater ? theater.scheduleUrl : '#';
        return `
          <a class="screening-row" href="${escHtml(ev.url || scheduleUrl)}" target="_blank" rel="noopener">
            <span class="screening-date">${escHtml(dateLabel)}</span>
            <span class="screening-rank">#${ss.rank}</span>
            <div class="screening-main">
              <div class="screening-title"><em>${escHtml(ss.title)}</em> <span class="screening-year">(${ss.year})</span></div>
              <div class="screening-meta">
                <span class="screening-theater">${escHtml(ev.theater)}</span>
                ${fmt ? `<span class="screening-format">${escHtml(fmt)}</span>` : ''}
                ${times ? `<span class="screening-time">${escHtml(times)}</span>` : ''}
              </div>
            </div>
          </a>`;
      }).join('');
      detail.innerHTML = header + `<div class="screening-list">${rows}</div>`;
    }
    detail.classList.remove('hidden');
    return;
  }

  const theater = LA_THEATERS.find(t => t.name === selectedTheater);
  if (!theater) { detail.classList.add('hidden'); return; }

  const matches = getUpcomingSSForTheater(selectedTheater);
  const typeLabel = { repertory: 'Repertory', arthouse: 'Arthouse', mainstream: 'Mainstream' }[theater.type] || '';

  const header = `
    <div class="detail-header">
      <div class="detail-header-left">
        <div class="detail-theater-name">${escHtml(theater.name)}</div>
        <div class="detail-meta">
          ${escHtml(theater.neighborhood)}
          &nbsp;·&nbsp;<span class="theater-type ${theater.type}">${typeLabel}</span>
          ${theater.opened ? `&nbsp;·&nbsp;<span class="detail-opened">Est. ${theater.opened}</span>` : ''}
        </div>
        ${theater.history ? `<p class="detail-history">${escHtml(theater.history)}</p>` : ''}
      </div>
      <a class="detail-schedule-link" href="${theater.scheduleUrl}" target="_blank" rel="noopener">Full schedule ↗</a>
    </div>`;

  if (matches.length === 0) {
    detail.innerHTML = header + `<p class="detail-empty">No upcoming Sight &amp; Sound screenings found.</p>`;
  } else {
    const rows = matches.map(({ ev, ss }) => {
      const times = (ev.times || []).join(', ');
      const fmt = ev.format || '';
      const dateLabel = formatScreeningDate(ev.date);
      return `
        <a class="screening-row" href="${escHtml(ev.url || theater.scheduleUrl)}" target="_blank" rel="noopener">
          <span class="screening-date">${escHtml(dateLabel)}</span>
          <span class="screening-rank">#${ss.rank}</span>
          <div class="screening-main">
            <div class="screening-title"><em>${escHtml(ss.title)}</em> <span class="screening-year">(${ss.year})</span></div>
            <div class="screening-meta">
              ${fmt ? `<span class="screening-format">${escHtml(fmt)}</span>` : ''}
              ${times ? `<span class="screening-time">${escHtml(times)}</span>` : ''}
            </div>
          </div>
        </a>`;
    }).join('');

    detail.innerHTML = header + `<div class="screening-list">${rows}</div>`;
  }

  detail.classList.remove('hidden');
}


// --- Load scraper data ---
async function loadScraperData() {
  try {
    const res = await fetch(SCRAPER_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const data = await res.json();
    scraperEvents = data.events || [];
    scraperLoaded = true;
    console.log(`Loaded ${scraperEvents.length} events from scraper backend`);
  } catch (e) {
    scraperLoaded = false;
    console.log('Scraper backend not available');
  }
}

async function initPage() {
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
