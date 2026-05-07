// Court ID → multiplier table.
//
// CourtListener uses standardized court IDs: "scotus", "ca1".."ca11", "cadc",
// "cafc"; federal districts like "nysd", "cand", "ilnd"; bankruptcy "nysb".
// State court IDs exist but are out of scope for Score v2 (federal-civil only).

export type CourtLevel = "federal" | "state" | "unknown";

const CIRCUIT_WEIGHT: Record<string, number> = {
  scotus: 1.15,
  ca1: 1.05, ca2: 1.15, ca3: 1.05, ca4: 1.05, ca5: 1.15, ca6: 1.05,
  ca7: 1.05, ca8: 1.05, ca9: 1.15, ca10: 1.05, ca11: 1.15,
  cadc: 1.10, cafc: 1.10,
};

// District → circuit. Compact, hand-maintained (CourtListener has the full list
// but most filings concentrate in a small set). Anything not in this map falls
// back to a generic federal-district weight of 1.05.
const DISTRICT_TO_CIRCUIT: Record<string, string> = {
  // 1st Circuit
  med: "ca1", mad: "ca1", nhd: "ca1", rid: "ca1", prd: "ca1",
  // 2nd Circuit
  ctd: "ca2", nynd: "ca2", nysd: "ca2", nyed: "ca2", nywd: "ca2", vtd: "ca2",
  // 3rd Circuit
  ded: "ca3", njd: "ca3", paed: "ca3", pamd: "ca3", pawd: "ca3", vid: "ca3",
  // 4th Circuit
  mdd: "ca4", nced: "ca4", ncmd: "ca4", ncwd: "ca4", scd: "ca4",
  vaed: "ca4", vawd: "ca4", wvnd: "ca4", wvsd: "ca4",
  // 5th Circuit
  laed: "ca5", lamd: "ca5", lawd: "ca5", miassd: "ca5", msnd: "ca5",
  txed: "ca5", txnd: "ca5", txsd: "ca5", txwd: "ca5",
  // 6th Circuit
  kyed: "ca6", kywd: "ca6", mied: "ca6", miwd: "ca6", ohnd: "ca6",
  ohsd: "ca6", tned: "ca6", tnmd: "ca6", tnwd: "ca6",
  // 7th Circuit
  ilnd: "ca7", ilcd: "ca7", ilsd: "ca7", innd: "ca7", insd: "ca7",
  wied: "ca7", wiwd: "ca7",
  // 8th Circuit
  ared: "ca8", arwd: "ca8", iand: "ca8", iasd: "ca8", mnd: "ca8",
  moed: "ca8", mowd: "ca8", ned: "ca8", ndd: "ca8", sdd: "ca8",
  // 9th Circuit
  akd: "ca9", azd: "ca9", cacd: "ca9", caed: "ca9", cand: "ca9",
  casd: "ca9", hid: "ca9", idd: "ca9", mtd: "ca9", nvd: "ca9",
  ord: "ca9", waed: "ca9", wawd: "ca9", gud: "ca9", nmid: "ca9",
  // 10th Circuit
  cod: "ca10", ksd: "ca10", nmd: "ca10", oked: "ca10", oknd: "ca10",
  okwd: "ca10", utd: "ca10", wyd: "ca10",
  // 11th Circuit
  almd: "ca11", alnd: "ca11", alsd: "ca11", flmd: "ca11", flnd: "ca11",
  flsd: "ca11", gamd: "ca11", gand: "ca11", gasd: "ca11",
  // DC
  dcd: "cadc",
};

export function courtCircuit(courtId: string | null | undefined): string | null {
  if (!courtId) return null;
  const id = courtId.toLowerCase();
  if (id in CIRCUIT_WEIGHT) return id;
  if (id in DISTRICT_TO_CIRCUIT) return DISTRICT_TO_CIRCUIT[id];
  return null;
}

export function courtLevel(courtId: string | null | undefined): CourtLevel {
  if (!courtId) return "unknown";
  const id = courtId.toLowerCase();
  if (id === "scotus") return "federal";
  if (id in CIRCUIT_WEIGHT) return "federal";
  if (id in DISTRICT_TO_CIRCUIT) return "federal";
  if (/^[a-z]{2,4}b$/.test(id)) return "federal"; // bankruptcy
  return "unknown";
}

export function courtWeight(courtId: string | null | undefined): number {
  if (!courtId) return 1.0;
  const id = courtId.toLowerCase();
  if (id in CIRCUIT_WEIGHT) return CIRCUIT_WEIGHT[id];
  if (id in DISTRICT_TO_CIRCUIT) return 1.05;        // generic district weight
  if (/^[a-z]{2,4}b$/.test(id)) return 0.95;          // bankruptcy
  return 1.0;
}
