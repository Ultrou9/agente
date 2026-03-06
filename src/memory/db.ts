import Database from 'better-sqlite3';
import { env } from '../config/env.js';
import fs from 'fs';
import path from 'path';

// Ensure directory exists
const dbDir = path.dirname(env.DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(env.DB_PATH);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export interface MessageRow {
    id: number;
    session_id: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    timestamp: string;
}

export const memory = {
    addMessage: (sessionId: string, role: string, content: string) => {
        const stmt = db.prepare('INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)');
        stmt.run(sessionId, role, content);
    },

    getMessages: (sessionId: string, limit: number = 50): MessageRow[] => {
        // Get the most recent X messages, but order them chronologically
        const stmt = db.prepare(`
      SELECT * FROM (
        SELECT * FROM messages 
        WHERE session_id = ? 
        ORDER BY timestamp DESC, id DESC 
        LIMIT ?
      ) 
      ORDER BY timestamp ASC, id ASC
    `);
        return stmt.all(sessionId, limit) as MessageRow[];
    },

    clearMessages: (sessionId: string) => {
        const stmt = db.prepare('DELETE FROM messages WHERE session_id = ?');
        stmt.run(sessionId);
    },

    setState: (key: string, value: any) => {
        const stmt = db.prepare(`
      INSERT INTO state (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
        stmt.run(key, JSON.stringify(value));
    },

    getState: (key: string): any => {
        const stmt = db.prepare('SELECT value FROM state WHERE key = ?');
        const row = stmt.get() as { value: string } | undefined;
        if (row && row.value) {
            try {
                return JSON.parse(row.value);
            } catch (e) {
                return row.value;
            }
        }
        return null;
    }
};
