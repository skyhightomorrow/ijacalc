// 정적 HTML 페이지 생성 (SEO)
// public/data.json을 읽어 완성된 HTML을 생성한다:
//   index.html            메인 — 바로이자 카드 프리렌더 + 계산기 하이드레이션
//   calculator.html        예금·적금·파킹 이자계산기 ("이자계산기" 키워드 타겟)
//   p/<슬러그>.html        파킹통장 상품별 상세 페이지
//   rates.html             예·적금 금리 순위 (통합)
//   loans.html             대출 금리 (상단 버튼으로만 진입, 금감원 공시 안내 포함)
//   new.html               새로 나온 상품
//   sitemap.xml, robots.txt
// 사용법: node scripts/build-pages.js  (build-site-data.js 이후 실행)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const { guardPages } = require("./_page-guard");
const R = require(path.join(PUB, "render-card.js"));

// render-card.js는 Cache-Control max-age=14400(4시간)으로 서빙된다.
// 버전 쿼리가 없으면 계산 로직을 고쳐도 재방문자는 최대 4시간 동안 옛 스크립트를 쓴다
// (HTML은 새 버전, JS는 옛 버전 → 새 필드가 undefined가 되어 조용히 옛 계산 결과가 표시된다).
// 파일 내용 해시를 붙여 로직이 바뀐 배포에서만 캐시가 갈리게 한다.
const RC_VER = crypto
  .createHash("sha1")
  .update(fs.readFileSync(path.join(PUB, "render-card.js")))
  .digest("hex")
  .slice(0, 8);
const RC = (prefix = "") => `<script src="${prefix}render-card.js?v=${RC_VER}"></script>`;

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

const ENV = loadEnv();
const ORIGIN = ENV.SITE_ORIGIN || process.env.SITE_ORIGIN || "http://localhost:3350"; // CI에서는 환경변수로 주입
const GA_ID = "G-4FSJ025P9T"; // GA4 측정 ID (공개값 — HTML에 노출됨)
// localhost 빌드에는 GA를 넣지 않아 로컬 테스트가 실계정 데이터를 오염시키지 않게 한다
const GA_TAG = ORIGIN.startsWith("https")
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>`
  : "";
const DATA = JSON.parse(fs.readFileSync(path.join(PUB, "data.json"), "utf8"));
const DEFAULT_AMT = 10000000;

// 파킹통장 상품 목록 (슬러그 중복 제거) — 상품 상세·전체목록 허브·사이트맵이 공유한다
// 실효금리 순위 집계 (2026-08-17) — /p/의 본문 편차 문제를 푸는 축
const EFF = require("./_eff-rank.js");

const PARKING_LIST = (() => {
  const seen = new Set();
  const out = [];
  for (const p of DATA.parking) {
    const slug = R.slugify(p);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ p, slug });
  }
  return out;
})();

// 156개 전체를 금액대별로 줄 세운 결과. 페이지마다 다시 계산하면 156번 반복되므로 한 번만 만든다.
const EFF_INDEX = EFF.buildEffIndex(PARKING_LIST, R);

const naverLink = (bank, product) =>
  `https://search.naver.com/search.naver?query=${encodeURIComponent(bank + " " + product)}`;
const nameLink = (bank, product) =>
  `<a href="${naverLink(bank, product)}" target="_blank" rel="noopener" class="cell-lk">${product} ↗</a>`;

const builtKST = new Date(new Date(DATA.builtAt).getTime() + 9 * 3600 * 1000); // KST 기준일 (Actions 러너는 UTC라 offset 필요)
const updatedStr = `${builtKST.getUTCMonth() + 1}월 ${builtKST.getUTCDate()}일 업데이트`;
const builtDateKST = `${builtKST.getUTCFullYear()}-${String(builtKST.getUTCMonth() + 1).padStart(2, "0")}-${String(builtKST.getUTCDate()).padStart(2, "0")}`; // YYYY-MM-DD (KST)
const dclsStr = DATA.finlifeDisclosureMonth
  ? `${DATA.finlifeDisclosureMonth.slice(0, 4)}년 ${parseInt(DATA.finlifeDisclosureMonth.slice(4), 10)}월 공시`
  : "";

// 상단 고정 메뉴 — 모든 페이지에서 topbar 바로 아래 동일 위치
const NAV = (active, base) => `
  <div class="nav-wrap">
  <nav class="tabs">
    <a href="${base === "/" ? "/" : `${base}./`}" class="${active === "instant" ? "active" : ""}">바로 이자</a>
    <a href="${base}parking" class="${active === "parking" ? "active" : ""}">전체 목록</a>
    <a href="${base}bank" class="${active === "bank" ? "active" : ""}">은행별</a>
    <a href="${base}calculator" class="${active === "calc" ? "active" : ""}">계산기</a>
    <a href="${base}split" class="${active === "split" ? "active" : ""}">쪼개기</a>
    <a href="${base}new" class="${active === "new" ? "active" : ""}">신상품</a>
    <a href="${base}rates" class="${active === "rates" ? "active" : ""}">예·적금</a>
    <a href="${base}guide" class="${active === "guide" ? "active" : ""}">가이드</a>
  </nav>
  </div>`;

const FOOTER = (base = "") => `
  <footer>
    출처: 금융감독원 금융상품통합비교공시 「금융상품한눈에」, 저축은행중앙회 소비자포털 · 금리는 수시로 변동될 수 있으며 실제 가입 조건은 각 금융회사에서 확인하세요.<br>
    본 사이트는 정보 제공 목적이며 금융상품 판매·중개를 하지 않습니다. 어떤 금융회사로부터도 광고비나 수수료를 받지 않습니다.<br>
    운영자: Jason Jung (정 제이슨) · <a href="${base}about">사이트 소개</a> · <a href="${base}privacy">개인정보처리방침</a>
  </footer>`;

// abs=true → 자산·네비 링크를 절대경로("/")로. 404 페이지 전용.
// CF Pages는 매칭되지 않는 경로에 404.html을 "그 경로 그대로" 서빙하므로(/guide/xxx, /p/xxx …),
// depth 기준 상대경로를 쓰면 /guide/style.css 처럼 어긋나 스타일·스크립트가 전부 깨진다.
function layout({ title, desc, canonicalPath, body, extraHead = "", depth = 0, active = "", abs = false }) {
  const base = abs ? "/" : depth > 0 ? "../" : "";
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="naver-site-verification" content="af1b61ef432cf39f301684fb8053556d4728b3f8" />
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${ORIGIN}${canonicalPath}">
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<link rel="icon" href="${base}favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="${base}apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="이자계산기">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${ORIGIN}${canonicalPath}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
${GA_TAG}
<link rel="stylesheet" href="${base}style.css">
${extraHead}
</head>
<body>
<div class="wrap">
  <div class="topbar">
    <a class="logo" href="${base}./">이자<b>계산기</b></a>
    <div class="top-right">
      <span class="date">${updatedStr}</span>
      <a class="loan-btn" href="${base}loans">🏛️ 금감원 대출공시 조회</a>
    </div>
  </div>
${NAV(active, base)}
${body}
${FOOTER(base)}
</div>
</body>
</html>`;
}

// 금액 입력값을 페이지 간 공유 (localStorage)
const AMOUNT_SYNC_JS = `
    var AMT_KEY = "ijacalc_amount";
    function loadAmt(def) {
      try { var v = parseInt(localStorage.getItem(AMT_KEY), 10); return v > 0 ? v : def; } catch (e) { return def; }
    }
    function saveAmt(v) { try { if (v > 0) localStorage.setItem(AMT_KEY, String(v)); } catch (e) {} }`;

// ---------- 메인 (index.html) ----------
function buildIndex() {
  const instantHtml = R.renderInstantList(DATA.parking, DEFAULT_AMT);
  const rest = DATA.parking.filter((p) => !p.instant).slice(0, 20);
  const restRows =
    "<tr><th>저축은행</th><th>상품</th><th class='r'>최고금리</th><th>지급</th><th>조건</th></tr>" +
    rest
      .map(
        (p) =>
          `<tr><td>${p.bank}</td><td>${nameLink(p.bank, p.product)}</td><td class="r rate-em">${p.maxRate?.toFixed(2)}%</td><td>${p.payout}</td><td><span class="b2">${p.maxRateCondition || ""}</span></td></tr>`
      )
      .join("");

  const body = `
  <div class="hero">
    <h1>오늘 넣으면,<br><span class="em">오늘 이자</span> 받는 파킹통장</h1>
    <p>매일 갱신되는 공시 데이터로, 지금 가장 유리한 파킹통장을 찾아드려요.</p>
  </div>

  <div class="calc">
    <label for="amount">내 여유자금</label>
    <div class="inputline">
      <input id="amount" type="text" value="" placeholder="예: 10,000,000" inputmode="numeric" autofocus>
      <span class="won">원</span>
    </div>
    <div class="hint">하루 이자는 세후(이자소득세 15.4% 차감) 기준 · 한도/조건 자동 반영 · 비어있으면 1,000만원 기준</div>
  </div>

  <div class="notice">
    <span class="ic">💡</span>
    <span>파킹통장 이자는 <b>밤 12시(자정)에 통장에 남아있는 돈</b> 기준으로 하루 단위 계산돼요.
    오늘 몇 시에 넣든 자정 전에만 넣으면, <b>내일부터 오늘 치 이자</b>를 받을 수 있어요. 받는 방법은 은행마다 달라서 카드에 표시해뒀어요.</span>
  </div>

  <div id="instant-list">${instantHtml}</div>

  <h2 class="sec">그 외 파킹통장 최고금리 <small>월지급 등 · 저축은행 공시</small></h2>
  <div class="tbl-wrap"><table id="parking-rest">${restRows}</table></div>

  <h2 class="sec">파킹통장 전체 목록 <small>은행별로 모아보기</small></h2>
  <p class="prose">이 페이지에는 오늘 유리한 상품만 추려서 보여드립니다.
  저축은행·인터넷은행 파킹통장 <b>${PARKING_LIST.length}개 전부</b>를 금융회사별로 정리한 목록은 아래에서 볼 수 있어요.</p>
  <div class="related">
    <a href="parking">파킹통장 ${PARKING_LIST.length}개 전체 금리 목록<span class="r-rate">은행별</span></a>
    <a href="calculator">파킹통장 이자 계산기<span class="r-rate">세후</span></a>
    <a href="guide">금리·이자 가이드<span class="r-rate">읽을거리</span></a>
  </div>

  ${RC()}
  <script>
    (function () {${AMOUNT_SYNC_JS}
      var PARKING = null;
      var inp = document.getElementById("amount");
      var saved = loadAmt(0);
      inp.value = saved > 0 ? fmt(saved) : "";
      inp.focus();
      function rerender() {
        var amt = parseAmount(inp.value) || ${DEFAULT_AMT}; // 비어있으면 1,000만원 기준
        document.getElementById("instant-list").innerHTML = renderInstantList(PARKING, amt);
      }
      fetch("data.json").then(function (r) { return r.json(); }).then(function (d) {
        PARKING = d.parking;
        rerender(); // 저장된 금액 + 모바일 앱 링크 반영
      });
      inp.addEventListener("input", function () {
        var n = parseAmount(inp.value);
        inp.value = n ? fmt(n) : "";
        saveAmt(n);
        if (PARKING) rerender();
      });
    })();
  </script>`;

  const title = "파킹통장 금리비교·이자계산기 — 오늘 넣으면 바로 이자 | ijacalc";
  const desc = `오늘 넣으면 내일 이자 받는 파킹통장 비교 + 금액별 하루 세후 이자 계산기. 매일 자동 갱신.`;
  fs.writeFileSync(path.join(PUB, "index.html"), layout({ title, desc, canonicalPath: "/", body, active: "instant" }));
}

// 계산기 페이지 FAQ — "파킹통장 이자 계산기 / 파킹통장 계산기 / 파킹통장 이자 계산" 롱테일 타겟.
// 숫자는 금리 공시가 아니라 고정된 계산 예시라 시간이 지나도 틀리지 않는다.
const FAQ_ITEMS = [
  {
    q: "파킹통장 이자는 어떻게 계산하나요?",
    a: "예치금 × 연이율 ÷ 365 = 하루 세전 이자입니다. 여기에서 이자소득세 15.4%를 빼면 실제로 받는 세후 이자가 됩니다. 예를 들어 1,000만 원을 연 3.0% 파킹통장에 넣으면 하루 세전 822원, 세후 약 695원입니다.",
  },
  {
    q: "하루만 맡겨도 이자를 받나요?",
    a: "네. 파킹통장 이자는 매일 밤 12시(자정) 기준 잔액으로 하루 단위 계산됩니다. 밤 11시 59분에 입금해도 그날 치 이자가 붙고, 다음 날 아침에 출금해도 이미 계산된 이자는 사라지지 않습니다. 다만 이자를 실제로 <b>지급</b>하는 주기(수시·월·분기)는 상품마다 다릅니다.",
  },
  {
    q: "\"최고 연 7%\"인데 계산해보니 이자가 적습니다. 왜인가요?",
    a: "대부분 <b>한도(캡)</b> 때문입니다. 최고금리를 50만 원이나 100만 원까지만 적용하고 초과분에는 기본금리(연 0.1% 수준)를 주는 상품이 많습니다. 이 사이트의 하루 이자 계산은 상품별 한도 조건을 자동으로 반영해서 실수령 기준으로 순위를 매깁니다.",
  },
  {
    q: "이자에 붙는 세금은 얼마인가요?",
    a: "이자소득세 15.4%(소득세 14% + 지방소득세 1.4%)가 원천징수됩니다. 세전 이자가 1만 원이면 1,540원을 떼고 8,460원이 들어옵니다. 이 사이트의 모든 계산은 세후 기준입니다.",
  },
];

// ---------- 이자계산기 (calculator.html) ----------
function buildCalculator() {
  const topParking = DATA.parking
    .filter((p) => p.instant)
    .map((p) => ({ p, d: R.calcDaily(p, DEFAULT_AMT).daily }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 3);
  const topDepo = DATA.topDeposits.slice(0, 3);

  const parkingLinks = topParking
    .map((x) => `<a href="p/${encodeURIComponent(R.slugify(x.p))}">${x.p.bank} ${x.p.product}<span class="r-rate">연 ${x.p.maxRate?.toFixed(2)}%</span></a>`)
    .join("");
  const depoLinks = topDepo
    .map((r) => `<a href="rates">${r.bank} ${r.product}<span class="r-rate">연 ${r.maxRate?.toFixed(2)}%</span></a>`)
    .join("");

  const body = `
  <div class="hero">
    <h1>이자계산기<br><span class="em">세후 이자</span>를 바로 계산하세요</h1>
    <p>예금·적금·파킹통장 이자를 이자소득세 15.4% 차감한 실수령 기준으로 계산해드려요.</p>
  </div>

  <div class="calc" id="calc-form">
    <nav class="tabs" style="margin-bottom:10px">
      <a href="#" data-mode="deposit" class="active">예금 (목돈 맡기기)</a>
      <a href="#" data-mode="saving">적금 (매달 붓기)</a>
      <a href="#" data-mode="parking">파킹 (하루 단위)</a>
    </nav>
    <label id="lb-principal" for="principal">맡길 금액</label>
    <div class="inputline">
      <input id="principal" type="text" value="10,000,000" inputmode="numeric">
      <span class="won">원</span>
    </div>
    <label for="rate" style="margin-top:10px">연 이율 (%)</label>
    <div class="inputline">
      <input id="rate" type="text" value="3.0" inputmode="decimal">
      <span class="won">%</span>
    </div>
    <label for="term" style="margin-top:10px" id="lb-term">기간 (개월)</label>
    <div class="inputline">
      <input id="term" type="text" value="12" inputmode="numeric">
      <span class="won" id="term-unit">개월</span>
    </div>
    <div class="hint">단리 기준 · 이자소득세 15.4% 자동 차감</div>
  </div>

  <div class="summary" id="calc-result">
    <div class="row"><span class="k">세전 이자</span><span class="v" id="r-gross">-</span></div>
    <div class="row"><span class="k">이자소득세 (15.4%)</span><span class="v" id="r-tax">-</span></div>
    <div class="row"><span class="k">세후 이자</span><span class="v hl" id="r-net">-</span></div>
    <div class="row"><span class="k">총 수령액</span><span class="v" id="r-total">-</span></div>
  </div>

  <p class="prose" id="calc-note"></p>

  <h2 class="sec">지금 금리가 가장 높은 곳 <small>매일 갱신</small></h2>
  <div class="related">
    ${parkingLinks}
    ${depoLinks}
  </div>

  <h2 class="sec">파킹통장 이자 계산기 사용법</h2>
  <div class="prose">
    <p>위 계산기에서 <b>파킹(하루 단위)</b> 탭을 고르면 파킹통장 이자 계산기로 바뀝니다.
    맡길 금액과 연 이율, 며칠 둘지를 넣으면 이자소득세 15.4%를 뺀 세후 이자가 바로 나옵니다.</p>
    <p style="margin-top:10px">파킹통장 이자는 <b>매일 밤 12시(자정) 잔액</b>을 기준으로 하루씩 계산되기 때문에,
    하루만 넣어둬도 그날 치 이자가 붙습니다. 그래서 "며칠"을 넣는 방식으로 계산해야 실제와 맞습니다.</p>
    <p style="margin-top:10px">상품마다 다른 한도·우대조건까지 자동으로 반영한 계산 결과를 보고 싶다면
    <a href="./">바로 이자 페이지</a>에 금액만 넣으면 되고,
    은행별 금리를 한눈에 비교하려면 <a href="parking">파킹통장 전체 금리 목록</a>을 보세요.</p>
  </div>

  <h2 class="sec">자주 묻는 질문</h2>
  <div class="prose">
    ${FAQ_ITEMS.map(
      (f) => `<p style="margin-top:14px"><b>Q. ${f.q}</b><br>${f.a}</p>`
    ).join("")}
  </div>

  ${RC()}
  <script>
    (function () {${AMOUNT_SYNC_JS}
      var mode = "deposit";
      var $ = function (id) { return document.getElementById(id); };
      var TAX = 0.154;

      function num(v) { return parseFloat(String(v).replace(/[^0-9.]/g, "")) || 0; }

      $("principal").value = fmt(loadAmt(${DEFAULT_AMT}));

      function calc() {
        var P = num($("principal").value);
        var r = num($("rate").value) / 100;
        var n = num($("term").value);
        var gross = 0, note = "";
        if (mode === "deposit") {
          gross = P * r * (n / 12);
          note = "목돈 " + fmt(P) + "원을 연 " + (r * 100).toFixed(2) + "%에 " + n + "개월 맡기는 정기예금 단리 기준입니다.";
        } else if (mode === "saving") {
          gross = P * r * (n * (n + 1) / 2) / 12;
          note = "매달 " + fmt(P) + "원씩 " + n + "개월 붓는 적금 단리 기준입니다. 첫 달 납입금은 " + n + "개월치, 마지막 달은 1개월치 이자가 붙어요.";
        } else {
          gross = P * r * (n / 365);
          note = fmt(P) + "원을 " + n + "일 동안 파킹통장에 두는 경우입니다. 자정 잔액 기준으로 매일 계산돼요.";
        }
        var tax = gross * TAX;
        var net = gross - tax;
        $("r-gross").textContent = fmt(Math.round(gross)) + "원";
        $("r-tax").textContent = "-" + fmt(Math.round(tax)) + "원";
        $("r-net").textContent = fmt(Math.round(net)) + "원";
        $("r-total").textContent = fmt(Math.round((mode === "saving" ? P * n : P) + net)) + "원";
        $("calc-note").textContent = note;
      }

      document.querySelectorAll("#calc-form nav.tabs a").forEach(function (a) {
        a.addEventListener("click", function (e) {
          e.preventDefault();
          document.querySelectorAll("#calc-form nav.tabs a").forEach(function (b) { b.classList.remove("active"); });
          a.classList.add("active");
          mode = a.dataset.mode;
          $("lb-principal").textContent = mode === "saving" ? "매달 넣을 금액" : "맡길 금액";
          $("lb-term").textContent = mode === "parking" ? "기간 (일)" : "기간 (개월)";
          $("term-unit").textContent = mode === "parking" ? "일" : "개월";
          $("term").value = mode === "parking" ? "30" : "12";
          calc();
        });
      });

      ["principal", "rate", "term"].forEach(function (id) {
        $(id).addEventListener("input", function () {
          if (id === "principal") {
            var v = num($(id).value);
            $(id).value = v ? fmt(v) : "";
            if (mode !== "saving") saveAmt(v); // 월 납입액은 여유자금과 다르므로 저장 제외
          }
          calc();
        });
      });

      calc();
    })();
  </script>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "이자계산기",
    applicationCategory: "FinanceApplication",
    description: "예금·적금·파킹통장 세후 이자 계산기. 이자소득세 15.4% 자동 차감.",
    offers: { "@type": "Offer", price: "0" },
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a.replace(/<[^>]+>/g, "") },
    })),
  };

  fs.writeFileSync(
    path.join(PUB, "calculator.html"),
    layout({
      title: "이자계산기 — 예금·적금·파킹통장 이자 계산기 (세후) | ijacalc",
      desc: "예금 이자계산기, 적금 이자계산기, 파킹통장 이자 계산기. 이자소득세 15.4%를 차감한 세후 실수령 이자를 바로 계산하고, 오늘 금리가 가장 높은 상품도 확인하세요.",
      canonicalPath: "/calculator",
      body,
      active: "calc",
      extraHead:
        `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` +
        `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>`,
    })
  );
}

// ---------- 상품 상세 페이지 ----------
function buildProductPages() {
  const dir = path.join(PUB, "p");
  // 정상 churn은 0~1건(상품 단종·신규). 저축은행중앙회 수집이 부분 실패하면 대량으로 빠진다.
  guardPages(dir, PARKING_LIST.map((x) => x.slug), { label: "상품 상세", max: 5 });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const instantTop = DATA.parking
    .filter((p) => p.instant)
    .map((p) => ({ p, d: R.calcDaily(p, DEFAULT_AMT).daily }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 6)
    .map((x) => x.p);

  // 순위·이력·비교 사전 계산 — 페이지마다 다른 숫자와 문장을 만들어 템플릿 유사중복을 깬다
  const HISTORY = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "rate-history.json"), "utf8"));
    } catch {
      return null;
    }
  })();
  const byMax = [...PARKING_LIST].sort((a, b) => (b.p.maxRate || 0) - (a.p.maxRate || 0));
  const rankMax = new Map(byMax.map((x, i) => [x.slug, i + 1]));
  const byBase = [...PARKING_LIST].sort((a, b) => (b.p.baseRate || 0) - (a.p.baseRate || 0));
  const rankBase = new Map(byBase.map((x, i) => [x.slug, i + 1]));
  const groupRankMap = new Map();
  const groupCount = {};
  for (const g of new Set(PARKING_LIST.map((x) => x.p.group))) {
    const list = PARKING_LIST.filter((x) => x.p.group === g).sort((a, b) => (b.p.maxRate || 0) - (a.p.maxRate || 0));
    groupCount[g] = list.length;
    list.forEach((x, i) => groupRankMap.set(x.slug, i + 1));
  }
  const top1 = byMax[0];
  const fmtDateK = (d) => `${parseInt(d.slice(0, 4), 10)}년 ${parseInt(d.slice(5, 7), 10)}월 ${parseInt(d.slice(8, 10), 10)}일`;

  for (const { p, slug } of PARKING_LIST) {

    const amounts = [1000000, 5000000, 10000000, 30000000, 50000000, 100000000];
    const calcRows = amounts
      .map((a) => {
        const c = R.calcDaily(p, a);
        return `<tr><td>${R.fmtKorMoney(a)}</td><td class="r">${c.tiered || c.blended ? "실효" : "적용"} ${c.rate.toFixed(2)}%</td><td class="r rate-em">+${R.won(c.daily)}</td><td class="r">${R.won(c.daily * 30)}</td><td class="r">${R.won(c.daily * 365)}</td></tr>`;
      })
      .join("");

    // 2026-08-17: 전 상품 공통 top5 → 실효금리 순위상 이웃으로 교체.
    // 공통 top5는 156p에 똑같이 붙는 533자 블록이었고(본문 공통 1,197자 중 최대) /p/ 미색인의 주요 원인이었다.
    const related = EFF.effNeighbors(p, EFF_INDEX, 5)
      .map(({ p: q, slug: s, rate, rank }) => `<a href="${encodeURIComponent(s)}">${escHtml(q.bank)} ${escHtml(q.product)}<span class="r-rate">실효 연 ${rate.toFixed(2)}% · ${rank}위</span></a>`)
      .join("");

    const officialBtn = p.linkUrl
      ? `<a class="btn pri" href="${p.linkUrl}" target="_blank" rel="noopener">${p.linkUrl.includes("search.naver") ? "네이버에서 상품 찾기" : "공식 페이지 보기"} ↗</a>`
      : "";
    const appBtns = [
      p.appAndroid ? `<a class="btn sec" href="https://play.google.com/store/apps/details?id=${p.appAndroid}" target="_blank" rel="noopener">📱 구글 플레이</a>` : "",
      p.appIos ? `<a class="btn sec" href="https://apps.apple.com/kr/app/id${p.appIos}" target="_blank" rel="noopener">🍎 앱스토어</a>` : "",
    ].join("");

    const timingProse = p.instant
      ? `<p class="prose">이 통장은 <b>오늘 입금하면 내일부터 이자를 받을 수 있는</b> 상품입니다. 이자는 매일 밤 12시(자정) 최종 잔액을 기준으로 하루 단위로 계산됩니다.${p.timing ? ` 수령 방법: <b>${p.timing}</b>` : ""}</p>`
      : `<p class="prose">이 상품의 이자 지급 방식은 <b>${p.payout}</b>입니다. 이자는 매일 잔액 기준으로 계산되지만 지급은 ${p.payout} 주기로 이뤄집니다.</p>`;

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "FinancialProduct",
      name: `${p.bank} ${p.product}`,
      provider: { "@type": "BankOrCreditUnion", name: p.bank },
      interestRate: p.maxRate,
      description: `${p.bank} ${p.product} — 최고 연 ${p.maxRate}% (기본 ${p.baseRate}%), ${p.maxRateCondition || ""}`,
    };

    // --- 순위 배지 ---
    const rk = rankMax.get(slug);
    const rkG = groupRankMap.get(slug);
    const rkB = rankBase.get(slug);
    const badges = `<div class="rank-badges">
    <span class="tag rank">최고금리 전체 ${rk}위 / ${PARKING_LIST.length}개</span>
    <span class="tag rank">${p.group} 중 ${rkG}위 / ${groupCount[p.group]}개</span>
    <span class="tag rank">조건 없는 기본금리 기준 ${rkB}위</span>
  </div>`;

    // --- 비교 문장 (상품마다 숫자·문장이 달라진다) ---
    const myDaily = R.calcDaily(p, DEFAULT_AMT).daily;
    const sameBank = PARKING_LIST.filter((x) => x.p.bank === p.bank && x.slug !== slug);
    const sameBankProse = sameBank.length
      ? ` ${p.bank}에는 이 상품 외에 파킹통장이 ${sameBank.length}개 더 있습니다: ${sameBank
          .slice(0, 4)
          .map(({ p: q, slug: s }) => `<a href="${encodeURIComponent(s)}">${q.product}</a>(연 ${q.maxRate?.toFixed(2)}%)`)
          .join(", ")}.`
      : "";
    let compareProse;
    if (rk === 1) {
      const c1 = R.calcDaily(p, DEFAULT_AMT);
      compareProse =
        c1.capLimit != null
          ? `<p class="prose">현재 <b>${PARKING_LIST.length}개 파킹통장 중 명목 최고금리 1위</b> 상품입니다. 단 최고 연 ${p.maxRate?.toFixed(2)}%는 <b>${R.fmtKorMoney(c1.capLimit)}까지만</b> 적용되는 소액 우대형이라, 1천만원을 넣으면 초과분에는 기본금리 연 ${p.baseRate?.toFixed(2)}%가 붙어 <b>실효 연 ${c1.rate.toFixed(2)}%</b>(하루 세후 <b>+${R.won(myDaily)}</b>)가 됩니다. ${R.fmtKorMoney(c1.capLimit)} 이하 비상금 통장으로 쓰고 나머지는 한도가 넉넉한 통장에 나누는 것이 정석입니다.${sameBankProse}</p>`
          : `<p class="prose">현재 <b>${PARKING_LIST.length}개 파킹통장 중 최고금리 1위</b> 상품입니다. 1천만원 예치 기준 하루 세후 <b>+${R.won(myDaily)}</b>을 받습니다.${sameBankProse}</p>`;
    } else {
      const topDaily = R.calcDaily(top1.p, DEFAULT_AMT).daily;
      const gap = Math.round(myDaily - topDaily);
      const topName = `<a href="${encodeURIComponent(top1.slug)}">${top1.p.bank} ${top1.p.product}</a>(연 ${top1.p.maxRate?.toFixed(2)}%)`;
      // 명목 1위가 한도 조건 탓에 실수령이 더 적은 경우 — 이 상품의 실질 우위를 문장으로 살린다
      compareProse =
        gap >= 0
          ? `<p class="prose">명목 최고금리 1위는 ${topName}이지만, 1위 상품의 한도 조건(${top1.p.maxRateCondition || "-"}) 때문에 <b>1천만원 기준 실수령은 이 상품이 하루 세후 ${R.won(gap)} 더 많습니다</b>. 파킹통장은 표시 금리가 아니라 내 예치 금액 기준 실수령으로 비교해야 합니다.${sameBankProse}</p>`
          : `<p class="prose">현재 최고금리 1위 ${topName} 대비 1천만원 기준 하루 세후 이자가 <b>${R.won(-gap)} 적습니다</b>. 다만 상품마다 우대 조건과 한도(이 상품: ${p.maxRateCondition || "제한 없음"})가 달라, 내 예치 금액 기준으로 비교하는 것이 정확합니다.${sameBankProse}</p>`;
    }

    // --- 광고금리 vs 실효금리 (2026-08-17 신설) ---
    // /p/ 156p가 「크롤링됨-미색인」으로 걸러지던 원인은 본문 편차가 거의 없다는 것이었다
    // (고유성 44.8~55.6% · 본문 2,055~2,803자). 새 데이터 없이, 이미 계산하던 실효금리를
    // 156개 전체에 걸쳐 순위로 집계해 상품마다 완전히 다른 문장이 나오게 한다.
    // 실측 근거: 광고순위≠실효순위 125/156(80%) · 금액대별 5계단 이상 이동 50개(32%).
    const ef = EFF.effSummary(p, EFF_INDEX);
    let effSection = "";
    if (ef.adR != null && ef.effR != null) {
      const amtRows = ef.ranks
        .map(
          (r) =>
            `<tr><td>${r.label}</td><td class="r rate-em">연 ${r.rate.toFixed(2)}%</td><td class="r">${r.rank}위 / ${ef.total}개</td></tr>`
        )
        .join("");

      // 낙차 크기에 따라 해석 문장을 바꾼다 — 상품마다 결론이 정반대일 수 있다
      let verdict;
      if (ef.drop >= 10) {
        const alts = EFF.betterAlternatives(p, EFF_INDEX, 3);
        const altLinks = alts
          .map(({ p: q, slug: s, rate }) => `<a href="${encodeURIComponent(s)}">${escHtml(q.bank)} ${escHtml(q.product)}</a>(실효 연 ${rate.toFixed(2)}%)`)
          .join(", ");
        verdict = `<p class="prose">이 상품은 <b>광고 금리와 실제 금리의 차이가 큰 편</b>입니다.
        광고 최고 연 ${ef.ad.toFixed(2)}%는 전체 ${ef.total}개 중 <b>${ef.adR}위</b>지만,
        1,000만원을 넣었을 때 실제로 붙는 실효금리는 연 <b>${ef.eff.toFixed(2)}%</b>로 <b>${ef.effR}위</b>까지 밀립니다
        (광고 숫자의 <b>${Math.round(ef.ratio * 100)}%</b>, ${ef.drop}계단 하락).
        한도·우대조건(${escHtml(p.maxRateCondition || "-")}) 때문입니다.
        ${alts.length ? `1,000만원 기준으로는 ${altLinks} 쪽이 실수령이 많습니다.` : ""}</p>`;
      } else if (ef.drop <= -10) {
        verdict = `<p class="prose">이 상품은 <b>광고 금리보다 실제 성적이 좋은 쪽</b>입니다.
        광고 최고 연 ${ef.ad.toFixed(2)}%는 전체 ${ef.total}개 중 ${ef.adR}위에 그치지만,
        1,000만원 기준 실효금리로 줄을 세우면 연 <b>${ef.eff.toFixed(2)}%</b>로 <b>${ef.effR}위</b>까지 올라옵니다(${-ef.drop}계단 상승).
        한도가 넉넉해 예치금 전체에 금리가 고르게 붙기 때문입니다.</p>`;
      } else {
        verdict = `<p class="prose">광고 최고 연 ${ef.ad.toFixed(2)}%(전체 ${ef.adR}위)와
        1,000만원 기준 실효금리 연 <b>${ef.eff.toFixed(2)}%</b>(${ef.effR}위)의 차이가 크지 않습니다.
        표시 금리와 실제 수령액이 대체로 일치하는 상품입니다.</p>`;
      }

      // 금액에 따라 순위가 흔들리는 상품만 추가 해석 — 32%가 여기 해당한다
      const spreadProse =
        ef.spread >= 5
          ? `<p class="prose"><b>넣는 금액에 따라 순위가 크게 바뀝니다.</b>
             ${ef.best.label}에서는 ${ef.best.rank}위인데 ${ef.worst.label}에서는 ${ef.worst.rank}위로,
             ${ef.spread}계단 차이가 납니다. 목돈을 한 통장에 몰기보다
             <a href="../split">쪼개기 계산기</a>로 나눠 담는 편이 유리할 수 있습니다.</p>`
          : `<p class="prose">금액대가 달라져도 순위 변동이 ${ef.spread}계단으로 작아, 예치 금액에 관계없이 일정한 성적을 냅니다.</p>`;

      effSection = `
  <h2 class="sec">광고 금리와 실제 붙는 금리 <small>${PARKING_LIST.length}개 상품 중 순위 · ${updatedStr}</small></h2>
  <div class="tbl-wrap"><table>
    <tr><th>예치 금액</th><th class="r">실효금리</th><th class="r">실효 기준 순위</th></tr>
    ${amtRows}
  </table></div>
  ${verdict}
  ${spreadProse}`;
    }

    // --- 금액 구간별 금리 (큐레이션된 상품만) ---
    // 공시는 최고/기본 금리만 주지만 파킹통장의 실제 구조는 구간별 차등이다.
    // 구간이 있는 상품은 표 자체가 상품마다 완전히 달라 페이지 고유성이 가장 크게 올라간다.
    let tierSection = "";
    if (p.tiers && p.tiers.length) {
      const multi = p.tiers.length > 1;
      const rows = p.tiers
        .map((t, i) => {
          const from = i === 0 ? 0 : p.tiers[i - 1].upto;
          const label =
            t.upto == null
              ? `${R.fmtKorMoney(from)} 초과분`
              : i === 0
                ? `${R.fmtKorMoney(t.upto)} 이하`
                : `${R.fmtKorMoney(from)} 초과 ~ ${R.fmtKorMoney(t.upto)}`;
          return `<tr><td>${label}</td><td class="r rate-em">연 ${t.rate.toFixed(2)}%</td></tr>`;
        })
        .join("");
      const src = p.tierSource
        ? `<small>${p.tierSource.name} 확인 ${p.tierSource.verified}</small>`
        : "";
      tierSection = `
  <h2 class="sec">금액 구간별 금리 ${src}</h2>
  <div class="tbl-wrap"><table>
    <tr><th>예치 금액 구간</th><th class="r">적용 금리</th></tr>
    ${rows}
  </table></div>
  <p class="prose">${
    multi
      ? `이 통장은 <b>구간마다 금리가 다릅니다.</b> 예치금 전체에 최고금리가 붙는 것이 아니라, 각 구간에 해당하는 금액분에만 그 구간 금리가 적용됩니다. 위 계산 결과도 이 구조를 반영한 값입니다.`
      : `이 통장은 금액 구간별 차등 없이 <b>전액 동일 금리</b>가 적용됩니다.`
  }</p>`;
    }
    const conditionSection = p.conditions
      ? `
  <h2 class="sec">우대조건 ${p.conditionFree ? '<small>조건 없음</small>' : "<small>최고금리를 받으려면</small>"}</h2>
  <p class="prose">${p.conditions}${
    p.tierSource ? ` <span class="b2">(${p.tierSource.name} · ${p.tierSource.verified} 확인)</span>` : ""
  }</p>`
      : "";

    // --- 금리 변동 이력 ---
    const series = HISTORY?.products?.[`${p.bank}|${p.product}`];
    let histSection = "";
    if (HISTORY && series) {
      if (series.length > 1) {
        const rows = series
          .map((s, i) => {
            const label = i === 0 ? "관측 시작" : "금리 변경";
            return `<tr><td>${fmtDateK(s.d)}</td><td>${label}</td><td class="r rate-em">연 ${s.max?.toFixed(2)}%</td><td class="r">연 ${s.base?.toFixed(2)}%</td></tr>`;
          })
          .join("");
        const last = series[series.length - 1];
        const first = series[0];
        const dir = (last.max || 0) < (first.max || 0) ? "인하" : "인상";
        histSection = `
  <h2 class="sec">금리 변동 이력 <small>${fmtDateK(HISTORY.since)} 관측 시작 · 매일 자동 추적</small></h2>
  <div class="tbl-wrap"><table>
    <tr><th>날짜</th><th>구분</th><th class="r">최고금리</th><th class="r">기본금리</th></tr>
    ${rows}
  </table></div>
  <p class="prose">관측 시작 이후 <b>${series.length - 1}회 변동(${dir})</b>이 있었습니다. 파킹통장 금리는 예고 없이 바뀌므로, 이 페이지는 매일 공시를 다시 확인해 변동을 기록합니다.</p>`;
      } else {
        histSection = `
  <h2 class="sec">금리 변동 이력 <small>${fmtDateK(HISTORY.since)} 관측 시작 · 매일 자동 추적</small></h2>
  <p class="prose">${fmtDateK(HISTORY.since)} 관측 시작 이후 금리 변동이 없습니다 — 최고 연 ${p.maxRate?.toFixed(2)}%를 유지 중입니다. 금리가 바뀌면 이 표에 자동으로 기록됩니다.</p>`;
      }
    }

    // --- 상품별 FAQ (조건·권역·지급방식에서 자동 도출 — 상품마다 내용이 다르다) ---
    const cond = R.parseCondition(p.maxRateCondition);
    const preTaxDaily = myDaily / (1 - R.TAX);
    const faqs = [];
    if (p.tiers && p.tiers.length > 1) {
      // 구간을 아는 상품은 "초과하면 어떻게 되나"에 정확히 답할 수 있다
      const t0 = p.tiers[0];
      const rest = p.tiers
        .slice(1)
        .map((t, i) => {
          const from = p.tiers[i].upto;
          return t.upto == null
            ? `${R.fmtKorMoney(from)} 초과분은 연 ${t.rate.toFixed(2)}%`
            : `${R.fmtKorMoney(t.upto)}까지는 연 ${t.rate.toFixed(2)}%`;
        })
        .join(", ");
      faqs.push({
        q: `${R.fmtKorMoney(t0.upto)}을 넘게 넣으면 어떻게 되나요?`,
        a: `초과분이 사라지는 것이 아니라 구간별로 다른 금리가 붙습니다. ${R.fmtKorMoney(t0.upto)}까지는 연 ${t0.rate.toFixed(2)}%, ${rest}가 적용됩니다. 위 계산기는 이 구조를 그대로 반영하므로 내 금액을 넣으면 실제 받을 이자를 볼 수 있습니다.`,
      });
    } else if (cond.type === "upto") {
      faqs.push({
        q: `${R.fmtKorMoney(cond.value)}을 넘게 넣으면 어떻게 되나요?`,
        a: `최고 연 ${p.maxRate?.toFixed(2)}%는 ${R.fmtKorMoney(cond.value)}까지만 적용됩니다. 초과 금액에는 최고금리가 적용되지 않으므로(상품에 따라 기본금리 연 ${p.baseRate?.toFixed(2)}% 또는 별도 구간 금리), 초과분은 다른 파킹통장에 나눠 예치하는 편이 유리할 수 있습니다. 전체 목록에서 두 번째 통장을 골라보세요.`,
      });
    } else if (cond.type === "above") {
      faqs.push({
        q: `${R.fmtKorMoney(cond.value)} 이하로 넣으면 금리가 어떻게 되나요?`,
        a: `이 상품은 ${R.fmtKorMoney(cond.value)}을 넘어야 최고 연 ${p.maxRate?.toFixed(2)}%가 적용됩니다. 그 이하 금액에는 기본금리 연 ${p.baseRate?.toFixed(2)}%가 적용됩니다.`,
      });
    } else {
      faqs.push({
        q: `예치 한도가 있나요?`,
        a: `공시 기준 금액 한도 조건이 없습니다. 예치 금액 전체에 최고 연 ${p.maxRate?.toFixed(2)}%가 적용됩니다. 단 우대금리 조건이나 상품 개편으로 조건이 바뀔 수 있으니 가입 전 상품설명서를 확인하세요.`,
      });
    }
    // 예금자보호 FAQ — 2026-08-17까지 156p에 완전히 동일한 196자였다(본문 공통 1,197자 중 2위).
    // 이 상품의 실효금리로 "1억을 채우면 이자가 얼마나 한도를 넘는지"를 계산해 상품마다 숫자가 달라지게 한다.
    {
      const capWon = 100000000;
      const capRate = R.calcDaily(p, capWon).rate; // 1억 예치 시 실효금리(구간·한도 반영)
      const yearPre = Math.round((capWon * capRate) / 100); // 세전 연이자
      const safePrincipal = capRate > 0 ? Math.floor(capWon / (1 + capRate / 100) / 10000) * 10000 : capWon;
      faqs.push({
        q: `${p.bank} 파킹통장은 예금자보호가 되나요?`,
        a: `네. ${p.bank}(${p.group})은 예금자보호법 적용 대상이라 원금과 이자를 합해 1인당 최고 1억 원까지 보호됩니다(2025년 9월 1일부터 상향). 한도가 이자까지 더한 금액 기준이라는 점이 중요합니다 — 이 상품에 1억 원을 넣으면 실효 연 ${capRate.toFixed(2)}% 기준 1년 이자가 세전 약 ${R.won(yearPre)}이라, 그만큼이 보호 한도를 넘습니다. 이자까지 보호받으려면 원금을 약 ${R.fmtKorMoney(safePrincipal)} 선에서 끊고 나머지는 다른 금융회사로 나누는 것이 안전합니다.`,
      });
    }
    faqs.push({
      q: `이자는 언제 받나요?`,
      a: p.instant
        ? `매일 밤 12시(자정) 잔액 기준으로 하루치 이자가 계산되고, ${p.timing || "다음날부터 수시로 수령할 수 있습니다"}.`
        : `이자는 매일 잔액 기준으로 계산되며 지급은 ${p.payout} 주기로 이뤄집니다.`,
    });
    faqs.push({
      q: `세금을 떼면 실제로 얼마나 받나요?`,
      a: `이자에는 이자소득세 15.4%(소득세 14% + 지방소득세 1.4%)가 원천징수됩니다. 이 상품에 1천만원을 예치하면 하루 세전 약 ${R.won(preTaxDaily)}, 세후 약 ${R.won(myDaily)}입니다.`,
    });
    const faqHtml = faqs
      .map((f) => `<details class="faq"><summary>${f.q}</summary><p>${f.a}</p></details>`)
      .join("");
    const faqLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a.replace(/<[^>]+>/g, "") },
      })),
    };

    // --- 페이지 내 즉시 계산기 (render-card.js의 calcDaily를 브라우저에서 재사용) ---
    const calcProduct = JSON.stringify({
      bank: p.bank,
      product: p.product,
      baseRate: p.baseRate,
      maxRate: p.maxRate,
      maxRateCondition: p.maxRateCondition,
      tiers: p.tiers || null, // 구간금리가 있으면 브라우저 계산도 같은 로직을 쓰게 한다
    });
    const inlineCalc = `
  <h2 class="sec">이 상품으로 바로 계산 <small>금액을 바꿔보세요 · 세후 기준</small></h2>
  <div class="calc">
    <label for="pc-amt">예치 금액</label>
    <div class="inputline"><input id="pc-amt" inputmode="numeric" value="10,000,000"><span class="won">원</span></div>
    <div class="hint" id="pc-note"></div>
    <div class="tbl-wrap"><table>
      <tr><th class="r">하루</th><th class="r">한 달(30일)</th><th class="r">1년</th></tr>
      <tr><td class="r rate-em" id="pc-d">-</td><td class="r" id="pc-m">-</td><td class="r" id="pc-y">-</td></tr>
    </table></div>
  </div>`;
    const calcScript = `${RC("../")}
<script>(function(){
var P=${calcProduct};
var amt=document.getElementById("pc-amt"),d=document.getElementById("pc-d"),m=document.getElementById("pc-m"),y=document.getElementById("pc-y"),note=document.getElementById("pc-note");
function upd(){var a=parseAmount(amt.value)||0;var c=calcDaily(P,a);
d.textContent="+"+won(c.daily);m.textContent=won(c.daily*30);y.textContent=won(c.daily*365);
note.textContent=(c.tiered?"구간 반영 실효금리 연 ":(c.blended?"실효 금리 연 ":"적용 금리 연 "))+c.rate.toFixed(2)+"%"+(c.capLimit!=null?" · "+fmtKorMoney(c.capLimit)+"까지만 최고금리, 초과분은 기본금리 연 "+(P.baseRate!=null?P.baseRate.toFixed(2):"-")+"%":"");
if(a)amt.value=fmt(a);}
amt.addEventListener("input",upd);upd();
})();</script>`;

    const body = `
  <div class="crumb"><a href="../">홈</a> › <a href="../parking">파킹통장 전체 목록</a> › ${
    BANK_PAGES.has(p.bank)
      ? `<a href="../bank/${encodeURIComponent(BANK_PAGES.get(p.bank))}">${p.bank}</a>`
      : `<a href="../parking#${encodeURIComponent(p.bank)}">${p.bank}</a>`
  } › ${p.product}</div>
  <div class="prod-head">
    <div class="bank">${p.bank} · ${p.group}</div>
    <h1>${p.product} 금리 <span class="em">연 ${p.maxRate?.toFixed(2)}%</span></h1>
  </div>
  ${badges}
  ${p.notice ? `<div class="notice gray"><span class="ic">🔔</span><span>${p.notice}</span></div>` : ""}

  <div class="summary">
    <div class="row"><span class="k">${p.disclosedMaxRate != null ? "실제 적용 금리" : "최고 금리"}</span><span class="v hl">연 ${p.maxRate?.toFixed(2)}%</span></div>
    ${
      p.disclosedMaxRate != null
        ? `<div class="row"><span class="k">공시 최고 금리</span><span class="v">연 ${p.disclosedMaxRate.toFixed(2)}% <span class="b2">(도달 어려움)</span></span></div>`
        : ""
    }
    <div class="row"><span class="k">기본 금리</span><span class="v">연 ${p.baseRate?.toFixed(2)}%</span></div>
    <div class="row"><span class="k">우대/한도 조건</span><span class="v">${p.maxRateCondition || "-"}</span></div>
    <div class="row"><span class="k">이자 지급</span><span class="v">${p.payout}</span></div>
    <div class="row"><span class="k">금리 기준일</span><span class="v">${p.asOf}${p.needsVerify ? " (변동 가능)" : ""}</span></div>
  </div>

  <div class="btns">${officialBtn}${appBtns}</div>

  ${timingProse}
  ${compareProse}
  ${effSection}
  ${tierSection}
  ${conditionSection}

  <h2 class="sec">금액별 예상 이자 <small>세후 · 이자소득세 15.4% 차감</small></h2>
  <div class="tbl-wrap"><table>
    <tr><th>예치 금액</th><th class="r">적용 금리</th><th class="r">하루</th><th class="r">한 달(30일)</th><th class="r">1년</th></tr>
    ${calcRows}
  </table></div>
  ${inlineCalc}
  <p class="prose">여러 상품을 한 번에 비교하려면 <a href="../calculator">파킹통장 이자 계산기</a>를 이용하세요.</p>
  ${histSection}

  <h2 class="sec">자주 묻는 질문</h2>
  ${faqHtml}

  <h2 class="sec">실효금리가 비슷한 파킹통장 <small>1,000만원 기준 순위 이웃</small></h2>
  <div class="related">${
    BANK_PAGES.has(p.bank)
      ? `<a href="../bank/${encodeURIComponent(BANK_PAGES.get(p.bank))}">${p.bank} 금리 총정리<span class="r-rate">예금·적금·파킹 전체</span></a>`
      : ""
  }${related}</div>

  <h2 class="sec">금액대별 이자 순위 <small>금액마다 1위가 다릅니다</small></h2>
  <div class="related">${AMOUNT_BRACKETS.map((x) => `<a href="../amount/${encodeURIComponent(x.slug)}">파킹통장 ${x.slug}<span class="r-rate">이자 순위</span></a>`).join("")}<a href="../split">목돈 쪼개기 계산기<span class="r-rate">1억 초과</span></a></div>
  <p class="prose"><a href="../parking">파킹통장 ${PARKING_LIST.length}개 전체 금리 목록 보기 →</a></p>
  ${calcScript}`;

    const title = `${p.bank} ${p.product} 금리 연 ${p.maxRate?.toFixed(2)}% — 하루 이자 계산 | 이자계산기`;
    const desc = `${p.bank} ${p.product} 파킹통장: 최고 연 ${p.maxRate?.toFixed(2)}% (기본 ${p.baseRate?.toFixed(2)}%), ${p.maxRateCondition || ""}. 최고금리 전체 ${rk}위/${PARKING_LIST.length}개. 1천만원 예치 시 하루 세후 ${R.won(myDaily)}. 금리 변동 이력·이자 계산기 제공.`;
    fs.writeFileSync(
      path.join(dir, `${slug}.html`),
      layout({
        title,
        desc,
        canonicalPath: `/p/${encodeURIComponent(slug)}`,
        body,
        depth: 1,
        active: "instant",
        extraHead:
          `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` +
          `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>`,
      })
    );
  }
  return PARKING_LIST.map((x) => x.slug);
}

// ---------- 파킹통장 전체 목록 허브 (parking.html) ----------
// 상품 상세 156p는 홈에서 19개만 링크돼 나머지가 고아 페이지였다.
// 은행별로 묶어 전 상품에 링크를 한 번씩 공급하는 허브 (F babyhyetaek /r/ 허브와 같은 처방).
function buildParkingHub() {
  const byBank = new Map();
  for (const item of PARKING_LIST) {
    const b = item.p.bank;
    if (!byBank.has(b)) byBank.set(b, []);
    byBank.get(b).push(item);
  }
  const banks = [...byBank.keys()].sort((a, b) => a.localeCompare(b, "ko"));

  // 은행별 섹션 — 각 상품이 정확히 한 번씩 링크된다
  const bankSections = banks
    .map((bank) => {
      const items = byBank.get(bank).sort((x, y) => (y.p.maxRate || 0) - (x.p.maxRate || 0));
      const rows = items
        .map(
          ({ p, slug }) =>
            `<tr><td><a href="p/${encodeURIComponent(slug)}">${p.product}</a></td>` +
            `<td class="r rate-em">${p.maxRate?.toFixed(2)}%</td>` +
            `<td class="r">${p.baseRate?.toFixed(2)}%</td>` +
            `<td>${p.payout || "-"}</td>` +
            `<td><span class="b2">${p.maxRateCondition || "-"}</span></td></tr>`
        )
        .join("");
      return `
  <h3 class="sec" id="${encodeURIComponent(bank)}" style="font-size:17px">${bank} <small>${items.length}개 · ${items[0].p.group}${
        BANK_PAGES.has(bank) ? ` · <a href="bank/${encodeURIComponent(BANK_PAGES.get(bank))}">예금 포함 전체 금리 →</a>` : ""
      }</small></h3>
  <div class="tbl-wrap"><table>
    <tr><th>상품</th><th class="r">최고</th><th class="r">기본</th><th>지급</th><th>한도·조건</th></tr>
    ${rows}
  </table></div>`;
    })
    .join("");

  // 상단 은행 색인 (앵커) — 목록이 길어 바로 찾아갈 수 있게
  const bankIndex = banks
    .map((b) => `<a href="#${encodeURIComponent(b)}">${b} <span class="r-rate">${byBank.get(b).length}</span></a>`)
    .join("");

  const instantCount = PARKING_LIST.filter((x) => x.p.instant).length;
  const topRate = Math.max(...PARKING_LIST.map((x) => x.p.maxRate || 0));

  const body = `
  <div class="hero">
    <h1>파킹통장 <span class="em">전체 금리 목록</span></h1>
    <p>저축은행·인터넷은행 파킹통장 ${PARKING_LIST.length}개를 은행별로 모았습니다 · ${updatedStr}</p>
  </div>

  <div class="summary">
    <div class="row"><span class="k">등록된 파킹통장</span><span class="v">${PARKING_LIST.length}개 · ${banks.length}개 금융회사</span></div>
    <div class="row"><span class="k">최고 금리</span><span class="v hl">연 ${topRate.toFixed(2)}%</span></div>
    <div class="row"><span class="k">수시(바로) 지급 상품</span><span class="v">${instantCount}개</span></div>
  </div>

  <p class="prose">금리는 각 상품의 <b>최고금리</b> 기준이며, 한도·우대조건을 채우지 못하면 기본금리가 적용됩니다.
  내 금액 기준으로 하루에 얼마가 붙는지는 <a href="./">바로 이자 페이지</a>나
  <a href="calculator">파킹통장 이자 계산기</a>에서 확인하세요.</p>

  <h2 class="sec">내 금액으로 바로 보기 <small>금액마다 유리한 상품이 다릅니다</small></h2>
  <div class="related">${AMOUNT_BRACKETS.map((x) => `<a href="amount/${encodeURIComponent(x.slug)}">파킹통장 ${x.slug}<span class="r-rate">이자 순위</span></a>`).join("")}<a href="split">목돈 쪼개기 계산기<span class="r-rate">1억 초과</span></a></div>

  <h2 class="sec">은행으로 바로 찾기</h2>
  <div class="related">${bankIndex}</div>

  <h2 class="sec">은행별 파킹통장 금리 <small>가나다순 · ${updatedStr}</small></h2>
  ${bankSections}`;

  fs.writeFileSync(
    path.join(PUB, "parking.html"),
    layout({
      title: `파킹통장 금리 전체 목록 ${PARKING_LIST.length}개 — 은행별 비교 | 이자계산기`,
      desc: `저축은행·인터넷은행 파킹통장 ${PARKING_LIST.length}개 금리를 은행별로 정리했습니다. 최고 연 ${topRate.toFixed(2)}%, 수시지급 ${instantCount}개. 최고금리·기본금리·한도조건·이자 지급방식을 한 번에 비교하세요. 매일 공시 갱신.`,
      canonicalPath: "/parking",
      body,
      active: "parking",
    })
  );
}

// ---------- 은행별 금리 총정리 페이지 (/bank/*) ----------
// GSC 실측 근거: 표시 쿼리의 다수가 은행명 검색(예가람저축은행 파킹통장·한성저축은행 대출 금리 공시 등).
// 이 니치에서 검색 상위에 오른 개인 사이트들도 전부 "기관별 금리" 롱테일 갱신형 페이지다.
// 페이지 고유성은 은행마다 완전히 다른 상품 표(파킹 구간·예금 기간별·대출 등급별)에서 나온다.

const LATEST = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "latest.json"), "utf8"));
  } catch {
    return null;
  }
})();

// 저축은행중앙회(파킹) 표기와 금감원 공시 표기가 다른 은행 — 파킹 쪽 표기를 대표명으로 쓴다
const FIN_ALIAS = {
  "키움예스저축은행": "키움YES저축은행",
  "디비저축은행": "DB저축은행",
  "엔에이치저축은행": "NH저축은행",
  "대명상호저축은행": "대명저축은행",
  "MS저축은행": "엠에스저축은행",
  "대아상호저축은행": "대아저축은행",
};
const canonBankName = (kor) =>
  FIN_ALIAS[kor] || String(kor || "").replace(/^주식회사\s*/, "").replace(/\s*주식회사$/, "").trim();

const BANKS = (() => {
  const m = new Map();
  const get = (name, group) => {
    if (!m.has(name)) m.set(name, { name, group, parking: [], deposits: [], savings: [], credits: [] });
    const b = m.get(name);
    if (group && !b.group) b.group = group;
    return b;
  };
  // 파킹을 먼저 넣어 그룹 표기(저축은행/인터넷은행)를 우선시킨다
  for (const item of PARKING_LIST) get(item.p.bank, item.p.group).parking.push(item);
  if (LATEST && LATEST.products) {
    const P = LATEST.products;
    const sector = (k) => (k.endsWith("_020000") ? "은행" : "저축은행");
    for (const k of ["deposit_020000", "deposit_030300"])
      for (const r of P[k] || []) get(canonBankName(r.kor_co_nm), sector(k)).deposits.push(r);
    for (const k of ["saving_020000", "saving_030300"])
      for (const r of P[k] || []) get(canonBankName(r.kor_co_nm), sector(k)).savings.push(r);
    for (const k of ["creditLoan_020000", "creditLoan_030300"])
      for (const r of P[k] || []) get(canonBankName(r.kor_co_nm), sector(k)).credits.push(r);
  }
  return m;
})();

const bankSlugify = (name) => name.replace(/\s+/g, "-").replace(/[^\w가-힣-]/g, "");
// 상품 2개 이상인 은행만 페이지 생성 (1개짜리는 thin page 위험)
const BANK_PAGES = new Map();
for (const [name, b] of BANKS) {
  if (b.parking.length + b.deposits.length + b.savings.length + b.credits.length >= 2)
    BANK_PAGES.set(name, bankSlugify(name));
}

const escHtml = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\s+/g, " ").trim();
const clip = (s, n) => {
  const e = escHtml(s);
  return e.length > n ? e.slice(0, n) + "…" : e;
};
const termOpt = (opts, trm) => (opts || []).find((o) => String(o.save_trm) === String(trm)) || null;
const pct = (v) => (v == null ? "-" : `${Number(v).toFixed(2)}%`);

function buildBankPages() {
  const dir = path.join(PUB, "bank");
  // 정상 churn은 0~1건(은행 신규 등재·폐업). 08-07·08-11·08-28 사고는 47건이었다.
  guardPages(dir, BANK_PAGES.values(), { label: "은행별", max: 5 });
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const banks = [...BANK_PAGES.keys()].map((n) => BANKS.get(n));

  // 은행 단위 대표 수치 사전 계산 (순위·비교 문장용)
  const bestParking = (b) =>
    b.parking.length ? [...b.parking].sort((x, y) => (y.p.maxRate || 0) - (x.p.maxRate || 0))[0] : null;
  const best12 = (b) => {
    let top = null;
    for (const d of b.deposits) {
      const o = termOpt(d.options, 12);
      if (o && o.intr_rate2 != null && (!top || o.intr_rate2 > top.rate)) top = { rate: o.intr_rate2, base: o.intr_rate, d };
    }
    return top;
  };
  const bestSaving12 = (b) => {
    let top = null;
    for (const s of b.savings) {
      const o = termOpt(s.options, 12);
      if (o && o.intr_rate2 != null && (!top || o.intr_rate2 > top.rate)) top = { rate: o.intr_rate2, s };
    }
    return top;
  };

  const parkingRank = new Map(
    banks.filter((b) => b.parking.length).sort((x, y) => (bestParking(y).p.maxRate || 0) - (bestParking(x).p.maxRate || 0)).map((b, i) => [b.name, i + 1])
  );
  const parkingRankTotal = parkingRank.size;
  const depositRank = new Map(
    banks.filter((b) => best12(b)).sort((x, y) => best12(y).rate - best12(x).rate).map((b, i) => [b.name, i + 1])
  );
  const depositRankTotal = depositRank.size;
  const marketTopParking = banks.filter((b) => b.parking.length).map(bestParking).sort((x, y) => (y.p.maxRate || 0) - (x.p.maxRate || 0))[0];
  const marketTop12 = [...depositRank.keys()].map((n) => best12(BANKS.get(n))).sort((x, y) => y.rate - x.rate)[0];

  for (const b of banks) {
    const slug = BANK_PAGES.get(b.name);
    const bp = bestParking(b);
    const bd = best12(b);
    const bs = bestSaving12(b);
    const total = b.parking.length + b.deposits.length + b.savings.length + b.credits.length;

    // --- 요약 ---
    const summaryRows = [
      bp
        ? `<div class="row"><span class="k">파킹통장 최고</span><span class="v hl">연 ${bp.p.maxRate?.toFixed(2)}% <span class="b2">(${escHtml(bp.p.product)})</span></span></div>`
        : "",
      bd
        ? `<div class="row"><span class="k">정기예금 최고 (12개월)</span><span class="v hl">연 ${bd.rate.toFixed(2)}% <span class="b2">(${escHtml(bd.d.fin_prdt_nm)})</span></span></div>`
        : "",
      bs
        ? `<div class="row"><span class="k">적금 최고 (12개월)</span><span class="v">연 ${bs.rate.toFixed(2)}% <span class="b2">(${escHtml(bs.s.fin_prdt_nm)})</span></span></div>`
        : "",
      `<div class="row"><span class="k">권역</span><span class="v">${b.group} · 예금자보호 1억 원</span></div>`,
      `<div class="row"><span class="k">기준일</span><span class="v">${bp ? bp.p.asOf : ""}${bp && dclsStr ? " · " : ""}${dclsStr}</span></div>`,
    ].join("");

    // --- 순위 배지 ---
    const badgeItems = [];
    if (parkingRank.has(b.name))
      badgeItems.push(`<span class="tag rank">파킹통장 최고금리 은행 순위 ${parkingRank.get(b.name)}위 / ${parkingRankTotal}곳</span>`);
    if (depositRank.has(b.name))
      badgeItems.push(`<span class="tag rank">정기예금 12개월 은행 순위 ${depositRank.get(b.name)}위 / ${depositRankTotal}곳</span>`);
    const badges = badgeItems.length ? `<div class="rank-badges">${badgeItems.join("\n    ")}</div>` : "";

    // --- 파킹통장 섹션 ---
    let parkingSection = "";
    if (b.parking.length) {
      const rows = [...b.parking]
        .sort((x, y) => (y.p.maxRate || 0) - (x.p.maxRate || 0))
        .map(({ p, slug: ps }) => {
          const daily = R.calcDaily(p, DEFAULT_AMT).daily;
          return `<tr><td><a href="../p/${encodeURIComponent(ps)}">${escHtml(p.product)}</a></td><td class="r rate-em">${p.maxRate?.toFixed(2)}%</td><td class="r">${p.baseRate?.toFixed(2)}%</td><td class="r">+${R.won(daily)}</td><td><span class="b2">${escHtml(p.maxRateCondition || "-")}</span></td></tr>`;
        })
        .join("");
      const gap = marketTopParking && bp !== marketTopParking ? (marketTopParking.p.maxRate - bp.p.maxRate).toFixed(2) : null;
      const marketProse =
        bp === marketTopParking
          ? `${b.name} <a href="../p/${encodeURIComponent(bp.slug)}">${escHtml(bp.p.product)}</a>이(가) 현재 <b>전체 파킹통장 최고금리 1위</b>입니다.`
          : `전체 1위(${marketTopParking.p.bank} ${escHtml(marketTopParking.p.product)}, 연 ${marketTopParking.p.maxRate?.toFixed(2)}%)와의 차이는 ${gap}%p입니다. 다만 한도·우대조건에 따라 실수령은 달라지므로 <a href="../calculator">계산기</a>에서 내 금액 기준으로 비교하세요.`;
      parkingSection = `
  <h2 class="sec">${b.name} 파킹통장 <small>${b.parking.length}개 · 하루 이자는 1천만원 세후 기준</small></h2>
  <div class="tbl-wrap"><table>
    <tr><th>상품</th><th class="r">최고</th><th class="r">기본</th><th class="r">하루 이자</th><th>한도·조건</th></tr>
    ${rows}
  </table></div>
  <p class="prose">${b.name}에서 가장 금리가 높은 파킹통장은 <a href="../p/${encodeURIComponent(bp.slug)}"><b>${escHtml(bp.p.product)}</b></a>(최고 연 ${bp.p.maxRate?.toFixed(2)}%)입니다. ${marketProse}</p>`;
    }

    // --- 정기예금 섹션 ---
    let depositSection = "";
    if (b.deposits.length) {
      const rows = [...b.deposits]
        .map((d) => ({ d, o12: termOpt(d.options, 12) }))
        .sort((x, y) => (y.o12?.intr_rate2 || 0) - (x.o12?.intr_rate2 || 0))
        .map(({ d, o12 }) => {
          const o6 = termOpt(d.options, 6);
          const o24 = termOpt(d.options, 24);
          const cell12 =
            o12 == null
              ? "-"
              : o12.intr_rate2 !== o12.intr_rate
                ? `<b>${pct(o12.intr_rate2)}</b> <span class="b2">(기본 ${pct(o12.intr_rate)})</span>`
                : `<b>${pct(o12.intr_rate2)}</b>`;
          const spcl = d.spcl_cnd && d.spcl_cnd !== "해당사항 없음" ? clip(d.spcl_cnd, 90) : "-";
          return `<tr><td>${escHtml(d.fin_prdt_nm)}</td><td class="r">${pct(o6?.intr_rate2)}</td><td class="r rate-em">${cell12}</td><td class="r">${pct(o24?.intr_rate2)}</td><td><span class="b2">${spcl}</span></td></tr>`;
        })
        .join("");
      const rk = depositRank.get(b.name);
      const vsMarket =
        bd && marketTop12 && bd.rate < marketTop12.rate
          ? ` 전체 1위(${canonBankName(marketTop12.d.kor_co_nm)} ${escHtml(marketTop12.d.fin_prdt_nm)}, 연 ${marketTop12.rate.toFixed(2)}%)와 ${(marketTop12.rate - bd.rate).toFixed(2)}%p 차이입니다. <a href="../rates">전체 예·적금 순위 보기 →</a>`
          : bd && marketTop12 && bd.rate >= marketTop12.rate
            ? ` 현재 <b>전 금융회사 정기예금 12개월 1위</b>입니다.`
            : "";
      depositSection = `
  <h2 class="sec">${b.name} 정기예금 금리 <small>${b.deposits.length}개 · 우대금리 포함 최고 기준 · ${dclsStr}</small></h2>
  <div class="tbl-wrap"><table>
    <tr><th>상품</th><th class="r">6개월</th><th class="r">12개월</th><th class="r">24개월</th><th>우대조건</th></tr>
    ${rows}
  </table></div>${
    bd
      ? `
  <p class="prose">${b.name} 정기예금 12개월 최고는 <b>${escHtml(bd.d.fin_prdt_nm)}</b> 연 ${bd.rate.toFixed(2)}%${rk ? ` — 12개월 기준 ${depositRankTotal}개 금융회사 중 <b>${rk}위</b>` : ""}입니다.${vsMarket}</p>`
      : ""
  }`;
    }

    // --- 예금 이자 계산 (은행마다 금리·기간 구성이 달라 표의 숫자가 전부 달라진다) ---
    let depositCalcSection = "";
    if (bd) {
      const opts = bd.d.options || [];
      const terms = [6, 12, 24, 36]
        .map((t) => ({ t, o: termOpt(opts, t) }))
        .filter((x) => x.o && x.o.intr_rate2 != null);
      const compound = /복리/.test(termOpt(opts, 12)?.intr_rate_type_nm || "");
      const afterTax = (amt, rate, months) => {
        const yrs = months / 12;
        const gross = compound ? amt * (Math.pow(1 + rate / 100 / 12, months) - 1) : amt * (rate / 100) * yrs;
        return gross * (1 - R.TAX);
      };
      const amts = [10000000, 30000000, 50000000];
      const rows = amts
        .map((a) => {
          const cells = terms.map((x) => `<td class="r">${R.won(afterTax(a, x.o.intr_rate2, x.t))}</td>`).join("");
          return `<tr><td>${R.fmtKorMoney(a)}</td>${cells}</tr>`;
        })
        .join("");
      const head = terms.map((x) => `<th class="r">${x.t}개월</th>`).join("");
      // 기간별로 금리가 꺾이는 지점은 은행마다 달라 이 문장도 페이지마다 달라진다
      const bestTerm = terms.reduce((m, x) => (x.o.intr_rate2 > m.o.intr_rate2 ? x : m), terms[0]);
      const termProse =
        terms.length > 1
          ? `기간별로 보면 <b>${bestTerm.t}개월</b>이 연 ${bestTerm.o.intr_rate2.toFixed(2)}%로 가장 높습니다. ${
              bestTerm.t !== 12
                ? `12개월보다 ${bestTerm.t}개월 쪽 금리가 높으므로, 자금을 더 묶어둘 수 있다면 ${bestTerm.t}개월이 유리합니다.`
                : `기간을 더 길게 잡는다고 금리가 오르지는 않으므로 12개월이 기준입니다.`
            }`
          : `공시된 기간은 ${terms[0].t}개월 하나입니다.`;
      const nonDeal = [...new Set(b.deposits.flatMap((d) => String(d.join_way || "").split(",")))].filter(Boolean);
      const wayProse = nonDeal.length
        ? ` 가입 방법은 ${nonDeal.slice(0, 5).join("·")} 등이 공시돼 있습니다.`
        : "";
      depositCalcSection = `
  <h2 class="sec">${b.name} 예금 이자 계산 <small>${escHtml(bd.d.fin_prdt_nm)} 기준 · 세후 · ${compound ? "월복리" : "단리"}</small></h2>
  <div class="tbl-wrap"><table>
    <tr><th>예치 금액</th>${head}</tr>
    ${rows}
  </table></div>
  <p class="prose">${b.name}의 최고금리 예금(<b>${escHtml(bd.d.fin_prdt_nm)}</b>)에 넣었을 때 만기에 받는 <b>세후</b> 이자입니다(이자소득세 15.4% 차감). ${termProse}${wayProse} 다른 은행과 같은 조건으로 비교하려면 <a href="../calculator">이자 계산기</a>를 쓰세요.</p>`;
    }

    // --- 적금 섹션 ---
    let savingSection = "";
    if (b.savings.length) {
      const rows = [...b.savings]
        .map((s) => ({ s, o12: termOpt(s.options, 12) }))
        .sort((x, y) => (y.o12?.intr_rate2 || 0) - (x.o12?.intr_rate2 || 0))
        .map(({ s, o12 }) => {
          const types = [...new Set((s.options || []).map((o) => o.rsrv_type_nm).filter(Boolean))].join("·") || "-";
          const spcl = s.spcl_cnd && s.spcl_cnd !== "해당사항 없음" ? clip(s.spcl_cnd, 90) : "-";
          const cell12 =
            o12 == null
              ? "-"
              : o12.intr_rate2 !== o12.intr_rate
                ? `<b>${pct(o12.intr_rate2)}</b> <span class="b2">(기본 ${pct(o12.intr_rate)})</span>`
                : `<b>${pct(o12.intr_rate2)}</b>`;
          return `<tr><td>${escHtml(s.fin_prdt_nm)}</td><td>${types}</td><td class="r rate-em">${cell12}</td><td><span class="b2">${spcl}</span></td></tr>`;
        })
        .join("");
      savingSection = `
  <h2 class="sec">${b.name} 적금 금리 <small>${b.savings.length}개 · 12개월 기준</small></h2>
  <div class="tbl-wrap"><table>
    <tr><th>상품</th><th>적립방식</th><th class="r">12개월</th><th>우대조건</th></tr>
    ${rows}
  </table></div>`;
    }

    // --- 신용대출 섹션 ---
    let creditSection = "";
    if (b.credits.length) {
      const rows = b.credits
        .map((c) => {
          const oA = (c.options || []).find((o) => o.crdt_lend_rate_type === "A") || (c.options || [])[0];
          if (!oA) return "";
          return `<tr><td>${escHtml(c.fin_prdt_nm)}</td><td>${escHtml(c.crdt_prdt_type_nm || "-")}</td><td class="r">${pct(oA.crdt_grad_1)}</td><td class="r rate-em">${pct(oA.crdt_grad_avg)}</td></tr>`;
        })
        .join("");
      creditSection = `
  <h2 class="sec">${b.name} 신용대출 금리 공시 <small>${dclsStr} · 신용점수별 공시 금리</small></h2>
  <div class="tbl-wrap"><table>
    <tr><th>상품</th><th>유형</th><th class="r">1~2등급</th><th class="r">평균금리</th></tr>
    ${rows}
  </table></div>
  <p class="prose">위 금리는 금융감독원 공시 기준이며 <b>광고가 아닙니다</b>. 실제 금리는 개인 신용도·조건에 따라 달라집니다. 은행권 대출 비교는 <a href="../loans">대출 공시 페이지</a>에서 확인하세요.</p>`;
    }

    // --- FAQ (은행마다 숫자가 다른 자동 도출 문답) ---
    const faqs = [];
    if (bp) {
      const daily = R.calcDaily(bp.p, DEFAULT_AMT).daily;
      faqs.push({
        q: `${b.name} 파킹통장 최고 금리는 얼마인가요?`,
        a: `${bp.p.product}이(가) 최고 연 ${bp.p.maxRate?.toFixed(2)}%(기본 ${bp.p.baseRate?.toFixed(2)}%)로 가장 높습니다. 조건: ${bp.p.maxRateCondition || "없음"}. 1천만원 예치 시 하루 세후 약 ${R.won(daily)}을 받습니다.`,
      });
    }
    if (bd)
      faqs.push({
        q: `${b.name} 정기예금 금리는 얼마인가요?`,
        a: `12개월 기준 ${bd.d.fin_prdt_nm}이(가) 우대 포함 최고 연 ${bd.rate.toFixed(2)}%(기본 ${pct(bd.base)})로 가장 높습니다. 우대조건과 가입 방법은 위 표에서 확인하세요.`,
      });
    if (bp && bd)
      faqs.push({
        q: `${b.name}에서 파킹통장과 정기예금 중 무엇이 유리한가요?`,
        a: `언제든 뺄 수 있어야 하는 돈은 파킹통장(최고 연 ${bp.p.maxRate?.toFixed(2)}%), 만기까지 묶어둘 수 있는 목돈은 정기예금(12개월 최고 연 ${bd.rate.toFixed(2)}%)이 유리합니다. 금리 차이가 ${Math.abs(bd.rate - (bp.p.maxRate || 0)).toFixed(2)}%p이므로, 사용 예정 시점이 확실하다면 예금 쪽 이자가 더 큽니다.`,
      });
    faqs.push({
      q: `${b.name}은 예금자보호가 되나요?`,
      a: `네. ${b.name}(${b.group})은 예금자보호법 적용 대상으로 원금과 이자를 합해 1인당 최고 1억 원까지 보호됩니다(2025년 9월 1일부터 상향). 1억 원을 넘는 금액은 다른 금융회사에 나누면 각각 보호받을 수 있습니다.`,
    });
    const faqHtml = faqs.map((f) => `<details class="faq"><summary>${f.q}</summary><p>${f.a}</p></details>`).join("");
    const faqLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a.replace(/<[^>]+>/g, "") } })),
    };
    const orgLd = {
      "@context": "https://schema.org",
      "@type": "BankOrCreditUnion",
      name: b.name,
      description: `${b.name} 파킹통장·정기예금·적금 금리 정리${bp ? ` — 파킹통장 최고 연 ${bp.p.maxRate?.toFixed(2)}%` : ""}${bd ? `, 정기예금 12개월 최고 연 ${bd.rate.toFixed(2)}%` : ""}`,
    };

    // --- 같은 권역 다른 은행 ---
    // 파킹 금리와 예금 금리는 성격이 달라 한 숫자로 섞지 않는다 — 어느 쪽 금리인지 라벨로 구분
    const peers = banks
      .filter((x) => x.name !== b.name && x.group === b.group)
      .map((x) => {
        const xp = bestParking(x);
        const xd = best12(x);
        return xp
          ? { x, r: xp.p.maxRate || 0, kind: "파킹" }
          : { x, r: xd?.rate || 0, kind: "예금" };
      })
      .sort((a, c) => (a.kind === c.kind ? c.r - a.r : a.kind === "파킹" ? -1 : 1))
      .slice(0, 8)
      .map(({ x, r, kind }) => `<a href="${encodeURIComponent(BANK_PAGES.get(x.name))}">${x.name}<span class="r-rate">${kind} ${r.toFixed(2)}%</span></a>`)
      .join("");

    const heroCounts = [
      b.parking.length ? `파킹통장 ${b.parking.length}개` : "",
      b.deposits.length ? `정기예금 ${b.deposits.length}개` : "",
      b.savings.length ? `적금 ${b.savings.length}개` : "",
      b.credits.length ? `신용대출 ${b.credits.length}개` : "",
    ].filter(Boolean).join(" · ");

    const body = `
  <div class="crumb"><a href="../">홈</a> › <a href="../bank">은행별 금리</a> › ${b.name}</div>
  <div class="prod-head">
    <div class="bank">${b.group} · 상품 ${total}개 · ${updatedStr}</div>
    <h1>${b.name} <span class="em">금리 총정리</span></h1>
  </div>
  ${badges}
  <div class="summary">${summaryRows}</div>
  <p class="prose">${b.name}의 ${heroCounts} 금리를 금융감독원·저축은행중앙회 공시 기준으로 매일 갱신해 정리합니다. 표시 금리는 우대조건 충족 시 최고금리이며, 조건을 못 채우면 기본금리가 적용됩니다.</p>
  ${parkingSection}
  ${depositSection}
  ${depositCalcSection}
  ${savingSection}
  ${creditSection}

  <h2 class="sec">자주 묻는 질문</h2>
  ${faqHtml}

  <h2 class="sec">같은 권역 다른 금융회사 <small>${b.group}</small></h2>
  <div class="related">${peers}</div>
  <p class="prose"><a href="../bank">은행별 금리 전체 목록 →</a> · <a href="../parking">파킹통장 ${PARKING_LIST.length}개 전체 보기</a> · <a href="../calculator">이자 계산기</a></p>`;

    const titleBits = [
      bp ? `파킹통장 연 ${bp.p.maxRate?.toFixed(2)}%` : "",
      bd ? `예금 연 ${bd.rate.toFixed(2)}%` : "",
    ].filter(Boolean).join(" · ");
    const title = `${b.name} 금리 총정리${titleBits ? ` — ${titleBits}` : ""} | 이자계산기`;
    const desc = `${b.name} ${heroCounts} 금리 한눈에 보기. ${bp ? `파킹통장 최고 ${bp.p.product} 연 ${bp.p.maxRate?.toFixed(2)}%` : ""}${bp && bd ? ", " : ""}${bd ? `정기예금 12개월 최고 연 ${bd.rate.toFixed(2)}%` : ""}. 공시 기준 매일 갱신, 우대조건·하루 이자 계산 포함.`;

    fs.writeFileSync(
      path.join(dir, `${slug}.html`),
      layout({
        title,
        desc,
        canonicalPath: `/bank/${encodeURIComponent(slug)}`,
        body,
        depth: 1,
        active: "bank",
        extraHead:
          `<script type="application/ld+json">${JSON.stringify(orgLd)}</script>` +
          `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>`,
      })
    );
  }

  // --- 은행별 허브 (/bank) ---
  const groups = [...new Set(banks.map((b) => b.group))];
  const hubSections = groups
    .map((g) => {
      const list = banks
        .filter((b) => b.group === g)
        .map((b) => ({ b, bp: bestParking(b), bd: best12(b) }))
        // 파킹통장 보유 은행을 파킹 금리순으로 먼저, 그다음 파킹 없는 은행을 예금 금리순으로.
        // 두 금리를 한 키로 섞어 정렬하면 성격이 다른 숫자가 뒤엉킨 순서가 된다.
        .sort((x, y) => {
          if (!!x.bp !== !!y.bp) return x.bp ? -1 : 1;
          return x.bp
            ? (y.bp.p.maxRate || 0) - (x.bp.p.maxRate || 0)
            : (y.bd?.rate || 0) - (x.bd?.rate || 0);
        });
      const rows = list
        .map(
          ({ b, bp, bd }) =>
            `<tr><td><a href="bank/${encodeURIComponent(BANK_PAGES.get(b.name))}">${b.name}</a></td>` +
            `<td class="r rate-em">${bp ? bp.p.maxRate?.toFixed(2) + "%" : "-"}</td>` +
            `<td class="r">${bd ? bd.rate.toFixed(2) + "%" : "-"}</td>` +
            `<td class="r">${b.parking.length + b.deposits.length + b.savings.length + b.credits.length}개</td></tr>`
        )
        .join("");
      return `
  <h2 class="sec">${g} <small>${list.length}곳</small></h2>
  <div class="tbl-wrap"><table>
    <tr><th>금융회사</th><th class="r">파킹 최고</th><th class="r">예금 12개월</th><th class="r">상품 수</th></tr>
    ${rows}
  </table></div>`;
    })
    .join("");

  fs.writeFileSync(
    path.join(PUB, "bank.html"),
    layout({
      title: `은행별 금리 총정리 — ${banks.length}개 금융회사 파킹통장·예금·적금 | 이자계산기`,
      desc: `은행·저축은행·인터넷은행 ${banks.length}곳의 파킹통장·정기예금·적금·신용대출 금리를 은행 단위로 정리했습니다. 금융감독원·저축은행중앙회 공시 기준 매일 갱신.`,
      canonicalPath: "/bank",
      body: `
  <div class="hero">
    <h1>은행별 <span class="em">금리 총정리</span></h1>
    <p>${banks.length}개 금융회사의 파킹통장·예금·적금·대출 금리를 은행 단위로 · ${updatedStr}</p>
  </div>
  <p class="prose">은행 이름을 누르면 그 은행의 <b>모든 공시 상품 금리</b>(파킹통장·정기예금·적금·신용대출)를 한 페이지에서 볼 수 있습니다.
  상품 기준 비교는 <a href="parking">파킹통장 전체 목록</a>·<a href="rates">예·적금 순위</a>를 이용하세요.</p>
  ${hubSections}`,
      active: "bank",
    })
  );

  // /bank 는 bank.html 하나로만 서빙한다 — bank/index.html을 같이 두면
  // Cloudflare Pages에서 /bank 가 어느 파일로 풀릴지 모호해진다.

  return [...BANK_PAGES.values()];
}

// ---------- 금액대별 추천 페이지 (/amount/*) ----------
// "파킹통장 1억", "파킹통장 5천만원" 류 금액 쿼리 대응.
// 최고금리 순위가 아니라 **그 금액에서 실제로 받는 이자** 순으로 정렬하는 것이 핵심 —
// 명목 7% 소액 우대형이 1억 예치에서는 최하위가 되므로 순위가 금액대마다 완전히 달라진다.
const AMOUNT_BRACKETS = [
  { slug: "500만원", amt: 5000000, kw: "파킹통장 500만원" },
  { slug: "1000만원", amt: 10000000, kw: "파킹통장 1000만원" },
  { slug: "3000만원", amt: 30000000, kw: "파킹통장 3000만원" },
  { slug: "5000만원", amt: 50000000, kw: "파킹통장 5000만원" },
  { slug: "1억", amt: 100000000, kw: "파킹통장 1억" },
  { slug: "3억", amt: 300000000, kw: "파킹통장 3억" },
];
const PROTECT_LIMIT = 100000000; // 예금자보호 한도 (2025-09-01 상향)

function buildAmountPages() {
  const dir = path.join(PUB, "amount");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  for (const b of AMOUNT_BRACKETS) {
    const ranked = PARKING_LIST.map(({ p, slug }) => {
      const c = R.calcDaily(p, b.amt);
      return { p, slug, ...c, year: c.daily * 365 };
    })
      .filter((x) => x.daily > 0)
      .sort((a, b2) => b2.daily - a.daily);

    const top = ranked.slice(0, 20);
    const best = ranked[0];
    // 명목 최고금리 1위와 이 금액대 1위가 다른지 — 페이지마다 다른 인사이트 문장이 된다
    const nominalTop = [...PARKING_LIST].sort((x, y) => (y.p.maxRate || 0) - (x.p.maxRate || 0))[0];
    const flipped = nominalTop.slug !== best.slug;
    const nominalHere = ranked.find((x) => x.slug === nominalTop.slug);

    const rows = top
      .map(
        (x, i) =>
          `<tr><td>${i + 1}</td><td>${x.p.bank}<div class="b2">${x.p.group}</div></td>` +
          `<td><a href="../p/${encodeURIComponent(x.slug)}">${x.p.product}</a></td>` +
          `<td class="r">${x.tiered || x.blended ? "실효 " : ""}연 ${x.rate.toFixed(2)}%</td>` +
          `<td class="r rate-em">+${R.won(x.daily)}</td>` +
          `<td class="r">${R.won(x.daily * 30)}</td>` +
          `<td class="r">${R.won(x.year)}</td></tr>`
      )
      .join("");

    const insight = flipped
      ? `<p class="prose"><b>${b.slug} 기준 1위는 ${best.p.bank} ${best.p.product}</b>(적용 연 ${best.rate.toFixed(2)}%)입니다.
      명목 최고금리 1위는 ${nominalTop.p.bank} ${nominalTop.p.product}(연 ${nominalTop.p.maxRate?.toFixed(2)}%)이지만
      한도 조건(${nominalTop.p.maxRateCondition || "-"}) 때문에 ${b.slug}을 넣으면 하루 세후 ${R.won(nominalHere ? nominalHere.daily : 0)}에 그쳐
      <b>순위가 뒤집힙니다</b>. 파킹통장은 표시 금리가 아니라 내 금액에서의 실수령으로 골라야 합니다.</p>`
      : `<p class="prose"><b>${b.slug} 기준 1위는 ${best.p.bank} ${best.p.product}</b>(적용 연 ${best.rate.toFixed(2)}%)로,
      명목 최고금리 1위와 같습니다. 하루 세후 <b>+${R.won(best.daily)}</b>, 1년이면 ${R.won(best.year)}입니다.</p>`;

    // 예금자보호 안내 — 금액대별로 문장이 달라진다
    // 예금자보호는 원금이 아니라 **원금+이자 합산** 1억까지다 — 원금이 한도에 근접하면 이자분이 보호 밖으로 밀린다
    const protectProse =
      b.amt > PROTECT_LIMIT
        ? `<p class="prose">⚠️ ${b.slug}은 <b>예금자보호 한도(1억 원)를 넘습니다.</b> 한 금융회사에 전액을 넣으면 초과분은 보호받지 못하므로,
      최소 ${Math.ceil(b.amt / PROTECT_LIMIT)}개 금융회사에 나눠 예치하는 것이 안전합니다.
      게다가 대부분의 파킹통장은 금액 한도를 넘으면 금리가 떨어지기 때문에, 나누는 편이 <b>이자도 더 받습니다</b>.
      <a href="../split">파킹통장 쪼개기 계산기</a>에서 최적 배분을 계산해보세요.</p>`
        : b.amt === PROTECT_LIMIT
          ? `<p class="prose">⚠️ 예금자보호는 <b>원금과 이자를 합해</b> 금융회사당 1억 원까지입니다. 원금이 정확히 1억 원이면
      <b>이자는 보호 한도를 넘어섭니다</b>. 원금까지 온전히 보호받으려면 한 곳에 1억 원 미만으로 넣거나
      두 곳 이상에 나누는 것이 안전합니다. <a href="../split">쪼개기 계산기</a>로 배분을 확인해보세요.</p>`
          : `<p class="prose">${b.slug}은 예금자보호 한도(1억 원) 안이라 한 금융회사에 넣어도 원금과 이자가 보호됩니다(보호 한도는 원금과 이자 합산 기준).
      다만 상품별 한도 조건에 걸리면 금리가 떨어지므로, 위 표의 <b>적용 금리</b>가 최고금리보다 낮은 상품은 한도에 걸린 것입니다.</p>`;

    const faqs = [
      {
        q: `${b.slug}을 파킹통장에 넣으면 이자가 얼마인가요?`,
        a: `${b.slug} 기준 가장 유리한 ${best.p.bank} ${best.p.product}에 넣으면 하루 세후 약 ${R.won(best.daily)}, 한 달 약 ${R.won(best.daily * 30)}, 1년 약 ${R.won(best.year)}입니다(이자소득세 15.4% 차감 후). 상품별 금액은 위 표에서 비교하세요.`,
      },
      {
        q: `${b.slug}은 한 통장에 다 넣어도 되나요?`,
        a:
          b.amt >= PROTECT_LIMIT
            ? `권장하지 않습니다. 예금자보호는 금융회사당 1인 원금과 이자를 합해 1억 원까지라, ${b.slug}을 한 곳에 넣으면 한도를 넘는 부분(${b.amt === PROTECT_LIMIT ? "이자" : "초과 원금과 이자"})이 보호되지 않습니다. 또 대부분 파킹통장은 한도 초과분에 낮은 금리를 적용해 이자도 줄어듭니다.`
            : `${b.slug}은 예금자보호 한도 안이라 한 곳에 넣어도 보호됩니다(원금과 이자 합산 1억 원 기준). 다만 상품의 우대 한도가 ${b.slug}보다 작으면 초과분에 낮은 금리가 붙으니, 위 표의 적용 금리를 확인하세요.`,
      },
      {
        q: `이자에서 세금은 얼마나 떼나요?`,
        a: `이자소득세 15.4%(소득세 14% + 지방소득세 1.4%)가 원천징수됩니다. 위 표의 금액은 모두 세금을 뗀 뒤 실제로 받는 금액입니다.`,
      },
    ];
    const faqHtml = faqs.map((f) => `<details class="faq"><summary>${f.q}</summary><p>${f.a}</p></details>`).join("");
    const faqLd = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a.replace(/<[^>]+>/g, "") },
      })),
    };

    const otherLinks = AMOUNT_BRACKETS.filter((x) => x.slug !== b.slug)
      .map((x) => `<a href="${encodeURIComponent(x.slug)}">파킹통장 ${x.slug}<span class="r-rate">이자</span></a>`)
      .join("");

    const body = `
  <div class="crumb"><a href="../">홈</a> › <a href="../parking">파킹통장 전체 목록</a> › ${b.slug}</div>
  <div class="hero">
    <h1>파킹통장 <span class="em">${b.slug}</span> 넣으면 이자 얼마?</h1>
    <p>${b.slug} 기준 실수령 이자 순위 · 파킹통장 ${PARKING_LIST.length}개 비교 · ${updatedStr}</p>
  </div>

  ${insight}

  <h2 class="sec">${b.slug} 예치 시 이자 순위 TOP 20 <small>세후 · 이자소득세 15.4% 차감</small></h2>
  <div class="tbl-wrap"><table>
    <tr><th>#</th><th>금융회사</th><th>상품</th><th class="r">적용 금리</th><th class="r">하루</th><th class="r">한 달</th><th class="r">1년</th></tr>
    ${rows}
  </table></div>
  <p class="prose">순위는 <b>${b.slug}을 넣었을 때 실제로 받는 이자</b> 기준입니다. 상품의 한도 조건 때문에 최고금리를 다 못 받는 경우
  적용 금리가 낮아지며, 그래서 금액대마다 순위가 달라집니다. 다른 금액으로 보려면 <a href="../calculator">이자 계산기</a>를 이용하세요.</p>

  ${protectProse}

  <h2 class="sec">자주 묻는 질문</h2>
  ${faqHtml}

  <h2 class="sec">다른 금액으로 보기</h2>
  <div class="related">${otherLinks}</div>
  <p class="prose"><a href="../parking">파킹통장 ${PARKING_LIST.length}개 전체 금리 목록 보기 →</a></p>`;

    fs.writeFileSync(
      path.join(dir, `${b.slug}.html`),
      layout({
        title: `파킹통장 ${b.slug} 이자 얼마? — 실수령 순위 TOP 20 | 이자계산기`,
        desc: `${b.slug}을 파킹통장에 넣으면 하루 ${R.won(best.daily)}, 1년 ${R.won(best.year)}(세후). ${b.slug} 기준 1위는 ${best.p.bank} ${best.p.product} 적용 연 ${best.rate.toFixed(2)}%. 한도 조건까지 반영한 실수령 순위 ${PARKING_LIST.length}개 비교.`,
        canonicalPath: `/amount/${encodeURIComponent(b.slug)}`,
        body,
        depth: 1,
        active: "parking",
        extraHead: `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>`,
      })
    );
  }
  return AMOUNT_BRACKETS.map((b) => b.slug);
}

// ---------- 파킹통장 쪼개기(분산 예치) 계산기 (/split) ----------
// 예금자보호 1억 한도 + 상품별 금액 한도를 동시에 고려해 배분을 제안한다.
// 시장에 없는 기능 — 블로그들은 "나눠 넣으세요"라고 말만 하고 계산은 안 해준다.
function buildSplitPage() {
  // 브라우저에서 계산에 쓸 최소 데이터 (한도·금리·이름·슬러그)
  const pool = PARKING_LIST.map(({ p, slug }) => ({
    bank: p.bank,
    product: p.product,
    baseRate: p.baseRate,
    maxRate: p.maxRate,
    maxRateCondition: p.maxRateCondition,
    tiers: p.tiers || null,
    group: p.group,
    slug,
  }));

  const faqs = [
    {
      q: "파킹통장을 왜 나눠서 넣나요?",
      a: "두 가지 이유입니다. 첫째, 예금자보호는 금융회사당 1인 1억 원까지라 한 곳에 몰면 초과분이 보호되지 않습니다. 둘째, 대부분의 파킹통장은 우대 한도(예: 5천만 원까지)를 넘는 금액에 낮은 금리를 적용하므로, 나누면 이자도 더 받습니다.",
    },
    {
      q: "예금자보호 한도는 얼마인가요?",
      a: "2025년 9월 1일부터 1인당 금융회사별 원금과 이자를 합해 1억 원까지 보호됩니다(이전 5천만 원에서 상향). 한도가 이자까지 포함한 금액 기준이라, 원금을 1억 원에 꽉 채우면 이자분은 보호받지 못합니다. 또 같은 금융회사의 여러 계좌는 합산되므로, 나눌 때는 반드시 서로 다른 금융회사여야 합니다.",
    },
    {
      q: "저축은행에 넣어도 안전한가요?",
      a: "저축은행도 예금자보호법 적용 대상이라 1인당 1억 원까지 보호됩니다. 다만 보호 한도 안에서 나누는 것이 원칙이고, 이 계산기는 한 금융회사당 1억 원을 넘지 않도록 배분합니다.",
    },
    {
      q: "계좌를 여러 개 만들 때 주의할 점은?",
      a: "20영업일 내 다른 금융회사 입출금 계좌를 새로 만들면 거절될 수 있습니다(단기간 다수계좌 개설 제한). 한 번에 다 만들지 말고 순차적으로 개설하세요. 또 처음 만든 계좌는 한도제한계좌로 시작하는 경우가 많습니다.",
    },
  ];
  const faqHtml = faqs.map((f) => `<details class="faq"><summary>${f.q}</summary><p>${f.a}</p></details>`).join("");
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const body = `
  <div class="crumb"><a href="./">홈</a> › <a href="parking">파킹통장 전체 목록</a> › 쪼개기 계산기</div>
  <div class="hero">
    <h1>파킹통장 <span class="em">쪼개기</span> 계산기</h1>
    <p>예금자보호 1억 한도 + 상품별 금액 한도를 같이 계산해 이자가 가장 많은 배분을 찾아드립니다</p>
  </div>

  <div class="calc">
    <label for="sp-amt">예치할 총 금액</label>
    <div class="inputline"><input id="sp-amt" inputmode="numeric" value="300,000,000"><span class="won">원</span></div>
    <div class="hint">
      <label style="font-weight:600"><input type="checkbox" id="sp-protect" checked> 예금자보호 한도(1억) 안에서만 배분</label>
    </div>
  </div>

  <div id="sp-result"></div>

  <p class="prose">배분은 <b>금액 한도가 있는 고금리 상품부터 한도만큼 채우고, 남은 돈을 다음 상품으로 넘기는 방식</b>으로 계산합니다.
  같은 금융회사의 계좌는 예금자보호가 합산되므로 한 금융회사당 1억 원을 넘지 않게 배분합니다.
  실제 가입 시에는 각 상품의 우대조건(앱 가입·마케팅 동의 등)을 확인하세요.</p>

  <h2 class="sec">자주 묻는 질문</h2>
  ${faqHtml}

  <h2 class="sec">금액대별로 보기</h2>
  <div class="related">${AMOUNT_BRACKETS.map((x) => `<a href="amount/${encodeURIComponent(x.slug)}">파킹통장 ${x.slug}<span class="r-rate">이자</span></a>`).join("")}</div>

  ${RC()}
  <script>
  var POOL=${JSON.stringify(pool)};
  var PROTECT=${PROTECT_LIMIT};
  (function(){
    var amtEl=document.getElementById("sp-amt"),protEl=document.getElementById("sp-protect"),out=document.getElementById("sp-result");
    function plan(total,useProtect,bigOnly){
      // 상품별 "이 상품에 넣을 수 있는 최대 금액"과 그 금리를 뽑아 금리 높은 순으로 채운다
      // 상품을 "금리 구간(segment)" 단위로 펼친다 — 구간금리 상품은 상위 구간만 쓰고 버리면 손해다.
      // (예: 다올 쌈짓돈Ⅲ는 100만까지 5.0%지만 그 위 구간도 3.6/3.5%로 경쟁력이 있다)
      var segs=[];
      POOL.forEach(function(p){
        if(p.tiers&&p.tiers.length){
          var prev=0;
          p.tiers.forEach(function(t){
            var to=t.upto==null?Infinity:t.upto;
            segs.push({p:p,from:prev,to:to,rate:t.rate||0});
            prev=to;
          });
        } else {
          var c=parseCondition(p.maxRateCondition);
          if(c.type==="upto")segs.push({p:p,from:0,to:c.value,rate:p.maxRate||0});
          else if(c.type==="above")segs.push({p:p,from:c.value+1,to:Infinity,rate:p.maxRate||0});
          else segs.push({p:p,from:0,to:Infinity,rate:p.maxRate||0});
        }
      });
      segs=segs.filter(function(s){
        if(s.rate<=0)return false;
        // bigOnly: 소액 우대 구간을 뺀 "한도 큰 통장만 쓰는" 비교 기준용 배분
        return bigOnly?s.to>=PROTECT:true;
      }).sort(function(a,b){return b.rate-a.rate;});

      var left=total,perBank={},filled={},pass=true;
      while(pass&&left>=10000){
        pass=false;
        for(var i=0;i<segs.length&&left>=10000;i++){
          var s=segs[i],key=s.p.bank+"|"+s.p.product,bank=s.p.bank;
          var got=filled[key]||0;
          if(got>=s.to)continue;           // 이 구간은 이미 다 찼다
          if(got<s.from)continue;          // 아래 구간이 안 찼으면 이 구간은 아직 못 쓴다(다음 패스에서 재시도)
          var bankRoom=useProtect?Math.max(0,PROTECT-(perBank[bank]||0)):Infinity;
          if(bankRoom<10000)continue;
          var put=Math.min(left,s.to-got,bankRoom);
          if(put<10000)continue;
          filled[key]=got+put;
          perBank[bank]=(perBank[bank]||0)+put;
          left-=put;
          pass=true;
        }
      }
      // 상품 단위로 합산 (구간을 여러 개 채운 경우 한 줄로 보여준다)
      var alloc=[];
      POOL.forEach(function(p){
        var amt=filled[p.bank+"|"+p.product];
        if(amt>=10000)alloc.push({p:p,amt:amt,rate:calcDaily(p,amt).rate});
      });
      alloc.sort(function(a,b){return b.amt-a.amt;});
      return {alloc:alloc,left:left};
    }
    function render(){
      var total=parseAmount(amtEl.value)||0;
      if(total)amtEl.value=fmt(total);
      if(total<10000){out.innerHTML='<div class="empty">금액을 입력하세요.</div>';return;}
      var r=plan(total,protEl.checked,false),daily=0,html="";
      if(!r.alloc.length){out.innerHTML='<div class="empty">배분할 상품을 찾지 못했습니다.</div>';return;}
      html+='<h2 class="sec">추천 배분 <small>'+r.alloc.length+'개 통장 · 세후 기준</small></h2><div class="tbl-wrap"><table>';
      html+='<tr><th>#</th><th>금융회사</th><th>상품</th><th class="r">넣을 금액</th><th class="r">금리</th><th class="r">하루 이자</th></tr>';
      r.alloc.forEach(function(a,i){
        var d=calcDaily(a.p,a.amt).daily;daily+=d;
        html+='<tr><td>'+(i+1)+'</td><td>'+a.p.bank+'<div class="b2">'+a.p.group+'</div></td>'+
          '<td><a href="p/'+encodeURIComponent(a.p.slug)+'">'+a.p.product+'</a></td>'+
          '<td class="r">'+won(a.amt)+'</td><td class="r">연 '+a.rate.toFixed(2)+'%</td>'+
          '<td class="r rate-em">+'+won(d)+'</td></tr>';
      });
      html+='</table></div>';
      // 비교 기준: 같은 조건에서 "한도 큰 통장만 쓰는" 단순 배분 — 소액 고금리 통장을 더해서 얻는 순이익을 본다.
      // (예금자보호를 끈 단일 통장과 비교하면 보호를 지킨 배분이 손해처럼 보이는 왜곡이 생긴다)
      var base=plan(total,protEl.checked,true),baseDaily=0;
      base.alloc.forEach(function(a){baseDaily+=calcDaily(a.p,a.amt).daily;});
      var gain=Math.round((daily-baseDaily)*365);
      var minAcc=base.alloc.length, extraAcc=r.alloc.length-minAcc;
      html+='<div class="summary">'+
        '<div class="row"><span class="k">이 배분의 하루 이자 합계</span><span class="v hl">+'+won(daily)+'</span></div>'+
        '<div class="row"><span class="k">1년 이자</span><span class="v">'+won(daily*365)+'</span></div>'+
        '<div class="row"><span class="k">한도 큰 통장만 쓸 때 <small>통장 '+minAcc+'개</small></span><span class="v">1년 '+won(baseDaily*365)+'</span></div>'+
        '<div class="row"><span class="k">소액 고금리 통장을 더해 얻는 이자</span><span class="v hl">1년 '+(gain>0?"+":"")+won(gain)+'</span></div>'+
        (r.left>0?'<div class="row"><span class="k">배분하지 못한 금액</span><span class="v">'+won(r.left)+' (상품 한도 소진)</span></div>':'')+
        '</div>';
      // 실익 대비 수고 안내 — 통장 1개 더 만들 때 얻는 연간 이자로 판단하게 한다
      var perAcc=extraAcc>0?Math.round(gain/extraAcc):0;
      var protectNote=(total>PROTECT)
        ? ' 다만 <b>예금자보호 한도(1억)를 넘는 금액이라 이자와 무관하게 최소 '+Math.ceil(total/PROTECT)+'개 금융회사로는 반드시 나눠야</b> 원금이 보호됩니다.'
        : '';
      var advice;
      if(extraAcc<=0&&gain>0){
        // 통장 수는 그대로인데 상품 선택만으로 이자가 늘어나는 구간 — 소액 고금리 통장이 이 금액을 다 담는 경우
        advice='통장을 더 만들 필요 없이 <b>어느 통장을 고르느냐만으로 1년에 '+won(gain)+'을 더 받습니다.</b> 이 금액대는 소액 우대 통장의 높은 금리가 그대로 적용되는 구간입니다.'+protectNote;
      } else if(extraAcc<=0){
        advice='이 금액은 한도 큰 통장 <b>'+minAcc+'개</b>로 충분합니다. 소액 우대 통장을 더 열어도 이자가 늘지 않습니다.'+protectNote;
      } else if(perAcc<30000){
        advice='통장을 <b>'+extraAcc+'개 더</b>(총 '+r.alloc.length+'개) 만들면 1년에 <b>'+won(gain)+'</b>을 더 받습니다 — 하나당 연 '+won(perAcc)+
          ' 수준이라 <b>수고 대비 실익이 크지 않습니다.</b> 상위 몇 개만 골라 쓰는 편이 현실적입니다.'+protectNote;
      } else {
        advice='통장을 <b>'+extraAcc+'개 더</b>(총 '+r.alloc.length+'개) 만들면 1년에 <b>'+won(gain)+'</b>을 더 받습니다(하나당 연 '+won(perAcc)+' 수준). 쪼갤 만한 구간입니다.'+protectNote;
      }
      html+='<div class="notice gray"><span class="ic">💡</span><span>'+advice+
        ' 참고로 20영업일 내에 여러 금융회사 입출금 계좌를 연달아 만들면 개설이 거절될 수 있어, 한 번에 다 만들기는 어렵습니다.</span></div>';
      out.innerHTML=html;
    }
    amtEl.addEventListener("input",render);protEl.addEventListener("change",render);render();
  })();
  </script>`;

  fs.writeFileSync(
    path.join(PUB, "split.html"),
    layout({
      title: `파킹통장 쪼개기 계산기 — 예금자보호 1억·한도까지 계산한 최적 배분 | 이자계산기`,
      desc: `목돈을 파킹통장 여러 개로 나눌 때 이자가 가장 많은 배분을 계산합니다. 예금자보호 1억 한도와 상품별 금액 한도를 동시에 반영. 파킹통장 ${PARKING_LIST.length}개 기준, 한 통장에만 넣을 때와 이자 차이도 비교.`,
      canonicalPath: "/split",
      body,
      active: "split",
      extraHead: `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>`,
    })
  );
}

// ---------- 랭킹/목록 페이지 ----------
function rateTable(rows) {
  return (
    "<tr><th>#</th><th>금융회사</th><th>상품</th><th class='r'>최고</th><th class='r'>기본</th><th>우대조건</th></tr>" +
    rows
      .map(
        (r, i) =>
          `<tr><td>${i + 1}</td><td>${r.bank}<div class="b2">${r.group}</div></td><td>${nameLink(r.bank, r.product)}${r.reserveType ? `<div class="b2">${r.reserveType}</div>` : ""}</td><td class="r rate-em">${r.maxRate?.toFixed(2)}%</td><td class="r">${r.baseRate?.toFixed(2)}%</td><td><span class="b2">${(r.specialCondition || "-").slice(0, 80)}</span></td></tr>`
      )
      .join("")
  );
}

function loanTable(rows, credit) {
  return (
    `<tr><th>금융회사</th><th>상품</th><th class='r'>${credit ? "1등급" : "최저"}</th><th class='r'>평균</th><th>유형</th></tr>` +
    rows
      .map(
        (r) =>
          `<tr><td>${r.bank}</td><td>${nameLink(r.bank, r.product)}</td><td class="r rate-em">${r.minRate != null ? r.minRate.toFixed(2) + "%" : "-"}</td><td class="r">${r.avgRate != null ? r.avgRate.toFixed(2) + "%" : "-"}</td><td><span class="b2">${r.detail || ""}</span></td></tr>`
      )
      .join("")
  );
}

function buildListPages() {
  // 예·적금 통합
  fs.writeFileSync(
    path.join(PUB, "rates.html"),
    layout({
      title: `정기예금·적금 금리 순위 TOP 15 (12개월) — ${dclsStr} | 이자계산기`,
      desc: `전 은행·저축은행 정기예금·적금 최고금리 순위. 예금 1위 ${DATA.topDeposits[0]?.bank} 연 ${DATA.topDeposits[0]?.maxRate?.toFixed(2)}%, 적금 1위 ${DATA.topSavings[0]?.bank} 연 ${DATA.topSavings[0]?.maxRate?.toFixed(2)}%. 금융감독원 공시 기준 매일 갱신.`,
      canonicalPath: "/rates",
      body: `
  <div class="hero"><h1>예·적금 <span class="em">금리 순위</span></h1><p>12개월 최고우대금리 기준 · ${dclsStr} · 은행 + 저축은행</p></div>
  <h2 class="sec">정기예금 TOP 15 <small>목돈 맡기기</small></h2>
  <div class="tbl-wrap"><table>${rateTable(DATA.topDeposits)}</table></div>
  <h2 class="sec">적금 TOP 15 <small>매달 붓기</small></h2>
  <div class="tbl-wrap"><table>${rateTable(DATA.topSavings)}</table></div>
  <p class="prose">특정 은행의 예금·적금·파킹통장을 한 번에 보려면 <a href="bank">은행별 금리 총정리</a>를 이용하세요.</p>`,
      active: "rates",
    })
  );

  // 대출 (상단 버튼으로 진입)
  fs.writeFileSync(
    path.join(PUB, "loans.html"),
    layout({
      title: `주택담보대출·전세·신용대출 금리 비교 — ${dclsStr} | 이자계산기`,
      desc: `주담대·전세자금·개인신용대출 은행별 최저금리 비교. 금융감독원 금융상품통합비교공시 데이터, 광고·중개 아님.`,
      canonicalPath: "/loans",
      body: `
  <div class="hero"><h1>대출 <span class="em">최저금리</span> 비교</h1><p>${dclsStr} · 은행 공시 기준</p></div>
  <div class="notice gray">
    <span class="ic">🏛️</span>
    <span><b>이 대출 금리는 광고가 아닙니다.</b> 금융감독원 금융상품통합비교공시 「금융상품한눈에」에 각 은행이 직접 제출한 공시 데이터(${dclsStr})를 그대로 보여드리는 것으로,
    본 사이트는 어떤 금융회사로부터도 광고비나 수수료를 받지 않습니다. 실제 금리는 신용도·조건에 따라 달라지니 해당 은행에서 확인하세요.</span>
  </div>
  <h2 class="sec">주택담보대출 <small>최저금리순</small></h2>
  <div class="tbl-wrap"><table>${loanTable(DATA.loans.mortgage)}</table></div>
  <h2 class="sec">전세자금대출</h2>
  <div class="tbl-wrap"><table>${loanTable(DATA.loans.rent)}</table></div>
  <h2 class="sec">개인신용대출 <small>평균금리순</small></h2>
  <div class="tbl-wrap"><table>${loanTable(DATA.loans.credit, true)}</table></div>`,
    })
  );

  // 신상품
  const kindName = { deposit: "정기예금", saving: "적금", parking: "파킹통장" };
  const newBody = DATA.newProducts.length
    ? DATA.newProducts
        .map(
          (p) => `<div class="card"><div class="left">
        <div class="bank">${p.bank} · ${p.group} · ${kindName[p.kind] || p.kind}</div>
        <div class="name">${nameLink(p.bank, p.product)}</div>
        <div class="rateline">공시 시작일 ${p.disclosureStart || "-"}</div>
      </div>${p.maxRate ? `<div class="right"><div class="daily" style="color:var(--blue)">최고 ${p.maxRate.toFixed(2)}%</div></div>` : ""}</div>`
        )
        .join("")
    : `<div class="empty">아직 감지된 신규 상품이 없습니다.<br>매일 공시를 수집해서 새로 등장한 파킹통장·예적금이 생기면 이곳에 표시됩니다.</div>`;

  fs.writeFileSync(
    path.join(PUB, "new.html"),
    layout({
      title: `새로 나온 파킹통장·예적금 신상품 — 매일 갱신 | 이자계산기`,
      desc: `오늘 새로 공시된 파킹통장·예금·적금 신상품 모음. 금융감독원·저축은행중앙회 공시를 매일 비교해서 새 상품만 골라 보여드립니다.`,
      canonicalPath: "/new",
      body: `
  <div class="hero"><h1>새로 나온 <span class="em">파킹통장, 예적금</span></h1><p>어제까지 없던 상품만 골라서 · 매일 갱신</p></div>
  ${newBody}`,
      active: "new",
    })
  );

  // 구버전 분리 페이지 제거 (예·적금 통합으로 대체)
  for (const f of ["deposits.html", "savings.html"]) {
    const fp = path.join(PUB, f);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
}

// ---------- 가이드 ----------
function buildGuidePages() {
  // guides-content는 함수 — 집계 해석 기사가 DATA(공시 금리)로 본문 수치를 빌드 시 계산한다.
  const ALL_GUIDES = require("./guides-content.js")(DATA);
  // 발행일(date)이 오늘(KST) 이하인 글만 공개 — 미래 날짜 글은 매일 새벽 빌드가 날짜 도래 시 자동 공개
  const todayKST = process.env.BUILD_DATE || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const GUIDES = ALL_GUIDES.filter((g) => g.date <= todayKST);
  const pending = ALL_GUIDES.length - GUIDES.length;
  if (pending > 0) console.log(`가이드 예약 대기 ${pending}편 (오늘 KST: ${todayKST})`);
  const dir = path.join(PUB, "guide");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  for (const g of GUIDES) {
    const others = GUIDES.filter((x) => x.slug !== g.slug)
      .slice(0, 4)
      .map((x) => `<a href="${encodeURIComponent(x.slug)}">${x.title}</a>`)
      .join("");

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: g.title,
      description: g.desc,
      datePublished: g.date,
      dateModified: builtDateKST,
      author: {
        "@type": "Person",
        name: "Jason Jung",
        alternateName: "정 제이슨",
        jobTitle: "Web developer",
        url: `${ORIGIN}/about`,
      },
      publisher: { "@type": "Organization", name: "이자계산기 (ijacalc.com)", url: ORIGIN },
    };

    fs.writeFileSync(
      path.join(dir, `${g.slug}.html`),
      layout({
        title: `${g.title} | 이자계산기`,
        desc: g.desc,
        canonicalPath: `/guide/${encodeURIComponent(g.slug)}`,
        depth: 1,
        active: "guide",
        extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
        body: `
  <div class="crumb"><a href="../">홈</a> › <a href="../guide">가이드</a></div>
  <div class="prod-head"><h1>${g.title}</h1></div>
  <div class="prose" style="font-size:15px">${g.body}</div>

  <div style="margin:22px 0 4px; padding:14px 16px; border:1px solid var(--border); border-radius:10px; font-size:13.5px; color:var(--sub); line-height:1.8">
    작성 <b>Jason Jung (정 제이슨)</b> — 이자계산기(ijacalc.com) 운영자 · 1인 개발자<br>
    금융 전문가가 아닌 개발자가 금융감독원·저축은행중앙회 공시 데이터를 근거로 작성했으며, 본문의 금리·수치는 매일 자동 갱신되는 공시 기준으로 관리합니다.
    <a href="../about">운영자 소개 →</a><br>
    발행 ${g.date} · 최종 확인 ${builtDateKST}
  </div>

  <h2 class="sec">내 금액으로 계산해보기</h2>
  <p class="prose">읽은 내용을 내 돈에 대입해보면 훨씬 빨리 이해됩니다.
  금액을 넣으면 세후 이자를 바로 계산해드려요.</p>
  <div class="related">
    <a href="../calculator">이자계산기<span class="r-rate">세후 계산</span></a>
    <a href="../">오늘 이자 주는 파킹통장<span class="r-rate">하루 이자순</span></a>
    <a href="../parking">파킹통장 전체 금리 목록<span class="r-rate">${PARKING_LIST.length}개</span></a>
  </div>

  <h2 class="sec">다른 가이드</h2>
  <div class="related">${others}</div>`,
      })
    );
  }

  // 가이드 목록 페이지 (최신 글 먼저)
  const list = [...GUIDES].sort((a, b) => b.date.localeCompare(a.date)).map(
    (g) => `<a class="related-item" href="guide/${encodeURIComponent(g.slug)}" style="display:block; padding:18px 4px; border-bottom:1px solid var(--border); text-decoration:none; color:inherit">
      <div style="font-size:16.5px; font-weight:700">${g.title}</div>
      <div style="font-size:13px; color:var(--sub); margin-top:5px; line-height:1.6">${g.desc}</div>
    </a>`
  ).join("");

  fs.writeFileSync(
    path.join(PUB, "guide.html"),
    layout({
      title: "금리·이자 가이드 — 파킹통장, 세금, 예금자보호 총정리 | 이자계산기",
      desc: "파킹통장 원리, 이자소득세 15.4%, 예금자보호 1억원, CMA 비교, 우대금리 함정까지 — 이자 재테크에 필요한 지식을 정리한 가이드 모음입니다.",
      canonicalPath: "/guide",
      active: "guide",
      body: `
  <div class="hero"><h1>금리·이자 <span class="em">가이드</span></h1><p>이자 재테크에 필요한 지식을 하나씩, 정확하게</p></div>
  <div class="related" style="margin-bottom:8px">
    <a href="calculator">이자계산기<span class="r-rate">세후 계산</span></a>
    <a href="parking">파킹통장 전체 금리 목록<span class="r-rate">${PARKING_LIST.length}개</span></a>
  </div>
  ${list}`,
    })
  );

  return GUIDES.map((g) => g.slug);
}

// ---------- 소개 / 개인정보처리방침 ----------
function buildInfoPages() {
  const CONTACT = "hello@ijacalc.com";

  const aboutJsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: `${ORIGIN}/about`,
    mainEntity: {
      "@type": "Person",
      name: "Jason Jung",
      alternateName: "정 제이슨",
      jobTitle: "Web developer",
      email: `mailto:${CONTACT}`,
      url: `${ORIGIN}/about`,
      knowsAbout: [
        "파킹통장·예적금 금리 비교",
        "세후 이자 계산 (이자소득세 15.4%)",
        "금융감독원·저축은행중앙회 공시 데이터 자동 수집",
      ],
      worksFor: { "@type": "Organization", name: "이자계산기 (ijacalc.com)", url: ORIGIN },
    },
  };

  fs.writeFileSync(
    path.join(PUB, "about.html"),
    layout({
      title: "사이트 소개 — 만든 사람, 데이터 검증 방식 | 이자계산기 (ijacalc.com)",
      desc: "이자계산기(ijacalc.com)는 1인 개발자 Jason Jung이 만들고 운영합니다. 금융감독원·저축은행중앙회 공시를 매일 자동 수집해 세후 이자를 계산하는 과정과, 이 사이트가 일부러 하지 않는 것을 설명합니다.",
      canonicalPath: "/about",
      extraHead: `<script type="application/ld+json">${JSON.stringify(aboutJsonLd)}</script>`,
      body: `
  <div class="hero"><h1>사이트 <span class="em">소개</span></h1><p>${builtDateKST} 업데이트 · 작성 Jason Jung</p></div>
  <div class="prose">
    <h2 class="sec">만든 사람</h2>
    <p>안녕하세요, <b>Jason Jung(정 제이슨)</b>입니다. 1인 개발자로,
    <b>이자계산기(ijacalc.com)</b>의 데이터 수집기와 계산기, 페이지, 가이드 글까지 전부 혼자 만들고 운영합니다.</p>
    <p style="margin-top:12px">먼저 제가 <b>아닌 것</b>부터 말씀드리는 게 맞을 것 같습니다.
    저는 세무사·회계사·금융투자 전문 자격을 가진 금융 전문가가 <b>아니며</b>, 이 사이트의 어떤 내용도
    특정 상품 가입 권유나 투자 자문이 아닙니다. 제가 할 수 있는 것은 개발자로서
    공시 원본 데이터를 그대로 받아와서, 계산 과정을 숨기지 않고 보여드리는 일입니다.
    숫자의 출처가 궁금하시면 언제든 메일로 물어봐 주세요. 어디서 온 숫자인지 보여드리겠습니다.</p>

    <h2 class="sec">왜 만들었나</h2>
    <p>파킹통장·예적금 금리는 수시로 바뀌는데, 검색하면 나오는 비교 글은 작성 시점의 금리가
    그대로 남아 있는 경우가 많았습니다. 그리고 대부분 세전 "최고금리"만 보여줄 뿐,
    실제로 통장에 들어오는 <b>세후 이자가 얼마인지</b>를 바로 알려주는 곳은 드물었습니다.</p>
    <p style="margin-top:12px">그래서 사람이 옮겨 적는 대신 공시 원본에서 매일 자동으로 데이터를 받아오고,
    "오늘 돈을 넣으면 언제, 얼마의 이자를 받는지"를 세후 기준으로 바로 계산해주는 사이트를 직접 만들었습니다.
    2026년 7월에 첫 버전을 공개했습니다.</p>

    <h2 class="sec">숫자는 이렇게 검증합니다</h2>
    <p>이 사이트가 내세울 수 있는 것은 정확성뿐이라서, 막연한 약속 대신 실제 운영 방식을 그대로 적습니다.</p>
    <ul style="margin:8px 0 0 20px; line-height:1.9">
      <li><b>출처는 공시 원본 두 곳입니다.</b> 금융감독원 금융상품통합비교공시 「금융상품한눈에」 오픈API(정기예금·적금·대출)와
      저축은행중앙회 소비자포털(입출금자유예금·파킹통장) 공시에서 직접 받아옵니다.</li>
      <li><b>매일 새벽 5시 30분(KST)에 자동으로 수집·재생성됩니다.</b> 수집부터 계산, 페이지 생성까지 전 과정이
      자동화되어 있어 사람이 손으로 옮겨 적다가 생기는 오타가 끼어들 틈이 없습니다.</li>
      <li><b>페이지마다 기준일을 표시합니다.</b> 상단의 "○월 ○일 업데이트"와 상품별 금리 기준일로,
      지금 보고 있는 숫자가 언제 것인지 항상 확인할 수 있습니다.</li>
      <li><b>계산 기준은 하나로 통일되어 있습니다.</b> 모든 이자는 이자소득세 15.4%(소득세 14% + 지방소득세 1.4%)를
      차감한 세후 금액, 단리 기준으로 계산하며, 상품별 한도·구간(예: "1억원 이하")도 계산에 자동 반영됩니다.
      상품 페이지와 계산기가 같은 데이터, 같은 계산 기준을 사용하므로 페이지와 계산기가 서로 다른 말을 하지 않습니다.</li>
      <li><b>금리 변동 이력은 날짜별 수집 기록에서 복원합니다.</b> 어느 날 금리가 바뀌면 그 변동이 기록으로 남습니다.</li>
    </ul>

    <h2 class="sec">이 사이트가 일부러 하지 않는 것</h2>
    <ul style="margin:8px 0 0 20px; line-height:1.9">
      <li><b>금융상품을 팔거나 중개하지 않습니다.</b> 어떤 금융회사로부터도 광고비·수수료를 받지 않으며,
      특정 상품에 유리하게 순서를 바꾸는 일도 없습니다. 정렬 기준은 오직 공시된 금리입니다.</li>
      <li><b>가입 링크로 돈을 벌지 않습니다.</b> 상품명을 누르면 제휴 링크가 아니라 네이버 검색 결과로 연결됩니다.
      가입 여부와 경로는 온전히 이용자의 선택입니다.</li>
      <li><b>회원가입이 없고, 입력한 금액은 서버로 전송되지 않습니다.</b> 계산기에 넣은 금액은
      이용자의 브라우저에만 저장됩니다. 자세한 내용은 <a href="privacy">개인정보처리방침</a>에 있습니다.</li>
      <li><b>개인 맞춤 조언을 하지 않습니다.</b> 이 사이트는 공시된 조건에서 계산이 어떻게 나오는지 보여줄 뿐,
      "어떤 상품에 가입해야 하는지"는 말하지 않습니다.</li>
    </ul>
    <p style="margin-top:12px">금리는 수시로 변동될 수 있으므로, 실제 가입 전에는 반드시 해당 금융회사의
    공식 페이지에서 최종 조건을 확인하세요.</p>

    <h2 class="sec">오류 제보 · 문의</h2>
    <p>숫자가 틀렸다고 생각되시면 해당 페이지와 예상하신 값을 적어
    <a href="mailto:${CONTACT}">${CONTACT}</a>로 보내주세요.
    확인되는 대로 고치거나, 그 숫자가 나온 공시 원본을 보여드리겠습니다. 제휴·기타 문의도 같은 주소로 받습니다.</p>
  </div>`,
    })
  );

  fs.writeFileSync(
    path.join(PUB, "privacy.html"),
    layout({
      title: "개인정보처리방침 | 이자계산기 (ijacalc.com)",
      desc: "이자계산기(ijacalc.com)의 개인정보처리방침입니다.",
      canonicalPath: "/privacy",
      body: `
  <div class="hero"><h1>개인정보<span class="em">처리방침</span></h1><p>시행일: 2026년 7월 11일</p></div>
  <div class="prose">
    <p><b>1. 수집하는 개인정보.</b> 이자계산기(ijacalc.com)는 회원가입 없이 이용하는 서비스로,
    이름·이메일·전화번호 등 개인 식별 정보를 수집하지 않습니다.</p>
    <p style="margin-top:12px"><b>2. 브라우저에 저장되는 정보.</b> 계산기에 입력한 금액은 이용 편의를 위해
    이용자의 기기(브라우저 localStorage)에만 저장되며, 서버로 전송되거나 수집되지 않습니다.</p>
    <p style="margin-top:12px"><b>3. 자동으로 수집되는 정보.</b> 서비스 운영을 위해 호스팅 사업자(Cloudflare)가
    접속 IP, 브라우저 정보, 방문 일시 등을 표준 서버 로그로 처리할 수 있습니다. 이는 보안 및 트래픽 관리 목적으로만 사용됩니다.</p>
    <p style="margin-top:12px"><b>4. 방문 분석 도구.</b> 본 사이트는 서비스 개선을 위해 <b>Google Analytics</b>와
    Cloudflare Web Analytics를 사용하여 방문 페이지, 유입 경로, 대략적 지역, 체류 시간 등 통계 정보를 수집합니다.
    Google Analytics는 이를 위해 쿠키를 사용하며, 이 정보는 개인을 식별하지 않는 형태로 집계됩니다.
    이용자는 <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener">Google Analytics 차단 브라우저 부가기능</a>으로
    수집을 거부할 수 있습니다.</p>
    <p style="margin-top:12px"><b>5. 광고 및 쿠키.</b> 본 사이트는 Google AdSense 광고를 게재할 수 있습니다.
    Google을 포함한 제3자 광고 사업자는 쿠키를 사용하여 이용자의 이전 방문 기록에 기반한 맞춤 광고를 표시할 수 있습니다.
    이용자는 <a href="https://adssettings.google.com" target="_blank" rel="noopener">Google 광고 설정</a>에서 맞춤 광고를 해제하거나,
    <a href="https://www.aboutads.info" target="_blank" rel="noopener">www.aboutads.info</a>에서 제3자 광고 쿠키 사용을 거부할 수 있습니다.</p>
    <p style="margin-top:12px"><b>6. 개인정보의 제3자 제공.</b> 본 사이트는 이용자의 개인정보를 수집하지 않으므로 제3자에게 제공하지 않습니다.</p>
    <p style="margin-top:12px"><b>7. 문의처.</b> 개인정보 관련 문의: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
    <p style="margin-top:12px"><b>8. 변경 고지.</b> 본 방침이 변경되는 경우 이 페이지를 통해 고지합니다.</p>
  </div>`,
    })
  );
}

// ---------- sitemap / robots ----------
function buildSitemap(slugs, guideSlugs, amountSlugs, bankSlugs) {
  const today = DATA.builtAt.slice(0, 10);
  const urls = [
    "/", "/parking", "/bank", "/calculator", "/split", "/new", "/rates", "/loans", "/guide", "/about", "/privacy",
    ...amountSlugs.map((s) => `/amount/${encodeURIComponent(s)}`),
    ...guideSlugs.map((s) => `/guide/${encodeURIComponent(s)}`),
    ...bankSlugs.map((s) => `/bank/${encodeURIComponent(s)}`),
    ...slugs.map((s) => `/p/${encodeURIComponent(s)}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${ORIGIN}${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>`;
  fs.writeFileSync(path.join(PUB, "sitemap.xml"), xml);
  fs.writeFileSync(path.join(PUB, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
}

// ---------- 404 ----------
// 없으면 CF Pages가 매칭 실패 경로에 index.html을 200으로 서빙한다(soft-404).
// 오타·마감 상품·옛 URL이 전부 "홈과 같은 내용의 200 페이지"가 되어 구글에 중복으로 쌓이므로 반드시 있어야 한다.
function build404() {
  const body = `${NAV("", "/")}
  <section class="hero">
    <h1 class="h1">페이지를 찾을 수 없어요</h1>
    <p class="sub">주소가 바뀌었거나, 판매가 끝난 상품일 수 있어요. 아래에서 다시 찾아보세요.</p>
  </section>
  <div class="quick">
    <a class="qbtn" href="/">오늘의 파킹통장 금리 순위</a>
    <a class="qbtn" href="/parking">파킹통장 전체 목록</a>
    <a class="qbtn" href="/bank">은행별 금리</a>
    <a class="qbtn" href="/calculator">이자계산기</a>
    <a class="qbtn" href="/guide">가이드</a>
  </div>`;
  fs.writeFileSync(
    path.join(PUB, "404.html"),
    layout({
      title: "페이지를 찾을 수 없어요 (404) | 이자계산기",
      desc: "요청하신 페이지가 없거나 판매가 종료된 상품일 수 있습니다.",
      canonicalPath: "/404",
      body,
      abs: true,
    })
  );
}

buildIndex();
buildCalculator();
const slugs = buildProductPages();
buildParkingHub();
const bankSlugs = buildBankPages();
const amountSlugs = buildAmountPages();
buildSplitPage();
buildListPages();
const guideSlugs = buildGuidePages();
buildInfoPages();
buildSitemap(slugs, guideSlugs, amountSlugs, bankSlugs);
build404();
console.log(`페이지 생성 완료: index + 계산기 + 전체목록 허브 + 은행별 ${bankSlugs.length}개 + 금액대별 ${amountSlugs.length}개 + 쪼개기 + rates/loans/new + 가이드 ${guideSlugs.length}편 + 상품 ${slugs.length}개 + 404 + sitemap (${ORIGIN})`);
