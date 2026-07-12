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
    <a href="${base}calculator.html" class="${active === "calc" ? "active" : ""}">계산기</a>
    <a href="${base}new.html" class="${active === "new" ? "active" : ""}">신상품</a>
    <a href="${base}rates.html" class="${active === "rates" ? "active" : ""}">예·적금</a>
    <a href="${base}guide.html" class="${active === "guide" ? "active" : ""}">가이드</a>
  </nav>
  </div>`;

const FOOTER = (base = "") => `
  <footer>
    출처: 금융감독원 금융상품통합비교공시 「금융상품한눈에」, 저축은행중앙회 소비자포털 · 금리는 수시로 변동될 수 있으며 실제 가입 조건은 각 금융회사에서 확인하세요.<br>
    본 사이트는 정보 제공 목적이며 금융상품 판매·중개를 하지 않습니다. 어떤 금융회사로부터도 광고비나 수수료를 받지 않습니다.<br>
    <a href="${base}about.html">사이트 소개</a> · <a href="${base}privacy.html">개인정보처리방침</a>
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
      <a class="loan-btn" href="${base}loans.html">🏛️ 금감원 대출공시 조회</a>
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

// ---------- 이자계산기 (calculator.html) ----------
function buildCalculator() {
  const topParking = DATA.parking
    .filter((p) => p.instant)
    .map((p) => ({ p, d: R.calcDaily(p, DEFAULT_AMT).daily }))
    .sort((a, b) => b.d - a.d)
    .slice(0, 3);
  const topDepo = DATA.topDeposits.slice(0, 3);

  const parkingLinks = topParking
    .map((x) => `<a href="p/${encodeURIComponent(R.slugify(x.p))}.html">${x.p.bank} ${x.p.product}<span class="r-rate">연 ${x.p.maxRate?.toFixed(2)}%</span></a>`)
    .join("");
  const depoLinks = topDepo
    .map((r) => `<a href="rates.html">${r.bank} ${r.product}<span class="r-rate">연 ${r.maxRate?.toFixed(2)}%</span></a>`)
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

  fs.writeFileSync(
    path.join(PUB, "calculator.html"),
    layout({
      title: "이자계산기 — 예금·적금·파킹통장 세후 이자 계산 | ijacalc",
      desc: "예금 이자계산기, 적금 이자계산기, 파킹통장 하루 이자계산기. 이자소득세 15.4%를 차감한 세후 실수령 이자를 바로 계산하고, 오늘 금리가 가장 높은 상품도 확인하세요.",
      canonicalPath: "/calculator.html",
      body,
      active: "calc",
      extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
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

  const slugs = [];
  for (const p of DATA.parking) {
    const slug = R.slugify(p);
    if (slugs.includes(slug)) continue; // 동일 슬러그 중복 방지
    slugs.push(slug);

    const amounts = [1000000, 5000000, 10000000, 30000000, 50000000, 100000000];
    const calcRows = amounts
      .map((a) => {
        const c = R.calcDaily(p, a);
        return `<tr><td>${R.fmtKorMoney(a)}</td><td class="r">적용 ${c.rate.toFixed(2)}%</td><td class="r rate-em">+${R.won(c.daily)}</td><td class="r">${R.won(c.daily * 30)}</td><td class="r">${R.won(c.daily * 365)}</td></tr>`;
      })
      .join("");

    const related = instantTop
      .filter((q) => R.slugify(q) !== slug)
      .slice(0, 5)
      .map((q) => `<a href="${encodeURIComponent(R.slugify(q))}.html">${q.bank} ${q.product}<span class="r-rate">연 ${q.maxRate?.toFixed(2)}%</span></a>`)
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

    const body = `
  <div class="crumb"><a href="../">홈</a> › <a href="../">파킹통장</a> › ${p.product}</div>
  <div class="prod-head">
    <div class="bank">${p.bank} · ${p.group}</div>
    <h1>${p.product} 금리 <span class="em">연 ${p.maxRate?.toFixed(2)}%</span></h1>
  </div>

  <div class="summary">
    <div class="row"><span class="k">최고 금리</span><span class="v hl">연 ${p.maxRate?.toFixed(2)}%</span></div>
    <div class="row"><span class="k">기본 금리</span><span class="v">연 ${p.baseRate?.toFixed(2)}%</span></div>
    <div class="row"><span class="k">우대/한도 조건</span><span class="v">${p.maxRateCondition || "-"}</span></div>
    <div class="row"><span class="k">이자 지급</span><span class="v">${p.payout}</span></div>
    <div class="row"><span class="k">금리 기준일</span><span class="v">${p.asOf}${p.needsVerify ? " (변동 가능)" : ""}</span></div>
  </div>

  <div class="btns">${officialBtn}${appBtns}</div>

  ${timingProse}

  <h2 class="sec">금액별 예상 이자 <small>세후 · 이자소득세 15.4% 차감</small></h2>
  <div class="tbl-wrap"><table>
    <tr><th>예치 금액</th><th class="r">적용 금리</th><th class="r">하루</th><th class="r">한 달(30일)</th><th class="r">1년</th></tr>
    ${calcRows}
  </table></div>

  <h2 class="sec">함께 볼 만한 파킹통장</h2>
  <div class="related">${related}</div>`;

    const title = `${p.bank} ${p.product} 금리 연 ${p.maxRate?.toFixed(2)}% — 하루 이자 계산 | 이자계산기`;
    const desc = `${p.bank} ${p.product} 파킹통장: 최고 연 ${p.maxRate?.toFixed(2)}% (기본 ${p.baseRate?.toFixed(2)}%), ${p.maxRateCondition || ""}. 1천만원 예치 시 하루 세후 ${R.won(R.calcDaily(p, DEFAULT_AMT).daily)}. 금액별 이자 계산표 제공.`;
    fs.writeFileSync(
      path.join(dir, `${slug}.html`),
      layout({
        title,
        desc,
        canonicalPath: `/p/${encodeURIComponent(slug)}.html`,
        body,
        depth: 1,
        active: "instant",
        extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
      })
    );
  }
  return slugs;
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
      canonicalPath: "/rates.html",
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
      canonicalPath: "/loans.html",
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
      canonicalPath: "/new.html",
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
      .map((x) => `<a href="${encodeURIComponent(x.slug)}.html">${x.title}</a>`)
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
        canonicalPath: `/guide/${encodeURIComponent(g.slug)}.html`,
        depth: 1,
        active: "guide",
        extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
        body: `
  <div class="crumb"><a href="../">홈</a> › <a href="../guide.html">가이드</a></div>
  <div class="prod-head"><h1>${g.title}</h1></div>
  <div class="prose" style="font-size:15px">${g.body}</div>
  <h2 class="sec">다른 가이드</h2>
  <div class="related">${others}</div>`,
      })
    );
  }

  // 가이드 목록 페이지 (최신 글 먼저)
  const list = [...GUIDES].sort((a, b) => b.date.localeCompare(a.date)).map(
    (g) => `<a class="related-item" href="guide/${encodeURIComponent(g.slug)}.html" style="display:block; padding:18px 4px; border-bottom:1px solid var(--border); text-decoration:none; color:inherit">
      <div style="font-size:16.5px; font-weight:700">${g.title}</div>
      <div style="font-size:13px; color:var(--sub); margin-top:5px; line-height:1.6">${g.desc}</div>
    </a>`
  ).join("");

  fs.writeFileSync(
    path.join(PUB, "guide.html"),
    layout({
      title: "금리·이자 가이드 — 파킹통장, 세금, 예금자보호 총정리 | 이자계산기",
      desc: "파킹통장 원리, 이자소득세 15.4%, 예금자보호 1억원, CMA 비교, 우대금리 함정까지 — 이자 재테크에 필요한 지식을 정리한 가이드 모음입니다.",
      canonicalPath: "/guide.html",
      active: "guide",
      body: `
  <div class="hero"><h1>금리·이자 <span class="em">가이드</span></h1><p>이자 재테크에 필요한 지식을 하나씩, 정확하게</p></div>
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
function buildSitemap(slugs, guideSlugs) {
  const today = DATA.builtAt.slice(0, 10);
  const urls = [
    "/", "/calculator.html", "/new.html", "/rates.html", "/loans.html", "/guide.html", "/about.html", "/privacy.html",
    ...guideSlugs.map((s) => `/guide/${encodeURIComponent(s)}.html`),
    ...slugs.map((s) => `/p/${encodeURIComponent(s)}.html`),
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
buildListPages();
const guideSlugs = buildGuidePages();
buildInfoPages();
buildSitemap(slugs, guideSlugs);
console.log(`페이지 생성 완료: index + 계산기 + rates/loans/new + 가이드 ${guideSlugs.length}편 + 상품 ${slugs.length}개 + sitemap (${ORIGIN})`);
