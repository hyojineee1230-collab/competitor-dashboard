# 경쟁사 모니터

산업군(건강기능식품 · 마이크로바이옴 신약)을 선택하면 경쟁사의 주가 동향과 재무 정보를 비교해 보여주는 정적 대시보드입니다.
GitHub Pages로 호스팅하고, GitHub Actions가 매 영업일 데이터를 자동으로 갱신합니다.

## 화면 구성
상단 탭은 **모니터링 탭**(시가총액, 사업현황)과 **산업군**(건강기능식품, 마이크로바이옴 신약)으로 나뉩니다. URL 해시(`#mcap`, `#biz`, `#hff`, `#microbiome`)로 특정 탭을 바로 공유할 수 있습니다.

| 탭 성격 (`mode`) | 보이는 섹션 |
|---|---|
| `market` 시가총액 | 시가총액 추이(억원) / 상대 수익률 전환, 시가총액 순위, 시세·밸류에이션 표 |
| `business` 사업현황 | 분기 실적 추이(최근 8개 분기, YoY·QoQ), 연간 실적 비교(비상장사 포함) |
| `full` 산업군 | 상대 주가 추이, 수익률 순위, 시세·밸류에이션 표, 연간 실적 비교 |

- 시가총액 추이는 *현재 상장주식수 × 과거 종가*로 근사합니다. 증자·감자가 있었다면 그 이전 구간은 실제와 다를 수 있습니다.
- 비상장사는 주가·분기 공시가 없어 **연간 실적(감사보고서)** 에만 나오며, 출처 링크로 DART 원문을 바로 열 수 있습니다.

## 폴더 구조
```
index.html                     대시보드 (Chart.js, 단일 파일)
config/companies.json          산업군 · 경쟁사 목록  ← 여기만 고치면 됩니다
scripts/fetch_data.py          데이터 수집 (Yahoo Finance + OpenDART)
scripts/dart_audit.py          감사보고서 원문 손익계산서 추출기
scripts/krx.py                 KRX 일별 시가총액 수집 (캐시: data/krx_cache.json)
scripts/make_sample.py         화면 확인용 샘플 데이터 생성
data/*.json                    수집 결과 (Actions가 자동 커밋)
.github/workflows/update-data.yml   자동 갱신 워크플로
```

## 배포 방법
1. GitHub에 새 저장소를 만들고 이 폴더 전체를 업로드합니다.
2. **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `(root)` → Save
3. **Settings → Actions → General → Workflow permissions** → `Read and write permissions` 선택
4. **Actions 탭 → Update market data → Run workflow** 로 첫 실데이터를 받아옵니다.
   (처음 들어있는 데이터는 샘플이며, 화면 우측 상단에 "샘플 데이터" 표시가 뜹니다. 실행 후 사라집니다.)
5. `https://<아이디>.github.io/<저장소명>/` 에서 확인

## KRX 인증키 등록 (공식 시가총액)
국내 종목의 종가·시가총액은 KRX 정보데이터시스템 OPEN API(일별매매정보)를 기준으로 합니다. 키가 없으면 Yahoo Finance 근사치를 씁니다.
1. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `KRX_API_KEY`, Secret: KRX OPEN API 인증키
2. 코스닥은 `코스닥 일별매매정보`, 유가증권 종목(서흥 등)은 `유가증권 일별매매정보` 서비스 이용신청이 각각 필요합니다.
3. 첫 실행 때 최근 2년치를 날짜별로 받아 `data/krx_cache.json`에 쌓고, 이후에는 새 거래일만 조회합니다. 호출량이 많아 첫 백필은 두 번의 실행에 나눠 채워질 수 있습니다.
4. **시가총액** 탭 하단 **기준일 시가총액** 표에서 날짜를 고르고 *표 복사*를 누르면 기존 보고 양식(name(ticker) / date / close / market_cap_억원) 그대로 엑셀에 붙여넣을 수 있습니다.

> 인증키는 코드나 저장소 파일에 적지 마세요. 공개 저장소라 누구나 볼 수 있습니다.

## OpenDART 키 등록 (국내 재무·비상장사에 필요)
Yahoo Finance의 국내 기업 재무는 비어 있는 경우가 많습니다. OpenDART API 키를 등록하면 국내 상장사 재무를 공시 기준(연결 우선, 없으면 별도)으로 받아옵니다.
1. https://opendart.fss.or.kr 에서 인증키 발급 (무료)
2. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `DART_API_KEY`, Secret: 발급받은 키

## 표시 설정 (공개되지 않는 라벨)
자사 표시와 섹션 이름(보고서 소제목)은 저장소·사이트에 올리지 않고, 시가총액 탭 하단 **표시 설정**에서 지정합니다.
설정은 그 브라우저에만 저장되므로 PC와 휴대폰에서 각각 한 번씩 지정하면 됩니다.

## 회사 · 탭 추가
`config/companies.json`을 수정해 커밋하면 워크플로가 자동으로 다시 돌아 반영됩니다.

1. `companies`에 회사를 한 번만 등록합니다.
```json
"bioneer":  { "name": "바이오니아",   "ticker": "064550.KQ", "dart": "064550", "country": "KR" },
"acebiome": { "name": "에이스바이옴", "dart_name": "에이스바이옴", "country": "KR" }
```
   - 상장사: `ticker`(Yahoo 티커: 코스피 `.KS`, 코스닥 `.KQ`), `dart`(종목코드 6자리)
   - 비상장사: `ticker` 없이 `dart_name`(DART에 등록된 법인명). 동명 법인이 있어 다른 회사가 잡히면 `"corp_code": "00123456"`(DART 고유번호 8자리)을 추가합니다.
2. `groups`의 `members`에 회사 id를 넣습니다. 새 탭은 `groups`에 `id`, `name`, `mode`, `members`를 가진 객체를 추가하면 생깁니다.
3. 한 탭에 8개 이하를 권장합니다 (차트 색상이 8개까지 구분되도록 설계됨).

## 데이터 출처별 범위
| 대상 | 주가·시총 | 분기 실적 | 연간 실적 |
|---|---|---|---|
| 상장사 | Yahoo Finance | DART 분기·반기·사업보고서 (키 없으면 Yahoo) | DART 사업보고서 (키 없으면 Yahoo) |
| 외감 비상장사 | – | – (공시 의무 없음) | DART 감사보고서 원문 자동 추출 (**키 필수**) |

감사보고서는 회사마다 표 양식이 조금씩 달라 자동 추출이 틀릴 수 있습니다. 처음 실행 후 출처 링크로 원문과 한 번 대조해 보세요. 추출에 실패하면 Actions 로그와 화면 하단 안내에 회사명과 원문 링크가 표시됩니다.

## 로컬에서 보기
`index.html`을 더블클릭하면 브라우저 보안 정책 때문에 데이터를 못 읽습니다. 폴더에서 아래를 실행 후 http://localhost:8000 접속:
```
python -m http.server 8000
```
데이터를 직접 받으려면 `pip install -r requirements.txt` 후 `python scripts/fetch_data.py` (DART 키는 환경변수 `DART_API_KEY`).

## 참고
- 갱신 시각: 평일 16:40 KST(국내 장 마감 후), 06:40 KST(미국 장 마감 후)
- 시가총액 정렬은 해외 종목을 대략적인 환율로 환산해 비교합니다. 실적 금액 비교는 같은 통화끼리만 합니다.
- 투자 판단의 근거로 사용하지 마십시오.
