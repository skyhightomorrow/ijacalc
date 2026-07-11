# 이자계산기 (ijacalc.com)

오늘 넣으면 바로 이자 주는 파킹통장 비교 + 예금·적금·파킹 이자계산기.
매일 금융감독원·저축은행중앙회 공시를 수집해 정적 페이지로 재생성한다.

## 구조

```
scripts/
  fetch-finlife.js     금감원 금융상품한눈에 API 수집 (예금·적금·대출) + 신상품 diff
  fetch-parking.js     저축은행중앙회 입출금자유예금 공시 스크래핑 (지급방식 태깅) + 신상품 diff
  build-site-data.js   수집 데이터 → public/data.json
  build-pages.js       정적 HTML 전체 생성 (index, calculator, 상품 157+, sitemap)
curated/
  parking-manual.json  인터넷은행 등 공시 밖 상품 수동 큐레이션 (금리 기준일·앱스토어 ID 포함)
public/                배포 대상 (Cloudflare Pages 루트)
  render-card.js       카드 렌더러 — Node 빌드와 브라우저 하이드레이션 공용
data/                  수집 원본 (latest.json 등은 신상품 diff를 위해 커밋됨, history/는 제외)
```

## 실행

```bash
npm run daily    # 수집 → 데이터 빌드 → 페이지 생성 (전체)
npm run start    # 로컬 서버 (port 3350)
```

환경변수(.env 또는 CI 시크릿): `FINLIFE_API_KEY`(금감원 오픈API 인증키), `SITE_ORIGIN`(canonical/sitemap용).

## 자동화

`.github/workflows/daily.yml` — 매일 KST 05:30에 GitHub Actions가 `npm run daily`를 실행하고
변경분을 커밋하면 Cloudflare Pages가 자동 재배포한다.
