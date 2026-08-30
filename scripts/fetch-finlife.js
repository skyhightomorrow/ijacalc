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

  // 직전 수집본 — 카테고리 수집이 실패했을 때 어제 값을 이어받는 데 쓴다.
  // 🔴 왜 이게 필요한가(2026-08-30 규명): 예전에는 실패한 카테고리를 null로 넣고 그대로 덮어썼다.
  //    금감원 API가 통째로 죽으면 6개 카테고리가 전부 null이 되고, build-pages.js의
  //    `if (LATEST && LATEST.products)`가 조용히 통과해 **파킹 상품이 없는 은행 47곳**
  //    (카카오뱅크·케이뱅크·신한·하나·국민·농협 등)이 /bank/ 페이지를 통째로 잃었다.
  //    Actions는 그 삭제를 그대로 커밋·배포했다 — 에러도 빌드 실패도 없이 라이브가 404가 됐다.
  //    실제로 8/7·8/11·8/28 **세 번** 재발했고 매번 정확히 같은 47개였다.
  //    ⛔ 그러므로 수집 실패분을 절대 null로 덮어쓰지 말 것. 어제 값이 낡은 건 괜찮지만,
  //       페이지가 사라지는 건 괜찮지 않다(네이버 웹문서 TOP10에 오른 자산이다).
  const latestPath = path.join(DATA_DIR, "latest.json");
  let prev = null;
  try {
    prev = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  } catch {
    prev = null;
  }

  let ok = 0;
  const carried = [];
  const lost = [];
  for (const t of TARGETS) {
    const key = `${t.kind}_${t.group}`;
    const label = `${t.kind}/${t.groupName}`;
    try {
      const { products, options } = await fetchAllPages(t.endpoint, t.group);
      const merged = mergeOptions(products, options).map((p) => ({
        ...p,
        _kind: t.kind,
        _group: t.groupName,
      }));
      result.products[key] = merged;
      ok++;
      console.log(`${label}: ${merged.length}개 상품`);
    } catch (e) {
      // 한 카테고리가 실패해도 나머지는 계속 수집한다. 단 실패분은 **직전 값을 이어받는다**.
      const fallback = prev && prev.products ? prev.products[key] : null;
      if (fallback && fallback.length) {
        result.products[key] = fallback;
        carried.push(`${label}(${fallback.length})`);
        console.error(`${label} 수집 실패 → 직전 값 유지 (${fallback.length}개): ${e.message}`);
      } else {
        result.products[key] = null;
        lost.push(label);
        console.error(`${label} 수집 실패 · 이어받을 직전 값도 없음: ${e.message}`);
      }
    }
  }
  if (carried.length) console.warn(`⚠️ 직전 값 유지: ${carried.join(", ")}`);

  // 전 카테고리 실패 = API 자체가 죽은 것. 이럴 땐 조용히 넘어가지 말고 소리 나게 실패시킨다.
  // (직전 값을 이어받아 데이터는 지켜지지만, 원인을 모른 채 며칠씩 낡은 값이 나가는 걸 막는다.)
  if (ok === 0) {
    console.error(`전 카테고리(${TARGETS.length}개) 수집 실패 — 금감원 API 장애로 판단.`);
    if (lost.length === TARGETS.length) {
      console.error("이어받을 직전 값도 없어 latest.json을 쓰지 않고 중단합니다.");
      process.exit(1);
    }
    console.error("직전 값을 유지한 채 중단합니다 — latest.json은 건드리지 않습니다.");
    process.exit(1);
  }

  // 신규 상품 감지: 직전 latest.json(위에서 읽어 둔 prev)과 비교
  const newProducts = [];
  if (prev) {
    for (const [cat, list] of Object.entries(result.products)) {
      if (!list) continue;
      const prevList = prev.products?.[cat];
      if (!prevList) continue; // 이전 수집이 실패한 카테고리는 비교 불가
      // 직전 값을 그대로 이어받은 카테고리는 비교해 봐야 항상 0건이라 건너뛴다
      if (list === prevList) continue;
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
