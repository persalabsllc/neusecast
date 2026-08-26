FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 neusecast \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin neusecast

WORKDIR /opt/neusecast/broadcast-agent
COPY package.json ./
COPY src ./src

RUN mkdir -p /var/lib/neusecast-agent /var/lib/casparcg/media \
    && chown -R neusecast:neusecast /opt/neusecast /var/lib/neusecast-agent /var/lib/casparcg

USER neusecast
EXPOSE 8787
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.mjs"]
