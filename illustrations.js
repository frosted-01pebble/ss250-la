const THEATER_ILLUSTRATIONS = {

"Brain Dead Studios": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- facade outline -->
  <path d="M30 140 C30 130 29.5 70 30 42"/>
  <path d="M170 140 C170 130 170.5 70 170 42"/>
  <path d="M30 42 C65 41.5 135 42 170 41.5"/>
  <!-- recessed storefront step -->
  <path d="M42 140 C42 125 42 110 42 100"/>
  <path d="M158 140 C158 125 158 110 158 100"/>
  <path d="M42 100 C70 99.5 130 100 158 99.5"/>
  <!-- awning / marquee canopy -->
  <path d="M26 80 C60 79 140 80 174 79.5"/>
  <path d="M30 80 C30 78 30 68 30 66"/>
  <path d="M170 80 C170 78 170.5 68 170 66"/>
  <path d="M30 66 C65 65.5 135 66 170 65.5"/>
  <!-- drip edge on awning -->
  <path d="M26 80 C50 82 80 83 100 82.5 C120 82 150 81 174 79.5" stroke-width="1"/>
  <!-- upper sign band with text -->
  <path d="M30 54 C65 53.5 135 54 170 53.5" stroke-width="1"/>
  <text x="100" y="62" font-family="'Courier New',monospace" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="1.5">BRAIN DEAD STUDIOS</text>
  <!-- large windows left -->
  <path d="M45 100 C45 99 45 88 45.5 87"/>
  <path d="M80 100 C80 99 80 88 80.5 87"/>
  <path d="M45 87 C55 86.5 70 87 80 87"/>
  <path d="M45 100 C55 99.5 70 100 80 100" stroke-width="1"/>
  <!-- window divider left -->
  <path d="M62 100 L62 87" stroke-width="1"/>
  <!-- large windows right -->
  <path d="M120 100 C120 99 120 88 120.5 87"/>
  <path d="M155 100 C155 99 155 88 155.5 87"/>
  <path d="M120 87 C130 86.5 145 87 155 87"/>
  <path d="M120 100 C130 99.5 145 100 155 100" stroke-width="1"/>
  <path d="M138 100 L138 87" stroke-width="1"/>
  <!-- entrance door center -->
  <path d="M90 140 L90 107"/>
  <path d="M110 140 L110 107"/>
  <path d="M90 107 C95 104 105 104 110 107"/>
  <!-- door handle -->
  <path d="M95 122 L105 122" stroke-width="1"/>
  <!-- upper floor windows -->
  <path d="M50 58 L50 46 L70 46 L70 58" stroke-width="1"/>
  <path d="M130 58 L130 46 L150 46 L150 58" stroke-width="1"/>
</svg>`,

"Academy Museum": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- historic Saban building (left) -->
  <path d="M10 140 C10 130 10 80 10.5 45"/>
  <path d="M78 140 C78 130 78 80 78 45"/>
  <path d="M10.5 45 C30 44.5 58 45 78 44.5"/>
  <!-- Saban corner curve (Art Deco rounded corner) -->
  <path d="M78 44.5 C78 44.5 82 44 84 48"/>
  <!-- horizontal course lines on Saban -->
  <path d="M10 90 C30 89.5 55 90 78 89.5" stroke-width="1"/>
  <path d="M10 70 C30 69.5 55 70 78 69.5" stroke-width="1"/>
  <path d="M10 55 C30 54.5 55 55 78 54.5" stroke-width="1"/>
  <!-- Saban windows -->
  <path d="M18 85 L18 72 L28 72 L28 85" stroke-width="1"/>
  <path d="M35 85 L35 72 L45 72 L45 85" stroke-width="1"/>
  <path d="M55 85 L55 72 L68 72 L68 85" stroke-width="1"/>
  <path d="M18 65 L18 58 L28 58 L28 65" stroke-width="1"/>
  <path d="M38 65 L38 58 L50 58 L50 65" stroke-width="1"/>
  <path d="M58 65 L58 58 L70 58 L70 65" stroke-width="1"/>
  <!-- Saban entry -->
  <path d="M35 140 L35 115 C35 112 38 110 44 110 C50 110 53 112 53 115 L53 140"/>
  <!-- the Sphere (Renzo Piano) — slightly imperfect circle -->
  <path d="M140 45 C163 44 185 65 185 90 C185 115 163 135 140 135 C117 135 95 115 95 90 C95 65 117 46 140 45 Z"/>
  <!-- sphere glass panel grid lines (curved to follow sphere) -->
  <path d="M110 90 C120 75 140 70 165 77" stroke-width="0.8"/>
  <path d="M105 105 C118 88 140 82 168 92" stroke-width="0.8"/>
  <path d="M115 118 C128 102 145 97 166 105" stroke-width="0.8"/>
  <path d="M123 72 C125 90 125 110 122 125" stroke-width="0.8"/>
  <path d="M140 66 C140 90 140 112 140 133" stroke-width="0.8"/>
  <path d="M157 68 C157 90 156 112 155 128" stroke-width="0.8"/>
  <!-- bridge connecting sphere to building -->
  <path d="M78 80 C88 79 92 80 98 83"/>
  <path d="M78 100 C88 99 92 100 98 100"/>
  <!-- "ACADEMY MUSEUM" small sign -->
  <text x="44" y="105" font-family="'Courier New',monospace" font-size="5.5" text-anchor="middle" fill="currentColor" stroke="none">ACADEMY</text>
  <text x="44" y="111" font-family="'Courier New',monospace" font-size="5.5" text-anchor="middle" fill="currentColor" stroke="none">MUSEUM</text>
</svg>`,

"New Beverly Cinema": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- main facade -->
  <path d="M48 140 C48 130 47.5 65 48 38"/>
  <path d="M152 140 C152 130 152.5 65 152 38"/>
  <path d="M48 38 C80 37.5 120 38 152 37.5"/>
  <!-- marquee projecting out -->
  <path d="M40 95 C70 94.5 130 95 160 94.5"/>
  <path d="M40 95 C40 94 40.5 78 40 76"/>
  <path d="M160 95 C160 94 160.5 78 160 76"/>
  <path d="M40 76 C70 75.5 130 76 160 75.5"/>
  <!-- marquee underside shadow line -->
  <path d="M40 95 C70 96.5 130 96 160 94.5" stroke-width="1"/>
  <!-- marquee text -->
  <text x="100" y="89" font-family="'Courier New',monospace" font-size="9" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="1">NEW BEVERLY</text>
  <!-- sign band above marquee -->
  <path d="M48 65 C80 64.5 120 65 152 64.5" stroke-width="1"/>
  <path d="M48 55 C80 54.5 120 55 152 54.5" stroke-width="1"/>
  <text x="100" y="62" font-family="'Courier New',monospace" font-size="6" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="2">CINEMA</text>
  <!-- brick texture hints (horizontal lines) -->
  <path d="M48 130 C80 129.5 120 130 152 129.5" stroke-width="0.8"/>
  <path d="M48 120 C80 119.5 120 120 152 119.5" stroke-width="0.8"/>
  <path d="M48 110 C80 109.5 120 110 152 109.5" stroke-width="0.8"/>
  <!-- three entrance doors -->
  <path d="M60 140 L60 110 L76 110 L76 140"/>
  <path d="M68 110 L68 140" stroke-width="1"/>
  <path d="M90 140 L90 110 L106 110 L106 140"/>
  <path d="M98 110 L98 140" stroke-width="1"/>
  <path d="M120 140 L120 110 L136 110 L136 140"/>
  <path d="M128 110 L128 140" stroke-width="1"/>
  <!-- upper windows -->
  <path d="M58 70 L58 57 L74 57 L74 70" stroke-width="1"/>
  <path d="M90 70 L90 57 L110 57 L110 70" stroke-width="1"/>
  <path d="M126 70 L126 57 L142 57 L142 70" stroke-width="1"/>
  <!-- poster frames flanking -->
  <path d="M 148 135 L148 100 L160 100 L160 135" stroke-width="1"/>
  <path d="M 40 135 L40 100 L52 100 L52 135" stroke-width="1"/>
</svg>`,

"Egyptian Theatre": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- left wing wall -->
  <path d="M8 140 C8 120 8 70 8.5 32"/>
  <path d="M52 140 C52.5 118 52 72 52 55"/>
  <path d="M8.5 32 C22 31.5 38 32 52 31.5"/>
  <!-- right wing wall -->
  <path d="M148 140 C148.5 118 148 72 148 55"/>
  <path d="M192 140 C192 120 191.5 70 192 32"/>
  <path d="M148 31.5 C162 32 178 31.5 192 32"/>
  <!-- Egyptian cornice (top band) -->
  <path d="M8 40 C40 39.5 80 40.5 192 40"/>
  <path d="M8 46 C40 45.5 80 46.5 192 46"/>
  <!-- hieroglyphic band (small vertical marks) -->
  <path d="M14 36 L14 41" stroke-width="0.8"/><path d="M19 36 L19 40" stroke-width="0.8"/><path d="M24 37 L24 41" stroke-width="0.8"/><path d="M29 36 L29 40" stroke-width="0.8"/><path d="M34 37 L34 41" stroke-width="0.8"/><path d="M39 36 L39 40" stroke-width="0.8"/><path d="M44 37 L44 41" stroke-width="0.8"/>
  <path d="M155 36 L155 41" stroke-width="0.8"/><path d="M160 37 L160 40" stroke-width="0.8"/><path d="M165 36 L165 41" stroke-width="0.8"/><path d="M170 37 L170 40" stroke-width="0.8"/><path d="M175 36 L175 41" stroke-width="0.8"/><path d="M180 37 L180 40" stroke-width="0.8"/><path d="M185 36 L185 41" stroke-width="0.8"/>
  <!-- left papyrus columns -->
  <path d="M20 140 C20 120 20.5 85 20 72"/>
  <path d="M16 72 C18 67 22 67 24 72"/>
  <path d="M36 140 C36 120 36.5 85 36 72"/>
  <path d="M32 72 C34 67 38 67 40 72"/>
  <!-- right papyrus columns -->
  <path d="M164 140 C164 120 164.5 85 164 72"/>
  <path d="M160 72 C162 67 166 67 168 72"/>
  <path d="M180 140 C180 120 180.5 85 180 72"/>
  <path d="M176 72 C178 67 182 67 184 72"/>
  <!-- centre entrance lintel -->
  <path d="M52 55 C80 54.5 120 55 148 54.5"/>
  <!-- winged disc above entrance -->
  <path d="M85 50 C88 46 96 44 100 44 C104 44 112 46 115 50" stroke-width="1"/>
  <path d="M85 50 C75 47 66 50 65 50" stroke-width="1"/>
  <path d="M115 50 C125 47 134 50 135 50" stroke-width="1"/>
  <!-- EGYPTIAN sign -->
  <text x="100" y="70" font-family="'Courier New',monospace" font-size="8.5" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="2">EGYPTIAN</text>
  <!-- entrance arch -->
  <path d="M68 140 C68 130 68 118 68 110 C68 102 74 96 78 95"/>
  <path d="M132 140 C132 130 132 118 132 110 C132 102 126 96 122 95"/>
  <path d="M78 95 C88 90 112 90 122 95"/>
  <!-- doors -->
  <path d="M76 140 L76 110"/><path d="M90 140 L90 110"/><path d="M76 110 L90 110" stroke-width="1"/>
  <path d="M110 140 L110 110"/><path d="M124 140 L124 110"/><path d="M110 110 L124 110" stroke-width="1"/>
</svg>`,

"Aero Theatre": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- wide low streamline moderne facade -->
  <path d="M12 140 C12 128 12 95 12.5 72"/>
  <path d="M188 140 C188 128 187.5 95 188 72"/>
  <path d="M12.5 72 C60 71.5 140 72 188 71.5"/>
  <!-- horizontal band lines — streamline moderne signature -->
  <path d="M12 82 C60 81.5 140 82 188 81.5" stroke-width="1"/>
  <path d="M12 90 C60 89.5 140 90 188 89.5" stroke-width="1"/>
  <path d="M12 98 C60 97.5 140 98 188 97.5" stroke-width="1"/>
  <path d="M12 106 C60 105.5 140 106 188 105.5" stroke-width="1"/>
  <!-- rounded right corner (streamline) -->
  <path d="M182 72 C186 72 188 74 188 78"/>
  <path d="M182 140 C186 140 188 138 188 134"/>
  <!-- large AERO lettering -->
  <text x="100" y="67" font-family="'Courier New',monospace" font-size="12" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="6" font-weight="bold">AERO</text>
  <!-- sign band top -->
  <path d="M12.5 58 C60 57.5 140 58 188 57.5"/>
  <!-- marquee canopy (left corner projection) -->
  <path d="M12 82 C12 82 8 82 6 84"/>
  <path d="M12 106 C12 106 8 106 6 104"/>
  <path d="M6 84 C5.5 90 5.5 100 6 104"/>
  <!-- entrance double doors (center) -->
  <path d="M82 140 L82 112"/>
  <path d="M118 140 L118 112"/>
  <path d="M82 112 C86 108 114 108 118 112"/>
  <path d="M100 140 L100 112" stroke-width="1"/>
  <!-- flanking windows left -->
  <path d="M20 115 L20 100 L38 100 L38 115" stroke-width="1"/>
  <path d="M44 115 L44 100 L62 100 L62 115" stroke-width="1"/>
  <!-- flanking windows right -->
  <path d="M138 115 L138 100 L156 100 L156 115" stroke-width="1"/>
  <path d="M162 115 L162 100 L180 100 L180 115" stroke-width="1"/>
  <!-- speed lines (streamline detail) -->
  <path d="M14 78 C50 77.5 100 78 186 77.5" stroke-width="0.8"/>
</svg>`,

"Los Feliz 3": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- facade -->
  <path d="M22 140 C22 128 22 80 22.5 42"/>
  <path d="M178 140 C178 128 177.5 80 178 42"/>
  <path d="M22.5 42 C70 41.5 130 42 178 41.5"/>
  <!-- sign band top -->
  <path d="M22 55 C70 54.5 130 55 178 54.5" stroke-width="1"/>
  <text x="100" y="51" font-family="'Courier New',monospace" font-size="8" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="2">LOS FELIZ</text>
  <!-- marquee -->
  <path d="M18 78 C60 77.5 140 78 182 77.5"/>
  <path d="M22 78 C22 77 22 65 22 63"/>
  <path d="M178 78 C178 77 178 65 178 63"/>
  <path d="M22 63 C60 62.5 140 63 178 62.5"/>
  <path d="M18 78 C60 79.5 140 79 182 77.5" stroke-width="1"/>
  <!-- vertical dividers on marquee (3 screens) -->
  <path d="M74 78 L74 63" stroke-width="1"/>
  <path d="M126 78 L126 63" stroke-width="1"/>
  <!-- three entrance areas -->
  <!-- left screen entrance -->
  <path d="M30 140 L30 108"/><path d="M60 140 L60 108"/>
  <path d="M30 108 C35 104 55 104 60 108"/>
  <path d="M45 140 L45 108" stroke-width="1"/>
  <!-- center screen entrance -->
  <path d="M84 140 L84 108"/><path d="M116 140 L116 108"/>
  <path d="M84 108 C89 104 111 104 116 108"/>
  <path d="M100 140 L100 108" stroke-width="1"/>
  <!-- right screen entrance -->
  <path d="M140 140 L140 108"/><path d="M170 140 L170 108"/>
  <path d="M140 108 C145 104 165 104 170 108"/>
  <path d="M155 140 L155 108" stroke-width="1"/>
  <!-- three poster frames at base -->
  <path d="M26 105 L26 82 L56 82 L56 105" stroke-width="1"/>
  <path d="M80 105 L80 82 L120 82 L120 105" stroke-width="1"/>
  <path d="M144 105 L144 82 L174 82 L174 105" stroke-width="1"/>
  <!-- upper windows -->
  <path d="M34 59 L34 46 L50 46 L50 59" stroke-width="1"/>
  <path d="M88 59 L88 46 L112 46 L112 59" stroke-width="1"/>
  <path d="M150 59 L150 46 L166 46 L166 59" stroke-width="1"/>
</svg>`,

"Landmark Nuart Theatre": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- main facade -->
  <path d="M40 140 C40 128 39.5 75 40 38"/>
  <path d="M160 140 C160 128 160.5 75 160 38"/>
  <path d="M40 38 C75 37.5 125 38 160 37.5"/>
  <!-- vertical blade sign on left edge -->
  <path d="M40 85 L28 85 L28 30 L40 30"/>
  <path d="M28 30 L40 30"/>
  <path d="M34 85 L34 30" stroke-width="0.8"/>
  <!-- NUART text on blade (rotated — approximate with stacked chars) -->
  <text x="34" y="80" font-family="'Courier New',monospace" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" writing-mode="tb" letter-spacing="2">NUART</text>
  <!-- marquee -->
  <path d="M38 80 C70 79.5 130 80 162 79.5"/>
  <path d="M40 80 C40 78 40 67 40.5 65"/>
  <path d="M160 80 C160 78 160 67 160.5 65"/>
  <path d="M40.5 65 C70 64.5 130 65 160.5 64.5"/>
  <!-- drip line -->
  <path d="M38 80 C70 81.5 130 81 162 79.5" stroke-width="1"/>
  <!-- NUART on marquee -->
  <text x="100" y="75" font-family="'Courier New',monospace" font-size="8" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="2">NUART</text>
  <!-- sign band -->
  <path d="M40 54 C70 53.5 130 54 160 53.5" stroke-width="1"/>
  <!-- entrance -->
  <path d="M76 140 L76 105"/>
  <path d="M124 140 L124 105"/>
  <path d="M76 105 C85 101 115 101 124 105"/>
  <path d="M100 140 L100 105" stroke-width="1"/>
  <!-- flanking poster frames -->
  <path d="M44 135 L44 98 L70 98 L70 135" stroke-width="1"/>
  <path d="M130 135 L130 98 L156 98 L156 135" stroke-width="1"/>
  <!-- upper windows -->
  <path d="M48 60 L48 46 L68 46 L68 60" stroke-width="1"/>
  <path d="M88 60 L88 46 L112 46 L112 60" stroke-width="1"/>
  <path d="M132 60 L132 46 L152 46 L152 60" stroke-width="1"/>
</svg>`,

"Vista Theatre": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- main facade -->
  <path d="M50 140 C50 128 49.5 80 50 42"/>
  <path d="M165 140 C165 128 165.5 80 165 42"/>
  <path d="M50 42 C90 41.5 130 42 165 41.5"/>
  <!-- ornate tower / upper section -->
  <path d="M70 42 C70 38 70 28 70.5 18"/>
  <path d="M130 42 C130 38 130 28 130.5 18"/>
  <path d="M70.5 18 C85 17.5 115 18 130.5 17.5"/>
  <!-- tower top ornament -->
  <path d="M85 18 C88 14 94 10 100 9 C106 10 112 14 115 18"/>
  <path d="M95 18 L95 10"/><path d="M100 18 L100 8"/><path d="M105 18 L105 10" stroke-width="1"/>
  <!-- decorative cornice band -->
  <path d="M50 50 C90 49.5 130 50 165 49.5"/>
  <path d="M70 42 C70 42 67 46 70 50"/>
  <path d="M130 42 C130 42 133 46 130 50"/>
  <!-- VISTA vertical blade sign left -->
  <path d="M50 100 L36 100 L36 30 L50 30"/>
  <path d="M36 30 L50 30"/>
  <text x="43" y="95" font-family="'Courier New',monospace" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" writing-mode="tb" letter-spacing="3">VISTA</text>
  <!-- decorative Spanish/Egyptian arch entrance -->
  <path d="M70 140 C70 130 70 115 70 108 C70 98 78 92 86 90"/>
  <path d="M140 140 C140 130 140 115 140 108 C140 98 132 92 124 90"/>
  <path d="M86 90 C90 86 110 86 124 90"/>
  <!-- entrance arch horseshoe detail -->
  <path d="M78 108 C80 102 96 98 108 100 C120 102 122 108 122 108" stroke-width="1"/>
  <!-- decorative tile band above arch -->
  <path d="M50 88 C90 87.5 130 88 165 87.5" stroke-width="1"/>
  <!-- sign band -->
  <path d="M50 62 C90 61.5 130 62 165 61.5" stroke-width="1"/>
  <text x="107" y="57" font-family="'Courier New',monospace" font-size="8" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="2">VISTA</text>
  <!-- ornate upper windows -->
  <path d="M56 82 L56 66 L70 66 L70 80 C70 82 64 84 62 82 C60 80 56 82 56 82" stroke-width="1"/>
  <path d="M130 80 C130 82 136 84 138 82 C140 80 144 82 144 82 L144 66 L130 66 L130 80" stroke-width="1"/>
  <!-- upper tower windows (arched) -->
  <path d="M80 38 L80 26 L92 26 L92 38 C92 38 88 35 86 35 C84 35 80 38 80 38" stroke-width="1"/>
  <path d="M108 38 L108 26 L120 26 L120 38 C120 38 116 35 114 35 C112 35 108 38 108 38" stroke-width="1"/>
  <!-- doors -->
  <path d="M82 140 L82 112"/><path d="M94 140 L94 112"/><path d="M82 112 L94 112" stroke-width="1"/>
  <path d="M106 140 L106 112"/><path d="M118 140 L118 112"/><path d="M106 112 L118 112" stroke-width="1"/>
</svg>`,

"Billy Wilder Theatre": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- main building mass (Hammer Museum) -->
  <path d="M18 140 C18 128 18 80 18.5 35"/>
  <path d="M182 140 C182 128 181.5 80 182 35"/>
  <path d="M18.5 35 C70 34.5 130 35 182 34.5"/>
  <!-- roofline parapet detail -->
  <path d="M18 38 C70 37.5 130 38 182 37.5"/>
  <!-- modern horizontal banding -->
  <path d="M18 80 C70 79.5 130 80 182 79.5" stroke-width="1"/>
  <path d="M18 95 C70 94.5 130 95 182 94.5" stroke-width="1"/>
  <!-- large punched windows grid (upper floor) -->
  <path d="M26 75 L26 44 L55 44 L55 75" stroke-width="1"/>
  <path d="M62 75 L62 44 L91 44 L91 75" stroke-width="1"/>
  <path d="M109 75 L109 44 L138 44 L138 75" stroke-width="1"/>
  <path d="M145 75 L145 44 L174 44 L174 75" stroke-width="1"/>
  <!-- projecting entry canopy (modernist) -->
  <path d="M60 107 C80 106.5 120 107 140 106.5"/>
  <path d="M60 107 L60 100"/>
  <path d="M140 107 L140 100"/>
  <path d="M60 100 C80 99.5 120 100 140 99.5"/>
  <!-- canopy soffit shadow -->
  <path d="M60 107 C80 108.5 120 108 140 106.5" stroke-width="1"/>
  <!-- entry signage -->
  <text x="100" y="97" font-family="'Courier New',monospace" font-size="5.5" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="1">BILLY WILDER THEATRE</text>
  <!-- below-canopy entry -->
  <path d="M80 140 L80 108"/>
  <path d="M120 140 L120 108"/>
  <path d="M100 140 L100 108" stroke-width="1"/>
  <!-- flanking lower windows -->
  <path d="M22 130 L22 112 L50 112 L50 130" stroke-width="1"/>
  <path d="M150 130 L150 112 L178 112 L178 130" stroke-width="1"/>
  <!-- UCLA / Hammer sign band -->
  <text x="100" y="91" font-family="'Courier New',monospace" font-size="5" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="1">UCLA FILM &amp; TELEVISION ARCHIVE</text>
</svg>`,

"Gardena Cinema": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- building -->
  <path d="M44 140 C44 128 43.5 78 44 44"/>
  <path d="M156 140 C156 128 156.5 78 156 44"/>
  <path d="M44 44 C80 43.5 120 44 156 43.5"/>
  <!-- vintage sign box at top -->
  <path d="M38 68 C70 67.5 130 68 162 67.5"/>
  <path d="M44 68 C44 67 44 54 44 52"/>
  <path d="M156 68 C156 67 156 54 156 52"/>
  <path d="M44 52 C70 51.5 130 52 156 51.5"/>
  <!-- rounded top on sign box -->
  <path d="M44 52 C50 46 60 44 70 44"/>
  <path d="M156 52 C150 46 140 44 130 44"/>
  <path d="M70 44 C85 42 115 42 130 44"/>
  <!-- sign text -->
  <text x="100" y="63" font-family="'Courier New',monospace" font-size="9" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="2">GARDENA</text>
  <!-- decorative stars on sign -->
  <text x="52" y="62" font-family="serif" font-size="8" fill="currentColor" stroke="none">★</text>
  <text x="140" y="62" font-family="serif" font-size="8" fill="currentColor" stroke="none">★</text>
  <!-- marquee -->
  <path d="M40 88 C70 87.5 130 88 160 87.5"/>
  <path d="M44 88 C44 87 44.5 76 44 74"/>
  <path d="M156 88 C156 87 156.5 76 156 74"/>
  <path d="M44 74 C70 73.5 130 74 156 73.5"/>
  <path d="M40 88 C70 89.5 130 89 160 87.5" stroke-width="1"/>
  <!-- horizontal brick courses -->
  <path d="M44 110 C80 109.5 120 110 156 109.5" stroke-width="0.8"/>
  <path d="M44 125 C80 124.5 120 125 156 124.5" stroke-width="0.8"/>
  <!-- entrance door -->
  <path d="M82 140 L82 105"/>
  <path d="M118 140 L118 105"/>
  <path d="M82 105 C88 101 112 101 118 105"/>
  <path d="M100 140 L100 105" stroke-width="1"/>
  <!-- poster frames -->
  <path d="M46 102 L46 90 L72 90 L72 102" stroke-width="1"/>
  <path d="M128 102 L128 90 L154 90 L154 102" stroke-width="1"/>
</svg>`,

"Vidiots": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- Eagle Theatre building — older commercial/mission style -->
  <path d="M20 140 C20 128 20 85 20.5 38"/>
  <path d="M180 140 C180 128 179.5 85 180 38"/>
  <path d="M20.5 38 C70 37.5 130 38 180 37.5"/>
  <!-- Mission-style roofline parapet with scallop -->
  <path d="M20 38 C20 38 30 32 40 38"/>
  <path d="M40 38 C40 38 50 32 60 38"/>
  <path d="M60 38 C60 38 70 32 80 38"/>
  <path d="M80 38 C80 38 90 32 100 38"/>
  <path d="M100 38 C100 38 110 32 120 38"/>
  <path d="M120 38 C120 38 130 32 140 38"/>
  <path d="M140 38 C140 38 150 32 160 38"/>
  <path d="M160 38 C160 38 170 32 180 38"/>
  <!-- bold VIDIOTS lettering on facade -->
  <path d="M20 70 C70 69.5 130 70 180 69.5" stroke-width="1"/>
  <path d="M20 58 C70 57.5 130 58 180 57.5" stroke-width="1"/>
  <text x="100" y="67" font-family="'Courier New',monospace" font-size="11" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="3" font-weight="bold">VIDIOTS</text>
  <!-- "EAGLE ROCK" smaller -->
  <text x="100" y="54" font-family="'Courier New',monospace" font-size="5.5" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="2">EAGLE THEATRE</text>
  <!-- lower facade brick texture -->
  <path d="M20 95 C70 94.5 130 95 180 94.5" stroke-width="0.8"/>
  <path d="M20 112 C70 111.5 130 112 180 111.5" stroke-width="0.8"/>
  <path d="M20 128 C70 127.5 130 128 180 127.5" stroke-width="0.8"/>
  <!-- storefront windows -->
  <path d="M24 90 L24 75 L55 75 L55 90" stroke-width="1"/>
  <path d="M60 90 L60 75 L95 75 L95 90" stroke-width="1"/>
  <path d="M105 90 L105 75 L140 75 L140 90" stroke-width="1"/>
  <path d="M145 90 L145 75 L176 75 L176 90" stroke-width="1"/>
  <!-- entrance doors -->
  <path d="M84 140 L84 114"/>
  <path d="M116 140 L116 114"/>
  <path d="M84 114 C90 110 110 110 116 114"/>
  <path d="M100 140 L100 114" stroke-width="1"/>
</svg>`,

"Old Town Music Hall": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- two-story Victorian commercial building -->
  <!-- ground floor -->
  <path d="M22 140 C22 128 22 95 22.5 90"/>
  <path d="M178 140 C178 128 177.5 95 178 90"/>
  <path d="M22.5 90 C70 89.5 130 90 178 89.5"/>
  <!-- upper floor -->
  <path d="M22.5 90 C22 85 22 60 22.5 28"/>
  <path d="M178 90 C177.5 85 178 60 178 28"/>
  <path d="M22.5 28 C70 27.5 130 28 178 27.5"/>
  <!-- Victorian cornice at top -->
  <path d="M18 28 C70 27 130 28 182 27.5"/>
  <path d="M18 32 C70 31 130 32 182 31.5" stroke-width="1"/>
  <!-- decorative cornice brackets -->
  <path d="M30 28 C28 25 26 25 24 28" stroke-width="1"/><path d="M50 28 C48 25 46 25 44 28" stroke-width="1"/>
  <path d="M70 28 C68 25 66 25 64 28" stroke-width="1"/><path d="M90 28 C88 25 86 25 84 28" stroke-width="1"/>
  <path d="M110 28 C108 25 106 25 104 28" stroke-width="1"/><path d="M130 28 C128 25 126 25 124 28" stroke-width="1"/>
  <path d="M150 28 C148 25 146 25 144 28" stroke-width="1"/><path d="M170 28 C168 25 166 25 164 28" stroke-width="1"/>
  <!-- upper floor arched windows -->
  <path d="M32 84 L32 48 L52 48 L52 84 C52 84 48 78 42 78 C36 78 32 84 32 84" stroke-width="1"/>
  <path d="M62 84 L62 48 L86 48 L86 84 C86 84 80 78 74 78 C68 78 62 84 62 84" stroke-width="1"/>
  <path d="M94 84 L94 48 L118 48 L118 84 C118 84 112 78 106 78 C100 78 94 84 94 84" stroke-width="1"/>
  <path d="M126 84 L126 48 L150 48 L150 84 C150 84 144 78 138 78 C132 78 126 84 126 84" stroke-width="1"/>
  <path d="M158 84 L158 48 L178 48 L178 84 C178 84 174 78 168 78 C162 78 158 84 158 84" stroke-width="1"/>
  <!-- sign band between floors -->
  <text x="100" y="98" font-family="'Courier New',monospace" font-size="6.5" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="1">OLD TOWN MUSIC HALL</text>
  <!-- ground floor storefronts -->
  <path d="M26 135 L26 95 L58 95 L58 135" stroke-width="1"/>
  <path d="M42 135 L42 95" stroke-width="1"/>
  <path d="M68 135 L68 95 L96 95 L96 135" stroke-width="1"/>
  <path d="M82 135 L82 95" stroke-width="1"/>
  <!-- entrance doors center -->
  <path d="M106 140 L106 102"/>
  <path d="M150 140 L150 102"/>
  <path d="M128 140 L128 102" stroke-width="1"/>
  <!-- right storefront -->
  <path d="M160 135 L160 95 L176 95 L176 135" stroke-width="1"/>
</svg>`,

"Culver Theater": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- contemporary building mass -->
  <path d="M25 140 C25 128 25 85 25.5 28"/>
  <path d="M175 140 C175 128 174.5 85 175 28"/>
  <path d="M25.5 28 C75 27.5 125 28 175 27.5"/>
  <!-- flat roof line -->
  <path d="M22 28 C75 27 125 28 178 27.5" stroke-width="2"/>
  <!-- tall glass entry element (center) — floor-to-ceiling glass -->
  <path d="M72 140 C72 130 72 80 72.5 28"/>
  <path d="M128 140 C128 130 127.5 80 128 28"/>
  <!-- glass panel grid lines -->
  <path d="M72 60 C90 59.5 110 60 128 59.5" stroke-width="0.8"/>
  <path d="M72 90 C90 89.5 110 90 128 89.5" stroke-width="0.8"/>
  <path d="M72 115 C90 114.5 110 115 128 114.5" stroke-width="0.8"/>
  <path d="M90 28 L90 140" stroke-width="0.8"/>
  <path d="M110 28 L110 140" stroke-width="0.8"/>
  <!-- side panels (solid wall) -->
  <path d="M40 85 C50 84.5 65 85 72 84.5" stroke-width="1"/>
  <path d="M128 85 C138 84.5 152 85 160 84.5" stroke-width="1"/>
  <!-- CULVER lettering -->
  <text x="100" y="22" font-family="'Courier New',monospace" font-size="10" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="4" font-weight="bold">CULVER</text>
  <!-- left solid panel windows -->
  <path d="M30 80 L30 45 L65 45 L65 80" stroke-width="1"/>
  <path d="M47 45 L47 80" stroke-width="1"/>
  <!-- right solid panel windows -->
  <path d="M135 80 L135 45 L170 45 L170 80" stroke-width="1"/>
  <path d="M152 45 L152 80" stroke-width="1"/>
  <!-- entrance doors (within glass box) -->
  <path d="M82 140 L82 115"/>
  <path d="M118 140 L118 115"/>
  <path d="M100 140 L100 115" stroke-width="1"/>
  <!-- "THEATER" small below CULVER -->
  <text x="100" y="38" font-family="'Courier New',monospace" font-size="5.5" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="3">THEATER</text>
</svg>`,

"Alamo Drafthouse DTLA": `<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <!-- ground / street level -->
  <path d="M4 140 C60 139.5 140 140 196 139.5" stroke-width="2"/>
  <!-- The Bloc mall facade — large modern building mass -->
  <path d="M15 140 C15 125 15 80 15.5 25"/>
  <path d="M185 140 C185 125 184.5 80 185 25"/>
  <path d="M15.5 25 C70 24.5 130 25 185 24.5"/>
  <!-- rooftop parapet and cornice -->
  <path d="M12 25 C70 24 130 25 188 24.5" stroke-width="2"/>
  <path d="M12 30 C70 29 130 30 188 29.5" stroke-width="1"/>
  <!-- large perforated metal/grid facade element (upper) -->
  <path d="M15 70 C70 69.5 130 70 185 69.5" stroke-width="1"/>
  <!-- grid pattern on upper facade -->
  <path d="M35 70 L35 30" stroke-width="0.8"/><path d="M55 70 L55 30" stroke-width="0.8"/>
  <path d="M75 70 L75 30" stroke-width="0.8"/><path d="M95 70 L95 30" stroke-width="0.8"/>
  <path d="M115 70 L115 30" stroke-width="0.8"/><path d="M135 70 L135 30" stroke-width="0.8"/>
  <path d="M155 70 L155 30" stroke-width="0.8"/><path d="M175 70 L175 30" stroke-width="0.8"/>
  <path d="M15 45 C70 44.5 130 45 185 44.5" stroke-width="0.8"/>
  <path d="M15 58 C70 57.5 130 58 185 57.5" stroke-width="0.8"/>
  <!-- ALAMO DRAFTHOUSE signage band -->
  <path d="M15 82 C70 81.5 130 82 185 81.5" stroke-width="1"/>
  <text x="100" y="79" font-family="'Courier New',monospace" font-size="8.5" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="2">ALAMO DRAFTHOUSE</text>
  <!-- lower facade with entrance -->
  <path d="M15 110 C70 109.5 130 110 185 109.5" stroke-width="1"/>
  <!-- entrance canopy -->
  <path d="M55 100 C80 99.5 120 100 145 99.5"/>
  <path d="M55 100 L55 92"/>
  <path d="M145 100 L145 92"/>
  <path d="M55 92 C80 91.5 120 92 145 91.5"/>
  <!-- DTLA sign -->
  <text x="100" y="90" font-family="'Courier New',monospace" font-size="5.5" text-anchor="middle" fill="currentColor" stroke="none" letter-spacing="2">LOS ANGELES</text>
  <!-- entry doors -->
  <path d="M72 140 L72 110"/><path d="M88 140 L88 110"/><path d="M72 110 L88 110" stroke-width="1"/>
  <path d="M96 140 L96 110"/><path d="M112 140 L112 110"/><path d="M96 110 L112 110" stroke-width="1"/>
  <path d="M120 140 L120 110"/><path d="M136 140 L136 110"/><path d="M120 110 L136 110" stroke-width="1"/>
  <!-- flanking retail windows -->
  <path d="M20 138 L20 115 L48 115 L48 138" stroke-width="1"/>
  <path d="M152 138 L152 115 L180 115 L180 138" stroke-width="1"/>
</svg>`,

};
