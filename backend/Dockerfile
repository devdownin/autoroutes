# syntax=docker/dockerfile:1.7
# Contexte de build = racine du dépôt (référentiel inclus) : docker build -f backend/Dockerfile -t autoroutes-backend .
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /src
COPY backend/pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline
COPY backend/src src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q package -DskipTests \
 && java -Djarmode=tools -jar target/supervision-backend-*.jar extract --layers --launcher --destination /extracted

FROM eclipse-temurin:25-jre
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
# Couches du plus stable au plus changeant : seules les dernières sont reconstruites à chaque modification du code.
COPY --from=build /extracted/dependencies/ ./
COPY --from=build /extracted/spring-boot-loader/ ./
COPY --from=build /extracted/snapshot-dependencies/ ./
COPY --from=build /extracted/application/ ./
COPY referentiel/gares-logiques-proposition.csv referentiel/alias-gares.csv /app/referentiel/
ENV REFERENTIEL_STATIONS_FILE=/app/referentiel/gares-logiques-proposition.csv \
    REFERENTIEL_ALIASES_FILE=/app/referentiel/alias-gares.csv \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
USER app
EXPOSE 8080
# Pas de curl dans l'image JRE : sonde de disponibilité via /dev/tcp.
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=6 CMD ["bash", "-c", \
  "exec 3<>/dev/tcp/127.0.0.1/8080 && printf 'GET /actuator/health/readiness HTTP/1.0\\r\\n\\r\\n' >&3 && grep -q '\"UP\"' <&3"]
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
