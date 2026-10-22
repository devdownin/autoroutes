# syntax=docker/dockerfile:1.7
# Contexte de build = racine du dépôt : docker build -f simulator/Dockerfile -t autoroutes-simulator .
FROM maven:3.9-eclipse-temurin-25 AS build
WORKDIR /src
COPY simulator/pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:go-offline
COPY simulator/src src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q package -DskipTests

FROM eclipse-temurin:25-jre
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=build /src/target/supervision-simulator-*.jar app.jar
COPY referentiel/gares-logiques-proposition.csv referentiel/alias-gares.csv /app/referentiel/
ENV REFERENTIEL_STATIONS_FILE=/app/referentiel/gares-logiques-proposition.csv \
    REFERENTIEL_ALIASES_FILE=/app/referentiel/alias-gares.csv
USER app
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
