import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { del, get, post } from './api';
import type { Label, Member } from './types';

export type BoardFilterValues = { text: string; labelId: string; memberId: string; due: string };
type SavedFilter = { id: string; boardId: string | null; name: string; query: BoardFilterValues };
type Props = {
  boardId: string; labels: Label[]; members: Member[]; values: BoardFilterValues;
  onChange: (field: keyof BoardFilterValues, value: string) => void;
  onApply: (values: BoardFilterValues) => void; onClose: () => void; flash: (message: string) => void;
};
const empty: BoardFilterValues = { text: '', labelId: '', memberId: '', due: '' };

export function BoardFilterPanel({ boardId, labels, members, values, onChange, onApply, onClose, flash }: Props) {
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const result = await get<{ filters: SavedFilter[] }>('/saved-filters');
      setSaved(result.filters.filter(filter => filter.boardId === boardId));
    } catch (error) { flash((error as Error).message); }
  };
  useEffect(() => { void load(); }, [boardId]);

  return <div className="filter-panel" aria-label="Filtros do quadro">
    <div className="filter-panel-head"><strong>Filtrar cartões</strong><button className="icon-button" title="Fechar filtros" onClick={onClose}><X size={16} /></button></div>
    <label>Palavra-chave<input value={values.text} onChange={event => onChange('text', event.target.value)} placeholder="Buscar neste quadro" /></label>
    <label>Etiqueta<select value={values.labelId} onChange={event => onChange('labelId', event.target.value)}><option value="">Todas</option>{labels.map(label => <option key={label.id} value={label.id}>{label.name}</option>)}</select></label>
    <label>Responsável<select value={values.memberId} onChange={event => onChange('memberId', event.target.value)}><option value="">Todos</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
    <label>Entrega<select value={values.due} onChange={event => onChange('due', event.target.value)}><option value="">Qualquer data</option><option value="today">Hoje</option><option value="overdue">Atrasados</option></select></label>
    <button className="subtle-button" onClick={() => onApply(empty)}>Limpar filtros</button>
    <form className="saved-filter-form" onSubmit={async event => {
      event.preventDefault();
      if (!name.trim() || busy) return;
      setBusy(true);
      try {
        await post('/saved-filters', { boardId, name: name.trim(), query: values });
        setName(''); await load(); flash('Filtro salvo');
      } catch (error) { flash((error as Error).message); }
      finally { setBusy(false); }
    }}><label>Salvar filtro atual<input value={name} onChange={event => setName(event.target.value)} placeholder="Nome do filtro" maxLength={100} /></label><button className="secondary-button" disabled={!name.trim() || busy}>{busy ? 'Salvando…' : 'Salvar filtro'}</button></form>
    {saved.length > 0 && <div className="saved-filter-list"><strong>Filtros salvos</strong>{saved.map(filter => <div key={filter.id} className="saved-filter-row"><button onClick={() => onApply({ ...empty, ...filter.query })}>{filter.name}</button><button className="icon-button" title={`Excluir filtro ${filter.name}`} onClick={async () => { try { await del(`/saved-filters/${filter.id}`); setSaved(previous => previous.filter(value => value.id !== filter.id)); flash('Filtro excluído'); } catch (error) { flash((error as Error).message); } }}><X size={14} /></button></div>)}</div>}
  </div>;
}
