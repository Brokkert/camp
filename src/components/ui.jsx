// Kleine bouwstenen die overal terugkomen.

import { useEffect } from 'react';
import { MONTHS, TAG_GROUPS, tagOf } from '../data/taxonomy.js';

export function Sheet({ title, onClose, children, actions = null }) {
  // Achtergrond niet laten meescrollen zolang het paneel open staat.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          {actions}
          <button className="btn ghost icon" onClick={onClose} aria-label="Sluiten">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Note({ tone = 'info', children }) {
  return <div className={`note ${tone}`}>{children}</div>;
}

export function Empty({ art, title, children }) {
  return (
    <div className="empty">
      <div className="art">{art}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function Stars({ value, onChange, readOnly = false }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= (value || 0) ? 'on' : ''}
          disabled={readOnly}
          style={readOnly ? { cursor: 'default' } : undefined}
          onClick={() => onChange?.(value === n ? null : n)}
          aria-label={`${n} van 5`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function TagPicker({ value = [], onChange }) {
  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((t) => t !== id) : [...value, id]);

  return (
    <div className="col">
      {TAG_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="tiny muted" style={{ marginBottom: 5 }}>
            {group.label}
          </div>
          <div className="chips">
            {group.tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={`chip${value.includes(tag.id) ? ' on' : ''}`}
                onClick={() => toggle(tag.id)}
              >
                {tag.emoji} {tag.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TagList({ tags = [], limit = null }) {
  const shown = limit ? tags.slice(0, limit) : tags;
  return (
    <div className="chips">
      {shown.map((id) => {
        const tag = tagOf(id);
        return (
          <span key={id} className="chip readonly tiny">
            {tag.emoji} {tag.label}
          </span>
        );
      })}
      {limit && tags.length > limit && (
        <span className="chip readonly tiny">+{tags.length - limit}</span>
      )}
    </div>
  );
}

export function MonthPicker({ value = [], onChange }) {
  const toggle = (m) =>
    onChange(value.includes(m) ? value.filter((x) => x !== m) : [...value, m].sort((a, b) => a - b));

  return (
    <div className="months">
      {MONTHS.map((label, i) => (
        <button
          key={label}
          type="button"
          className={value.includes(i + 1) ? 'on' : ''}
          onClick={() => toggle(i + 1)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Confirm({ title, body, confirmLabel = 'Verwijderen', onConfirm, onClose }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0, lineHeight: 1.6 }}>
        {body}
      </p>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow" onClick={onClose}>
          Annuleren
        </button>
        <button
          className="btn danger grow"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}

/** Kopieert naar het klembord en geeft terug of het lukte. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Zonder https of zonder toestemming: ouderwets via een tekstveld.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}
