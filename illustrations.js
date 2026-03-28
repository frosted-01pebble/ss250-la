'use strict';

// Hand-drawn SVG illustrations of LA theater exteriors
// Redrawn from photo references of the actual building facades
const THEATER_ILLUSTRATIONS = {

  // 611 N Fairfax Ave — Originally the 1942 Silent Movie Theatre storefront.
  // Simple painted 2-story Fairfax Ave commercial building, rectangular marquee canopy,
  // three upper-floor windows, ground-floor entrance flanked by display windows.
  "Brain Dead Studios": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g stroke-width="1.8">
      <path d="M 42,126 C 42,125 41,26 42,25"/>
      <path d="M 42,25 C 65,24 135,24 158,25"/>
      <path d="M 158,25 C 159,26 158,125 158,126"/>
    </g>
    <path d="M 34,126 C 60,127 140,127 166,126" stroke-width="1.5"/>
    <path d="M 36,25 C 60,24 140,24 164,25" stroke-width="1.2"/>
    <path d="M 46,78 C 48,77 152,77 154,78 L 155,90 C 153,91 47,91 45,90 Z" stroke-width="1.5" fill="currentColor" fill-opacity="0.07"/>
    <path d="M 52,91 L 52,126 M 148,91 L 148,126" stroke-width="0.8"/>
    <path d="M 50,35 L 50,68 L 79,68 L 79,35 Z" stroke-width="1.1"/>
    <path d="M 64,35 L 64,68 M 50,51 L 79,51" stroke-width="0.6"/>
    <path d="M 88,35 L 88,68 L 112,68 L 112,35 Z" stroke-width="1.1"/>
    <path d="M 100,35 L 100,68 M 88,51 L 112,51" stroke-width="0.6"/>
    <path d="M 121,35 L 121,68 L 150,68 L 150,35 Z" stroke-width="1.1"/>
    <path d="M 135,35 L 135,68 M 121,51 L 150,51" stroke-width="0.6"/>
    <path d="M 84,126 L 84,94 L 116,94 L 116,126" stroke-width="1.1"/>
    <path d="M 100,126 L 100,94" stroke-width="0.8"/>
    <path d="M 50,94 L 79,94 L 79,120 L 50,120 Z" stroke-width="0.9"/>
    <path d="M 121,94 L 150,94 L 150,120 L 121,120 Z" stroke-width="0.9"/>
    <path d="M 62,82 L 62,87 M 70,82 L 70,87 M 78,82 L 78,87 M 86,82 L 86,87 M 94,82 L 94,87 M 102,82 L 102,87 M 110,82 L 110,87 M 118,82 L 118,87 M 126,82 L 126,87 M 134,82 L 134,87" stroke-width="1"/>
  </svg>`,

  // 9500 Culver Blvd, Culver City — Opened 2017. Contemporary glass-and-steel multiplex
  // with LED projection and Dolby Atmos. Clean modern box facade with large glazed
  // ground-floor entrance, horizontal illuminated sign band, and geometric canopy.
  "Culver Theater": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 30,125 L 30,18 L 170,18 L 170,125" stroke-width="2"/>
    <path d="M 24,125 C 60,126 140,126 176,125" stroke-width="1.5"/>
    <path d="M 30,18 L 30,12 L 170,12 L 170,18" stroke-width="1.2"/>
    <path d="M 30,42 L 170,42 M 30,58 L 170,58" stroke-width="1.2"/>
    <path d="M 30,42 L 30,58 L 170,58 L 170,42 Z" fill="currentColor" fill-opacity="0.08" stroke-width="0"/>
    <path d="M 56,58 L 56,125" stroke-width="0.8"/>
    <path d="M 82,58 L 82,125" stroke-width="0.8"/>
    <path d="M 118,58 L 118,125" stroke-width="0.8"/>
    <path d="M 144,58 L 144,125" stroke-width="0.8"/>
    <path d="M 30,80 L 170,80 M 30,100 L 170,100" stroke-width="0.6"/>
    <path d="M 30,125 L 30,110 L 170,110 L 170,125" stroke-width="1"/>
    <path d="M 74,110 L 74,125 M 126,110 L 126,125" stroke-width="1.1"/>
    <path d="M 60,110 L 60,103 L 140,103 L 140,110" stroke-width="1.2"/>
    <path d="M 92,118 L 96,118 M 104,118 L 108,118" stroke-width="1"/>
  </svg>`,

  // 6067 Wilshire Blvd — The Saban Building (1939, A.C. Martin) is a Streamline Moderne
  // structure with the iconic cylindrical gold-leaf corner drum tower (no windows).
  // Renzo Piano added the massive glass sphere (David Geffen Theatre) in 2021.
  "Academy Museum": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 18,126 C 18,125 18,22 19,21 C 30,20 95,20 96,21 C 97,22 97,126 97,126" stroke-width="2"/>
    <path d="M 18,22 L 96,22" stroke-width="1.5"/>
    <path d="M 96,21 C 96,20 110,16 118,22 C 126,28 126,115 118,120 C 110,125 96,126 96,126" stroke-width="2"/>
    <path d="M 118,22 C 122,26 122,115 118,120" stroke-width="1.2"/>
    <path d="M 97,35 C 100,34 115,34 118,36" stroke-width="0.6"/>
    <path d="M 97,48 C 100,47 115,47 118,49" stroke-width="0.6"/>
    <path d="M 97,61 C 100,60 115,60 118,62" stroke-width="0.6"/>
    <path d="M 97,74 C 100,73 115,73 118,75" stroke-width="0.6"/>
    <path d="M 97,87 C 100,86 115,86 118,88" stroke-width="0.6"/>
    <path d="M 97,100 C 100,99 115,99 118,101" stroke-width="0.6"/>
    <path d="M 97,113 C 100,112 115,112 118,114" stroke-width="0.6"/>
    <circle cx="152" cy="75" r="42" stroke-width="2"/>
    <path d="M 152,33 L 152,117" stroke-width="0.7"/>
    <path d="M 110,75 L 194,75" stroke-width="0.7"/>
    <path d="M 122,44 C 135,38 168,38 180,46" stroke-width="0.6"/>
    <path d="M 122,106 C 135,112 168,112 180,104" stroke-width="0.6"/>
    <path d="M 113,60 C 120,52 183,52 191,60" stroke-width="0.5"/>
    <path d="M 113,90 C 120,98 183,98 191,90" stroke-width="0.5"/>
    <path d="M 113,114 C 120,118 184,118 191,114" stroke-width="1.2"/>
    <path d="M 14,126 C 60,127 155,127 196,126" stroke-width="1.5"/>
    <path d="M 19,40 L 96,40 M 19,58 L 96,58 M 19,76 L 96,76 M 19,94 L 96,94 M 19,112 L 96,112" stroke-width="0.6"/>
    <path d="M 28,28 L 42,28 L 42,38 L 28,38 Z M 50,28 L 64,28 L 64,38 L 50,38 Z M 72,28 L 86,28 L 86,38 L 72,38 Z" stroke-width="0.8"/>
    <path d="M 28,46 L 42,46 L 42,56 L 28,56 Z M 50,46 L 64,46 L 64,56 L 50,56 Z M 72,46 L 86,46 L 86,56 L 72,56 Z" stroke-width="0.8"/>
    <path d="M 28,64 L 42,64 L 42,74 L 28,74 Z M 50,64 L 64,64 L 64,74 L 50,74 Z M 72,64 L 86,64 L 86,74 L 72,74 Z" stroke-width="0.8"/>
  </svg>`,

  // 7165 Beverly Blvd — Narrow 1929 storefront on Beverly Blvd. Distinctive classic
  // movie marquee with exposed bulbs. Simple rectangular 2-story facade,
  // vertical blade sign, double entrance doors below projecting canopy.
  "New Beverly Cinema": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 55,126 C 55,125 54,20 55,19 C 68,18 132,18 145,19 C 146,20 145,125 145,126" stroke-width="2"/>
    <path d="M 48,126 C 70,127 130,127 152,126" stroke-width="1.5"/>
    <path d="M 55,19 C 70,17 130,17 145,19" stroke-width="1.2"/>
    <path d="M 55,28 L 145,28" stroke-width="1.2"/>
    <path d="M 65,32 L 65,52 L 135,52 L 135,32 Z" stroke-width="0.9"/>
    <path d="M 75,37 C 78,34 88,33 100,34 C 112,33 122,34 125,37" stroke-width="0.8"/>
    <path d="M 75,44 C 78,47 88,48 100,47 C 112,48 122,47 125,44" stroke-width="0.8"/>
    <path d="M 52,64 C 54,62 146,62 148,64 L 148,78 C 146,80 54,80 52,78 Z" stroke-width="1.8" fill="currentColor" fill-opacity="0.06"/>
    <circle cx="57" cy="63" r="1.5" fill="currentColor"/>
    <circle cx="65" cy="62" r="1.5" fill="currentColor"/>
    <circle cx="73" cy="62" r="1.5" fill="currentColor"/>
    <circle cx="81" cy="62" r="1.5" fill="currentColor"/>
    <circle cx="89" cy="62" r="1.5" fill="currentColor"/>
    <circle cx="97" cy="62" r="1.5" fill="currentColor"/>
    <circle cx="105" cy="62" r="1.5" fill="currentColor"/>
    <circle cx="113" cy="62" r="1.5" fill="currentColor"/>
    <circle cx="121" cy="62" r="1.5" fill="currentColor"/>
    <circle cx="129" cy="62" r="1.5" fill="currentColor"/>
    <circle cx="137" cy="62" r="1.5" fill="currentColor"/>
    <circle cx="143" cy="63" r="1.5" fill="currentColor"/>
    <path d="M 65,66 L 65,75 M 73,66 L 73,75 M 81,66 L 81,75 M 89,66 L 89,75 M 97,66 L 97,75 M 105,66 L 105,75 M 113,66 L 113,75 M 121,66 L 121,75 M 129,66 L 129,75 M 137,66 L 137,75" stroke-width="0.9"/>
    <path d="M 58,80 L 58,126 M 142,80 L 142,126" stroke-width="0.8"/>
    <path d="M 76,126 L 76,85 L 124,85 L 124,126" stroke-width="1.2"/>
    <path d="M 100,126 L 100,85" stroke-width="1"/>
    <path d="M 80,95 L 95,95 M 80,108 L 95,108 M 105,95 L 120,95 M 105,108 L 120,108" stroke-width="0.7"/>
    <path d="M 145,28 L 158,28 L 158,70 L 145,70" stroke-width="1.2"/>
    <path d="M 148,34 L 148,64 M 155,34 L 155,64" stroke-width="0.6"/>
  </svg>`,

  // 6712 Hollywood Blvd — Egyptian Revival, opened October 18, 1922. 45×150 ft open-air
  // forecourt with Egyptian-painted walls, 4 columns rising 20 ft with papyrus-bundle
  // capitals, hieroglyphic decorations throughout. Restored neon blade sign on Hollywood Blvd.
  "Egyptian Theatre": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 10,126 C 60,127 140,127 190,126" stroke-width="1.5"/>
    <path d="M 18,126 C 18,120 22,60 28,50" stroke-width="1.5"/>
    <path d="M 182,126 C 182,120 178,60 172,50" stroke-width="1.5"/>
    <path d="M 18,126 L 182,126 M 22,115 L 178,115 M 26,104 L 174,104 M 30,93 L 170,93" stroke-width="0.5"/>
    <path d="M 28,50 L 172,50 L 172,20 L 28,20 Z" stroke-width="1.8"/>
    <path d="M 28,20 C 40,14 60,12 100,12 C 140,12 160,14 172,20" stroke-width="1.5"/>
    <path d="M 85,16 C 90,13 110,13 115,16" stroke-width="1"/>
    <path d="M 100,14 L 100,16" stroke-width="0.8"/>
    <path d="M 80,15 C 75,14 70,16 72,18" stroke-width="0.8"/>
    <path d="M 120,15 C 125,14 130,16 128,18" stroke-width="0.8"/>
    <path d="M 34,24 L 34,46 M 44,24 L 44,46" stroke-width="0.6"/>
    <path d="M 156,24 L 156,46 M 166,24 L 166,46" stroke-width="0.6"/>
    <path d="M 36,28 L 42,28 M 36,32 C 37,30 41,30 42,32 M 36,38 L 42,38 M 36,42 C 38,44 40,44 42,42" stroke-width="0.7"/>
    <path d="M 158,28 L 164,28 M 158,32 C 159,30 163,30 164,32 M 158,38 L 164,38 M 158,42 C 160,44 162,44 164,42" stroke-width="0.7"/>
    <path d="M 52,126 L 52,50" stroke-width="3.5"/>
    <path d="M 76,126 L 76,50" stroke-width="3.5"/>
    <path d="M 124,126 L 124,50" stroke-width="3.5"/>
    <path d="M 148,126 L 148,50" stroke-width="3.5"/>
    <path d="M 44,52 C 46,50 58,50 60,52" stroke-width="1.5"/>
    <path d="M 68,52 C 70,50 82,50 84,52" stroke-width="1.5"/>
    <path d="M 116,52 C 118,50 130,50 132,52" stroke-width="1.5"/>
    <path d="M 140,52 C 142,50 154,50 156,52" stroke-width="1.5"/>
    <path d="M 47,122 C 49,124 55,124 57,122" stroke-width="1"/>
    <path d="M 71,122 C 73,124 79,124 81,122" stroke-width="1"/>
    <path d="M 119,122 C 121,124 127,124 129,122" stroke-width="1"/>
    <path d="M 143,122 C 145,124 151,124 153,122" stroke-width="1"/>
    <path d="M 86,126 L 86,72 C 88,70 112,70 114,72 L 114,126" stroke-width="1.2"/>
    <path d="M 100,126 L 100,72" stroke-width="0.8"/>
    <path d="M 86,72 C 88,62 112,62 114,72" stroke-width="1"/>
    <path d="M 12,126 L 12,20 L 24,20 L 24,126" stroke-width="1.5"/>
    <path d="M 15,30 L 21,30 M 15,38 L 21,38 M 15,46 L 21,46 M 15,54 L 21,54 M 15,62 L 21,62 M 15,70 L 21,70 M 15,78 L 21,78 M 15,86 L 21,86 M 15,94 L 21,94 M 15,102 L 21,102 M 15,110 L 21,110" stroke-width="1.8"/>
  </svg>`,

  // 1328 Montana Ave, Santa Monica — Streamline Moderne, designed 1940 by R.M. Woolpert.
  // Low horizontal building with clean stucco, horizontal moulding bands, the original
  // marquee retained, and a distinctive detached box-office kiosk in the forecourt.
  "Aero Theatre": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 14,126 C 60,127 140,127 186,126" stroke-width="1.5"/>
    <path d="M 22,126 L 22,52 L 178,52 L 178,126" stroke-width="2"/>
    <path d="M 22,52 L 22,46 L 178,46 L 178,52" stroke-width="1.2"/>
    <path d="M 22,62 L 178,62 M 22,72 L 178,72" stroke-width="0.7"/>
    <path d="M 22,62 L 178,62 L 178,72 L 22,72 Z" fill="currentColor" fill-opacity="0.04" stroke-width="0"/>
    <path d="M 22,82 L 178,82 M 22,92 L 178,92" stroke-width="0.7"/>
    <path d="M 60,52 L 60,40 L 140,40 L 140,52" stroke-width="1.5"/>
    <path d="M 62,42 L 62,50 M 70,42 L 70,50 M 78,42 L 78,50 M 86,42 L 86,50 M 94,42 L 94,50 M 102,42 L 102,50 M 110,42 L 110,50 M 118,42 L 118,50 M 126,42 L 126,50 M 134,42 L 134,50" stroke-width="0.9"/>
    <circle cx="65" cy="52" r="1.2" fill="currentColor"/>
    <circle cx="73" cy="52" r="1.2" fill="currentColor"/>
    <circle cx="81" cy="52" r="1.2" fill="currentColor"/>
    <circle cx="89" cy="52" r="1.2" fill="currentColor"/>
    <circle cx="97" cy="52" r="1.2" fill="currentColor"/>
    <circle cx="105" cy="52" r="1.2" fill="currentColor"/>
    <circle cx="113" cy="52" r="1.2" fill="currentColor"/>
    <circle cx="121" cy="52" r="1.2" fill="currentColor"/>
    <circle cx="129" cy="52" r="1.2" fill="currentColor"/>
    <circle cx="137" cy="52" r="1.2" fill="currentColor"/>
    <path d="M 76,126 L 76,96 L 124,96 L 124,126" stroke-width="1.2"/>
    <path d="M 92,126 L 92,96 M 108,126 L 108,96" stroke-width="0.9"/>
    <path d="M 30,100 L 56,100 L 56,120 L 30,120 Z M 144,100 L 170,100 L 170,120 L 144,120 Z" stroke-width="0.9"/>
    <path d="M 78,126 L 78,110 L 122,110 L 122,126" stroke-width="1.5"/>
    <path d="M 78,110 L 78,104 C 80,102 100,100 120,104 L 122,110" stroke-width="1.2"/>
    <path d="M 88,112 L 88,122 L 112,122 L 112,112 Z" stroke-width="0.9"/>
    <path d="M 92,113 L 108,113 L 108,118 L 92,118 Z" stroke-width="0.7"/>
  </svg>`,

  // 1822 N Vermont Ave, Los Feliz — Opened February 14, 1935. Spanish/Mission Revival
  // single-screen (780 seats), triplexed 1993. Ornate stucco facade with decorative
  // entrance surround, pilasters, and elaborately styled marquee.
  "Los Feliz 3": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 18,126 C 60,127 140,127 182,126" stroke-width="1.5"/>
    <path d="M 30,126 L 30,22 L 170,22 L 170,126" stroke-width="2"/>
    <path d="M 30,22 L 30,14 L 60,14 L 60,18 L 85,18 L 85,10 L 115,10 L 115,18 L 140,18 L 140,14 L 170,14 L 170,22" stroke-width="1.8"/>
    <path d="M 57,10 C 57,8 59,6 60,6 C 61,6 63,8 63,10 L 62,14 L 58,14 Z" stroke-width="0.9"/>
    <path d="M 137,10 C 137,8 139,6 140,6 C 141,6 143,8 143,10 L 142,14 L 138,14 Z" stroke-width="0.9"/>
    <path d="M 68,126 C 68,126 60,100 60,80 C 60,58 72,46 100,44 C 128,46 140,58 140,80 C 140,100 132,126 132,126" stroke-width="1.5"/>
    <path d="M 76,126 C 76,120 72,100 72,82 C 72,64 82,54 100,52 C 118,54 128,64 128,82 C 128,100 124,120 124,126" stroke-width="1"/>
    <path d="M 95,44 L 100,40 L 105,44" stroke-width="1.2"/>
    <path d="M 72,82 L 72,70 L 128,70 L 128,82" stroke-width="1.3"/>
    <path d="M 80,73 L 80,79 M 88,73 L 88,79 M 96,73 L 96,79 M 104,73 L 104,79 M 112,73 L 112,79 M 120,73 L 120,79" stroke-width="0.9"/>
    <path d="M 36,22 L 36,126 M 164,22 L 164,126" stroke-width="1.2"/>
    <path d="M 32,26 C 34,24 38,24 40,26 M 160,26 C 162,24 166,24 168,26" stroke-width="1"/>
    <path d="M 42,28 L 60,28 L 60,50 L 42,50 Z M 140,28 L 158,28 L 158,50 L 140,50 Z" stroke-width="0.9"/>
    <path d="M 51,28 L 51,50 M 42,39 L 60,39" stroke-width="0.5"/>
    <path d="M 149,28 L 149,50 M 140,39 L 158,39" stroke-width="0.5"/>
    <path d="M 82,126 L 82,90 L 100,90 L 100,126 M 100,90 L 118,90 L 118,126" stroke-width="1"/>
    <path d="M 40,58 L 58,58 L 58,78 L 40,78 Z M 142,58 L 160,58 L 160,78 L 142,78 Z" stroke-width="0.8"/>
  </svg>`,

  // 11272 Santa Monica Blvd, West LA — Built 1929, remodeled 2006. Classic rectangular
  // theater facade with a prominent vertical neon marquee sign and horizontal projecting
  // canopy. Art Deco pilaster details.
  "Landmark Nuart Theatre": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 20,126 C 60,127 140,127 180,126" stroke-width="1.5"/>
    <path d="M 38,126 L 38,18 L 162,18 L 162,126" stroke-width="2"/>
    <path d="M 38,18 L 38,12 L 56,12 L 56,16 L 72,16 L 72,8 L 128,8 L 128,16 L 144,16 L 144,12 L 162,12 L 162,18" stroke-width="1.8"/>
    <path d="M 92,8 L 100,2 L 108,8" stroke-width="1.2"/>
    <path d="M 38,26 L 162,26" stroke-width="1"/>
    <path d="M 88,26 L 88,70 L 112,70 L 112,26" stroke-width="1.5"/>
    <path d="M 92,30 L 108,30 M 92,38 L 108,38 M 92,46 L 108,46 M 92,54 L 108,54 M 92,62 L 108,62" stroke-width="1.8"/>
    <path d="M 44,26 L 44,126" stroke-width="1.2"/>
    <path d="M 156,26 L 156,126" stroke-width="1.2"/>
    <path d="M 47,30 L 47,122 M 50,30 L 50,122 M 53,30 L 53,122" stroke-width="0.4"/>
    <path d="M 147,30 L 147,122 M 150,30 L 150,122 M 153,30 L 153,122" stroke-width="0.4"/>
    <path d="M 42,80 L 42,70 L 158,70 L 158,80" stroke-width="1.5"/>
    <path d="M 50,73 L 50,77 M 59,73 L 59,77 M 68,73 L 68,77 M 77,73 L 77,77 M 86,73 L 86,77 M 114,73 L 114,77 M 123,73 L 123,77 M 132,73 L 132,77 M 141,73 L 141,77 M 150,73 L 150,77" stroke-width="1"/>
    <circle cx="54" cy="80" r="1.2" fill="currentColor"/>
    <circle cx="66" cy="80" r="1.2" fill="currentColor"/>
    <circle cx="78" cy="80" r="1.2" fill="currentColor"/>
    <circle cx="90" cy="80" r="1.2" fill="currentColor"/>
    <circle cx="110" cy="80" r="1.2" fill="currentColor"/>
    <circle cx="122" cy="80" r="1.2" fill="currentColor"/>
    <circle cx="134" cy="80" r="1.2" fill="currentColor"/>
    <circle cx="146" cy="80" r="1.2" fill="currentColor"/>
    <path d="M 60,126 L 60,84 L 84,84 L 84,126 M 116,84 L 140,84 L 140,126" stroke-width="1"/>
    <path d="M 88,126 L 88,84 L 112,84 L 112,126" stroke-width="1.2"/>
    <path d="M 100,126 L 100,84" stroke-width="0.9"/>
  </svg>`,

  // 4473 Sunset Drive, Los Feliz — Opened October 16, 1923. Spanish Revival exterior:
  // 3-story yellow-buff brick facade, central V-shaped marquee, basket-weave brick panels
  // flanking the entrance, square-head 2nd-floor windows, round-arched 3rd-floor windows,
  // classical cornice arching above center. Tarantino restored 35mm/70mm projection 2023.
  "Vista Theatre": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 18,126 C 60,127 140,127 182,126" stroke-width="1.5"/>
    <path d="M 32,126 L 32,16 L 168,16 L 168,126" stroke-width="2"/>
    <path d="M 32,16 C 50,10 80,6 100,6 C 120,6 150,10 168,16" stroke-width="1.8"/>
    <path d="M 32,20 C 50,14 80,11 100,11 C 120,11 150,14 168,20" stroke-width="0.8"/>
    <path d="M 32,72 L 168,72" stroke-width="1.2"/>
    <path d="M 32,46 L 168,46" stroke-width="1"/>
    <path d="M 44,22 L 44,44 C 44,44 44,30 52,26 C 60,22 68,26 68,32 L 68,44" stroke-width="1"/>
    <path d="M 44,44 L 68,44" stroke-width="1"/>
    <path d="M 84,22 L 84,44 C 84,44 84,30 92,26 C 100,22 108,26 108,32 L 108,44" stroke-width="1"/>
    <path d="M 84,44 L 108,44" stroke-width="1"/>
    <path d="M 132,22 L 132,44 C 132,44 132,30 140,26 C 148,22 156,26 156,32 L 156,44" stroke-width="1"/>
    <path d="M 132,44 L 156,44" stroke-width="1"/>
    <path d="M 54,22 L 56,20 L 58,22" stroke-width="0.8"/>
    <path d="M 94,22 L 96,20 L 98,22" stroke-width="0.8"/>
    <path d="M 140,22 L 142,20 L 144,22" stroke-width="0.8"/>
    <path d="M 40,52 L 40,68 L 68,68 L 68,52 Z" stroke-width="1"/>
    <path d="M 54,52 L 54,68 M 40,60 L 68,60" stroke-width="0.5"/>
    <path d="M 132,52 L 132,68 L 160,68 L 160,52 Z" stroke-width="1"/>
    <path d="M 146,52 L 146,68 M 132,60 L 160,60" stroke-width="0.5"/>
    <path d="M 76,72 L 58,86 L 58,100 L 142,100 L 142,86 L 124,72 Z" stroke-width="1.8"/>
    <path d="M 76,72 L 100,80 L 124,72" stroke-width="1.2"/>
    <path d="M 66,88 L 66,96 M 76,88 L 76,96 M 86,88 L 86,96 M 96,88 L 96,96 M 106,88 L 106,96 M 116,88 L 116,96 M 126,88 L 126,96 M 136,88 L 136,96" stroke-width="0.9"/>
    <path d="M 38,106 L 72,106 L 72,126 L 38,126 Z" stroke-width="0.8"/>
    <path d="M 40,108 L 54,122 M 44,108 L 58,122 M 48,108 L 62,122 M 52,108 L 66,122 M 56,108 L 70,124 M 60,108 L 72,120" stroke-width="0.5"/>
    <path d="M 128,106 L 162,106 L 162,126 L 128,126 Z" stroke-width="0.8"/>
    <path d="M 130,108 L 144,122 M 134,108 L 148,122 M 138,108 L 152,122 M 142,108 L 156,122 M 146,108 L 160,122 M 150,108 L 162,118" stroke-width="0.5"/>
    <path d="M 80,126 L 80,104 L 120,104 L 120,126" stroke-width="1.2"/>
    <path d="M 100,126 L 100,104" stroke-width="1"/>
  </svg>`,

  // 10899 Wilshire Blvd, Westwood (inside the Hammer Museum) — The Hammer Museum
  // building (1990, Edward Larrabee Barnes) has an austere pale limestone facade with
  // a rhythmic grid of small windows and a large rectangular entrance portal on Wilshire.
  "Billy Wilder Theatre": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 16,126 C 60,127 140,127 184,126" stroke-width="1.5"/>
    <path d="M 24,126 L 24,20 L 176,20 L 176,126" stroke-width="2"/>
    <path d="M 24,20 L 24,14 L 176,14 L 176,20" stroke-width="1.2"/>
    <path d="M 32,26 L 46,26 L 46,36 L 32,36 Z M 52,26 L 66,26 L 66,36 L 52,36 Z M 72,26 L 86,26 L 86,36 L 72,36 Z M 92,26 L 106,26 L 106,36 L 92,36 Z M 112,26 L 126,26 L 126,36 L 112,36 Z M 132,26 L 146,26 L 146,36 L 132,36 Z M 152,26 L 166,26 L 166,36 L 152,36 Z" stroke-width="0.9"/>
    <path d="M 32,42 L 46,42 L 46,52 L 32,52 Z M 52,42 L 66,42 L 66,52 L 52,52 Z M 72,42 L 86,42 L 86,52 L 72,52 Z M 92,42 L 106,42 L 106,52 L 92,52 Z M 112,42 L 126,42 L 126,52 L 112,52 Z M 132,42 L 146,42 L 146,52 L 132,52 Z M 152,42 L 166,42 L 166,52 L 152,52 Z" stroke-width="0.9"/>
    <path d="M 32,58 L 46,58 L 46,68 L 32,68 Z M 52,58 L 66,58 L 66,68 L 52,68 Z M 72,58 L 86,58 L 86,68 L 72,68 Z M 92,58 L 106,58 L 106,68 L 92,68 Z M 112,58 L 126,58 L 126,68 L 112,68 Z M 132,58 L 146,58 L 146,68 L 132,68 Z M 152,58 L 166,58 L 166,68 L 152,68 Z" stroke-width="0.9"/>
    <path d="M 24,74 L 176,74 M 24,86 L 176,86" stroke-width="1"/>
    <path d="M 24,74 L 24,86 L 176,86 L 176,74 Z" fill="currentColor" fill-opacity="0.06" stroke-width="0"/>
    <path d="M 68,126 L 68,92 L 132,92 L 132,126" stroke-width="1.5"/>
    <path d="M 68,92 L 68,86 L 132,86 L 132,92" stroke-width="1"/>
    <path d="M 80,126 L 80,96 L 100,96 L 100,126 M 100,96 L 120,96 L 120,126" stroke-width="1"/>
    <path d="M 86,110 L 90,110 M 110,110 L 114,110" stroke-width="1"/>
  </svg>`,

  // 1251 W Redondo Beach Blvd, Gardena — Opened 1946 as a single-screen neighborhood
  // theater, 800 seats on Crenshaw Blvd. Mid-century facade with classic horizontal
  // marquee canopy, perpendicular blade sign, and the characteristic clean lines of
  // postwar Southern California cinema architecture.
  "Gardena Cinema": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 18,126 C 60,127 140,127 182,126" stroke-width="1.5"/>
    <path d="M 34,126 L 34,22 L 166,22 L 166,126" stroke-width="2"/>
    <path d="M 34,22 L 34,14 L 166,14 L 166,22" stroke-width="1.2"/>
    <path d="M 34,30 L 166,30" stroke-width="1"/>
    <path d="M 100,17 L 97,14 M 100,17 L 103,14 M 100,17 L 96,15 M 100,17 L 104,15 M 100,17 L 95,17 M 100,17 L 105,17" stroke-width="0.8"/>
    <path d="M 34,56 L 34,44 L 166,44 L 166,56" stroke-width="1.5"/>
    <circle cx="50" cy="56" r="1.5" fill="currentColor"/>
    <circle cx="66" cy="56" r="1.5" fill="currentColor"/>
    <circle cx="82" cy="56" r="1.5" fill="currentColor"/>
    <circle cx="98" cy="56" r="1.5" fill="currentColor"/>
    <circle cx="114" cy="56" r="1.5" fill="currentColor"/>
    <circle cx="130" cy="56" r="1.5" fill="currentColor"/>
    <circle cx="146" cy="56" r="1.5" fill="currentColor"/>
    <circle cx="162" cy="56" r="1.5" fill="currentColor"/>
    <path d="M 44,47 L 44,53 M 54,47 L 54,53 M 64,47 L 64,53 M 74,47 L 74,53 M 84,47 L 84,53 M 94,47 L 94,53 M 106,47 L 106,53 M 116,47 L 116,53 M 126,47 L 126,53 M 136,47 L 136,53 M 146,47 L 146,53 M 156,47 L 156,53" stroke-width="0.9"/>
    <path d="M 96,14 L 96,44 L 104,44 L 104,14 Z" stroke-width="1.2"/>
    <path d="M 98,18 L 98,40 M 102,18 L 102,40" stroke-width="0.5"/>
    <path d="M 42,32 L 86,32 L 86,42 L 42,42 Z M 114,32 L 158,32 L 158,42 L 114,42 Z" stroke-width="0.9"/>
    <path d="M 60,126 L 60,60 L 140,60 L 140,126" stroke-width="1"/>
    <path d="M 80,60 L 80,126 M 120,60 L 120,126" stroke-width="0.8"/>
    <path d="M 100,126 L 100,60" stroke-width="0.8"/>
    <path d="M 40,60 L 56,60 L 56,120 L 40,120 Z M 144,60 L 144,120 L 160,120 L 160,60 Z" stroke-width="0.8"/>
  </svg>`,

  // 4884 Eagle Rock Blvd, Eagle Rock — The Eagle Theatre (1929), Spanish Colonial Revival
  // with ornate stucco facade, arched main entrance portal, classical ornamental details,
  // and a projecting marquee. Vidiots Foundation reopened it in 2022 combining a cinema
  // with a 50,000-title physical-media lending library.
  "Vidiots": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 16,126 C 60,127 140,127 184,126" stroke-width="1.5"/>
    <path d="M 28,126 L 28,20 L 172,20 L 172,126" stroke-width="2"/>
    <path d="M 28,20 L 28,12 L 52,12 L 52,8 C 52,8 60,4 70,6 L 80,10 L 80,14 L 88,14 L 88,6 C 88,6 96,0 100,0 C 104,0 112,0 112,6 L 112,14 L 120,14 L 120,10 L 130,6 C 140,4 148,8 148,8 L 148,12 L 172,12 L 172,20" stroke-width="1.8"/>
    <path d="M 36,10 C 38,8 42,8 44,10 C 46,12 44,14 42,14 C 40,14 38,12 40,10" stroke-width="0.8"/>
    <path d="M 156,10 C 158,8 162,8 164,10 C 166,12 164,14 162,14 C 160,14 158,12 160,10" stroke-width="0.8"/>
    <path d="M 28,28 L 172,28" stroke-width="1"/>
    <path d="M 62,126 C 62,120 58,104 56,88 C 54,70 60,52 100,48 C 140,52 146,70 144,88 C 142,104 138,120 138,126" stroke-width="1.5"/>
    <path d="M 70,126 C 70,118 66,104 64,90 C 62,74 68,58 100,56 C 132,58 138,74 136,90 C 134,104 130,118 130,126" stroke-width="1"/>
    <path d="M 95,48 L 100,42 L 105,48" stroke-width="1.2"/>
    <path d="M 97,44 L 97,50 M 103,44 L 103,50" stroke-width="0.7"/>
    <circle cx="52" cy="56" r="5" stroke-width="0.8"/>
    <circle cx="52" cy="56" r="2" stroke-width="0.8"/>
    <circle cx="148" cy="56" r="5" stroke-width="0.8"/>
    <circle cx="148" cy="56" r="2" stroke-width="0.8"/>
    <path d="M 68,88 L 68,76 L 132,76 L 132,88" stroke-width="1.3"/>
    <path d="M 76,79 L 76,85 M 84,79 L 84,85 M 92,79 L 92,85 M 100,79 L 100,85 M 108,79 L 108,85 M 116,79 L 116,85 M 124,79 L 124,85" stroke-width="0.9"/>
    <path d="M 80,126 L 80,92 L 100,92 L 100,126 M 100,92 L 120,92 L 120,126" stroke-width="1.1"/>
    <path d="M 34,34 L 52,34 L 52,56 L 34,56 Z M 148,34 L 166,34 L 166,56 L 148,56 Z" stroke-width="0.9"/>
    <path d="M 43,34 L 43,56 M 34,45 L 52,45" stroke-width="0.5"/>
    <path d="M 157,34 L 157,56 M 148,45 L 166,45" stroke-width="0.5"/>
    <path d="M 34,62 L 52,62 L 52,82 L 34,82 Z M 148,62 L 166,62 L 166,82 L 148,82 Z" stroke-width="0.8"/>
  </svg>`,

  // 140 Richmond St, El Segundo — Opened 1921 in a repurposed neighborhood commercial
  // building. Simple 2-story brick storefront with a small projecting marquee. Programs
  // silent films with live accompaniment on its 1925 Robert Morton Mighty Wurlitzer organ.
  "Old Town Music Hall": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 24,126 C 60,127 140,127 176,126" stroke-width="1.5"/>
    <path d="M 44,126 L 44,16 L 156,16 L 156,126" stroke-width="2"/>
    <path d="M 44,16 L 44,8 L 156,8 L 156,16" stroke-width="1.5"/>
    <path d="M 48,8 L 48,16 M 56,8 L 56,16 M 64,8 L 64,16 M 72,8 L 72,16 M 80,8 L 80,16 M 88,8 L 88,16 M 96,8 L 96,16 M 104,8 L 104,16 M 112,8 L 112,16 M 120,8 L 120,16 M 128,8 L 128,16 M 136,8 L 136,16 M 144,8 L 144,16 M 152,8 L 152,16" stroke-width="0.6"/>
    <path d="M 44,40 L 156,40 M 44,56 L 156,56 M 44,72 L 156,72" stroke-width="0.4"/>
    <path d="M 52,22 L 52,52 L 72,52 L 72,22 Z" stroke-width="1"/>
    <path d="M 62,22 L 62,52 M 52,37 L 72,37" stroke-width="0.5"/>
    <path d="M 90,22 L 90,52 L 110,52 L 110,22 Z" stroke-width="1"/>
    <path d="M 100,22 L 100,52 M 90,37 L 110,37" stroke-width="0.5"/>
    <path d="M 128,22 L 128,52 L 148,52 L 148,22 Z" stroke-width="1"/>
    <path d="M 138,22 L 138,52 M 128,37 L 148,37" stroke-width="0.5"/>
    <path d="M 52,72 L 52,62 L 148,62 L 148,72" stroke-width="1.5"/>
    <path d="M 60,65 L 60,69 M 68,65 L 68,69 M 76,65 L 76,69 M 84,65 L 84,69 M 92,65 L 92,69 M 100,65 L 100,69 M 108,65 L 108,69 M 116,65 L 116,69 M 124,65 L 124,69 M 132,65 L 132,69 M 140,65 L 140,69" stroke-width="0.9"/>
    <path d="M 58,72 L 58,126 M 142,72 L 142,126" stroke-width="0.8"/>
    <path d="M 76,126 L 76,76 L 100,76 L 100,126 M 100,76 L 124,76 L 124,126" stroke-width="1.1"/>
    <path d="M 82,100 L 82,104 M 118,100 L 118,104" stroke-width="1"/>
    <path d="M 50,76 L 72,76 L 72,118 L 50,118 Z M 128,76 L 128,118 L 150,118 L 150,76 Z" stroke-width="0.9"/>
    <path d="M 93,58 C 93,56 96,55 97,57 C 97,59 96,60 94,60 C 92,60 91,58 92,57" stroke-width="0.8"/>
    <path d="M 97,57 L 97,52 L 101,51 L 101,53" stroke-width="0.8"/>
    <path d="M 103,58 C 103,56 106,55 107,57 C 107,59 106,60 104,60 C 102,60 101,58 102,57" stroke-width="0.8"/>
    <path d="M 107,57 L 107,52" stroke-width="0.8"/>
  </svg>`,

  // 595 S Grand Ave (The Bloc), Downtown LA — Opened July 2019 on top floors of The Bloc,
  // a glass-and-steel open-air shopping complex at 7th & Figueroa. The Alamo occupies the
  // upper levels with cinema-logo neon signage and the chain's signature bat-wing logo.
  "Alamo Drafthouse DTLA": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M 14,126 C 60,127 140,127 186,126" stroke-width="1.5"/>
    <path d="M 34,126 L 34,10 L 116,10 L 116,126" stroke-width="2"/>
    <path d="M 50,10 L 50,126 M 66,10 L 66,126 M 82,10 L 82,126 M 98,10 L 98,126" stroke-width="0.8"/>
    <path d="M 34,30 L 116,30 M 34,50 L 116,50 M 34,70 L 116,70 M 34,90 L 116,90 M 34,110 L 116,110" stroke-width="0.6"/>
    <path d="M 36,12 L 48,28 M 52,12 L 64,28 M 68,12 L 80,28 M 84,12 L 96,28 M 100,12 L 112,28" stroke-width="0.3" stroke-opacity="0.5"/>
    <path d="M 116,126 L 116,62 L 176,62 L 176,126" stroke-width="1.8"/>
    <path d="M 132,62 L 132,126 M 148,62 L 148,126 M 164,62 L 164,126" stroke-width="0.7"/>
    <path d="M 116,80 L 176,80 M 116,100 L 176,100" stroke-width="0.5"/>
    <path d="M 34,52 L 116,52 L 116,68 L 34,68 Z" fill="currentColor" fill-opacity="0.08" stroke-width="1"/>
    <path d="M 56,58 C 56,56 60,54 64,56 C 66,57 68,60 68,60 C 68,60 70,57 72,56 C 76,54 80,56 80,58 C 80,60 78,62 74,62 C 72,62 70,61 68,60 C 66,61 64,62 62,62 C 58,62 56,60 56,58 Z" stroke-width="1"/>
    <path d="M 116,70 L 176,70" stroke-width="2.5" stroke-opacity="0.6"/>
    <path d="M 40,126 L 40,112 L 110,112 L 110,126" stroke-width="1.2"/>
    <path d="M 40,112 L 36,104 L 114,104 L 110,112" stroke-width="1"/>
    <path d="M 56,126 L 56,116 L 76,116 L 76,126 M 84,116 L 84,126 L 104,126 L 104,116" stroke-width="1"/>
  </svg>`,

};
