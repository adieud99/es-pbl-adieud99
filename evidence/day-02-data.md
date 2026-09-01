# Day 2 데이터 준비 결과

## 1. Index와 문서

- Index 이름: `flights`
- 문서 한 건의 의미: 인천 출발 왕복 항공권 1건. 가는 편과 오는 편이 짝지어진 조합 하나가 검색 결과 한 줄에 해당한다. 오는 편 출발 일시는 `out_dep_time`에 `stay_nights`를 더해 계산할 수 있으므로 별도 field로 저장하지 않는다.
- 실제 색인 건수: 10,000건 (`GET /flights/_search`의 `hits.total.value`가 10000)
- Mapping의 `dynamic` 설정: `strict`. 정의하지 않은 field가 들어오면 색인을 거부해서 생성 스크립트와 mapping이 어긋나는 것을 바로 잡아내기 위해서다.

## 2. 최종 Field

| Field | Type | 검색에서 사용할 목적 |
|---|---|---|
| `trip_id` | `keyword` | 업무 ID. 값 전체로 문서를 식별한다. `_id`와 같은 값을 쓴다 |
| `route_desc` | `text` | "도쿄 직항"처럼 한글 단어로 입력받는 전문 검색 |
| `airline` | `text` + `keyword` | 문장 검색은 `airline`, 항공사별 집계는 `airline.keyword` |
| `dep_airport` | `keyword` | 출발 공항 정확 조건. 이 데이터는 전부 ICN |
| `arr_airport` | `keyword` | 노선 지정 조건이자 노선별 총액 집계 기준 |
| `seat_class` | `keyword` | 좌석등급 정확 조건과 등급별 집계 |
| `out_dep_time` | `date` | 출발 주간·시간대 범위 검색과 정렬 |
| `stay_nights` | `integer` | 체류일수 범위 조건과 체류일수별 총액 집계 |
| `total_price` | `integer` | 예산 상한 범위 조건, 오름차순 정렬, 평균 집계 |
| `is_direct` | `boolean` | 직항만 남기는 참·거짓 조건 |
| `tags` | `keyword` | 태그 정확 조건과 집계. 같은 type의 값 여러 개라 배열 type을 따로 선언하지 않는다 |

`airline`을 두 가지 type으로 둔 것이 핵심이다. 사용자는 "대한항공"을 문장 안에서 검색하지만
Dashboard에서는 항공사별로 정확히 묶어 세야 한다. 두 요구가 하나의 type으로는 동시에
만족되지 않는다.

`is_direct`가 boolean이면서 `route_desc`에도 "직항"·"경유" 문구가 들어간다. 조건으로 걸 때는
boolean이 정확하고, 문장으로 검색할 때는 `route_desc`가 걸린다. 생성 스크립트가 `is_direct`를
먼저 뽑고 그 값으로 `route_desc`를 만들기 때문에 두 값은 항상 일치한다.

## 3. 대량 데이터 생성·색인 결과

- 생성 건수: 10,000건. `data/flights-create.py`를 실행해 `flights-10000.json`과
  `flights-10000.ndjson`을 만들었다. seed는 20260901로 고정했다.

- 로컬 검증 결과: `wc -l flights-10000.ndjson`이 20,000줄이다. action 줄과 문서 줄이 한 쌍씩
  10,000쌍이므로 기대한 값과 같다. 파일에서 직접 센 노선 분포는
  SIN 1691 / NRT 1690 / BKK 1670 / HKG 1666 / TPE 1646 / KIX 1637이었다.
  이는 파일 검사이며 Elasticsearch 저장 성공을 대신하지 않는다.

- Bulk 색인 결과: `docker cp`로 3.55MB를 es01에 복사한 뒤
  `POST /_bulk?refresh=wait_for&filter_path=errors`로 전송했다. 응답은 `{"errors":false}`로
  실패 항목이 없다.

- ES 실제 `_count`: 10,000건. 생성 건수와 일치한다.

- 분류·숫자·boolean 분포 확인 결과:

| 항목 | 설계값 | 실제 관찰값 | 판정 |
|---|---|---|---|
| 노선(`arr_airport`) 6개 | 각 1,666.7 (균등) | SIN 1691 / NRT 1690 / BKK 1670 / HKG 1666 / TPE 1646 / KIX 1637 | 정상 범위 |
| `seat_class` | economy 70 / business 20 / first 10 | 6,978 (69.8%) / 2,004 (20.0%) / 1,018 (10.2%) | 일치 |
| `is_direct` | true 70 / false 30 | 6,974 (69.7%) / 3,026 (30.3%) | 일치 |
| `airline` 5사 | 각 2,000 (균등) | 진에어 2063 / 아시아나항공 2031 / 제주항공 1996 / 티웨이항공 1993 / 대한항공 1917 | 정상 범위 |
| `total_price` | 300,000 ~ 1,200,000 | min 300,029 / max 1,199,769 / avg 750,878 | 범위 안 |
| `stay_nights` | 1 ~ 10 | min 1 / max 10 / avg 5.48 | 일치 |
| `out_dep_time` | 2026-09-01 ~ 09-30 | 2026-09-01T00:00:56Z ~ 2026-09-30T23:57:57Z | 범위 안 |

확률로 생성한 값이므로 비율이 정확한 고정 건수로 나오지 않는다. `total_price`의 실제
최솟값이 정확히 300,000이 아니고 최댓값도 1,200,000이 아닌 것도 같은 이유다. 허용 범위의
양 끝값이 무작위 표본에 반드시 등장하지는 않는다.

`total_price`의 평균 750,878이 범위 중앙값 750,000에 매우 가깝고 `stay_nights`의 평균
5.48이 1~10의 중앙값 5.5에 가까운 것으로 균등 분포임을 확인할 수 있다.

### 0건 조건 확인

| 조건 | 기대 | 실제 | 근거 |
|---|---|---|---|
| `total_price` > 2,000,000 | 0건 | `count: 0` | 생성 범위 상한이 1,200,000 |
| `stay_nights` >= 30 | 0건 | `count: 0` | 생성 범위 상한이 10 |

0건은 검색이 실패한 것이 아니라 조건을 만족하는 문서가 없다는 뜻이다.

## 4. Day 3 연결

- 검색 질문 기준: `docs/data-model.md`의 사용자 질문 3개

| 번호 | 질문 | 확인할 역할 |
|---:|---|---|
| 1 | "도쿄 직항" 항공권을 찾고 싶다 | 전문 검색 |
| 2 | 도쿄행 왕복 직항 이코노미 중 총액 50만원 이하를 싼 순으로 | 정확 조건 · 범위 · 정렬 |
| 3 | 노선별·체류일수별 평균 총액은 얼마인가 | 집계 |

## 5. 결과 파일 위치

- Mapping: `elasticsearch/index-create.json`
- 실행 요청: `requests.http`
- 대표 문서: `docs/data-model.md` 2절 (JSON 1건)
- 데이터 생성 설정: `data/flights-create.py` 상단 상수 (`DOCUMENT_COUNT`, `SEED`, 후보 목록, 범위)
- 생성 표본: `data/flights-10000.json`
- 생성 요약: `data/generation-notes.md` (생성 규칙, seed, 실제 분포, 0건 조건 근거, 재현 방법)

전체 Bulk 파일 `data/flights-10000.ndjson`은 3.55MB이므로 `.gitignore`에 실제 경로를 적어
제외했다. 생성 스크립트와 요약은 제출한다.

## 6. Pipeline 적용 판단

- 적용 / 미적용 / 보류: **미적용**
- 판단 이유: 이 PBL의 데이터는 생성 스크립트가 mapping에 맞는 형태로 직접 만든다. 색인
  시점에 고쳐야 할 값이 없다. pipeline은 외부에서 들어오는 데이터의 모양이 내 mapping과
  다를 때 서버 쪽에서 맞춰 주는 도구인데 지금은 그 상황이 아니다. 생성 규칙을 고치면 되는
  일을 pipeline으로 처리하면 변환 규칙이 스크립트와 pipeline 두 곳에 나뉘어 나중에 어느
  쪽이 값을 바꿨는지 추적하기 어려워진다. 자세한 판단은 `docs/pipeline-decision.md`에 있다.

## 7. 미완료·오류

### 현재 상태

- **T13 analyzer 미실행.** `POST /_analyze`와 `POST /flights/_analyze`로 검색어 3개를 두
  방식으로 확인하는 항목이 남아 있다.
- **T14 개인 CRUD 미실행.** 임시 문서로 생성 → 조회 → 수정 → 재조회 → 삭제를 연결하는
  항목이 남아 있다.
- **`GET /_cat/shards/flights?v` 응답 미기록.** index 생성 시 `acknowledged: true`와
  `shards_acknowledged: true`는 확인했으나 shard 배치 표를 남기지 않았다.
- **pipeline `_simulate` 미실행.** 판단은 정리했으나 동작 확인은 하지 않았다.

### 해결한 오류

| 증상 | 원인 | 조치 |
|---|---|---|
| 생성 스크립트 실행 시 `FileNotFoundError: 'data/flights-1000.json'` | 출력 경로에 `data/`가 붙어 있어 `data/` 안에서 실행하면 `data/data/`를 찾음. 파일명도 실제 건수와 달랐음 | 출력 경로를 `flights-{DOCUMENT_COUNT}.json`으로 수정 |
| 노선별 집계 차트를 만들 수 없음 | `arr_airport`가 NRT 하나로 고정되어 있어 막대가 하나뿐 | 도착 공항 6개를 후보로 두고 `route_desc`가 도착 도시명을 따라가도록 수정한 뒤 재생성 |
| 0건 조건이 실제로는 213건 | "퍼스트클래스 총액 50만원 이하"는 `total_price`와 `seat_class`가 독립 생성되어 성립하지 않음 | 단일 field 범위 밖 조건(`total_price` > 2,000,000)으로 변경 |

### 알려진 한계

운임이 노선·좌석등급과 무관하게 생성된다. 실제 항공권은 거리와 좌석등급에 따라 운임이
달라지지만 이 데이터는 세 값을 독립적으로 뽑는다. 따라서 등급별·노선별 가격 차이는 이
데이터로 검증하지 않는다.

### 다음에 할 작업

1. T13 analyzer 3개 검색어 실행 후 token 비교 기록
2. T14 개인 CRUD 실행 후 result 값과 `_source` 변화 기록
3. `GET /_cat/shards/flights?v` 실행 후 shard 배치 기록
4. pipeline `_simulate` 실행 후 변환 결과 기록
5. Day 3에서 질문 3개를 실제 query로 작성하고 `docs/quality-test.md`의 기대·제외·0건과 대조
