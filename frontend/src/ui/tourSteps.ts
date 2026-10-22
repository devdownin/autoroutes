export interface TourStep {
  readonly id: string;
  /** Valeur de l'attribut {@code data-tour} de l'élément mis en avant ; une étape dont la cible est absente est sautée. */
  readonly target: string;
  readonly title: string;
  readonly body: string;
  /** Sur petit écran, le panneau latéral est un tiroir : il faut l'ouvrir pour le montrer. */
  readonly opensDrawer?: boolean;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'map',
    target: 'map',
    title: 'La carte des gares',
    body: 'Chaque cercle est une gare de péage. Sa surface est proportionnelle aux passages de la dernière heure : ce sont des données observées. Un halo bref signale de nouveaux passages ; survolez une gare pour un aperçu, cliquez pour le détail.',
  },
  {
    id: 'status',
    target: 'status',
    title: 'La fraîcheur des données',
    body: '« Temps réel » signifie que les données sont à jour. « Rattrapage » : le serveur lit encore des messages en retard. « Données périmées » : plus rien n’arrive, ne vous fiez pas aux chiffres affichés.',
  },
  {
    id: 'panel',
    target: 'panel',
    opensDrawer: true,
    title: 'Couches, flux et légende',
    body: 'Activez les flux origine → destination (observés) ou la charge des tronçons (estimée, en tirets). Les sections s’ouvrent une à la fois ; la légende décrit ce qui est affiché.',
  },
  {
    id: 'replay',
    target: 'replay',
    title: 'Revoir le passé',
    body: 'La relecture rejoue les 7 derniers jours minute par minute, jusqu’à 300 fois plus vite, puis vous ramène au direct.',
  },
  {
    id: 'help',
    target: 'help',
    title: 'Besoin d’un rappel ?',
    body: 'L’aide explique ce qui est mesuré, ce qui est estimé, le seuil de 3 véhicules et les limites des données. Vous pouvez aussi y relancer cette visite.',
  },
];
