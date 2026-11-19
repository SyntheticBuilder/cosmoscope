// Pure helpers for the NASA new-planets feed (no network, no file access).

const FIELDS = [
  'pl_name', 'hostname', 'disc_pubdate', 'disc_year', 'disc_facility',
  'discoverymethod', 'pl_rade', 'pl_bmasse', 'pl_orbper', 'pl_eqt',
  'sy_dist', 'ra', 'dec', 'sy_pnum', 'st_teff', 'disc_refname',
];

export function firstReleaseQuery(cutoffISO) {
  return `select pl_name, min(releasedate) as first_release from ps group by pl_name having min(releasedate) >= '${cutoffISO}'`;
}

export function detailQuery(names) {
  const list = names.map(n => `'${String(n).replace(/'/g, "''")}'`).join(',');
  return `select ${FIELDS.join(',')} from ps where default_flag=1 and pl_name in (${list})`;
}

export function cleanRef(html) {
  if (!html) return { text: null, url: null };
  const urlMatch = /href=["']?([^\s"'>]+)/i.exec(html);
  const text = html.replace(/<[^>]*>/g, '').trim();
  return { text: text || null, url: urlMatch ? urlMatch[1] : null };
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
