import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, statSync } from 'node:fs';
import { join, resolve, relative, extname, sep } from 'node:path';
import { URL } from 'node:url';
import { all, dataDir, db, maxPosition, now, one, run, transaction, uid, type Row } from './db.ts';

const PORT = Number(process.env.PORT || 3001);
const SESSION_AGE = 30 * 24 * 60 * 60 * 1000;
const UPLOAD_MAX = 8 * 1024 * 1024;
const uploadsDir = join(dataDir, 'uploads');
const distDir=resolve(process.env.ORGANIZE_DIST_DIR||join(process.cwd(),'dist'));
mkdirSync(uploadsDir, { recursive: true });

class HttpError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status=status; } }
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
const required = (value: unknown, label: string, max = 200): string => {
 if (typeof value !== 'string' || !value.trim()) return fail(400, `${label} é obrigatório`);
 if (value.trim().length > max) return fail(400, `${label} excede ${max} caracteres`);
 return value.trim();
};
const optional = (value: unknown, label: string, max = 20000): string | undefined => {
 if (value === undefined) return undefined;
 if (typeof value !== 'string' || value.length > max) return fail(400, `${label} inválido`);
 return value;
};
const enumValue = <T extends string>(value: unknown, values: readonly T[], label: string): T => {
 if (typeof value !== 'string' || !values.includes(value as T)) fail(400, `${label} inválido`);
 return value as T;
};
const iso = (value: unknown, label: string): string | null => {
 if (value === null || value === '') return null;
 if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return fail(400, `${label} inválido`);
 return new Date(value).toISOString();
};
const number = (value: unknown, label: string, min = -Infinity, max = Infinity): number => {
 const parsed = Number(value);
 if (!Number.isFinite(parsed) || parsed < min || parsed > max) fail(400, `${label} inválido`);
 return parsed;
};
const bool = (value: unknown, label: string): number => {
 if (typeof value !== 'boolean') fail(400, `${label} inválido`);
 return value ? 1 : 0;
};
const json = (value: unknown, label: string, max = 20000): string => {
 const encoded = JSON.stringify(value);
 if (encoded === undefined || encoded.length > max) fail(400, `${label} inválido`);
 return encoded;
};
const asObject = (body: unknown): Row => body && typeof body === 'object' && !Array.isArray(body) ? body as Row : fail(400, 'JSON deve ser um objeto');

const BOOLEAN = new Set(['starred','archived','collapsed','due_complete','is_template','completed','enabled']);
function view(row?: Row): Row | null {
 if (!row) return null;
 const result: Row = {};
 for (const [key, value] of Object.entries(row)) {
  if (key.endsWith('_json')) {
   const camel = key.slice(0, -5).replace(/_([a-z])/g, (_, x: string) => x.toUpperCase());
   try { result[camel] = value == null ? null : JSON.parse(String(value)); } catch { result[camel] = null; }
  } else {
   const camel = key.replace(/_([a-z])/g, (_, x: string) => x.toUpperCase());
   result[camel] = BOOLEAN.has(key) ? Boolean(value) : value;
  }
 }
 return result;
}
const views = (rows: Row[]) => rows.map(row => view(row)!);
const get = (table: string, id: string): Row => one(`SELECT * FROM ${table} WHERE id = ?`, id) || fail(404, 'Recurso não encontrado');
const userView = (row: Row) => view({ id: row.id, email: row.email, name: row.name, avatar: row.avatar, created_at: row.created_at });
const boardView = (row: Row, userId: string): Row => ({...view(row)!,starred:Boolean(one('SELECT 1 FROM board_stars WHERE board_id=? AND user_id=?',row.id,userId))});
const boardViews = (rows: Row[], userId: string): Row[] => rows.map(row=>boardView(row,userId));

function send(res: ServerResponse, data: unknown, status = 200): void {
 res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
 res.end(JSON.stringify(data));
}
function serveStatic(req: IncomingMessage,res: ServerResponse,url: URL): void {
 if(!['GET','HEAD'].includes(req.method||'')) return fail(405,'Método não permitido');
 if(!existsSync(distDir)) return fail(404,'Aplicação ainda não compilada');
 let requested:string;
 try { requested=decodeURIComponent(url.pathname); } catch { return fail(400,'Caminho inválido'); }
 if(requested.includes('\\')||requested.split('/').includes('..')) return fail(403,'Caminho inválido');
 const path=resolve(distDir,`.${requested}`);
 const rel=relative(distDir,path);
 if(rel==='..'||rel.startsWith(`..${sep}`)||rel.startsWith(sep)) return fail(403,'Caminho inválido');
 let target=path;
 if(!existsSync(target)||!statSync(target).isFile()) {
  if(extname(requested)) return fail(404,'Arquivo não encontrado');
  target=join(distDir,'index.html');
 }
 if(!existsSync(target)) return fail(404,'Aplicação ainda não compilada');
 const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8'};
 const content=readFileSync(target);
 const revalidate = ['index.html','sw.js','manifest.webmanifest','offline.html'].includes(target.split(sep).at(-1) || '');
 res.writeHead(200,{'Content-Type':mime[extname(target).toLowerCase()]||'application/octet-stream','Content-Length':content.length,'Cache-Control':revalidate?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff'});
 res.end(req.method==='HEAD'?undefined:content);
}
function cookie(req: IncomingMessage, key: string): string | undefined {
 const match = (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${key}=`));
 return match ? decodeURIComponent(match.slice(key.length + 1)) : undefined;
}
function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function sessionUser(req: IncomingMessage): Row | undefined {
 const token = cookie(req, 'organize_session');
 if (!token) return undefined;
 return one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?', tokenHash(token), now());
}
function authenticate(req: IncomingMessage): Row { return sessionUser(req) || fail(401, 'Entre na sua conta'); }
function setSession(req: IncomingMessage, res: ServerResponse, userId: string): void {
 const token = randomBytes(32).toString('base64url');
 run('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)', tokenHash(token), userId, new Date(Date.now() + SESSION_AGE).toISOString(), now());
 const secure = Boolean((req.socket as any).encrypted) || process.env.NODE_ENV === 'production';
 res.setHeader('Set-Cookie', `organize_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_AGE / 1000}${secure ? '; Secure' : ''}`);
}
function clearSession(req: IncomingMessage, res: ServerResponse): void {
 const token = cookie(req, 'organize_session');
 if (token) run('DELETE FROM sessions WHERE token_hash=?', tokenHash(token));
 res.setHeader('Set-Cookie', 'organize_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}
function passwordHash(password: string, salt: string): string { return scryptSync(password, salt, 64).toString('hex'); }
function checkPassword(password: string, salt: string, hash: string): boolean {
 const actual = Buffer.from(passwordHash(password, salt), 'hex');
 const expected = Buffer.from(hash, 'hex');
 return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function readBody(req: IncomingMessage, max = 12 * 1024 * 1024): Promise<Row> {
 let size = 0; const chunks: Buffer[] = [];
 for await (const chunk of req) {
  size += (chunk as Buffer).length;
  if (size > max) fail(413, 'Conteúdo muito grande');
  chunks.push(chunk as Buffer);
 }
 try { return asObject(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
 catch (error) { if (error instanceof HttpError) throw error; return fail(400, 'JSON inválido'); }
}
function csrf(req: IncomingMessage): void {
 if (!['POST','PATCH','PUT','DELETE'].includes(req.method || '')) return;
 const origin = req.headers.origin;
 if (origin) {
  let host: string;
  try { host=new URL(origin).host; } catch { return fail(403,'Origem não autorizada'); }
  if(host!==req.headers.host) fail(403,'Origem não autorizada');
 }
}
function httpUrl(value: unknown, label: string): string {
 const input=required(value,label,2000);
 let parsed: URL; try { parsed=new URL(input); } catch { return fail(400,`${label} inválida`); }
 if(!['http:','https:'].includes(parsed.protocol)) fail(400,`${label} inválida`);
 return parsed.toString();
}
function workspaceRole(workspaceId: string, userId: string): string | undefined {
 return one('SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?', workspaceId, userId)?.role;
}
function workspaceAccess(workspaceId: string, userId: string, write = false): Row {
 const workspace = get('workspaces', workspaceId);
 const role = workspaceRole(workspaceId, userId);
 if (!role) fail(403, 'Acesso negado à área de trabalho');
 if (write && role === 'observer') fail(403, 'Permissão somente de leitura');
 return workspace;
}
function boardRole(board: Row, userId: string): string | undefined {
 const wr = workspaceRole(board.workspace_id, userId);
 const br = one('SELECT role FROM board_members WHERE board_id=? AND user_id=?', board.id, userId)?.role;
 if (wr === 'owner' || wr === 'admin') return 'admin';
 if (board.visibility === 'private') return br;
 return br || wr || (board.visibility === 'public' ? 'observer' : undefined);
}
function boardAccess(boardId: string, userId: string, write = false, admin = false): Row {
 const board = get('boards', boardId);
 const role = boardRole(board, userId);
 if (!role) fail(403, 'Acesso negado ao quadro');
 if (write && role === 'observer') fail(403, 'Permissão somente de leitura');
 if (admin && role !== 'admin') fail(403, 'Somente administradores podem executar esta ação');
 return board;
}
function parentBoard(table: string, id: string, userId: string, write = false): [Row,Row] {
 const entity = get(table, id);
 const boardId = table === 'cards' || table === 'lists' || table === 'labels' || table === 'custom_fields' || table === 'automations' ? entity.board_id : null;
 if (!boardId) fail(500, 'Relação inválida');
 return [entity, boardAccess(boardId, userId, write)];
}
function cardFromChild(table: string, id: string, userId: string, write = false): [Row,Row,Row] {
 const child = get(table, id);
 const card = get('cards', child.card_id);
 return [child, card, boardAccess(card.board_id, userId, write)];
}
function activity(board: Row, userId: string, type: string, detail: Row = {}, cardId?: string): void {
 run('INSERT INTO activity(id,workspace_id,board_id,card_id,user_id,type,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)', uid(), board.workspace_id, board.id, cardId || null, userId, type, json(detail, 'activity'), now());
}
function notify(userId: string, type: string, body: Row): void {
 run('INSERT INTO notifications(id,user_id,type,body_json,read_at,created_at) VALUES(?,?,?,?,NULL,?)', uid(), userId, type, json(body, 'notification'), now());
 emitUser(userId, { type: 'notification' });
}

const subscribers = new Map<string, Set<ServerResponse>>();
function emitUser(userId: string, event: Row): void {
 for (const res of subscribers.get(userId) || []) res.write(`data: ${JSON.stringify(event)}\n\n`);
}
function emitBoard(board: Row, type: string, entityId?: string): void {
 const members = all('SELECT wm.user_id FROM workspace_members wm WHERE wm.workspace_id=? UNION SELECT bm.user_id FROM board_members bm WHERE bm.board_id=?', board.workspace_id, board.id);
 for (const member of members) if (boardRole(board, member.user_id)) emitUser(member.user_id, { type, boardId: board.id, workspaceId: board.workspace_id, entityId });
}
function openEvents(req: IncomingMessage, res: ServerResponse, user: Row): void {
 res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
 res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
 const set = subscribers.get(user.id) || new Set<ServerResponse>(); set.add(res); subscribers.set(user.id, set);
 const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
 req.on('close', () => { clearInterval(heartbeat); set.delete(res); if (!set.size) subscribers.delete(user.id); });
}

function cardDetails(cardId: string, userId: string): Row {
 const [card] = parentBoard('cards', cardId, userId);
 const result = view(card)!;
 result.members = views(all('SELECT u.id,u.name,u.email,u.avatar FROM card_members cm JOIN users u ON u.id=cm.user_id WHERE cm.card_id=?', cardId));
 result.memberIds = result.members.map((member: Row) => member.id);
 result.labels = views(all('SELECT l.* FROM card_labels cl JOIN labels l ON l.id=cl.label_id WHERE cl.card_id=?', cardId));
 result.labelIds = result.labels.map((label: Row) => label.id);
 result.checklists = views(all('SELECT * FROM checklists WHERE card_id=? ORDER BY position', cardId)).map((checklist: Row) => ({ ...checklist, items: views(all('SELECT * FROM checklist_items WHERE checklist_id=? ORDER BY position', checklist.id)) }));
 result.comments = views(all('SELECT c.*,u.name AS user_name,u.avatar AS user_avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE c.card_id=? ORDER BY c.created_at', cardId));
 result.attachments = views(all('SELECT id,card_id,name,url,mime,size,created_by,created_at FROM attachments WHERE card_id=? ORDER BY created_at', cardId)).map(item=>({...item,downloadUrl:`/api/attachments/${item.id}/download`}));
 result.customValues = views(all('SELECT * FROM custom_values WHERE card_id=?', cardId));
 result.watching = Boolean(one("SELECT 1 FROM watches WHERE user_id=? AND target_type='card' AND target_id=?", userId, cardId));
 result.template = result.isTemplate;
 result.cover = result.cover || null;
 result.coverColor = result.cover?.color || null;
 return result;
}
function boardDetails(boardId: string, userId: string): Row {
 const board = boardAccess(boardId, userId);
 const cards = views(all('SELECT * FROM cards WHERE board_id=? ORDER BY position', boardId));
 for (const card of cards) {
  card.template = card.isTemplate; card.coverColor = card.cover?.color || null;
  card.memberIds = all('SELECT user_id FROM card_members WHERE card_id=?', card.id).map(row => row.user_id);
  card.labelIds = all('SELECT label_id FROM card_labels WHERE card_id=?', card.id).map(row => row.label_id);
  const progress = one('SELECT COUNT(*) AS total, SUM(ci.completed) AS done FROM checklist_items ci JOIN checklists c ON c.id=ci.checklist_id WHERE c.card_id=?', card.id)!;
  card.checklistProgress = { total: Number(progress.total), done: Number(progress.done || 0) };
  card.commentCount = Number(one('SELECT COUNT(*) AS n FROM comments WHERE card_id=?', card.id)?.n || 0);
  card.attachmentCount = Number(one('SELECT COUNT(*) AS n FROM attachments WHERE card_id=?', card.id)?.n || 0);
 }
 return {
  board: { ...boardView(board,userId), role: boardRole(board, userId), watching: Boolean(one("SELECT 1 FROM watches WHERE user_id=? AND target_type='board' AND target_id=?", userId, boardId)) },
  lists: views(all('SELECT * FROM lists WHERE board_id=? ORDER BY position', boardId)), cards,
  labels: views(all('SELECT * FROM labels WHERE board_id=? ORDER BY created_at', boardId)),
  members: boardMembers(board,userId),
  customFields: views(all('SELECT * FROM custom_fields WHERE board_id=? ORDER BY position', boardId)),
  automations: views(all('SELECT * FROM automations WHERE board_id=? ORDER BY created_at', boardId)),
 };
}
function boardMembers(board: Row, viewerId: string): Row[] {
 const canSeeEmails=Boolean(workspaceRole(board.workspace_id,viewerId));
 return views(all('SELECT u.id,u.name,u.email,u.avatar FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=?',board.workspace_id))
  .filter(member=>Boolean(boardRole(board,member.id)))
  .map(member=>({...member,email:canSeeEmails?member.email:undefined,role:boardRole(board,member.id)}));
}

function patch(table: string, id: string, body: Row, allowed: Record<string, (value: unknown) => unknown>): Row {
 const fields: string[] = []; const values: unknown[] = [];
 for (const [key, validate] of Object.entries(allowed)) {
  if (body[key] === undefined) continue;
  const column = key.replace(/[A-Z]/g, x => `_${x.toLowerCase()}`);
  fields.push(`${column}=?`); values.push(validate(body[key]));
 }
 if (!fields.length) fail(400, 'Nenhum campo válido informado');
 if (['boards','lists','cards','workspaces','comments'].includes(table)) { fields.push('updated_at=?'); values.push(now()); }
 run(`UPDATE ${table} SET ${fields.join(',')} WHERE id=?`, ...values, id);
 return view(get(table, id))!;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
 csrf(req);
 const protocol = (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
 const url = new URL(req.url || '/', `${protocol}://${req.headers.host || 'localhost'}`);
 const path = url.pathname;
 const method = req.method || 'GET';
 const parts = path.split('/').filter(Boolean);
 if (parts[0] !== 'api') return serveStatic(req,res,url);
 const body = ['POST','PATCH','PUT'].includes(method) ? await readBody(req) : {};

 // Auth and account
 if (method === 'GET' && path === '/api/health') return send(res, { ok: true, database: 'sqlite' });
 if (method === 'GET' && path === '/api/me') {
  const user = sessionUser(req);
  return send(res, { user: user ? userView(user) : null });
 }
 if (method === 'POST' && path === '/api/auth/register') {
  const name = required(body.name, 'Nome', 100);
  const email = required(body.email, 'E-mail', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'E-mail inválido');
  const password = required(body.password, 'Senha', 500);
  if (password.length < 8) fail(400, 'Senha deve ter pelo menos 8 caracteres');
  if (one('SELECT 1 FROM users WHERE email=?', email)) fail(409, 'E-mail já cadastrado');
  const id = uid(), salt = randomBytes(16).toString('hex'), time = now();
  transaction(() => {
   run('INSERT INTO users(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)', id,email,name,passwordHash(password,salt),salt,time);
   const workspaceId = uid();
   run('INSERT INTO workspaces(id,name,description,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?)', workspaceId,`${name.split(' ')[0]} Workspace`,'',id,time,time);
   run('INSERT INTO workspace_members(workspace_id,user_id,role,joined_at) VALUES(?,?,?,?)', workspaceId,id,'owner',time);
  });
  setSession(req,res,id);
  return send(res, { user: userView(get('users',id)) }, 201);
 }
 if (method === 'POST' && path === '/api/auth/login') {
  const email = required(body.email, 'E-mail', 254).toLowerCase();
  const password = required(body.password, 'Senha', 500);
  const user = one('SELECT * FROM users WHERE email=?', email);
  if (!user || !checkPassword(password,user.salt,user.password_hash)) return fail(401, 'E-mail ou senha inválidos');
  setSession(req,res,user.id);
  return send(res, { user: userView(user) });
 }
 if (method === 'POST' && path === '/api/auth/logout') { clearSession(req,res); return send(res,{ok:true}); }
 const user = authenticate(req);
 if (method === 'GET' && path === '/api/events') return openEvents(req,res,user);
 if (method === 'GET' && path === '/api/bootstrap') {
  const workspaces = views(all('SELECT w.*,wm.role FROM workspaces w JOIN workspace_members wm ON wm.workspace_id=w.id WHERE wm.user_id=? ORDER BY w.created_at', user.id));
  const boards = boardViews(all(`SELECT b.* FROM boards b JOIN workspace_members wm ON wm.workspace_id=b.workspace_id AND wm.user_id=?
   WHERE b.archived=0 AND (b.visibility!='private' OR EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id=b.id AND bm.user_id=?) OR wm.role IN ('owner','admin'))
   ORDER BY b.updated_at DESC`,user.id,user.id),user.id).sort((a,b)=>Number(b.starred)-Number(a.starred));
  return send(res, { user:userView(user), workspaces, boards, notifications:views(all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',user.id)), inbox:views(all('SELECT * FROM inbox_items WHERE user_id=? AND archived=0 ORDER BY created_at DESC',user.id)) });
 }
 if (method === 'PATCH' && path === '/api/me') {
  if(body.email!==undefined) {
   const email=required(body.email,'E-mail',254).toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'E-mail inválido');
   if(one('SELECT 1 FROM users WHERE email=? AND id!=?',email,user.id)) fail(409,'E-mail já cadastrado');
  }
  const update = patch('users', user.id, body, { name:value=>required(value,'Nome',100), email:value=>required(value,'E-mail',254).toLowerCase(), avatar:value=>optional(value,'Avatar',2000) || null });
  return send(res,{user:userView(update)});
 }
 if (method === 'POST' && path === '/api/me/password') {
  const oldPassword = required(body.oldPassword,'Senha atual',500), newPassword = required(body.newPassword,'Nova senha',500);
  if (!checkPassword(oldPassword,user.salt,user.password_hash)) fail(401,'Senha atual incorreta');
  if (newPassword.length < 8) fail(400,'Nova senha deve ter pelo menos 8 caracteres');
  const salt=randomBytes(16).toString('hex');
  run('UPDATE users SET password_hash=?,salt=? WHERE id=?',passwordHash(newPassword,salt),salt,user.id);
  run('DELETE FROM sessions WHERE user_id=?',user.id); setSession(req,res,user.id);
  return send(res,{ok:true});
 }
 if (method === 'GET' && path === '/api/preferences') return send(res,{preferences:JSON.parse(one('SELECT value_json FROM preferences WHERE user_id=?',user.id)?.value_json || '{}')});
 if (method === 'PUT' && path === '/api/preferences') {
  const prefs=json(body,'Preferências');
  run('INSERT INTO preferences(user_id,value_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET value_json=excluded.value_json',user.id,prefs);
  return send(res,{preferences:JSON.parse(prefs)});
 }
 if (method==='GET' && path==='/api/export') {
  const workspaces=all('SELECT w.* FROM workspaces w JOIN workspace_members wm ON wm.workspace_id=w.id WHERE wm.user_id=? ORDER BY w.created_at',user.id)
   .map(workspace=>exportWorkspace(workspace.id,user.id));
  return send(res,{version:1,exportedAt:now(),includesUploadedFiles:false,workspaces});
 }
 if (method==='POST' && path==='/api/import') {
  const sources=Array.isArray(body.workspaces)?body.workspaces:[body];
  if(body.version!==1||!sources.length||sources.length>100) fail(400,'Formato de importação inválido');
  const workspaces:Row[]=[],boards:Row[]=[];
  transaction(()=>{
   for(const source of sources) {
    const data=asObject(source), original=asObject(data.workspace);
    if(!Array.isArray(data.boards)) fail(400,'Formato de importação inválido');
    const target=uid(),time=now();
    run('INSERT INTO workspaces(id,name,description,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?)',target,required(original.name,'Área de trabalho',100),optional(original.description,'Descrição',5000)||'',user.id,time,time);
    run('INSERT INTO workspace_members(workspace_id,user_id,role,joined_at) VALUES(?,?,?,?)',target,user.id,'owner',time);
    const imported=importWorkspace(target,user.id,data,false);
    workspaces.push({workspace:view(get('workspaces',target)),boards:imported}); boards.push(...imported);
   }
  });
  for(const board of boards) emitBoard(get('boards',board.id),'board.imported',board.id);
  return send(res,{workspaces,boards,workspaceId:workspaces.length===1?workspaces[0].workspace.id:undefined},201);
 }

 // Workspaces, members, invitations, collections and export
 if (method === 'GET' && path === '/api/workspaces') {
  return send(res,{workspaces:views(all('SELECT w.*,wm.role FROM workspaces w JOIN workspace_members wm ON wm.workspace_id=w.id WHERE wm.user_id=? ORDER BY w.created_at',user.id))});
 }
 if (method === 'POST' && path === '/api/workspaces') {
  const id=uid(), time=now(), name=required(body.name,'Nome',100);
  transaction(()=>{
   run('INSERT INTO workspaces(id,name,description,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?)',id,name,optional(body.description,'Descrição',5000)||'',user.id,time,time);
   run('INSERT INTO workspace_members(workspace_id,user_id,role,joined_at) VALUES(?,?,?,?)',id,user.id,'owner',time);
  });
  return send(res,{workspace:view(get('workspaces',id))},201);
 }
 if (parts[1] === 'workspaces' && parts[2]) {
  const id=parts[2];
  if (method === 'GET' && parts.length === 3) {
   const workspace=workspaceAccess(id,user.id);
   return send(res,{workspace:{...view(workspace),role:workspaceRole(id,user.id)},members:views(all('SELECT u.id,u.name,u.email,u.avatar,wm.role FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=?',id)),boards:boardViews(all(`SELECT b.* FROM boards b WHERE b.workspace_id=? AND (b.visibility!='private' OR EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id=b.id AND bm.user_id=?) OR ? IN ('owner','admin'))`,id,user.id,workspaceRole(id,user.id)),user.id)});
  }
  if (method === 'PATCH' && parts.length === 3) {
   const role=workspaceRole(id,user.id); if (!['owner','admin'].includes(role||'')) fail(403,'Somente administradores podem alterar a área de trabalho');
   return send(res,{workspace:patch('workspaces',id,body,{name:value=>required(value,'Nome',100),description:value=>optional(value,'Descrição',5000)||'',settingsJson:value=>json(value,'Configurações')})});
  }
  if (method === 'GET' && parts[3] === 'members') {
   workspaceAccess(id,user.id); return send(res,{members:views(all('SELECT u.id,u.name,u.email,u.avatar,wm.role FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=?',id))});
  }
  if (method === 'PATCH' && parts[3] === 'members' && parts[4]) {
   const role=workspaceRole(id,user.id); if (!['owner','admin'].includes(role||'')) fail(403,'Permissão insuficiente');
   const member=get('users',parts[4]); const current=workspaceRole(id,member.id);
   if (!current) fail(404,'Membro não encontrado');
   if (current==='owner') fail(403,'Não é possível alterar proprietário');
   const next=enumValue(body.role,['admin','member','observer'] as const,'Papel');
   if (role!=='owner' && (current==='admin'||next==='admin')) fail(403,'Somente proprietário altera administradores');
   run('UPDATE workspace_members SET role=? WHERE workspace_id=? AND user_id=?',next,id,member.id);
   return send(res,{member:{...userView(member),role:next}});
  }
  if (method === 'DELETE' && parts[3] === 'members' && parts[4]) {
   const role=workspaceRole(id,user.id), target=workspaceRole(id,parts[4]);
   if (!target) fail(404,'Membro não encontrado');
   if (target==='owner') fail(403,'Não é possível remover proprietário');
   if (user.id!==parts[4] && !['owner','admin'].includes(role||'')) fail(403,'Permissão insuficiente');
   if (role!=='owner' && target==='admin') fail(403,'Somente proprietário remove administradores');
   run('DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?',id,parts[4]);
   return send(res,{ok:true});
  }
  if (method === 'POST' && parts[3] === 'invites') {
   const role=workspaceRole(id,user.id); if (!['owner','admin'].includes(role||'')) fail(403,'Somente administradores podem convidar');
   const email=required(body.email,'E-mail',254).toLowerCase();
   if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'E-mail inválido');
   const inviteRole=enumValue(body.role||'member',['admin','member','observer'] as const,'Papel');
   if (inviteRole==='admin'&&role!=='owner') fail(403,'Somente proprietário convida administradores');
   const boardId=body.boardId?required(body.boardId,'Quadro'):null;
   if(boardId) { const board=get('boards',boardId); if(board.workspace_id!==id) fail(400,'Quadro fora da área de trabalho'); }
   const existingMember=one('SELECT u.id FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=? AND u.email=?',id,email);
   if (existingMember && !boardId) fail(409,'Pessoa já é membro');
   if (existingMember && boardId && one('SELECT 1 FROM board_members WHERE board_id=? AND user_id=?',boardId,existingMember.id)) fail(409,'Pessoa já participa do quadro');
   const token=randomBytes(24).toString('base64url'), inviteId=uid(), expiresAt=new Date(Date.now()+7*86400000).toISOString();
   run('INSERT INTO invites(id,workspace_id,board_id,email,role,token_hash,invited_by,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',inviteId,id,boardId,email,inviteRole,tokenHash(token),user.id,expiresAt,now());
   const recipient=one('SELECT id FROM users WHERE email=?',email);
   if (recipient) notify(recipient.id,'invite',{workspaceId:id,inviteId});
   return send(res,{invite:{id:inviteId,workspaceId:id,boardId,email,role:inviteRole,expiresAt,token,inviteUrl:`${url.origin}/invite/${token}`}},201);
  }
  if (method === 'GET' && parts[3] === 'invites') {
   const role=workspaceRole(id,user.id); if (!['owner','admin'].includes(role||'')) fail(403,'Permissão insuficiente');
   return send(res,{invites:views(all('SELECT id,workspace_id,board_id,email,role,invited_by,expires_at,accepted_at,created_at FROM invites WHERE workspace_id=? ORDER BY created_at DESC',id))});
  }
  if (method === 'GET' && parts[3] === 'export') {
   workspaceAccess(id,user.id);
   return send(res,{version:1,exportedAt:now(),includesUploadedFiles:false,...exportWorkspace(id,user.id)});
  }
  if (method === 'POST' && parts[3] === 'import') {
   workspaceAccess(id,user.id,true);
   const data=asObject(body.data||body);
   if (data.version!==1 || !Array.isArray(data.boards)) fail(400,'Formato de importação inválido');
   const imported=importWorkspace(id,user.id,data);
   return send(res,{boards:imported},201);
  }
  if (method === 'POST' && parts[3] === 'collections') {
   workspaceAccess(id,user.id,true); const collectionId=uid();
   run('INSERT INTO collections(id,workspace_id,name,created_at) VALUES(?,?,?,?)',collectionId,id,required(body.name,'Nome',100),now());
   return send(res,{collection:view(get('collections',collectionId))},201);
  }
  if (method === 'GET' && parts[3] === 'collections') {
   workspaceAccess(id,user.id); const collections=views(all('SELECT * FROM collections WHERE workspace_id=?',id));
   for(const collection of collections) collection.boardIds=all('SELECT board_id FROM collection_boards WHERE collection_id=?',collection.id).map(row=>row.board_id);
   return send(res,{collections});
  }
 }
 if (method === 'GET' && path === '/api/invites') {
  return send(res,{invites:views(all('SELECT i.id,i.workspace_id,i.board_id,i.email,i.role,i.expires_at,i.created_at,w.name AS workspace_name FROM invites i JOIN workspaces w ON w.id=i.workspace_id WHERE i.email=? AND i.accepted_at IS NULL AND i.expires_at>?',user.email,now()))});
 }
 if (parts[1]==='invites' && parts[2] && parts[3]==='accept' && method==='POST') {
  const invite=one('SELECT * FROM invites WHERE token_hash=?',tokenHash(parts[2]));
  if (!invite||invite.accepted_at||invite.expires_at<now()) return fail(404,'Convite inválido ou expirado');
  if (invite.email.toLowerCase()!==user.email.toLowerCase()) fail(403,'Este convite pertence a outra conta');
  transaction(()=>{
   run('INSERT OR IGNORE INTO workspace_members(workspace_id,user_id,role,joined_at) VALUES(?,?,?,?)',invite.workspace_id,user.id,invite.role,now());
   if(invite.board_id && one('SELECT 1 FROM boards WHERE id=? AND workspace_id=?',invite.board_id,invite.workspace_id)) run('INSERT INTO board_members(board_id,user_id,role,joined_at) VALUES(?,?,?,?) ON CONFLICT(board_id,user_id) DO UPDATE SET role=excluded.role',invite.board_id,user.id,invite.role,now());
   run('UPDATE invites SET accepted_at=? WHERE id=?',now(),invite.id);
  });
  emitUser(invite.invited_by,{type:'workspace.member_added',workspaceId:invite.workspace_id});
  if(invite.board_id) emitBoard(get('boards',invite.board_id),'board.member_added',user.id);
  return send(res,{workspace:view(get('workspaces',invite.workspace_id))});
 }

 // Boards, lists and cards
 if (method==='GET' && path==='/api/boards') {
  return send(res,{boards:boardViews(all(`SELECT b.* FROM boards b JOIN workspace_members wm ON wm.workspace_id=b.workspace_id AND wm.user_id=?
   WHERE (b.visibility!='private' OR EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id=b.id AND bm.user_id=?) OR wm.role IN ('owner','admin')) ORDER BY b.updated_at DESC`,user.id,user.id),user.id)});
 }
 if (method==='POST' && path==='/api/boards') {
  const workspaceId=required(body.workspaceId,'Área de trabalho'); workspaceAccess(workspaceId,user.id,true);
  const title=required(body.title,'Título',200), visibility=enumValue(body.visibility||'workspace',['private','workspace','public'] as const,'Visibilidade');
  const id=uid(), time=now();
  transaction(()=>{
   run('INSERT INTO boards(id,workspace_id,title,description,visibility,background,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',id,workspaceId,title,optional(body.description,'Descrição',5000)||'',visibility,optional(body.background,'Fundo',200)||'#0c66e4',user.id,time,time);
   run('INSERT INTO board_members(board_id,user_id,role,joined_at) VALUES(?,?,?,?)',id,user.id,'admin',time);
  });
  emitBoard(get('boards',id),'board.created',id);
  return send(res,{board:boardView(get('boards',id),user.id)},201);
 }
 if (parts[1]==='boards' && parts[2]) {
  const boardId=parts[2];
  if (method==='GET' && parts.length===3) return send(res,boardDetails(boardId,user.id));
  if (method==='PATCH' && parts.length===3) {
   const board=boardAccess(boardId,user.id);
   if(body.settings!==undefined && body.settingsJson===undefined) body.settingsJson=body.settings;
   if ((body.visibility!==undefined || body.archived!==undefined || body.settings!==undefined || body.settingsJson!==undefined) && boardRole(board,user.id)!=='admin') fail(403,'Somente administradores alteram estas configurações');
   const fields=['title','description','visibility','background','archived','settingsJson'];
   const hasBoardFields=fields.some(key=>body[key]!==undefined);
   if(!hasBoardFields && body.starred===undefined) fail(400,'Nenhum campo válido informado');
   if(hasBoardFields) {
    boardAccess(boardId,user.id,true);
    patch('boards',boardId,body,{title:value=>required(value,'Título',200),description:value=>optional(value,'Descrição',5000)||'',visibility:value=>enumValue(value,['private','workspace','public'] as const,'Visibilidade'),background:value=>required(value,'Fundo',200),archived:value=>bool(value,'Arquivado'),settingsJson:value=>json(value,'Configurações')});
   }
   if(body.starred!==undefined) {
    if(bool(body.starred,'Favorito')) run('INSERT OR IGNORE INTO board_stars(board_id,user_id) VALUES(?,?)',boardId,user.id);
    else run('DELETE FROM board_stars WHERE board_id=? AND user_id=?',boardId,user.id);
   }
   emitBoard(board,'board.updated',boardId); return send(res,{board:boardView(get('boards',boardId),user.id)});
  }
  if (method==='GET' && parts[3]==='activity') {
   boardAccess(boardId,user.id); return send(res,{activity:views(all('SELECT a.*,u.name AS user_name FROM activity a JOIN users u ON u.id=a.user_id WHERE a.board_id=? ORDER BY a.created_at DESC LIMIT 200',boardId))});
  }
  if (method==='GET' && parts[3]==='members') {
   const board=boardAccess(boardId,user.id); return send(res,{members:boardMembers(board,user.id)});
  }
  if (method==='POST' && parts[3]==='members') {
   const board=boardAccess(boardId,user.id,false,true);
   const target=one('SELECT * FROM users WHERE email=?',required(body.email,'E-mail',254).toLowerCase());
   if (!target) return fail(404,'Usuário não encontrado');
   if (!workspaceRole(board.workspace_id,target.id)) fail(400,'Convide a pessoa para a área de trabalho primeiro');
   const role=enumValue(body.role||'member',['admin','member','observer'] as const,'Papel');
   run('INSERT INTO board_members(board_id,user_id,role,joined_at) VALUES(?,?,?,?) ON CONFLICT(board_id,user_id) DO UPDATE SET role=excluded.role',boardId,target.id,role,now());
   notify(target.id,'board_invite',{boardId,workspaceId:board.workspace_id}); emitBoard(board,'board.member_added',target.id);
   return send(res,{member:{...userView(target),role}},201);
  }
  if (method==='DELETE' && parts[3]==='members' && parts[4]) {
   const board=boardAccess(boardId,user.id);
   if (parts[4]!==user.id && boardRole(board,user.id)!=='admin') fail(403,'Permissão insuficiente');
   if (parts[4]===board.created_by) fail(403,'Não é possível remover o criador do quadro');
   run('DELETE FROM board_members WHERE board_id=? AND user_id=?',boardId,parts[4]);
   emitBoard(board,'board.member_removed',parts[4]); return send(res,{ok:true});
  }
  if (method==='POST' && parts[3]==='lists') {
   const board=boardAccess(boardId,user.id,true), title=required(body.title,'Título',200), id=uid(), time=now();
   const position=body.position===undefined?maxPosition('lists','board_id',boardId):number(body.position,'Posição');
   run('INSERT INTO lists(id,board_id,title,position,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,boardId,title,position,optional(body.color,'Cor',50)||null,time,time);
   activity(board,user.id,'list.created',{listId:id,title}); emitBoard(board,'list.created',id);
   return send(res,{list:view(get('lists',id))},201);
  }
  if (method==='POST' && parts[3]==='labels') {
   const board=boardAccess(boardId,user.id,true), id=uid();
   run('INSERT INTO labels(id,board_id,name,color,created_at) VALUES(?,?,?,?,?)',id,boardId,optional(body.name,'Nome',100)||'',required(body.color,'Cor',50),now());
   emitBoard(board,'label.created',id); return send(res,{label:view(get('labels',id))},201);
  }
  if (method==='POST' && parts[3]==='custom-fields') {
   const board=boardAccess(boardId,user.id,true), id=uid();
   const type=enumValue(body.type,['text','number','date','checkbox','select'] as const,'Tipo');
   const options=Array.isArray(body.options)?body.options:[];
   run('INSERT INTO custom_fields(id,board_id,name,type,options_json,position) VALUES(?,?,?,?,?,?)',id,boardId,required(body.name,'Nome',100),type,json(options,'Opções',5000),maxPosition('custom_fields','board_id',boardId));
   emitBoard(board,'custom_field.created',id); return send(res,{customField:view(get('custom_fields',id))},201);
  }
  if (method==='POST' && parts[3]==='automations') {
   const board=boardAccess(boardId,user.id,false,true), id=uid();
   const trigger=enumValue(body.trigger,['card_created','card_moved','due','scheduled','button'] as const,'Gatilho');
   if (!Array.isArray(body.actions)) fail(400,'Ações inválidas');
   const actions=validateActions(body.actions);
   run('INSERT INTO automations(id,board_id,name,trigger,condition_json,actions_json,enabled,created_at) VALUES(?,?,?,?,?,?,?,?)',id,boardId,required(body.name,'Nome',100),trigger,json(body.condition||{},'Condição'),json(actions,'Ações'),body.enabled===false?0:1,now());
   emitBoard(board,'automation.created',id); return send(res,{automation:view(get('automations',id))},201);
  }
  if (method==='GET' && parts[3]==='cards') {
   boardAccess(boardId,user.id); return send(res,{cards:views(all('SELECT * FROM cards WHERE board_id=? ORDER BY position',boardId))});
  }
  if (parts[3]==='watch' && method==='POST') {
   boardAccess(boardId,user.id); run("INSERT OR IGNORE INTO watches(user_id,target_type,target_id) VALUES(?,'board',?)",user.id,boardId);
   return send(res,{watching:true});
  }
  if (parts[3]==='watch' && method==='DELETE') {
   boardAccess(boardId,user.id); run("DELETE FROM watches WHERE user_id=? AND target_type='board' AND target_id=?",user.id,boardId);
   return send(res,{watching:false});
  }
  if (method==='GET' && parts[3]==='templates') {
   boardAccess(boardId,user.id); return send(res,{cards:views(all('SELECT * FROM cards WHERE board_id=? AND is_template=1 AND archived=0 ORDER BY title',boardId))});
  }
 }
 if (parts[1]==='lists' && parts[2]) {
  const listId=parts[2], [list,board]=parentBoard('lists',listId,user.id,method!=='GET');
  if (method==='PATCH' && parts.length===3) {
   const result=patch('lists',listId,body,{title:value=>required(value,'Título',200),position:value=>number(value,'Posição'),color:value=>value===null?null:required(value,'Cor',50),collapsed:value=>bool(value,'Recolhida'),archived:value=>bool(value,'Arquivada')});
   activity(board,user.id,'list.updated',{listId}); emitBoard(board,'list.updated',listId); return send(res,{list:result});
  }
  if (method==='POST' && parts[3]==='cards') {
   if (list.archived) fail(400,'Lista arquivada');
   const title=required(body.title,'Título',500), id=uid(), time=now();
   const position=body.position===undefined?maxPosition('cards','list_id',listId):number(body.position,'Posição');
   const cover=body.cover!==undefined?body.cover:(body.coverColor?{color:required(body.coverColor,'Cor',50)}:null);
   run('INSERT INTO cards(id,board_id,list_id,title,description,position,cover_json,start_at,due_at,is_template,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',id,board.id,listId,title,optional(body.description,'Descrição',20000)||'',position,cover?json(cover,'Capa'):null,body.startAt?iso(body.startAt,'Início'):null,body.dueAt?iso(body.dueAt,'Entrega'):null,body.template===true?1:0,user.id,time,time);
   activity(board,user.id,'card.created',{cardId:id,title,listId},id); emitBoard(board,'card.created',id);
   applyAutomations(board,'card_created',get('cards',id));
   return send(res,{card:cardDetails(id,user.id)},201);
  }
  if (method==='GET' && parts[3]==='cards') return send(res,{cards:views(all('SELECT * FROM cards WHERE list_id=? ORDER BY position',listId))});
  if (method==='POST' && parts[3]==='copy') {
   const copyId=uid(), time=now(), title=body.title?required(body.title,'Título',200):`${list.title} (cópia)`;
   run('INSERT INTO lists(id,board_id,title,position,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',copyId,board.id,title,maxPosition('lists','board_id',board.id),list.color,time,time);
   for(const sourceCard of all('SELECT * FROM cards WHERE list_id=? AND archived=0 ORDER BY position',listId)) copyCard(sourceCard,copyId,user.id,sourceCard.title);
   activity(board,user.id,'list.copied',{fromListId:listId,listId:copyId}); emitBoard(board,'list.created',copyId);
   return send(res,{list:view(get('lists',copyId))},201);
  }
  if (parts[3]==='watch' && method==='POST') {
   run("INSERT OR IGNORE INTO watches(user_id,target_type,target_id) VALUES(?,'list',?)",user.id,listId);
   return send(res,{watching:true});
  }
  if (parts[3]==='watch' && method==='DELETE') {
   run("DELETE FROM watches WHERE user_id=? AND target_type='list' AND target_id=?",user.id,listId);
   return send(res,{watching:false});
  }
 }
 if (parts[1]==='cards' && parts[2]) {
  const cardId=parts[2], [card,board]=parentBoard('cards',cardId,user.id,method!=='GET');
  if (method==='GET' && parts.length===3) {
   const detail=cardDetails(cardId,user.id);
   return send(res,{card:detail,checklists:detail.checklists,comments:detail.comments,attachments:detail.attachments,fieldValues:detail.customValues,activity:views(all('SELECT a.*,u.name AS user_name FROM activity a JOIN users u ON u.id=a.user_id WHERE a.card_id=? ORDER BY a.created_at DESC LIMIT 200',cardId))});
  }
  if (method==='PATCH' && parts.length===3) {
   const oldListId=card.list_id;
   if(body.template!==undefined && body.isTemplate===undefined) body.isTemplate=body.template;
   if(body.cover!==undefined && body.coverJson===undefined) body.coverJson=body.cover;
   if(body.coverColor!==undefined && body.coverJson===undefined) body.coverJson=body.coverColor?{color:required(body.coverColor,'Cor',50)}:null;
   if(body.location!==undefined && body.locationJson===undefined) body.locationJson=body.location;
   if(body.recurrence!==undefined && body.recurrenceJson===undefined) body.recurrenceJson=body.recurrence;
   if (body.listId!==undefined) {
    const list=get('lists',required(body.listId,'Lista'));
    if (list.board_id!==board.id || list.archived) fail(400,'Lista de destino inválida');
   }
   const result=patch('cards',cardId,body,{title:value=>required(value,'Título',500),description:value=>optional(value,'Descrição',20000)||'',listId:value=>required(value,'Lista'),position:value=>number(value,'Posição'),coverJson:value=>value===null?null:json(value,'Capa'),startAt:value=>iso(value,'Início'),dueAt:value=>iso(value,'Entrega'),dueComplete:value=>bool(value,'Concluída no prazo'),reminderMinutes:value=>value===null?null:number(value,'Lembrete',0,525600),recurrenceJson:value=>value===null?null:json(value,'Recorrência'),isTemplate:value=>bool(value,'Modelo'),completed:value=>bool(value,'Concluído'),archived:value=>bool(value,'Arquivado'),locationJson:value=>value===null?null:json(value,'Localização')});
   activity(board,user.id,oldListId!==result.listId?'card.moved':'card.updated',{cardId,fromListId:oldListId,toListId:result.listId},cardId);
   emitBoard(board,oldListId!==result.listId?'card.moved':'card.updated',cardId);
   if (oldListId!==result.listId) applyAutomations(board,'card_moved',get('cards',cardId));
   if (body.completed===true && !card.completed && card.recurrence_json) createRecurringCopy(get('cards',cardId),user.id);
   return send(res,{card:cardDetails(cardId,user.id)});
  }
  if (method==='POST' && parts[3]==='copy') {
   const listId=body.listId?required(body.listId,'Lista'):card.list_id;
   const list=get('lists',listId); if (list.board_id!==board.id) fail(400,'Lista inválida');
   const copyId=copyCard(card,listId,user.id,body.title?required(body.title,'Título',500):card.title);
   activity(board,user.id,'card.copied',{fromCardId:cardId,cardId:copyId},copyId); emitBoard(board,'card.created',copyId);
   return send(res,{card:cardDetails(copyId,user.id)},201);
  }
  if (method==='POST' && parts[3]==='move') {
   const list=get('lists',required(body.listId,'Lista'));
   const destination=boardAccess(list.board_id,user.id,true);
   if(list.archived) fail(400,'Lista de destino arquivada');
   const position=body.position===undefined?maxPosition('cards','list_id',list.id):number(body.position,'Posição');
   transaction(()=>{
    if(destination.id!==board.id) {
     run('DELETE FROM card_labels WHERE card_id=?',cardId);
     run('DELETE FROM custom_values WHERE card_id=?',cardId);
     for(const member of all('SELECT user_id FROM card_members WHERE card_id=?',cardId)) if(!boardRole(destination,member.user_id)) run('DELETE FROM card_members WHERE card_id=? AND user_id=?',cardId,member.user_id);
    }
    run('UPDATE cards SET board_id=?,list_id=?,position=?,updated_at=? WHERE id=?',destination.id,list.id,position,now(),cardId);
   });
   activity(destination,user.id,'card.moved',{cardId,fromBoardId:board.id,fromListId:card.list_id,toListId:list.id},cardId);
   emitBoard(board,'card.moved_out',cardId); emitBoard(destination,'card.moved_in',cardId);
   applyAutomations(destination,'card_moved',get('cards',cardId));
   return send(res,{card:cardDetails(cardId,user.id)});
  }
  if (method==='GET' && parts[3]==='activity') return send(res,{activity:views(all('SELECT a.*,u.name AS user_name FROM activity a JOIN users u ON u.id=a.user_id WHERE a.card_id=? ORDER BY a.created_at DESC LIMIT 200',cardId))});
  if (method==='POST' && parts[3]==='comments') {
   const id=uid(), text=required(body.body,'Comentário',10000), time=now();
   run('INSERT INTO comments(id,card_id,user_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?)',id,cardId,user.id,text,time,time);
   activity(board,user.id,'comment.created',{commentId:id},cardId);
   notifyCard(card,board,user.id,'comment',{cardId,boardId:board.id,commentId:id});
   emitBoard(board,'comment.created',cardId);
   return send(res,{comment:view(get('comments',id))},201);
  }
  if (method==='POST' && parts[3]==='checklists') {
   const id=uid();
   run('INSERT INTO checklists(id,card_id,title,position,created_at) VALUES(?,?,?,?,?)',id,cardId,required(body.title,'Título',200),maxPosition('checklists','card_id',cardId),now());
   activity(board,user.id,'checklist.created',{checklistId:id},cardId); emitBoard(board,'checklist.created',cardId);
   return send(res,{checklist:{...view(get('checklists',id)),items:[]}},201);
  }
  if (method==='POST' && parts[3]==='members') {
   const targetId=required(body.userId,'Usuário');
   const target=get('users',targetId);
   if (!boardRole(board,target.id)) fail(400,'Usuário não tem acesso ao quadro');
   run('INSERT OR IGNORE INTO card_members(card_id,user_id) VALUES(?,?)',cardId,target.id);
   if (target.id!==user.id) notify(target.id,'assigned',{cardId,boardId:board.id});
   activity(board,user.id,'card.member_added',{userId:target.id},cardId); emitBoard(board,'card.member_added',cardId);
   return send(res,{card:cardDetails(cardId,user.id)});
  }
  if (method==='DELETE' && parts[3]==='members' && parts[4]) {
   run('DELETE FROM card_members WHERE card_id=? AND user_id=?',cardId,parts[4]);
   activity(board,user.id,'card.member_removed',{userId:parts[4]},cardId); emitBoard(board,'card.member_removed',cardId);
   return send(res,{card:cardDetails(cardId,user.id)});
  }
  if (method==='POST' && parts[3]==='labels') {
   const labelId=required(body.labelId,'Etiqueta'), label=get('labels',labelId);
   if (label.board_id!==board.id) fail(400,'Etiqueta não pertence ao quadro');
   run('INSERT OR IGNORE INTO card_labels(card_id,label_id) VALUES(?,?)',cardId,labelId);
   emitBoard(board,'card.label_added',cardId); return send(res,{card:cardDetails(cardId,user.id)});
  }
  if (method==='DELETE' && parts[3]==='labels' && parts[4]) {
   run('DELETE FROM card_labels WHERE card_id=? AND label_id=?',cardId,parts[4]);
   emitBoard(board,'card.label_removed',cardId); return send(res,{card:cardDetails(cardId,user.id)});
  }
  if (method==='POST' && parts[3]==='attachments') {
   const id=uid(), name=required(body.name,'Nome',255);
   let attachmentUrl: string|null=null, diskPath: string|null=null, size: number|null=null, mime: string|null=null;
   if (body.url!==undefined) {
    attachmentUrl=httpUrl(body.url,'URL');
   } else if (body.dataBase64!==undefined) {
    if (typeof body.dataBase64!=='string'||body.dataBase64.length>UPLOAD_MAX*1.4) fail(413,'Arquivo muito grande');
    const buffer=Buffer.from(body.dataBase64,'base64');
    if (!buffer.length||buffer.length>UPLOAD_MAX) fail(413,'Arquivo inválido ou muito grande');
    diskPath=join(uploadsDir,id); writeFileSync(diskPath,buffer,{flag:'wx'}); size=buffer.length;
    mime=optional(body.mime,'Tipo',100)||'application/octet-stream';
   } else fail(400,'Informe URL ou dataBase64');
   run('INSERT INTO attachments(id,card_id,name,url,path,mime,size,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',id,cardId,name,attachmentUrl,diskPath,mime,size,user.id,now());
   activity(board,user.id,'attachment.created',{attachmentId:id},cardId); emitBoard(board,'attachment.created',cardId);
   return send(res,{attachment:{...view(one('SELECT id,card_id,name,url,mime,size,created_by,created_at FROM attachments WHERE id=?',id)),downloadUrl:`/api/attachments/${id}/download`}},201);
  }
  if (method==='PUT' && parts[3]==='custom-values' && parts[4]) {
   const field=get('custom_fields',parts[4]); if (field.board_id!==board.id) fail(400,'Campo não pertence ao quadro');
   const value=validateCustomValue(field,body.value);
   run('INSERT INTO custom_values(card_id,field_id,value_json) VALUES(?,?,?) ON CONFLICT(card_id,field_id) DO UPDATE SET value_json=excluded.value_json',cardId,field.id,json(value,'Valor'));
   emitBoard(board,'card.custom_value_updated',cardId); return send(res,{fieldValue:{cardId,fieldId:field.id,value}});
  }
  if (method==='POST' && parts[3]==='watch') {
   run("INSERT OR IGNORE INTO watches(user_id,target_type,target_id) VALUES(?,'card',?)",user.id,cardId);
   return send(res,{watching:true});
  }
  if (method==='DELETE' && parts[3]==='watch') {
   run("DELETE FROM watches WHERE user_id=? AND target_type='card' AND target_id=?",user.id,cardId);
   return send(res,{watching:false});
  }
 }

 // Card resources
 if (parts[1]==='comments' && parts[2]) {
  const [comment,card,board]=cardFromChild('comments',parts[2],user.id,method!=='GET');
  if (method==='PATCH') {
   if (comment.user_id!==user.id && boardRole(board,user.id)!=='admin') fail(403,'Permissão insuficiente');
   const result=patch('comments',comment.id,body,{body:value=>required(value,'Comentário',10000)});
   emitBoard(board,'comment.updated',card.id); return send(res,{comment:result});
  }
  if (method==='DELETE') {
   if (comment.user_id!==user.id && boardRole(board,user.id)!=='admin') fail(403,'Permissão insuficiente');
   run('DELETE FROM comments WHERE id=?',comment.id); emitBoard(board,'comment.deleted',card.id); return send(res,{ok:true});
  }
 }
 if (parts[1]==='checklists' && parts[2]) {
  const [checklist,card,board]=cardFromChild('checklists',parts[2],user.id,method!=='GET');
  if (method==='PATCH' && parts.length===3) {
   const result=patch('checklists',checklist.id,body,{title:value=>required(value,'Título',200),position:value=>number(value,'Posição')});
   emitBoard(board,'checklist.updated',card.id); return send(res,{checklist:result});
  }
  if (method==='DELETE' && parts.length===3) {
   run('DELETE FROM checklists WHERE id=?',checklist.id); emitBoard(board,'checklist.deleted',card.id); return send(res,{ok:true});
  }
  if (method==='POST' && parts[3]==='items') {
   const id=uid(), text=required(body.text,'Item',500);
   run('INSERT INTO checklist_items(id,checklist_id,text,position,due_at,assignee_id) VALUES(?,?,?,?,?,?)',id,checklist.id,text,maxPosition('checklist_items','checklist_id',checklist.id),body.dueAt===undefined?null:iso(body.dueAt,'Data'),body.assigneeId||null);
   activity(board,user.id,'checklist.item_created',{itemId:id},card.id); emitBoard(board,'checklist.item_created',card.id);
   return send(res,{item:view(get('checklist_items',id))},201);
  }
 }
 if (parts[1]==='checklist-items' && parts[2]) {
  const item=get('checklist_items',parts[2]), checklist=get('checklists',item.checklist_id), card=get('cards',checklist.card_id), board=boardAccess(card.board_id,user.id,true);
  if (method==='PATCH') {
   if (body.assigneeId) { const assignee=get('users',body.assigneeId); if(!boardRole(board,assignee.id)) fail(400,'Responsável não tem acesso ao quadro'); }
   const result=patch('checklist_items',item.id,body,{text:value=>required(value,'Item',500),completed:value=>bool(value,'Concluído'),position:value=>number(value,'Posição'),dueAt:value=>iso(value,'Data'),assigneeId:value=>value===null?null:required(value,'Responsável')});
   emitBoard(board,'checklist.item_updated',card.id); return send(res,{item:result});
  }
  if (method==='DELETE') { run('DELETE FROM checklist_items WHERE id=?',item.id); emitBoard(board,'checklist.item_deleted',card.id); return send(res,{ok:true}); }
 }
 if (parts[1]==='attachments' && parts[2]) {
  const [attachment,card,board]=cardFromChild('attachments',parts[2],user.id,method==='DELETE');
  if (method==='GET' && parts[3]==='download') {
   if (attachment.url) { res.writeHead(302,{Location:attachment.url,'Cache-Control':'no-store'}); res.end(); return; }
   if (!attachment.path||!existsSync(attachment.path)) fail(404,'Arquivo não encontrado');
   const content=readFileSync(attachment.path);
   res.writeHead(200,{'Content-Type':attachment.mime||'application/octet-stream','Content-Length':content.length,'Content-Disposition':`attachment; filename="${attachment.name.replace(/["\\\r\n]/g,'_')}"`,'X-Content-Type-Options':'nosniff'});
   res.end(content); return;
  }
  if (method==='DELETE') { run('DELETE FROM attachments WHERE id=?',attachment.id); if(attachment.path&&existsSync(attachment.path)) unlinkSync(attachment.path); emitBoard(board,'attachment.deleted',card.id); return send(res,{ok:true}); }
 }
 if (parts[1]==='labels' && parts[2]) {
  const [label,board]=parentBoard('labels',parts[2],user.id,true);
  if (method==='PATCH') { const result=patch('labels',label.id,body,{name:value=>optional(value,'Nome',100)||'',color:value=>required(value,'Cor',50)}); emitBoard(board,'label.updated',label.id); return send(res,{label:result}); }
  if (method==='DELETE') { run('DELETE FROM labels WHERE id=?',label.id); emitBoard(board,'label.deleted',label.id); return send(res,{ok:true}); }
 }
 if (parts[1]==='custom-fields' && parts[2]) {
  const [field,board]=parentBoard('custom_fields',parts[2],user.id,true);
  if (method==='PATCH') { const result=patch('custom_fields',field.id,body,{name:value=>required(value,'Nome',100),optionsJson:value=>json(value,'Opções',5000),position:value=>number(value,'Posição')}); emitBoard(board,'custom_field.updated',field.id); return send(res,{customField:result}); }
  if (method==='DELETE') { run('DELETE FROM custom_fields WHERE id=?',field.id); emitBoard(board,'custom_field.deleted',field.id); return send(res,{ok:true}); }
 }
 if (parts[1]==='automations' && parts[2]) {
  const [automation,board]=parentBoard('automations',parts[2],user.id,method!=='GET');
  if (method==='PATCH') {
   boardAccess(board.id,user.id,false,true);
   const result=patch('automations',automation.id,body,{name:value=>required(value,'Nome',100),trigger:value=>enumValue(value,['card_created','card_moved','due','scheduled','button'] as const,'Gatilho'),conditionJson:value=>json(value,'Condição'),actionsJson:value=>json(validateActions(value),'Ações'),enabled:value=>bool(value,'Ativa')});
   emitBoard(board,'automation.updated',automation.id); return send(res,{automation:result});
  }
  if (method==='DELETE') { boardAccess(board.id,user.id,false,true); run('DELETE FROM automations WHERE id=?',automation.id); emitBoard(board,'automation.deleted',automation.id); return send(res,{ok:true}); }
  if (method==='POST' && parts[3]==='run') {
   if (automation.trigger!=='button') fail(400,'Somente automações de botão podem ser executadas manualmente');
   const card=get('cards',required(body.cardId,'Cartão')); if(card.board_id!==board.id) fail(400,'Cartão fora do quadro');
   executeAutomation(automation,card,user.id); emitBoard(board,'automation.ran',automation.id); return send(res,{ok:true,card:cardDetails(card.id,user.id)});
  }
 }

 // Search, planning, inbox, notifications and saved views
 if (method==='GET' && path==='/api/search') {
  const q=(url.searchParams.get('q')||'').trim(); if (!q) return send(res,{boards:[],cards:[]});
  if (q.length>200) fail(400,'Busca muito longa');
  const like=`%${q.replace(/[\\%_]/g,'\\$&')}%`;
  const accessible=`EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=b.workspace_id AND wm.user_id=? AND (b.visibility!='private' OR wm.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id=b.id AND bm.user_id=?)))`;
  const boards=boardViews(all(`SELECT b.* FROM boards b WHERE b.title LIKE ? ESCAPE '\\' AND ${accessible} AND b.archived=0 LIMIT 50`,like,user.id,user.id),user.id);
  const cards=views(all(`SELECT c.*,b.title AS board_title,l.title AS list_title FROM cards c JOIN boards b ON b.id=c.board_id JOIN lists l ON l.id=c.list_id WHERE (c.title LIKE ? ESCAPE '\\' OR c.description LIKE ? ESCAPE '\\') AND ${accessible} AND c.archived=0 LIMIT 100`,like,like,user.id,user.id));
  return send(res,{boards,cards});
 }
 if (method==='GET' && path==='/api/planner') {
  const from=iso(url.searchParams.get('from')||new Date(Date.now()-30*86400000).toISOString(),'Início')!;
  const to=iso(url.searchParams.get('to')||new Date(Date.now()+90*86400000).toISOString(),'Fim')!;
  const cards=views(all(`SELECT c.*,b.title AS board_title,l.title AS list_title FROM cards c
   JOIN boards b ON b.id=c.board_id JOIN lists l ON l.id=c.list_id
   JOIN workspace_members wm ON wm.workspace_id=b.workspace_id AND wm.user_id=?
   WHERE c.archived=0 AND c.due_at BETWEEN ? AND ?
   AND (b.visibility!='private' OR wm.role IN ('owner','admin') OR EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id=b.id AND bm.user_id=?))
   ORDER BY c.due_at`,user.id,from,to,user.id));
  return send(res,{cards,from,to});
 }
 if (method==='GET' && path==='/api/inbox') return send(res,{items:views(all('SELECT * FROM inbox_items WHERE user_id=? AND archived=0 ORDER BY completed,created_at DESC',user.id))});
 if (method==='POST' && path==='/api/inbox') {
  const id=uid(), cardId=body.cardId?required(body.cardId,'Cartão'):null;
  if (cardId) { const card=get('cards',cardId); boardAccess(card.board_id,user.id); }
  run('INSERT INTO inbox_items(id,user_id,title,notes,card_id,created_at) VALUES(?,?,?,?,?,?)',id,user.id,required(body.title,'Título',500),optional(body.notes,'Notas',10000)||'',cardId,now());
  return send(res,{item:view(get('inbox_items',id))},201);
 }
 if (parts[1]==='inbox' && parts[2]) {
  const item=get('inbox_items',parts[2]); if(item.user_id!==user.id) fail(403,'Acesso negado');
  if (method==='PATCH') return send(res,{item:patch('inbox_items',item.id,body,{title:value=>required(value,'Título',500),notes:value=>optional(value,'Notas',10000)||'',completed:value=>bool(value,'Concluído'),archived:value=>bool(value,'Arquivado')})});
  if (method==='POST' && parts[3]==='move') {
   const boardId=required(body.boardId,'Quadro'),board=boardAccess(boardId,user.id,true);
   let list:Row|undefined;
   if(body.listId) { list=get('lists',required(body.listId,'Lista')); if(list.board_id!==board.id||list.archived) fail(400,'Lista inválida'); }
   else list=one('SELECT * FROM lists WHERE board_id=? AND archived=0 ORDER BY position LIMIT 1',board.id);
   if(!list) {
    const listId=uid(),time=now();
    run('INSERT INTO lists(id,board_id,title,position,created_at,updated_at) VALUES(?,?,?,?,?,?)',listId,board.id,'A fazer',maxPosition('lists','board_id',board.id),time,time);
    list=get('lists',listId);
   }
   const cardId=uid(),time=now();
   transaction(()=>{
    run('INSERT INTO cards(id,board_id,list_id,title,description,position,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',cardId,board.id,list.id,item.title,item.notes,maxPosition('cards','list_id',list.id),user.id,time,time);
    run('DELETE FROM inbox_items WHERE id=?',item.id);
   });
   activity(board,user.id,'card.created',{cardId,source:'inbox'},cardId); emitBoard(board,'card.created',cardId);
   return send(res,{card:cardDetails(cardId,user.id)},201);
  }
  if (method==='DELETE') { run('DELETE FROM inbox_items WHERE id=?',item.id); return send(res,{ok:true}); }
 }
 if (method==='GET' && path==='/api/notifications') return send(res,{notifications:views(all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100',user.id))});
 if (method==='POST' && path==='/api/notifications/read-all') { run('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',now(),user.id); return send(res,{ok:true}); }
 if (parts[1]==='notifications' && parts[2] && method==='PATCH') {
  const notification=get('notifications',parts[2]); if(notification.user_id!==user.id) fail(403,'Acesso negado');
  run('UPDATE notifications SET read_at=? WHERE id=?',body.read===false?null:now(),notification.id);
  return send(res,{notification:view(get('notifications',notification.id))});
 }
 if (method==='GET' && path==='/api/saved-filters') return send(res,{filters:views(all('SELECT * FROM saved_filters WHERE user_id=? ORDER BY name',user.id))});
 if (method==='POST' && path==='/api/saved-filters') {
  const id=uid(), boardId=body.boardId?required(body.boardId,'Quadro'):null;
  if (boardId) boardAccess(boardId,user.id);
  run('INSERT INTO saved_filters(id,user_id,board_id,name,query_json) VALUES(?,?,?,?,?)',id,user.id,boardId,required(body.name,'Nome',100),json(body.query||{},'Filtro',5000));
  return send(res,{filter:view(get('saved_filters',id))},201);
 }
 if (parts[1]==='saved-filters' && parts[2]) {
  const filter=get('saved_filters',parts[2]); if(filter.user_id!==user.id) fail(403,'Acesso negado');
  if (method==='PATCH') return send(res,{filter:patch('saved_filters',filter.id,body,{name:value=>required(value,'Nome',100),queryJson:value=>json(value,'Filtro',5000)})});
  if (method==='DELETE') { run('DELETE FROM saved_filters WHERE id=?',filter.id); return send(res,{ok:true}); }
 }
 if (parts[1]==='collections' && parts[2]) {
  const collection=get('collections',parts[2]); workspaceAccess(collection.workspace_id,user.id,method!=='GET');
  if (method==='PATCH') return send(res,{collection:patch('collections',collection.id,body,{name:value=>required(value,'Nome',100)})});
  if (method==='DELETE' && parts.length===3) { run('DELETE FROM collections WHERE id=?',collection.id); return send(res,{ok:true}); }
  if (method==='POST' && parts[3]==='boards') {
   const board=get('boards',required(body.boardId,'Quadro')); if(board.workspace_id!==collection.workspace_id) fail(400,'Quadro fora da área de trabalho');
   run('INSERT OR IGNORE INTO collection_boards(collection_id,board_id) VALUES(?,?)',collection.id,board.id); return send(res,{ok:true});
  }
  if (method==='DELETE' && parts[3]==='boards' && parts[4]) { run('DELETE FROM collection_boards WHERE collection_id=? AND board_id=?',collection.id,parts[4]); return send(res,{ok:true}); }
 }
 if (parts[1]==='integrations' && parts[2]) {
  const workspaceId=parts[2]; workspaceAccess(workspaceId,user.id);
  if (!['owner','admin'].includes(workspaceRole(workspaceId,user.id)||'')) fail(403,'Somente administradores podem acessar integrações');
  if (method==='GET') return send(res,{integrations:views(all('SELECT id,workspace_id,provider,enabled FROM integration_settings WHERE workspace_id=?',workspaceId)).map(item=>({...item,status:'requires_external_credentials'}))});
  if (method==='POST') {
   const id=uid(),config=asObject(body.config||{}); assertNoSecrets(config);
   run('INSERT INTO integration_settings(id,workspace_id,provider,config_json,enabled) VALUES(?,?,?,?,0)',id,workspaceId,required(body.provider,'Provedor',100),json(config,'Configuração',5000));
   return send(res,{integration:{...view(one('SELECT id,workspace_id,provider,enabled FROM integration_settings WHERE id=?',id)),status:'requires_external_credentials'}},201);
  }
 }
 return fail(404,'Rota não encontrada');
}

function notifyCard(card: Row, board: Row, actorId: string, type: string, payload: Row): void {
 const recipients=new Set<string>(all('SELECT user_id FROM card_members WHERE card_id=?',card.id).map(row=>row.user_id));
 for(const row of all("SELECT user_id FROM watches WHERE (target_type='card' AND target_id=?) OR (target_type='list' AND target_id=?) OR (target_type='board' AND target_id=?)",card.id,card.list_id,board.id)) recipients.add(row.user_id);
 for(const id of recipients) if(id!==actorId && boardRole(board,id)) notify(id,type,payload);
}
function validateCustomValue(field: Row, value: unknown): unknown {
 if (value===null) return null;
 if (field.type==='text') return optional(value,'Texto',5000)||'';
 if (field.type==='number') return number(value,'Número');
 if (field.type==='date') return iso(value,'Data');
 if (field.type==='checkbox') return Boolean(bool(value,'Marcação'));
 if (field.type==='select') {
  const options=JSON.parse(field.options_json||'[]');
  if(!Array.isArray(options)||!options.includes(value)) fail(400,'Opção inválida');
  return value;
 }
 return fail(400,'Tipo de campo inválido');
}
function assertNoSecrets(value: Row): void {
 const forbidden=/secret|password|token|credential|api.?key|authorization|private.?key/i;
 const walk=(item: unknown,depth:number):void=>{
  if(depth>5) fail(400,'Configuração muito profunda');
  if(!item||typeof item!=='object') return;
  if(Array.isArray(item)) { for(const value of item) walk(value,depth+1); return; }
  for(const [key,nested] of Object.entries(item)) {
   if(forbidden.test(key)) fail(400,'Credenciais externas não devem ser salvas aqui');
   walk(nested,depth+1);
  }
 };
 walk(value,0);
}

function validateActions(value: unknown): Row[] {
 if(!Array.isArray(value)||value.length<1||value.length>10) return fail(400,'Informe de 1 a 10 ações');
 return value.map((raw: unknown)=>{
  const item=asObject(raw), type=enumValue(item.type,['move_card','add_label','set_due','post_comment','archive_card','mark_complete'] as const,'Ação');
  if(type==='move_card') return {type,listId:required(item.listId,'Lista')};
  if(type==='add_label') return {type,labelId:required(item.labelId,'Etiqueta')};
  if(type==='set_due') return {type,daysFromNow:number(item.daysFromNow,'Dias',0,3650)};
  if(type==='post_comment') return {type,body:required(item.body,'Comentário',1000)};
  return {type};
 });
}
function executeAutomation(automation: Row, card: Row, actorId: string): void {
 const board=get('boards',automation.board_id), actions=JSON.parse(automation.actions_json) as Row[];
 for(const action of actions) {
  if(action.type==='move_card') {
   const list=one('SELECT * FROM lists WHERE id=?',action.listId);
   if(list && list.board_id===board.id&&!list.archived) run('UPDATE cards SET list_id=?,position=?,updated_at=? WHERE id=?',list.id,maxPosition('cards','list_id',list.id),now(),card.id);
  } else if(action.type==='add_label') {
   const label=one('SELECT * FROM labels WHERE id=?',action.labelId);
   if(label && label.board_id===board.id) run('INSERT OR IGNORE INTO card_labels(card_id,label_id) VALUES(?,?)',card.id,label.id);
  } else if(action.type==='set_due') run('UPDATE cards SET due_at=?,due_complete=0,updated_at=? WHERE id=?',new Date(Date.now()+action.daysFromNow*86400000).toISOString(),now(),card.id);
  else if(action.type==='post_comment') run('INSERT INTO comments(id,card_id,user_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?)',uid(),card.id,actorId,action.body,now(),now());
  else if(action.type==='archive_card') run('UPDATE cards SET archived=1,updated_at=? WHERE id=?',now(),card.id);
  else if(action.type==='mark_complete') run('UPDATE cards SET completed=1,updated_at=? WHERE id=?',now(),card.id);
 }
 run('UPDATE automations SET last_run_at=? WHERE id=?',now(),automation.id);
 activity(board,actorId,'automation.ran',{automationId:automation.id},card.id);
 emitBoard(board,'automation.ran',card.id);
}
function applyAutomations(board: Row, trigger: string, card: Row): void {
 for(const automation of all('SELECT * FROM automations WHERE board_id=? AND trigger=? AND enabled=1',board.id,trigger)) {
  const condition=JSON.parse(automation.condition_json||'{}');
  if(condition.listId && condition.listId!==card.list_id) continue;
  if(condition.labelId && !one('SELECT 1 FROM card_labels WHERE card_id=? AND label_id=?',card.id,condition.labelId)) continue;
  executeAutomation(automation,card,board.created_by);
 }
}
function copyCard(card: Row, listId: string, userId: string, title: string): string {
 const id=uid(),time=now();
 transaction(()=>{
  run(`INSERT INTO cards(id,board_id,list_id,title,description,position,cover_json,start_at,due_at,due_complete,reminder_minutes,recurrence_json,is_template,completed,archived,location_json,created_by,created_at,updated_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,card.board_id,listId,title,card.description,maxPosition('cards','list_id',listId),card.cover_json,card.start_at,card.due_at,0,card.reminder_minutes,card.recurrence_json,0,0,0,card.location_json,userId,time,time);
  for(const row of all('SELECT user_id FROM card_members WHERE card_id=?',card.id)) run('INSERT INTO card_members(card_id,user_id) VALUES(?,?)',id,row.user_id);
  for(const row of all('SELECT label_id FROM card_labels WHERE card_id=?',card.id)) run('INSERT INTO card_labels(card_id,label_id) VALUES(?,?)',id,row.label_id);
  for(const row of all('SELECT * FROM checklists WHERE card_id=?',card.id)) {
   const checklistId=uid(); run('INSERT INTO checklists(id,card_id,title,position,created_at) VALUES(?,?,?,?,?)',checklistId,id,row.title,row.position,time);
   for(const item of all('SELECT * FROM checklist_items WHERE checklist_id=?',row.id)) run('INSERT INTO checklist_items(id,checklist_id,text,completed,position,due_at,assignee_id) VALUES(?,?,?,?,?,?,?)',uid(),checklistId,item.text,0,item.position,item.due_at,item.assignee_id);
  }
  for(const row of all('SELECT field_id,value_json FROM custom_values WHERE card_id=?',card.id)) run('INSERT INTO custom_values(card_id,field_id,value_json) VALUES(?,?,?)',id,row.field_id,row.value_json);
 });
 return id;
}
function createRecurringCopy(card: Row, userId: string): void {
  const recurrence=JSON.parse(card.recurrence_json||'null');
  if (!recurrence || !Number.isFinite(Number(recurrence.everyDays)) || Number(recurrence.everyDays)<1) return;
  const id=copyCard(card,card.list_id,userId,card.title);
  const days=Number(recurrence.everyDays), due=card.due_at?new Date(Date.parse(card.due_at)+days*86400000).toISOString():new Date(Date.now()+days*86400000).toISOString();
  run('UPDATE cards SET due_at=? WHERE id=?',due,id);
  emitBoard(get('boards',card.board_id),'card.recurring_created',id);
}
function exportWorkspace(id: string, userId: string): Row {
 const workspace=workspaceAccess(id,userId), boards=views(all('SELECT * FROM boards WHERE workspace_id=?',id)).filter(board=>boardRole(get('boards',board.id),userId));
 return {workspace:view(workspace),boards:boards.map(board=>{
  const cards=views(all('SELECT * FROM cards WHERE board_id=?',board.id));
  for(const card of cards) {
   card.memberIds=all('SELECT user_id FROM card_members WHERE card_id=?',card.id).map(row=>row.user_id);
   card.labelIds=all('SELECT label_id FROM card_labels WHERE card_id=?',card.id).map(row=>row.label_id);
   card.checklists=views(all('SELECT * FROM checklists WHERE card_id=?',card.id)).map(checklist=>({...checklist,items:views(all('SELECT * FROM checklist_items WHERE checklist_id=?',checklist.id))}));
   card.comments=views(all('SELECT c.*,u.email AS author_email,u.name AS author_name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.card_id=?',card.id));
   card.attachments=views(all('SELECT id,name,url,mime,size,created_at FROM attachments WHERE card_id=? AND url IS NOT NULL',card.id));
   card.customValues=views(all('SELECT * FROM custom_values WHERE card_id=?',card.id));
  }
  return {board,lists:views(all('SELECT * FROM lists WHERE board_id=?',board.id)),cards,labels:views(all('SELECT * FROM labels WHERE board_id=?',board.id)),customFields:views(all('SELECT * FROM custom_fields WHERE board_id=?',board.id))};
 })};
}
function importWorkspace(workspaceId: string, userId: string, data: Row, emitEvents = true): Row[] {
 if(data.boards.length>100) fail(413,'Muitos quadros no arquivo');
 const results: Row[]=[];
 transaction(()=>{
  for(const source of data.boards) {
   const entry=asObject(source), board=asObject(entry.board);
   if(!Array.isArray(entry.lists)||!Array.isArray(entry.cards)||!Array.isArray(entry.labels)||!Array.isArray(entry.customFields)) fail(400,'Quadro importado incompleto');
   if(entry.lists.length>1000||entry.cards.length>20000) fail(413,'Arquivo muito grande');
   const boardId=uid(), time=now();
   run('INSERT INTO boards(id,workspace_id,title,description,visibility,background,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',boardId,workspaceId,required(board.title,'Título',200),optional(board.description,'Descrição',5000)||'','private',optional(board.background,'Fundo',200)||'#0c66e4',userId,time,time);
   run('INSERT INTO board_members(board_id,user_id,role,joined_at) VALUES(?,?,?,?)',boardId,userId,'admin',time);
   const lists=new Map<string,string>(),labels=new Map<string,string>(),fields=new Map<string,string>();
   for(const sourceList of entry.lists) {
    const item=asObject(sourceList), listId=uid(); lists.set(String(item.id),listId);
    run('INSERT INTO lists(id,board_id,title,position,color,collapsed,archived,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',listId,boardId,required(item.title,'Lista',200),number(item.position??1024,'Posição'),item.color||null,item.collapsed?1:0,item.archived?1:0,time,time);
   }
   for(const sourceLabel of entry.labels) {
    const item=asObject(sourceLabel), labelId=uid(); labels.set(String(item.id),labelId);
    run('INSERT INTO labels(id,board_id,name,color,created_at) VALUES(?,?,?,?,?)',labelId,boardId,optional(item.name,'Etiqueta',100)||'',required(item.color,'Cor',50),time);
   }
   for(const sourceField of entry.customFields) {
    const item=asObject(sourceField), fieldId=uid(); fields.set(String(item.id),fieldId);
    run('INSERT INTO custom_fields(id,board_id,name,type,options_json,position) VALUES(?,?,?,?,?,?)',fieldId,boardId,required(item.name,'Campo',100),enumValue(item.type,['text','number','date','checkbox','select'] as const,'Tipo'),json(item.options||[],'Opções',5000),number(item.position??1024,'Posição'));
   }
   for(const sourceCard of entry.cards) {
    const item=asObject(sourceCard), listId=lists.get(String(item.listId));
    if(!listId) continue;
    const cardId=uid();
    run(`INSERT INTO cards(id,board_id,list_id,title,description,position,cover_json,start_at,due_at,due_complete,reminder_minutes,recurrence_json,is_template,completed,archived,location_json,created_by,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,cardId,boardId,listId,required(item.title,'Cartão',500),optional(item.description,'Descrição',20000)||'',number(item.position??1024,'Posição'),item.cover?json(item.cover,'Capa'):null,item.startAt?iso(item.startAt,'Início'):null,item.dueAt?iso(item.dueAt,'Entrega'):null,item.dueComplete?1:0,item.reminderMinutes??null,item.recurrence?json(item.recurrence,'Recorrência'):null,item.isTemplate?1:0,item.completed?1:0,item.archived?1:0,item.location?json(item.location,'Localização'):null,userId,time,time);
    if(Array.isArray(item.labelIds)) for(const oldId of item.labelIds) { const labelId=labels.get(String(oldId)); if(labelId) run('INSERT OR IGNORE INTO card_labels(card_id,label_id) VALUES(?,?)',cardId,labelId); }
    if(Array.isArray(item.memberIds)) for(const memberId of item.memberIds) if(workspaceRole(workspaceId,String(memberId))) run('INSERT OR IGNORE INTO card_members(card_id,user_id) VALUES(?,?)',cardId,String(memberId));
    if(Array.isArray(item.checklists)) for(const sourceChecklist of item.checklists) {
     const cl=asObject(sourceChecklist), checklistId=uid();
     run('INSERT INTO checklists(id,card_id,title,position,created_at) VALUES(?,?,?,?,?)',checklistId,cardId,required(cl.title,'Checklist',200),number(cl.position??1024,'Posição'),time);
     if(Array.isArray(cl.items)) for(const sourceItem of cl.items) { const ci=asObject(sourceItem), assigneeId=ci.assigneeId && boardRole(get('boards',boardId),String(ci.assigneeId))?String(ci.assigneeId):null; run('INSERT INTO checklist_items(id,checklist_id,text,completed,position,due_at,assignee_id) VALUES(?,?,?,?,?,?,?)',uid(),checklistId,required(ci.text,'Item',500),ci.completed?1:0,number(ci.position??1024,'Posição'),ci.dueAt?iso(ci.dueAt,'Data'):null,assigneeId); }
    }
    if(Array.isArray(item.comments)) for(const sourceComment of item.comments) { const c=asObject(sourceComment); run('INSERT INTO comments(id,card_id,user_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?)',uid(),cardId,userId,required(c.body,'Comentário',10000),time,time); }
    if(Array.isArray(item.attachments)) for(const sourceAttachment of item.attachments) { const a=asObject(sourceAttachment); if(a.url) run('INSERT INTO attachments(id,card_id,name,url,created_by,created_at) VALUES(?,?,?,?,?,?)',uid(),cardId,required(a.name,'Anexo',255),httpUrl(a.url,'URL'),userId,time); }
    if(Array.isArray(item.customValues)) for(const sourceValue of item.customValues) { const cv=asObject(sourceValue), fieldId=fields.get(String(cv.fieldId)); if(fieldId) run('INSERT INTO custom_values(card_id,field_id,value_json) VALUES(?,?,?)',cardId,fieldId,json(cv.value,'Valor',5000)); }
   }
   results.push(view(get('boards',boardId))!);
  }
 });
 if(emitEvents) for(const board of results) emitBoard(get('boards',board.id),'board.imported',board.id);
 return results;
}
function scheduler(): void {
 const time=now();
 for(const card of all('SELECT * FROM cards WHERE due_at IS NOT NULL AND reminder_minutes IS NOT NULL AND due_complete=0 AND completed=0 AND archived=0')) {
  const board=one('SELECT * FROM boards WHERE id=?',card.board_id); if(!board||board.archived) continue;
  const reminderAt=Date.parse(card.due_at)-Number(card.reminder_minutes)*60000;
  if(reminderAt>Date.now()||one('SELECT 1 FROM reminder_runs WHERE card_id=? AND due_at=? AND reminder_minutes=?',card.id,card.due_at,card.reminder_minutes)) continue;
  const recipients=new Set<string>(all('SELECT user_id FROM card_members WHERE card_id=?',card.id).map(row=>row.user_id));
  recipients.add(card.created_by);
  for(const recipient of recipients) if(boardRole(board,recipient)) notify(recipient,'due_reminder',{cardId:card.id,boardId:board.id,dueAt:card.due_at});
  run('INSERT INTO reminder_runs(card_id,due_at,reminder_minutes,sent_at) VALUES(?,?,?,?)',card.id,card.due_at,card.reminder_minutes,time);
 }
 for(const automation of all("SELECT * FROM automations WHERE enabled=1 AND trigger IN ('due','scheduled')")) {
  const board=one('SELECT * FROM boards WHERE id=?',automation.board_id); if(!board||board.archived) continue;
  const condition=JSON.parse(automation.condition_json||'{}');
  let cards: Row[]=[]; let occurrence='';
  if(automation.trigger==='due') cards=all('SELECT * FROM cards WHERE board_id=? AND due_at<=? AND archived=0 AND completed=0 AND due_complete=0',board.id,time);
  else {
   if(!condition.cardId) continue;
   const card=one('SELECT * FROM cards WHERE id=? AND board_id=?',condition.cardId,board.id); if(!card) continue;
   if(condition.at && Date.parse(condition.at)>Date.now()) continue;
   const every=Number(condition.everyMinutes||0);
   if(every>0) occurrence=String(Math.floor(Date.now()/(every*60000)));
   else occurrence=String(condition.at||'once');
   cards=[card];
  }
  for(const card of cards) {
   const key=automation.trigger==='due'?String(card.due_at):occurrence;
   if(one('SELECT 1 FROM automation_runs WHERE automation_id=? AND card_id=? AND occurrence=?',automation.id,card.id,key)) continue;
   try { executeAutomation(automation,card,board.created_by); run('INSERT INTO automation_runs(automation_id,card_id,occurrence,ran_at) VALUES(?,?,?,?)',automation.id,card.id,key,time); } catch(error) { console.error('automation failed',error); }
  }
 }
}

const tlsKeyPath=process.env.ORGANIZE_TLS_KEY_PATH;
const tlsCertPath=process.env.ORGANIZE_TLS_CERT_PATH;
if(Boolean(tlsKeyPath)!==Boolean(tlsCertPath)) throw new Error('Defina ORGANIZE_TLS_KEY_PATH e ORGANIZE_TLS_CERT_PATH juntos.');
const listener=(req:IncomingMessage,res:ServerResponse)=>{ handle(req,res).catch(error=>{
 if(res.headersSent) { res.end(); return; }
 const status=error instanceof HttpError?error.status:500;
 if(status===500) console.error(error);
 send(res,{error:status===500?'Erro interno':error.message},status);
 }); };
const server=tlsKeyPath && tlsCertPath
 ? createHttpsServer({key:readFileSync(tlsKeyPath),cert:readFileSync(tlsCertPath)},listener)
 : createServer(listener);
server.listen(PORT,()=>console.log(`Organize API ${tlsKeyPath?'https':'http'}://localhost:${PORT}`));
setInterval(scheduler,60000).unref();
export { server };
