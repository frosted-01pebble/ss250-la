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
  "la regle du jeu":         ["the rules of the game", "rules of the game"],
  "cleo from 5 to 7":        ["cleo de 5 a 7"],
  "400 blows":               ["les quatre cents coups", "the 400 blows"],
  "latalante":               ["atalante"],
  "man with a movie camera": ["chelovek s kino-apparatom"],
  "passion of joan of arc":  ["la passion de jeanne darc"],
  "au hasard balthazar":     ["balthazar"],
  "8":                       ["otto e mezzo", "8 1/2"],
  "andrei rublev":           ["andrei rublyov"],
  "bicycle thieves":         ["ladri di biciclette", "the bicycle thief"],
  "breathless":              ["a bout de souffle"],
  "dolce vita":              ["la dolce vita"],
  "avventura":               ["lavventura"],
  "conformist":              ["il conformista"],
  "leopard":                 ["il gattopardo"],
  "salo or 120 days of sodom": ["salo o le 120 giornate di sodoma"],
  "spirit of beehive":       ["spirit of the beehive", "el espiritu de la colmena"],
  "spirit of the beehive":   ["el espiritu de la colmena"],
  "werckmeister harmonies":  ["werckmeister harmoniák"],
  "satantango":              ["sátántangó"],
  "color of pomegranates":   ["sayat nova"],
  "touki bouki":             ["journey of the hyena"],
  "pather panchali":         ["pather panchali"],
  "ugetsu":                  ["ugetsu monogatari"],
  "travelling players":      ["o thiasos"],
  "memories of underdevelopment": ["memorias del subdesarrollo"],
  "black god white devil":   ["deus e o diabo na terra do sol"],
  "gospel according to matthew": ["il vangelo secondo matteo"],
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
  // Parse as local date (noon avoids any DST edge cases)
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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

// --- Theater nav ---
function renderTheaterNav() {
  const nav = document.getElementById('theater-nav');
  const active = scraperLoaded ? theatersWithMatches() : [];

  if (!scraperLoaded) {
    nav.innerHTML = '<span class="nav-loading">Loading schedules…</span>';
    nav.classList.remove('hidden');
    return;
  }

  const allBtn = `<button class="theater-btn${selectedTheater === '__all__' ? ' active' : ''}" data-theater="__all__">All Upcoming</button>`;

  nav.innerHTML = allBtn + LA_THEATERS.map(t => `
    <button class="theater-btn${selectedTheater === t.name ? ' active' : ''}"
            data-theater="${escHtml(t.name)}">
      ${escHtml(t.name)}
    </button>
  `).join('');

  nav.querySelectorAll('.theater-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTheater = btn.dataset.theater;
      renderTheaterNav();
      renderTheaterDetail();
    });
  });

  nav.classList.remove('hidden');
}

// --- Theater detail ---
function renderTheaterDetail() {
  const detail = document.getElementById('theater-detail');

  if (!selectedTheater) {
    detail.classList.add('hidden');
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
        const cleanTitle = stripEntities(ev.title);
        const times = (ev.times || []).join(' · ');
        const fmt = ev.format || '';
        const dateLabel = formatScreeningDate(ev.date);
        const theater = LA_THEATERS.find(t => t.name === ev.theater);
        const scheduleUrl = theater ? theater.scheduleUrl : '#';
        return `
          <a class="screening-row all-view" href="${escHtml(ev.url || scheduleUrl)}" target="_blank" rel="noopener">
            <span class="screening-date">${escHtml(dateLabel)}</span>
            <span class="screening-rank">#${ss.rank}</span>
            <span class="screening-title">${escHtml(cleanTitle)}</span>
            <span class="screening-theater">${escHtml(ev.theater)}</span>
            <span class="screening-time">${fmt ? escHtml(fmt) + (times ? ' · ' + escHtml(times) : '') : escHtml(times)}</span>
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
          ${theater.note ? `&nbsp;·&nbsp;<span class="detail-note">${escHtml(theater.note)}</span>` : ''}
        </div>
      </div>
      <a class="detail-schedule-link" href="${theater.scheduleUrl}" target="_blank" rel="noopener">Full schedule ↗</a>
    </div>`;

  if (matches.length === 0) {
    detail.innerHTML = header + `<p class="detail-empty">No upcoming Sight &amp; Sound screenings found.</p>`;
  } else {
    const rows = matches.map(({ ev, ss }) => {
      const cleanTitle = stripEntities(ev.title);
      const times = (ev.times || []).join(' · ');
      const fmt = ev.format || '';
      const dateLabel = formatScreeningDate(ev.date);
      return `
        <a class="screening-row" href="${escHtml(ev.url || theater.scheduleUrl)}" target="_blank" rel="noopener">
          <span class="screening-date">${escHtml(dateLabel)}</span>
          <span class="screening-rank">#${ss.rank}</span>
          <span class="screening-title">${escHtml(cleanTitle)}</span>
          <span class="screening-time">${fmt ? escHtml(fmt) + (times ? ' · ' + escHtml(times) : '') : escHtml(times)}</span>
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
