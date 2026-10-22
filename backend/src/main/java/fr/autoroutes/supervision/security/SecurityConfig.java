package fr.autoroutes.supervision.security;

import fr.autoroutes.supervision.SupervisionProperties;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.authority.mapping.GrantedAuthoritiesMapper;
import org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;

/**
 * Deux chaînes exclusives :
 * <ul>
 *   <li>{@code supervision.security.enabled=true} : connexion OIDC (Keycloak), session côté serveur, rôles VIEWER et ADMIN ;
 *       l'API répond 401 (jamais une redirection) pour que le client décide, CSRF actif sur {@code /api/v1/admin/**} ;</li>
 *   <li>sinon : aucune authentification (démonstration et développement, Q12), comportement des incréments précédents.</li>
 * </ul>
 */
@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
class SecurityConfig {

    static final String ADMIN_PATH = "/api/v1/admin/**";

    @Bean
    @ConditionalOnProperty(name = "supervision.security.enabled", havingValue = "true")
    SecurityFilterChain secured(HttpSecurity http) throws Exception {
        return http
                .authorizeHttpRequests(requests -> requests
                        // Sondes et métriques : joignables seulement depuis le réseau interne (nginx ne les relaie pas).
                        .requestMatchers("/actuator/health/**", "/actuator/prometheus").permitAll()
                        .requestMatchers("/oauth2/**", "/login/**", "/error").permitAll()
                        .requestMatchers(ADMIN_PATH).hasRole("ADMIN")
                        .requestMatchers("/api/**").hasAnyRole("VIEWER", "ADMIN")
                        .anyRequest().denyAll())
                // Retour toujours à l'application : sans cela, la dernière requête d'API refusée (401) serait rejouée après la connexion.
                .oauth2Login(login -> login.defaultSuccessUrl("/", true))
                .exceptionHandling(handling -> handling.defaultAuthenticationEntryPointFor(
                        new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED), PathPatternRequestMatcher.withDefaults().matcher("/api/**")))
                .csrf(csrf -> csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                        .csrfTokenRequestHandler(csrfHandler())
                        .ignoringRequestMatchers(request -> !request.getRequestURI().startsWith("/api/v1/admin/")))
                .build();
    }

    /**
     * Jeton CSRF en cookie lisible (double soumission) : le client le renvoie tel quel dans {@code X-XSRF-TOKEN}.
     * Gestionnaire simple (le brouillage XOR attend un jeton encodé par le serveur) et jeton chargé sans attendre, pour que le
     * cookie existe dès la première réponse.
     */
    private static CsrfTokenRequestAttributeHandler csrfHandler() {
        var handler = new CsrfTokenRequestAttributeHandler();
        handler.setCsrfRequestAttributeName(null);
        return handler;
    }

    @Bean
    @ConditionalOnProperty(name = "supervision.security.enabled", havingValue = "false", matchIfMissing = true)
    SecurityFilterChain open(HttpSecurity http) throws Exception {
        return http.authorizeHttpRequests(requests -> requests.anyRequest().permitAll()).csrf(csrf -> csrf.disable()).build();
    }

    /** Rôles Keycloak (revendication multivaluée, « roles » par défaut) → {@code ROLE_VIEWER}, {@code ROLE_ADMIN}. */
    @Bean
    @ConditionalOnProperty(name = "supervision.security.enabled", havingValue = "true")
    GrantedAuthoritiesMapper keycloakRoles(SupervisionProperties properties) {
        return authorities -> {
            var mapped = new ArrayList<GrantedAuthority>(authorities);
            for (var authority : authorities) {
                if (authority instanceof OidcUserAuthority oidc) {
                    roles(oidc.getIdToken().getClaim(properties.security().rolesClaim()))
                            .forEach(role -> mapped.add(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase(java.util.Locale.ROOT))));
                }
            }
            return mapped;
        };
    }

    private static List<String> roles(Object claim) {
        return claim instanceof Collection<?> values ? values.stream().map(String::valueOf).toList() : List.of();
    }
}
