import { test } from "node:test";
import assert from "node:assert/strict";
import { aramaTerimi, konteynerNolariMetni } from "@/lib/arsiv-arama";

test("konteyner numaralari virgulle yan yana (bos/tekrar atlanir)", () => {
  assert.equal(konteynerNolariMetni([
    { konteyner_no: "KRGU1000001" }, { konteyner_no: " krgu1000002 " }, { konteyner_no: null },
    { konteyner_no: "" }, { konteyner_no: "KRGU1000001" }, { konteyner_no: "KRGU1000003" },
  ]), "KRGU1000001, KRGU1000002, KRGU1000003");
  assert.equal(konteynerNolariMetni([]), "");
});

test("arama terimi: filtre sozdizimini bozan karakterler temizlenir", () => {
  assert.equal(aramaTerimi("  KRGBK0001  "), "KRGBK0001");
  assert.equal(aramaTerimi("ORNEK, LTD (KURGU)"), "ORNEK LTD KURGU");
  assert.equal(aramaTerimi("50%*"), "50");
  assert.equal(aramaTerimi(" , () "), null);
});
