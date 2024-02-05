FROM --platform=linux/amd64 marquezproject/marquez:0.43.1

WORKDIR /usr/src/app

COPY marquez.config.yml marquez.config.yml

EXPOSE 5000/tcp
EXPOSE 5001/tcp

ENTRYPOINT ["/usr/src/app/entrypoint.sh"]
