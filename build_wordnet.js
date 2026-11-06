const fs = require("fs");
const readline = require("readline");
const zlib = require("zlib");

function normalizeSynsetId(id) {
  // remove prefix like 'wnja-' or 'omw-en-'
  return id.replace(/^[a-z\-]+-/, "");
}

async function buildCombinedWordNet() {
  console.log("Parsing wnja-2.1.xml...");
  const wordToSynsets = new Map();
  const synsetToWords = new Map();
  const synsetRelations = new Map(); // normalizedId -> { hype: Set, hypo: Set, also: Set }

  function getRelObj(sid) {
    if (!synsetRelations.has(sid)) {
      synsetRelations.set(sid, { hype: new Set(), hypo: new Set(), also: new Set() });
    }
    return synsetRelations.get(sid);
  }

  // 1. Read wnja-2.1.xml
  const rlWnja = readline.createInterface({
    input: fs.createReadStream("wnja_temp/wnja/wnja-2.1.xml"),
    crlfDelay: Infinity
  });

  let currentWord = null;
  let currentSynset = null;

  for await (const line of rlWnja) {
    if (line.includes("<Lemma ")) {
      const m = line.match(/writtenForm="([^"]+)"/);
      if (m) currentWord = m[1];
    } else if (line.includes("<Sense ")) {
      const m = line.match(/synset="([^"]+)"/);
      if (m && currentWord) {
        const sid = normalizeSynsetId(m[1]);
        if (!wordToSynsets.has(currentWord)) wordToSynsets.set(currentWord, new Set());
        wordToSynsets.get(currentWord).add(sid);

        if (!synsetToWords.has(sid)) synsetToWords.set(sid, new Set());
        synsetToWords.get(sid).add(currentWord);
      }
    } else if (line.includes("</LexicalEntry>")) {
      currentWord = null;
    } else if (line.includes("<Synset ")) {
      const m = line.match(/id="([^"]+)"/);
      if (m) currentSynset = normalizeSynsetId(m[1]);
    } else if (line.includes("<SynsetRelation ")) {
      if (currentSynset) {
        const targetM = line.match(/target="([^"]+)"/);
        const relM = line.match(/relType="([^"]+)"/);
        if (targetM && relM) {
          const target = normalizeSynsetId(targetM[1]);
          const rel = relM[1];
          const relObj = getRelObj(currentSynset);
          if (rel === "hypernym" || rel === "instance_hypernym") {
            relObj.hype.add(target);
            getRelObj(target).hypo.add(currentSynset);
          } else if (rel === "hyponym" || rel === "instance_hyponym") {
            relObj.hypo.add(target);
            getRelObj(target).hype.add(currentSynset);
          } else if (rel === "also" || rel === "similar") {
            relObj.also.add(target);
            getRelObj(target).also.add(currentSynset);
          }
        }
      }
    } else if (line.includes("</Synset>")) {
      currentSynset = null;
    }
  }

  console.log("Parsing omw-en.xml for PWN relations...");
  // 2. Read omw-en.xml
  const rlOmw = readline.createInterface({
    input: fs.createReadStream("wnja_temp/omw-en/omw-en.xml"),
    crlfDelay: Infinity
  });

  currentSynset = null;
  for await (const line of rlOmw) {
    if (line.includes("<Synset ")) {
      const m = line.match(/id="([^"]+)"/);
      if (m) currentSynset = normalizeSynsetId(m[1]);
    } else if (line.includes("<SynsetRelation ")) {
      if (currentSynset) {
        const targetM = line.match(/target="([^"]+)"/);
        const relM = line.match(/relType="([^"]+)"/);
        if (targetM && relM) {
          const target = normalizeSynsetId(targetM[1]);
          const rel = relM[1];
          const relObj = getRelObj(currentSynset);
          if (rel === "hypernym" || rel === "instance_hypernym") {
            relObj.hype.add(target);
            getRelObj(target).hypo.add(currentSynset);
          } else if (rel === "hyponym" || rel === "instance_hyponym") {
            relObj.hypo.add(target);
            getRelObj(target).hype.add(currentSynset);
          } else if (rel === "also" || rel === "similar") {
            relObj.also.add(target);
            getRelObj(target).also.add(currentSynset);
          }
        }
      }
    } else if (line.includes("</Synset>")) {
      currentSynset = null;
    }
  }

  console.log("Building final dictionary...");
  // 3. Build word dictionary
  const dict = {};

  for (const [w, sSet] of wordToSynsets.entries()) {
    const syns = new Set();
    const hype = new Set();
    const hypo = new Set();
    const also = new Set();

    for (const sid of sSet) {
      // 類義語: 同じsynsetの他の単語
      const sw = synsetToWords.get(sid);
      if (sw) {
        for (const ow of sw) {
          if (ow !== w) syns.add(ow);
        }
      }
      // 関連・上位・下位
      const relObj = synsetRelations.get(sid);
      if (relObj) {
        for (const ts of relObj.hype) {
          const tw = synsetToWords.get(ts);
          if (tw) for (const ow of tw) if (ow !== w) hype.add(ow);
        }
        for (const ts of relObj.hypo) {
          const tw = synsetToWords.get(ts);
          if (tw) for (const ow of tw) if (ow !== w) hypo.add(ow);
        }
        for (const ts of relObj.also) {
          const tw = synsetToWords.get(ts);
          if (tw) for (const ow of tw) if (ow !== w) also.add(ow);
        }
      }
    }

    if (syns.size > 0 || also.size > 0 || hype.size > 0 || hypo.size > 0) {
      const entry = {};
      if (syns.size) entry.s = Array.from(syns);
      if (also.size) entry.a = Array.from(also);
      if (hype.size) entry.h = Array.from(hype);
      if (hypo.size) entry.n = Array.from(hypo); // n for narrower / hypo
      dict[w] = entry;
    }
  }

  const jsonStr = JSON.stringify(dict);
  console.log("Words in dict:", Object.keys(dict).length);
  console.log("JSON uncompressed size:", (jsonStr.length / 1024 / 1024).toFixed(2), "MB");

  const gzipped = zlib.gzipSync(jsonStr);
  console.log("GZIP size:", (gzipped.length / 1024 / 1024).toFixed(2), "MB");

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync("data/wordnet_ja.json", jsonStr);
  fs.writeFileSync("data/wordnet_ja.json.gz", gzipped);

  console.log("Sample 'クローン':", JSON.stringify(dict["クローン"], null, 2));
  console.log("Sample '羊':", JSON.stringify(dict["羊"], null, 2));
  console.log("Sample '集合知':", JSON.stringify(dict["集合知"], null, 2));
}

buildCombinedWordNet();

