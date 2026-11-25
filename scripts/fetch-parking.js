// 저축은행중앙회 입출금자유예금(파킹통장) 공시 수집
// 지급방식 코드별로 조회해서 상품에 지급방식을 태깅한다.
// 산출물: data/parking-fsb.json

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const URL = "https://www.fsb.or.kr/ratanym_0100_01.act";

const PAYOUT_CODES = {
  1: "수시지급",
  2: "월지급",
  3: "분기지급",
  4: "반기지급",
  5: "연지급",
  6: "기타",
};

function buildBody(payoutCode) {
  const params = new URLSearchParams();
  params.append("ORDERBY", "RATE_HIGH2 DESC");
  params.append("RATE_HIGH", "0");
  params.append("DEPO_INTS_PRVS_MTHD_CD", String(payoutCode));
  for (const loc of ["1", "2", "3", "4", "5", "9"]) params.append("JOIN_LOCATION", loc);
  return params.toString();
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseRows(html) {
  const rows = [];
  const trs = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  for (const tr of trs) {
    if (tr.includes("no-data") || tr.includes("<th")) continue;
    const cells = (tr.match(/<td[\s\S]*?<\/td>/g) || []).map(stripTags);
    if (cells.length < 6) continue;
    rows.push({
      bank: cells[0],
      product: cells[1],
      baseRate: parseFloat(cells[2]) || null,
      maxRate: parseFloat(cells[3]) || null,
      maxRateCondition: cells[4],
      disclosedAt: cells[5],
    });
  }
  return rows;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const all = [];

  for (const [code, label] of Object.entries(PAYOUT_CODES)) {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildBody(code),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} (지급방식 ${label})`);
    const html = await res.text();
    const rows = parseRows(html);
    if (rows.length === 0 && !html.includes("no-data")) {
      // 2026-11-24부터 CI(해외 IP)에서만 200 + 0행이 나온다. 응답이 무엇인지 남긴다.
      const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
      console.warn(`  ⚠️ ${label}: 표 없음 — 길이 ${html.length}, title="${title.trim()}", 앞부분: ${stripTags(html).slice(0, 200)}`);
    }
    for (const r of rows) all.push({ ...r, payout: label });
    console.log(`${label}: ${rows.length}개`);
  }

  // 신규 파킹통장 감지: 직전 수집본과 비교
  const outPath = path.join(DATA_DIR, "parking-fsb.json");

  // 수집이 통째로 비면 0개로 덮어쓰지 않는다(페이지 158개가 사라지고 빌드가 멈춘다).
  // 직전 수집본이 3일 이내면 그대로 두고 나머지 일일 갱신은 진행, 더 오래되면 실패시켜 알린다.
  if (all.length === 0) {
    const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : null;
    const ageH = prev ? (Date.now() - new Date(prev.fetchedAt).getTime()) / 36e5 : Infinity;
    if (prev && (prev.products || []).length && ageH <= 72) {
      console.warn(`⚠️ 저축은행중앙회 수집 0개 — 직전 수집본(${prev.fetchedAt}, ${Math.round(ageH)}시간 전) 유지`);
      return;
    }
    throw new Error(`저축은행중앙회 수집 0개, 직전 수집본도 ${prev ? Math.round(ageH) + "시간 전" : "없음"} — 중단`);
  }
  if (fs.existsSync(outPath)) {
    const prev = JSON.parse(fs.readFileSync(outPath, "utf8"));
    const prevKeys = new Set((prev.products || []).map((p) => `${p.bank}:${p.product}`));
    const fresh = all.filter((p) => !prevKeys.has(`${p.bank}:${p.product}`));
    fs.writeFileSync(
      path.join(DATA_DIR, "parking-new.json"),
      JSON.stringify({ detectedAt: new Date().toISOString(), products: fresh }, null, 2)
    );
    console.log(`신규 파킹통장: ${fresh.length}개`);
  }

  const out = { fetchedAt: new Date().toISOString(), source: "저축은행중앙회 소비자포털", products: all };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`저장 완료: data/parking-fsb.json (총 ${all.length}개)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
