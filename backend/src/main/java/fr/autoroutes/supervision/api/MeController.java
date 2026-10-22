package fr.autoroutes.supervision.api;

import java.security.Principal;
import java.util.List;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
class MeController {

    /** @param authenticated faux sans authentification configurée (démonstration, développement) */
    record Me(boolean authenticated, String name, List<String> roles) {
    }

    /** Identité courante : le client s'en sert pour savoir s'il doit lancer la connexion (réponse 401 sinon). */
    @GetMapping("/me")
    Me me(Principal principal) {
        if (principal == null) {
            return new Me(false, null, List.of());
        }
        var roles = principal instanceof Authentication authentication
                ? authentication.getAuthorities().stream().map(a -> a.getAuthority()).filter(a -> a.startsWith("ROLE_"))
                        .map(a -> a.substring("ROLE_".length())).sorted().toList()
                : List.<String>of();
        return new Me(true, principal.getName(), roles);
    }
}
