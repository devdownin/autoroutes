import type { ReactNode } from 'react';

export interface EmptyAction {
  readonly label: string;
  readonly onClick: () => void;
}

/** État vide ou d'erreur : dit pourquoi il n'y a rien à afficher et propose une issue concrète. */
export function EmptyState({ tone = 'neutral', title, children, actions = [] }: {
  readonly tone?: 'neutral' | 'error';
  readonly title: string;
  readonly children?: ReactNode;
  readonly actions?: readonly EmptyAction[];
}) {
  return (
    <div className={`empty-state empty-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <strong>{title}</strong>
      {children !== undefined && <p>{children}</p>}
      {actions.length > 0 && (
        <div className="empty-actions">
          {actions.map((a) => <button key={a.label} type="button" className="icon-button" onClick={a.onClick}>{a.label}</button>)}
        </div>
      )}
    </div>
  );
}
