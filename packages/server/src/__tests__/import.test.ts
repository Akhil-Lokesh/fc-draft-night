import { test, expect } from "vitest";
import { parseFinishingOrder } from "../import.js";

const csv = [
  "## MANAGERS",
  "managerId,displayName,clubId,reserved,spendable,finishingPosition",
  "m_real,Real,real,425,175,2",
  "m_bay,Bayern,bayern,220,350,1",
  "m_city,City,city,300,34,5",
  "m_ars,Arsenal,arsenal,260,190,4",
  "m_bar,Barca,barca,240,310,3",
].join("\n");

test("parses finishing positions into a worst-first ordered array of managerIds", () => {
  expect(parseFinishingOrder(csv)).toEqual(["m_city", "m_ars", "m_bar", "m_real", "m_bay"]); // 5..1
});

test("rejects missing or duplicate finishing positions", () => {
  const bad = csv.replace("m_bay,Bayern,bayern,220,350,1", "m_bay,Bayern,bayern,220,350,2");
  expect(() => parseFinishingOrder(bad)).toThrow(/finishing position/i);
});
