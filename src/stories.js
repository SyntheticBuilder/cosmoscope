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
