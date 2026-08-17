/**
 * 실효금리 순위 — /p/ 상품 페이지용 집계·해석 (2026-08-17 신설)
 *
 * 왜 만들었나 — 2026-08-16에 `/calculator`·`/parking`·`/p/` 계열이 「크롤링됨-현재 색인이 생성되지 않음」으로
 * 7건→29건(4배)으로 늘어난 것이 확인됐다. 8/17 실측으로 원인을 좁혔다:
 *   /bank/ 97p 는 페이지 간 고유성 61.7~78.7% · 본문 1,812~4,283자(편차 큼) → 건강함
 *   /p/ 156p 는 고유성 44.8~55.6% · 본문 2,055~2,803자(**편차 거의 없음**) → 템플릿 지배
 * seo-common-checklist의 thin content 판별 기준이 "글자수가 아니라 편차"인데 /p/가 정확히 그 케이스다.
 *
 * 처방 — 새 데이터를 가져오지 않고, A가 이미 계산하던 **실효금리**를 156개 전체에 걸쳐 순위로 집계한다.
 * 광고 최고금리는 한도·우대조건 때문에 실제 수령액과 크게 어긋나는데, 그 낙차가 상품마다 완전히 다르다:
 *   2026-08-17 실측 — 광고순위 ≠ 실효순위인 상품이 **125/156(80%)**,
 *   OK짠테크통장Ⅱ는 광고 2위(7.00%) → 1,000만원 실효 91위(0.45%) = 광고의 6%.
 *   금액대별로 순위가 5계단 이상 움직이는 상품도 **50개(32%)**(SBI 생활파킹통장 1위→45위→74위→95위).
 * 즉 이 축은 페이지마다 문장이 완전히 달라지는 = 편차를 만드는 축이다.
 *
 * 🔑 이 방향은 8/11에 이미 검증된 것이기도 하다 — 같은 계산으로 만든 가이드
 *    `/guide/파킹통장-실효금리-순위`가 그 근거였고(guides-content.js), 그걸 상품 페이지로 내린 것이다.
 * 🔑 네이버 실적도 이 의도를 가리킨다(2026-08-17): 「카카오뱅크 세이프박스 이자 계산법」 CTR 40% ·
 *    「플러스박스 이자 계산」 50% · 「케이뱅크 플러스박스 이자 계산」 60% = 전부 "실제로 얼마 붙나" 의도다.
 *
 * ⚠️ 실효금리는 render-card.js의 calcDaily가 유일한 계산 주체다. 여기서 따로 계산하지 말 것 —
 *    브라우저 계산기와 숫자가 갈리면 페이지가 자기모순을 일으킨다.
 */

// 상품 페이지에 노출할 금액대. 홈/계산기의 기본값(1,000만원)을 가운데 두고 양옆을 잡는다.
const AMOUNTS = [
  { won: 1000000, label: '100만원' },
  { won: 10000000, label: '1,000만원' },
  { won: 50000000, label: '5,000만원' },
  { won: 100000000, label: '1억원' },
];

const keyOf = (p) => `${p.bank}|${p.product}`;

/**
 * @param items [{p, slug}] — build-pages의 PARKING_LIST 그대로
 * @param R     public/render-card.js (calcDaily 제공)
 */
function buildEffIndex(items, R) {
  const total = items.length;

  // 광고(명목) 최고금리 순위
  const byAd = [...items].sort((a, b) => (b.p.maxRate || 0) - (a.p.maxRate || 0));
  const adRank = new Map(byAd.map((it, i) => [keyOf(it.p), i + 1]));

  // 금액대별 실효금리 순위
  const effRankByAmt = {};   // won → Map(key → rank)
  const effRateByAmt = {};   // won → Map(key → rate)
  const sortedByAmt = {};    // won → [{p, slug, rate}]
  for (const a of AMOUNTS) {
    const scored = items.map((it) => ({ ...it, rate: R.calcDaily(it.p, a.won).rate }));
    scored.sort((x, y) => y.rate - x.rate);
    effRankByAmt[a.won] = new Map(scored.map((s, i) => [keyOf(s.p), i + 1]));
    effRateByAmt[a.won] = new Map(scored.map((s) => [keyOf(s.p), s.rate]));
    sortedByAmt[a.won] = scored;
  }

  return { total, adRank, effRankByAmt, effRateByAmt, sortedByAmt, AMOUNTS };
}

const DEFAULT_WON = 10000000;

/** 한 상품의 광고 대비 실효 요약. 페이지 문장을 여기서 결정한다. */
function effSummary(p, index) {
  const k = keyOf(p);
  const ad = p.maxRate || 0;
  const adR = index.adRank.get(k);
  const effR = index.effRankByAmt[DEFAULT_WON].get(k);
  const eff = index.effRateByAmt[DEFAULT_WON].get(k);
  const drop = adR != null && effR != null ? effR - adR : 0; // 양수 = 실효 기준으로 밀림
  const ratio = ad > 0 ? eff / ad : 1;

  // 금액대별 순위 흔들림
  const ranks = index.AMOUNTS.map((a) => ({ ...a, rank: index.effRankByAmt[a.won].get(k), rate: index.effRateByAmt[a.won].get(k) }));
  const rs = ranks.map((r) => r.rank).filter((r) => r != null);
  const spread = rs.length ? Math.max(...rs) - Math.min(...rs) : 0;
  const best = ranks.reduce((a, b) => (a && a.rank <= b.rank ? a : b), null);
  const worst = ranks.reduce((a, b) => (a && a.rank >= b.rank ? a : b), null);

  return { ad, adR, eff, effR, drop, ratio, ranks, spread, best, worst, total: index.total };
}

/** 실효 기준으로 이 상품보다 나은 대안 n개(같은 상품 제외). 내부링크 공급도 겸한다. */
function betterAlternatives(p, index, n = 3, won = DEFAULT_WON) {
  const k = keyOf(p);
  const mine = index.effRateByAmt[won].get(k) ?? 0;
  return index.sortedByAmt[won].filter((x) => keyOf(x.p) !== k && x.rate > mine).slice(0, n);
}

/**
 * 실효금리 순위에서 이 상품의 바로 위·아래 이웃.
 *
 * 원래 「함께 볼 만한 파킹통장」은 전 상품 공통 top5(instantTop)를 뿌리고 있었다 —
 * 2026-08-17 실측에서 그게 **156p 전부에 똑같이 붙는 533자 블록**(본문 공통 1,197자 중 최대)이었고,
 * `/p/`의 본문 공통 비율 50%를 만든 주범이었다.
 * 이웃으로 바꾸면 페이지마다 목록이 달라지고, 사용자에게도 "내가 보던 것과 비슷한 조건의 대안"이라 더 맞다.
 */
function effNeighbors(p, index, n = 5, won = DEFAULT_WON) {
  const arr = index.sortedByAmt[won];
  const k = keyOf(p);
  const i = arr.findIndex((x) => keyOf(x.p) === k);
  if (i < 0) return [];
  const out = [];
  // 위로 n/2, 아래로 나머지 — 목록 끝에 걸리면 반대쪽에서 채운다
  const up = Math.ceil(n / 2);
  for (let d = 1; d <= arr.length && out.length < up; d++) if (arr[i - d]) out.push(arr[i - d]);
  for (let d = 1; d <= arr.length && out.length < n; d++) if (arr[i + d]) out.push(arr[i + d]);
  for (let d = up + 1; d <= arr.length && out.length < n; d++) if (arr[i - d]) out.push(arr[i - d]);
  return out.map((x) => ({ ...x, rank: index.effRankByAmt[won].get(keyOf(x.p)) }));
}

module.exports = { buildEffIndex, effSummary, betterAlternatives, effNeighbors, AMOUNTS, DEFAULT_WON, keyOf };
