import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type Row = Record<string, any>;
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export const dataDir = process.env.ORGANIZE_DATA_DIR || join(process.cwd(), 'server', 'data');
const dbPath = process.env.ORGANIZE_DB_PATH || join(dataDir, 'organize.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, salt TEXT NOT NULL, avatar TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS workspaces (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', owner_id TEXT NOT NULL REFERENCES users(id),
 settings_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workspace_members (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','member','observer')),
 joined_at TEXT NOT NULL, PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE IF NOT EXISTS invites (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 board_id TEXT REFERENCES boards(id) ON DELETE SET NULL,
 email TEXT NOT NULL COLLATE NOCASE, role TEXT NOT NULL CHECK(role IN ('admin','member','observer')),
 token_hash TEXT NOT NULL UNIQUE, invited_by TEXT NOT NULL REFERENCES users(id),
 expires_at TEXT NOT NULL, accepted_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS boards (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', visibility TEXT NOT NULL DEFAULT 'workspace' CHECK(visibility IN ('private','workspace','public')),
 background TEXT NOT NULL DEFAULT '#0c66e4', starred INTEGER NOT NULL DEFAULT 0,
 archived INTEGER NOT NULL DEFAULT 0, settings_json TEXT NOT NULL DEFAULT '{}',
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boards_ws ON boards(workspace_id);
CREATE TABLE IF NOT EXISTS board_members (
 board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('admin','member','observer')),
 joined_at TEXT NOT NULL, PRIMARY KEY(board_id,user_id)
);
CREATE TABLE IF NOT EXISTS board_stars (
 board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(board_id,user_id)
);
CREATE TABLE IF NOT EXISTS lists (
 id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
 title TEXT NOT NULL, position REAL NOT NULL, color TEXT,
 collapsed INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lists_board ON lists(board_id,position);
CREATE TABLE IF NOT EXISTS cards (
 id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
 list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', position REAL NOT NULL,
 cover_json TEXT, start_at TEXT, due_at TEXT, due_complete INTEGER NOT NULL DEFAULT 0,
 reminder_minutes INTEGER, recurrence_json TEXT, is_template INTEGER NOT NULL DEFAULT 0,
 completed INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
 location_json TEXT, created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_list ON cards(list_id,position);
CREATE TABLE IF NOT EXISTS card_members (
 card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(card_id,user_id)
);
CREATE TABLE IF NOT EXISTS watches (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 target_type TEXT NOT NULL CHECK(target_type IN ('board','list','card')),
 target_id TEXT NOT NULL, PRIMARY KEY(user_id,target_type,target_id)
);
CREATE TABLE IF NOT EXISTS labels (
 id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
 name TEXT NOT NULL, color TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS card_labels (
 card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
 PRIMARY KEY(card_id,label_id)
);
CREATE TABLE IF NOT EXISTS comments (
 id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments (
 id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 name TEXT NOT NULL, url TEXT, path TEXT, mime TEXT, size INTEGER,
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checklists (
 id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 title TEXT NOT NULL, position REAL NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checklist_items (
 id TEXT PRIMARY KEY, checklist_id TEXT NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
 text TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, position REAL NOT NULL,
 due_at TEXT, assignee_id TEXT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS custom_fields (
 id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
 name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('text','number','date','checkbox','select')),
 options_json TEXT NOT NULL DEFAULT '[]', position REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_values (
 card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 field_id TEXT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
 value_json TEXT NOT NULL, PRIMARY KEY(card_id,field_id)
);
CREATE TABLE IF NOT EXISTS activity (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,
 card_id TEXT REFERENCES cards(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL,
 detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_board ON activity(board_id,created_at);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 type TEXT NOT NULL, body_json TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at);
CREATE TABLE IF NOT EXISTS automations (
 id TEXT PRIMARY KEY, board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
 name TEXT NOT NULL, trigger TEXT NOT NULL, condition_json TEXT NOT NULL DEFAULT '{}',
 actions_json TEXT NOT NULL DEFAULT '[]', enabled INTEGER NOT NULL DEFAULT 1,
 last_run_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS automation_runs (
 automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
 card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 occurrence TEXT NOT NULL, ran_at TEXT NOT NULL,
 PRIMARY KEY(automation_id,card_id,occurrence)
);
CREATE TABLE IF NOT EXISTS reminder_runs (
 card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
 due_at TEXT NOT NULL, reminder_minutes INTEGER NOT NULL,
 sent_at TEXT NOT NULL, PRIMARY KEY(card_id,due_at,reminder_minutes)
);
CREATE TABLE IF NOT EXISTS inbox_items (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', card_id TEXT REFERENCES cards(id) ON DELETE SET NULL,
 completed INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 value_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS saved_filters (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 board_id TEXT REFERENCES boards(id) ON DELETE CASCADE,
 name TEXT NOT NULL, query_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collections (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collection_boards (
 collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
 board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
 PRIMARY KEY(collection_id,board_id)
);
CREATE TABLE IF NOT EXISTS integration_settings (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 provider TEXT NOT NULL, config_json TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 0
);
`);
if (!(db.prepare('PRAGMA table_info(invites)').all() as Row[]).some(row=>row.name==='board_id')) db.exec('ALTER TABLE invites ADD COLUMN board_id TEXT REFERENCES boards(id) ON DELETE SET NULL');
if (!(db.prepare('PRAGMA table_info(inbox_items)').all() as Row[]).some(row=>row.name==='archived')) db.exec('ALTER TABLE inbox_items ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');

export function one(sql: string, ...args: any[]): Row | undefined {
 return db.prepare(sql).get(...args) as Row | undefined;
}
export function all(sql: string, ...args: any[]): Row[] {
 return db.prepare(sql).all(...args) as Row[];
}
export function run(sql: string, ...args: any[]): void { db.prepare(sql).run(...args); }
let transactionDepth = 0;
export function transaction<T>(fn: () => T): T {
 const depth = transactionDepth, savepoint = `organize_tx_${depth}`;
 db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
 transactionDepth++;
 try {
  const result = fn();
  db.exec(depth === 0 ? 'COMMIT' : `RELEASE SAVEPOINT ${savepoint}`);
  return result;
 } catch (err) {
  if (depth === 0) db.exec('ROLLBACK');
  else { db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`); db.exec(`RELEASE SAVEPOINT ${savepoint}`); }
  throw err;
 } finally { transactionDepth--; }
}
export function maxPosition(table: 'lists'|'cards'|'checklists'|'checklist_items'|'custom_fields', column: string, id: string): number {
 return Number(one(`SELECT COALESCE(MAX(position), 0) + 1024 AS position FROM ${table} WHERE ${column} = ?`, id)?.position || 1024);
}
