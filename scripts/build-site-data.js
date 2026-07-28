// 수집 데이터(금감원 API + 저축은행 공시 + 수동 큐레이션)를 UI용 public/data.json으로 변환
// 사용법: node scripts/build-site-data.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

function readJson(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

const finlife = readJson(path.join(DATA_DIR, "latest.json"));
const parkingFsb = readJson(path.join(DATA_DIR, "parking-fsb.json"));
const parkingManual = readJson(path.join(ROOT, "curated", "parking-manual.json"));
const newProductsRaw = readJson(path.join(DATA_DIR, "new-products.json"));
const parkingNewRaw = readJson(path.join(DATA_DIR, "parking-new.json"));

if (!finlife) {
  console.error("data/latest.json이 없습니다. 먼저 npm run fetch를 실행하세요.");
  process.exit(1);
}

// ---- 파킹통장: 수시지급(바로 이자) 상품 + 그 외 고금리 파킹 ----
const parking = [];

// enrichOnly 항목은 상품을 새로 만들지 않고, 공시에 있는 같은 상품에 메타데이터만 얹는다.
// (금리는 매일 갱신되는 공시를 따르고, 앱 링크·이자 수령방식처럼 공시에 없는 정보만 수동 관리)
const enrichments = new Map(
  (parkingManual?.products || [])
    .filter((p) => p.enrichOnly && p.matchProduct)
    .map((p) => [p.matchProduct.replace(/\s+/g, ""), p])
);

for (const p of parkingManual?.products || []) {
  if (p.enrichOnly) continue;
  parking.push({
    bank: p.bank,
    product: p.product,
    baseRate: p.baseRate,
    maxRate: p.maxRate,
    maxRateCondition: p.maxRateCondition,
    payout: p.payout,
    timing: p.timing || "",
    linkUrl: p.sourceUrl || null,
    appAndroid: p.appAndroid || null,
    appIos: p.appIos || null,
    group: p.group,
    instant: p.payout === "매일 자동" || p.payout === "수시지급",
    asOf: parkingManual.asOf,
    needsVerify: !!p.needsVerify,
  });
}

const norm = (s) => (s || "").replace(/\s+/g, "");
const manualNames = new Set(
  (parkingManual?.products || []).filter((p) => !p.enrichOnly).map((p) => norm(p.product))
);

for (const p of parkingFsb?.products || []) {
  // 큐레이션에 이미 있는 상품(상품명 기준)은 중복 방지
  if (manualNames.has(norm(p.product))) continue;
  const bankFull = p.bank + (p.bank.includes("저축은행") ? "" : "저축은행");
  const e = enrichments.get(norm(p.product));
  const payout = e?.payout || p.payout;
  parking.push({
    bank: bankFull,
    product: p.product,
    baseRate: p.baseRate,
    maxRate: p.maxRate,
    maxRateCondition: p.maxRateCondition,
    payout,
    timing: e?.timing || (payout === "수시지급" ? "자정 잔액 기준 계산, 다음날부터 수시 수령" : ""),
    linkUrl: e?.sourceUrl || `https://search.naver.com/search.naver?query=${encodeURIComponent(bankFull + " " + p.product)}`,
    appAndroid: e?.appAndroid || null,
    appIos: e?.appIos || null,
    group: "저축은행",
    instant: payout === "수시지급",
    asOf: (parkingFsb.fetchedAt || "").slice(0, 10),
    needsVerify: false,
  });
}

// ---- 구간별 차등금리·우대조건 수동 큐레이션 병합 ----
// 공시(저축은행중앙회·금감원)는 최고/기본 금리와 한도조건 문자열만 준다.
// 실제 파킹통장은 금액 구간마다 금리가 달라서 한도 초과분 이자가 계산에서 빠지는 문제가 있었다.
// ⚠️ 공시와 최고/기본 금리가 어긋나는 큐레이션은 **버린다** — 공시는 매일 갱신되지만 기사·블로그는 낡을 수 있다.
{
  const tierFile = path.join(ROOT, "curated", "parking-tiers.json");
  const curated = fs.existsSync(tierFile) ? JSON.parse(fs.readFileSync(tierFile, "utf8")) : { tiers: {}, conditionsOnly: {} };
  let applied = 0, rejected = 0, condOnly = 0;
  for (const p of parking) {
    const key = `${p.bank}|${p.product}`;
    const t = curated.tiers?.[key];
    if (t) {
      // 큐레이션 구간의 최고금리가 공시 최고금리와 다르면 신뢰하지 않는다
      const tierMax = Math.max(...t.tiers.map((x) => x.rate || 0));
      if (Math.abs(tierMax - (p.maxRate ?? 0)) > 0.001) {
        console.warn(`  ⚠️ 구간금리 불일치로 제외: ${key} (큐레이션 최고 ${tierMax}% vs 공시 ${p.maxRate}%)`);
        rejected++;
      } else {
        p.tiers = t.tiers;
        p.conditionFree = t.conditionFree;
        p.conditions = t.conditions;
        if (t.notice) p.notice = t.notice; // 판매중단·가입대상 제한 등 가입 전 알아야 할 사실
        p.tierSource = { url: t.sourceUrl, name: t.sourceName, verified: t.verified };
        applied++;
      }
    }
    const c = curated.conditionsOnly?.[key];
    if (c && !p.conditions) {
      p.conditionFree = c.conditionFree;
      p.conditions = c.conditions;
      if (c.notice) p.notice = c.notice;
      p.tierSource = { url: c.sourceUrl, name: c.sourceName, verified: c.verified };
      condOnly++;
    }
  }
  console.log(`구간금리 큐레이션: 적용 ${applied}개 · 조건만 ${condOnly}개${rejected ? ` · 불일치 제외 ${rejected}개` : ""}`);
}

parking.sort((a, b) => (b.instant - a.instant) || (b.maxRate ?? 0) - (a.maxRate ?? 0));

// ---- 예금/적금 랭킹: 12개월 최고우대금리 기준 ----
function topRates(kind, limit = 15) {
  const lists = [
    ...(finlife.products[`${kind}_020000`] || []),
    ...(finlife.products[`${kind}_030300`] || []),
  ];
  const rows = [];
  for (const p of lists) {
    const opt12 = (p.options || []).filter((o) => o.save_trm === "12");
    if (!opt12.length) continue;
    const best = opt12.reduce((a, b) => ((b.intr_rate2 ?? 0) > (a.intr_rate2 ?? 0) ? b : a));
    rows.push({
      bank: p.kor_co_nm,
      product: p.fin_prdt_nm,
      group: p._group,
      baseRate: best.intr_rate,
      maxRate: best.intr_rate2,
      rateType: best.intr_rate_type_nm,
      reserveType: best.rsrv_type_nm || null,
      joinWay: p.join_way,
      specialCondition: p.spcl_cnd === "해당사항 없음" ? null : p.spcl_cnd,
      maxLimit: p.max_limit,
      disclosureMonth: p.dcls_month,
    });
  }
  rows.sort((a, b) => (b.maxRate ?? 0) - (a.maxRate ?? 0));
  return rows.slice(0, limit);
}

// ---- 신규 상품 (예적금 + 파킹통장) ----
const newProducts = (newProductsRaw?.products || []).map((p) => ({
  bank: p.kor_co_nm,
  product: p.fin_prdt_nm,
  kind: p._kind,
  group: p._group,
  disclosureStart: p.dcls_strt_day,
  maxRate: Math.max(0, ...(p.options || []).map((o) => o.intr_rate2 ?? 0)) || null,
}));
for (const p of parkingNewRaw?.products || []) {
  newProducts.push({
    bank: p.bank + (p.bank.includes("저축은행") ? "" : "저축은행"),
    product: p.product,
    kind: "parking",
    group: "저축은행",
    disclosureStart: p.disclosedAt,
    maxRate: p.maxRate,
  });
}

// ---- 대출: 상품별 최저금리 낮은 순 ----
function loanRanking(kind, limit = 10) {
  const lists = [
    ...(finlife.products[`${kind}_020000`] || []),
    ...(finlife.products[`${kind}_030300`] || []),
  ];
  const rows = [];
  for (const p of lists) {
    const opts = p.options || [];
    if (!opts.length) continue;
    let minRate = null, maxRate = null, avgRate = null, detail = "";
    if (kind === "creditLoan") {
      const withAvg = opts.filter((o) => o.crdt_grad_avg != null);
      if (!withAvg.length) continue;
      const best = withAvg.reduce((a, b) => (b.crdt_grad_avg < a.crdt_grad_avg ? b : a));
      minRate = best.crdt_grad_1 ?? null;
      avgRate = best.crdt_grad_avg;
      detail = best.crdt_lend_rate_type_nm || "";
    } else {
      const withMin = opts.filter((o) => o.lend_rate_min != null);
      if (!withMin.length) continue;
      const best = withMin.reduce((a, b) => (b.lend_rate_min < a.lend_rate_min ? b : a));
      minRate = best.lend_rate_min;
      maxRate = best.lend_rate_max;
      avgRate = best.lend_rate_avg ?? null;
      detail = [best.mrtg_type_nm, best.lend_rate_type_nm, best.rpay_type_nm].filter(Boolean).join(" · ");
    }
    rows.push({ bank: p.kor_co_nm, product: p.fin_prdt_nm, group: p._group, minRate, maxRate, avgRate, detail });
  }
  rows.sort((a, b) => (a.minRate ?? a.avgRate ?? 99) - (b.minRate ?? b.avgRate ?? 99));
  return rows.slice(0, limit);
}

const out = {
  builtAt: new Date().toISOString(),
  finlifeFetchedAt: finlife.fetchedAt,
  finlifeDisclosureMonth: (() => {
    for (const list of Object.values(finlife.products)) {
      if (list?.length) return list[0].dcls_month;
    }
    return null;
  })(),
  parking,
  newProducts,
  topDeposits: topRates("deposit"),
  topSavings: topRates("saving"),
  loans: {
    mortgage: loanRanking("mortgageLoan"),
    rent: loanRanking("rentLoan"),
    credit: loanRanking("creditLoan"),
  },
};

fs.writeFileSync(path.join(ROOT, "public", "data.json"), JSON.stringify(out, null, 2));
console.log(
  `빌드 완료: 파킹 ${out.parking.length}개 (바로이자 ${out.parking.filter((p) => p.instant).length}개), ` +
    `신규 ${out.newProducts.length}개, 예금 ${out.topDeposits.length}개, 적금 ${out.topSavings.length}개`
);
