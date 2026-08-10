#!/usr/bin/env node
/**
 * scripts/validate-data.js
 *
 * 開發用資料驗證腳本，不是網站執行時依賴（見 package.json 說明）。
 * 分兩層檢查：
 *   1. Schema 驗證：每份 data/characters/*.json、data/sources.json、
 *      data/factions.json 是否符合 schema/ 底下對應的 JSON Schema。
 *   2. 交叉引用驗證：schema 本身管不到的「跨檔案一致性」問題，例如
 *      sourceId 是否真的存在於 sources.json、personId 是否指向已發布的
 *      人物、檔名是否跟人物 id 一致、index.json 是否跟人物檔同步等等。
 *
 * 用法：npm run validate  （或 node scripts/validate-data.js）
 * 結束碼：有任何錯誤（error）時回傳非 0，方便接到 CI；警告（warning）不影響結束碼。
 */

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const ROOT = path.resolve(__dirname, "..");
const CHAR_DIR = path.join(ROOT, "data", "characters");

const errors = [];
const warnings = [];

function err(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

/* ---------- 1. 載入 schema 與資料 ---------- */

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const characterSchema = readJson(path.join(ROOT, "schema", "character.schema.json"));
const sourcesSchema = readJson(path.join(ROOT, "schema", "sources.schema.json"));
const factionsSchema = readJson(path.join(ROOT, "schema", "factions.schema.json"));

const validateCharacter = ajv.compile(characterSchema);
const validateSources = ajv.compile(sourcesSchema);
const validateFactions = ajv.compile(factionsSchema);

let sourcesData, factionsData, indexData;

try {
  sourcesData = readJson(path.join(ROOT, "data", "sources.json"));
} catch (e) {
  err(`data/sources.json 讀取或解析失敗：${e.message}`);
}
try {
  factionsData = readJson(path.join(ROOT, "data", "factions.json"));
} catch (e) {
  err(`data/factions.json 讀取或解析失敗：${e.message}`);
}
try {
  indexData = readJson(path.join(ROOT, "data", "index.json"));
} catch (e) {
  err(`data/index.json 讀取或解析失敗：${e.message}`);
}

/* ---------- 2. sources.json / factions.json schema 驗證 ---------- */

if (sourcesData !== undefined) {
  if (!validateSources(sourcesData)) {
    for (const e of validateSources.errors) {
      err(`data/sources.json ${e.instancePath || "(root)"}：${e.message}`);
    }
  }
}

if (factionsData !== undefined) {
  if (!validateFactions(factionsData)) {
    for (const e of validateFactions.errors) {
      err(`data/factions.json ${e.instancePath || "(root)"}：${e.message}`);
    }
  }
}

/* ---------- 3. 來源 / 勢力 ID 重複檢查 ---------- */

const sourceIds = new Set();
const dupSourceIds = new Set();
if (sourcesData) {
  for (const s of sourcesData) {
    if (sourceIds.has(s.id)) dupSourceIds.add(s.id);
    sourceIds.add(s.id);
  }
}
for (const id of dupSourceIds) err(`data/sources.json：重複的來源 id「${id}」`);

const factionIds = new Set();
const dupFactionIds = new Set();
const filterGroupIds = new Set();
const dupFilterGroupIds = new Set();
if (factionsData) {
  for (const fg of factionsData.filterGroups || []) {
    if (filterGroupIds.has(fg.id)) dupFilterGroupIds.add(fg.id);
    filterGroupIds.add(fg.id);
  }
  for (const af of factionsData.actualFactions || []) {
    if (factionIds.has(af.id)) dupFactionIds.add(af.id);
    factionIds.add(af.id);
    if (af.filterGroup && !filterGroupIds.has(af.filterGroup)) {
      err(
        `data/factions.json：actualFactions「${af.id}」的 filterGroup「${af.filterGroup}」不存在於 filterGroups`
      );
    }
  }
}
for (const id of dupFilterGroupIds) err(`data/factions.json：重複的 filterGroups id「${id}」`);
for (const id of dupFactionIds) err(`data/factions.json：重複的 actualFaction id「${id}」`);

/* ---------- 4. 逐一驗證人物檔 ---------- */

const characterFiles = fs
  .readdirSync(CHAR_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

const personIds = new Set();
const dupPersonIds = new Set();
const publishedPersonIds = new Set();
const characters = []; // { file, id, data }

for (const file of characterFiles) {
  const filePath = path.join(CHAR_DIR, file);
  let data;
  try {
    data = readJson(filePath);
  } catch (e) {
    err(`${file}：JSON 解析失敗 — ${e.message}`);
    continue;
  }

  // 4a. schema 驗證
  if (!validateCharacter(data)) {
    for (const e of validateCharacter.errors) {
      err(`${file} ${e.instancePath || "(root)"}：${e.message}`);
    }
  }

  // 4b. worksNote 條件規則（schema 已用 allOf/if-then 檢查過一次，這裡再覆核，
  //     因為這是本輪修正的重點規則，值得雙重保險）
  if (Array.isArray(data.works) && data.works.length === 0 && data.worksNote) {
    err(`${file}：works 為空陣列，但仍保留 worksNote，違反「無著作人物不得有 worksNote」規則`);
  }

  // 4c. 檔名與 id 是否一致
  const expectedId = file.replace(/\.json$/, "");
  if (data.id !== expectedId) {
    err(`${file}：檔名應對應 id「${expectedId}」，但實際 id 是「${data.id}」`);
  }

  // 4d. 人物 id 重複檢查
  if (data.id) {
    if (personIds.has(data.id)) dupPersonIds.add(data.id);
    personIds.add(data.id);
    if (data.published) publishedPersonIds.add(data.id);
  }

  characters.push({ file, id: data.id, data });
}

for (const id of dupPersonIds) err(`重複的人物 id「${id}」（出現在多個檔案中）`);

/* ---------- 5. 交叉引用驗證：sourceId / actualFactionId / personId ---------- */

function collectCitationsSourceIds(obj, filePath, acc) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectCitationsSourceIds(item, filePath, acc);
    return;
  }
  if (typeof obj.sourceId === "string") acc.push(obj.sourceId);
  for (const key of Object.keys(obj)) {
    if (key === "sourceId") continue;
    collectCitationsSourceIds(obj[key], filePath, acc);
  }
}

for (const { file, data } of characters) {
  // sourceId 交叉檢查：遍歷整份人物 JSON，找出所有 citations/originalTexts 用到的 sourceId
  const usedSourceIds = [];
  collectCitationsSourceIds(data, file, usedSourceIds);
  for (const sid of usedSourceIds) {
    if (!sourceIds.has(sid)) {
      err(`${file}：引用了不存在於 data/sources.json 的 sourceId「${sid}」`);
    }
  }

  // actualFactionId 交叉檢查
  const timeline = (data.overview && data.overview.factionTimeline) || [];
  for (const stage of timeline) {
    if (stage.actualFactionId && !factionIds.has(stage.actualFactionId)) {
      err(
        `${file}：factionTimeline 階段「${stage.stageName}」引用了不存在於 data/factions.json 的 actualFactionId「${stage.actualFactionId}」`
      );
    }
    // hideAvatar 誤用檢查：hideAvatar=true 但 personId 存在且不是明顯的抽象政治實體，
    // 用一個寬鬆的判斷式：如果 personId 有值，代表這是一個「已建檔的具體人物階段」，
    // hideAvatar 就不該是 true（抽象實體如「東漢朝廷」不會有自己的 personId）。
    if (stage.hideAvatar === true && stage.personId) {
      err(
        `${file}：factionTimeline 階段「${stage.stageName}」同時設定 hideAvatar: true 與 personId「${stage.personId}」，hideAvatar 應只用於非人物的抽象政治實體`
      );
    }
  }

  // personId 交叉檢查（relatives + factionTimeline）：
  // 只警告「指向不存在的人物 id」，因為 personId: null 是合法的「對方未建檔」表示法，
  // 這裡要抓的是「填了值但那個值根本沒有對應的人物檔」這種真正的資料錯誤。
  const personIdRefs = [];
  for (const r of (data.overview && data.overview.relatives) || []) {
    if (r.personId) personIdRefs.push({ personId: r.personId, context: `relatives「${r.personName}」` });
  }
  for (const stage of timeline) {
    if (stage.personId) personIdRefs.push({ personId: stage.personId, context: `factionTimeline「${stage.stageName}」` });
  }
  for (const ref of personIdRefs) {
    if (!personIds.has(ref.personId)) {
      err(`${file}：${ref.context} 引用了不存在的人物 id「${ref.personId}」`);
    } else if (!publishedPersonIds.has(ref.personId)) {
      warn(`${file}：${ref.context} 引用的人物「${ref.personId}」存在但 published 不是 true，頁面上不會建立連結`);
    }
  }
}

/* ---------- 6. data/index.json 一致性檢查 ---------- */

if (indexData) {
  // index.json 本身內部的重複 id 檢查。注意：下面用 Map 收斂 indexData 時，
  // 重複 id 會被靜默覆蓋成最後一筆，所以這個檢查必須在建 Map 之前、直接
  // 掃過原始陣列做，不能依賴 Map 的 key 數量去反推有沒有重複。
  const seenIndexIds = new Set();
  const dupIndexIds = new Set();
  for (const entry of indexData) {
    if (seenIndexIds.has(entry.id)) dupIndexIds.add(entry.id);
    seenIndexIds.add(entry.id);
  }
  for (const id of dupIndexIds) err(`data/index.json：重複的人物 id「${id}」`);

  const indexById = new Map(indexData.map((x) => [x.id, x]));
  const charById = new Map(characters.map((c) => [c.id, c.data]));

  // index.json 裡有，但人物檔沒有
  for (const entry of indexData) {
    if (!charById.has(entry.id)) {
      err(`data/index.json：索引項目「${entry.id}」在 data/characters/ 中找不到對應檔案`);
      continue;
    }
    const charData = charById.get(entry.id);
    if (entry.name !== charData.name) {
      err(`data/index.json：「${entry.id}」的 name「${entry.name}」與人物檔的「${charData.name}」不一致`);
    }
    if ((entry.courtesyName || undefined) !== (charData.courtesyName || undefined)) {
      warn(`data/index.json：「${entry.id}」的 courtesyName 與人物檔不一致（index: ${entry.courtesyName || "（無）"}，人物檔: ${charData.courtesyName || "（無）"}）`);
    }
    if (entry.avatar !== charData.avatar) {
      err(`data/index.json：「${entry.id}」的 avatar「${entry.avatar}」與人物檔的「${charData.avatar}」不一致`);
    }
    if (entry.published !== charData.published) {
      err(`data/index.json：「${entry.id}」的 published（${entry.published}）與人物檔的（${charData.published}）不一致`);
    }
    if (!filterGroupIds.has(entry.filterGroup)) {
      err(`data/index.json：「${entry.id}」的 filterGroup「${entry.filterGroup}」不存在於 data/factions.json 的 filterGroups`);
    }
  }

  // 人物檔已發布，但 index.json 沒收錄
  for (const { id, data } of characters) {
    if (data.published && !indexById.has(id)) {
      err(`data/index.json：人物「${id}」published: true，但索引中找不到對應項目`);
    }
  }
}

/* ---------- 7. 輸出結果 ---------- */

console.log(`\n檢查了 ${characterFiles.length} 份人物檔、data/sources.json、data/factions.json、data/index.json\n`);

if (warnings.length) {
  console.log(`警告（${warnings.length} 筆，不影響結束碼）：`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log("");
}

if (errors.length) {
  console.log(`錯誤（${errors.length} 筆）：`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log("");
  console.log("驗證未通過。");
  process.exit(1);
} else {
  console.log("全部檢查通過，沒有錯誤。");
  process.exit(0);
}
