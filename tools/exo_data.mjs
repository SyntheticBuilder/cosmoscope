// Pure helpers for the NASA new-planets feed (no network, no file access).

const FIELDS = [
  'pl_name', 'hostname', 'disc_pubdate', 'disc_year', 'disc_facility',
  'discoverymethod', 'pl_rade', 'pl_bmasse', 'pl_orbper', 'pl_eqt',
  'sy_dist', 'ra', 'dec', 'sy_pnum', 'st_teff', 'disc_refname', 'pl_bmassprov',
];

export function firstReleaseQuery(cutoffISO) {
  return `select pl_name, min(releasedate) as first_release from ps group by pl_name having min(releasedate) >= '${cutoffISO}'`;
}

export function detailQuery(names) {
  const list = names.map(n => `'${String(n).replace(/'/g, "''")}'`).join(',');
  return `select ${FIELDS.join(',')} from ps where default_flag=1 and pl_name in (${list})`;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
// Decode the entities NASA's reference html uses (&amp; &lt; &gt; &quot; &#39; &#NNN;).
function decodeEntities(s) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k in ENTITIES) return ENTITIES[k];
    if (k[0] !== '#') return m;
    const code = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
}

export function cleanRef(html) {
  if (!html) return { text: null, url: null };
  const urlMatch = /href=["']?([^\s"'>]+)/i.exec(html);
  const text = decodeEntities(html.replace(/<[^>]*>/g, '')).trim();
  return { text: text || null, url: urlMatch ? decodeEntities(urlMatch[1]) : null };
}

export function shapePlanets(firstRows, detailRows, fetchedAt) {
  const firstByName = new Map(firstRows.map(r => [r.pl_name, r.first_release]));
  const planets = [];
  for (const row of detailRows) {
    if (!firstByName.has(row.pl_name)) continue;
    const { disc_refname, ...rest } = row;
    const ref = cleanRef(disc_refname);
    planets.push({
      ...rest,
      first_release: firstByName.get(row.pl_name),
      ref_text: ref.text,
      ref_url: ref.url,
    });
  }
  planets.sort((a, b) => {
    if (a.sy_dist == null && b.sy_dist == null) return 0;
    if (a.sy_dist == null) return 1;
    if (b.sy_dist == null) return -1;
    return a.sy_dist - b.sy_dist;
  });
  return { fetchedAt, windowDays: 90, planets };
}
