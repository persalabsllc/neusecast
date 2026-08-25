import type { FillerCategory } from "./constants";

export type LocalProgrammingSubject = {
  name: string;
  categories: readonly FillerCategory[];
  artworkQuery: string;
};

export const NEW_BERN_PROGRAMMING_SUBJECTS: readonly LocalProgrammingSubject[] = [
  { name: "Union Point Park and the Neuse–Trent riverfront", categories: ["place_spotlight", "river_and_coast"], artworkQuery: "Union Point Park New Bern North Carolina" },
  { name: "Downtown New Bern and its historic streetscape", categories: ["place_spotlight", "then_and_now", "history"], artworkQuery: "downtown New Bern North Carolina historic district" },
  { name: "Tryon Palace and its gardens", categories: ["place_spotlight", "history", "then_and_now"], artworkQuery: "Tryon Palace New Bern North Carolina" },
  { name: "New Bern City Hall and its clock tower", categories: ["place_spotlight", "history", "then_and_now"], artworkQuery: "New Bern City Hall clock tower" },
  { name: "New Bern Academy Museum", categories: ["place_spotlight", "history", "then_and_now"], artworkQuery: "New Bern Academy Museum North Carolina" },
  { name: "New Bern Firemen's Museum and the city's firefighting history", categories: ["place_spotlight", "history", "did_you_know"], artworkQuery: "New Bern Firemen's Museum North Carolina" },
  { name: "The Birthplace of Pepsi storefront", categories: ["place_spotlight", "history", "did_you_know"], artworkQuery: "Birthplace of Pepsi New Bern North Carolina" },
  { name: "Lawson Creek Park", categories: ["place_spotlight", "river_and_coast"], artworkQuery: "Lawson Creek Park New Bern North Carolina" },
  { name: "New Bern Battlefield Park", categories: ["place_spotlight", "history", "then_and_now"], artworkQuery: "New Bern Battlefield Park North Carolina" },
  { name: "Cedar Grove Cemetery", categories: ["place_spotlight", "history"], artworkQuery: "Cedar Grove Cemetery New Bern North Carolina" },
  { name: "The North Carolina History Center", categories: ["place_spotlight", "history"], artworkQuery: "North Carolina History Center New Bern" },
  { name: "The African American heritage of Duffyfield", categories: ["history", "then_and_now", "did_you_know"], artworkQuery: "Duffyfield New Bern North Carolina history" },
  { name: "The Neuse River", categories: ["river_and_coast", "fact", "did_you_know"], artworkQuery: "Neuse River New Bern North Carolina" },
  { name: "The Trent River", categories: ["river_and_coast", "fact", "did_you_know"], artworkQuery: "Trent River New Bern North Carolina" },
  { name: "New Bern's waterfront and riverwalk", categories: ["place_spotlight", "river_and_coast"], artworkQuery: "New Bern North Carolina waterfront riverwalk" },
  { name: "Historic homes and architecture in New Bern", categories: ["history", "then_and_now", "did_you_know"], artworkQuery: "historic homes New Bern North Carolina" },
] as const;

export function localSubjectPrompt(categories: readonly FillerCategory[]) {
  const requested = new Set(categories);
  return NEW_BERN_PROGRAMMING_SUBJECTS
    .filter((subject) => subject.categories.some((category) => requested.has(category)))
    .map((subject) => `${subject.name} [suggested image search: ${subject.artworkQuery}]`)
    .join("; ");
}
