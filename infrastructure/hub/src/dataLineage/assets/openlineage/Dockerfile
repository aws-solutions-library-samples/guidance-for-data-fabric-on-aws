#checkov:skip=CKV_DOCKER_3: no need to create a user for the container
ARG MARQUEZ_VERSION_TAG=0.32.0
FROM --platform=linux/amd64 marquezproject/marquez:${MARQUEZ_VERSION_TAG}

WORKDIR /usr/src/app

COPY marquez.config.yml marquez.config.yml

EXPOSE 5000/tcp
EXPOSE 5001/tcp

HEALTHCHECK CMD curl --fail http://localhost:5000 || exit 1"

ENTRYPOINT ["/usr/src/app/entrypoint.sh"]
