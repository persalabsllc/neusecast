import { dateTimeInZone } from "@/lib/time-zone";
import type { NewsroomSlot } from "./types";

export const NEWSROOM_TIME_ZONE = "America/New_York";
export const NEWSROOM_RETRY_COOLDOWN_MINUTES = 45;

type AutomaticNewsroomSlot = Extract<NewsroomSlot, "morning" | "afternoon">;

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

function easternParts(date: Date): LocalDateParts {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: NEWSROOM_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
  };
}

function easternDateTime(
  date: Pick<LocalDateParts, "year" | "month" | "day">,
  hour: number,
  minute: number,
  dayOffset = 0,
) {
  const calendarDay = new Date(Date.UTC(date.year, date.month - 1, date.day + dayOffset));
  const result = dateTimeInZone({
    year: calendarDay.getUTCFullYear(),
    month: calendarDay.getUTCMonth() + 1,
    day: calendarDay.getUTCDate(),
    hour,
    minute,
  }, NEWSROOM_TIME_ZONE);

  if (!result) throw new Error("Unable to calculate the Eastern newsroom window.");
  return result;
}

/** Automatic editions retry hourly until the next daypart takes over. */
export function automaticNewsroomSlot(now = new Date()): AutomaticNewsroomSlot {
  const { hour } = easternParts(now);
  if (hour >= 6 && hour < 15) return "morning";
  return "afternoon";
}

export function newsroomSlotWindow(slot: AutomaticNewsroomSlot, reference = new Date()) {
  const localDate = easternParts(reference);
  if (slot === "morning") {
    return {
      start: easternDateTime(localDate, 6, 0),
      end: easternDateTime(localDate, 15, 30),
    };
  }

  const startDayOffset = localDate.hour < 6 ? -1 : 0;
  return {
    start: easternDateTime(localDate, 15, 0, startDayOffset),
    end: easternDateTime(localDate, 6, 30, startDayOffset + 1),
  };
}

export function newsroomEditionHardExpiry(slot: NewsroomSlot, scheduledAt: Date) {
  if (slot !== "morning" && slot !== "afternoon") return null;
  return newsroomSlotWindow(slot, scheduledAt).end;
}

export function effectiveNewsroomExpiry(
  edition: Pick<{ slot: string; scheduledAt: Date; expiresAt: Date }, "slot" | "scheduledAt" | "expiresAt">,
) {
  const hardExpiry = newsroomEditionHardExpiry(edition.slot as NewsroomSlot, edition.scheduledAt);
  return hardExpiry && hardExpiry.getTime() < edition.expiresAt.getTime()
    ? hardExpiry
    : edition.expiresAt;
}

export function isNewsroomEditionAirable(
  edition: Pick<{ slot: string; scheduledAt: Date; expiresAt: Date }, "slot" | "scheduledAt" | "expiresAt">,
  now = new Date(),
) {
  return edition.scheduledAt.getTime() <= now.getTime()
    && effectiveNewsroomExpiry(edition).getTime() > now.getTime();
}

export function newsroomRetryCutoff(now = new Date()) {
  return new Date(now.getTime() - NEWSROOM_RETRY_COOLDOWN_MINUTES * 60 * 1_000);
}
