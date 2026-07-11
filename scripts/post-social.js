// 오늘의 파킹통장 TOP3를 스레드(Threads)에 자동 포스팅
// 실행: node scripts/post-social.js  (data.json 빌드 이후)
//
// 필요 환경변수 (없으면 드라이런 — 포스트 내용만 출력하고 성공 종료):
//   THREADS_ACCESS_TOKEN 장기 액세스 토큰 (60일 유효 — 만료 전 재발급 필요)
//                        사용자 ID는 이 토큰에서 /me 로 자동 조회하므로 별도 시크릿 불필요.
//
// 포스팅 시간은 .github/workflows/social.yml 의 cron이 결정한다 (08:00 KST).

const fs = require("fs");
const path = require("path");

const PUB = path.join(__dirname, "..", "public");
const R = require(path.join(PUB, "render-card.js"));
const DATA = JSON.parse(fs.readFileSync(path.join(PUB, "data.json"), "utf8"));

const AMT = 10000000; // 1,000만원 기준
const SITE = "https://ijacalc.com";

function composePost() {
  const top = DATA.parking
    .filter((p) => p.instant)
    .map((p) => ({ p, calc: R.calcDaily(p, AMT) }))
    .sort((a, b) => b.calc.daily - a.calc.daily)
    .slice(0, 3);

  if (top.length < 3) throw new Error("바로이자 상품이 3개 미만 — 데이터 이상");

  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const dateStr = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
  const medals = ["🥇", "🥈", "🥉"];

  const lines = top.map(({ p, calc }, i) =>
    `${medals[i]} ${p.bank} ${p.product}\n   연 ${p.maxRate.toFixed(2)}% · 하루 +${Math.floor(calc.daily).toLocaleString()}원`
  );

  return [
    `📊 오늘의 파킹통장 TOP3 (${dateStr})`,
    ``,
    `1,000만원 기준 · 세후 하루 이자`,
    ``,
    lines.join("\n"),
    ``,
    `내 금액으로 계산 + 전체 순위 👉 ${SITE}`,
    ``,
    `#파킹통장 #금리비교 #재테크 #이자계산기`,
  ].join("\n");
}

async function postToThreads(text) {
  const token = process.env.THREADS_ACCESS_TOKEN;

  // 0) 토큰에서 사용자 ID 자동 조회 (별도 시크릿 불필요)
  const meRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${token}`);
  const me = await meRes.json();
  if (!meRes.ok || !me.id) throw new Error(`사용자 ID 조회 실패: ${JSON.stringify(me)}`);
  const base = `https://graph.threads.net/v1.0/${me.id}`;

  // 1) 미디어 컨테이너 생성
  const createRes = await fetch(`${base}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ media_type: "TEXT", text, access_token: token }),
  });
  const created = await createRes.json();
  if (!createRes.ok || !created.id) throw new Error(`컨테이너 생성 실패: ${JSON.stringify(created)}`);

  // 2) 발행
  const pubRes = await fetch(`${base}/threads_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: created.id, access_token: token }),
  });
  const published = await pubRes.json();
  if (!pubRes.ok || !published.id) throw new Error(`발행 실패: ${JSON.stringify(published)}`);
  return published.id;
}

(async () => {
  const text = composePost();
  console.log("--- 포스트 내용 ---\n" + text + "\n-------------------");
  console.log(`길이: ${text.length}자 (Threads 한도 500자)`);

  if (!process.env.THREADS_ACCESS_TOKEN) {
    console.log("THREADS_ACCESS_TOKEN 없음 → 드라이런 종료 (포스팅 안 함)");
    return;
  }
  const id = await postToThreads(text);
  console.log(`Threads 발행 완료: ${id}`);
})().catch((e) => {
  console.error("post-social 실패:", e.message);
  process.exit(1);
});
