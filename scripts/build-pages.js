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

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const R = require(path.join(PUB, "render-card.js"));

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

const naverLink = (bank, product) =>
  `https://search.naver.com/search.naver?query=${encodeURIComponent(bank + " " + product)}`;
const nameLink = (bank, product) =>
  `<a href="${naverLink(bank, product)}" target="_blank" rel="noopener" class="cell-lk">${product} ↗</a>`;

const builtKST = new Date(new Date(DATA.builtAt).getTime() + 9 * 3600 * 1000); // KST 기준일 (Actions 러너는 UTC라 offset 필요)
const updatedStr = `${builtKST.getUTCMonth() + 1}월 ${builtKST.getUTCDate()}일 업데이트`;
const dclsStr = DATA.finlifeDisclosureMonth
  ? `${DATA.finlifeDisclosureMonth.slice(0, 4)}년 ${parseInt(DATA.finlifeDisclosureMonth.slice(4), 10)}월 공시`
  : "";

// 상단 고정 메뉴 — 모든 페이지에서 topbar 바로 아래 동일 위치
const NAV = (active, base) => `
  <div class="nav-wrap">
  <nav class="tabs">
    <a href="${base}./" class="${active === "instant" ? "active" : ""}">바로 이자</a>
    <a href="${base}parking" class="${active === "parking" ? "active" : ""}">전체 목록</a>
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
    <a href="${base}about">사이트 소개</a> · <a href="${base}privacy">개인정보처리방침</a>
  </footer>`;

function layout({ title, desc, canonicalPath, body, extraHead = "", depth = 0, active = "" }) {
  const base = depth > 0 ? "../" : "";
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

  <script src="render-card.js"></script>
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

  <script src="render-card.js"></script>
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
        return `<tr><td>${R.fmtKorMoney(a)}</td><td class="r">${c.tiered ? "실효" : "적용"} ${c.rate.toFixed(2)}%</td><td class="r rate-em">+${R.won(c.daily)}</td><td class="r">${R.won(c.daily * 30)}</td><td class="r">${R.won(c.daily * 365)}</td></tr>`;
      })
      .join("");

    const related = instantTop
      .filter((q) => R.slugify(q) !== slug)
      .slice(0, 5)
      .map((q) => `<a href="${encodeURIComponent(R.slugify(q))}">${q.bank} ${q.product}<span class="r-rate">연 ${q.maxRate?.toFixed(2)}%</span></a>`)
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
        c1.applied < DEFAULT_AMT
          ? `<p class="prose">현재 <b>${PARKING_LIST.length}개 파킹통장 중 명목 최고금리 1위</b> 상품입니다. 단 최고 연 ${p.maxRate?.toFixed(2)}%는 <b>${R.fmtKorMoney(c1.applied)}까지만</b> 적용되는 소액 우대형이라, 1천만원을 넣어도 하루 세후 이자는 <b>+${R.won(myDaily)}</b>입니다. ${R.fmtKorMoney(c1.applied)} 이하 비상금 통장으로 쓰고 나머지는 한도가 넉넉한 통장에 나누는 것이 정석입니다.${sameBankProse}</p>`
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
    faqs.push({
      q: `${p.bank} 파킹통장은 예금자보호가 되나요?`,
      a: `네. ${p.bank}(${p.group})은 예금자보호법 적용 대상이라 원금과 이자를 합해 1인당 최고 1억 원까지 보호됩니다(2025년 9월 1일부터 5천만 원에서 1억 원으로 상향). 한도는 원금이 아니라 이자까지 더한 금액 기준이므로, 원금을 1억 원에 꽉 채우면 이자는 보호 범위를 벗어납니다. 1억 원을 넘는 돈은 여러 금융회사에 나누면 각각 보호받을 수 있습니다.`,
    });
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
    const calcScript = `<script src="../render-card.js"></script>
<script>(function(){
var P=${calcProduct};
var amt=document.getElementById("pc-amt"),d=document.getElementById("pc-d"),m=document.getElementById("pc-m"),y=document.getElementById("pc-y"),note=document.getElementById("pc-note");
function upd(){var a=parseAmount(amt.value)||0;var c=calcDaily(P,a);
d.textContent="+"+won(c.daily);m.textContent=won(c.daily*30);y.textContent=won(c.daily*365);
note.textContent=(c.tiered?"구간 반영 실효금리 연 ":"적용 금리 연 ")+c.rate.toFixed(2)+"%"+(c.applied<a?" · "+fmtKorMoney(c.applied)+"까지만 최고금리 적용, 초과분은 계산 제외":"");
if(a)amt.value=fmt(a);}
amt.addEventListener("input",upd);upd();
})();</script>`;

    const body = `
  <div class="crumb"><a href="../">홈</a> › <a href="../parking">파킹통장 전체 목록</a> › <a href="../parking#${encodeURIComponent(p.bank)}">${p.bank}</a> › ${p.product}</div>
  <div class="prod-head">
    <div class="bank">${p.bank} · ${p.group}</div>
    <h1>${p.product} 금리 <span class="em">연 ${p.maxRate?.toFixed(2)}%</span></h1>
  </div>
  ${badges}
  ${p.notice ? `<div class="notice gray"><span class="ic">🔔</span><span>${p.notice}</span></div>` : ""}

  <div class="summary">
    <div class="row"><span class="k">최고 금리</span><span class="v hl">연 ${p.maxRate?.toFixed(2)}%</span></div>
    <div class="row"><span class="k">기본 금리</span><span class="v">연 ${p.baseRate?.toFixed(2)}%</span></div>
    <div class="row"><span class="k">우대/한도 조건</span><span class="v">${p.maxRateCondition || "-"}</span></div>
    <div class="row"><span class="k">이자 지급</span><span class="v">${p.payout}</span></div>
    <div class="row"><span class="k">금리 기준일</span><span class="v">${p.asOf}${p.needsVerify ? " (변동 가능)" : ""}</span></div>
  </div>

  <div class="btns">${officialBtn}${appBtns}</div>

  ${timingProse}
  ${compareProse}
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

  <h2 class="sec">함께 볼 만한 파킹통장</h2>
  <div class="related">${related}</div>

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
  <h3 class="sec" id="${encodeURIComponent(bank)}" style="font-size:17px">${bank} <small>${items.length}개 · ${items[0].p.group}</small></h3>
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
          `<td class="r">${x.tiered ? "실효 " : ""}연 ${x.rate.toFixed(2)}%</td>` +
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
  <div class="crumb"><a href="../">홈</a> › <a href="parking">파킹통장 전체 목록</a> › 쪼개기 계산기</div>
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

  <script src="render-card.js"></script>
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
  <div class="tbl-wrap"><table>${rateTable(DATA.topSavings)}</table></div>`,
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
  const ALL_GUIDES = require("./guides-content.js");
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
      author: { "@type": "Organization", name: "이자계산기 (ijacalc.com)" },
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
  const CONTACT = "skyhightomorrow@gmail.com";

  fs.writeFileSync(
    path.join(PUB, "about.html"),
    layout({
      title: "사이트 소개 | 이자계산기 (ijacalc.com)",
      desc: "이자계산기는 금융감독원·저축은행중앙회 공시 데이터를 매일 수집해 파킹통장·예적금 금리를 비교하고 세후 이자를 계산해주는 정보 서비스입니다.",
      canonicalPath: "/about.html",
      body: `
  <div class="hero"><h1>사이트 <span class="em">소개</span></h1></div>
  <div class="prose">
    <p><b>이자계산기(ijacalc.com)</b>는 "오늘 돈을 넣으면 언제, 얼마의 이자를 받을 수 있는지"를
    가장 쉽게 알려드리기 위해 만든 금리 정보 서비스입니다.</p>
    <p style="margin-top:12px"><b>데이터는 이렇게 만들어집니다.</b></p>
    <ul style="margin:8px 0 0 20px; line-height:1.9">
      <li>금융감독원 금융상품통합비교공시 「금융상품한눈에」 오픈API — 정기예금·적금·대출 공시</li>
      <li>저축은행중앙회 소비자포털 — 입출금자유예금(파킹통장) 공시</li>
      <li>매일 새벽 자동으로 수집·갱신되며, 각 상품에 금리 기준일을 표시합니다</li>
    </ul>
    <p style="margin-top:12px"><b>계산 기준.</b> 모든 이자는 이자소득세 15.4%(소득세 14% + 지방소득세 1.4%)를
    차감한 세후 금액으로, 단리 기준으로 계산합니다. 상품별 우대조건·한도(예: "1억원 이하")는 계산에 자동 반영됩니다.</p>
    <p style="margin-top:12px"><b>알려드립니다.</b> 본 사이트는 정보 제공 목적의 서비스로,
    금융상품을 판매·중개하지 않으며 어떤 금융회사로부터도 광고비나 수수료를 받지 않습니다.
    금리는 수시로 변동될 수 있으므로 실제 가입 전 반드시 해당 금융회사의 공식 페이지에서 확인하세요.</p>
    <p style="margin-top:12px"><b>문의.</b> 데이터 오류 제보나 제휴 문의는 <a href="mailto:${CONTACT}">${CONTACT}</a>로 보내주세요.</p>
  </div>`,
    })
  );

  fs.writeFileSync(
    path.join(PUB, "privacy.html"),
    layout({
      title: "개인정보처리방침 | 이자계산기 (ijacalc.com)",
      desc: "이자계산기(ijacalc.com)의 개인정보처리방침입니다.",
      canonicalPath: "/privacy.html",
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
function buildSitemap(slugs, guideSlugs, amountSlugs) {
  const today = DATA.builtAt.slice(0, 10);
  const urls = [
    "/", "/parking", "/calculator", "/split", "/new", "/rates", "/loans", "/guide", "/about", "/privacy",
    ...amountSlugs.map((s) => `/amount/${encodeURIComponent(s)}`),
    ...guideSlugs.map((s) => `/guide/${encodeURIComponent(s)}`),
    ...slugs.map((s) => `/p/${encodeURIComponent(s)}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${ORIGIN}${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
</urlset>`;
  fs.writeFileSync(path.join(PUB, "sitemap.xml"), xml);
  fs.writeFileSync(path.join(PUB, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
}

buildIndex();
buildCalculator();
const slugs = buildProductPages();
buildParkingHub();
const amountSlugs = buildAmountPages();
buildSplitPage();
buildListPages();
const guideSlugs = buildGuidePages();
buildInfoPages();
buildSitemap(slugs, guideSlugs, amountSlugs);
console.log(`페이지 생성 완료: index + 계산기 + 전체목록 허브 + 금액대별 ${amountSlugs.length}개 + 쪼개기 + rates/loans/new + 가이드 ${guideSlugs.length}편 + 상품 ${slugs.length}개 + sitemap (${ORIGIN})`);
