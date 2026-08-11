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
  // p.tiers가 있으면 구간별(marginal) 계산 — 각 구간 금액분에 그 구간 금리를 적용한다.
  // 없으면 공시의 최고금리·한도조건으로 계산하되, 한도를 넘긴 금액분에는 기본금리를 적용한다.
  //   (2026-08-11 변경: 이전에는 초과분을 계산에서 아예 제외해 이자를 0으로 봤는데,
  //    한도를 넘긴 돈도 그 통장에 두면 기본금리는 받으므로 과소 계산이었다.
  //    가이드 기사 /guide/파킹통장-실효금리-순위 의 실효금리와 계산 기준을 일치시킨 것이기도 하다.)
  // 반환값:
  //   rate    — 표시용 실효 연이율(한도·구간이 섞이면 금액 가중평균)
  //   blended — rate가 단일 금리가 아니라 혼합 결과인가(표시를 "실효"로 바꾸는 신호)
  //   capLimit— 최고금리가 적용되는 상한(초과분이 실제로 생긴 경우에만 값이 있음)
  //   applied — 이자가 붙는 원금. 이제 항상 amt와 같다(초과분도 기본금리를 받으므로).
  function calcDaily(p, amt) {
    if (p.tiers && p.tiers.length) {
      let pretax = 0;
      let prev = 0;
      for (const t of p.tiers) {
        const top = t.upto == null ? Infinity : t.upto;
        const portion = Math.min(amt, top) - prev;
        if (portion <= 0) continue;
        pretax += (portion * (t.rate || 0)) / 100 / 365;
        prev = top;
        if (prev >= amt) break;
      }
      const daily = pretax * (1 - TAX);
      // 표시용 실효금리 — 구간이 섞이면 단일 금리로 말할 수 없으므로 가중평균을 쓴다
      const rate = amt > 0 ? ((pretax * 365) / amt) * 100 : 0;
      return { applied: amt, rate, daily, tiered: true, blended: true, capLimit: null };
    }
    const cond = parseCondition(p.maxRateCondition);
    const maxRate = p.maxRate || 0;
    const baseRate = p.baseRate != null ? p.baseRate : maxRate;
    let rate = maxRate;
    let capLimit = null;
    let blended = false;
    if (cond.type === "upto" && amt > cond.value) {
      // 한도 이하분 = 최고금리, 초과분 = 기본금리 → 금액 가중평균이 실효금리
      capLimit = cond.value;
      blended = true;
      rate = (cond.value * maxRate + (amt - cond.value) * baseRate) / amt;
    } else if (cond.type === "above" && amt <= cond.value) {
      rate = baseRate;
    }
    const daily = ((amt * rate) / 100 / 365) * (1 - TAX);
    return { applied: amt, rate, daily, tiered: false, blended, capLimit };
  }

  function condTag(p, amt) {
    const cond = parseCondition(p.maxRateCondition);
    if (cond.type === "none") {
      return /제한없음/.test(p.maxRateCondition || "") ? '<span class="tag free">한도 제한 없음</span>' : "";
    }
    const label = fmtKorMoney(cond.value);
    if (cond.type === "upto") {
      const hit = amt > cond.value;
      const base = p.baseRate != null ? ` 연 ${p.baseRate.toFixed(2)}%` : "";
      return `<span class="tag ${hit ? "cond-hit" : "cond"}">${label}까지만 최고금리${hit ? ` · 초과분은 기본금리${base}` : ""}</span>`;
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
    const name = `<a href="p/${encodeURIComponent(slugify(p))}">${p.product}<span class="lk">자세히 ↗</span></a>`;
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
