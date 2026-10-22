package fr.autoroutes.supervision.api;

import fr.autoroutes.supervision.referentiel.StationCatalog;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.WebRequest;

@RestController
@RequestMapping("/api/v1/referentiel")
class ReferentielController {

    private final StationCatalog catalog;
    private final Map<String, Object> stationsGeoJson;

    ReferentielController(StationCatalog catalog) {
        this.catalog = catalog;
        this.stationsGeoJson = catalog.toGeoJson();
    }

    /** ETag = version du référentiel : le navigateur ne retélécharge que si le référentiel change. */
    @GetMapping(path = "/stations", produces = "application/geo+json")
    ResponseEntity<Map<String, Object>> stations(WebRequest request) {
        var etag = "\"" + catalog.version() + "\"";
        if (request.checkNotModified(etag)) {
            return null;
        }
        return ResponseEntity.ok().eTag(etag).body(stationsGeoJson);
    }
}
