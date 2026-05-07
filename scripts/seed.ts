// Seed synthetic CourtListener-shaped fixtures, then route them through the
// real ingestion pipeline. This guarantees the demo data exercises the same
// code paths as real bulk data — no special-cased seed-only inserts.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

type Party = { name: string; party_type: "plaintiff" | "defendant" };
type Docket = {
  id: number;
  case_name: string;
  docket_number: string;
  court: string;
  date_filed: string;
  date_terminated: string | null;
  nature_of_suit: string;
  cause: string;
  assigned_to_str: string | null;
  parties: Party[];
};

const COMPANIES = [
  "Acme Robotics, Inc.",
  "Northwind Energy Corp.",
  "Helix Pharmaceuticals LLC",
  "Bluepeak Software, Inc.",
  "Cascade Logistics Co.",
  "Orion Financial Group",
  "Vanta Biosciences Corp.",
  "Quanta Semiconductor Inc.",
  "Sterling Auto Holdings",
  "Meridian Insurance Co.",
  "Tessera Cloud, Inc.",
  "Pinegrove Foods Corp.",
];

const NATURES = [
  "Securities Fraud",
  "Antitrust",
  "Patent",
  "Trademark",
  "Contract",
  "Products Liability",
  "Employment - Class",
  "Consumer Fraud",
  "Environmental",
  "ERISA",
  "Tort",
];

const COURTS = ["S.D.N.Y.", "N.D. Cal.", "D. Del.", "C.D. Cal.", "E.D. Tex.", "D.N.J."];
const JUDGES = ["Hon. M. Reyes", "Hon. P. Okafor", "Hon. R. Lin", "Hon. S. Chen", "Hon. L. Patel", null];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function randDate(daysAgoMin: number, daysAgoMax: number): string {
  const days = daysAgoMin + Math.random() * (daysAgoMax - daysAgoMin);
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

// Distribute case counts so a few companies look risky and most look clean.
function caseCountFor(i: number): number {
  if (i < 2) return 18 + Math.floor(Math.random() * 10);   // hot
  if (i < 5) return 8 + Math.floor(Math.random() * 6);     // moderate
  return 1 + Math.floor(Math.random() * 5);                 // tail
}

function generate(): Docket[] {
  const out: Docket[] = [];
  let id = 100000;
  COMPANIES.forEach((co, i) => {
    const n = caseCountFor(i);
    for (let k = 0; k < n; k++) {
      // Risky companies: skew filings recent + severe.
      const recent = i < 2 || (i < 5 && Math.random() < 0.5);
      const dateFiled = recent ? randDate(5, 360) : randDate(200, 1800);
      const nature = i < 2
        ? pick(["Securities Fraud", "Antitrust", "Consumer Fraud", "Products Liability"])
        : pick(NATURES);
      const isPlaintiff = Math.random() < 0.2; // most cases against the company
      out.push({
        id: id++,
        case_name: `${isPlaintiff ? co.replace(/[,.]/g, "") : "Doe et al."} v. ${isPlaintiff ? "Doe et al." : co.replace(/[,.]/g, "")}`,
        docket_number: `1:${24 - Math.floor(Math.random() * 3)}-cv-${String(1000 + Math.floor(Math.random() * 9000))}`,
        court: pick(COURTS),
        date_filed: dateFiled,
        date_terminated: Math.random() < 0.3 ? randDate(0, Math.max(1, ((Date.now() - new Date(dateFiled).getTime()) / 86400000) - 1)) : null,
        nature_of_suit: nature,
        cause: `28 U.S.C. § ${1300 + Math.floor(Math.random() * 50)}`,
        assigned_to_str: pick(JUDGES) as string | null,
        parties: [
          isPlaintiff
            ? { name: co, party_type: "plaintiff" }
            : { name: "John Doe", party_type: "plaintiff" },
          isPlaintiff
            ? { name: "Roe Industries LLC", party_type: "defendant" }
            : { name: co, party_type: "defendant" },
        ],
      });
    }
  });
  return out;
}

async function main() {
  const dockets = generate();
  const tmp = path.join(os.tmpdir(), `lexpulse-seed-${Date.now()}.jsonl`);
  fs.writeFileSync(tmp, dockets.map((d) => JSON.stringify(d)).join("\n"));
  console.log(`wrote ${dockets.length} synthetic dockets to ${tmp}`);
  console.log("running ingestion…");
  execSync(`npx tsx scripts/ingest.ts --file ${tmp}`, { stdio: "inherit" });
  console.log("computing risk scores + alerts…");
  execSync(`npx tsx scripts/compute-risk.ts`, { stdio: "inherit" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
