package fr.autoroutes.simulator;

import java.util.Random;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class SimulatorApplication {

    public static void main(String[] args) {
        SpringApplication.run(SimulatorApplication.class, args);
    }

    @Bean
    Random random(SimulatorProperties properties) {
        return properties.seed() == null ? new Random() : new Random(properties.seed());
    }

    @Bean
    StationPool stationPool(SimulatorProperties properties, Random random) {
        return StationPool.load(properties.stationsPath(), properties.aliasesPath(), random);
    }
}
