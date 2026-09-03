# Day 4 개인 Dashboard 설계

작성 2026-09-03. index는 `flights` 10,000건, Elasticsearch/Kibana 9.5.0.
이 문서의 수치는 전부 `_search` 집계로 확인한 값이다.

## 1. 사용자와 목적

- 내 주제: 해외 왕복 항공권 검색 서비스. 한 문서가 "출발일·노선·좌석등급·숙박일수가 정해진
  왕복 상품 하나"다.
- 이 Dashboard를 볼 사람: 항공권 상품을 소싱하는 담당자. 어떤 노선을 어느 항공사가 얼마나
  들고 있는지 봐야 하는 사람이다.
- Dashboard를 보고 결정하거나 행동할 것:
  - 항공사별 물량 편중을 보고 소싱 협상 대상을 정한다.
  - 도착지별 공급이 고른지 확인하고 빈 노선을 찾는다.
  - 숙박일수 분포를 보고 단기·장기 상품 비율을 조정한다.
- 사용할 index / Data View: `flights` / Data View `flights` (시간 field `out_dep_time`)

## 2. 데이터 준비 경로

- [x] A: 개인 데이터로 제작
- [ ] B: 공통 products로 제작하며 개인 데이터 보강 규칙 작성
- [ ] C: 공통 Dashboard를 완성하고 개인 청사진에 집중

선택 이유: `flights`에 10,000건이 있고 집계 가능한 field가 충분하다. keyword 5개
(`arr_airport`, `dep_airport`, `seat_class`, `airline.keyword`, `tags`), 숫자 2개
(`total_price`, `stay_nights`), boolean 1개(`is_direct`), date 1개(`out_dep_time`)라
Metric·Donut·Bar·Table·Line·Heatmap·Tag cloud를 전부 만들 수 있다.

## 3. 질문-데이터-차트 청사진

실제로 만든 8패널이다. Dashboard 제목은 `fligths dashboards`.

| 번호 | 분석 질문 | 필요한 field | 현재 존재? | mapping type | 계산·그룹 방식 | 차트 | filter/control | 확인 기준 |
|---|---|---|---|---|---|---|---|---|
| Q1 전체 규모 | 상품이 몇 개인가 | 문서 수 | O | — | Count of records | Metric | control 영향 | 10,000, `_count`와 일치 |
| Q2 공급자 비중 | 항공사별로 얼마나 들고 있나 | `airline.keyword` | O | text+keyword | Count, 비율 | Donut | control 영향 | 진에어 20.63% 1위 |
| Q3 노선×공급자 | 어느 노선을 어느 항공사가 채우나 | `arr_airport`, `airline.keyword` | O | keyword | Count, 도착지별 항공사 누적 | Bar (stacked) | control 영향 | 6개 도착지 합 10,000 |
| Q4 가격대별 공급 | 특정 가격대에 어느 노선이 있나 | `total_price`, `arr_airport`, `airline.keyword` | O | integer, keyword | 가격 구간 × 도착지 | Table | control 영향 | 30만 구간 104건 |
| Q5 숙박 성향 | 며칠짜리 상품이 많나 | `stay_nights` | O | integer | Count by 숙박일수 | Line + Bar | control 영향 | 1~10일, 각 970~1,061 |
| Q6 노선 인지도 | 어느 도착지가 큰가 | `arr_airport` | O | keyword | Count, 크기 매핑 | Tag cloud | control 영향 | SIN이 가장 큼 |
| Q7 노선×공급자 | 항공사가 어느 노선에 몰려 있나 | `airline.keyword`, `arr_airport` | O | text+keyword / keyword | Count 교차 | Heatmap | control 영향 | 5×6 격자, 303~375 |

- 적용한 filter: 없음. 처음에 `dep_airport: exists`를 걸었으나 `dep_airport`가 ICN 단일값이라
  걸러지는 문서가 없어서 제거했다.
- 적용한 control: `airline.keyword` Options list

패널마다 질문이 다른지 확인했다. Q1은 규모, Q2는 공급자 점유, Q3은 노선×공급자 누적,
Q4는 가격대, Q5는 상품 기간, Q6은 노선 크기, Q7은 노선×공급자 교차 밀도다.
Q3과 Q7이 같은 두 field를 쓰지만 Q3은 노선별 합계를, Q7은 칸별 밀도를 본다.

## 4. 데이터 부족 분석

- 현재 데이터로 답할 수 없는 질문: **"언제 얼마나 팔렸나"를 답할 수 없다.**
  `out_dep_time`은 출발 예정일이지 판매일이 아니다. Day 4 공통 주의사항인
  "`created_at`을 판매 추이로 해석하지 말 것"과 같은 문제가 내 데이터에도 있다.

  좌석등급별 가격 차이도 말할 수 없다. `total_price`가 등급과 무관하게 30만~120만
  난수라서 economy 평균과 first 평균이 거의 같다. 3일차 5교시에서 퍼스트클래스가
  30만원대로 나온 것과 같은 원인이다.

- 부족한 field:

| field | type | 왜 필요한가 |
|---|---|---|
| `booked_at` | date | 실제 판매 시점. 판매 추이·요일 수요를 보려면 필수 |
| `seats_sold` / `seats_total` | integer | 판매량과 잔여석. 지금은 "상품이 몇 개"만 알고 "얼마나 팔렸나"를 모른다 |
| `base_fare` / `tax` | integer | `total_price`를 쪼개야 유류할증료 변동을 본다 |

- 필요한 mapping type: date 1개, integer 4개.

- 필요한 값의 범위·범주·비율:
  - `booked_at`: `out_dep_time` 기준 D-1 ~ D-90.
  - `seats_total`: economy 150~200, business 20~40, first 8~12.
  - `seats_sold`: 0 이상 `seats_total` 이하. 출발일이 가까울수록 높게.
  - 등급별 운임 배수: economy 1.0, business 2.5~3.5, first 5~7. 지금처럼 등급과 가격이
    무관한 상태를 고쳐야 Q7 히트맵이 의미를 갖는다.

- 날짜가 필요하다면 기간과 단위: `booked_at` 최근 90일, 일 단위. 주간 집계가 의미를
  가지려면 최소 12주가 필요하다.

- 한 문서가 의미할 사건 또는 대상: 지금은 "판매 중인 왕복 상품 1건". `booked_at`과
  `seats_sold`를 넣으면 "특정 시점의 상품 재고 스냅샷"이 된다.

- 생성 또는 수집 방법: `data/flights-create.py`를 고친다. 등급별 운임 배수를 곱하도록
  `total_price` 생성 로직을 바꾸고 `booked_at`을 `out_dep_time`에서 역산한다.

- 데이터 수가 충분하다고 판단할 기준: 도착지 6 × 항공사 5 = 30개 조합에 최소 300건씩
  있어야 control을 걸어도 패널이 안 빈다. 진에어를 선택했을 때 가장 적은 조합인
  TPE가 327건이라 기준을 넘는다.

## 5. 제작 순서

1. Data View `flights`를 만들고 시간 field를 `out_dep_time`으로 지정한다. 시간 범위를
   `This year`로 두면 10,000건이 다 들어온다.
2. Metric부터 만든다. Count of records 하나라 제일 단순하고, 여기 숫자가 `_count`와
   맞는지로 Data View 설정을 검증할 수 있다.
3. Donut → Bar → Table → Line/Bar → Tag cloud → Heatmap 순으로 만든다.
4. `airline.keyword` Options list control을 추가하고 진에어를 골라 여러 패널이 같이
   변하는지 확인한 뒤 캡처한다.

## 6. 완료 예상 화면

- Dashboard 제목: `fligths dashboards`
- 필수 패널 수: 4개 기준을 넘어 8개
- 사용할 control/filter: `airline.keyword` Options list 1개 (filter는 사용하지 않음)
- 저장할 캡처 파일명:
  - `personal-dashboard.png` (control = Any, 전체 상태)
  - `personal-dashboard-filtered.png` (control = 진에어)
  - `common-dashboard.png` (공통 products)

## 7. 패널별 기대값 (ES 집계로 사전 확인)

Kibana 화면이 아래와 다르면 패널 설정이 잘못된 것이다.

**Q1 Metric**: 10,000

**Q2 항공사 Donut**

| airline | 문서 수 | 비율 |
|---|---:|---:|
| 진에어 | 2,063 | 20.63% |
| 아시아나항공 | 2,031 | 20.31% |
| 제주항공 | 1,996 | 19.96% |
| 티웨이항공 | 1,993 | 19.93% |
| 대한항공 | 1,917 | 19.17% |

**Q3 도착지 Bar**: SIN 1,691 / NRT 1,690 / BKK 1,670 / HKG 1,666 / TPE 1,646 / KIX 1,637.
합이 10,000이다. 도착지가 6종뿐이라 Top 6이면 전부 들어온다.

**Q4 가격 구간 Table**: 30만~30만9천 104건 / 31만대 94건 / 32만대 119건.
`total_price` min 300,029 / max 1,199,769 / avg 750,878.

**Q5 숙박일수**: 1~10일. 987 / 992 / 1,026 / 1,061 / 990 / 969 / 1,003 / 1,003 / 992 / 977.
거의 균등하다. **11 이상은 없다.**

**Q7 항공사 × 도착지 히트맵**: 30칸이 303~375에 모여 있다.

| | SIN | HKG | KIX | NRT | BKK | TPE |
|---|---:|---:|---:|---:|---:|---:|
| 대한항공 | 324 | 308 | 303 | 338 | 334 | 310 |
| 아시아나항공 | 340 | 340 | 330 | 339 | 329 | 353 |
| 제주항공 | 348 | 336 | 334 | 321 | 332 | 325 |
| 진에어 | 375 | 347 | 341 | 337 | 336 | 327 |
| 티웨이항공 | 304 | 335 | 329 | 355 | 339 | 331 |

색 구간은 5개로 잡았다(`303–310.2 / ~317.4 / ~324.6 / ~331.8 / ≥331.8`). 구간이 하나면
이 좁은 폭이 전부 같은 색으로 뭉개진다. 다만 Kibana가 현재 데이터의 min/max로 구간을
자동 계산하므로 control을 걸면 경계값이 바뀐다(진에어 선택 시 `327–331.8 … ≥346.2`).

**참고 — 좌석등급 분포**: economy 6,978 / business 2,004 / first 1,018

**control = 진에어 적용 시**: Metric 2,063, 도착지 SIN 375 / HKG 347 / KIX 341 / NRT 337 /
BKK 336 / TPE 327, 등급 economy 1,472 / business 394 / first 197
