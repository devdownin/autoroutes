package fr.autoroutes.supervision.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

/** Sans authentification configurée (démonstration, développement) : comportement inchangé. */
@SpringBootTest(classes = {SecurityConfig.class, OdAccessFilter.class},
        properties = "spring.autoconfigure.exclude=org.springframework.boot.kafka.autoconfigure.KafkaAutoConfiguration")
@AutoConfigureMockMvc
@Import(SecurityTestSupport.Beans.class)
class OpenAccessTest {

    @Autowired
    MockMvc mvc;

    @Test
    void everythingIsReachableWithoutAuthenticationAndWithoutCsrf() throws Exception {
        mvc.perform(get("/api/v1/ping")).andExpect(status().isOk());
        mvc.perform(post("/api/v1/admin/security-test")).andExpect(status().isOk());
    }
}
