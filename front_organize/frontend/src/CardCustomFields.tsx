import { useEffect, useRef, useState } from 'react';
import type { CardFieldValue, CustomField } from './types';

type Value = CardFieldValue['value'];
type Save = (fieldId: string, value: Value) => Promise<boolean>;

function displayValue(field: CustomField, value: Value | undefined) {
  if (value === null || value === undefined) return '';
  if (field.type === 'date') return String(value).slice(0, 10);
  return String(value);
}

function FieldInput({ field, value, disabled, onSave }: { field: CustomField; value: Value | undefined; disabled: boolean; onSave: Save }) {
  const [draft, setDraft] = useState(() => displayValue(field, value));
  const [pending, setPending] = useState(false);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setDraft(displayValue(field, value)); }, [field.type, value]);

  async function save(next: Value) {
    setPending(true);
    try {
      const ok = await onSave(field.id, next);
      if (!ok) setDraft(displayValue(field, value));
    } finally { setPending(false); }
  }

  if (field.type === 'checkbox') return <label>{field.name}<input type="checkbox" checked={value === true} disabled={disabled || pending} onChange={event => void save(event.target.checked)} /></label>;
  if (field.type === 'select') return <label>{field.name}<select value={draft} disabled={disabled || pending} onChange={event => { setDraft(event.target.value); void save(event.target.value || null); }}><option value="">Selecionar</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select></label>;
  return <label>{field.name}<input
    type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
    value={draft}
    disabled={disabled || pending}
    onFocus={() => { editing.current = true; }}
    onChange={event => setDraft(event.target.value)}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
    onBlur={() => {
      editing.current = false;
      if (draft === displayValue(field, value)) return;
      const next = draft === '' && field.type !== 'text' ? null : field.type === 'number' ? Number(draft) : draft;
      void save(next);
    }}
  /></label>;
}

export function CardCustomFields({ fields, values, disabled, onSave }: { fields: CustomField[]; values: CardFieldValue[]; disabled: boolean; onSave: Save }) {
  return <div className="custom-fields">{fields.map(field => <FieldInput key={field.id} field={field} value={values.find(item => item.fieldId === field.id)?.value} disabled={disabled} onSave={onSave} />)}</div>;
}
