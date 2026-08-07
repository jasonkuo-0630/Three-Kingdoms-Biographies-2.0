/**
 * listing.js — faction.html 邏輯
 * 這個頁面現在只服務「單一勢力」，網址一定要帶 ?faction=wu 這種具體 id，
 * 沒有 pills 可以切換、也沒有「全部人物」模式——首頁的勢力入口卡片已經
 * 負責「選勢力」這件事了，這裡不重複做，只留搜尋負責「在這個勢力裡找人」。
 * 網址缺 faction 或帶了不存在的 id，直接導回卷首讓使用者重新選。
 *
 * 人物列表是「竹簡」設計：橫條堆疊、正常捲動，預設只顯示頭像／姓名／字號，
 * hover 才展開標籤與「入卷」連結。標籤（史實記載／後世文學）不是寫死的，
 * 是讀每個人物自己 JSON 裡 historicalBio／romanceBio 是否真的有內容來決定，
 * 空殼佔位人物（法正、關平、關興這種）就不會顯示任何標籤。
 */

const state = {
  query: "",
  group: null,
  people: [],
};

const tagCache = new Map(); // personId -> ["史實記載", "後世文學"] | []

function getFactionParamFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("faction");
}

function renderFactionBanner() {
  const meta = FACTION_PORTAL_META[state.group];
  const body = document.getElementById("faction-page-body");
  const count = state.people.filter((p) => p.published && p.filterGroup === state.group).length;

  document.getElementById("banner-mark").textContent = meta.mark;
  document.getElementById("banner-ruler").textContent = meta.ruler || "";
  document.getElementById("banner-ruler").hidden = !meta.ruler;
  document.getElementById("banner-label").textContent = meta.label;
  document.getElementById("banner-motto").textContent = meta.motto;
  document.getElementById("banner-count").textContent = count > 0 ? `${count} 位人物` : "尚無收錄人物";
  document.getElementById("faction-banner").hidden = false;
  body.className = `faction-page faction-page--${state.group}`;
  document.getElementById("topbar-subtitle").textContent = `返回卷首・${meta.label}人物總覽`;
  document.title = `三國人物誌・${meta.label}`;
}

function initSearch() {
  const input = document.getElementById("search-input");
  input.addEventListener("input", () => {
    state.query = input.value.trim();
    renderCards();
  });

  document.getElementById("clear-btn").addEventListener("click", () => {
    state.query = "";
    input.value = "";
    renderCards();
    input.focus();
  });
}

function getFilteredPeople() {
  const q = state.query.toLowerCase();
  return state.people.filter((p) => {
    if (!p.published || p.filterGroup !== state.group) return false;
    if (!q) return true;
    const terms = [p.name, p.courtesyName, ...(p.searchTerms || [])].filter(Boolean);
    return terms.some((t) => t.toLowerCase().includes(q));
  });
}

function slipTemplate(p) {
  const meta = FACTION_PORTAL_META[p.filterGroup];
  const tone = meta ? `slip--${p.filterGroup}` : "";
  const mark = meta ? meta.mark : "";
  return `
    <a class="slip ${tone}" data-id="${escapeHtml(p.id)}" href="character.html?id=${encodeURIComponent(p.id)}" aria-label="查看${escapeHtml(p.name)}的介紹">
      <span class="slip-accent" aria-hidden="true"></span>
      <span class="slip-mark" aria-hidden="true">${escapeHtml(mark)}</span>
      <span class="slip-avatar">${avatarImgHtml(p.avatar, `${p.name}的頭像`, "")}</span>
      <span class="slip-main">
        <span class="slip-name">${escapeHtml(p.name)}</span>
        ${p.courtesyName ? `<span class="slip-courtesy">字 ${escapeHtml(p.courtesyName)}</span>` : `<span class="slip-courtesy slip-courtesy--muted">字號未載</span>`}
      </span>
      <span class="slip-extra">
        <span class="slip-tags" data-tags-for="${escapeHtml(p.id)}"></span>
        <span class="slip-enter">入卷 <b aria-hidden="true">→</b></span>
      </span>
    </a>
  `;
}

/** 讀該人物自己的 JSON，判斷史實／後世文學標籤（不快取，理由同 common.js 的說明） */
async function loadPersonTags(id) {
  if (tagCache.has(id)) return tagCache.get(id);
  try {
    const data = await loadJson(`data/characters/${encodeURIComponent(id)}.json`);
    const tags = [];
    if (data.historicalBio && data.historicalBio.length) tags.push("史實記載");
    if (data.romanceBio && data.romanceBio.length) tags.push("後世文學");
    tagCache.set(id, tags);
    return tags;
  } catch (err) {
    tagCache.set(id, []);
    return [];
  }
}

/** 列表先渲染頭像／姓名，標籤非同步補上，避免十幾個人的清單被拖慢 */
function fillTagsForVisibleSlips(people) {
  people.forEach((p) => {
    loadPersonTags(p.id).then((tags) => {
      const holder = document.querySelector(`[data-tags-for="${CSS.escape(p.id)}"]`);
      if (!holder) return; // 使用者可能已經重新搜尋，這個節點被換掉了
      holder.innerHTML = tags
        .map((t) => `<span class="slip-tag slip-tag--${t === "史實記載" ? "hist" : "romance"}">${t}</span>`)
        .join("");
    });
  });
}

/** 原生 :hover 只有滑鼠「移動」時才會重新判定，單純滾動不會觸發。
 *  這裡追蹤滑鼠座標，滾動竹簡清單時用 elementFromPoint 補上 .is-hovered，
 *  模擬「手指停在原地、書一直滑過去」的手感，讓展開狀態跟著捲動走。 */
function initSlipHoverFollow() {
  const list = document.getElementById("slip-list");
  let lastX = null,
    lastY = null;

  list.addEventListener("mousemove", (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    // 滑鼠真的移動了，讓原生 :hover 接管，清掉滾動時補的暫時標記避免殘留
    document.querySelectorAll(".slip.is-hovered").forEach((s) => s.classList.remove("is-hovered"));
  });

  list.addEventListener("scroll", () => {
    window.requestAnimationFrame(() => {
      if (lastX === null) return;
      const el = document.elementFromPoint(lastX, lastY);
      const slip = el ? el.closest(".slip") : null;
      document.querySelectorAll(".slip.is-hovered").forEach((s) => {
        if (s !== slip) s.classList.remove("is-hovered");
      });
      if (slip) slip.classList.add("is-hovered");
    });
  });

  list.addEventListener("mouseleave", () => {
    document.querySelectorAll(".slip.is-hovered").forEach((s) => s.classList.remove("is-hovered"));
    lastX = null;
    lastY = null;
  });
}

function renderCards() {
  const list = document.getElementById("slip-list");
  const emptyState = document.getElementById("empty-state");
  const resultCount = document.getElementById("result-count");
  const filtered = getFilteredPeople();

  const collator = new Intl.Collator("zh-Hant-u-co-stroke");
  filtered.sort((a, b) => collator.compare(a.name, b.name));

  list.innerHTML = filtered.map(slipTemplate).join("");
  emptyState.hidden = filtered.length > 0;
  list.hidden = filtered.length === 0;
  resultCount.textContent = `共 ${filtered.length} 位人物`;

  fillTagsForVisibleSlips(filtered);
}

/** 導回卷首。多包一層函式是為了讓 jsdom 測試能攔截這個行為
 *  （jsdom 不支援真的頁面導航，直接呼叫 location.replace 會噴錯）。 */
function redirectToHome() {
  if (typeof window.__testRedirectHook === "function") {
    window.__testRedirectHook("index.html");
    return;
  }
  window.location.replace("index.html");
}

async function init() {
  const requestedFaction = getFactionParamFromUrl();

  // 沒帶 faction、或帶了不存在的陣營 id，直接導回卷首讓使用者重新選——
  // 這個頁面現在不處理「全部」這種跨陣營狀態了
  if (!requestedFaction || !FACTION_PORTAL_META[requestedFaction]) {
    redirectToHome();
    return;
  }
  state.group = requestedFaction;

  try {
    state.people = await loadJsonCached("data/index.json", "cache:index");
  } catch (err) {
    document.getElementById("slip-list").innerHTML = "";
    document.getElementById("result-count").textContent = "";
    document.getElementById("empty-state").hidden = false;
    document.getElementById("empty-state").textContent =
      "人物索引載入失敗，請確認是否透過 Live Server（本機伺服器）開啟本網站。";
    console.error("人物總覽資料載入失敗：", err);
    return;
  }

  renderFactionBanner();
  initSearch();
  initSlipHoverFollow();
  renderCards();
}

init();
