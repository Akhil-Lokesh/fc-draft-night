import { test, expect } from "vitest";
import { exportSeasonCsv, exportSeasonXlsx, exportSeasonPdf } from "../export.js";
import { createRoom, addManager, loadSeed } from "@fcdn/shared";

function closedRoom() {
  let s = createRoom({ code: "AB", totalBudget: 600, seed: loadSeed() });
  s = addManager(s, { id: "m_real", displayName: "Real", clubId: "real" });
  s = addManager(s, { id: "m_bay", displayName: "Bayern", clubId: "bayern" });
  return { ...s, status: "closed" as const,
    log: [{ t: "win" as const, at: 30, contestId: "c1", managerId: "m_bay", playerId: "haaland", price: 220 }] };
}

test("export includes a managers section with a blank 'finishingPosition' column", () => {
  const { csv } = exportSeasonCsv(closedRoom());
  expect(csv).toMatch(/finishingPosition/);
  expect(csv).toMatch(/m_real,.*,$/m); // trailing blank finishing cell
});

test("export includes every log entry", () => {
  const { csv } = exportSeasonCsv(closedRoom());
  expect(csv).toMatch(/haaland/);
  expect(csv).toMatch(/220/);
});

test("xlsx export produces a non-empty buffer", () => {
  const buf = exportSeasonXlsx(closedRoom());
  expect(Buffer.isBuffer(buf)).toBe(true);
  expect(buf.length).toBeGreaterThan(0);
});

test("pdf export produces a non-empty buffer", async () => {
  const buf = await exportSeasonPdf(closedRoom());
  expect(Buffer.isBuffer(buf)).toBe(true);
  expect(buf.length).toBeGreaterThan(0);
});
