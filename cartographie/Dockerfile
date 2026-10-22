# Outils de la chaîne cartographique. Versions vérifiées lors de la production du premier jeu de données (octobre 2026).
# go-pmtiles est compilé depuis les sources (les archives binaires des « releases » ne sont pas toujours accessibles).
# Images de base paramétrables (miroir de registre, limite de débit de Docker Hub).
ARG GOLANG_IMAGE=golang:1.25
ARG UBUNTU_IMAGE=ubuntu:24.04

FROM ${GOLANG_IMAGE} AS pmtiles
ARG PMTILES_VERSION=v1.31.2
RUN go install github.com/protomaps/go-pmtiles@${PMTILES_VERSION}

# tippecanoe 2.49 et osmium-tool 1.16 viennent des paquets Ubuntu 24.04 : plus de compilation depuis GitHub.
FROM ${UBUNTU_IMAGE}
RUN apt-get update && apt-get install -y --no-install-recommends tippecanoe osmium-tool python3 python3-pyproj curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=pmtiles /go/bin/go-pmtiles /usr/local/bin/pmtiles
WORKDIR /repo
ENTRYPOINT ["/repo/cartographie/build.sh"]
