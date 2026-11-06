import { randomBytes, scryptSync } from 'node:crypto';
import { db, one, run, transaction, uid, now } from './db.ts';

const password='Organize123!';
const users=[
 {name:'Ana Martins',email:'ana@organize.local'},
 {name:'Bruno Costa',email:'bruno@organize.local'},
];
const time=now();
const ids: string[]=[];
transaction(()=>{
 for(const entry of users) {
  const existing=one('SELECT id FROM users WHERE email=?',entry.email);
  if(existing) { ids.push(existing.id); continue; }
  const id=uid(),salt=randomBytes(16).toString('hex');
  run('INSERT INTO users(id,email,name,password_hash,salt,created_at) VALUES(?,?,?,?,?,?)',id,entry.email,entry.name,scryptSync(password,salt,64).toString('hex'),salt,time);
  ids.push(id);
 }
 const existing=one("SELECT id FROM workspaces WHERE name='Equipe Aurora' AND owner_id=?",ids[0]);
 if(existing) return;
 const workspaceId=uid(), boardId=uid(), [ana,bruno]=ids;
 run('INSERT INTO workspaces(id,name,description,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?)',workspaceId,'Equipe Aurora','Área de trabalho de demonstração',ana,time,time);
 run('INSERT INTO workspace_members(workspace_id,user_id,role,joined_at) VALUES(?,?,?,?)',workspaceId,ana,'owner',time);
 run('INSERT INTO workspace_members(workspace_id,user_id,role,joined_at) VALUES(?,?,?,?)',workspaceId,bruno,'member',time);
 run('INSERT INTO boards(id,workspace_id,title,description,visibility,background,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',boardId,workspaceId,'Lançamento do Organize','Um quadro para explorar o fluxo completo de trabalho.','workspace','#0b7285',ana,time,time);
 run('INSERT INTO board_members(board_id,user_id,role,joined_at) VALUES(?,?,?,?)',boardId,ana,'admin',time);
 run('INSERT INTO board_members(board_id,user_id,role,joined_at) VALUES(?,?,?,?)',boardId,bruno,'member',time);
 const listIds=[uid(),uid(),uid()];
 ['Ideias','Em andamento','Concluído'].forEach((title,index)=>run('INSERT INTO lists(id,board_id,title,position,created_at,updated_at) VALUES(?,?,?,?,?,?)',listIds[index],boardId,title,(index+1)*1024,time,time));
 const labelIds=[uid(),uid(),uid()];
 [['Prioridade','#f87168'],['Design','#9f8fef'],['Produto','#4bce97']].forEach(([name,color],index)=>run('INSERT INTO labels(id,board_id,name,color,created_at) VALUES(?,?,?,?,?)',labelIds[index],boardId,name,color,time));
 const cards=[
  {title:'Planejar a página inicial',description:'Definir conteúdo, navegação e hierarquia visual.',list:0,owner:ana,due:7,label:2},
  {title:'Revisar experiência no celular',description:'Testar toques, arrastar cartões e detalhes em tela pequena.',list:1,owner:bruno,due:3,label:1},
  {title:'Preparar apresentação da equipe',description:'Reunir decisões e próximos passos.',list:1,owner:ana,due:5,label:0},
  {title:'Criar a área de trabalho',description:'Configuração inicial concluída.',list:2,owner:ana,due:-1,label:2},
 ];
 cards.forEach((entry,index)=>{
  const cardId=uid(), due=new Date(Date.now()+entry.due*86400000).toISOString();
  run('INSERT INTO cards(id,board_id,list_id,title,description,position,due_at,completed,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',cardId,boardId,listIds[entry.list],entry.title,entry.description,(index+1)*1024,due,entry.list===2?1:0,ana,time,time);
  run('INSERT INTO card_members(card_id,user_id) VALUES(?,?)',cardId,entry.owner);
  run('INSERT INTO card_labels(card_id,label_id) VALUES(?,?)',cardId,labelIds[entry.label]);
  if(index===1) {
   const checklistId=uid();
   run('INSERT INTO checklists(id,card_id,title,position,created_at) VALUES(?,?,?,?,?)',checklistId,cardId,'Validação',1024,time);
   run('INSERT INTO checklist_items(id,checklist_id,text,completed,position) VALUES(?,?,?,?,?)',uid(),checklistId,'Testar navegação',1,1024);
   run('INSERT INTO checklist_items(id,checklist_id,text,completed,position) VALUES(?,?,?,?,?)',uid(),checklistId,'Testar arrastar e soltar',0,2048);
   run('INSERT INTO comments(id,card_id,user_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?)',uid(),cardId,ana,'Vamos validar em desktop e celular.',time,time);
  }
 });
});
db.close();
console.log('Dados de demonstração prontos. Contas: ana@organize.local e bruno@organize.local; senha: Organize123!');
