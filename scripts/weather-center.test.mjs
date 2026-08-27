import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../drizzle/0013_tiny_ultimatum.sql", import.meta.url), "utf8");
const compose = await readFile(new URL("../broadcast-agent/docker-compose.yml", import.meta.url), "utf8");
const renderer = await readFile(new URL("../components/weather-center/weather-center-renderer.tsx", import.meta.url), "utf8");
const weatherData = await readFile(new URL("../lib/weather-center/data.ts", import.meta.url), "utf8");

test("Weather Center migration adds current-run storage without repeating the media taxonomy migration", () => {
  assert.match(migration, /CREATE TABLE "broadcast_weather_centers"/u);
  assert.match(migration, /CREATE TABLE "broadcast_weather_runs"/u);
  assert.doesNotMatch(migration, /CREATE TYPE "public"\."broadcast_segment"/u);
  assert.doesNotMatch(migration, /ADD VALUE 'segment_intro'/u);
});

test("Weather Center uses only official forecast, radar, alert, marine, and tide endpoints", () => {
  assert.match(weatherData, /api\.weather\.gov/u);
  assert.match(weatherData, /mapservices\.weather\.noaa\.gov/u);
  assert.match(weatherData, /api\.tidesandcurrents\.noaa\.gov/u);
  assert.match(weatherData, /AMZ137/u);
  assert.match(weatherData, /8655133/u);
});

test("Weather Center exposes the complete broadcast scene package", () => {
  for (const scene of ["current", "hourly", "seven-day", "regional", "radar", "alerts", "marine", "tides", "tropical"]) {
    assert.equal(renderer.includes(`scene === "${scene}"`), true, `${scene} scene is missing`);
  }
});

test("playout Compose includes a pinned LAN contribution gateway", () => {
  assert.match(compose, /bluenviron\/mediamtx:1\.20\.0/u);
  assert.match(compose, /MEDIAMTX_BIND_ADDRESS/u);
  assert.match(compose, /127\.0\.0\.1/u);
  assert.match(compose, /weather-studio/u);
});
