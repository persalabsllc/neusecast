# NeuseCast Weather Center · OBS package

This package prepares the software side of the Captain 97.1 / NeuseCast weather studio. Physical camera, lighting, audio-interface and confidence-monitor setup intentionally comes later.

## Browser sources

Use a 1920×1080 canvas at 30 fps. Add each URL as a full-canvas OBS Browser Source:

- Automated rundown: `https://www.neusecast.com/weather-center`
- Current conditions: `https://www.neusecast.com/weather-center?scene=current`
- Hourly: `https://www.neusecast.com/weather-center?scene=hourly`
- Seven day: `https://www.neusecast.com/weather-center?scene=seven-day`
- Regional temperatures: `https://www.neusecast.com/weather-center?scene=regional`
- Radar: `https://www.neusecast.com/weather-center?scene=radar`
- Alerts: `https://www.neusecast.com/weather-center?scene=alerts`
- Marine: `https://www.neusecast.com/weather-center?scene=marine`
- Tides: `https://www.neusecast.com/weather-center?scene=tides`
- Open/close: `?scene=open` and `?scene=close`

Each source refreshes itself when Studio publishes a newer valid weather run. Use **Shutdown source when not visible** and **Refresh browser when scene becomes active**.

## Green-screen composition

1. Add the Canon capture as `Weather Camera` above the browser source.
2. Add OBS Chroma Key to `Weather Camera` and sample the installed green screen.
3. Crop/scale the presenter for the selected map scene.
4. Route the Captain 97.1 mixer or wireless microphone into a dedicated OBS audio input.
5. Monitor through headphones; disable duplicate camera audio.
6. Record MKV locally and enable OBS automatic remux to MP4.

## Live output

Publish OBS to the MediaMTX service included with the NeuseCast playout stack:

- Service: Custom
- Server: `rtmp://PLAYOUT_LAN_IP:1935/weather-studio`
- Authentication: values from `MEDIAMTX_PUBLISH_USER` and `MEDIAMTX_PUBLISH_PASSWORD`
- Video: H.264, 1920×1080, 30 fps, 8 Mbps, two-second keyframes
- Audio: AAC stereo, 48 kHz, 192 kbps

Register `rtsp://mediamtx:8554/weather-studio` as the Weather Studio live source in NeuseCast Studio after the playout agent is installed. MediaMTX is LAN-only by default.

## Prerecorded reports

Record the finished OBS program to the local `NeuseCast Weather Reports` folder. Upload the MP4 to Studio as **Weather**, set **Available from** to the report time and **Available until** to the end of its forecast window. The automated graphics-only Weather Center remains the fallback whenever no current presenter report is available.

The Studio teleprompter is at `https://www.neusecast.com/weather-center/teleprompter`.
