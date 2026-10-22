package fr.autoroutes.supervision.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import fr.autoroutes.supervision.SupervisionProperties;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority;
import org.springframework.test.web.servlet.MockMvc;
import java.time.Instant;

@SpringBootTest(classes = {SecurityConfig.class, OdAccessFilter.class}, properties = {
        "supervision.security.enabled=true", "supervision.security.od-queries-per-minute=3",
        "spring.autoconfigure.exclude=org.springframework.boot.kafka.autoconfigure.KafkaAutoConfiguration"})
@AutoConfigureMockMvc
@Import(SecurityTestSupport.Beans.class)
class SecuredApiTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    SecurityConfig config;

    @Autowired
    SupervisionProperties properties;

    private static org.springframework.test.web.servlet.request.RequestPostProcessor user(String name, String role) {
        return oidcLogin().idToken(token -> token.subject(name)).authorities(new SimpleGrantedAuthority("ROLE_" + role));
    }

    @Test
    void anonymousApiCallGetsAnUnauthorizedStatusNotARedirect() throws Exception {
        mvc.perform(get("/api/v1/ping")).andExpect(status().isUnauthorized());
    }

    @Test
    void viewerReadsButCannotAdminister() throws Exception {
        mvc.perform(get("/api/v1/ping").with(user("alice", "VIEWER"))).andExpect(status().isOk());
        mvc.perform(post("/api/v1/admin/security-test").with(user("alice", "VIEWER")).with(csrf())).andExpect(status().isForbidden());
    }

    @Test
    void adminNeedsTheCsrfTokenOnAdministrationRoutesOnly() throws Exception {
        mvc.perform(post("/api/v1/admin/security-test").with(user("root", "ADMIN"))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/admin/security-test").with(user("root", "ADMIN")).with(csrf())).andExpect(status().isOk());
    }

    @Test
    void everythingOutsideTheApiIsDenied() throws Exception {
        mvc.perform(get("/secret").with(user("root", "ADMIN"))).andExpect(status().isForbidden());
    }

    @Test
    void odQueriesAreBudgetedPerUser() throws Exception {
        for (var i = 0; i < 3; i++) {
            mvc.perform(get("/api/v1/od/security-test").with(user("carol", "VIEWER"))).andExpect(status().isOk());
        }
        mvc.perform(get("/api/v1/od/security-test").with(user("carol", "VIEWER"))).andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"));
        mvc.perform(get("/api/v1/od/security-test").with(user("dave", "VIEWER"))).andExpect(status().isOk());
    }

    @Test
    void mapsTheKeycloakRolesClaimToAuthorities() {
        var token = new OidcIdToken("t", Instant.now(), Instant.now().plusSeconds(60), Map.of("sub", "u", "roles", List.of("viewer", "admin")));
        var mapper = config.keycloakRoles(properties);

        var authorities = mapper.mapAuthorities(List.of(new OidcUserAuthority(token)));

        assertThat(authorities).extracting(Object::toString).contains("ROLE_VIEWER", "ROLE_ADMIN");
    }
}
