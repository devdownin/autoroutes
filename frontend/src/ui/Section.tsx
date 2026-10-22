import type { ReactNode } from 'react';
import { useUiStore } from '../state/uiStore';
import type { SectionId } from '../state/uiStore';

/**
 * Section repliable du panneau latéral. Une seule est ouverte à la fois : le panneau garde la hauteur de l'écran
 * quel que soit le nombre de couches actives. Le contenu fermé reste dans le DOM mais masqué (état conservé).
 */
export function Section({ id, title, label, badge, children }: {
  readonly id: SectionId;
  readonly title: string;
  /** Nom accessible de la région, si différent du titre. */
  readonly label?: string;
  readonly badge?: ReactNode;
  readonly children: ReactNode;
}) {
  const open = useUiStore((s) => s.openSection === id);
  const setOpen = useUiStore((s) => s.setOpenSection);
  return (
    <section className="panel-section" aria-label={label ?? title}>
      <h2>
        <button type="button" className="section-toggle" aria-expanded={open} aria-controls={`section-${id}`}
          onClick={() => { setOpen(open ? null : id); }}>
          <span className="section-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span className="section-title">{title}</span>
          {badge}
        </button>
      </h2>
      <div id={`section-${id}`} className="section-body" hidden={!open}>{children}</div>
    </section>
  );
}
