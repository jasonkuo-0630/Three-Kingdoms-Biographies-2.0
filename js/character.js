/**
 * character.js — 人物詳細頁邏輯
 * 所有人物共用這一個頁面模板，靠網址 ?id=xxx 決定要 fetch
 * data/characters/xxx.json 來渲染內容，並同時讀取：
 *  - data/sources.json  來源目錄（sourceId -> 性質/書名）
 *  - data/factions.json 勢力目錄（實際效力勢力 id -> 正式名稱/簡介）
 *  - data/index.json    輕量索引（用來判斷其他人物是否已建檔且已發布，
 *                        才決定要不要把親屬/勢力歷程渲染成可點擊連結）
 */

const TAB_DEFS = [
  { key: "overview", label: "總覽" },
  { key: "historical", label: "史實生平" },
  { key: "romance", label: "演義生平" },
  { key: "works", label: "著作" }, // 沒有著作資料時會在渲染階段被拿掉
];

let sourceMap = new Map();
let personIndexMap = new Map(); // id -> { id, name, avatar, published }
let actualFactionsMap = new Map(); // id -> { name, description, filterGroup }
let currentCharacter = null; // 目前這個頁面本人的資料，用來判斷「自我引用」的情況

function getIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function getTabFromHash(availableKeys) {
  const key = window.location.hash.replace("#", "");
  return availableKeys.includes(key) ? key : availableKeys[0];
}

/**
 * 只有在 personId 存在、且該人物在 data/index.json 裡「已建檔且 published: true」
 * 時，才回傳可連結的資料；否則回傳 null，呼叫端要 fallback 成純文字＋預設頭像。
 */
function resolvePerson(personId) {
  if (!personId) return null;
  const p = personIndexMap.get(personId);
  if (!p || !p.published) return null;
  return p;
}

/* ---------- 頁首（空欄位自動隱藏，不顯示空白或「無」） ---------- */

function headerFieldHtml(label, value) {
  if (!value) return "";
  return `<div class="meta-field"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(
    value
  )}</span></div>`;
}

function renderHero(c) {
  const otherNames = (c.otherNames || []).join("、");
  const metaFields = [
    headerFieldHtml("字", c.courtesyName),
    headerFieldHtml("小字", c.childhoodName),
    headerFieldHtml("號", c.artName),
    headerFieldHtml("其他名稱", otherNames),
    headerFieldHtml("生卒年", c.lifespan),
    headerFieldHtml("籍貫", c.birthplace),
    headerFieldHtml("主要身分", c.primaryIdentity),
  ]
    .filter(Boolean)
    .join("");

  const demoBadge = c.isDemoData || c.dataStatus
    ? `<div class="demo-badge">${escapeHtml(demoBadgeLabel(c))}</div>`
    : "";

  return `
    ${demoBadge}
    <section class="char-hero">
      <span class="avatar-ring avatar-ring--lg">
        ${avatarImgHtml(c.avatar, `${c.name}的頭像`, "")}
      </span>
      <div class="char-hero-info">
        <h1 class="char-hero-name">${escapeHtml(c.name)}</h1>
        ${c.commonAlias ? `<p class="char-alias">又稱${escapeHtml(c.commonAlias)}</p>` : ""}
        ${c.summary ? `<p class="char-summary">${escapeHtml(c.summary)}</p>` : ""}
        <div class="meta-grid">${metaFields}</div>
      </div>
    </section>
  `;
}

function demoBadgeLabel(c) {
  if (c.dataStatus === "reviewed-draft") {
    return "示範資料 — 內容已逐條核對原文，仍可能有疏漏，歡迎指正";
  }
  if (c.dataStatus) return `示範資料（狀態：${c.dataStatus}）`;
  return "示範資料 — 尚未完整核校，僅供測試版面";
}

/* ---------- 人物參照（親屬／勢力歷程共用）---------- */

/**
 * 產生人物頭像＋姓名的內容，並依是否已發布決定要不要包成連結。
 * fallbackAvatar：當 personId 沒有連結到已發布人物時使用的備用頭像路徑
 * （給還沒有自己完整頁面、但想放張圖的親屬/勢力人物用）。
 */
function resolvePersonRef(personId, fallbackName, fallbackAvatar, avatarClass) {
  const resolved = resolvePerson(personId);
  if (resolved) {
    const avatarHtml = avatarImgHtml(resolved.avatar, `${resolved.name}的頭像`, avatarClass);
    return { name: resolved.name, avatarHtml, linkedId: resolved.id };
  }

  // 沒有 personId（通常是刻意不做自我連結，例如劉備自己執政的階段），
  // 但如果姓名剛好跟目前這個頁面的主角同名，就直接用他自己的頭像，
  // 不要落到下面的灰色剪影預設值——不然看起來會像是「還沒建檔的陌生人」，
  // 但其實這頁本來就是他自己的頁面，頭像明明就在。
  if (currentCharacter && fallbackName === currentCharacter.name) {
    const avatarHtml = avatarImgHtml(currentCharacter.avatar, `${fallbackName}的頭像`, avatarClass);
    return { name: fallbackName, avatarHtml, linkedId: null };
  }

  const avatarHtml = avatarImgHtml(fallbackAvatar || null, `${fallbackName}的頭像`, avatarClass);
  return { name: fallbackName, avatarHtml, linkedId: null };
}

/* ---------- 總覽頁籤 ---------- */

/** 把連續且同一人物的階段合併成一組，之後渲染成單一卡片、內部用分隔線區隔 */
function groupFactionStages(entries) {
  const groups = [];
  entries.forEach((f) => {
    const last = groups[groups.length - 1];
    if (last && last.personName === f.personName) {
      last.segments.push(f);
    } else {
      groups.push({
        personName: f.personName,
        personId: f.personId,
        avatar: f.avatar,
        hideAvatar: f.hideAvatar,
        segments: [f],
      });
    }
  });
  return groups;
}

function renderFactionTimeline(entries) {
  if (!entries || !entries.length) return "";
  const groups = groupFactionStages(entries);

  const items = groups
    .map((g) => {
      const ref = resolvePersonRef(g.personId, g.personName, g.avatar, "faction-stage-avatar");
      const avatarBlock = g.hideAvatar
        ? "" // 給「東漢朝廷」這種不是具體人物的項目用，整個不畫頭像圈
        : `<span class="avatar-ring avatar-ring--sm">${ref.avatarHtml}</span>`;

      // 同一人物若歷經多個階段（例如劉備：劉備集團 → 蜀漢先主），
      // 合併成同一張卡片，階段之間用一條分隔線隔開，不再拆成好幾張卡片
      const segmentsHtml = g.segments
        .map((f, i) => {
          const actualFaction = actualFactionsMap.get(f.actualFactionId);
          const factionLabel = actualFaction ? actualFaction.name : f.stageName || "";
          const uncertainFlag = f.periodUncertain
            ? `<span class="uncertain-flag" title="年代為推定，非確定記載">年代推定</span>`
            : "";
          const dividerClass = i > 0 ? " has-divider" : "";
          return `
            <div class="faction-stage-segment${dividerClass}">
              <div class="faction-stage-faction">${escapeHtml(factionLabel)}</div>
              <div class="faction-stage-period">${escapeHtml(f.period)}${uncertainFlag}</div>
            </div>
          `;
        })
        .join("");

      const inner = `
        ${avatarBlock}
        <div class="faction-stage-body">
          <div class="faction-stage-person">${escapeHtml(g.personName)}</div>
          ${segmentsHtml}
        </div>
      `;
      return `<li>${personLinkOrPlain(ref.linkedId, inner, "faction-stage")}</li>`;
    })
    .join("");
  return `
    <div class="section-block">
      <h2 class="section-title">所屬勢力與效力歷程</h2>
      <ol class="faction-stage-list">${items}</ol>
    </div>
  `;
}

function renderTitlesAndRanks(list) {
  if (!list || !list.length) return "";
  const rows = list
    .map(
      (t) => `
      <li class="rank-item">
        <span class="rank-title">${escapeHtml(t.title)}</span>
        <span class="rank-period">${escapeHtml(t.period)}</span>
        ${citationsHtml(t.citations, sourceMap)}
      </li>`
    )
    .join("");
  return `
    <div class="section-block">
      <h2 class="section-title">官職與爵位</h2>
      <ul class="rank-list">${rows}</ul>
    </div>
  `;
}

function renderPosthumousTitle(pt) {
  if (!pt || !pt.title) return "";
  const paragraphsHtml = pt.paragraphs
    ? contentBlockHtml({ paragraphs: pt.paragraphs }, sourceMap)
    : "";
  return `
    <div class="section-block">
      <h2 class="section-title">諡號</h2>
      <div class="plain-card">
        <p><strong>${escapeHtml(pt.title)}</strong>${pt.grantedBy ? ` — ${escapeHtml(pt.grantedBy)}` : ""}</p>
        ${citationsHtml(pt.citations, sourceMap)}
        ${paragraphsHtml}
      </div>
    </div>
  `;
}

/**
 * 親屬排序：父母及以上尊親屬 → 兄弟姊妹 → 配偶 → 子女 → 孫輩，
 * 同一層再依「男先女後」排，最後用長／次／三…等排行字樣當次要依據。
 *
 * 排序層級改成優先讀取結構化欄位 relationGroup（ancestor / sibling /
 * spouse / child / grandchild / other），不再靠猜測 relation 自由文字。
 * 這是因為純文字判斷這條路已經踩過好幾次坑（劉禪生母被誤判成父母輩、
 * 元配因為沒有「妻」字被排到最後、劉協之子因為「之父」被誤判成尊親屬……
 * 每次都是新增一條規則補洞，永遠補不完）。relationGroup 由撰寫資料時
 * 直接指定，不會有語意歧義的問題。
 *
 * 只有在 relationGroup 缺漏時（例如未來新增資料忘記填），才退回舊的
 * 文字猜測邏輯當保底，確保漏填也不會直接讓排序整個爛掉、至少還有
 * 一個大致合理的結果。
 */
const RELATION_GROUP_TIER = { ancestor: 1, sibling: 2, spouse: 3, child: 4, grandchild: 5, other: 6 };

function relativeSortRank(r) {
  const relation = (typeof r === "string" ? r : r.relation) || "";
  const group = typeof r === "object" ? r.relationGroup : null;
  const primary = relation.split(/[、，（]/)[0];
  const genderGuess = () => {
    if (/兄子|弟子|姪|侄/.test(primary)) return /女/.test(primary) ? 1 : 0;
    if (/媳/.test(primary)) return 1;
    if (/婿|夫(?!人)/.test(primary)) return 0;
    if (/妻|夫人|皇后|王后|妃|元配|繼室|配偶|妾/.test(primary)) return 1;
    if (/父|祖|叔|伯|舅|兄|弟/.test(primary)) return 0;
    if (/母|姑|姊|姐|妹/.test(primary)) return 1;
    if (/孫/.test(primary)) return /女/.test(primary) ? 1 : 0;
    if (/女/.test(primary) && !/子/.test(primary)) return 1;
    return 0;
  };

  if (group && RELATION_GROUP_TIER[group]) {
    return { tier: RELATION_GROUP_TIER[group], gender: genderGuess() };
  }

  // ---- 保底：relationGroup 缺漏時的舊版文字猜測邏輯 ----
  if (/兄子|弟子|姪|侄/.test(primary)) return { tier: 4, gender: /女/.test(primary) ? 1 : 0 };
  if (/媳|婿/.test(primary)) return { tier: 4, gender: /媳/.test(primary) ? 1 : 0 };
  if (/妻|夫人|皇后|王后|妃|元配|繼室|配偶|妾/.test(primary)) return { tier: 3, gender: 1 };
  if (/夫/.test(primary)) return { tier: 3, gender: 0 };
  if (/父|祖|叔|伯|舅/.test(primary)) return { tier: 1, gender: 0 };
  if (/母|姑/.test(primary)) return { tier: 1, gender: 1 };
  if (/兄|弟/.test(primary)) return { tier: 2, gender: 0 };
  if (/姊|姐|妹/.test(primary)) return { tier: 2, gender: 1 };
  if (/孫/.test(primary)) return { tier: 5, gender: /女/.test(primary) ? 1 : 0 };
  if (/子|女|甥|姪/.test(primary)) return { tier: 4, gender: /女/.test(primary) && !/子/.test(primary) ? 1 : 0 };
  return { tier: 6, gender: 1 };
}

function relativeBirthOrderRank(relation) {
  const order = { 長: 0, 次: 1, 三: 2, 四: 3, 五: 4, 六: 5 };
  for (const k in order) {
    if ((relation || "").includes(k)) return order[k];
  }
  return 50; // 沒有明確排行字樣時給中間值，實際先後交給穩定排序保留原始順序
}

function sortRelatives(list) {
  return list
    .map((r, i) => ({ r, i, rank: relativeSortRank(r), order: relativeBirthOrderRank(r.relation) }))
    .sort((a, b) => {
      if (a.rank.tier !== b.rank.tier) return a.rank.tier - b.rank.tier;
      if (a.rank.gender !== b.rank.gender) return a.rank.gender - b.rank.gender;
      if (a.order !== b.order) return a.order - b.order;
      return a.i - b.i; // 排行也判斷不出來時，維持資料原本的順序
    })
    .map((x) => x.r);
}

function renderRelatives(list) {
  if (!list || !list.length) return "";
  const rows = sortRelatives(list)
    .map((r) => {
      // hideAvatar：給不打算建檔、連預設灰色剪影都不想放的親屬用
      // （例如劉備父母這種只在史書上帶一筆、沒有三國時期事蹟的人物）
      let personCell;
      if (r.hideAvatar) {
        personCell = `<span class="rel-person-cell rel-person-cell--no-avatar">${escapeHtml(r.personName)}</span>`;
      } else {
        const ref = resolvePersonRef(r.personId, r.personName, r.avatar, "");
        personCell = personLinkOrPlain(
          ref.linkedId,
          `<span class="avatar-ring avatar-ring--sm">${ref.avatarHtml}</span><span class="rel-name-text">${escapeHtml(ref.name)}</span>`,
          "rel-person-cell"
        );
      }
      // 資料性質徽章：改成直接讀取結構化欄位 natureCategory（historical /
      // literary / mixed / uncertain）來決定顯示成正史還是虛構樣式，不再
      // 用 natureType 的文字內容去猜。natureType 這個欄位保留下來，但它
      // 現在只負責顯示給讀者看的來源層級說明文字，不再兼職當程式判斷依據——
      // 這兩件事之前混在同一個欄位裡，已經造成好幾次誤判（黃夫人婚姻被
      // 「後世傳說」四個字誤標成虛構、孫夫人因為 natureType 提到「演義」
      // 兩個字反而被舊邏輯放過）。uncertain／mixed 目前先當作 record 樣式
      // 處理（不特別標示成虛構），因為徽章目前只有正史／虛構兩種視覺樣式，
      // 如果之後要細分出第三種樣式，這裡要一併調整 CSS。
      // natureCategory 缺漏時（保底）才退回舊的文字猜測。
      const legacyIsFictionType = (text) => /^(演義|後世文學|後世傳說|小說)/.test(text || "");
      const isFiction = (category, text) =>
        category ? category === "literary" : legacyIsFictionType(text);
      const natureBadgeHtml = (text, category) =>
        `<span class="nature-badge" data-nature="${isFiction(category, text) ? "fiction" : "record"}">${escapeHtml(
          text
        )}</span>`;

      // fictionalRelation：給「正史確有情誼記載，但演義另外安排了結拜／義兄弟這種
      // 虛構設定」的關係用（例如桃園三兄弟、孫策與周瑜）。有這個欄位的話，
      // 「關係」跟「資料性質」兩欄都會分兩行顯示：上面是正史關係，下面是演義設定，
      // 不要把兩件事擠成一句話混在一起。
      const relationHtml = r.fictionalRelation
        ? `<div class="rel-relation-line">${escapeHtml(r.relation)}</div><div class="rel-relation-line rel-relation-line--fiction">${escapeHtml(
            r.fictionalRelation.label
          )}</div>`
        : escapeHtml(r.relation);

      const natureHtml = r.fictionalRelation
        ? `<div>${natureBadgeHtml(r.natureType, r.natureCategory)}</div><div>${natureBadgeHtml(
            r.fictionalRelation.natureType,
            r.fictionalRelation.natureCategory
          )}</div>`
        : natureBadgeHtml(r.natureType, r.natureCategory);

      const supplementHtml = r.fictionalRelation
        ? `${escapeHtml(r.note || "")}${citationsHtml(r.citations, sourceMap)}${citationsHtml(
            r.fictionalRelation.citations,
            sourceMap
          )}`
        : `${escapeHtml(r.note || "")}${citationsHtml(r.citations, sourceMap)}`;

      return `
        <tr>
          <td class="person-cell">${personCell}</td>
          <td data-label="關係">${relationHtml}</td>
          <td data-label="資料性質">${natureHtml}</td>
          <td data-label="補充">${supplementHtml}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="section-block">
      <h2 class="section-title">親屬</h2>

      <div class="table-scroll">
        <table class="relative-table">
          <thead>
            <tr><th>人物</th><th>關係</th><th>資料性質</th><th>補充</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderEvaluationEntry(e) {
  // 原文與白話說明可以同時存在（例如「原文是這句，白話意思是……」），
  // 不能只要有 originalText 就把 paraphrase 整段丟掉。
  // 也不要求 textType 一定要精確等於「古籍原文」四個字，只要有 originalText
  // 就當逐字引文處理，容許「後世詩歌原文」之類的變體寫法。
  const originalHtml = e.originalText ? `<blockquote class="original-text">${escapeHtml(e.originalText)}</blockquote>` : "";
  const paraphraseHtml = e.paraphrase ? `<p class="paraphrase-text">${escapeHtml(e.paraphrase)}</p>` : "";
  return `
    <div class="quote-card">
      <div class="quote-meta">
        <span class="quote-evaluator">${escapeHtml(e.evaluatorName)}</span>
        ${e.evaluatorEra ? `<span class="quote-era">${escapeHtml(e.evaluatorEra)}</span>` : ""}
      </div>
      ${e.context ? `<p class="quote-context">${escapeHtml(e.context)}</p>` : ""}
      ${originalHtml}
      ${paraphraseHtml}
      ${citationsHtml(e.citations, sourceMap)}
    </div>
  `;
}

function renderEvaluations(title, list) {
  if (!list || !list.length) return "";
  return `
    <div class="section-block">
      <h2 class="section-title">${escapeHtml(title)}</h2>
      ${list.map(renderEvaluationEntry).join("")}
    </div>
  `;
}

function renderOverviewTab(c) {
  const ov = c.overview || {};
  let html = "";

  if (ov.intro) {
    html += `
      <div class="section-block">
        <h2 class="section-title">人物簡介</h2>
        ${contentBlockHtml(ov.intro, sourceMap)}
      </div>
    `;
  }

  html += renderFactionTimeline(ov.factionTimeline);
  html += renderRelatives(ov.relatives);
  html += renderTitlesAndRanks(ov.titlesAndRanks);
  html += renderPosthumousTitle(ov.posthumousTitle);

  const evals = ov.evaluations || {};
  html += renderEvaluations("當世評價", evals.contemporary);
  html += renderEvaluations("後世評價", evals.later);

  return html || `<p class="paraphrase-text">尚無總覽資料。</p>`;
}

/* ---------- 史實 / 演義生平：縱向時間線 ---------- */

function historicalTimelineHtml(entries) {
  if (!entries || !entries.length) {
    return `<p class="paraphrase-text">尚無史實生平資料。</p>`;
  }
  const items = entries
    .map(
      (e) => `
      <li class="timeline-item timeline-item--historical">
        <div class="timeline-period-col" data-period-type="${e.periodType || ""}">${escapeHtml(e.period)}</div>
        <div class="timeline-track"><span class="timeline-dot"></span></div>
        <div class="timeline-content">
          <span class="timeline-period-inline">${escapeHtml(e.period)}</span>
          <h3 class="timeline-title">${escapeHtml(e.title)}</h3>
          ${contentBlockHtml(e.content, sourceMap, e.uncertaintyNote)}
        </div>
      </li>`
    )
    .join("");
  return `<ol class="timeline-list">${items}</ol>`;
}

function diffNoteHtml(contentBlock) {
  if (!contentBlock || !contentBlock.paragraphs) return "";
  return contentBlock.paragraphs.map((p) => `<p class="paraphrase-text">${escapeHtml(p.text)}</p>`).join("");
}

function romanceTimelineHtml(entries) {
  if (!entries || !entries.length) {
    return `<p class="paraphrase-text">尚無演義生平資料。</p>`;
  }
  const items = entries
    .map(
      (e) => `
      <li class="timeline-item timeline-item--romance">
        <div class="timeline-period-col">${escapeHtml(e.chapter)}</div>
        <div class="timeline-track"><span class="timeline-dot"></span></div>
        <div class="timeline-content">
          <span class="timeline-period-inline">${escapeHtml(e.chapter)}</span>
          <h3 class="timeline-title">${escapeHtml(e.eventName)}</h3>
          ${contentBlockHtml(e.content, sourceMap)}
          ${
            e.historicalDifference
              ? `<div class="diff-note"><span class="diff-label">史實差異</span>${diffNoteHtml(
                  e.historicalDifference
                )}</div>`
              : ""
          }
        </div>
      </li>`
    )
    .join("");
  return `<ol class="timeline-list">${items}</ol>`;
}

/* ---------- 著作 ---------- */

function workMetaFieldHtml(label, value) {
  if (!value) return "";
  return `<div class="work-meta-field"><span class="work-meta-label">${escapeHtml(label)}</span><span class="work-meta-value">${escapeHtml(
    value
  )}</span></div>`;
}

function workFullTextHtml(work) {
  if (!work.fullText || !work.fullText.length) return "";
  const paragraphs = work.fullText.map((p) => `<p class="original-text-paragraph">${escapeHtml(p)}</p>`).join("");
  const versionNoteHtml = work.versionNote
    ? `<p class="version-note"><span class="version-note-label">版本依據／異文說明</span>${escapeHtml(work.versionNote)}</p>`
    : "";
  return `
    <details class="original-text-toggle">
      <summary>查看全文</summary>
      <blockquote class="original-text original-text--full">${paragraphs}</blockquote>
      ${versionNoteHtml}
    </details>
  `;
}

function worksNoteHtml(worksNote) {
  if (!worksNote) return "";
  // worksNote 原本設計是純字串，但曹操這筆資料用了跟其他欄位一致的
  // ContentBlock 格式（paragraphs + citations），這樣可以附上來源出處。
  // 兩種格式都要支援，不要因為格式升級就讓舊資料（孫策、諸葛亮）跟著壞掉。
  if (typeof worksNote === "string") {
    return `<p class="worksnote-text">${escapeHtml(worksNote)}</p>`;
  }
  if (worksNote.paragraphs) {
    return contentBlockHtml({ paragraphs: worksNote.paragraphs }, sourceMap);
  }
  return "";
}

function worksTabHtml(works, worksNote) {
  const noteHtml = worksNoteHtml(worksNote);
  const noteBlock = noteHtml ? `<div class="plain-card worksnote-block">${noteHtml}</div>` : "";
  // works 可能是空陣列（例如孫權、劉協這種只有 worksNote 說明「為什麼
  // 沒有列著作」的人物）——這種情況不要提前 return 空字串，要讓上面
  // 這段 noteBlock 正常顯示，只是底下不會再接著跑出任何著作卡片。
  if (!works || !works.length) return noteBlock;
  return (
    noteBlock +
    works
    .map((w) => {
      const metaFields = [
        workMetaFieldHtml("類型", w.type),
        workMetaFieldHtml("現存狀況", w.extant),
        workMetaFieldHtml("歸屬", w.attribution),
      ]
        .filter(Boolean)
        .join("");
      return `
        <div class="work-entry">
          <h3 class="work-title">${escapeHtml(w.title)}</h3>
          ${metaFields ? `<div class="work-meta-grid">${metaFields}</div>` : ""}
          ${w.summary ? `<p class="paraphrase-text">${escapeHtml(w.summary)}</p>` : ""}
          ${w.anthology ? `<div class="work-subsection"><span class="work-subsection-label">收錄文獻</span><p class="work-anthology">${escapeHtml(w.anthology)}</p></div>` : ""}
          ${
            w.excerpt
              ? `<div class="work-subsection"><span class="work-subsection-label">原文摘錄</span><blockquote class="original-text">${escapeHtml(
                  w.excerpt
                )}</blockquote></div>`
              : ""
          }
          ${workFullTextHtml(w)}
          ${citationsHtml(w.citations, sourceMap)}
        </div>
      `;
    })
    .join("")
  );
}

/* ---------- 頁籤切換（hash 路由 + 鍵盤方向鍵 + 瀏覽器上一頁/下一頁） ---------- */

function renderTabs(c) {
  // hasWorks 決定「著作」頁籤要不要出現：即使 works 是空陣列，只要有
  // worksNote（說明為什麼沒有列著作），也要讓頁籤出現，不然這段說明
  // 文字永遠沒有地方顯示——孫權、劉協、關平、關興都是這種情況。
  const hasWorks = (c.works && c.works.length > 0) || Boolean(c.worksNote);
  const tabs = TAB_DEFS.filter((t) => t.key !== "works" || hasWorks);
  const availableKeys = tabs.map((t) => t.key);

  const panelHtml = {
    overview: renderOverviewTab(c),
    historical: historicalTimelineHtml(c.historicalBio),
    romance: romanceTimelineHtml(c.romanceBio),
    works: hasWorks ? worksTabHtml(c.works, c.worksNote) : "",
  };

  const nav = document.getElementById("tabs-nav");
  const content = document.getElementById("tabs-content");
  let activeKey = getTabFromHash(availableKeys);

  function paint(focusTab) {
    nav.innerHTML = tabs
      .map(
        (t) => `
        <button type="button" class="tab-btn" role="tab" data-tab="${t.key}"
          aria-selected="${t.key === activeKey}" tabindex="${t.key === activeKey ? "0" : "-1"}"
          id="tab-${t.key}" aria-controls="panel-${t.key}">
          ${t.label}
        </button>`
      )
      .join("");

    content.innerHTML = tabs
      .map(
        (t) => `
        <div class="tab-panel" role="tabpanel" id="panel-${t.key}" aria-labelledby="tab-${t.key}"
          data-panel="${t.key}" ${t.key === activeKey ? "" : "hidden"}>
          ${panelHtml[t.key]}
        </div>`
      )
      .join("");

    if (focusTab) {
      const btn = nav.querySelector(`.tab-btn[data-tab="${activeKey}"]`);
      if (btn) btn.focus();
    }
  }

  function activate(key, { pushHistory, focusTab } = {}) {
    if (key === activeKey) return;
    activeKey = key;
    if (pushHistory) {
      const url = `${window.location.pathname}${window.location.search}#${activeKey}`;
      history.pushState(null, "", url);
    }
    paint(focusTab);
  }

  paint(false);

  nav.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    activate(btn.dataset.tab, { pushHistory: true, focusTab: false });
  });

  // 方向鍵 / Home / End：符合 WAI-ARIA tabs 模式的鍵盤導覽，移動焦點同時切換內容
  nav.addEventListener("keydown", (e) => {
    const currentIndex = availableKeys.indexOf(activeKey);
    let nextIndex = null;
    if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % availableKeys.length;
    else if (e.key === "ArrowLeft") nextIndex = (currentIndex - 1 + availableKeys.length) % availableKeys.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = availableKeys.length - 1;
    else return;

    e.preventDefault();
    activate(availableKeys[nextIndex], { pushHistory: true, focusTab: true });
  });

  // 瀏覽器上一頁／下一頁：hashchange 會在按上一頁/下一頁時觸發，重新對齊畫面
  window.addEventListener("hashchange", () => {
    const key = getTabFromHash(availableKeys);
    if (key !== activeKey) {
      activeKey = key;
      paint(false);
    }
  });
}

/* ---------- 返回連結 ---------- */

/** 優先回到使用者真正從哪個勢力頁面進來的（讀 document.referrer），
 *  這樣返回會回到原本瀏覽的那個陣營，不是寫死跳回固定頁面。
 *  找不到 referrer 時，退回這個人物自己所屬的陣營頁（如果知道的話），
 *  再不然才退回卷首讓使用者自己選——faction.html 現在一定要帶明確的
 *  陣營 id，不能再退到「全部人物」了。 */
function resolveBackLinkUrl(fallbackFilterGroup) {
  try {
    const ref = document.referrer;
    if (ref) {
      const refUrl = new URL(ref);
      if (refUrl.origin === window.location.origin && refUrl.pathname.endsWith("/faction.html")) {
        return ref;
      }
    }
  } catch (err) {
    // document.referrer 格式異常或跨網域，當作沒有，用預設值
  }
  return fallbackFilterGroup ? `faction.html?faction=${encodeURIComponent(fallbackFilterGroup)}` : "index.html";
}

function applyBackLinkUrl(fallbackFilterGroup) {
  const url = resolveBackLinkUrl(fallbackFilterGroup);
  document.querySelectorAll(".back-link").forEach((a) => a.setAttribute("href", url));
}

/* ---------- 錯誤頁面 ---------- */

function renderNotFound(id) {
  document.getElementById("char-root").innerHTML = `
    <div class="not-found">
      <h1>找不到這位人物</h1>
      <p>網址中的 id「${escapeHtml(id || "")}」目前沒有對應的人物資料，可能是網址錯誤，或這位人物尚未建檔。</p>
      <a class="back-link" href="${resolveBackLinkUrl()}">← 返回人物列表</a>
    </div>
  `;
  document.title = "找不到人物 - 三國人物誌";
}

/* ---------- 初始化 ---------- */

async function init() {
  applyBackLinkUrl();

  const id = getIdFromUrl();
  if (!id) {
    renderNotFound(id);
    return;
  }

  let character, sources, factions, people;
  try {
    [character, sources, factions, people] = await Promise.all([
      loadJson(`data/characters/${encodeURIComponent(id)}.json`),
      loadJsonCached("data/sources.json", "cache:sources"),
      loadJsonCached("data/factions.json", "cache:factions"),
      loadJsonCached("data/index.json", "cache:index"),
    ]);
  } catch (err) {
    console.error(`載入人物頁所需資料失敗（id=${id}）：`, err);
    renderNotFound(id);
    return;
  }

  sourceMap = buildSourceMap(sources);
  (factions.actualFactions || []).forEach((f) => actualFactionsMap.set(f.id, f));
  people.forEach((p) => personIndexMap.set(p.id, p));
  currentCharacter = character;

  // 現在知道這位人物屬於哪個陣營了，如果剛剛沒有找到有效的 referrer，
  // 就把返回連結指到「這個人物自己所屬的陣營頁」，而不是停在卷首
  applyBackLinkUrl(personIndexMap.get(id)?.filterGroup);

  document.title = `${character.name} - 三國人物誌`;

  const root = document.getElementById("char-root");
  root.innerHTML = `
    ${renderHero(character)}
    <nav class="tabs-nav" id="tabs-nav" role="tablist"></nav>
    <div id="tabs-content"></div>
  `;

  renderTabs(character);
}

init();