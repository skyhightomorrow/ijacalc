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
    for (const r of rows) all.push({ ...r, payout: label });
    console.log(`${label}: ${rows.length}개`);
  }

  // 신규 파킹통장 감지: 직전 수집본과 비교
  const outPath = path.join(DATA_DIR, "parking-fsb.json");
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
