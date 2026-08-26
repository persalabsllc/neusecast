#!/bin/sh
set -eu

protocol=${STREAM_PROTOCOL:-rtmps}
output_url=${STREAM_OUTPUT_URL:-}
input_url=${RELAY_INPUT_URL:-udp://0.0.0.0:10000?fifo_size=1000000&overrun_nonfatal=1}
ready_file=${RELAY_READY_FILE:-/tmp/neusecast-relay-ready}
max_runs=${RELAY_MAX_RUNS:-0}
runs=0
rm -f "$ready_file"
trap 'rm -f "$ready_file"' EXIT HUP INT TERM

case "$input_url" in
  udp://*) ;;
  *)
    echo "RELAY_INPUT_URL must be a udp:// URL" >&2
    exit 64
    ;;
esac

if [ -n "$output_url" ]; then
  cleaned_url=$(printf '%s' "$output_url" | tr -d '\r\n')
  if [ "$output_url" != "$cleaned_url" ]; then
    echo "STREAM_OUTPUT_URL contains a forbidden newline" >&2
    exit 64
  fi
  case "$protocol:$output_url" in
    rtmps:rtmps://*|srt:srt://*) ;;
    *)
      echo "STREAM_PROTOCOL and STREAM_OUTPUT_URL do not match (expected rtmps:// or srt://)" >&2
      exit 64
      ;;
  esac
else
  case "$protocol" in
    rtmps|srt) ;;
    *)
      echo "STREAM_PROTOCOL must be rtmps or srt" >&2
      exit 64
      ;;
  esac
fi

if [ "${RELAY_VALIDATE_ONLY:-0}" = "1" ]; then
  exit 0
fi

run_relay() {
  if [ -z "$output_url" ]; then
    ffmpeg -nostdin -hide_banner -loglevel error \
      -fflags +genpts+discardcorrupt -thread_queue_size 1024 -i "$input_url" \
      -map 0:v:0 -map '0:a:0?' -codec copy -f null -
  elif [ "$protocol" = "rtmps" ]; then
    ffmpeg -nostdin -hide_banner -loglevel quiet \
      -fflags +genpts+discardcorrupt -thread_queue_size 1024 -i "$input_url" \
      -map 0:v:0 -map '0:a:0?' -codec copy -flvflags no_duration_filesize \
      -f flv -rw_timeout 15000000 "$output_url"
  else
    ffmpeg -nostdin -hide_banner -loglevel quiet \
      -fflags +genpts+discardcorrupt -thread_queue_size 1024 -i "$input_url" \
      -map 0:v:0 -map '0:a:0?' -codec copy -f mpegts \
      -rw_timeout 15000000 "$output_url"
  fi
}

backoff=1
while :; do
  started_at=$(date +%s)
  touch "$ready_file"
  if run_relay; then status=0; else status=$?; fi
  rm -f "$ready_file"
  runs=$((runs + 1))
  if [ "$max_runs" -gt 0 ] && [ "$runs" -ge "$max_runs" ]; then exit 0; fi
  ended_at=$(date +%s)
  runtime=$((ended_at - started_at))
  echo "Cloudflare relay exited (status ${status}); restarting in ${backoff}s" >&2
  sleep "$backoff"
  if [ "$runtime" -ge 60 ]; then
    backoff=1
  elif [ "$backoff" -lt 30 ]; then
    backoff=$((backoff * 2))
    if [ "$backoff" -gt 30 ]; then backoff=30; fi
  fi
done
