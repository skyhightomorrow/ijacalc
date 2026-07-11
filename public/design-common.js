// 시안 공용 로직 — 데이터 로드, 계산, 렌더링 (디자인별 카드 템플릿만 주입)
const fmt = (n) => n.toLocaleString("ko-KR");
const won = (n) => fmt(Math.round(n)) + "원";
const TAX = 0.154;

function parseAmount(v) {
  return parseInt(String(v).replace(/[^0-9]/g, ""), 10) || 0;
}

// 한도 문구 해석 — "1억원 이하"(그 금액까지 최고금리), "3천만원 초과"(넘어야 최고금리) 구분
function parseCondition(s) {
  if (!s) return { type: "none", value: null };
  const raw = s.replace(/\s|,/g, "");
  let value = null;
  let m = raw.match(/([0-9]+)억/);
  if (m) value = parseInt(m[1], 10) * 100000000;
  else if ((m = raw.match(/([0-9]{4,})원?/))) value = parseInt(m[1], 10);
  if (value == null) return { type: "none", value: null };
  if (/초과|이상/.test(raw)) return { type: "above", value };
  if (/이하|미만|까지/.test(raw)) return { type: "upto", value };
  return { type: "none", value: null };
}

function naverLink(bank, product) {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(bank + " " + product)}`;
}

function nameLink(bank, product) {
  return `<a href="${naverLink(bank, product)}" target="_blank" rel="noopener" class="cell-lk">${product} ↗</a>`;
}

const IS_ANDROID = /Android/i.test(navigator.userAgent);
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

// 모바일에서만 앱스토어 링크 반환 (검증된 스토어 ID가 있는 상품만)
function appStoreLink(p) {
  if (IS_ANDROID && p.appAndroid) return `https://play.google.com/store/apps/details?id=${p.appAndroid}`;
  if (IS_IOS && p.appIos) return `https://apps.apple.com/kr/app/id${p.appIos}`;
  return null;
}

function payoutBadge(p) {
  if (p.payout === "매일 자동") return '<span class="badge daily">매일 자동 입금</span>';
  if (p.payout === "수시지급") return '<span class="badge instant">원할 때 바로 받기</span>';
  return `<span class="badge monthly">${p.payout}</span>`;
}

function initSite(opts) {
  let DATA = null;
  const cardTemplate = opts.cardTemplate;

  function renderInstant() {
    const amt = parseAmount(document.getElementById("amount").value);
    const list = DATA.parking
      .filter((p) => p.instant)
      .map((p) => {
        const cond = parseCondition(p.maxRateCondition);
        let applied = amt;
        let rate = p.maxRate || 0;
        if (cond.type === "upto") applied = Math.min(amt, cond.value);
        else if (cond.type === "above" && amt <= cond.value) rate = p.baseRate ?? rate;
        const daily = ((applied * rate) / 100 / 365) * (1 - TAX);
        return { ...p, _applied: applied, _daily: daily };
      })
      .sort((a, b) => b._daily - a._daily);

    document.getElementById("instant-list").innerHTML = list
      .map((p, i) => cardTemplate(p, p._applied, p._daily, p._daily * 30, i))
      .join("");

    const rest = DATA.parking.filter((p) => !p.instant).slice(0, 20);
    const restEl = document.getElementById("parking-rest");
    if (restEl)
      restEl.innerHTML =
        "<tr><th>저축은행</th><th>상품</th><th class='r'>최고금리</th><th>지급</th><th>조건</th></tr>" +
        rest
          .map(
            (p) =>
              `<tr><td>${p.bank}</td><td>${nameLink(p.bank, p.product)}</td><td class="r rate-em">${p.maxRate?.toFixed(2)}%</td><td>${p.payout}</td><td><span class="b2">${p.maxRateCondition || ""}</span></td></tr>`
          )
          .join("");
  }

  function renderNew() {
    const el = document.getElementById("new-list");
    if (!el) return;
    if (!DATA.newProducts.length) {
      el.innerHTML = `<div class="empty">아직 감지된 신규 상품이 없습니다.<br>매일 공시를 수집해서 새로 등장한 예·적금이 생기면 이곳에 표시됩니다.</div>`;
      return;
    }
    const kindName = { deposit: "정기예금", saving: "적금" };
    el.innerHTML = DATA.newProducts
      .map(
        (p) => `<div class="card"><div class="row1">
          <div><div class="bank">${p.bank} · ${p.group} · ${kindName[p.kind] || p.kind}</div><div class="name">${nameLink(p.bank, p.product)}</div></div>
          ${p.maxRate ? `<div class="rate"><span class="big">최고 ${p.maxRate.toFixed(2)}%</span></div>` : ""}
        </div><div class="cond">공시 시작일 ${p.disclosureStart || "-"}</div></div>`
      )
      .join("");
  }

  function renderRateTable(id, rows) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML =
      "<tr><th>#</th><th>금융회사</th><th>상품</th><th class='r'>최고</th><th class='r'>기본</th><th>우대조건</th></tr>" +
      rows
        .map(
          (r, i) =>
            `<tr><td>${i + 1}</td><td>${r.bank}<div class="b2">${r.group}</div></td><td>${nameLink(r.bank, r.product)}${r.reserveType ? `<div class="b2">${r.reserveType}</div>` : ""}</td><td class="r rate-em">${r.maxRate?.toFixed(2)}%</td><td class="r">${r.baseRate?.toFixed(2)}%</td><td><span class="b2">${(r.specialCondition || "-").slice(0, 80)}</span></td></tr>`
        )
        .join("");
  }

  function renderLoanTable(id, rows, credit) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML =
      `<tr><th>금융회사</th><th>상품</th><th class='r'>${credit ? "1등급" : "최저"}</th><th class='r'>평균</th><th>유형</th></tr>` +
      rows
        .map(
          (r) =>
            `<tr><td>${r.bank}</td><td>${nameLink(r.bank, r.product)}</td><td class="r rate-em">${r.minRate != null ? r.minRate.toFixed(2) + "%" : "-"}</td><td class="r">${r.avgRate != null ? r.avgRate.toFixed(2) + "%" : "-"}</td><td><span class="b2">${r.detail || ""}</span></td></tr>`
        )
        .join("");
  }

  fetch("data.json")
    .then((r) => r.json())
    .then((d) => {
      DATA = d;
      const up = document.getElementById("updated");
      if (up)
        up.textContent = `${new Date(d.builtAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} 업데이트`;
      renderInstant();
      renderNew();
      renderRateTable("deposit-table", d.topDeposits);
      renderRateTable("saving-table", d.topSavings);
      renderLoanTable("loan-mortgage", d.loans.mortgage);
      renderLoanTable("loan-rent", d.loans.rent);
      renderLoanTable("loan-credit", d.loans.credit, true);
      if (opts.onLoaded) opts.onLoaded(d);
    });

  document.getElementById("amount").addEventListener("input", (e) => {
    const n = parseAmount(e.target.value);
    e.target.value = n ? fmt(n) : "";
    if (DATA) renderInstant();
  });

  document.querySelectorAll("nav.tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll("section.panel").forEach((s) => s.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    });
  });
}
