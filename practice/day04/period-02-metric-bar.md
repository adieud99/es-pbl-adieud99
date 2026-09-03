# 2교시 연습 — Metric·Bar·Top values

공통 문제는 `products`, 개인 문제는 `flights`로 했다. 실행 2026-09-03.
`products` 전체는 교재 기준 20,000이 아니라 **10,000**이다(1교시 참고).

## (공통·필수) 문제 1 — 전체 상품 수 Metric 제작

### 결과 입력

- Dashboard 이름: `수업` (공통 실습용)
- 사용한 계산: `Count of records`
- 실제 Metric 값: **10,000**
- 시간 범위: 2025-08-01 00:00 ~ 2026-09-01 00:00 (절대 범위)
- KQL/filter/control 상태: 전부 없음
- 정상/보류/오류와 이유: **보류.** 계산 방식과 설정은 맞지만 값이 교재 기준 20,000이
  아니다. `GET /products/_count`도 10,000을 돌려주므로 패널이 틀린 게 아니라 적재 데이터가
  10,000건이다.
- 캡처 파일: `evidence/day-04/common-dashboard.png`

**여기서 한 번 틀렸다.** 처음에 시간 범위를 `Last 1 year`로 두고 캡처했더니 Metric이
**9,818**로 나왔다. `created_at`이 정확히 1년치라 now-1y 경계에서 앞쪽 문서가 잘린
것이다. 절대 범위로 바꾸니 10,000이 됐다. Metric 하나가 틀리면 아래 모든 패널이
같이 틀리므로 제일 먼저 검증해야 하는 패널이다.

## (공통·필수) 문제 2 — category Bar 제작

### 설정·결과 입력

- Bar 방향: vertical
- x축 또는 category 차원: `category` Top values
- y축 또는 Metric: `Count of records`
- Number of values: 8
- 표시된 category 수: **8개** (도서, 반려동물, 뷰티, 생활, 스포츠, 식품, 전자기기, 패션)
- 각 category 값이 공통 기준과 일치하는가: 일치한다. **8개 전부 정확히 1,250건**이다.

| category | 문서 수 |
|---|---:|
| 도서 | 1,250 |
| 반려동물 | 1,250 |
| 뷰티 | 1,250 |
| 생활 | 1,250 |
| 스포츠 | 1,250 |
| 식품 | 1,250 |
| 전자기기 | 1,250 |
| 패션 | 1,250 |
| 합계 | **10,000** |

  8 × 1,250 = 10,000으로 Metric과 맞는다. 남거나 모자란 문서가 없으므로 Top 8이
  전부를 덮었다는 뜻이다.

- 캡처 파일: `evidence/day-04/common-dashboard.png`

막대 높이가 전부 같아서 처음엔 설정이 잘못된 줄 알았는데, 집계로 확인하니 실제로
균등하게 생성된 데이터였다. 차트가 밋밋한 게 오류가 아니라 데이터의 성질이다.

## (변형·필수) 문제 3 — Bar 방향 한 가지만 바꿔 비교

`category` Top 8과 Count of records는 그대로 두고 `Style → Appearance → Bar orientation`만
바꿨다.

| 비교 | vertical | horizontal |
|---|---|---|
| category 이름 가독성 | 8개가 x축에 나란히 놓여 한글 2~4자는 안 겹친다. 다만 `반려동물`처럼 길면 기울어진다 | 이름이 y축에 가로로 놓여 길이에 관계없이 온전히 읽힌다 |
| 값 비교 속도 | 높이로 비교. 8개가 같은 높이라 차이를 못 느낀다 | 길이로 비교. 역시 같아서 차이 없음 |
| 잘림·겹침 | 라벨이 길어지면 기울어지거나 잘린다 | 잘림 없음. 대신 세로 공간을 많이 먹는다 |

- 최종 선택: **vertical**
- 선택 이유: 이 데이터는 category 이름이 최대 4자(`반려동물`)라 vertical에서도 안 잘린다.
  그리고 Dashboard 첫 행에 Metric과 나란히 놓을 거라 가로로 긴 패널이 배치에 유리하다.
  브랜드처럼 이름이 길고 개수가 많은 경우라면 horizontal이 맞다.
- 다른 설정을 동시에 바꾸지 않았는가: 방향만 바꿨다. field·Count·Top 8·제목은 그대로 뒀다.
  둘을 같이 바꾸면 무엇 때문에 달라졌는지 설명할 수 없다.

## (진단·필수) 문제 4 — 막대가 하나만 남은 상황 복구

### 진단 기록

- 보이던 category: `전자기기` 하나. Metric이 1,250으로 떨어졌다.
- 발견한 제한 조건: **category Control의 선택값.** Control을 `전자기기`로 둔 채였다.
- 제거 또는 초기화한 항목: Control을 `Any`로 되돌렸다. 확인 순서는 아래와 같다.

| 순서 | 확인 항목 | 결과 |
|---:|---|---|
| 1 | category Control 선택값 | **전자기기 선택됨 ← 원인** |
| 2 | 상단 filter pill | 없음 |
| 3 | KQL | 비어 있음 |
| 4 | 시간 범위 | 절대 범위 정상 |
| 5 | Lens Top values 설정 | Number of values = 8, 정상 |

- 복구 후 막대 수: **8개**
- 복구 후 Metric 값: **10,000**
- 원인이 없었다면 추가로 확인한 Lens 설정: Control·filter·KQL·시간이 다 깨끗한데도 막대가
  하나뿐이면 Lens 안쪽을 본다. `Number of values`가 1로 줄었거나, Top values의 정렬 기준이
  이상하거나, `category` 대신 `category.keyword` 같은 다른 field를 잡았을 수 있다. 실제로
  `products.category`는 keyword라 서브필드 없이 바로 집계되는데, `name`처럼 text인 field를
  잘못 고르면 아예 집계가 안 된다.
- 캡처 파일: `products` 화면 캡처는 없다. 같은 진단을 개인 index에서 한 결과가
  `picture/p05-q03-baseline.png`·`p05-q03-filter.png`에 있다.

Control·filter·KQL 세 가지가 겉으로 비슷하게 보여서, 값이 이상할 때 어디를 봐야 할지
순서를 정해두는 게 중요하다. 5교시 문제 3에서 셋을 나눠서 다시 확인한다.

## (개인·선택 도전) 문제 5 — 내 범주 field로 Metric+Bar 설계

- 개인 index/Data View: `flights`
- 전체 규모가 의미하는 것: 지금 카탈로그에 올라가 있는 왕복 상품 수. 판매량이 아니라
  공급량이다.
- 범주 field: `arr_airport` (도착지)
- 실제 고유값 수: **6개** (SIN, NRT, BKK, HKG, TPE, KIX)
- Top N 선택값과 이유: **6.** 고유값이 정확히 6개라 6이면 전부 들어오고 `Other` 버킷이
  안 생긴다. 5로 두면 하나가 잘려 합이 10,000이 안 된다.
- 예상 사용자 판단: 물량이 적은 노선을 찾아 소싱을 늘린다.
- 실제 제작 여부: 만들었다. `evidence/day-04/personal-dashboard.png`의 Metric(항공편수)과
  도착지 Bar가 이 패널이다.

| 패널 | 값 |
|---|---|
| Metric 항공편수 | 10,000 |
| 도착지 Bar | SIN 1,691 / NRT 1,690 / BKK 1,670 / HKG 1,666 / TPE 1,646 / KIX 1,637 |

  6개 합이 10,000으로 Metric과 맞는다.

- 부족한 경우 필요한 field와 예시값: 해당 없음. 다만 "물량이 많다"를 "잘 팔린다"로 읽을 수
  없어서, 판단까지 가려면 `seats_sold`가 필요하다.
- 캡처 또는 설계 문서 경로: `evidence/day-04/personal-dashboard.png`,
  `evidence/day-04/dashboard-plan.md`

실제로 만든 Bar는 도착지별로 항공사를 색으로 쌓은 누적 Bar다. 단순 Count Bar보다
"어느 노선을 누가 채우나"까지 한 번에 보여서 그렇게 했다.

## 교시 완료 신호

**YELLOW.** Metric·category Bar 8개·제목·방향 비교·복구 기록을 다 했지만, Metric 값이
교재 기준 20,000이 아니라 10,000이다.
