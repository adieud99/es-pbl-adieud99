# Day 3 검색 구현·품질 검증 산출물

> 공통 쇼핑몰 답을 복사하지 않고 자신의 PBL index와 실제 결과를 기록합니다. 실행하지 않은 결과는 완료로 표시하지 않습니다.

## 1. 실행 기준

- 개인 index: `flights` (`elasticsearch/index-create.json`, `dynamic: strict`, shard 1 / replica 1)
- 수업 시작 시 실제 `_count`: 10,000건. Day 2에 Bulk로 넣은 건수와 같다.
- 개인 요청 파일: `requests.http`의 `V1-T17-P`~`V1-T21-P` 구간
- 검색 품질 주 문서: `docs/quality-test.md`
- 실행 환경·시각: Elasticsearch 9.5.0, cluster `es-5days-pbl`. Docker 3노드(es01~es03)와 Kibana가
  모두 healthy였다. 2026-09-02 11:20~13:30 KST에 실행했고, index 상태는 `_cat/indices`에서
  `green / docs.count 10000 / store.size 1.9mb`였다.

이 문서는 `practice/period-01-search-api.md`부터 `period-05-bool.md`까지 1~5교시 실습에서 실제로
실행한 개인 요청을 다시 정리한 것이다. 교시별 문제지에는 요청 하나하나의 결과가 있고, 여기에는
그중 검색 질문 3개로 묶이는 것과 조건 실험·개선을 모았다. 공통 문제에 쓴 강사님 배포 데이터
`products`는 교시별 문제지에만 두고 이 문서에는 넣지 않았다. 여기는 내 index 기준이다.

## 2. 검색 질문과 요구사항

| 요청 ID | 사용자 질문 | 검색 field·검색어 | 정확 조건·범위 | 정렬 | 표시·highlight |
|---|---|---|---|---|---|
| Q01 전문 검색 (`V1-T17-P`) | 대한항공으로 가는 도쿄 항공권이 있나 | `route_desc`와 `airline`에 `multi_match "대한항공 도쿄"` (기본 `operator` or) | 없음 | `_score` 내림차순(기본) | `trip_id`·`route_desc`·`airline`, `route_desc`와 `airline` highlight |
| Q02 정확 조건 (`V1-T18-P`) | 이코노미 직항만 보고 싶다 | 검색어 없음. `bool.filter`만 사용 | `seat_class = economy`, `is_direct = true` | 없음 | `trip_id`·`route_desc`·`seat_class`·`is_direct` |
| Q03 bool/filter (`V1-T19-P`) | 짧게 다녀올 수 있는 직항 이코노미를 60만원 안에서 싼 순으로 | `route_desc`에 `match "직항"` (`must`) | `seat_class = economy`, `stay_nights <= 5`, `total_price <= 600000` | `total_price` 오름차순 → `stay_nights` 오름차순 | 위 field에 총액·체류일수, `route_desc` highlight |

filter는 Q02가 2개, Q03이 3개다. sort 2개는 Q03에 넣었고 highlight는 Q01과 Q03에 붙였다.

Q03의 사용자 질문 한 문장을 검색 의도와 정확 조건으로 나누면 이렇게 된다. 이 분해가
`must`와 `filter`를 가르는 기준이 됐다.

| 질문 조각 | 넣은 자리 | field / type | 이유 |
|---|---|---|---|
| "직항" | `must`의 `match` | `route_desc` / `text` | 문장에서 단어를 찾는다. 점수가 나온다 |
| "이코노미" | `filter`의 `term` | `seat_class` / `keyword` | 세 값 중 하나다. 맞거나 틀리거나다 |
| "짧게" = 5박 이하 | `filter`의 `range` | `stay_nights` / `integer` | 숫자 범위다. 점수로 잴 것이 없다 |
| "60만원 안에서" | `filter`의 `range` | `total_price` / `integer` | 예산 상한이다. 넘으면 아예 보고 싶지 않다 |

`docs/quality-test.md`의 3번 질문(노선별·체류일수별 총액 요약)은 집계라 Day 3의 bool/filter
요구와 맞지 않아 Day 4로 넘겼다. 대신 같은 데이터에서 조건을 여러 개 겹쳐야 답이 나오는
질문으로 Q03을 새로 잡았다.

실행한 요청 본문은 다음과 같다.

```json
// Q01
{ "size": 3,
  "_source": ["trip_id", "route_desc", "airline"],
  "query": { "multi_match": { "query": "대한항공 도쿄",
                              "fields": ["route_desc", "airline"] } },
  "highlight": { "fields": { "route_desc": {}, "airline": {} } } }

// Q02
{ "size": 3,
  "_source": ["trip_id", "route_desc", "seat_class", "is_direct"],
  "query": { "bool": { "filter": [
    { "term": { "seat_class": "economy" } },
    { "term": { "is_direct": true } } ] } } }

// Q03
{ "size": 3,
  "_source": ["trip_id", "route_desc", "seat_class", "stay_nights", "total_price"],
  "query": { "bool": {
    "must": [ { "match": { "route_desc": "직항" } } ],
    "filter": [
      { "term":  { "seat_class": "economy" } },
      { "range": { "stay_nights": { "lte": 5 } } },
      { "range": { "total_price": { "lte": 600000 } } } ] } },
  "sort": [ { "total_price": "asc" }, { "stay_nights": "asc" } ],
  "highlight": { "fields": { "route_desc": {} } } }
```

## 3. 실행 전 기대 기준

기대·제외는 `docs/data-model.md` 2절의 대표 문서와 Day 2에 기록한 분포에서 골랐다.
0건 조건은 `docs/quality-test.md`에 적어 둔 것을 그대로 썼다.

| 요청 ID | 기대 문서 ID·이유 | 제외 문서 ID·이유 | 의도한 0건 조건 | 경계 포함·제외 기준 |
|---|---|---|---|---|
| Q01 | `airline`이 대한항공이면서 `route_desc`에 도쿄가 있는 문서. 두 단어를 모두 만족하므로 이런 문서가 위에 와야 한다 | `TRIP-00001`(도쿄 경유·티웨이항공). 도쿄는 맞지만 항공사가 다르다. 한쪽만 맞은 문서가 상위에 오면 실패로 본다 | `route_desc`·`airline` 어디에도 없는 단어를 `operator: and`로 검색 | 두 단어를 모두 가진 문서만 관련으로 센다. 한 단어만 걸린 문서는 결과에 들어와도 상위권 밖이어야 한다 |
| Q02 | `TRIP-00002`. `docs/data-model.md`에 적어 둔 도쿄 직항 문서이고 economy다 | `TRIP-00001`. 같은 노선이지만 `seat_class`가 business이고 `is_direct`가 false다. 두 조건을 모두 위반한다 | `range total_price > 2000000`. 생성 범위 상한이 1,200,000이고 실제 최댓값이 1,199,769다 | 정확 조건뿐이라 경계값이 없다. `term`은 값이 같거나 다르거나 둘 중 하나다 |
| Q03 | 조건을 모두 만족하는 문서 중 `total_price`가 가장 낮은 것. Day 2에서 확인한 최솟값이 300,029이므로 30만원대가 1위여야 한다 | `TRIP-00001`. 경유이고 business이며 924,066원이라 `must`와 filter 두 개를 위반한다 | `range stay_nights >= 30`. 생성 범위 상한이 10이다 | `stay_nights`는 `lte: 5`라 5박을 포함하고 6박부터 제외다. `total_price`도 600,000을 포함한다 |

경계는 실행 전에 분포부터 확인했다. `stay_nights`는 1박부터 10박까지 모든 값이 1,000건
안팎으로 존재하므로 경계값에 문서가 실제로 놓여 있다. 4교시 문제 5에서 이 field로 포함·제외
경계를 따로 실험했고 결과는 5절에 정리했다.

## 4. 실제 결과와 판정

| 요청 ID | `hits.total.value` | 상위 3개 ID | 조건·경계 통과 | 관련/보류/무관과 근거 | 판정 |
|---|---:|---|---|---|---|
| Q01 | 3,269 | `TRIP-00001`, `TRIP-00002`, `TRIP-00006` (`_score` 1.7776606로 동일) | 조건을 걸지 않았다. 두 단어 중 하나만 걸린 문서까지 들어왔다 | 3건 모두 **보류**. `route_desc`는 도쿄가 맞는데 항공사가 티웨이·제주·진에어다. highlight를 보면 `route_desc`의 `<em>도쿄</em>`만 걸리고 `airline`에는 아무 표시가 없다. 검색어의 절반만 반영된 결과다 | 실패 |
| Q02 | 4,837 | `TRIP-00002`, `TRIP-00003`, `TRIP-00005` | 통과. 세 건의 `_source`에서 economy와 `is_direct: true`를 직접 확인했다 | 3건 모두 **관련**. 두 조건을 그대로 만족한다. 노선이 도쿄·싱가포르·타이베이로 섞여 나오는데 조건에 노선을 넣지 않았으니 맞는 결과다. `_score`가 `null`인 것도 `filter`만 써서 점수를 계산하지 않기 때문이다 | 통과 |
| Q03 | 772 | `TRIP-02382`(300,471원·1박), `TRIP-09904`(300,562원·4박), `TRIP-01715`(300,890원·3박) | 통과. 세 건 모두 `route_desc`에 직항이 있고 economy이며 5박 이하, 60만원 이하다 | 3건 모두 **관련**. 네 조건을 다 만족하고 가격이 오름차순이다. highlight도 `인천 도쿄 왕복 <em>직항</em>`처럼 걸렸다. 다만 1위가 1박짜리라 조건상으로는 맞지만 실제로 이 화면을 본 사람이 첫 줄을 누를지는 다른 문제다 | 통과 |

Q01만 실패로 본 이유는 상위 순위가 아니라 결과 집합이다. 조각을 따로 세어 보니
`arr_airport = NRT`가 1,690건, `airline.keyword = 대한항공`이 1,917건, 둘 다인 문서가 338건이다.
1,690 + 1,917 − 338 = 3,269로 실제 total과 정확히 맞는다. 내가 원한 것은 338건이다.

세 요청 모두 상위 3건만 보면 크게 이상하지 않다. Q01의 실패도 `hits.total.value`를 함께
봤기 때문에 드러났다. 첫 화면만 확인하고 통과로 적었다면 놓쳤을 것이다.

의도한 0건 조건도 실행해 확인했다.

| 조건 | 결과 | 근거 |
|---|---:|---|
| `range total_price > 2000000` | 0 | 생성 범위 상한이 1,200,000 |
| `range stay_nights >= 30` | 0 | 생성 범위 상한이 10 |
| `match route_desc "울란바토르 직항"` (`operator: and`) | 0 | 후보 도시 6개에 없는 이름 |

0건은 검색이 실패한 것이 아니라 조건을 만족하는 문서가 없다는 뜻이다. 다만 같은 0건이라도
원인은 나눠 봐야 한다. 2교시에서 `route_desc`에 `term`으로 문장 전체를 넣었을 때도 0건이었는데
그쪽은 데이터가 없어서가 아니라 field type과 질의 방식이 어긋나서 나온 0건이었다.

## 5. 조건 제거·변형 실험

한 번에 한 요소만 바꿔 다섯 가지를 실행했다. 3~5교시 실습에서 나온 것을 모았다.

| 기준 요청 | 바꾼 한 요소 | 변경 전 total·대표 ID | 변경 후 total·새로 들어온/빠진 ID | 관찰한 역할 |
|---|---|---|---|---|
| Q01 | `fields`에 `airline^3` boost 추가 | 3,269 · `TRIP-00001`(도쿄 경유·티웨이항공) | 3,269 · `TRIP-00003`(**싱가포르** 직항·대한항공), `TRIP-00014`(홍콩), `TRIP-00019`(타이베이)로 상위 3건이 통째로 교체 | boost는 순위를 바꾸지만 결과 집합은 그대로다. 항공사는 맞게 됐는데 이번엔 도착지가 전부 틀렸다. 오답의 종류만 바뀌었다 |
| Q01 | `"operator": "and"` 추가 | 3,269 · `TRIP-00001` | **0** · 전부 빠짐 | `multi_match`의 기본 type인 `best_fields`는 "한 field 안에서" 모든 단어를 찾는다. "대한항공"은 `airline`에만, "도쿄"는 `route_desc`에만 있어 두 단어를 모두 가진 field가 없다 |
| Q02 | `is_direct: true` filter 제거 | 4,837 · `TRIP-00002` | 6,978 · 2,141건 증가. 상위 3건은 그대로 | filter 하나가 2,141건을 걸러낸다. 상위 3건이 우연히 모두 직항이라 첫 화면은 똑같아 보이는데 결과 집합은 44% 늘었다. 화면만 보고는 조건이 빠진 걸 알 수 없다 |
| Q03 | `seat_class: economy` filter 제거 | 772 · `TRIP-02382`(300,471) | 1,124 · 3위에 `TRIP-09512`(300,857·**first**)가 새로 들어오고 `TRIP-01715`는 4위로 밀림 | 등급별로 세니 economy 772 / business 227 / first 125로 227 + 125 = 352가 늘어난 수와 맞는다. 이 조건은 결과 수와 순위를 동시에 바꾼다 |
| Q03의 `stay_nights` | `gte: 3, lte: 7` → `gt: 3, lt: 7` (범위만 따로 실험) | 5,049 | 3,020 · 3박 1,026건과 7박 1,003건이 통째로 빠짐 | 1,026 + 1,003 = 2,029이고 5,049 − 3,020 = 2,029로 정확히 맞는다. "3박 이상"인지 "3박 초과"인지는 말로는 사소해도 결과로는 2,029건 차이다 |

경계 실험은 공통 데이터와 비교하면 차이가 분명하다. 4교시 공통 문제에서 `products`의 가격
경계를 같은 방식으로 바꿨을 때는 440건 그대로였다. 전자기기 중 가격이 정확히 50,000원이나
200,000원인 문서가 0건이었기 때문이다. **결과가 같다고 `gt`와 `gte`가 같은 것이 아니라**
경계에 문서가 없어서 차이가 드러나지 않은 것이었다. 경계를 검증할 때 total 비교만 하면
안 되고 경계값 문서가 실제로 있는지 먼저 세어야 한다는 것을 여기서 배웠다.

`sort` 두 번째 키는 이번 Q03 결과에서는 순서를 바꾸지 않았다. 772건 안에서 `total_price`가
같은 문서를 `terms`로 세니 한 건도 없었다. 전체 데이터에는 330,817원처럼 동률이 2건씩 있는
값이 있으므로 조건이 넓어지면 필요해진다. 지금 없다고 빼면 나중에 순서가 흔들린다.

## 6. 실패 원인 진단

- 문제: Q01의 `hits.total.value`가 3,269건인데 "대한항공이면서 도쿄"인 문서는 338건뿐이다.
  나머지는 두 단어 중 하나만 맞은 문서다. 상위 3건도 항공사가 전부 다르다.

- 1차 원인 분류: **query**. mapping / analyzer / filter / sort / data는 아래 근거로 하나씩 뺐다.

- 확인한 실제 근거:
  - **analyzer 아님.** `GET /flights/_analyze`로 확인하니 `route_desc`는 `인천 / 도쿄 / 왕복 / 직항`
    네 token으로 제대로 쪼개진다. 검색어 "대한항공 도쿄"도 두 token으로 나뉜다.
  - **mapping 아님.** `route_desc`는 `text`, `airline`은 `text` + `keyword`로 둘 다 전문 검색이
    가능한 type이다. 2교시에서 `airline.keyword`에 `term`을 걸어 대한항공 1,917건을 정확히
    세어 봤으므로 데이터도 field도 정상이다.
  - **data 아님.** 조각을 세면 NRT 1,690건, 대한항공 1,917건, 둘 다 338건이고
    1,690 + 1,917 − 338 = 3,269로 total과 맞아떨어진다. 계산이 맞는다는 것은 이상한 문서가
    섞인 것이 아니라 요청이 이대로 동작했다는 뜻이다.
  - **filter·sort 아님.** Q01에는 filter도 sort도 없다.
  - **query가 맞다.** `multi_match`의 기본 `operator`가 `or`라 한 단어만 맞아도 들어온다.
    field를 두 개 넘겼다고 해서 단어를 field에 나눠 배정해 주지는 않는다.

- 다음 확인 또는 변경: 먼저 `"operator": "and"`만 넣어 봤는데 **0건**이 됐다. 기본 type인
  `best_fields`가 한 field 안에서 모든 단어를 찾기 때문이다. 그래서 `"type": "cross_fields"`를
  함께 줘서 두 field를 하나의 큰 field처럼 보게 한다. `fields`·`size`·highlight는 그대로 둔다.

## 7. 개선 전후

| 문제 | 추정 원인 | 변경한 한 요소 | 같은 조건으로 재실행한 결과 | 개선 판정과 근거 |
|---|---|---|---|---|
| Q01의 결과 3,269건 중 2,931건이 두 단어 중 하나만 맞은 문서다 | `multi_match`의 기본값이 `or` + `best_fields`라 단어가 여러 field에 흩어져 있으면 모두 만족시킬 방법이 없다 | `"type": "cross_fields"`와 `"operator": "and"` 추가. 검색어·field·`size`는 그대로 뒀다 | `hits.total.value` 3,269 → **338**. 상위 3건이 `TRIP-00020`·`TRIP-00047`·`TRIP-00075`로 바뀌었고 셋 다 `route_desc`가 "인천 도쿄 왕복 직항"이면서 `airline`이 **대한항공**이다 | **개선.** `bool.filter`로 따로 만든 정답 집합(`airline.keyword = 대한항공` AND `arr_airport = NRT`)이 **338건**으로 개선 후 total과 정확히 같다. 줄이기만 한 것이 아니라 빠뜨린 문서도 없다는 뜻이다 |

중간에 한 번 헛짚었던 것도 남겨 둔다. 처음에는 항공사가 틀린 문서가 위에 있으니 `airline`에
boost를 주면 될 것이라고 봤다. 실제로 `airline^3`을 주니 상위 3건이 전부 대한항공으로 바뀌긴
했는데, 이번에는 도착지가 싱가포르·홍콩·타이베이가 됐다. total은 3,269 그대로였다.
**boost는 순위를 바꾸는 장치이지 결과 집합을 바꾸는 장치가 아니다.** 틀린 문서가 섞인 문제를
점수로 풀려고 하면 어느 쪽 오답을 먼저 볼지만 바뀐다. 무엇을 결과에 넣을지는 `operator`와
`type`이 정한다는 것을 이 순서로 확인했다.

| 요청 | total | 상위 1건 |
|---|---:|---|
| 기본 (`or`, `best_fields`) | 3,269 | `TRIP-00001` 도쿄 경유 · 티웨이항공 |
| `airline^3` boost | 3,269 | `TRIP-00003` 싱가포르 직항 · 대한항공 |
| `best_fields` + `and` | 0 | — |
| `cross_fields` + `and` | **338** | `TRIP-00020` 도쿄 직항 · **대한항공** |

## 8. 완료 체크

- [x] 전문 검색 요청 1개 — Q01 (`multi_match "대한항공 도쿄"`)
- [x] 정확 조건 요청 1개 — Q02 (`bool.filter` 2개)
- [x] bool/filter 요청 1개 — Q03 (`must` 1개 + `filter` 3개)
- [x] filter 2개 이상 — Q02 2개, Q03 3개
- [x] sort 2개 — Q03의 `total_price` 오름차순 → `stay_nights` 오름차순
- [x] highlight 1개 — Q01과 Q03
- [x] 의도한 0건 요청 1개 — `total_price > 2000000` / `stay_nights >= 30` / `울란바토르 직항` 3개
- [x] 상위 3건 사람 평가 — 4절 "관련/보류/무관과 근거"
- [x] 개선 1건과 전후 결과 — 7절 (3,269 → 338)
- [x] README의 기능 목록·실행 경로 동기화
- [x] 최종 commit SHA:

남은 두 항목은 아직 하지 않았다.

`README.md`는 2절 실행 순서의 4번이 "검색 요청 실행: Day 3에 작성"이고, 4절 검색·품질 테스트
표의 실제 결과·판정 칸이 세 줄 모두 "Day 3에 작성"으로 남아 있다. 이 문서 4절의 값으로 채워야
한다. 3절 문서 수도 "목표 5,000~7,000건"으로 적혀 있는데 실제로는 10,000건이라 함께 고쳐야 한다.

`requests.http`도 아직 저장소 루트에 없다. 1~5교시에서 실행한 개인 요청을 `V1-T17-P`~`V1-T21-P`
구간으로 옮겨 적어야 한다. 지금은 이 문서 2절과 교시별 문제지에 본문이 남아 있다.

commit은 이 문서와 `practice/` 다섯 파일을 포함해 아직 하지 않았다. 위 두 항목을 정리한 뒤
한 번에 commit하고 SHA를 여기에 적는다.
