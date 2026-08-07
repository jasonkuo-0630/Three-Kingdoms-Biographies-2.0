/**
 * portal.js — 首頁（卷首）邏輯
 * 首頁本身不再列出全部人物，只做：
 *  1. 全站快速搜尋（輸入姓名／字號，點結果直接進人物頁）
 *  2. 五個勢力入口（讀 data/index.json 即時算人數，不寫死）
 * 想看完整清單／用勢力篩選瀏覽，一律導去 faction.html。
 */

const portalState = {
  people: [],
};

function renderFactionPortals() {
  const container = document.getElementById("faction-portals");
  const counts = new Map();
  portalState.people
    .filter((p) => p.published)
    .forEach((p) => counts.set(p.filterGroup, (counts.get(p.filterGroup) || 0) + 1));

  container.innerHTML = FACTION_PORTAL_ORDER.map((id) => {
    const meta = FACTION_PORTAL_META[id];
    const count = counts.get(id) || 0;
    const portraitHtml = meta.portrait
      ? `<span class="portal-portrait">${avatarImgHtml(meta.portrait, meta.ruler ? `${meta.ruler}肖像` : "", "portal-portrait-img")}</span>`
      : `<span class="portal-portrait-placeholder" aria-hidden="true">君主圖<br />預留</span>`;
    const countLabel = count > 0 ? `${count} 位人物` : "尚無收錄人物";

    return `
      <a class="portal-faction portal-faction--${id}" href="faction.html?faction=${id}"
         aria-label="進入${escapeHtml(meta.label)}人物入口">
        <span class="portal-mark" aria-hidden="true">${escapeHtml(meta.mark)}</span>
        ${portraitHtml}
        <span class="portal-copy">
          <strong class="portal-label">${escapeHtml(meta.label)}</strong>
          <span class="portal-count">${countLabel}</span>
        </span>
      </a>
    `;
  }).join("");
}

function initQuickSearch() {
  const input = document.getElementById("quick-search-input");
  const results = document.getElementById("quick-search-results");

  function renderResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) {
      results.innerHTML = "";
      results.hidden = true;
      return;
    }
    const matches = portalState.people
      .filter((p) => p.published)
      .filter((p) => {
        const terms = [p.name, p.courtesyName, ...(p.searchTerms || [])].filter(Boolean);
        return terms.some((t) => t.toLowerCase().includes(q));
      })
      .slice(0, 8);

    if (!matches.length) {
      results.innerHTML = `<li class="quick-search-empty">沒有符合的人物</li>`;
      results.hidden = false;
      return;
    }

    results.innerHTML = matches
      .map(
        (p) => `
        <li>
          <a href="character.html?id=${encodeURIComponent(p.id)}">
            <span class="qs-avatar">${avatarImgHtml(p.avatar, "", "")}</span>
            <span class="qs-name">${escapeHtml(p.name)}</span>
            ${p.courtesyName ? `<span class="qs-courtesy">字 ${escapeHtml(p.courtesyName)}</span>` : ""}
          </a>
        </li>
      `
      )
      .join("");
    results.hidden = false;
  }

  input.addEventListener("input", () => renderResults(input.value));
  input.addEventListener("focus", () => {
    if (input.value.trim()) renderResults(input.value);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".quick-search")) {
      results.hidden = true;
    }
  });
}

async function initPortal() {
  try {
    portalState.people = await loadJsonCached("data/index.json", "cache:index");
  } catch (err) {
    document.getElementById("faction-portals").innerHTML =
      `<p class="portal-load-error">勢力入口載入失敗，請確認是否透過 Live Server（本機伺服器）開啟本網站。</p>`;
    console.error("首頁勢力入口資料載入失敗：", err);
    return;
  }
  renderFactionPortals();
  initQuickSearch();
}

initPortal();
