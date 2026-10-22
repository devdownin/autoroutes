package fr.autoroutes.supervision.security;

import fr.autoroutes.supervision.SupervisionProperties;
import java.time.Clock;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/** Contexte minimal : la configuration de sécurité, le filtre d'audit et trois routes factices (sans Kafka ni base). */
final class SecurityTestSupport {

    private SecurityTestSupport() {
    }

    @TestConfiguration
    @EnableConfigurationProperties(SupervisionProperties.class)
    static class Beans {

        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }

        @Bean
        ClientRegistrationRepository clients() {
            return new InMemoryClientRegistrationRepository(ClientRegistration.withRegistrationId("keycloak")
                    .clientId("supervision").clientSecret("secret").authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
                    .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}").scope("openid")
                    .authorizationUri("http://keycloak/auth").tokenUri("http://keycloak/token").jwkSetUri("http://keycloak/jwks")
                    .userNameAttributeName("sub").build());
        }

        @Bean
        Routes routes() {
            return new Routes();
        }
    }

    /** Chemins propres au test : le test d'intégration complet les trouve aussi par analyse de composants, sans collision. */
    @RestController
    static class Routes {

        @GetMapping("/api/v1/ping")
        String ping() {
            return "pong";
        }

        @GetMapping("/api/v1/od/security-test")
        String od() {
            return "od";
        }

        @PostMapping("/api/v1/admin/security-test")
        String admin() {
            return "ok";
        }
    }
}
