import { useEffect, useRef } from 'react';
import { useUiStore } from '../state/uiStore';

/** Fragment d'adresse qui ouvre l'aide : le lien est partageable (#a-propos). */
export const ABOUT_HASH = '#a-propos';

/**
 * « À propos des données » : ce qui est mesuré, ce qui est estimé, le seuil de diffusion et les limites,
 * en un seul endroit plutôt que dispersé en notes. Boîte de dialogue native : focus piégé, Échap, fond inerte.
 */
export function AboutDialog() {
  const open = useUiStore((s) => s.aboutOpen);
  const setOpen = useUiStore((s) => s.setAboutOpen);
  const setTourActive = useUiStore((s) => s.setTourActive);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }
    if (open && !element.open) {
      if (typeof element.showModal === 'function') {
        element.showModal();
      } else {
        element.setAttribute('open', '');
      }
    } else if (!open && element.open) {
      if (typeof element.close === 'function') {
        element.close();
      } else {
        element.removeAttribute('open');
      }
    }
  }, [open]);

  return (
    <dialog ref={dialog} className="about" aria-labelledby="about-title" onClose={() => { setOpen(false); }}
      onClick={(event) => { if (event.target === dialog.current) setOpen(false); }}>
      {open && <div className="about-content">
        <header>
          <h1 id="about-title">À propos des données</h1>
          <button type="button" className="icon-button" aria-label="Fermer l’aide" onClick={() => { setOpen(false); }}>✕</button>
        </header>

        <h2>Ce que l’on voit</h2>
        <p>Chaque cercle est une gare de péage. Les chiffres sont des <strong>passages observés</strong> (entrées et sorties) agrégés sur 5 minutes,
          15 minutes, 1 heure et depuis minuit. La surface d’un cercle est proportionnelle aux passages de la dernière heure.</p>

        <h2>Observé ou estimé</h2>
        <ul>
          <li><strong>Observé</strong> : les passages par gare, les flux origine → destination et l’historique. Ils viennent directement des événements des gares.</li>
          <li><strong>Estimé</strong> : la charge des tronçons, toujours dessinée en <strong>tirets</strong>. Chaque flux observé est affecté au trajet le plus rapide :
            un seul itinéraire par flux, sans tenir compte des alternatives.</li>
        </ul>

        <h2>Flux origine → destination et seuil de 3 véhicules</h2>
        <p>Un flux n’est affiché que s’il atteint <strong>3 véhicules sur l’heure</strong>, après regroupement au niveau choisi (gare ou département).
          Les flux inférieurs ne sont jamais détaillés : seuls leur nombre et leur volume total sont indiqués. C’est une protection des données personnelles.
          L’interface ne contient ni plaque d’immatriculation ni identifiant de véhicule.</p>

        <h2>Ce qui n’est pas mesuré</h2>
        <ul>
          <li>Le trafic qui ne passe pas par une gare de péage (axes gratuits, sections sans péage).</li>
          <li>Les trajets dont l’entrée et la sortie ne sont pas toutes deux dans le réseau mesuré.</li>
          <li>Les sorties des barrières en système ouvert : un seul passage, donc pas de gare d’entrée, donc pas de flux origine → destination.</li>
        </ul>

        <h2>Fraîcheur</h2>
        <p>« Données à » indique l’heure des données les plus récentes prises en compte. <strong>Temps réel</strong> : à jour. <strong>Rattrapage</strong> : des messages
          en retard sont encore lus. <strong>Données périmées</strong> : plus rien n’arrive, les chiffres ne sont plus fiables.
          Les passages arrivés en retard (jusqu’à 10 minutes) sont intégrés ; au-delà, jusqu’à 2 heures, ils corrigent seulement l’historique.</p>

        <h2>Relecture</h2>
        <p>La relecture rejoue les 7 derniers jours minute par minute, jusqu’à 300 fois plus vite. Pendant la relecture, le direct est suspendu.</p>

        <h2>Sources</h2>
        <p>Gares et échangeurs : Ministère de la Transition écologique (data.gouv.fr). Fond de carte et tracé des autoroutes, lorsqu’ils sont activés :
          © OpenStreetMap contributors (licence ODbL).</p>

        <footer>
          <button type="button" className="icon-button" onClick={() => { setOpen(false); setTourActive(true); }}>Revoir la visite guidée</button>
          <button type="button" className="icon-button primary" onClick={() => { setOpen(false); }}>Fermer</button>
        </footer>
      </div>}
    </dialog>
  );
}
