// 파킹통장 카드 렌더러 — 빌드(Node)와 브라우저 하이드레이션에서 공용 사용
(function (root) {
  const TAX = 0.154;
  const fmt = (n) => n.toLocaleString("ko-KR");
  const won = (n) => fmt(Math.round(n)) + "원";

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

  function fmtKorMoney(v) {
    if (v >= 100000000) return (v % 100000000 === 0 ? v / 100000000 : (v / 100000000).toFixed(1)) + "억원";
    if (v >= 10000000) return v / 10000000 + "천만원";
    if (v >= 10000) return fmt(v / 10000) + "만원";
    return fmt(v) + "원";
  }

  // 입력 금액 기준 적용 원금·금리·하루 세후 이자 계산
  function calcDaily(p, amt) {
    const cond = parseCondition(p.maxRateCondition);
    let applied = amt;
    let rate = p.maxRate || 0;
    if (cond.type === "upto") applied = Math.min(amt, cond.value);
    else if (cond.type === "above" && amt <= cond.value) rate = p.baseRate ?? rate;
    const daily = ((applied * rate) / 100 / 365) * (1 - TAX);
    return { applied, rate, daily };
  }

  function condTag(p, amt) {
    const cond = parseCondition(p.maxRateCondition);
    if (cond.type === "none") {
      return /제한없음/.test(p.maxRateCondition || "") ? '<span class="tag free">한도 제한 없음</span>' : "";
    }
    const label = fmtKorMoney(cond.value);
    if (cond.type === "upto") {
      const hit = amt > cond.value;
      return `<span class="tag ${hit ? "cond-hit" : "cond"}">${label}까지만 최고금리${hit ? " · 초과분 계산 제외" : ""}</span>`;
    }
    const miss = amt <= cond.value;
    return `<span class="tag ${miss ? "cond-hit" : "cond"}">${label} 넘어야 최고금리${miss ? " · 지금은 기본금리 적용" : ""}</span>`;
  }

  function slugify(p) {
    return (p.bank + "-" + p.product).replace(/\s+/g, "-").replace(/[^\w가-힣-]/g, "");
  }

  // 모바일에서만 앱스토어 링크 (브라우저 전용)
  function appStoreLink(p) {
    if (typeof navigator === "undefined") return null;
    if (/Android/i.test(navigator.userAgent) && p.appAndroid)
      return `https://play.google.com/store/apps/details?id=${p.appAndroid}`;
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent) && p.appIos)
      return `https://apps.apple.com/kr/app/id${p.appIos}`;
    return null;
  }

  function renderParkingCard(p, amt) {
    const { daily } = calcDaily(p, amt);
    const monthly = daily * 30;
    const app = appStoreLink(p);
    const name = `<a href="p/${encodeURIComponent(slugify(p))}.html">${p.product}<span class="lk">자세히 ↗</span></a>`;
    return `
    <div class="card">
      <div class="left">
        <div class="bank">${p.bank} · ${p.group}</div>
        <div class="name">${name}</div>
        <div class="rateline">연 <b>${p.maxRate?.toFixed(2)}%</b> (기본 ${p.baseRate?.toFixed(2)}%) · 기준일 ${p.asOf}</div>
        <div class="tags">
          ${condTag(p, amt)}
          ${p.needsVerify ? '<span class="tag verify">금리 변동 가능</span>' : ""}
        </div>
        ${p.timing ? `<div class="timing"><span class="tic">오늘 입금 →</span> ${p.timing}</div>` : ""}
        ${app ? `<a class="app-chip" href="${app}" target="_blank" rel="noopener">📱 앱에서 열기</a>` : ""}
      </div>
      <div class="right">
        <div class="daily">+${won(daily)}<small>/하루</small></div>
        <div class="mo">한 달 약 ${won(monthly)}</div>
      </div>
    </div>`;
  }

  function renderInstantList(parking, amt) {
    return parking
      .filter((p) => p.instant)
      .map((p) => ({ p, d: calcDaily(p, amt).daily }))
      .sort((a, b) => b.d - a.d)
      .map((x) => renderParkingCard(x.p, amt))
      .join("");
  }

  const api = { fmt, won, parseAmount, parseCondition, fmtKorMoney, calcDaily, condTag, slugify, appStoreLink, renderParkingCard, renderInstantList, TAX };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== "undefined" ? window : globalThis);
