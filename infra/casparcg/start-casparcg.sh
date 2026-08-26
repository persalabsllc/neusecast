#!/bin/sh
set -eu

config_file=/var/lib/casparcg/config/casparcg.config
fallback_file=/var/lib/casparcg/media/NEUSECAST_FALLBACK.mp4
fallback_temp="${fallback_file}.tmp.$$.mp4"

mkdir -p /var/lib/casparcg/media /var/lib/casparcg/log /var/lib/casparcg/data /var/lib/casparcg/cache /var/lib/casparcg/config

valid_fallback() {
  [ -s "$1" ] && ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "$1" 2>/dev/null | grep -q video
}

if ! valid_fallback "$fallback_file"; then
  rm -f "$fallback_temp"
  trap 'rm -f "$fallback_temp"' EXIT HUP INT TERM
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=#06131d:s=1920x1080:r=30" \
    -f lavfi -i "anullsrc=r=48000:cl=stereo" \
    -vf "drawtext=fontfile=/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf:text='NEUSECAST':fontcolor=#d8f4f0:fontsize=88:x=(w-text_w)/2:y=(h-text_h)/2-38,drawtext=fontfile=/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf:text='Programming will continue shortly':fontcolor=#8fb7bc:fontsize=34:x=(w-text_w)/2:y=(h-text_h)/2+82" \
    -t 15 -shortest -c:v libx264 -preset veryfast -pix_fmt yuv420p -g 60 -c:a aac -b:a 128k -f mp4 "$fallback_temp"
  if ! valid_fallback "$fallback_temp"; then
    echo "Generated fallback failed ffprobe validation" >&2
    exit 70
  fi
  mv -f "$fallback_temp" "$fallback_file"
  trap - EXIT HUP INT TERM
fi

relay_url=${CASPAR_RELAY_URL:-udp://stream-relay:10000?pkt_size=1316}
case "$relay_url" in
  udp://*) ;;
  *)
    echo "CASPAR_RELAY_URL must be a udp:// URL" >&2
    exit 64
    ;;
esac
case "$relay_url" in
  *'<'*|*'>'*|*'"'*|*"'"*|*'&'*)
    echo "CASPAR_RELAY_URL contains a character that is unsafe in XML" >&2
    exit 64
    ;;
esac

# CasparCG writes only to a local UDP transport. UDP send remains available
# while the WAN relay reconnects, so Caspar's one-shot FFmpeg consumer cannot
# be erased by a Cloudflare/network write error.
stream_args="-codec:v libx264 -preset:v veryfast -tune:v zerolatency -profile:v high -level:v 4.1 -filter:v format=pix_fmts=yuv420p -g:v 60 -keyint_min:v 60 -sc_threshold:v 0 -b:v 6000k -minrate:v 6000k -maxrate:v 6000k -bufsize:v 12000k -codec:a aac -filter:a pan=stereo|c0=c0|c1=c1 -b:a 160k -ar:a 48000 -ac:a 2 -format mpegts -mpegts_flags +resend_headers"
CASPAR_CONSUMER_XML="        <ffmpeg>
          <path>${relay_url}</path>
          <args>${stream_args}</args>
          <realtime>true</realtime>
        </ffmpeg>"

export CASPAR_CONSUMER_XML
envsubst '$CASPAR_CONSUMER_XML' < /opt/neusecast/casparcg.config.template > "$config_file"
exec casparcg-server-2.5 "$config_file"
