package fr.autoroutes.supervision.ingestion;

import fr.autoroutes.supervision.SupervisionProperties;
import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
class IngestionConfig {

    @Bean
    TollEventParser tollEventParser(JsonMapper mapper, Clock clock, SupervisionProperties properties) {
        return new TollEventParser(mapper, clock, properties.zone());
    }
}
