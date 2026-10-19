import { useEffect, useState } from 'react';
import { patch } from './api';
import type { CheckItem, Checklist, Member } from './types';

type Mutate = <T>(fn: () => Promise<T>, message?: string, refreshCard?: boolean) => Promise<T | null>;
type Props = { checklists: Checklist[]; members: Member[]; mutate: Mutate; reload: () => Promise<unknown> };

function localDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function ItemEditor({ item, members, mutate, reload }: { item: CheckItem; members: Member[]; mutate: Mutate; reload: () => Promise<unknown> }) {
  const [text, setText] = useState(item.text);
  const [assigneeId, setAssigneeId] = useState(item.assigneeId || '');
  const [dueAt, setDueAt] = useState(localDate(item.dueAt));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(item.text); setAssigneeId(item.assigneeId || ''); setDueAt(localDate(item.dueAt)); }, [item.id, item.text, item.assigneeId, item.dueAt]);
  return <form className="advanced-item" onSubmit={async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextText = String(form.get('text') || '').trim();
    const nextAssignee = String(form.get('assigneeId') || '');
    const nextDue = String(form.get('dueAt') || '');
    if (!nextText || (nextText === item.text && nextAssignee === (item.assigneeId || '') && nextDue === localDate(item.dueAt))) return;
    setSaving(true);
    try {
      const result = await mutate(() => patch(`/checklist-items/${item.id}`, {
        text: nextText, assigneeId: nextAssignee || null, dueAt: nextDue ? new Date(nextDue).toISOString() : null,
      }), 'Item atualizado', true);
      if (result) await reload();
    } finally { setSaving(false); }
  }}>
    <label>Item<input name="text" required value={text} onChange={event => setText(event.target.value)} /></label>
    <label>Responsável<select name="assigneeId" value={assigneeId} onChange={event => setAssigneeId(event.target.value)}><option value="">Sem responsável</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
    <label>Prazo<input name="dueAt" type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
    <button className="secondary-button" disabled={saving}>{saving ? 'Salvando…' : 'Salvar item'}</button>
  </form>;
}

export function AdvancedChecklistPane({ checklists, members, mutate, reload }: Props) {
  return <div className="advanced-checklists" aria-label="Itens avançados da checklist">
    <h4>Responsáveis e prazos dos itens</h4>
    {!checklists.length && <p>Crie uma checklist para definir responsabilidades.</p>}
    {checklists.map(checklist => <section key={checklist.id}>
      <strong>{checklist.title}</strong>
      {!checklist.items.length && <p>Adicione um item no cartão.</p>}
      {checklist.items.map(item => <ItemEditor key={item.id} item={item} members={members} mutate={mutate} reload={reload} />)}
    </section>)}
  </div>;
}
