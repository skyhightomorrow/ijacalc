// 상품별 금리 변동 이력 복원·갱신
// data/parking-fsb.json · curated/parking-manual.json 의 git 커밋 이력을 훑어
// 상품(은행|상품명)별 (날짜, 기본금리, 최고금리) 변경점만 추린 data/rate-history.json 을 만든다.
// 매 실행마다 전체 이력을 다시 계산하므로 append 상태 관리가 필요 없다 (커밋 수백 개까지는 수 초).
// 사용법: node scripts/build-rate-history.js  (build-site-data.js 이전/이후 무관, daily 파이프라인에 포함)

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "rate-history.json");
const FILES = ["data/parking-fsb.json", "curated/parking-manual.json"];

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
}

// 두 파일 중 하나라도 바뀐 커밋 목록 (오래된 것부터)
const commits = git(["log", "--reverse", "--format=%H|%cI", "--", ...FILES])
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    const [sha, iso] = l.split("|");
    // KST 날짜로 환산 (커밋 타임스탬프는 TZ 포함 ISO)
    const kst = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
    return { sha, date: kst.toISOString().slice(0, 10) };
  });

function parseProducts(raw) {
  try {
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : j.products || [];
  } catch {
    return [];
  }
}

function productsAt(sha, file) {
  // sha가 null이면 작업 트리의 현재 파일 (당일 수집분 — 아직 커밋 전이라 git 이력에 없다)
  if (sha === null) {
    const fp = path.join(ROOT, file);
    return fs.existsSync(fp) ? parseProducts(fs.readFileSync(fp, "utf8")) : [];
  }
  try {
    return parseProducts(git(["show", `${sha}:${file}`]));
  } catch {
    return []; // 그 시점에 파일이 없던 경우
  }
}

// 날짜별 스냅샷 (같은 날 커밋 여러 개면 마지막 것이 남음)
// 마지막에 작업 트리 현재 상태를 오늘 날짜로 추가 — 당일 수집분이 커밋 전에도 이력에 잡힌다
const todayKST = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
commits.push({ sha: null, date: todayKST });
const byDate = new Map();
for (const { sha, date } of commits) {
  const snap = new Map();
  for (const file of FILES) {
    const isFsb = file.includes("parking-fsb");
    for (const p of productsAt(sha, file)) {
      if (!p.bank || !p.product) continue;
      // build-site-data.js와 동일한 은행명 정규화 — fsb 공시 은행명에는 "저축은행"을 붙인다
      const bank = isFsb && !p.bank.includes("저축은행") ? p.bank + "저축은행" : p.bank;
      snap.set(`${bank}|${p.product}`, {
        base: p.baseRate ?? null,
        max: p.maxRate ?? null,
      });
    }
  }
  if (snap.size) byDate.set(date, snap);
}

// 상품별 변경점 압축: 첫 관측 + base/max가 직전과 달라진 날만 기록
const products = {};
const dates = [...byDate.keys()].sort();
for (const date of dates) {
  for (const [key, { base, max }] of byDate.get(date)) {
    const series = (products[key] ||= []);
    const prev = series[series.length - 1];
    if (!prev || prev.base !== base || prev.max !== max) {
      series.push({ d: date, base, max });
    }
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  since: dates[0] || null,
  lastDate: dates[dates.length - 1] || null,
  products,
};
fs.writeFileSync(OUT, JSON.stringify(out));

const changed = Object.values(products).filter((s) => s.length > 1).length;
console.log(
  `rate-history: 상품 ${Object.keys(products).length}개 · 관측 ${dates.length}일 (${out.since}~${out.lastDate}) · 변동 이력 있는 상품 ${changed}개 → data/rate-history.json`
);
