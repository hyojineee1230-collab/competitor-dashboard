# 경쟁사 모니터

경쟁사 주가·보도·공시 흐름과 산업별(건강기능식품 · 마이크로바이옴 신약) 시장·실적을 한 화면에서 보는 정적 대시보드입니다.
GitHub Pages로 호스팅하고, GitHub Actions가 하루 2회 전체 수집 + 평일 매시 뉴스·장중 시세를 갱신합니다.

## 화면 구성
| 경로 | 성격 |
|---|---|
| `/` | 메인: 그래프 중심·큰 숫자, AI 정리 문장 없음. 그래프를 누르면 그 지점 숫자, 카드 아래 '숫자 보기' 표, 회사를 누르면 약식 손익계산서. 휴대폰은 아래 알약 메뉴 |
| `/report/` | 월간 리포트 호 목록 → `report/issue.html?m=YYYY-MM` (기준일 데이터 고정, v1 양식 + 인사이트·섹션 갱신 표시, 인쇄·PDF) |
| `/v1/` | 2026.10 이전 메인 보관본(입체 그래프·탭형). 데이터는 메인과 같은 파일을 읽어 계속 갱신 |

예전 주소 `/summary/`는 `/`로, `/detail/`은 `/v1/`로, 예전 탭 해시(`#biz`·`#hff` 등)는 같은 분야 인사이트로 이동합니다.

메인 주소 해시는 `#<메뉴>/<분야>`입니다.
- 메뉴: `insight`(인사이트) · `quotes`(시세) · `finance`(재무) · `market`(시장) · `news`(공시·기사)
- 분야: `core`(핵심 경쟁사, `biz` 그룹) · `hff` · `microbiome` — 고른 분야는 브라우저에만 기억

- 메인 코드: `assets/core.js`(데이터·라우팅·헤더·갱신 현황·SVG 그래프·숫자 확인) · `assets/summary.js`(메뉴별 화면·약식 손익) · `assets/app.css` · `assets/colors.js`(회사 색, v1·리포트와 공유). 외부 라이브러리 없음.
- 헤더 아래 **갱신 현황 한 줄**: 시세·기사(`live.json`·`newsfx.json`), 공시·종가(`meta.json`), 재무(최근 분기), 시장(최근 연도).
- 약식 손익계산서·기업가치(PSR·비상장 추정)·최근 공시/기사 표는 v1과 같은 계산·같은 분류 규칙을 씁니다.
- 이상 움직임 신호는 `scripts/newsfx.py`의 `signals`: 회사 고유 움직임(시장 조정 후 같은 분야 상장사 중앙값 차감)이 직전 60거래일 변동폭의 2배·최소 3% 이상이거나 거래량 3배일 때. 사유는 전 거래일~당일 DART 공시 → 주가 관련 유형 보도 → 미확인 순. 분야 상장사 70% 이상이 같은 방향인 날은 분야 전체 움직임으로 따로 표시합니다.
- 주별 보도 수는 `newsfx.json`의 `weekly`(최근 12주, 같은 소식 1건, 시세 기사 제외).
- 휴대폰(760px 이하): 그래프는 화면 폭에 맞춰 다시 그리고, 표는 회사별 카드로 바뀝니다.
- 재무 숫자는 **연결 기준**입니다. v1·리포트의 **별도 재무제표** 스위치로 별도 기준을 볼 수 있습니다(연결 재무제표가 없는 회사는 그대로).
- 시가총액 추이는 *현재 상장주식수 × 과거 종가* 근사입니다. 비상장사 기업가치는 같은 묶음 상장사 PSR로 계산한 **추정치**입니다.

## 월간 리포트
1. `python tools/monthly.py YYYY-MM --as-of YYYY-MM-DD` — 그날 데이터를 `data/reports/YYYY-MM/`에 고정하고, 섹션별 갱신 상태(이번 달 갱신/변동 없음)·기간 중 공시·보도·1개월 주가를 `report.json`에 집계, `data/reports/index.json`(호 목록)에 추가. 기간 = 직전 호 기준일 다음 날 ~ 이번 기준일.
2. 인사이트는 `report.json`의 `insights.<core|hff|microbiome>.items[{h,d,s}]`에 직접 씁니다(재무 숫자는 OpenDART 수집값만). 1을 다시 돌려도 인사이트는 유지됩니다.
3. v1 화면을 고쳤으면 `python tools/report_page.py`로 `report/issue.html`을 다시 만듭니다.

## 데이터 원칙
- **국내 재무 숫자는 OpenDART API에서만** 받습니다. 상장사는 `fnlttSinglAcnt`·`fnlttSinglAcntAll`(연결 기본, 별도는 `alt`), 비상장사·주석은 공시 원문(`document.xml`, 연결감사보고서가 있으면 연결 기본). Yahoo 재무는 DART가 없는 해외 종목만 씁니다.
- 국내 PER·PBR = KRX 시가총액 ÷ OpenDART 당기순이익·자본총계.
- 수동 정리 문장(`data/summaries.json`)에는 뉴스 출처 재무 숫자를 쓰지 않습니다.
- 인증키는 GitHub Secrets에만 둡니다. 수집 로그에서도 가려집니다.

## 갱신 주기
| 워크플로 | 시각(KST) | 하는 일 | 결과 |
|---|---|---|---|
| `update-data.yml` Update market data | 평일 08:30(전 영업일 KRX 종가)·16:40, 화~토 06:40, `config/**`·`scripts/**` push 시 | KRX 종가·시총·거래량·지수, DART 재무·공시, 해외 시세, 뉴스 아카이브, 보도 반응 분석 | `data/<그룹>.json`, `data/index.json`, `data/newsfx.json` 등 |
| `news-hourly.yml` Hourly news and quotes | 평일 08:07~20:07 매시 | 뉴스 아카이브, 보도 반응 재계산, 장중 지연 시세·지수(Yahoo) | `data/live.json`, `data/newsfx.json` |

같은 워크플로는 동시에 하나만 돕니다. 연달아 push하면 대기 중 실행이 교체됩니다.

## 뉴스 · 보도 반응
- `scripts/newsraw.py`: Google News RSS로 회사별 기사 × 매체 원본을 `data/news_raw.jsonl`에 쌓습니다(최근 3일·이번 달은 매 실행, 지난 2년은 달 단위 백필, 진행은 `data/news_state.json`). 기간 검색 결과는 날짜만 오므로 분석에서 시각 미상으로 처리합니다.
- `scripts/newsfx.py`: 같은 보도를 묶고 → 반응일(15:30 이후·휴장일은 다음 거래일) → 시장조정 누적수익률(0~2일)·거래량 배수 → 시세 기사·공시 겹침·연속 보도 제외 → 유형·매체 등급·시점·요일·매체 수·회사·키워드별 집계(n≥10, p<0.1이면 유의).
- `config/news_cats.json`: 기사 유형 분류 규칙(화면과 분석이 공유).
- `config/media.json`: 매체 등급(임시안)과 표기 통일(aliases). 등급에 없는 매체는 `newsfx.json`의 `unknownMedia`에 모입니다.
- 회사명 오탐은 `config/companies.json`의 `news_must`(필수 패턴)·`news_exclude`(제외 패턴)로 거릅니다.

## 폴더 구조
```
index.html · assets/           메인 (core.js · summary.js · app.css · colors.js)
v1/index.html                  이전 메인 보관본 (Chart.js, 단일 파일)
report/                        월간 리포트 (index.html 호 목록, issue.html 호 화면)
tools/monthly.py               월간 호 데이터 고정·집계
tools/report_page.py           v1 → report/issue.html 생성
summary/ · detail/             예전 주소 이동용
config/companies.json          회사 · 그룹(탭) 설정
config/news_cats.json          기사 유형 규칙
config/media.json              매체 등급 · 표기 통일
scripts/fetch_data.py          전체 수집 (OpenDART · KRX · Yahoo)
scripts/dart_audit.py          감사보고서 원문 손익 추출
scripts/krx.py                 KRX 일별매매·지수 (캐시 data/krx_cache.json)
scripts/activity.py            기사·공시 목록, 노이즈 필터
scripts/newsraw.py             뉴스 원본 아카이브
scripts/newsfx.py              보도 반응 이벤트 스터디
scripts/live.py                매시 갱신 진입점
scripts/make_sample.py         화면 확인용 샘플 데이터
data/                          수집 결과 (Actions 자동 커밋) + 수동 정리 summaries.json · market.json
data/reports/                  월간 호 (기준일 고정 데이터 + report.json)
```
수집기는 `summaries.json`·`market.json`을 건드리지 않습니다.

## 배포
1. **Settings → Pages** → `Deploy from a branch`, `main` / `(root)`
2. **Settings → Actions → General → Workflow permissions** → `Read and write permissions`
3. **Settings → Secrets and variables → Actions**에 `DART_API_KEY`(opendart.fss.or.kr), `KRX_API_KEY`(KRX OPEN API: 코스닥·유가증권 일별매매정보, 코스닥·코스피 지수 일별시세 이용신청)
4. **Actions → Update market data → Run workflow**로 첫 수집. KRX·뉴스 백필은 호출 한도 때문에 여러 실행에 나눠 채워집니다.

## 회사 · 탭 추가
`config/companies.json`을 고쳐 커밋하면 수집이 다시 돕니다.
```json
"acme":   { "name": "회사명", "ticker": "000000.KQ", "dart": "000000", "country": "KR" },
"acme2":  { "name": "회사명", "dart_name": "DART 법인명", "country": "KR" }
```
- 상장사: `ticker`(코스피 `.KS`, 코스닥 `.KQ`), `dart`(종목코드). 비상장사: `dart_name`, 동명 법인은 `corp_code`(8자리).
- 선택: `brand`(텍스트 칩), `news_names`, `news_must`, `news_exclude`, `segment`(사업보고서 영업부문 주석에서 부문 매출·영업이익), `note`.
- `groups`: `id`·`name`·`mode`(`business`/`full`)·`members`, 선택 `segments`(경쟁사 보기 묶음), `valuation: "table"`, `valuationNotes`, `growExtra`(성장 근거 차트에만 추가할 회사).
- 브랜드 로고·이미지는 넣지 않습니다.

## 표시 설정 (브라우저에만 저장)
v1의 **⚙ 설정**에서 회사 강조 표시, 섹션 이름, **시총 복사 목록**(`# 제목` 줄 = 섹션, 그 아래 줄마다 상장사 이름 또는 종목코드)을 지정합니다. 저장소·사이트에는 올라가지 않고 그 브라우저의 localStorage에만 남으므로 기기마다 한 번씩 지정합니다.

## 로컬에서 보기
```
python -m http.server 8000      # http://localhost:8000
pip install -r requirements.txt && python scripts/fetch_data.py   # 직접 수집 (환경변수 DART_API_KEY, KRX_API_KEY)
```

## 참고
- 감사보고서는 표 양식이 회사마다 달라 자동 추출이 틀릴 수 있습니다. 출처 링크로 원문과 대조하세요.
- 해외 종목 시총 정렬은 대략적인 환율로 환산합니다. 실적 금액 비교는 같은 통화끼리만 합니다.
- 장중 시세는 약 15~20분 지연이며, 공식 종가·시총은 KRX 값이 기준입니다.
- 투자 판단의 근거로 사용하지 마십시오.
