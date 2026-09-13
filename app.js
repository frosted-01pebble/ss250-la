const SCRAPER_URL = '/api/showtimes';

// --- State ---
let scraperEvents = [];
let scraperLoaded = false;
let selectedTheater = null;
let filmFilterActive = false;
let laemmleSubmenuOpen = false;
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
  "ali fear eats the soul":  ["fear eats the soul", "angst essen seele auf"],
  "2001 a space odyssey":    ["2001"],
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

// A same-titled film from another year is not the S&S film: "RIVER" (2026) is not
// Renoir's The River (1951). A little slack covers festival-vs-release dates.
const YEAR_TOLERANCE = 2;

// What follows " with " in a real screening of the film — "Nosferatu with Live
// Orchestra". Anything else is probably the rest of a different film's title:
// "The Thing with Two Heads" is not The Thing.
const WITH_EXTRAS_RE = /\b(live|orchestra|quarkestra|score|q\s*&\s*a|in person|intro|guest|director|filmmaker|cast|crew|discussion|conversation|panel|accompaniment|organ|wurlitzer|special)/i;

const stripFormats = t => t.replace(/\s+in\s+(35mm|70mm|16mm|4k|4K|DCP|HD|IMAX|digital)(\s+.*)?$/i, '').trim();
const stripParens  = t => t.replace(/\s*\([^)]+\)/g, '').trim();

function parenYear(t) {
  const years = new Set([...t.matchAll(/\((\d{4})\)/g)].map(m => m[1]));
  return years.size === 1 ? parseInt([...years][0], 10) : null;
}

function matchesAnySSTitle(t) {
  const bare = stripParens(stripFormats(t));
  return SS250_CANONICAL.some(ss => titlesMatch(ss.title, bare, ''));
}

// Candidate film titles within one listing title (or one double-bill half) —
// handles "in 35mm", "(Alt Title)", "Series: Film", and combined programs
function titleVariants(t) {
  const variants = new Set([t]);
  variants.add(stripFormats(t));
  variants.add(stripParens(t));
  variants.add(stripParens(stripFormats(t)));

  // Strip "Prefix: " colon-prefixes (e.g. "Calm Morning: My Neighbor Totoro")
  const colonIdx = t.indexOf(': ');
  if (colonIdx > 0) {
    const afterColon = t.slice(colonIdx + 2).trim();
    variants.add(afterColon);
    variants.add(stripFormats(afterColon));
    variants.add(stripParens(afterColon));
  }

  const cleanForSplit = stripParens(t);
  for (const sep of [' with ', ' + ', ' & ']) {
    const src = t.includes(sep) ? t : (cleanForSplit.includes(sep) ? cleanForSplit : null);
    if (!src) continue;
    const parts = src.split(sep);
    parts.forEach((part, i) => {
      if (sep === ' with ' && i < parts.length - 1) {
        const rest = parts.slice(i + 1).join(sep);
        if (!WITH_EXTRAS_RE.test(rest) && !matchesAnySSTitle(rest)) return;
      }
      variants.add(part.trim());
      variants.add(stripParens(part.trim()));
      variants.add(stripFormats(part.trim()));
      variants.add(stripParens(stripFormats(part.trim())));
    });
  }
  variants.delete('');
  return variants;
}

// Match scraper title against S&S list. evYear is the release year the venue
// gives for the film, if any. A double bill is matched half by half, each half
// checked against its own "(1972)" annotation, since a single event year can't
// say which half it belongs to.
function findSSMatchByTitle(rawTitle, evYear = null) {
  const hasSlash = rawTitle.includes('/');
  const segments = [[rawTitle, parenYear(rawTitle) ?? (hasSlash ? null : evYear)]];
  if (hasSlash) {
    const seen = new Set([rawTitle]);
    for (const sep of [' / ', '/']) {
      if (!rawTitle.includes(sep)) continue;
      for (const s of rawTitle.split(sep)) {
        const seg = s.trim();
        if (seg && !seen.has(seg)) {
          seen.add(seg);
          segments.push([seg, parenYear(seg)]);
        }
      }
    }
  }

  for (const [seg, segYear] of segments) {
    for (const v of titleVariants(seg)) {
      for (const ss of SS250_CANONICAL) {
        if (titlesMatch(ss.title, v, '') && (!segYear || Math.abs(ss.year - segYear) <= YEAR_TOLERANCE)) return ss;
      }
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

// --- Views, filters and URLs ---
// Each view and filter is kept in the URL — ?theater=landmark-nuart-theatre,
// ?view=ss250, ?film=singin-in-the-rain-1952, plus ?when=weekend, ?onfilm=1
// and ?q= — so any view can be shared, bookmarked, and reached with Back.

const FILM_RE = /\b(16mm|35mm|70mm)\b/i;
const DATE_FILTERS = [
  { key: 'all',     label: 'All dates' },
  { key: 'today',   label: 'Today' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'week',    label: 'Next 7 days' },
];

let dateFilter = 'all';
let listQuery = '';
let selectedFilm = null;        // the S&S entry shown when selectedTheater === '__film__'
let showtimesFetchedAt = null;  // when the server last scraped, epoch seconds

function slugify(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['\u2019]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const filmSlug = f => `${slugify(f.title)}-${f.year}`;

function stateToUrl() {
  const p = new URLSearchParams();
  if (selectedTheater === '__ss250__') {
    p.set('view', 'ss250');
    if (ss250Query.trim()) p.set('q', ss250Query.trim());
    if (ss250PlayingOnly) p.set('playing', '1');
  } else {
    if (selectedTheater === '__film__' && selectedFilm) p.set('film', filmSlug(selectedFilm));
    else if (selectedTheater && !selectedTheater.startsWith('__')) p.set('theater', slugify(selectedTheater));
    if (dateFilter !== 'all') p.set('when', dateFilter);
    if (filmFilterActive) p.set('onfilm', '1');
    if (selectedTheater === '__all__' && listQuery.trim()) p.set('q', listQuery.trim());
  }
  const qs = p.toString();
  return location.pathname + (qs ? `?${qs}` : '');
}

// Push for a change of view, so Back returns to it; replace for filter tweaks
function syncUrl(push) {
  const url = stateToUrl();
  if (url === location.pathname + location.search) return;
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

function stateFromUrl() {
  const p = new URLSearchParams(location.search);
  const theater = LA_THEATERS.find(t => slugify(t.name) === p.get('theater'));
  const film = SS250_CANONICAL.find(f => filmSlug(f) === p.get('film'));
  if (p.get('view') === 'ss250') selectedTheater = '__ss250__';
  else if (film) selectedTheater = '__film__';
  else if (theater) selectedTheater = theater.name;
  else selectedTheater = '__all__';
  selectedFilm = film || null;
  if (theater && theater.name.startsWith('Laemmle')) laemmleSubmenuOpen = true;

  const when = p.get('when');
  dateFilter = DATE_FILTERS.some(f => f.key === when) ? when : 'all';
  filmFilterActive = p.get('onfilm') === '1';
  const q = p.get('q') || '';
  if (selectedTheater === '__ss250__') {
    ss250Query = q;
    ss250PlayingOnly = p.get('playing') === '1';
  } else {
    listQuery = selectedTheater === '__all__' ? q : '';
  }
}

function renderView() {
  if (selectedTheater === '__ss250__') renderSS250Panel();
  else renderTheaterDetail();
}

// Change view: redraw, add a history entry, and bring the new view into sight
function goTo(view, film = null) {
  selectedTheater = view;
  selectedFilm = film;
  closeDropdown();
  renderTheaterNav();
  renderView();
  syncUrl(true);
  const top = document.querySelector('header').getBoundingClientRect().bottom + window.scrollY;
  if (window.scrollY > top) window.scrollTo({ top });
}

window.addEventListener('popstate', () => {
  if (!scraperLoaded) return;
  stateFromUrl();
  renderTheaterNav();
  renderView();
});

// --- Date filters ---
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString('en-CA');
}

// First and last date (inclusive) a date filter allows, or null for all dates
function dateFilterRange(key, today) {
  if (key === 'today') return [today, today];
  if (key === 'week') return [today, addDays(today, 6)];
  if (key === 'weekend') {
    const [y, m, d] = today.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();  // 0 Sun … 6 Sat
    if (dow === 0) return [today, today];
    return [dow >= 5 ? today : addDays(today, 5 - dow), addDays(today, 7 - dow)];
  }
  return null;
}

// --- Matching screenings ---
function ssDetails(ss) {
  return (ss250Data || []).find(f => f.title === ss.title && f.year === ss.year) || null;
}

// "1970s" matches by decade; anything else matches title, year, theater,
// director, or country (the last two once the S&S 250 details have loaded)
function matchesListQuery(ev, ss, q) {
  const decade = q.match(/^(\d{3})0s$/);
  if (decade) return Math.floor(ss.year / 10) === parseInt(decade[1], 10);
  const info = ssDetails(ss) || {};
  return [ss.title, String(ss.year), ev.theater, stripEntities(ev.title), info.director, ...(info.countries || [])]
    .some(v => v && normalizeSearchText(v).includes(q));
}

// True if the film is either half of the screening
function involvesFilm(ev, ss, film) {
  if (ss.title === film.title) return true;
  const partner = doubleFeaturePartner(stripEntities(ev.title), ss);
  const partnerSS = partner ? findSSMatchByTitle(partner) : null;
  return !!partnerSS && partnerSS.title === film.title;
}

// Upcoming S&S screenings, narrowed by theater or film and the current filters
function upcomingMatches({ theater = null, film = null, query = '' } = {}) {
  const today = todayStr();
  const range = dateFilterRange(dateFilter, today);
  const q = normalizeSearchText(query.trim());
  return mergeDoubleBills(
    scraperEvents
      .filter(e => e.date >= today
        && (!theater || e.theater === theater)
        && (!range || (e.date >= range[0] && e.date <= range[1]))
        && (!filmFilterActive || FILM_RE.test(e.format || '')))
      .map(ev => ({ ev, ss: findSSMatchByTitle(stripEntities(ev.title), ev.year) }))
      .filter(({ ev, ss }) => ss !== null
        && (!film || involvesFilm(ev, ss, film))
        && (!q || matchesListQuery(ev, ss, q)))
      .sort((a, b) => a.ev.date.localeCompare(b.ev.date) || a.ss.rank - b.ss.rank)
  );
}

let _playingCache = { events: null, counts: new Map() };

// S&S title -> number of upcoming screening days in LA (either half of a double bill counts)
function playingFilmCounts() {
  if (_playingCache.events === scraperEvents) return _playingCache.counts;
  const today = todayStr();
  const seen = new Map();
  const add = (title, ev) => {
    if (!seen.has(title)) seen.set(title, new Set());
    seen.get(title).add(`${ev.theater}|${ev.date}`);
  };
  for (const ev of scraperEvents) {
    if (ev.date < today) continue;
    const raw = stripEntities(ev.title);
    const ss = findSSMatchByTitle(raw, ev.year);
    if (!ss) continue;
    add(ss.title, ev);
    const partner = doubleFeaturePartner(raw, ss);
    const partnerSS = partner ? findSSMatchByTitle(partner) : null;
    if (partnerSS) add(partnerSS.title, ev);
  }
  const counts = new Map([...seen].map(([title, days]) => [title, days.size]));
  _playingCache = { events: scraperEvents, counts };
  return counts;
}

// --- Filter bar and list note ---
function filterBarHtml({ search }) {
  return `
    <div class="filter-bar">
      ${search ? `<input class="list-search" type="search" value="${escHtml(listQuery)}"
        placeholder="Search title, director, theater, or decade (e.g. 1970s)…" aria-label="Search screenings">` : ''}
      <div class="filter-chips" role="group" aria-label="Filter screenings">
        ${DATE_FILTERS.map(f => `<button type="button" class="filter-chip${dateFilter === f.key ? ' active' : ''}" data-when="${f.key}" aria-pressed="${dateFilter === f.key}">${f.label}</button>`).join('')}
        <button type="button" class="theater-btn film-btn${filmFilterActive ? ' film-active' : ''}" data-onfilm aria-pressed="${filmFilterActive}" title="Only 35mm, 70mm and 16mm prints">ON FILM</button>
      </div>
    </div>`;
}

function updateFilterBar() {
  document.querySelectorAll('.filter-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.when === dateFilter);
    b.setAttribute('aria-pressed', b.dataset.when === dateFilter);
  });
  document.querySelectorAll('[data-onfilm]').forEach(b => {
    b.classList.toggle('film-active', filmFilterActive);
    b.setAttribute('aria-pressed', filmFilterActive);
  });
}

function updatedLabel() {
  if (!showtimesFetchedAt) return '';
  const mins = Math.max(0, Math.round((Date.now() / 1000 - showtimesFetchedAt) / 60));
  if (mins < 1) return 'Showtimes updated just now';
  if (mins < 60) return `Showtimes updated ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `Showtimes updated ${hrs} hr${hrs === 1 ? '' : 's'} ago`;
}

function refreshUpdatedLabels() {
  document.querySelectorAll('.updated-label').forEach(el => { el.textContent = updatedLabel(); });
}

function listNoteHtml() {
  return `
    <p class="list-note">
      <span class="note-rank">#10</span> = rank in the 2022 Sight &amp; Sound poll
      · Rows open the theater's page ↗<span class="updated-label">${updatedLabel()}</span>
    </p>`;
}

function filmHeaderHtml(film) {
  const info = ssDetails(film) || {};
  const tie = _tiedRanks.has(film.rank) ? ' (tied)' : '';
  return `
    <div class="detail-header">
      <div class="detail-header-left">
        <a class="back-link" href="?view=ss250" data-nav="__ss250__">← The S&amp;S 250</a>
        <div class="detail-title-row">
          <div class="detail-theater-name"><em>${escHtml(film.title)}</em> <span class="screening-year">(${film.year})</span></div>
        </div>
        <div class="detail-meta">#${film.rank}${tie} in the 2022 Sight &amp; Sound poll${info.director ? ` · Dir. ${escHtml(info.director)}` : ''} · Every upcoming LA screening</div>
      </div>
      ${info.imdb_url ? `<div class="detail-header-right"><a class="detail-schedule-link" href="${escHtml(info.imdb_url)}" target="_blank" rel="noopener">IMDb ↗</a></div>` : ''}
    </div>`;
}

// --- Add to calendar ---
const CAL_ICON = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3M8 8.5v3.5M6.25 10.25h3.5"/></svg>`;
const EXTERNAL_MARK = `<i class="external-mark" aria-hidden="true">↗</i><small class="sr-only"> (opens the theater's site in a new tab)</small>`;

let calEvents = new Map();
let _calCounter = 0;

function calendarSummary(ss, partner, partnerSS) {
  if (partnerSS) return `${ss.title} / ${partnerSS.title}`;
  if (partner) return `${ss.title} / ${partner.replace(/\s*\(\d{4}\)/g, '')}`;
  return `${ss.title} (${ss.year})`;
}

function calButtonHtml(ev, summary) {
  const id = _calCounter++;
  calEvents.set(id, { ev, summary });
  const label = `Add ${summary} on ${formatScreeningDate(ev.date)} to your calendar`;
  return `<button type="button" class="cal-btn" data-cal="${id}" title="Add to calendar" aria-label="${escHtml(label)}">${CAL_ICON}</button>`;
}

function icsText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsLocal(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

// One event per showtime; a listing with no times becomes an all-day event
function buildIcs({ ev, summary }) {
  const [y, m, d] = ev.date.split('-').map(Number);
  const ymd = ev.date.replace(/-/g, '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const theater = LA_THEATERS.find(t => t.name === ev.theater);
  const place = theater && theater.neighborhood ? `${ev.theater}, ${theater.neighborhood}` : ev.theater;
  const times = (ev.times || []).filter(t => /\d:\d\d\s*(am|pm)/i.test(t));
  const vevents = (times.length ? times : [null]).map((t, i) => {
    let when;
    if (t) {
      const start = new Date(y, m - 1, d, 0, _timeToMinutes(t));
      const end = new Date(start.getTime() + 150 * 60000);  // runtimes aren't in the data
      when = [`DTSTART;TZID=America/Los_Angeles:${icsLocal(start)}`, `DTEND;TZID=America/Los_Angeles:${icsLocal(end)}`];
    } else {
      const next = new Date(y, m - 1, d + 1).toLocaleDateString('en-CA').replace(/-/g, '');
      when = [`DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${next}`];
    }
    return [
      'BEGIN:VEVENT',
      `UID:${ymd}-${i}-${slugify(ev.theater)}-${slugify(summary)}@ss250la.com`,
      `DTSTAMP:${stamp}`,
      ...when,
      `SUMMARY:${icsText(summary)}`,
      `LOCATION:${icsText(place)}`,
      `DESCRIPTION:${icsText([ev.format, ev.url].filter(Boolean).join('\n'))}`,
      ev.url ? `URL:${ev.url}` : null,
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ss250la.com//Screenings//EN',
          'CALSCALE:GREGORIAN', ...vevents, 'END:VCALENDAR'].join('\r\n');
}

function downloadCalendar(id) {
  const item = calEvents.get(id);
  if (!item) return;
  const blob = new Blob([buildIcs(item)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slugify(item.summary)}-${item.ev.date}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// One set of listeners on the panel, since its contents are redrawn on every change
function bindDetailEvents() {
  const detail = document.getElementById('theater-detail');
  detail.addEventListener('click', e => {
    const chip = e.target.closest('[data-when]');
    const onFilm = e.target.closest('[data-onfilm]');
    const cal = e.target.closest('[data-cal]');
    const filmLink = e.target.closest('[data-film]');
    const navLink = e.target.closest('[data-nav]');
    if (chip || onFilm) {
      if (chip) dateFilter = chip.dataset.when;
      else filmFilterActive = !filmFilterActive;
      updateFilterBar();
      renderScreeningResults();
      syncUrl(false);
    } else if (cal) {
      downloadCalendar(Number(cal.dataset.cal));
    } else if (filmLink || navLink) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;  // let the browser open it in a new tab
      e.preventDefault();
      if (navLink) {
        goTo(navLink.dataset.nav);
      } else {
        const film = SS250_CANONICAL.find(f => filmSlug(f) === filmLink.dataset.film);
        if (film) goTo('__film__', film);
      }
    }
  });
  detail.addEventListener('input', e => {
    if (!e.target.matches('.list-search')) return;
    listQuery = e.target.value;
    renderScreeningResults();
    syncUrl(false);
  });
}

// --- SS250 panel ---
let ss250Data = null;
let ss250Promise = null;
let ss250Query = '';
let ss250Sort = 'rank';
let ss250Reverse = false;
let ss250PlayingOnly = false;

// Strip accents/diacritics so a plain-ASCII search still matches accented names,
// e.g. "Almodovar" matches "Almodóvar".
function normalizeSearchText(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Shared by the S&S 250 panel, film pages, and screening search (directors, countries)
function fetchSS250Data() {
  if (!ss250Promise) {
    ss250Promise = fetch('/api/ss250', { signal: AbortSignal.timeout(30000) })
      .then(res => res.json())
      .catch(() => [])
      .then(data => (ss250Data = data));
  }
  return ss250Promise;
}

async function loadSS250Data() {
  const detail = document.getElementById('theater-detail');
  detail.innerHTML = `<p class="detail-empty" style="padding:3rem 0;text-align:center">Loading full list…</p>`;
  detail.classList.remove('hidden');
  await fetchSS250Data();
  if (selectedTheater === '__ss250__') renderSS250Panel();
}

function renderSS250Grid() {
  const container = document.getElementById('ss250-grid');
  if (!container || !ss250Data) return;

  const q = normalizeSearchText(ss250Query.trim());
  const decadeMatch = q.match(/^(\d{4})s$/);
  const decadeStart = decadeMatch ? parseInt(decadeMatch[1], 10) : null;

  const playing = playingFilmCounts();
  let films = [...ss250Data];
  if (ss250PlayingOnly) films = films.filter(f => playing.has(f.title));
  if (q) films = films.filter(f =>
    normalizeSearchText(f.title).includes(q) ||
    (f.director && normalizeSearchText(f.director).includes(q)) ||
    String(f.year).includes(q) ||
    (f.countries && f.countries.some(c => normalizeSearchText(c).includes(q))) ||
    (decadeStart !== null && Math.floor(f.year / 10) * 10 === decadeStart)
  );
  if (ss250Sort === 'title') films.sort((a, b) => a.title.localeCompare(b.title));
  else if (ss250Sort === 'year') films.sort((a, b) => a.year - b.year || a.rank - b.rank);
  else films.sort((a, b) => a.rank - b.rank);
  if (ss250Reverse) films.reverse();

  if (films.length === 0) {
    const message = q ? `No films match "${escHtml(ss250Query)}"` : 'None of the 250 are playing in LA right now.';
    container.innerHTML = `<p class="detail-empty" style="grid-column:1/-1;text-align:center;padding:2rem 0">${message}</p>`;
    return;
  }

  container.innerHTML = films.map(f => {
    const days = playing.get(f.title) || 0;
    const slug = filmSlug(f);
    return `
    <div class="ss250-card${days ? ' is-playing' : ''}">
      <a class="ss250-poster-link" href="${escHtml(f.imdb_url || '#')}" target="_blank" rel="noopener" title="${escHtml(f.title)} on IMDb">
        <div class="ss250-poster-wrap">
          ${f.poster
            ? `<img src="${escHtml(f.poster)}" alt="${escHtml(f.title)}" loading="lazy">`
            : `<div class="ss250-poster-placeholder">🎬</div>`}
          <span class="ss250-rank" title="${escHtml(rankTitle(f))}">${rankLabel(f.rank)}</span>
          ${days ? `<span class="ss250-now">Now playing</span>` : ''}
        </div>
      </a>
      <div class="ss250-card-info">
        <div class="ss250-card-title"><em>${escHtml(f.title)}</em></div>
        ${f.director ? `<div class="ss250-card-director">Dir. ${escHtml(f.director)}</div>` : ''}
        <div class="ss250-card-meta">
          <span class="ss250-card-year">${f.year}</span>
          ${f.countries && f.countries.length ? `<span class="ss250-card-countries">${escHtml(f.countries.join(', '))}</span>` : ''}
        </div>
        ${days ? `<a class="ss250-playing-link" href="?film=${escHtml(slug)}" data-film="${escHtml(slug)}">${days} screening day${days === 1 ? '' : 's'} in LA →</a>` : ''}
      </div>
    </div>`;
  }).join('');
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
      represent the pinnacle of cinema. Posters link to each film's IMDb page; films marked
      <em>Now playing</em> link to their upcoming screenings in LA.</p>
    </div>`;

  if (!ss250Data) {
    loadSS250Data();
    return;
  }

  const toolbar = `
    <div class="ss250-toolbar">
      <input class="ss250-search" type="text" placeholder="Search title, director, country, or decade (e.g. 1950s)…" value="${escHtml(ss250Query)}"
        oninput="ss250Query=this.value;renderSS250Grid();syncUrl(false)">
      <div class="ss250-sort-btns">
        <button class="ss250-sort-btn${ss250Sort === 'rank'  ? ' active' : ''}" onclick="ss250Sort='rank';renderSS250Grid();this.parentNode.querySelectorAll('.ss250-sort-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">Rank</button>
        <button class="ss250-sort-btn${ss250Sort === 'title' ? ' active' : ''}" onclick="ss250Sort='title';renderSS250Grid();this.parentNode.querySelectorAll('.ss250-sort-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">Title</button>
        <button class="ss250-sort-btn${ss250Sort === 'year'  ? ' active' : ''}" onclick="ss250Sort='year';renderSS250Grid();this.parentNode.querySelectorAll('.ss250-sort-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active')">Year</button>
      </div>
      <button class="ss250-reverse-btn${ss250Reverse ? ' active' : ''}" title="Reverse order" onclick="ss250Reverse=!ss250Reverse;renderSS250Grid();this.classList.toggle('active')">⇅</button>
      <button class="ss250-reverse-btn ss250-playing-btn${ss250PlayingOnly ? ' active' : ''}" title="Only films screening in LA" onclick="ss250PlayingOnly=!ss250PlayingOnly;this.classList.toggle('active');renderSS250Grid();syncUrl(false)">Playing now</button>
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
        <!-- Outer rim -->
        <path d="M 39.0 4.0 C 61.0 3.0, 77.0 20.0, 77.0 41.0 C 77.0 61.0, 59.0 77.0, 40.0 77.0 C 19.0 77.0, 3.0 60.0, 3.0 40.0 C 3.0 19.0, 21.0 3.0, 39.0 4.0 Z" fill="currentColor"/>
        <!-- Inner shadow ring -->
        <path d="M 40.0 6.5 C 59.0 6.0, 74.0 21.0, 73.5 41.0 C 73.0 60.0, 59.0 74.0, 40.0 73.5 C 21.0 74.0, 6.0 59.5, 6.5 40.0 C 7.0 21.0, 22.0 7.0, 40.0 6.5 Z" fill="var(--surface2)"/>
        <!-- Reel body -->
        <path d="M 40.5 9.0 C 58.0 9.0, 72.0 23.0, 71.5 40.5 C 71.0 58.0, 58.0 72.0, 40.0 71.5 C 22.0 72.0, 8.0 57.5, 8.5 39.5 C 9.0 22.0, 23.0 8.5, 40.5 9.0 Z" fill="var(--bg)"/>
        <!-- Film windows -->
        <path d="M 39.5 12.5 C 45.0 12.0, 49.0 16.5, 48.5 21.5 C 48.0 26.5, 44.0 30.0, 39.5 29.5 C 35.0 29.0, 31.0 25.0, 31.5 21.0 C 32.0 17.0, 35.5 13.0, 39.5 12.5 Z" fill="var(--surface)"/>
        <path d="M 59.0 25.5 C 64.0 25.0, 68.0 29.5, 67.5 34.5 C 67.0 39.5, 63.0 43.0, 58.5 42.5 C 54.0 42.0, 50.0 38.0, 50.5 33.5 C 51.0 29.0, 55.0 25.5, 59.0 25.5 Z" fill="var(--surface)"/>
        <path d="M 52.0 47.5 C 56.5 47.0, 60.5 51.0, 60.0 56.0 C 59.5 61.0, 55.5 65.0, 51.5 65.0 C 47.0 65.0, 43.0 61.0, 43.5 56.5 C 44.0 52.0, 48.0 48.0, 52.0 47.5 Z" fill="var(--surface)"/>
        <path d="M 27.5 48.0 C 32.5 47.5, 36.5 51.5, 37.0 56.0 C 37.5 61.0, 33.0 65.0, 28.5 65.0 C 24.0 65.0, 19.5 61.5, 20.0 57.0 C 20.5 52.5, 23.5 48.5, 27.5 48.0 Z" fill="var(--surface)"/>
        <path d="M 21.0 25.5 C 26.0 25.0, 29.5 29.0, 29.5 33.5 C 29.5 38.5, 26.0 43.0, 21.0 43.0 C 16.5 43.0, 12.0 39.0, 12.5 34.0 C 13.0 29.5, 16.5 25.5, 21.0 25.5 Z" fill="var(--surface)"/>
        <!-- Centre hub -->
        <path d="M 40.0 34.5 C 43.0 34.0, 45.5 37.0, 45.5 40.0 C 45.5 43.5, 43.0 46.0, 40.0 45.5 C 37.0 45.5, 34.5 43.0, 34.5 40.0 C 34.5 37.0, 37.5 34.5, 40.0 34.5 Z" fill="var(--bg)"/>
        <!-- Spindle -->
        <path d="M 40.0 37.5 C 41.5 37.5, 42.5 38.5, 42.5 40.0 C 42.5 41.5, 41.5 42.5, 40.0 42.5 C 38.5 42.5, 37.5 41.5, 37.5 40.0 C 37.5 38.5, 38.5 37.5, 40.0 37.5 Z" fill="currentColor"/>
        <!-- Centre dot -->
        <path d="M 40.0 38.8 C 40.7 38.8, 41.2 39.3, 41.2 40.0 C 41.2 40.7, 40.7 41.2, 40.0 41.2 C 39.3 41.2, 38.8 40.7, 38.8 40.0 C 38.8 39.3, 39.3 38.8, 40.0 38.8 Z" fill="var(--bg)"/>
      </svg>
      <span id="reel-spinner-text">Loading schedules…</span>
    </div>`;
    nav.classList.remove('hidden');
    return;
  }

  const theaterName = selectedTheater && !selectedTheater.startsWith('__') ? selectedTheater : null;
  const dropdownLabel = theaterName ? escHtml(theaterName) : 'Theaters';

  const laemmleTheaters = LA_THEATERS.filter(t => t.name.startsWith('Laemmle'));
  const otherTheaters   = LA_THEATERS.filter(t => !t.name.startsWith('Laemmle'));
  const laemmleActive   = laemmleTheaters.some(t => t.name === selectedTheater);

  // Build combined menu entries, sorting the Laemmle group by "Laemmles" so it
  // lands alphabetically where the individual theaters used to.
  const entries = [
    ...otherTheaters.map(t => ({ type: 'theater', theater: t, sortKey: t.name })),
    { type: 'laemmle-group', sortKey: 'Laemmles' },
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const menuHtml = entries.map(entry => {
    if (entry.type === 'theater') {
      const t = entry.theater;
      return `
        <button class="dropdown-item${selectedTheater === t.name ? ' active' : ''}" data-theater="${escHtml(t.name)}">
          ${escHtml(t.name)}
        </button>`;
    }
    return `
      <div class="dropdown-group">
        <button class="dropdown-item dropdown-group-header${laemmleActive ? ' active' : ''}" id="laemmle-group-btn">
          The Laemmles <span class="dropdown-group-arrow">${laemmleSubmenuOpen ? '▾' : '▸'}</span>
        </button>
        <div class="dropdown-submenu${laemmleSubmenuOpen ? '' : ' hidden'}">
          ${laemmleTheaters.map(t => `
            <button class="dropdown-item dropdown-subitem${selectedTheater === t.name ? ' active' : ''}" data-theater="${escHtml(t.name)}">
              ${escHtml(t.name.replace(/^Laemmle\s+/, ''))}
            </button>`).join('')}
        </div>
      </div>`;
  }).join('');

  nav.innerHTML = `
    <button class="theater-btn${selectedTheater === '__all__' ? ' active' : ''}" data-theater="__all__">All Upcoming</button>
    <div class="theater-dropdown-wrap">
      <button class="theater-dropdown-btn${theaterName ? ' active' : ''}" id="theater-dropdown-btn">${dropdownLabel} ▾</button>
      <div class="theater-dropdown-menu hidden" id="theater-dropdown-menu">
        ${menuHtml}
      </div>
    </div>
    <button class="theater-btn${selectedTheater === '__ss250__' || selectedTheater === '__film__' ? ' active' : ''}" id="ss250-btn">S&amp;S 250</button>`;

  nav.querySelector('[data-theater="__all__"]').addEventListener('click', () => goTo('__all__'));
  nav.querySelector('#ss250-btn').addEventListener('click', () => goTo('__ss250__'));

  const dropBtn = nav.querySelector('#theater-dropdown-btn');
  const menu    = nav.querySelector('#theater-dropdown-menu');

  dropBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  const groupBtn = nav.querySelector('#laemmle-group-btn');
  if (groupBtn) {
    groupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      laemmleSubmenuOpen = !laemmleSubmenuOpen;
      renderTheaterNav();
      // Re-open the dropdown menu since renderTheaterNav rebuilds it hidden
      nav.querySelector('#theater-dropdown-menu').classList.remove('hidden');
    });
  }

  menu.querySelectorAll('.dropdown-item:not(.dropdown-group-header)').forEach(item => {
    item.addEventListener('click', () => {
      if (item.classList.contains('dropdown-subitem')) laemmleSubmenuOpen = true;
      goTo(item.dataset.theater);
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

// Tooltip text, e.g. "#169 (tied) in the 2022 Sight & Sound poll"
function rankTitle(ss, partnerSS = null) {
  const one = f => `#${f.rank}${_tiedRanks.has(f.rank) ? ' (tied)' : ''}`;
  return `${partnerSS ? `${one(ss)} and ${one(partnerSS)}` : one(ss)} in the 2022 Sight & Sound poll`;
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
    <div class="screening-item">
      <a class="screening-row" href="${escHtml(ev.url || scheduleUrl)}" target="_blank" rel="noopener">
        <span class="screening-date">${escHtml(dateLabel)}</span>
        <span class="screening-rank" title="${escHtml(rankTitle(ss, partnerSS))}">${escHtml(rankStr)}</span>
        <div class="screening-main">
          <div class="screening-title"><em>${escHtml(ss.title)}</em> <span class="screening-year">(${ss.year})</span>${EXTERNAL_MARK}${partnerHtml(partner, ssSecond, partnerSS)}</div>
          <div class="screening-meta">
            ${includeTheater ? `<span class="screening-theater">${escHtml(ev.theater)}</span>` : ''}
            ${fmt ? `<span class="screening-format">${escHtml(fmt)}</span>` : ''}
            ${times ? `<span class="screening-time">${escHtml(times)}</span>` : ''}
          </div>
        </div>
      </a>
      ${calButtonHtml(ev, calendarSummary(ss, partner, partnerSS))}
    </div>`;
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
      <span class="screening-rank" title="${escHtml(rankTitle(ss, partnerSS))}">${escHtml(rankStr)}</span>
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
  const summary = calendarSummary(ss, partner, partnerSS);
  const children = group.map(({ ev: cev }) => {
    const times = (cev.times || []).join(sep);
    const childDate = formatScreeningDate(cev.date);
    return `
      <div class="screening-item">
        <a class="screening-row screening-row-child" href="${escHtml(cev.url || scheduleUrl)}" target="_blank" rel="noopener">
          <span class="screening-date">${escHtml(childDate)}</span>
          <span class="screening-rank"></span>
          <div class="screening-main">
            <div class="screening-meta">
              ${times ? `<span class="screening-time">${escHtml(times)}</span>` : ''}${EXTERNAL_MARK}
            </div>
          </div>
        </a>
        ${calButtonHtml(cev, summary)}
      </div>`;
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

// --- Screening views: All Upcoming, one theater, one film ---
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

  if (selectedTheater === '__film__' && !selectedFilm) selectedTheater = '__all__';

  let header;
  if (selectedTheater === '__all__') {
    header = `
      <div class="detail-header">
        <div class="detail-header-left">
          <div class="detail-title-row">
            <div class="detail-theater-name">All Upcoming</div>
          </div>
          <div class="detail-meta">Every Sight &amp; Sound screening across LA venues</div>
        </div>
      </div>`;
  } else if (selectedTheater === '__film__') {
    header = filmHeaderHtml(selectedFilm);
  } else {
    const theater = LA_THEATERS.find(t => t.name === selectedTheater);
    if (!theater) { detail.classList.add('hidden'); return; }
    header = theaterHeaderHtml(theater);
  }

  detail.innerHTML = header
    + filterBarHtml({ search: selectedTheater === '__all__' })
    + listNoteHtml()
    + `<div id="screening-results"></div>`;
  renderScreeningResults();
  detail.classList.remove('hidden');
}

// Redraws just the list, so the filter bar and search box keep focus
function renderScreeningResults() {
  const box = document.getElementById('screening-results');
  if (!box) return;
  const isAll = selectedTheater === '__all__';
  const isFilm = selectedTheater === '__film__';
  const matches = upcomingMatches({
    theater: isAll || isFilm ? null : selectedTheater,
    film: isFilm ? selectedFilm : null,
    query: isAll ? listQuery : '',
  });
  calEvents = new Map();

  if (matches.length === 0) {
    const narrowed = dateFilter !== 'all' || filmFilterActive || (isAll && listQuery.trim());
    box.innerHTML = `<p class="detail-empty">${narrowed
      ? 'No screenings match these filters.'
      : 'No upcoming Sight &amp; Sound screenings found.'}</p>`;
    return;
  }

  const rows = buildScreeningRowsList(matches, true, true);
  const LIMIT = 12;
  // Only the unfiltered All Upcoming list is long enough to fold
  if (!isAll || dateFilter !== 'all' || listQuery.trim() || rows.length <= LIMIT) {
    box.innerHTML = `<div class="screening-list">${rows.join('')}</div>`;
    return;
  }
  const moreCount = rows.length - LIMIT;
  box.innerHTML = `<div class="screening-list">${rows.slice(0, LIMIT).join('')}
    <div id="all-screenings-more" class="screening-more hidden">${rows.slice(LIMIT).join('')}</div>
    <button class="show-more-btn" id="show-more-btn" onclick="
      var m=document.getElementById('all-screenings-more');
      var hidden=m.classList.toggle('hidden');
      this.textContent=hidden?'Show all \u2014 ${moreCount} more':'Show less';
    ">Show all \u2014 ${moreCount} more</button></div>`;
}

function theaterHeaderHtml(theater) {
  const typeLabel = { repertory: 'Repertory', arthouse: 'Arthouse', mainstream: 'First Run' }[theater.type] || '';
  const nameStyle = theater.fontFamily ? ` style="font-family:${theater.fontFamily}"` : '';
  if (theater.fontUrl) {
    const fontId = `gfont-${theater.name.replace(/\s+/g, '-')}`;
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId; link.rel = 'stylesheet'; link.href = theater.fontUrl;
      document.head.appendChild(link);
    }
  }

  return `
    <div class="detail-header">
      <div class="detail-header-left">
        <div class="detail-title-row">
          <div class="detail-theater-name"${nameStyle}>${escHtml(theater.name)}</div>
        </div>
        <div class="detail-meta">
          ${escHtml(theater.neighborhood)}
          ${typeLabel ? `&nbsp;·&nbsp;<span class="theater-type ${theater.type}">${typeLabel}</span>` : ''}
          ${theater.opened ? `&nbsp;·&nbsp;<span class="detail-opened">${theater.openedLabel || 'Est.'} ${theater.opened}</span>` : ''}
        </div>
        ${theater.conservancyUrl ? `<a class="conservancy-badge" href="${theater.conservancyUrl}" target="_blank" rel="noopener">&#9733; <span>Historic Designation by LA Conservancy</span></a>` : ''}
        ${theater.history ? `<p class="detail-history">${escHtml(theater.history)}</p>` : ''}
      </div>
      <div class="detail-header-right">
        <a class="detail-schedule-link" href="${typeof theater.scheduleUrl === 'function' ? theater.scheduleUrl() : theater.scheduleUrl}" target="_blank" rel="noopener">Full schedule ↗</a>
      </div>
    </div>`;
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
    showtimesFetchedAt = data.fetched_at || null;
    scraperLoaded = true;
  } catch (e) {
    scraperLoaded = false;
  }
}

async function initPage() {
  bindDetailEvents();
  renderTheaterNav(); // show spinner immediately while polling
  await loadScraperData();

  stateFromUrl();
  renderTheaterNav();
  renderView();
  syncUrl(false);  // drop any parameters that didn't resolve

  // Directors and countries, for film pages and screening search
  fetchSS250Data().then(() => {
    if (selectedTheater === '__film__') renderTheaterDetail();
    else if (selectedTheater === '__all__' && listQuery.trim()) renderScreeningResults();
  });
}

document.addEventListener('DOMContentLoaded', initPage);

// Silently refresh scraper data every hour so an open tab stays current
setInterval(async () => {
  try {
    const res = await fetch(SCRAPER_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return;
    const data = await res.json();
    scraperEvents = data.events || [];
    showtimesFetchedAt = data.fetched_at || showtimesFetchedAt;
    // Redraw only the results, so a search box keeps its text and focus
    if (selectedTheater === '__ss250__') renderSS250Grid();
    else renderScreeningResults();
    refreshUpdatedLabels();
  } catch (e) { /* ignore — stale data is fine */ }
}, 60 * 60 * 1000); // every hour

// Keep "Showtimes updated N min ago" current
setInterval(refreshUpdatedLabels, 60 * 1000);
