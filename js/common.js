/**
 * common.js — 首頁與人物詳細頁共用的工具函式
 */

const PLACEHOLDER_AVATAR = "images/_placeholder.svg";

/** 避免文字被當成 HTML 解析 */
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 統一的 fetch JSON 輔助，失敗時拋出錯誤讓呼叫端處理 */
async function loadJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

/**
 * 給「變動不頻繁」的共用檔案用（sources.json / factions.json / index.json），
 * 存進 sessionStorage 快取 5 分鐘，同一個分頁逛第二個人物頁開始就不用重抓。
 * 5 分鐘過期是刻意設的：如果你剛改完資料要測試，最多等 5 分鐘或開新分頁
 * 就能看到最新版本，不會被自己的快取卡住。
 * 絕對不要拿來快取「該人物自己的」JSON——那份內容才是使用者真正要看的，
 * 快取它會讓人搞不清楚看到的是不是最新資料。
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

async function loadJsonCached(url, cacheKey) {
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts < CACHE_TTL_MS) return data;
    }
  } catch (err) {
    // sessionStorage 不可用（例如無痕模式限制）或內容壞掉，直接當快取沒中，往下重抓
  }

  const data = await loadJson(url);

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
  } catch (err) {
    // 存不進去（例如額度爆了）不影響功能，忽略即可
  }

  return data;
}

/** 滑鼠移到人物卡片上時，先在背景把該人物的 JSON 預抓進瀏覽器快取，
 *  等真的點下去時幾乎是直接讀快取，感覺上更快開啟。
 *  故意不用 sessionStorage 存資料本身，單純觸發一次 fetch 讓瀏覽器自己快取，
 *  這樣不會有快取過期要處理的問題。 */
function prefetchCharacterJson(id) {
  if (!id) return;
  fetch(`data/characters/${encodeURIComponent(id)}.json`).catch(() => {
    // 預抓失敗就算了，使用者真的點下去時會再正常抓一次
  });
}

/** 產生 <img> 標籤，並內建載入失敗時自動換成替代圖 */
function avatarImgHtml(src, alt, className) {
  const safeSrc = src || PLACEHOLDER_AVATAR;
  return `<img class="${className || ""}" src="${escapeHtml(safeSrc)}" alt="${escapeHtml(
    alt
  )}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER_AVATAR}';" />`;
}

/* ============================================================
 * 來源目錄（data/sources.json）解析
 * ============================================================ */

/** 將 sources.json 陣列轉成 id -> source 的查詢表 */
function buildSourceMap(sourcesArray) {
  const map = new Map();
  (sourcesArray || []).forEach((s) => map.set(s.id, s));
  return map;
}

/**
 * 將一筆 citation（{ sourceId, locator?, note? }）解析成可顯示的來源標籤 HTML。
 * sourceId 對應不到 sources.json 時，仍會顯示 sourceId 本身並標示「來源目錄缺漏」，
 * 方便之後補資料時一眼看出遺漏，而不是靜默吞掉。
 */
function citationChipHtml(citation, sourceMap) {
  if (!citation) return "";
  const src = sourceMap.get(citation.sourceId);
  if (!src) {
    return `<span class="source-chip source-chip--missing">來源目錄缺漏：${escapeHtml(citation.sourceId || "未知")}</span>`;
  }
  const kind = `<span class="source-kind">${escapeHtml(src.kind)}</span>`;
  const locator = citation.locator ? `<span class="source-locator">${escapeHtml(citation.locator)}</span>` : "";
  const note = citation.note ? `<span class="source-note">${escapeHtml(citation.note)}</span>` : "";
  return `<span class="source-chip">${kind}<span class="source-title">${escapeHtml(src.title)}</span>${locator}${note}</span>`;
}

/** 一組 citations 陣列渲染成並排的來源標籤 */
function citationsHtml(citations, sourceMap) {
  if (!citations || !citations.length) return "";
  return `<span class="citations">${citations.map((c) => citationChipHtml(c, sourceMap)).join("")}</span>`;
}

/**
 * 渲染「白話段落 + 各自來源」+ 可選的「查看史料原文」展開區 + 可選的不確定性說明。
 * contentBlock: { paragraphs: [{text, citations}], originalTexts?: [{text, sourceId, locator}], }
 * uncertaintyNote: 字串，另外獨立傳入（因為 faction stage 用的是同層欄位，historicalBio 也是）
 */
function contentBlockHtml(contentBlock, sourceMap, uncertaintyNote) {
  if (!contentBlock || !contentBlock.paragraphs) return "";

  const paragraphs = contentBlock.paragraphs
    .map(
      (p) => `
      <p class="paraphrase-text">${escapeHtml(p.text)}</p>
      ${citationsHtml(p.citations, sourceMap)}
    `
    )
    .join("");

  const originalTexts =
    contentBlock.originalTexts && contentBlock.originalTexts.length
      ? `
      <details class="original-text-toggle">
        <summary>查看史料原文</summary>
        ${contentBlock.originalTexts
          .map((o) => {
            const src = sourceMap.get(o.sourceId);
            const kindLabel = src ? escapeHtml(src.kind) : "來源目錄缺漏";
            const titleLabel = src ? escapeHtml(src.title) : escapeHtml(o.sourceId || "未知");
            return `
              <blockquote class="original-text">${escapeHtml(o.text)}</blockquote>
              <div class="original-text-source">
                <span class="source-kind">${kindLabel}</span>
                <span class="source-title">${titleLabel}</span>
                ${o.locator ? `<span class="source-locator">${escapeHtml(o.locator)}</span>` : ""}
              </div>
            `;
          })
          .join("")}
      </details>
    `
      : "";

  const uncertainty = uncertaintyNote
    ? `<div class="uncertainty-note"><span class="uncertainty-label">年代／記載說明</span><p>${escapeHtml(
        uncertaintyNote
      )}</p></div>`
    : "";

  return `${paragraphs}${originalTexts}${uncertainty}`;
}

/** 只有 target 存在時（也就是該人物已建檔且已發布）才產生可點擊連結，否則回傳純文字 */
function personLinkOrPlain(personId, innerHtml, extraClass) {
  if (personId) {
    return `<a class="${extraClass || ""} is-link" href="character.html?id=${encodeURIComponent(personId)}">${innerHtml}</a>`;
  }
  return `<div class="${extraClass || ""}">${innerHtml}</div>`;
}