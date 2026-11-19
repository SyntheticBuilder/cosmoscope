// Story cards. Every number here should be traceable to the listed source.
// Keep hooks short; facts 2–4 lines. Mark uncertainty honestly.

export const STORIES = {
  earth: {
    title: 'Earth', sub: '1 moon · home',
    hook: 'You are never sitting still.',
    facts: [
      'At the equator, Earth spins you around at about 1,670 km/h (1,040 mph).',
      'It also carries you around the Sun at about 30 km/s, roughly 67,000 mph.',
      'Sunlight hitting you right now left the Sun about 8 minutes and 20 seconds ago.',
    ],
    source: 'NASA Earth Fact Sheet',
  },
  moon: {
    title: 'The Moon', sub: '384,400 km away',
    hook: 'It always shows us the same face.',
    facts: [
      'The Moon spins exactly once per orbit, so one side always faces Earth (tidal locking).',
      'It drifts about 3.8 cm farther from Earth every year, measured with lasers bounced off mirrors left by Apollo crews.',
    ],
    source: 'NASA Moon Fact Sheet',
  },
  sun: {
    title: 'The Sun', sub: '8 planets · G-type star',
    hook: 'Dragging its whole family across the galaxy.',
    facts: [
      'The Sun holds about 99.8% of all the mass in the Solar System.',
      'It carries every planet around the Milky Way at roughly 200–230 km/s, about half a million mph.',
      'One lap around the galaxy takes about 230 million years. The last time we were here, the first dinosaurs were just appearing.',
    ],
    source: 'NASA; galactic speed estimates vary by study',
  },
  mercury: {
    title: 'Mercury', sub: 'closest to the Sun',
    hook: 'A year shorter than a season.',
    facts: [
      'Mercury races around the Sun in just 88 Earth days.',
      'With almost no air to hold heat, it swings from about 430 °C in the day to −180 °C at night.',
    ],
    source: 'NASA Planetary Fact Sheet',
  },
  venus: {
    title: 'Venus', sub: 'hottest planet',
    hook: 'A day longer than its year.',
    facts: [
      'Venus spins backwards and so slowly that one rotation (243 days) outlasts its year (225 days).',
      'Its thick CO₂ atmosphere traps heat at about 465 °C, hot enough to melt lead.',
    ],
    source: 'NASA Planetary Fact Sheet',
  },
  mars: {
    title: 'Mars', sub: '2 moons',
    hook: 'Home of the tallest volcano we know.',
    facts: [
      'Olympus Mons rises about 22 km, roughly two and a half times the height of Everest.',
      'A Mars day is 24 h 37 min, close to ours, but its year lasts 687 Earth days.',
    ],
    source: 'NASA Planetary Fact Sheet',
  },
  jupiter: {
    title: 'Jupiter', sub: 'gas giant',
    hook: 'More than 1,300 Earths could fit inside.',
    facts: [
      'Jupiter spins in under 10 hours, the shortest day of any planet.',
      'Its Great Red Spot is a storm wider than Earth that has raged for centuries.',
    ],
    source: 'NASA Planetary Fact Sheet',
  },
  saturn: {
    title: 'Saturn', sub: 'ringed giant',
    hook: 'Huge, and lighter than water.',
    facts: [
      'Saturn’s average density is lower than water’s.',
      'Its main rings stretch hundreds of thousands of km across, yet are often only about 10 meters thick.',
    ],
    source: 'NASA Planetary Fact Sheet',
  },
  uranus: {
    title: 'Uranus', sub: 'ice giant',
    hook: 'It rolls around the Sun on its side.',
    facts: [
      'Uranus is tipped about 98°, so each pole gets roughly 42 years of sunlight, then 42 of darkness.',
      'One orbit takes 84 Earth years.',
    ],
    source: 'NASA Planetary Fact Sheet',
  },
  neptune: {
    title: 'Neptune', sub: 'ice giant',
    hook: 'The windiest place we know of.',
    facts: [
      'Winds on Neptune top 2,000 km/h, the fastest in the Solar System.',
      'It takes 165 Earth years to go around the Sun once.',
    ],
    source: 'NASA Planetary Fact Sheet',
  },
  pluto: {
    title: 'Pluto', sub: 'dwarf planet',
    hook: 'Its year lasts 248 of ours.',
    facts: [
      'New Horizons flew past in 2015 and found a huge heart-shaped plain of nitrogen ice.',
      'Pluto’s path is so stretched that it sometimes comes closer to the Sun than Neptune does.',
    ],
    source: 'NASA',
  },
  alphacen: {
    title: 'Alpha Centauri', sub: '3 stars · 4.37 light-years',
    hook: 'Our closest neighbors, waltzing.',
    facts: [
      'Alpha Centauri A and B circle each other about every 80 years.',
      'A third star, Proxima Centauri, is the closest star to the Sun at 4.24 light-years, and it has at least one planet.',
      'The light you see from it left about four and a half years ago.',
    ],
    source: 'ESO; NASA Exoplanet Archive',
    illustrative: 'Orbit orientation illustrative',
  },
  sirius: {
    title: 'Sirius', sub: '2 stars · 8.6 light-years',
    hook: 'The brightest star, dancing with a dead one.',
    facts: [
      'Sirius A is the brightest star in our night sky, about 25 times as luminous as the Sun.',
      'Its partner, Sirius B, is a white dwarf: the leftover core of a star, packed into a ball about Earth’s size.',
      'The pair orbit each other about every 50 years.',
    ],
    source: 'NASA; ESA/Hubble',
    illustrative: 'Orbit orientation illustrative',
  },
  trappist: {
    title: 'TRAPPIST-1', sub: '7 planets · 40 light-years',
    hook: 'Seven Earth-sized worlds, packed tight.',
    facts: [
      'A small, cool red dwarf with seven rocky, roughly Earth-sized planets.',
      'All seven orbits would fit well inside Mercury’s. The innermost planet’s year is just 1.5 days.',
      'Several sit in the zone where liquid water could exist, and the James Webb Space Telescope is studying them.',
    ],
    source: 'NASA Exoplanet Archive; NASA JWST',
    illustrative: 'Orbit tilt illustrative · sizes not to scale',
  },
  betelgeuse: {
    title: 'Betelgeuse', sub: 'red supergiant · ~550–700 light-years',
    hook: 'A star big enough to swallow Mars’ orbit.',
    facts: [
      'Put Betelgeuse where the Sun is and its surface would reach past Mars, maybe toward Jupiter.',
      'It will explode as a supernova someday, probably within the next 100,000 years.',
      'Its exact distance and size are still debated.',
    ],
    source: 'NASA; ESA',
    illustrative: 'Size approximate',
  },
  proxima: {
    title: 'Proxima Centauri b', sub: '2 planets · 4.24 light-years',
    hook: 'A whole year in 11 days.',
    facts: [
      'Proxima b has at least about Earth’s mass and circles its small red dwarf every 11.2 days, in the zone where liquid water could exist.',
      'An even smaller planet, d (about a quarter of Earth’s mass), races around in just 5.1 days.',
      'Proxima itself is slowly circling Alpha Centauri A and B. One lap takes about 550,000 years.',
      'Whether Proxima b could hold onto air under its star’s frequent flares is still unknown.',
    ],
    source: 'NASA Exoplanet Archive; Suárez Mascareño et al. 2025 (ESPRESSO); Kervella et al. 2017 (ESO)',
    illustrative: 'Orbit tilt illustrative · planet sizes not to scale',
  },
  barnard: {
    title: 'Barnard’s Star', sub: '4 planets · 5.96 light-years',
    hook: 'The fastest-moving star in our sky.',
    facts: [
      'It shifts 10.3 arcseconds a year across the sky, faster than any other star: the width of the full Moon in about 180 years.',
      'It’s coming toward us. Around the year 11,800 it should pass within about 3.75 light-years, its closest (estimates vary slightly).',
      'In 2025 astronomers confirmed four tiny rocky planets, each only about a fifth to a third of Earth’s mass, with years of 2 to 7 days.',
    ],
    source: 'Basant et al. 2025 (ApJ Letters); HYG catalog',
    illustrative: 'Speed up time to watch it move · planets too small to draw',
  },
  gliese710: {
    title: 'Gliese 710', sub: 'orange dwarf · ~62 light-years',
    hook: 'A star on course to brush past the Sun.',
    facts: [
      'In about 1.3 million years it should pass only about 0.05 parsecs (roughly 10,000 Earth–Sun distances) from the Sun.',
      'That takes it right through the Oort cloud, the Sun’s distant shell of comets, where its gravity could nudge some comets inward.',
      'Before ESA’s Gaia mission, the pass was thought to be about six times wider. Each Gaia data release has refined it.',
    ],
    source: 'ESA Gaia; de la Fuente Marcos & de la Fuente Marcos 2022 (Gaia DR3); Bobylev 2010',
    illustrative: 'Speed up to 1M yr/s to watch it approach',
  },
  peg51: {
    title: '51 Pegasi b', sub: '1 planet · 50 light-years',
    hook: 'The wobble that changed astronomy.',
    facts: [
      'In 1995 Michel Mayor and Didier Queloz spotted a tiny back-and-forth wobble in this Sun-like star, caused by a planet tugging on it.',
      'The planet has at least about half Jupiter’s mass and whips around every 4.2 days, far closer than Mercury is to our Sun: the first “hot Jupiter.”',
      'It was the first planet found around a Sun-like star, and the discovery won the 2019 Nobel Prize in Physics.',
    ],
    source: 'NASA Exoplanet Archive; Mayor & Queloz 1995 (Nature)',
    illustrative: 'Star wobble exaggerated ~300× · planet size not to scale',
  },
  kepler16: {
    title: 'Kepler-16 b', sub: '2 stars · 1 planet · 245 light-years',
    hook: 'A real world with two suns.',
    facts: [
      'A Saturn-sized planet circling a pair of stars, an orange dwarf and a red dwarf, that orbit each other every 41 days.',
      'The planet’s own year lasts about 229 days. From there you would often see two sunsets.',
      'NASA’s Kepler telescope found it in 2011 by watching the stars and planet pass in front of one another.',
    ],
    source: 'NASA Exoplanet Archive; Doyle et al. 2011 (Science)',
    illustrative: 'Sizes not to scale',
  },
  algol: {
    title: 'Algol', sub: '3 stars · ~94 light-years',
    hook: 'The “Demon Star” that winks.',
    facts: [
      'Every 2 days and 21 hours the dimmer star passes in front of the brighter one, and Algol visibly fades for several hours. You can see it by eye.',
      'The two eclipsing stars are only about 0.06 AU apart, so close that gas flows from one to the other.',
      'A third star circles the pair every 680 days, on an orbit tipped almost exactly 90° to theirs.',
    ],
    source: 'Baron et al. 2012 (CHARA, ApJ)',
    illustrative: 'Inner pair shown edge-on, as we see it from Earth',
  },
  polaris: {
    title: 'Polaris', sub: '3 stars · 447 light-years',
    hook: 'The North Star won’t stay the North Star.',
    facts: [
      'Polaris is a supergiant about 46 times wider than the Sun that pulses in brightness every 4 days. A smaller star circles it every 29.4 years.',
      'Timing that orbit in 2024 gave Polaris a mass of about 5.1 Suns.',
      'Earth’s axis wobbles like a slow top, about once every 26,000 years. Polaris will be closest to the pole around 2100. Around the year 14,000, bright Vega will be near the pole instead.',
    ],
    source: 'Evans et al. 2024 (CHARA, ApJ)',
    illustrative: 'Orbit tilt illustrative · companion size approximate',
  },
  mira: {
    title: 'Mira', sub: 'red giant · ~350 light-years',
    hook: 'A star with a tail like a comet.',
    facts: [
      'Mira plows through space at about 130 km/s (291,000 mph) relative to the gas around it.',
      'It sheds material as it goes, leaving a glowing tail about 13 light-years long, built up over roughly 30,000 years.',
      'The tail only shows in ultraviolet light. NASA’s GALEX telescope found it by chance in 2006.',
      'Mira swells and fades over about 11 months, from easy to see by eye to too dim without a telescope.',
    ],
    source: 'NASA/JPL GALEX (Martin et al. 2007, Nature); distance estimates vary',
    illustrative: 'Tail is an illustration · star size approximate',
  },
  orion: {
    title: 'Orion Nebula', sub: 'star nursery · ~1,350 light-years',
    hook: 'A star nursery that flings stars away.',
    facts: [
      'The nearest big star-forming cloud, lit up by the young, hot Trapezium stars at its heart.',
      'About 2.5 million years ago, two pairs of stars met there and flung two stars out in opposite directions: AE Aurigae and Mu Columbae.',
      'The pair left behind, Iota Orionis, is still a tight, stretched binary, a leftover of that encounter.',
      'Its distance is still debated: estimates range from about 1,300 to 1,500 light-years.',
    ],
    source: 'NASA/ESA Hubble; Hoogerwerf, de Bruijne & de Zeeuw 2001 (A&A)',
    illustrative: 'Nebula is an illustration',
  },
  sgra: {
    title: 'Sagittarius A*', sub: 'black hole · ~26,000 light-years',
    hook: 'A star whipping around a black hole.',
    facts: [
      'At the center of our galaxy sits a black hole about 4.3 million times the Sun’s mass.',
      'The star S2 orbits it every 16 years. In 2018 it swung past at about 120 Earth–Sun distances, moving at almost 3% of the speed of light. Next close pass: 2034.',
      'Its orbit slowly turns like a rosette, exactly as Einstein’s general relativity predicts (measured by ESO’s GRAVITY team in 2020).',
      'Tracking these stars earned Reinhard Genzel and Andrea Ghez a share of the 2020 Nobel Prize in Physics.',
    ],
    source: 'ESO; GRAVITY Collaboration 2020 (A&A); Event Horizon Telescope',
    illustrative: 'Orbit tilt illustrative · black hole glow not to scale',
  },
  galaxy: {
    title: 'The Milky Way', sub: '100–400 billion stars',
    hook: 'We live inside it, so we can only map it from within.',
    facts: [
      'The disk is about 100,000 light-years across. The Sun sits about 26,000 light-years from the center.',
      'At the center is Sagittarius A*, a black hole about 4 million times the Sun’s mass, first imaged in 2022.',
      'Its exact spiral-arm layout is still being measured, so this view is an illustration based on current maps.',
    ],
    source: 'NASA; Event Horizon Telescope; ESA Gaia',
    illustrative: 'Galaxy shape is an illustration',
  },
  andromeda: {
    title: 'Andromeda', sub: '~1 trillion stars · 2.5 million light-years',
    hook: 'The light you see left before humans existed.',
    facts: [
      'The farthest thing most people can see with the naked eye.',
      'It is heading toward us at about 110 km/s.',
      'A 2025 study puts the odds of it merging with the Milky Way in the next 10 billion years at roughly 50/50.',
    ],
    source: 'NASA; Sawala et al., Nature Astronomy (2025)',
  },
  triangulum: {
    title: 'Triangulum', sub: '~2.7 million light-years',
    hook: 'The third big galaxy of our Local Group.',
    facts: [
      'A smaller spiral, about a third the width of the Milky Way.',
      'Under very dark skies, sharp-eyed observers can just spot it without a telescope.',
    ],
    source: 'NASA; ESA/Hubble',
  },
  lmc: {
    title: 'Large Magellanic Cloud', sub: '~160,000 light-years',
    hook: 'A galaxy orbiting ours.',
    facts: [
      'A satellite galaxy, visible as a glowing smudge from the Southern Hemisphere.',
      'In 1987 a star exploded there: the closest supernova seen since the telescope was invented.',
    ],
    source: 'NASA; ESA',
  },
  smc: {
    title: 'Small Magellanic Cloud', sub: '~200,000 light-years',
    hook: 'The Large Cloud’s little sibling.',
    facts: [
      'Another dwarf galaxy circling the Milky Way, slowly being pulled apart by gravity.',
    ],
    source: 'NASA; ESA',
  },
  universe: {
    title: 'Observable Universe', sub: '~46.5 billion light-years to the edge',
    hook: 'Older light than anything else we can see.',
    facts: [
      'The universe is about 13.8 billion years old, but space has stretched, so the edge we see is now about 46.5 billion light-years away.',
      'The glowing shell is the cosmic microwave background: light released about 380,000 years after the Big Bang.',
      'Estimates for the number of galaxies range from hundreds of billions to around 2 trillion.',
    ],
    source: 'NASA; ESA Planck',
    illustrative: 'Galaxy web is an illustration; real survey data coming',
  },
};
