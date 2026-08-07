/**
 * faction-portal-meta.js — 首頁「勢力入口」用的敘事中繼資料
 * 只放跟 factions.json 的 filterGroup id 對應的「敘事層」資訊（君主、格言、代表肖像），
 * 不重複放人物清單或人數 —— 人數是從 data/index.json 即時算出來的，避免跟正式資料脫鉤。
 */
const FACTION_PORTAL_META = {
  donghan: {
    mark: "漢",
    label: "東漢",
    ruler: "劉協",
    motto: "四百年治終將亂，帝星黯淡暮色沉。",
    portrait: "images/liu_xie_main.png",
  },
  wei: {
    mark: "魏",
    label: "曹魏",
    ruler: "曹操",
    motto: "唯才是舉納群賢，魏武揮鞭傲中原。",
    portrait: "images/cao_cao_main.png",
  },
  shu: {
    mark: "蜀",
    label: "蜀漢",
    ruler: "劉備",
    motto: "義膽忠魂扶漢志，凌雲揮戈挽山河。",
    portrait: "images/liu_bei_main.png",
  },
  wu: {
    mark: "吳",
    label: "孫吳",
    ruler: "孫權",
    motto: "江東才俊領風騷，赤壁雄兵火連天。",
    portrait: "images/sun_quan_main.png",
  },
  qunxiong: {
    mark: "群",
    label: "群雄",
    // 群雄沒有單一君主，不像其他四個陣營有明確的主君，
    // ruler 留空、渲染時不顯示這行小標籤（portal.js／listing.js 已對應處理）
    ruler: "",
    motto: "逐鹿天下無常主，虎嘯龍吟各一方。",
    portrait: null,
  },
};

// 首頁固定顯示這五個入口，順序固定（不管 factions.json 順序如何變動）
// 第一排：曹魏／蜀漢／孫吳（有實際人物的三國正統陣營）
// 第二排：東漢／群雄（目前還沒有人物，先佔位）
const FACTION_PORTAL_ORDER = ["wei", "shu", "wu", "donghan", "qunxiong"];