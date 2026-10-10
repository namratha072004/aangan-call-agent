// Run: npx tsx tests/slots.test.ts
import assert from "node:assert/strict";
import { resolveSlot } from "../lib/slots";

const offered = ["2026-10-12T09:30:00.000+05:30", "2026-10-12T10:00:00.000+05:30", "2026-10-12T10:30:00.000+05:30"];
assert.equal(resolveSlot("", "caller: Like, Monday, 10AM would work for me.", offered), offered[1]); console.log("✓ 'Monday, 10AM' → Mon 10:00");
assert.equal(resolveSlot("Monday 10:30 AM", "", offered), offered[2]); console.log("✓ loose book_slot 'Monday 10:30 AM'");
assert.equal(resolveSlot(offered[0], "", offered), offered[0]); console.log("✓ exact ISO book_slot");
assert.equal(resolveSlot("", "caller: 3BHK, about 1,200 square feet", offered), null); console.log("✓ sizes and BHK never match");
assert.equal(resolveSlot("", "caller: Tuesday 10 AM", offered), null); console.log("✓ wrong day → no booking");
assert.equal(resolveSlot("", "caller: sounds good", offered), null); console.log("✓ no time → no booking");
assert.equal(resolveSlot("", "caller: 10 AM", []), null); console.log("✓ nothing offered → no booking");
