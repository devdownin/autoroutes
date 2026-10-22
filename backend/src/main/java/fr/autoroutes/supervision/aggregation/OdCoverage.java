package fr.autoroutes.supervision.aggregation;

/**
 * Issue de chaque SORTIE appliquée à l'état, en véhicules, sur une fenêtre :
 * flux enregistré, sortie en système ouvert (pas d'origine attendue), origine absente ou origine inconnue.
 * Somme des quatre = sorties de toutes les gares sur la même fenêtre : c'est l'invariant de cohérence des flux O/D.
 */
public record OdCoverage(long recorded, long openSystem, long entryMissing, long entryUnknown) {

    public static final OdCoverage EMPTY = new OdCoverage(0, 0, 0, 0);

    public long totalExits() {
        return recorded + openSystem + entryMissing + entryUnknown;
    }

    /** Sorties dont l'origine est attendue (système fermé). */
    public long closedSystemExits() {
        return recorded + entryMissing + entryUnknown;
    }

    /** Part des sorties en système fermé dont l'origine est connue ; {@code NaN} sans sortie. */
    public double originKnownRatio() {
        var closed = closedSystemExits();
        return closed == 0 ? Double.NaN : (double) recorded / closed;
    }

    public OdCoverage plus(OdCoverage other) {
        return new OdCoverage(recorded + other.recorded, openSystem + other.openSystem,
                entryMissing + other.entryMissing, entryUnknown + other.entryUnknown);
    }
}
