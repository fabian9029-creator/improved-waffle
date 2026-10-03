// Datenbankschema und Umrechnung zwischen dem App-Zustand und den SQLite-Tabellen.
// Reine Funktionen ohne Android-Bezug, damit sie sich auch am Rechner testen lassen.

export const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY NOT NULL, v TEXT);',
  'CREATE TABLE IF NOT EXISTS vehicles (id TEXT PRIMARY KEY NOT NULL, pos INTEGER NOT NULL, name TEXT NOT NULL, plate TEXT, engine TEXT, year INTEGER, km INTEGER NOT NULL DEFAULT 0, hu TEXT, notes TEXT, example INTEGER NOT NULL DEFAULT 0);',
  'CREATE TABLE IF NOT EXISTS intervals (id TEXT PRIMARY KEY NOT NULL, vid TEXT NOT NULL, pos INTEGER NOT NULL, name TEXT NOT NULL, km INTEGER NOT NULL DEFAULT 0, months INTEGER NOT NULL DEFAULT 0, cat TEXT, last_km INTEGER, last_date TEXT);',
  'CREATE TABLE IF NOT EXISTS specs (vid TEXT NOT NULL, pos INTEGER NOT NULL, k TEXT, v TEXT);',
  'CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY NOT NULL, vid TEXT NOT NULL, date TEXT NOT NULL, km INTEGER NOT NULL DEFAULT 0, title TEXT NOT NULL, cat TEXT, who TEXT, cost REAL NOT NULL DEFAULT 0, quote REAL NOT NULL DEFAULT 0, hours REAL NOT NULL DEFAULT 0, parts TEXT, note TEXT, iid TEXT);',
  'CREATE INDEX IF NOT EXISTS idx_logs_vid ON logs (vid, date);'
];

const TABLES = ['logs', 'specs', 'intervals', 'vehicles', 'meta'];

// Alle Tabellen leeren und neu füllen, als eine Transaktion (executeSet).
// Die Löschbefehle tragen einen Dummy-Wert, damit jeder Eintrag einen Parameter hat.
export function buildWrites(S) {
  const w = [];
  TABLES.forEach(t => w.push({ statement: 'DELETE FROM ' + t + ' WHERE 1 = ?;', values: [1] }));
  S.vehicles.forEach((v, i) => {
    w.push({
      statement: 'INSERT INTO vehicles (id, pos, name, plate, engine, year, km, hu, notes, example) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
      values: [v.id, i, v.name, v.plate || '', v.engine || '', v.year === '' || v.year == null ? null : Number(v.year), Math.round(Number(v.km) || 0), v.hu || '', v.notes || '', v.example ? 1 : 0]
    });
    (v.intervals || []).forEach((it, j) => w.push({
      statement: 'INSERT INTO intervals (id, vid, pos, name, km, months, cat, last_km, last_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);',
      values: [it.id, v.id, j, it.name, it.km || 0, it.months || 0, it.cat || '', it.lastKm == null ? null : it.lastKm, it.lastDate || '']
    }));
    (v.specs || []).forEach((s, j) => w.push({
      statement: 'INSERT INTO specs (vid, pos, k, v) VALUES (?, ?, ?, ?);',
      values: [v.id, j, s.k || '', s.v || '']
    }));
  });
  S.logs.forEach(l => w.push({
    statement: 'INSERT INTO logs (id, vid, date, km, title, cat, who, cost, quote, hours, parts, note, iid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
    values: [l.id, l.vid, l.date, Math.round(Number(l.km) || 0), l.title, l.cat || '', l.who || 'self', Number(l.cost) || 0, Number(l.quote) || 0, Number(l.hours) || 0, l.parts || '', l.note || '', l.iid || '']
  }));
  w.push({ statement: 'INSERT INTO meta (k, v) VALUES (?, ?);', values: ['activeId', S.activeId || ''] });
  return w;
}

// query(sql, values) muss ein Promise auf ein Array von Zeilen-Objekten liefern.
export async function readState(query) {
  const vs = await query('SELECT * FROM vehicles ORDER BY pos;', []);
  const logs = await query('SELECT * FROM logs ORDER BY date, km;', []);
  if (!vs.length && !logs.length) return null;
  const its = await query('SELECT * FROM intervals ORDER BY pos;', []);
  const sps = await query('SELECT * FROM specs ORDER BY pos;', []);
  const meta = await query('SELECT v FROM meta WHERE k = ?;', ['activeId']);

  const vehicles = vs.map(r => ({
    id: r.id, name: r.name, plate: r.plate || '', engine: r.engine || '',
    year: r.year == null ? '' : r.year, km: r.km || 0, hu: r.hu || '',
    notes: r.notes || '', example: !!r.example, intervals: [], specs: []
  }));
  const byId = {};
  vehicles.forEach(v => { byId[v.id] = v; });
  its.forEach(r => {
    const v = byId[r.vid];
    if (v) v.intervals.push({ id: r.id, name: r.name, km: r.km || 0, months: r.months || 0, cat: r.cat || '', lastKm: r.last_km == null ? null : r.last_km, lastDate: r.last_date || '' });
  });
  sps.forEach(r => {
    const v = byId[r.vid];
    if (v) v.specs.push({ k: r.k || '', v: r.v || '' });
  });
  const active = meta.length && meta[0].v ? meta[0].v : (vehicles[0] ? vehicles[0].id : null);
  return {
    v: 1,
    vehicles,
    logs: logs.map(r => ({
      id: r.id, vid: r.vid, date: r.date, km: r.km || 0, title: r.title, cat: r.cat || '',
      who: r.who || 'self', cost: r.cost || 0, quote: r.quote || 0, hours: r.hours || 0,
      parts: r.parts || '', note: r.note || '', iid: r.iid || ''
    })),
    activeId: active
  };
}
