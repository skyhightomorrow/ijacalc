// 금융감독원 금융상품한눈에 오픈API 수집 스크립트
// 사용법: npm run fetch
// 산출물:
//   data/latest.json        오늘 수집한 전체 상품 (상품별 금리 옵션 포함)
//   data/new-products.json  직전 수집본에 없던 신규 상품 목록
//   data/history/           날짜별 스냅샷 보관

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const HISTORY_DIR = path.join(DATA_DIR, "history");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  const env = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }
  return env;
}

const API_KEY = loadEnv().FINLIFE_API_KEY || process.env.FINLIFE_API_KEY;
if (!API_KEY) {
  console.error("FINLIFE_API_KEY가 없습니다. .env 파일을 확인하세요.");
  process.exit(1);
}

const BASE = "https://finlife.fss.or.kr/finlifeapi";

// topFinGrpNo: 020000 은행, 030300 저축은행
const TARGETS = [
  { kind: "deposit", endpoint: "depositProductsSearch", group: "020000", groupName: "은행" },
  { kind: "deposit", endpoint: "depositProductsSearch", group: "030300", groupName: "저축은행" },
  { kind: "saving", endpoint: "savingProductsSearch", group: "020000", groupName: "은행" },
  { kind: "saving", endpoint: "savingProductsSearch", group: "030300", groupName: "저축은행" },
  { kind: "mortgageLoan", endpoint: "mortgageLoanProductsSearch", group: "020000", groupName: "은행" },
  { kind: "rentLoan", endpoint: "rentHouseLoanProductsSearch", group: "020000", groupName: "은행" },
  { kind: "creditLoan", endpoint: "creditLoanProductsSearch", group: "020000", groupName: "은행" },
  { kind: "creditLoan", endpoint: "creditLoanProductsSearch", group: "030300", groupName: "저축은행" },
];

async function fetchAllPages(endpoint, group) {
  const products = [];
  const options = [];
  let page = 1;
  let maxPage = 1;
  do {
    const url = `${BASE}/${endpoint}.json?auth=${API_KEY}&topFinGrpNo=${group}&pageNo=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} (${endpoint} ${group} p${page})`);
    const json = await res.json();
    const r = json.result;
    if (r.err_cd !== "000") throw new Error(`API 오류 ${r.err_cd}: ${r.err_msg} (${endpoint} ${group})`);
    products.push(...(r.baseList || []));
    options.push(...(r.optionList || []));
    maxPage = r.max_page_no || 1;
    page++;
  } while (page <= maxPage);
  return { products, options };
}

function productKey(p) {
  return `${p.fin_co_no}:${p.fin_prdt_cd}`;
}

function mergeOptions(products, options) {
  const byKey = new Map();
  for (const p of products) byKey.set(productKey(p), { ...p, options: [] });
  for (const o of options) {
    const entry = byKey.get(productKey(o));
    if (entry) entry.options.push(o);
  }
  return [...byKey.values()];
}

async function main() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });

  const result = { fetchedAt: new Date().toISOString(), products: {} };

  for (const t of TARGETS) {
    const label = `${t.kind}/${t.groupName}`;
    try {
      const { products, options } = await fetchAllPages(t.endpoint, t.group);
      const merged = mergeOptions(products, options).map((p) => ({
        ...p,
        _kind: t.kind,
        _group: t.groupName,
      }));
      result.products[`${t.kind}_${t.group}`] = merged;
      console.log(`${label}: ${merged.length}개 상품`);
    } catch (e) {
      // 한 카테고리가 실패해도 나머지는 계속 수집
      console.error(`${label} 수집 실패: ${e.message}`);
      result.products[`${t.kind}_${t.group}`] = null;
    }
  }

  // 신규 상품 감지: 직전 latest.json과 비교
  const latestPath = path.join(DATA_DIR, "latest.json");
  const newProducts = [];
  if (fs.existsSync(latestPath)) {
    const prev = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    for (const [cat, list] of Object.entries(result.products)) {
      if (!list) continue;
      const prevList = prev.products?.[cat];
      if (!prevList) continue; // 이전 수집이 실패한 카테고리는 비교 불가
      const prevKeys = new Set(prevList.map(productKey));
      for (const p of list) {
        if (!prevKeys.has(productKey(p))) newProducts.push(p);
      }
    }
    fs.writeFileSync(
      path.join(DATA_DIR, "new-products.json"),
      JSON.stringify({ detectedAt: result.fetchedAt, products: newProducts }, null, 2)
    );
    console.log(`신규 상품: ${newProducts.length}개`);
  } else {
    console.log("첫 수집 — 신규 상품 비교는 다음 수집부터 가능합니다.");
  }

  fs.writeFileSync(latestPath, JSON.stringify(result, null, 2));
  const stamp = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST 기준 날짜
  fs.writeFileSync(path.join(HISTORY_DIR, `${stamp}.json`), JSON.stringify(result));
  console.log(`저장 완료: data/latest.json, data/history/${stamp}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
