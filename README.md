# 三國人物誌

以史料分層、人物資料結構化與可持續擴充為核心的三國人物知識網站。

本站不只整理人物生平，也希望清楚呈現同一人物在《三國志》正文、裴松之注引史料、
其他史籍、《三國演義》及後世文學中的不同面貌。所有內容以白話解說為主、原始文獻
為輔，並透過來源引用、年代警語與史實差異說明，避免把後世故事直接當成歷史事實。

目前專案採純 HTML、CSS、原生 JavaScript 與 JSON 建置，沒有前端框架、後端服務或
資料庫。網站可直接部署為靜態網站。

**這份 README 是給「下一個接手這個專案的 Claude」看的交接文件**，同時也面向專案
維護者、內容校對者與未來開發者。如果你是被指派接手的 Claude，讀完這份文件、再
瀏覽 `data/characters/` 裡幾份現有資料當範例，應該就能理解全部的架構慣例，不需
要使用者重新口述一次。

**這是 2.0 版 repo**（前身 `Three-Kingdoms-Biographies` 1.0 版保留不動、單獨存放，
不再更新）。2.0 版最主要的變動是首頁跟人物總覽的整個重新設計，資料 schema
（`data/characters/*.json` 的結構）跟 1.0 完全相容、沒有改動。

## 專案目標

- 建立可持續擴充的三國人物資料庫，一位人物一份 JSON。
- 分開呈現史實生平與《三國演義》／後世文學形象。
- 每段重要敘述都能追溯至具體來源與位置。
- 將人物的勢力歷程、親屬、官爵、評價與傳世著作結構化。
- 讓跨人物、跨勢力與跨來源的關聯能互相連結。
- 在史料嚴謹與一般讀者可讀性之間取得平衡。
- 保持資料與畫面分離，避免人物內容散落在 HTML 或 JavaScript 中。

## 專案分工（重要，先理解這個再看其他部分）

這個專案固定是三方協作：

- **使用者**：決定要做誰、設計方向、視覺呈現、最終拍板所有規則。
- **奈奈（ChatGPT）**：負責查證史料、整理人物資料，輸出成本專案的 JSON schema
  格式；有時也會被拿來做視覺／前端試作稿。
- **Claude（你）**：負責架構設計、資料整合、程式碼撰寫、跑測試驗證，以及在奈奈
  的查證或試作稿出現疏漏時提出質疑、必要時自己動手查證核對。

**你的角色不是被動套資料或照單全收試作稿**。這個專案一路走來，好幾次重要的修正
都是 Claude 主動發現問題後跟使用者提出來的，包括但不限於：

- 奈奈曾誤把「劉禪生母」的「母」字誤判成親屬排序的父母輩。
- 曾經有一段「日語諧音」考證查無實據卻被直接寫進資料。
- 「隆中對」是史家轉述的對話，原本被誤放進著作清單，正確位置是史實生平脈絡的
  補充說明，不是獨立作品。
- 奈奈曾經交付一份「首頁試作稿」，實際上是用某個網站產生工具做的 Next.js +
  Cloudflare Workers + D1 資料庫 + 「用 ChatGPT 登入」的完整應用程式骨架，跟本
  專案「純 HTML/CSS/JS、無框架無後端」的立命之本直接衝突；且該試作稿把人物資料
  整個重複造了一份、跟 `data/` 脫鉤。這次是在動手套用前，透過檢查檔案結構抓到
  的問題。
- `works: []` 的人物身上殘留只用來說明「查無著作」的 `worksNote`，一度被前端邏
  輯誤判成「有內容可顯示」而生出著作頁籤；已於本輪修正（見下方「著作收錄規則」）。
- `overview.intro.uncertaintyNote`（孫權、孫策條目用來說明生年推算依據）與
  `romanceBio[].uncertaintyNote`（黃夫人條目說明「黃月英」名稱流傳考據限制）
  這兩處資料其實從一開始就寫在 JSON 裡，但 `js/character.js` 的渲染函式沒有
  把這兩個欄位傳給 `contentBlockHtml`，資料存在、畫面上卻永遠不會顯示——是
  比「著作頁籤誤判」更隱蔽的死欄位問題，因為它不會報錯，就是安靜地不出現。
  已修正兩處呼叫，並在程式碼裡補了註解說明原因。
- 第一輪 schema／驗證器／渲染測試機做出來後，複核時故意塞入錯誤資料去撞，
  撞出好幾個「結構合法但驗證器沒真的檢查到」的漏洞：`filterGroups.id` 重複、
  `data/index.json` 內部重複人物 id、`uncertaintyNote` 誤放進不會被讀取的
  `content` 內部、勢力頁多出一個假人物連結卻只判斷「數量非零」就放行、以及
  渲染測試機把所有未捕捉的 Promise rejection 都籠統當成「頁面切換殘留雜訊」
  忽略掉，導致真正的頁面錯誤也會被放行。這些都已修正，過程中也發現渲染測試
  機原本假設 jsdom 會發出 `unhandledrejection` 這個 window 事件，實測後發現
  jsdom 29 根本不會發，原本那段監聽邏輯完全是擺著好看、沒有真的在運作——教
  訓是：假設某個 API／事件存在之前，先寫個最小範例實測，不要憑印象。

收到奈奈整理的資料或試作稿後，先做交叉驗證，抓到問題要老實跟使用者說，不要為了
效率而略過查證，也不要因為東西「看起來很完整」就假設它跟本專案的技術路線相容。

## 核心編輯原則

**史料層級必須分開。** 本站至少區分以下來源性質：

- 《三國志》正文
- 裴松之注引史料
- 其他史籍與地方志
- 《三國演義》原文
- 後世文學、戲曲、傳說與藝術形象
- 現代研究、遊戲或其他大眾文化資料

不同層級可以互相對照，但不可互相冒充。裴注引書不能簡化為《三國志》正文，《三國
演義》情節也不能直接填入史實生平。

**白話敘述與原文分工。** `paragraphs` 負責讓一般讀者理解事件；`originalTexts` 只
收錄已逐字核對的原始文獻。找不到可靠原文時，省略 `originalTexts`，不可自行生成
仿古文字。年代推定、記載矛盾或來源可信度問題，使用 `uncertaintyNote` 說明。

**史料沉默不等於可以自由補完。** 正史未記載的出生年、官職、戰功、親屬或言行，應
明確寫成「未見記載」或保留空值，不以小說、遊戲或後世傳說填補。

**虛構人物維持虛構身分。** 小說原創人物可以建檔（如馬雲騄），但必須標明其文學來
源。其 `historicalBio` 應維持空陣列，不得挪用相關歷史人物的史料拼成虛構人物的
「史實生平」。

**名稱採保守原則。** 史書未記本名時，主顯示名稱使用可確定的稱呼。例如「黃月英」
屬後世通稱時，主名仍應採「黃夫人」，再透過 `commonAlias` 或說明欄補充後世名稱。

## 技術路線

- 純 HTML
- 純 CSS
- 原生 JavaScript
- JSON 資料檔
- 無前端框架
- 無後端
- 無資料庫
- 無需登入

開發階段可以使用 Node.js 腳本進行資料驗證、測試或產生索引（見下方「資料驗證」），
但這些工具不屬於網站執行時依賴，不改變本站的靜態網站性質。

## 網站頁面

| 頁面 | 用途 |
|---|---|
| `index.html` | 卷首入口：說書人主視覺（`storyteller-cutout.png` + 水墨背景）+ 五勢力入口卡片 + 全站人物快速搜尋。不列出人物本身，也沒有「瀏覽全部人物」或跨勢力分類頁籤——快速搜尋是唯一的跨勢力入口，各勢力頁面一律從入口卡片點進去。 |
| `faction.html?faction={filterGroup}` | 顯示單一大分類下的已發布人物，竹簡樣式列表。五個陣營共用同一份模板。 |
| `character.html?id={personId}` | 讀取一位人物的完整 JSON 並渲染詳細頁。 |

人物詳細頁目前包含以下頁籤：

- 總覽
- 史實生平
- 演義生平
- 著作（僅在 `works` 至少有一篇收錄作品時顯示——`worksNote` 不能單獨觸發這個
  頁籤，見下方「著作收錄規則」）

## 目錄結構

```
Three-kingdoms-Biographies-2.0/
├── index.html
├── faction.html
├── character.html
├── README.md
├── css/
│   └── style.css
├── js/
│   ├── common.js               共用工具：fetch/快取、escapeHtml、citation 渲染
│   ├── portal.js                首頁專用邏輯
│   ├── listing.js               faction.html 人物列表邏輯
│   ├── character.js             character.html 渲染邏輯（含頁籤切換）
│   └── faction-portal-meta.js   五勢力入口卡片的靜態內容（去背肖像、對聯等）
├── data/
│   ├── index.json
│   ├── sources.json
│   ├── factions.json
│   └── characters/
│       └── {id}.json
├── images/
└── fonts/
    └── bakudai-watermark.woff2  自架浮水印用毛筆字型子集
```

`data/characters/` 維持扁平結構，不依東漢、魏、蜀、吳、群雄拆資料夾。人物可能歷
經多個政權，檔案的永久位置不應由「最後效忠陣營」決定；最後陣營歸屬由資料欄位
（`filterGroup`）處理。

## ID 系統

ID 是資料之間互相連結的穩定內部鍵。顯示名稱可以修正，ID 原則上不隨稱號、官職、
史料理解或頁面文案改動。所有自訂 ID 建議使用小寫英文字母、數字與連字號，例如
`zhuge-liang`、`sgz-zhuge-main`。

| ID／欄位 | 所在位置 | 用途 |
|---|---|---|
| `id` | 人物 JSON 最外層 | 人物唯一識別碼；應與檔名及網址 `?id=` 一致 |
| `personId` | 親屬、勢力歷程等 | 指向另一位人物；對方未建檔時可為 `null` |
| `sourceId` | citations、originalTexts | 指向 `data/sources.json` 的來源項目 |
| `actualFactionId` | overview.factionTimeline | 指向 `data/factions.json.actualFactions` 的具體政權或勢力階段 |
| `filterGroup` | 人物索引、勢力目錄 | 首頁與人物總覽使用的大分類，如 `wei`、`shu` |
| `stageName` | 人物勢力歷程 | 該人物頁面實際顯示的階段名稱，可比共用勢力名稱更精確 |
| `schemaVersion` | 人物 JSON 最外層 | 標示人物資料採用的 schema 版本，不是人物 ID |

**`id`**：人物檔名、檔案內 `id` 與網址參數必須一致：

```
data/characters/zhao-yun.json
                    └─ "id": "zhao-yun"
                    └─ character.html?id=zhao-yun
```

**`personId`**：`personName` 是顯示文字，`personId` 是連結鍵。只有當 `personId`
能在人物索引找到，且對方 `published: true` 時，頁面才建立可點擊連結；否則維持純
文字與預設頭像。不可因為對方尚未建檔而捏造 ID。可以先保留：

```json
{
  "personName": "關氏（名不詳）",
  "personId": null
}
```

**`sourceId`**：人物資料不重複書寫來源全名，而是透過 `sourceId` 引用共用來源目
錄。同一來源原則上只建立一個 ID，不因不同人物引用而重複建檔。

**`actualFactionId`**：用來標示人物在某一時期實際處於哪個政權或政治集團。它比首
頁的魏、蜀、吳分類更細，例如可區分劉備的荊州據地、入蜀作戰、益州牧政權、漢中王
政權與蜀漢稱帝後政權。

**`filterGroup`**：`filterGroup` 是網站瀏覽分類，不等於完整政治生涯。

- `data/index.json` 中的 `filterGroup`：人物在首頁／勢力頁的單一歸屬，目前採最
  後效忠或最終主要陣營。
- `actualFactions[].filterGroup`：某個具體勢力在網站分類系統中的上層歸類。

完整跨勢力經歷仍以人物的 `overview.factionTimeline` 為準。

目前主要入口為：

| filterGroup | 顯示名稱 |
|---|---|
| `donghan` | 東漢 |
| `wei` | 曹魏 |
| `shu` | 蜀漢 |
| `wu` | 孫吳 |
| `qunxiong` | 群雄 |

`data/factions.json` 的 `filterGroups` 裡其實還多預留了一個 `jin`（西晉，
`order: 6`），本輪核對資料時發現的，草案沒有記錄。目前沒有任何人物或
`actualFactions` 使用這個分類，屬於為未來（例如收錄司馬炎等西晉人物時）預留的
分類，非資料錯誤，先如實記錄在這裡。

## 共用資料檔

### `data/index.json`：人物輕量索引

人物完整內容存放在 `data/characters/{id}.json`，首頁與列表不應一次下載所有完整
人物檔，因此另以 `data/index.json` 保存瀏覽所需的少量欄位：

```json
{
  "id": "zhao-yun",
  "published": true,
  "name": "趙雲",
  "courtesyName": "子龍",
  "searchTerms": ["趙雲", "子龍", "zhao yun"],
  "avatar": "images/zhao_yun.png",
  "filterGroup": "shu"
}
```

索引用於：

- 首頁快速搜尋
- 勢力頁人物列表
- 各勢力已發布人數統計
- 親屬與勢力領袖的跨人物連結
- 判斷對方是否已建檔並發布

**目前索引仍由人工維護。** 每新增、改名、換頭像、改陣營或改發布狀態時，都必須
同步更新人物檔與 `data/index.json`。`filterGroup` 與 `searchTerms` 目前只存在
於 `data/index.json`，人物 JSON 本身沒有這兩個欄位——這點會影響自動索引產生器
的設計，詳見下方「未來規劃」。

### `data/sources.json`：來源目錄

每筆來源至少包含：

```json
{
  "id": "yun-biezhuan",
  "kind": "裴松之注引",
  "title": "《雲別傳》",
  "note": "來源性質、傳本與可信度補充。"
}
```

- `id`：來源唯一 ID。
- `kind`：來源層級。
- `title`：讀者看到的來源名稱。
- `note`：選填，說明作者、傳本、亡佚、版本或使用限制。
- `url`：未來可考慮加入的選填欄位，應優先使用穩定、可核對的原始文獻頁面。

人物中的引用格式：

```json
{
  "sourceId": "yun-biezhuan",
  "locator": "卷三十六・趙雲傳裴注",
  "note": "選填補充"
}
```

每一個 `sourceId` 都必須在來源目錄中存在；重複 ID 與同書異 ID 都應由驗證流程攔
截或人工複核。

### `data/factions.json`：勢力目錄

勢力資料分成兩層：

- `filterGroups`：東漢、曹魏、蜀漢、孫吳、群雄等網站瀏覽分類。
- `actualFactions`：人物實際效力過的具體政權、軍事集團或文學虛構勢力。

`actualFactions` 範例：

```json
{
  "id": "shuhan-houzhu",
  "name": "蜀漢・後主政權",
  "filterGroup": "shu",
  "description": "建興元年起至蜀漢滅亡的政權階段。"
}
```

小說虛構勢力必須使用獨立的 `actualFactionId`，不得為了方便直接掛到真實歷史政
權，造成史實與文學世界混用。

## 人物 JSON

### 最外層欄位

| 欄位 | 用途 |
|---|---|
| `schemaVersion` | 資料規格版本 |
| `dataStatus` | 編輯／審核狀態，例如 `reviewed-draft` |
| `published` | 是否允許在網站公開列出與建立連結 |
| `lastReviewedAt` | 最近一次內容複核日期 |
| `id` | 人物唯一 ID |
| `name` | 主要顯示名稱 |
| `courtesyName` | 字 |
| `childhoodName` | 幼名 |
| `artName` | 號或其他正式號稱 |
| `otherNames` | 其他名稱陣列 |
| `commonAlias` | 後世常見但非史實本名的醒目別稱 |
| `lifespan` | 生卒年資訊 |
| `birthplace` | 籍貫或出生地說明 |
| `primaryIdentity` | 人物主要身分定位 |
| `summary` | 頁首簡介；以精簡為原則，不為統一字數硬補內容 |
| `avatar` | 人物頭像路徑 |
| `overview` | 勢力歷程、親屬、官爵、評價等總覽資料 |
| `historicalBio` | 史實生平事件陣列 |
| `romanceBio` | 《三國演義》／後世文學事件陣列 |
| `works` | 符合收錄規則的傳世作品陣列 |
| `worksNote` | 僅在已有收錄作品時補充傳本、真偽或收錄範圍 |
| `demoNote`（選填） | 給編輯者看的整檔編輯備註，說明這份資料的查證範圍、版本依據或已知限制，不會顯示在前端頁面上。目前 6 位人物（趙雲、諸葛亮、黃夫人、劉備、劉協、馬雲騄）有這個欄位；README 草案原本沒有記錄，本輪核對實際資料後補上。 |

`summary` 建議控制在約 120–160 字內；較短不是錯誤，不能為達到固定字數而加入重
複或次要內容。

### ContentBlock

人物簡介、生平事件與史實差異共用白話＋原文結構：

```json
{
  "paragraphs": [
    {
      "text": "白話整理內容。",
      "citations": [
        { "sourceId": "sgz-zhaoyun-main", "locator": "卷三十六" }
      ]
    }
  ],
  "originalTexts": [
    {
      "text": "逐字核對過的史料原文。",
      "sourceId": "sgz-zhaoyun-main",
      "locator": "卷三十六"
    }
  ]
}
```

`uncertaintyNote` 應與事件的 `period`、`title`、`content` 平行，不可誤放進
`content` 內，否則現行渲染程式無法讀取。

### overview

`overview` 目前固定包含六個子欄位：`intro`、`factionTimeline`、`relatives`、
`titlesAndRanks`、`posthumousTitle`、`evaluations`。

**intro**：總覽頁籤最上方的生平概述，使用 ContentBlock 結構（`paragraphs` +
`citations`，可選 `originalTexts`），跟 `historicalBio`／`romanceBio` 事件卡共
用同一套白話＋原文表示法。這個欄位存在於全部 20 位人物資料中，但 README 草案
原本沒有列出，本輪核對實際資料後補上。

**factionTimeline**：每一階段可使用：

```json
{
  "stageName": "劉備集團・入蜀作戰",
  "personName": "劉備",
  "personId": "liu-bei",
  "actualFactionId": "liubei-yizhou-regime",
  "period": "建安十六年至十九年（211—214年）",
  "periodUncertain": false
}
```

- `stageName`：該人物頁實際顯示名稱。
- `personName`：該階段政治領袖的顯示名稱，不是直屬長官。
- `personId`：政治領袖已有頁面時的連結。
- `actualFactionId`：共用勢力目錄 ID。
- `period`：顯示時間。
- `periodUncertain`：是否顯示年代不確定提示。
- `hideAvatar`：**只有條目本身不是人物時才使用 `true`**（例如「東漢朝廷」這種抽
  象政治實體）；未建檔的真實人物仍應保留預設人物剪影，不可因為對方沒有頁面就設
  成 `hideAvatar: true`。

同一個 `actualFactionId` 可以因人物脈絡不同而搭配較精確的 `stageName`，但不得藉
此掩蓋勢力目錄本身定義錯誤。

**relatives**：

```json
{
  "personName": "關羽",
  "personId": "guan-yu",
  "relation": "父",
  "relationGroup": "ancestor",
  "natureType": "《三國志》正文記載",
  "natureCategory": "historical",
  "note": "關係與史料差異說明。",
  "citations": []
}
```

`relationGroup`（供程式排序使用，不再依 `relation` 自由文字猜測世代）：

| 值 | 用途 |
|---|---|
| `ancestor` | 父母、祖先與尊親屬 |
| `sibling` | 兄弟姊妹 |
| `spouse` | 配偶 |
| `child` | 子女及同輩視角下的晚輩關係 |
| `grandchild` | 孫輩 |
| `other` | 無法歸入以上群組的關係 |

排序規則：父母 → 兄弟姊妹 → 配偶 → 子女 → 孫輩，同一階層內男性排在女性之前。要
特別注意兩個邊界情況：含「母」字的配偶尊稱不可被誤判為父母輩；「兄子」（姪子）
不可被誤判為兄弟姊妹。

`natureType`：顯示給讀者看的來源性質文字，例如「《三國志》正文記載」「裴注引書
記載」「《三國演義》設定」。它負責說明，不應再讓程式靠文字關鍵字猜測真實或虛構。

`natureCategory`（供程式判斷徽章與樣式）：

| 值 | 用途 |
|---|---|
| `historical` | 史籍可確認的關係 |
| `literary` | 文學或後世虛構關係 |
| `mixed` | 同一條目含史實核心與文學改寫 |
| `uncertain` | 來源不足或關係存在爭議 |

若正史關係與《三國演義》的結拜、義親等設定同時存在，使用 `fictionalRelation`
分層保存（歷史層與文學層分兩行顯示，不混在同一段敘述），不把兩者擠在同一段
`relation`：

```json
{
  "relation": "情同兄弟",
  "relationGroup": "sibling",
  "natureType": "史籍記載",
  "natureCategory": "historical",
  "fictionalRelation": {
    "label": "結拜兄弟",
    "natureType": "《三國演義》設定",
    "natureCategory": "literary",
    "citations": []
  }
}
```

親屬頭像一律使用單一金色頭像框，不依關係層級（父母／配偶／子女）改變顏色。

**titlesAndRanks**：官爵資料每筆至少包含 `title`、`period` 與 `citations`。官
名可以翻成白話補充職掌，但不可僅憑官名擴寫出史書未記載的實際政績或戰功。

**posthumousTitle**：實際資料中是物件，至少含 `title`（諡號本身），常見還有
`grantedBy`（追諡者與時間）、`citations`、`paragraphs`（ContentBlock 補充說明追
諡經過）。沒有諡號時整個欄位使用 `null` 或省略；不可把爵號、廟號、後世尊號混作
諡號。

**evaluations**：分成 `contemporary` 與 `later`：

```json
{
  "evaluatorName": "劉備",
  "evaluatorEra": "蜀漢先主",
  "context": "評語產生的場合",
  "textType": "古籍原文",
  "originalText": "子龍一身都是膽也。",
  "paraphrase": "白話解釋與使用限制。",
  "citations": []
}
```

`originalText` 與 `paraphrase` 可以同時存在，建議兩者並陳。只有白話轉述而沒有
可核對原文時，不可把轉述內容偽裝成引文。

### 史實生平與演義生平

**historicalBio**：每筆事件使用：

```json
{
  "period": "建興七年（229年）",
  "periodType": "year",
  "title": "事件標題",
  "content": {},
  "uncertaintyNote": "選填"
}
```

`periodType` 用來標示精確年、時間範圍、約年或年代不詳等狀態；固定值應由正式
schema 統一定義。

**romanceBio**：每筆事件使用章回或作品內時間：

```json
{
  "chapter": "第七十一回",
  "eventName": "小說事件名稱",
  "content": {},
  "historicalDifference": {}
}
```

`historicalDifference` 用來說明小說保留了哪些史實核心、增加或改寫了哪些內容。
即使情節完全虛構，也應簡潔說明正史記載範圍，而不是只寫「此為虛構」。

### 著作收錄規則

**何者收入 `works`**：

- 表、疏、箋、書信、詔令、詩賦、政論等有明確文字傳世者。
- 全文傳世但作者歸屬有爭議者可以收錄，須在 `attribution` 持續標示爭議。
- 只存篇名、書目或零碎佚文，沒有足夠本文者不建立獨立作品卡。
- 史家轉述的人物對話或政略談話不等於人物親筆著作，例如「隆中對」保留在史實生
  平，不重複收入 `works`。

作品欄位可包含：`title`、`type`、`extant`、`attribution`、`summary`、
`anthology`、`excerpt`、`citations`、`fullText`。

`fullText` 只收錄已核對、篇幅適合且可合法使用的完整文本。若只有殘句，使用
`excerpt`，不得把殘文補寫成全文。

**無著作人物的顯示規則**——這是本輪修正的重點，請務必遵守：

沒有符合本站收錄條件的作品時：

```json
"works": []
```

`works` 為空陣列時，**不得**再保留 `worksNote`。這個規則以前有過反例（劉協、關
平、關興三人一度用 `worksNote` 寫「查無著作」之類的說明），已於本輪清除，並同
步修正 `js/character.js` 的頁籤判斷邏輯：現在「著作」頁籤只看
`works.length > 0`，`worksNote` 不再能單獨觸發頁籤。此時人物詳細頁不顯示「著
作」頁籤，也不另外展示「查無著作」空頁。

`worksNote` **只在 `works` 至少有一篇作品時使用**，用來補充：

- 已佚文集與現存篇章的關係
- 作者歸屬或真偽爭議
- 本站收錄與未收錄範圍
- 不同傳本或全文版本問題（例如孫權、孫策、法正的 `worksNote` 都是這種合法用
  法，本輪沒有動）

`worksNote` 不得單獨觸發著作頁籤。

## 圖像與素材

- 人物詳細頁與人物列表使用一般人物頭像。
- 首頁勢力入口使用獨立的君主去背肖像（`*_main.png`），不與人物頭像混用。
- 人物圖像載入失敗時使用 `_placeholder.svg`。
- `hideAvatar: true` 只適用於「東漢朝廷」「未出仕」等非人物概念，不適用於尚未
  建檔的人。
- AI 生成圖像屬視覺重建，不作為史料證據。
- 各勢力頁面的主色調（曹魏＝藍、蜀漢＝綠、孫吳＝紅、東漢＝紫、群雄＝棕）一律透
  過 CSS 自訂屬性（`--tone`）以 `color-mix(in srgb, var(--tone) N%, black)` 的
  方式與**純黑色**混色，不要跟 `var(--ink)` 混色——`--ink` 本身帶綠色調，混色
  後會讓非蜀漢勢力的顏色也偏向同一種綠，喪失勢力區隔。這點已經踩過一次坑，改動
  相關 CSS 前請先理解這段歷史。
- 首頁浮水印背景字使用的毛筆字型 `--font-brush` 是自架的 Bakudai 子集
  （`fonts/bakudai-watermark.woff2`，約 20KB，目前收錄 44 個字）。若新增角色
  用到子集裡沒有的繁體字（曾經發生在「漢」「吳」兩字），需要用 `pyftsubset`
  重新產生子集，不能整包放正體字型上去（檔案會爆量）。
- 首頁背景浮水印字元的 `z-index` 刻意設為 `1`（在人物剪影下方），這是經過三輪
  調整後的結果，改動前請先確認理由還成立，不要憑直覺調整。

## 如何新增人物

1. 查核人物的正史、裴注、其他史籍與文學來源。
2. 搜尋 `sources.json`，沿用既有來源 ID；缺少時再新增。
3. 搜尋 `factions.json`，沿用既有具體勢力 ID；確有新階段時再新增。
4. 在 `data/characters/` 建立 `{id}.json`。
5. 確認檔名、人物 `id`、網址 ID 完全一致。
6. 補齊 `overview`、`historicalBio`、`romanceBio` 與 `works`。
7. 對親屬填寫 `relationGroup` 與 `natureCategory`，不依自由文字讓程式猜測。
8. 目前手動同步 `data/index.json`。
9. 回查其他人物是否已提到新人物，補上可建立的雙向 `personId`。
10. 執行資料驗證與實際頁面渲染測試（見下方「資料驗證」）。

在建立正式資料前，可以先用「空檔」策略佔位：只填 `id`／`name`／`courtesyName`／
`avatar`，`published: true`，`overview` 留空物件、`historicalBio`／
`romanceBio`／`works` 留空陣列，且**不要**加上 `dataStatus` 欄位。這樣其他人物
可以先建立指向這位人物的 `personId` 連結，之後再回頭補完整內容。完整資料一律
會有 `"dataStatus": "reviewed-draft"`；空檔人物則完全沒有這個欄位，靠這個區分
兩種狀態。

## 資料驗證

README 是給人閱讀的系統說明；正式 schema 與驗證器則負責讓錯誤不能通過。兩者用
途相關但不可互相取代。

**指令（第一次使用或套件版本更新後，先 `npm install` 裝一次）：**

```bash
npm install          # 安裝 ajv／jsdom 等開發用工具的相依套件
npm run validate     # 只跑資料驗證（schema + 交叉引用）
npm run render-test  # 只跑渲染測試（實際用 jsdom 渲染頁面）
npm test             # 兩者都跑（= validate && render-test）
```

這幾個指令跟網站本身無關，網站仍然是純 HTML/CSS/JS，不需要 Node.js 或這裡的
任何套件就能開啟瀏覽；`npm install` 裝的東西只在你自己電腦上跑這些檢查指令時
用到，不會被使用者的瀏覽器載入。

```
schema/
├── character.schema.json
├── sources.schema.json
└── factions.schema.json

scripts/
├── validate-data.js    資料驗證：schema + 交叉引用
└── render-test.js      渲染測試：用 jsdom 實際跑頁面 JS
```

**schema 應檢查：**

- 必填與選填欄位（區分「完整人物」與「空檔佔位人物」兩種合法型態，見上方
  「如何新增人物」）
- 欄位型別
- `relationGroup`、`natureCategory`、`periodType` 等固定值
- `uncertaintyNote` 只能放在 `js/character.js` 真的會讀取的位置（事件層級、
  `overview.intro`、`romanceBio.historicalDifference`），不能放進
  `historicalBio[].content`／`romanceBio[].content` 內部——那兩個位置目前
  的渲染邏輯不會讀，寫了也不會顯示，schema 會擋下來
- `works`、`worksNote` 的使用條件
- `posthumousTitle` 若為物件，必須有 `title`
- 檔名是否與人物 `id` 一致（這項在交叉引用驗證器做，schema 本身看不到檔名）

**交叉引用驗證應檢查：**

- 人物 ID 是否重複
- `data/sources.json` 的來源 ID 是否重複
- `data/factions.json` 的 `filterGroups` ID 與 `actualFactions` ID 是否各自
  重複
- `data/index.json` 內部人物 ID 是否重複
- 所有 `sourceId` 是否存在
- 所有 `actualFactionId` 是否存在
- `personId` 是否指向有效人物
- `hideAvatar: true` 是否誤用在已建檔的具體人物階段（正確用法只給「東漢朝廷」
  這類非人物的抽象政治實體）
- 人物檔與索引中的姓名、頭像、發布狀態、陣營是否一致
- 文學虛構勢力是否誤用真實政權 ID
- `works` 為空時是否仍殘留只說「查無著作」的 `worksNote`

**`npm run render-test`（`scripts/render-test.js`）目前實際會自動檢查：**

- 首頁五個勢力入口卡片的人數，逐一跟 `data/index.json` 的實際統計精確比對
  （不是「非零就算過」——這條規則是複核時發現舊版測試把「多一個假人物連結」
  也判定通過才補上的）
- 每個 `faction.html?faction=xxx` 列出的人物 ID 清單，精確比對是否跟預期
  完全相同（同樣是精確比對，不是只看數量非零）
- 全部已發布人物的 `character.html?id=xxx` 能否無錯誤渲染
- 著作頁籤是否只在 `works.length > 0` 時出現
- 頁面存續期間發生的 JS 例外與未捕捉 Promise rejection——這些會被歸屬到
  正確的頁面並讓測試失敗，不會被籠統當成「殘留雜訊」而放行

**目前 `npm test`／`render-test.js` 還沒有自動測試、仍需人工或留待未來補強
的項目**（避免誤以為現有測試已經涵蓋全部畫面功能）：

- 全站快速搜尋的實際互動行為（輸入關鍵字、點結果是否正確導向）
- 來源缺漏警示（`source-chip--missing`）在畫面上實際出現的數量是否為零——
  驗證器有查 `sourceId` 是否存在於 `sources.json`，但那是資料層級的檢查，
  不是「畫面上真的沒有顯示警示標籤」的渲染層級確認
- 親屬排序（`relationGroup` 排序結果）與史實／文學徽章的視覺呈現是否正確
- `uncertaintyNote` 的畫面呈現位置與樣式
- 作品卡的摘要、引文、`fullText`、`excerpt` 等實際渲染內容是否正確
- CSS、圖片裁切、遮罩、顏色與響應式版面——這類需要人眼判斷「好不好看」的
  項目，schema／驗證器／渲染測試三者都無法取代實際瀏覽器視覺檢查

`scripts/build-character-index.js`（自動索引產生器）**尚未建立**，見下方「未來
規劃」的說明——目前 `filterGroup` 與 `searchTerms` 只存在 `data/index.json`，
還不能單純掃描人物檔自動產生索引。

## 本機開啟

網站透過 `fetch()` 讀取 JSON，不能直接雙擊 HTML 檔案開啟。可使用 VS Code Live
Server：

1. 安裝 Live Server 擴充套件。
2. 以 Live Server 開啟 `index.html`。
3. 瀏覽器進入本機 HTTP 網址後測試。

共用 JSON（`index.json`／`sources.json`／`factions.json`）目前使用
`sessionStorage` 快取 5 分鐘（見 `js/common.js` 的 `loadJsonCached`），資料更新
後若仍看到舊內容，可先關閉原分頁再重新開啟，或等 5 分鐘過期。**人物自己的
JSON 不快取**——那份內容才是使用者真正要看的，快取它會讓人搞不清楚看到的是不
是最新資料。首頁人物卡片另有 hover-prefetch（滑鼠移上去先背景抓一次該人物
JSON，讓瀏覽器自己快取），跟上述 5 分鐘 TTL 快取是兩套獨立機制。

## 協作與修改原則

本專案可能由使用者、史料整理者、內容校對者與程式開發者共同維護。任何工具或協
作者都應遵守：

- 先理解現有資料結構，再修改。
- 先搜尋既有 ID，再新增 ID。
- 不因大量格式化造成難以審查的無關差異。
- 不覆蓋已核對正確的內容。
- 不把猜測、遊戲設定或小說敘事寫成史實。
- 資料更動後同時檢查引用關係與實際畫面。
- 發現來源矛盾或需求不明時保留警語，不能靜默猜測。
- 不在 HTML 或 JavaScript 另建一份重複人物資料。
- 不引入與純靜態網站方向衝突的框架、登入、後端或資料庫架構。

## 已確立的架構決策

- 一位人物一份 JSON。
- `data/characters/` 維持扁平結構，暫不依最後效忠陣營拆資料夾。
- 首頁分類採單一 `filterGroup`；完整政治生涯由 `factionTimeline` 表達。
- 史實生平與演義生平分開。
- 親屬排序使用 `relationGroup`。
- 親屬性質使用 `natureCategory`，`natureType` 只作讀者說明。
- 無作品人物不顯示著作頁籤，`worksNote` 不用來顯示「沒有著作」。
- `uncertaintyNote` 必須放在渲染程式可讀取的事件外層。
- 人物內容只存在人物 JSON，前端不維護第二套內容資料。
- 首頁沒有「瀏覽全部人物」或跨勢力 pills 切換，快速搜尋是唯一跨勢力入口。
- 勢力色調一律與純黑混色，不與 `--ink` 混色。

## 目前收錄人物與狀態

目前 20 位人物**全部**達到 `dataStatus: "reviewed-draft"`（完整資料），沒有殘
留「空檔」佔位人物：

| id | 姓名 | filterGroup | 著作數 |
|---|---|---|---|
| zhao-yun | 趙雲 | 蜀漢 | 0 |
| liu-bei | 劉備 | 蜀漢 | 4 |
| zhuge-liang | 諸葛亮 | 蜀漢 | 6 |
| guan-yu | 關羽 | 蜀漢 | 0 |
| zhang-fei | 張飛 | 蜀漢 | 0 |
| ma-yunlu | 馬雲騄 | 蜀漢 | 0（《反三國演義》原創虛構人物，非正史；`historicalBio` 為空陣列） |
| huang-furen | 黃夫人 | 蜀漢 | 0（本名不詳，正史真實人物，主名採 `commonAlias`） |
| jiang-wei | 姜維 | 蜀漢 | 2 |
| fa-zheng | 法正 | 蜀漢 | 1 |
| guan-ping | 關平 | 蜀漢 | 0 |
| guan-xing | 關興 | 蜀漢 | 0 |
| zhang-liao | 張遼 | 曹魏 | 0 |
| cao-cao | 曹操 | 曹魏 | 8 |
| cao-pi | 曹丕 | 曹魏 | 3 |
| xiahou-dun | 夏侯惇 | 曹魏 | 0 |
| xiahou-yuan | 夏侯淵 | 曹魏 | 0 |
| zhou-yu | 周瑜 | 孫吳 | 2 |
| sun-ce | 孫策 | 孫吳 | 2 |
| sun-quan | 孫權 | 孫吳 | 2 |
| liu-xie | 劉協 | 東漢 | 0 |

分布：蜀漢 11 位、曹魏 5 位、孫吳 3 位、東漢 1 位、群雄 0 位。

另外還有一張頭像圖 `images/taishi_ci.png`（太史慈），是先準備好但還沒有對應
JSON 資料、也還沒加進 `index.json` 的狀態，等之後正式建檔。

## 未來規劃

### 近期（本輪處理中）

- ~~完成正式 JSON Schema。~~ 見 `schema/`（初版建立，複核後已修正多處鬆緊
  不當的地方，見上方「已捕捉錯誤」）
- ~~建立資料交叉引用驗證器與渲染測試機。~~ 見 `scripts/validate-data.js`、
  `scripts/render-test.js`（初版建立，複核後補上多項原本漏檢查的規則）
- ~~修正所有無作品人物的 `worksNote` 與著作頁籤邏輯。~~
- ~~修正 `overview.intro`／`romanceBio` 的 `uncertaintyNote` 從未被渲染的死
  欄位問題。~~
- 以驗證通過的人物檔自動產生 `data/index.json`——**尚未實作，見下方方案討論
  （第二版，已納入複核意見）**。
- 重跑全部人物與頁面的資料、連結及視覺驗收——schema／交叉引用／渲染測試三層
  已自動化，CSS／版面等視覺層仍待人工瀏覽器檢查（見上方「資料驗證」段落的
  「仍需人工或留待未來補強」清單）。

### 自動索引產生方案（待使用者核准，尚未實作）

目前 `filterGroup` 與 `searchTerms` 只存在 `data/index.json`，人物 JSON 本身
沒有這兩項，因此還不能在不改資料結構的情況下，單純掃描 `data/characters/*.json`
自動產生索引。

**這版方案是第二版**，比第一版多了兩個關鍵決策（複核時發現第一版少考慮的地方）：

1. **索引產生的範圍：全部人物都索引，不是只索引 `published: true`。**
   第一版原本打算只讓產生器輸出 `published: true` 的人物，但這樣會改變現有
   `data/index.json` 的語意——現在的索引本來就是「全部已建檔人物的輕量資料」，
   `published` 只是其中一個欄位，用來讓前端（`portal.js`／`listing.js`）決定
   要不要顯示、要不要建連結。如果產生器本身就先篩掉未發布的人物，之後想在
   `published: false` 狀態下先建好索引資料再逐步公開就做不到了。所以正確做法
   是：**產生器輸出全部人物**，篩選邏輯留在前端（現況已經是這樣，不用改前端）。

2. **索引順序：新增 `indexOrder` 欄位，不能只說「檔名字母順序」。**
   第一版寫「依檔名字母順序或沿用現有順序」，但這兩者其實不是同一件事——目前
   `data/index.json` 的實際順序（趙雲、劉備、諸葛亮…）明顯不是字母排序，而是
   手動排過、會影響首頁快速搜尋結果呈現順序的順序。要讓自動產生的結果完全不
   改變現有畫面呈現，必須把這個排序意圖也變成資料的一部分，而不是留給程式去
   猜。做法：
   - 在每位人物 JSON 最外層加入 `indexOrder`（整數，全站唯一）。
   - 產生器輸出時依 `indexOrder` 排序；`indexOrder` 相同（理論上不該發生，
     但防呆）時以 `id` 字母序當 tiebreaker，確保排序永遠是全序關係、結果穩定
     可重現。
   - 初始值可以直接照抄現有 `data/index.json` 的順序編號（1, 2, 3…），之後
     新增人物接續編號即可。

**完整方案：**

1. 將 `filterGroup`、`searchTerms`、`indexOrder` 移入每一位人物 JSON 最外層
   （與 `id`／`name` 同層）。
2. 新增 `scripts/build-character-index.js`：讀取**全部**通過 schema 驗證的人
   物檔（不篩 `published`），擷取 `id`／`published`／`name`／`courtesyName`／
   `searchTerms`／`avatar`／`filterGroup` 這幾個欄位，依 `indexOrder`（見上）
   排序後輸出 `data/index.json`。
3. 會修改到的檔案：全部 20 份人物 JSON（新增三個欄位）、新增
   `scripts/build-character-index.js`、同步更新
   `schema/character.schema.json` 加入這三個欄位的定義（`indexOrder` 需要
   `type: integer` 且全站唯一，唯一性檢查放在 `validate-data.js` 而非
   schema 本身，因為「跨檔案唯一」不是單一檔案的 schema 能表達的規則）。
4. 新增兩個 npm script，把「正式重建」跟「只檢查有沒有漂移」分開，方便接
   CI 或編輯前的快速檢查：
   - `npm run build:index`：實際重新產生並覆寫 `data/index.json`。
   - `npm run check:index`：只比對產生結果跟現有 `data/index.json` 是否一致，
     不寫檔；有落差就回傳非 0，提醒「人物檔改了但索引沒同步」。
5. 為確保輸出穩定、可重複執行且不影響現有首頁／搜尋／勢力頁／人物連結：腳本
   應為純函式（同樣輸入永遠得到同樣輸出）、排序完全依 `indexOrder`+`id` 這個
   全序關係、不依賴檔案系統回傳順序；實作後應先用 `check:index` 跟人工維護的
   現有 `index.json` 做逐欄位 diff 比對，確認零落差才正式切換成自動產生。

這項調整屬於資料結構變更，範圍涉及全部人物檔，需等使用者確認方案後才能實作，
本輪依然只更新方案、不搬移欄位。

### 中期

- 持續新增人物並補齊東漢、曹魏、蜀漢、孫吳與群雄陣營（`qunxiong` 目前 0 位）。
- 補充來源目錄的穩定查證連結與版本資訊。
- 補齊早期人物評價的白話解釋。
- 規劃後世虛構人物與多位歷史原型之間的連結方式。
- 改善人物、親屬、勢力與來源的交叉瀏覽。
- 太史慈：補上人物 JSON、加入 `index.json`。

### 長期

- 建立更完整的時間軸與歷史事件交叉索引。
- 建立人物關係網、勢力沿革與地理資訊視圖。
- 增加作品、評價與來源的專題瀏覽。
- 在不犧牲史料分層的前提下，逐步發展為可查詢的三國人物知識庫。

## 專案狀態

目前已收錄 20 位人物，全數為完整資料（無空檔佔位人物），資料、來源與勢力目錄
仍會持續擴充。實際發布名單以 `data/index.json` 與各人物的 `published` 狀態為
準。

本文件是系統與編輯規則的總覽。欄位的機器可驗證定義以 `schema/` 底下的 JSON
Schema 為準；若 README、schema、渲染程式與現有資料出現不一致，必須先查明差異
並同步修正，不可只改其中一處。
