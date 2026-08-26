FROM ubuntu:24.04

ARG CASPARCG_CEF_URL="https://github.com/CasparCG/server/releases/download/v2.5.0-stable/casparcg-cef-142_142.0.17.g60aac24%2B2-noble1_amd64.deb"
ARG CASPARCG_CEF_SHA256="052cdd35dfdadc28aeee7deb34f3adabda87674269e2b84dcb44a40f0e9c3d52"
ARG CASPARCG_SERVER_URL="https://github.com/CasparCG/server/releases/download/v2.5.0-stable/casparcg-server-2.5_2.5.0.stable-noble1_amd64.deb"
ARG CASPARCG_SERVER_SHA256="3e30fb9da8f096cdcf6857f2f51e64295548ae524c2a750fee575ea1d84ce86d"

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg fonts-liberation fonts-liberation2 gettext-base libgl1-mesa-dri mesa-utils netcat-openbsd tini \
    && curl --fail --location --retry 3 "$CASPARCG_CEF_URL" --output /tmp/casparcg-cef.deb \
    && curl --fail --location --retry 3 "$CASPARCG_SERVER_URL" --output /tmp/casparcg-server.deb \
    && echo "$CASPARCG_CEF_SHA256  /tmp/casparcg-cef.deb" | sha256sum --check --strict \
    && echo "$CASPARCG_SERVER_SHA256  /tmp/casparcg-server.deb" | sha256sum --check --strict \
    && apt-get install -y --no-install-recommends /tmp/casparcg-cef.deb /tmp/casparcg-server.deb \
    && rm -f /tmp/casparcg-cef.deb /tmp/casparcg-server.deb \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 casparcg \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin casparcg

COPY casparcg.config.template /opt/neusecast/casparcg.config.template
COPY start-casparcg.sh /usr/local/bin/start-neusecast-casparcg
COPY templates /var/lib/casparcg/template

RUN chmod 0755 /usr/local/bin/start-neusecast-casparcg \
    && mkdir -p /var/lib/casparcg/media /var/lib/casparcg/log /var/lib/casparcg/data /var/lib/casparcg/cache /var/lib/casparcg/config \
    && chown -R casparcg:casparcg /var/lib/casparcg

USER casparcg
WORKDIR /var/lib/casparcg
EXPOSE 5250
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/start-neusecast-casparcg"]
