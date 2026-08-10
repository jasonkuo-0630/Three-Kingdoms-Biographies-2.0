#!/usr/bin/env node
/**
 * scripts/render-test.js
 *
 * 開發用渲染測試腳本。用 jsdom 模擬瀏覽器 DOM + fetch，直接載入專案「真正
 * 的」js/*.js 檔案去跑，不是重新用別的邏輯去猜測結果應該長怎樣。腳本會自己
 * 啟動一個本機靜態伺服器（測試完自動關閉，且用系統自動分配的可用 port，
 * 不會因為固定 port 被佔用而噴出 EADDRINUSE），確保 `npm run render-test`
 * 可以獨立、重複執行。
 *
 * 用來驗證：
 *   - 首頁五個勢力入口的人數是否精確等於 data/index.json 的實際統計
 *   - 每個 faction.html?faction=xxx 列出的人物數是否精確等於預期（不只是
 *     「非零就算過」——曾經在複核時發現多一個假人物連結也會被誤判通過）
 *   - 每一位已發布人物的 character.html?id=xxx 是否能無錯誤渲染，
 *     且「著作」頁籤是否只在 works.length > 0 時出現
 *   - 頁面存續期間發生的未捕捉 Promise rejection 一律視為真正的頁面錯誤、
 *     使測試失敗，不會被籠統地當成「殘留雜訊」而放行
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { JSDOM } = require("jsdom");
const nodeFetch = require("node-fetch");

const ROOT = path.resolve(__dirname, "..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

/**
 * 啟動一個只服務本專案根目錄的靜態檔案伺服器。
 * 用 listen(0) 讓作業系統自動分配可用 port，不寫死 port 號，避免該 port
 * 剛好被佔用時直接噴出 EADDRINUSE 讓整個測試腳本掛掉。啟動失敗（例如完全
 * 找不到可用 port，或路徑權限問題）會讓回傳的 Promise reject，由呼叫端
 * 決定如何處理，而不是讓例外原地炸掉。
 */
function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split("?")[0]);
      const filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end();
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, base: `http://127.0.0.1:${port}` });
    });
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      })
      .on("error", reject);
  });
}

// jsdom 實測發現：它不會發出 window 層級的 'unhandledrejection' DOM 事件
// （用最小範例測過，addEventListener('unhandledrejection', ...) 完全不會被
// 呼叫），所有未捕捉的 Promise rejection 只會浮到 Node 的 process 層級
// 'unhandledRejection'。用「目前正在測哪一頁」這個標記做歸屬：
//   - rejection 發生在某頁的 activeLabel 生效期間（從開始渲染到等待結束）
//     → 算那一頁的真正錯誤，讓測試失敗
//   - 發生在沒有任何頁面「正在測」的空檔（例如上一頁 window 關閉後、下一頁
//     還沒開始渲染前）→ 歸到 orphanRejections，僅供參考，不影響結束碼
let activeLabel = null;
let pageCounter = 0;
const rejectionsByLabel = new Map();
const orphanRejections = [];
process.on("unhandledRejection", (reason) => {
  if (activeLabel) {
    if (!rejectionsByLabel.has(activeLabel)) rejectionsByLabel.set(activeLabel, []);
    rejectionsByLabel.get(activeLabel).push(String(reason));
  } else {
    orphanRejections.push(String(reason));
  }
});

async function loadPage(base, urlPath) {
  const html = (await get(base + urlPath)).body;
  const dom = new JSDOM(html, {
    url: base + urlPath,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    beforeParse(window) {
      // jsdom 本身不內建 fetch；用 node-fetch 補上，讓真正的 common.js/loadJson
      // 邏輯可以正常執行，而不是另外寫一套假資料去模擬。
      window.fetch = (input, init) => {
        const url =
          typeof input === "string" && input.startsWith("http") ? input : new URL(input, base + urlPath).toString();
        return nodeFetch(url, init);
      };
      // jsdom 也沒有實作 window.CSS.escape（真實瀏覽器都有，這是 CSSOM 標準
      // API）。js/listing.js 的非同步標籤渲染會呼叫 CSS.escape(p.id) 組
      // querySelector 用的屬性選擇器；沒有這個 polyfill 的話，這段程式在
      // jsdom 底下每次都會丟出 ReferenceError，讓「標籤有沒有載入成功」這件
      // 事完全測不到，也會製造一堆跟真實網站行為無關的假錯誤。這裡用一個
      // 符合 CSSOM 規格精神的簡化版本補上，讓被測程式碼能照原本邏輯跑完。
      window.CSS = window.CSS || {};
      if (typeof window.CSS.escape !== "function") {
        window.CSS.escape = (value) =>
          String(value).replace(/[^a-zA-Z0-9_\u00A0-\uFFFF-]/g, (ch) => `\\${ch}`);
      }
    },
  });

  const errors = [];
  dom.window.onerror = (msg) => errors.push(String(msg));
  dom.window.console.error = (...args) => errors.push(args.map(String).join(" "));

  const label = `${urlPath}#${++pageCounter}`;
  activeLabel = label;

  // jsdom 不會自己抓外部 <script src> 執行完再 resolve；用輪詢等 DOM 內容穩定，
  // 這段等待期間就是這一頁的「存續期間」，這期間發生的 unhandledRejection
  // 都會被上面的 process handler 記到 label 底下。
  await new Promise((r) => setTimeout(r, 800));

  activeLabel = null;
  const pageRejections = rejectionsByLabel.get(label) || [];
  rejectionsByLabel.delete(label);
  errors.push(...pageRejections.map((r) => `unhandledRejection: ${r}`));

  return { dom, errors };
}

async function runAllChecks(base, results) {
  const factionsData = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "factions.json"), "utf-8"));
  const indexData = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "index.json"), "utf-8"));

  // ---------- 首頁：五個勢力入口的人數必須精確等於實際統計 ----------
  // 首頁固定只顯示 wei/shu/wu/donghan/qunxiong 這五個（見
  // js/faction-portal-meta.js 的 FACTION_PORTAL_ORDER），不含 jin。
  {
    const { dom, errors } = await loadPage(base, "/index.html");
    const doc = dom.window.document;
    const portalCards = Array.from(doc.querySelectorAll("a.portal-faction"));

    if (errors.length) {
      results.fail.push(`index.html：JS 錯誤 — ${errors.join(" | ")}`);
    } else if (portalCards.length !== 5) {
      results.fail.push(`index.html：預期 5 個勢力入口卡片（a.portal-faction），實際找到 ${portalCards.length} 個`);
    } else {
      const mismatches = [];
      for (const card of portalCards) {
        const href = card.getAttribute("href") || "";
        const match = href.match(/faction=([a-z]+)/);
        const factionId = match ? match[1] : null;
        const expectedCount = indexData.filter((c) => c.filterGroup === factionId && c.published).length;
        const countText = card.querySelector(".portal-count")?.textContent.trim() || "";
        const expectedText = expectedCount > 0 ? `${expectedCount} 位人物` : "尚無收錄人物";
        if (countText !== expectedText) {
          mismatches.push(`${factionId}：卡片顯示「${countText}」，預期「${expectedText}」`);
        }
      }
      if (mismatches.length) {
        results.fail.push(`index.html：勢力入口人數與 data/index.json 實際統計不符 — ${mismatches.join("；")}`);
      } else {
        results.pass.push(`index.html：載入無錯誤，5 個勢力入口人數皆與 data/index.json 精確相符`);
      }
    }
    dom.window.close();
  }

  // ---------- 每個勢力頁：列出的人物數必須精確等於預期，不只是非零 ----------
  for (const fg of factionsData.filterGroups) {
    const { dom, errors } = await loadPage(base, `/faction.html?faction=${fg.id}`);
    const doc = dom.window.document;
    const expectedIds = indexData
      .filter((c) => c.filterGroup === fg.id && c.published)
      .map((c) => c.id)
      .sort();

    // a.slip[data-id] 是 js/listing.js 實際渲染人物卡片用的 class/屬性
    // （見 listing.js 第 74 行），比先前用一堆猜測選擇器堆疊更精確，不會
    // 誤把其他無關連結也算進人物數。
    const cards = Array.from(doc.querySelectorAll("a.slip[data-id]"));
    const actualIds = cards.map((el) => el.getAttribute("data-id")).sort();

    if (errors.length) {
      results.fail.push(`faction.html?faction=${fg.id}：JS 錯誤 — ${errors.join(" | ")}`);
    } else if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      results.fail.push(
        `faction.html?faction=${fg.id}（${fg.label}）：人物清單與預期不符 — 預期 [${expectedIds.join(
          ", "
        )}]，實際 [${actualIds.join(", ")}]`
      );
    } else {
      results.pass.push(
        `faction.html?faction=${fg.id}（${fg.label}）：載入無錯誤，人物清單與 data/index.json 精確相符（${actualIds.length} 位）`
      );
    }
    dom.window.close();
  }

  // ---------- 全部已發布人物詳細頁 ----------
  const publishedChars = indexData.filter((c) => c.published);
  for (const c of publishedChars) {
    const { dom, errors } = await loadPage(base, `/character.html?id=${c.id}`);
    const doc = dom.window.document;

    const charFilePath = path.join(ROOT, "data", "characters", `${c.id}.json`);
    const charData = JSON.parse(fs.readFileSync(charFilePath, "utf-8"));
    const shouldHaveWorksTab = Array.isArray(charData.works) && charData.works.length > 0;

    const tabsNav = doc.getElementById("tabs-nav");
    const tabButtons = tabsNav ? Array.from(tabsNav.querySelectorAll("button, a, [role='tab']")) : [];
    const tabLabels = tabButtons.map((b) => b.textContent.trim());
    const hasWorksTabInDom = tabLabels.some((t) => t.includes("著作"));

    if (errors.length) {
      results.fail.push(`character.html?id=${c.id}（${c.name}）：JS 錯誤 — ${errors.join(" | ")}`);
      dom.window.close();
      continue;
    }

    if (hasWorksTabInDom !== shouldHaveWorksTab) {
      results.fail.push(
        `character.html?id=${c.id}（${c.name}）：著作頁籤判斷錯誤 — works.length=${charData.works.length}，預期 ${
          shouldHaveWorksTab ? "應該出現" : "不應出現"
        } 著作頁籤，但 DOM 裡${hasWorksTabInDom ? "出現了" : "沒有出現"}`
      );
    } else {
      results.pass.push(
        `character.html?id=${c.id}（${c.name}）：載入無錯誤，著作頁籤判斷正確（works.length=${
          charData.works.length
        } → ${shouldHaveWorksTab ? "有" : "無"}著作頁籤）`
      );
    }
    dom.window.close();
  }
}

async function main() {
  let started;
  try {
    started = await startStaticServer();
  } catch (e) {
    console.error(`本機測試伺服器啟動失敗：${e.message}`);
    process.exitCode = 2;
    return;
  }

  const { server, base } = started;
  const results = { pass: [], fail: [] };

  try {
    await runAllChecks(base, results);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  if (orphanRejections.length) {
    console.log(
      `\n（另外攔截到 ${orphanRejections.length} 筆與任何頁面 window 無關的 Promise rejection，僅供參考，不影響測試結果）`
    );
    for (const r of orphanRejections) console.log(`  · ${r}`);
  }

  console.log(`\n通過 ${results.pass.length} 項：`);
  for (const p of results.pass) console.log(`  ✓ ${p}`);

  if (results.fail.length) {
    console.log(`\n失敗 ${results.fail.length} 項：`);
    for (const f of results.fail) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  } else {
    console.log("\n全部渲染測試通過。");
  }
}

main().catch((e) => {
  console.error("渲染測試腳本本身出錯：", e);
  process.exitCode = 2;
});
