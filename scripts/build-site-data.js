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

for (const p of parkingManual?.products || []) {
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
const manualNames = new Set((parkingManual?.products || []).map((p) => norm(p.product)));

for (const p of parkingFsb?.products || []) {
  // 큐레이션에 이미 있는 상품(상품명 기준)은 중복 방지
  if (manualNames.has(norm(p.product))) continue;
  const bankFull = p.bank + (p.bank.includes("저축은행") ? "" : "저축은행");
  parking.push({
    bank: bankFull,
    product: p.product,
    baseRate: p.baseRate,
    maxRate: p.maxRate,
    maxRateCondition: p.maxRateCondition,
    payout: p.payout,
    timing: p.payout === "수시지급" ? "자정 잔액 기준 계산, 다음날부터 수시 수령" : "",
    linkUrl: `https://search.naver.com/search.naver?query=${encodeURIComponent(bankFull + " " + p.product)}`,
    group: "저축은행",
    instant: p.payout === "수시지급",
    asOf: (parkingFsb.fetchedAt || "").slice(0, 10),
    needsVerify: false,
  });
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
