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

// 옆에서 가볍게 말 거는 톤의 오프닝 — 날마다 돌아가며 써서 봇 티를 줄인다
const HOOKS = [
  "통장에 애매하게 남는 돈 있으면\n그냥 두지 말고 파킹통장에 넣어둬요.\n하루만 맡겨도 이자 붙어서, 최소 밥값은 나와요 🍚",
  "월급 들어오고 아직 안 쓴 돈,\n그냥 통장에 두면 이자 거의 0원이에요.\n파킹통장에 잠깐 옮겨두면 하루치라도 챙겨요.",
  "비상금이나 어디 넣기 애매한 돈,\n파킹통장에 두면 매일 이자가 붙어요.\n같이 가볍게 굴려봐요 🙂",
  "은행에 그냥 둔 목돈, 하루에 이자 얼마 붙는지 아세요?\n파킹통장으로 옮기면 밥 한 끼 값은 나와요.",
  "노는 돈은 하루라도 놀리면 아까워요.\n파킹통장은 넣고 빼는 것도 자유라 부담 없어요.",
];

function composePost() {
  const top = DATA.parking
    .filter((p) => p.instant)
    .map((p) => ({ p, calc: R.calcDaily(p, AMT) }))
    .sort((a, b) => b.calc.daily - a.calc.daily)
    .slice(0, 3);

  if (top.length < 3) throw new Error("바로이자 상품이 3개 미만 — 데이터 이상");

  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  const dateStr = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
  // 연중 일수로 오프닝을 순환 (결정적 — 같은 날은 항상 같은 문구)
  const dayOfYear = Math.floor((kst - new Date(Date.UTC(kst.getUTCFullYear(), 0, 0))) / 86400000);
  const hook = HOOKS[dayOfYear % HOOKS.length];
  const medals = ["🥇", "🥈", "🥉"];

  const lines = top.map(({ p, calc }, i) =>
    `${medals[i]} ${p.bank} ${p.product}\n   연 ${p.maxRate.toFixed(2)}% · 하루 +${Math.floor(calc.daily).toLocaleString()}원`
  );

  return [
    hook,
    ``,
    `📌 오늘의 파킹통장 TOP3 (${dateStr})`,
    `1,000만원 넣으면 세후 하루 이자`,
    ``,
    lines.join("\n"),
    ``,
    `내 금액으론 얼마인지 여기서 계산 👉 ${SITE}`,
    ``,
    `#파킹통장 #짠테크 #재테크`,
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
