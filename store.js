// Speicherschicht: auf dem Handy eine lokale SQLite-Datenbank, im Browser (zum Testen) localStorage.
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { SCHEMA, buildWrites, readState } from './sql.js';

const DB_NAME = 'schrauberbuch';
const LS_KEY = 'schrauberbuch.v1';

export async function openStore() {
  if (Capacitor.isNativePlatform()) {
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const consistent = (await sqlite.checkConnectionsConsistency()).result;
    const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
    const conn = consistent && isConn
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    await conn.open();
    await conn.execute(SCHEMA.join('\n'));
    const query = async (sql, values) => {
      const r = await conn.query(sql, values || []);
      return r.values || [];
    };
    return {
      mode: 'sqlite',
      load: () => readState(query),
      save: async state => { await conn.executeSet(buildWrites(state), true); }
    };
  }
  return {
    mode: 'local',
    load: async () => {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    save: async state => { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  };
}
