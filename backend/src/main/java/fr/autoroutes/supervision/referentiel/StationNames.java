package fr.autoroutes.supervision.referentiel;

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Normalisation des noms de gare pour le rapprochement événement ↔ référentiel.
 * Volontairement légère : accents, casse, ponctuation et espaces. Les variantes de sens
 * (Entrée/Sortie, Sens 1/2) sont traitées par la table d'alias, jamais par une heuristique.
 */
public final class StationNames {

    private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");
    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");

    private StationNames() {
    }

    public static String normalize(String name) {
        var decomposed = Normalizer.normalize(name, Normalizer.Form.NFKD);
        var lower = DIACRITICS.matcher(decomposed).replaceAll("").toLowerCase(Locale.ROOT);
        return NON_ALNUM.matcher(lower).replaceAll(" ").strip();
    }
}
