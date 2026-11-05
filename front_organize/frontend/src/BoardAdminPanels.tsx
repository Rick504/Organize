import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { del, get, patch, post } from './api';
import type { BoardDetail, Card, CustomField, Member } from './types';

type Tab = 'fields' | 'archive' | 'members' | 'templates';
type FieldType = CustomField['type'];
type WorkspaceMember = Member & { role: 'owner' | 'admin' | 'member' | 'observer' };
type Props = {
  detail: BoardDetail;
  currentUserId: string;
  onChanged: () => void | Promise<unknown>;
  onOpenCard?: (id: string) => void;
  onInvite?: () => void;
};
const fieldTypes: { id: FieldType; label: string }[] = [
  { id: 'text', label: 'Texto' }, { id: 'number', label: 'Número' }, { id: 'date', label: 'Data' },
  { id: 'checkbox', label: 'Caixa de seleção' }, { id: 'select', label: 'Lista de opções' },
];
const sectionStyle = { display: 'grid', gap: 10 } as const;
const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)' } as const;
const subduedStyle = { display: 'block', color: 'var(--muted)', fontSize: 11 } as const;
const optionList = (raw: string) => [...new Set(raw.split(/[,\n]/).map(value => value.trim()).filter(Boolean))];

export function BoardAdminPanels({ detail, currentUserId, onChanged, onOpenCard, onInvite }: Props) {
  const [tab, setTab] = useState<Tab>('fields');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [fieldType, setFieldType] = useState<FieldType>('text');
  const [fieldOptions, setFieldOptions] = useState('');
  const [editField, setEditField] = useState<CustomField | null>(null);
  const [editName, setEditName] = useState('');
  const [editOptions, setEditOptions] = useState('');
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'member' | 'observer'>('member');
  const [templates, setTemplates] = useState<Card[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [templateListId, setTemplateListId] = useState('');
  const [copyTitle, setCopyTitle] = useState('');
  const canWrite = detail.board.role !== 'observer';
  const isAdmin = detail.board.role === 'admin';
  const boardWatching = Boolean((detail.board as typeof detail.board & { watching?: boolean }).watching);
  const activeLists = useMemo(() => detail.lists.filter(list => !list.archived).sort((a, b) => a.position - b.position), [detail.lists]);
  const archivedLists = detail.lists.filter(list => list.archived);
  const archivedCards = detail.cards.filter(card => card.archived);

  useEffect(() => { setTab('fields'); setMessage(''); setEditField(null); }, [detail.board.id]);
  useEffect(() => {
    if (tab !== 'members') return;
    let valid = true;
    get<{ members: WorkspaceMember[] }>(`/workspaces/${detail.board.workspaceId}/members`)
      .then(result => { if (valid) setWorkspaceMembers(result.members); })
      .catch(error => { if (valid) setMessage((error as Error).message); });
    return () => { valid = false; };
  }, [tab, detail.board.workspaceId]);
  useEffect(() => {
    if (tab !== 'templates') return;
    let valid = true;
    get<{ cards: Card[] }>(`/boards/${detail.board.id}/templates`)
      .then(result => { if (valid) setTemplates(result.cards); })
      .catch(error => { if (valid) setMessage((error as Error).message); });
    return () => { valid = false; };
  }, [tab, detail.board.id, detail.cards]);

  async function change(action: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('');
    try { await action(); await onChanged(); setMessage(success); return true; }
    catch (error) { setMessage((error as Error).message); return false; }
    finally { setBusy(false); }
  }
  async function createField(event: FormEvent) {
    event.preventDefault();
    const options = fieldType === 'select' ? optionList(fieldOptions) : [];
    if (fieldType === 'select' && !options.length) { setMessage('Informe ao menos uma opção.'); return; }
    if (await change(() => post(`/boards/${detail.board.id}/custom-fields`, { name: fieldName.trim(), type: fieldType, options }), 'Campo criado.')) {
      setFieldName(''); setFieldOptions('');
    }
  }
  async function saveField(event: FormEvent) {
    event.preventDefault();
    if (!editField) return;
    const options = editField.type === 'select' ? optionList(editOptions) : editField.options || [];
    if (editField.type === 'select' && !options.length) { setMessage('Informe ao menos uma opção.'); return; }
    if (await change(() => patch(`/custom-fields/${editField.id}`, { name: editName.trim(), optionsJson: options }), 'Campo atualizado.')) setEditField(null);
  }
  async function restoreCard(card: Card) {
    const originalList = detail.lists.find(list => list.id === card.listId);
    const destination = originalList?.archived ? activeLists[0] : originalList;
    if (!destination) { setMessage('Restaure uma lista antes deste cartão.'); return; }
    await change(() => patch(`/cards/${card.id}`, { archived: false, listId: destination.id }), 'Cartão restaurado.');
  }
  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (await change(() => post(`/boards/${detail.board.id}/members`, { email: newMemberEmail, role: newMemberRole }), 'Papel atribuído.')) setNewMemberEmail('');
  }
  async function copyTemplate(event: FormEvent) {
    event.preventDefault();
    const source = templates.find(card => card.id === templateId);
    if (!source || !templateListId) return;
    const copied = await change(async () => {
      const result = await post<{ card: Card }>(`/cards/${source.id}/copy`, { listId: templateListId, title: copyTitle.trim() || source.title });
      await patch(`/cards/${result.card.id}`, { template: false });
    }, 'Cartão criado a partir do modelo.');
    if (copied) setCopyTitle('');
  }

  return <section className="board-admin" aria-label="Gerenciar quadro" style={{ borderTop: '1px solid var(--line)', padding: '15px 18px 20px' }}>
    <div role="tablist" aria-label="Recursos do quadro" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
      {([{ id: 'fields', name: 'Campos' }, { id: 'archive', name: 'Arquivados' }, { id: 'members', name: 'Membros' }, { id: 'templates', name: 'Modelos' }] as const).map(item => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); setMessage(''); }} style={{ padding: '8px 10px', background: 'transparent', color: tab === item.id ? 'var(--blue)' : 'var(--muted)', borderBottom: tab === item.id ? '2px solid var(--blue)' : '2px solid transparent', fontWeight: 700 }}>{item.name}</button>)}
    </div>
    {message && <p role="status" aria-live="polite" style={{ background: 'var(--soft)', color: 'var(--text)', padding: 8, borderRadius: 5, fontSize: 12 }}>{message}</p>}

    {tab === 'fields' && <div style={sectionStyle}>
      <h3>Campos personalizados</h3>
      {detail.customFields.map(field => <div key={field.id} style={rowStyle}><div style={{ flex: 1 }}><strong>{field.name}</strong><small style={subduedStyle}>{fieldTypes.find(type => type.id === field.type)?.label}{field.type === 'select' ? ` · ${(field.options || []).join(', ')}` : ''}</small></div>{canWrite && <><button type="button" className="subtle-button" disabled={busy} onClick={() => { setEditField(field); setEditName(field.name); setEditOptions((field.options || []).join('\n')); }}>Editar</button><button type="button" className="danger-button" disabled={busy} onClick={() => { if (window.confirm(`Excluir “${field.name}” e os valores nos cartões?`)) void change(() => del(`/custom-fields/${field.id}`), 'Campo excluído.'); }}>Excluir</button></>}</div>)}
      {!detail.customFields.length && <p className="empty-small">Nenhum campo personalizado.</p>}
      {canWrite && editField && <form onSubmit={saveField} style={sectionStyle}><strong>Editar campo</strong><label>Nome<input required maxLength={100} value={editName} onChange={event => setEditName(event.target.value)} /></label>{editField.type === 'select' && <label>Opções (uma por linha)<textarea required rows={3} value={editOptions} onChange={event => setEditOptions(event.target.value)} /></label>}<div><button className="primary-button" disabled={busy}>Salvar</button><button type="button" className="subtle-button" onClick={() => setEditField(null)}>Cancelar</button></div></form>}
      {canWrite && <form onSubmit={createField} style={sectionStyle}><strong>Novo campo</strong><label>Nome<input required maxLength={100} value={fieldName} onChange={event => setFieldName(event.target.value)} placeholder="Ex.: Prioridade" /></label><label>Tipo<select value={fieldType} onChange={event => setFieldType(event.target.value as FieldType)}>{fieldTypes.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>{fieldType === 'select' && <label>Opções (uma por linha)<textarea required rows={3} value={fieldOptions} onChange={event => setFieldOptions(event.target.value)} placeholder={'Alta\nMédia\nBaixa'} /></label>}<button className="secondary-button" disabled={busy} style={{ justifySelf: 'start' }}>Criar campo</button></form>}
    </div>}

    {tab === 'archive' && <div style={sectionStyle}>
      <h3>Cartões arquivados</h3>
      {archivedCards.map(card => <div key={card.id} style={rowStyle}><div style={{ flex: 1 }}><strong>{card.title}</strong><small style={subduedStyle}>{detail.lists.find(list => list.id === card.listId)?.title || 'Lista ausente'}</small></div>{canWrite && <button type="button" className="secondary-button" disabled={busy} onClick={() => restoreCard(card)}>Restaurar</button>}</div>)}
      {!archivedCards.length && <p className="empty-small">Nenhum cartão arquivado.</p>}
      <h3>Listas arquivadas</h3>
      {archivedLists.map(list => <div key={list.id} style={rowStyle}><strong style={{ flex: 1 }}>{list.title}</strong>{canWrite && <button type="button" className="secondary-button" disabled={busy} onClick={() => change(() => patch(`/lists/${list.id}`, { archived: false }), 'Lista restaurada.')}>Restaurar</button>}</div>)}
      {!archivedLists.length && <p className="empty-small">Nenhuma lista arquivada.</p>}
    </div>}

    {tab === 'members' && <div style={sectionStyle}>
      <h3>Membros do quadro</h3>
      {detail.members.map(member => { const inherited = workspaceMembers.find(person => person.id === member.id); const immutable = inherited?.role === 'owner' || inherited?.role === 'admin' || member.id === currentUserId; const editable = isAdmin && !immutable; return <div key={member.id} style={rowStyle}><div style={{ flex: 1, minWidth: 0 }}><strong>{member.name}</strong><small style={{ ...subduedStyle, overflowWrap: 'anywhere' }}>{member.email}</small></div>{editable ? <select aria-label={`Papel de ${member.name}`} value={member.role} disabled={busy} onChange={event => change(() => post(`/boards/${detail.board.id}/members`, { email: member.email, role: event.target.value }), 'Papel atualizado.')}><option value="admin">Administrador</option><option value="member">Membro</option><option value="observer">Observador</option></select> : <small>{member.role}</small>}{editable && detail.board.visibility === 'private' && <button type="button" className="danger-button" disabled={busy} onClick={() => { if (window.confirm(`Remover ${member.name} do quadro?`)) void change(() => del(`/boards/${detail.board.id}/members/${member.id}`), 'Membro removido.'); }}>Remover</button>}</div>; })}
      {isAdmin && <form onSubmit={addMember} style={sectionStyle}><strong>Adicionar pessoa da área de trabalho</strong><label>Pessoa<select required value={newMemberEmail} onChange={event => setNewMemberEmail(event.target.value)}><option value="">Selecione</option>{workspaceMembers.filter(member => !['owner', 'admin'].includes(member.role) && (detail.board.visibility !== 'private' || !detail.members.some(boardMember => boardMember.id === member.id))).map(member => <option key={member.id} value={member.email}>{member.name} ({member.email})</option>)}</select></label><label>Papel<select value={newMemberRole} onChange={event => setNewMemberRole(event.target.value as typeof newMemberRole)}><option value="member">Membro</option><option value="observer">Observador</option><option value="admin">Administrador</option></select></label><button className="secondary-button" disabled={busy || !newMemberEmail} style={{ justifySelf: 'start' }}>Atribuir papel</button>{onInvite && <button type="button" className="subtle-button" style={{ justifySelf: 'start' }} onClick={onInvite}>Convidar por email para a área</button>}</form>}
      {!isAdmin && <p className="empty-small">Somente administradores podem alterar os papéis.</p>}
    </div>}

    {tab === 'templates' && <div style={sectionStyle}>
      <h3>Modelos de cartão</h3>
      {templates.map(card => <div key={card.id} style={rowStyle}><strong style={{ flex: 1 }}>{card.title}</strong>{onOpenCard && <button type="button" className="subtle-button" onClick={() => onOpenCard(card.id)}>Abrir</button>}</div>)}
      {!templates.length && <p className="empty-small">Marque um cartão como modelo nos detalhes dele.</p>}
      {canWrite && templates.length > 0 && activeLists.length > 0 && <form onSubmit={copyTemplate} style={sectionStyle}><label>Modelo<select required value={templateId} onChange={event => { setTemplateId(event.target.value); setCopyTitle(templates.find(card => card.id === event.target.value)?.title || ''); }}><option value="">Selecione</option>{templates.map(card => <option key={card.id} value={card.id}>{card.title}</option>)}</select></label><label>Lista de destino<select required value={templateListId} onChange={event => setTemplateListId(event.target.value)}><option value="">Selecione</option>{activeLists.map(list => <option key={list.id} value={list.id}>{list.title}</option>)}</select></label><label>Título da cópia<input required maxLength={500} value={copyTitle} onChange={event => setCopyTitle(event.target.value)} /></label><button className="secondary-button" disabled={busy || !templateId || !templateListId} style={{ justifySelf: 'start' }}>Criar a partir do modelo</button></form>}
      {canWrite && templates.length > 0 && !activeLists.length && <p className="empty-small">Crie ou restaure uma lista para usar modelos.</p>}
    </div>}

    <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--line)' }}><button type="button" className="subtle-button" disabled={busy} onClick={() => change(() => boardWatching ? del(`/boards/${detail.board.id}/watch`) : post(`/boards/${detail.board.id}/watch`), boardWatching ? 'Você deixou de acompanhar o quadro.' : 'Você está acompanhando o quadro.')}>{boardWatching ? 'Deixar de acompanhar quadro' : 'Acompanhar quadro'}</button></div>
  </section>;
}
