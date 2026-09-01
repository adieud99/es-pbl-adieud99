# Day 2 데이터 설계와 적재 기록

- 확인 일시: 2026-09-01
- 실행 환경: macOS, Docker Desktop, Elasticsearch 9.5.0, Kibana 9.5.0
- 개인 index: `flights`

> 비밀번호, `.env` 실제 값, 토큰은 기록하지 않는다.
> 아래 응답은 모두 본인 Console·터미널의 실제 출력이다.

## 실행 환경 참고

강사 배포 `pbl-data-template`은 PowerShell 기준이라 macOS에서 실행할 수 없다. 같은 역할을
하는 생성 스크립트를 Python으로 직접 작성해 `data/flights-create.py`에 두었다. seed를
고정해 재현 가능하며, 생성 규칙과 실제 분포는 `data/generation-notes.md`에 기록했다.

Bulk 적재도 `load-data.ps1` 대신 `docker cp` + `curl`로 수행했다.

---

## T09 · 환경과 문서 단위

### 실행한 요청

```
GET /_cat/nodes?v
GET /_cat/indices?v
```

### 통과 기준

node 3개와 version 9.5.0이 보인다.

### 결과

```
ip         heap.percent ram.percent cpu load_1m load_5m load_15m node.role   master name
172.21.0.3           40         100   6    2.54    0.93     0.33 cdfhilmrstw *      es01
172.21.0.5           45         100   6    2.54    0.93     0.33 cdfhilmrstw -      es03
172.21.0.4           82         100   6    2.54    0.93     0.33 cdfhilmrstw -      es02
```

- node: es01, es02, es03 (3개)
- version: 9.5.0
- master: es01
- 작업 시작 시점 `flights` 존재 여부: 없음

### 판정

통과. master 별표는 선출 결과이며 `node.role`의 `m` 표시와 다른 값이다.

---

## T10 · 대표 문서와 질문 연결

기준 질문은 "도쿄행 왕복 직항 이코노미 중 총액 50만원 이하를 싼 순으로"다.

| 판정 | 조건 | 근거 |
|---|---|---|
| 포함 | `arr_airport`=NRT, `is_direct`=true, `seat_class`=economy, `total_price`≤500000 | 네 조건을 모두 만족한다 |
| 제외 | 위 조건에서 `is_direct`=false | 가격이 범위 안이어도 경유편은 빠진다 |
| 경계 | `total_price`가 정확히 500,000 | "이하"이므로 포함된다. 500,100원이면 100원 차이로 제외된다 |

경계값 하나만으로는 "이하"와 "미만"을 구분해 검증할 수 없으므로, 경계에 걸리는 문서와
바로 밖의 문서를 짝으로 확인한다.

---

## T11 · mapping 초안

`elasticsearch/index-create.json`에 11개 field를 정의했다. type 선택 이유는
`docs/data-model.md`의 표에 있다.

### type을 잘못 고르면 불가능해지는 질문

1. `total_price`를 `keyword`로 두면 "50만원 이하"를 범위로 좁힐 수 없다. 문자열로 비교되어
   `"1200000"`이 `"500000"`보다 작다고 판정된다.
2. `airline`을 `text`로만 두면 항공사별 건수를 집계할 수 없다. 분석된 token 단위로 묶이기
   때문에 항공사 이름 단위의 집계가 되지 않는다. 그래서 `airline.keyword`를 함께 두었다.

`dynamic`을 `strict`로 둔 이유는, 정의하지 않은 field가 들어오면 색인을 거부해서 생성
스크립트와 mapping이 어긋나는 것을 바로 잡아내기 위해서다.

---

## T12 · index 생성과 shard

### 실행한 요청

```
GET /flights
PUT /flights   (body는 elasticsearch/index-create.json 전체)
GET /flights/_mapping
GET /flights/_count
GET /_cat/shards/flights?v
```

### 통과 기준

`acknowledged: true`, mapping이 파일과 일치, `number_of_shards` 1 / `number_of_replicas` 1,
새 index이므로 `count` 0.

### 결과

생성 전 `GET /flights`:

```json
{
  "error": {
    "type": "index_not_found_exception",
    "reason": "no such index [flights]",
    "resource.type": "index_or_alias",
    "resource.id": "flights",
    "index": "flights"
  },
  "status": 404
}
```

`PUT /flights`:

```json
{
  "acknowledged": true,
  "shards_acknowledged": true,
  "index": "flights"
}
```

`GET /_cat/shards/flights?v`:

```
(여기에 shards 응답을 붙여넣는다)
```

### 판정

통과. 생성 전 404는 index가 없다는 정상 응답이다.

`acknowledged`와 `shards_acknowledged`는 다른 값이다. 앞은 index 생성 요청이 클러스터
상태에 반영되었다는 뜻이고, 뒤는 요청 시간 안에 shard가 모두 시작되었다는 뜻이다. 후자가
false여도 index 자체는 만들어졌을 수 있으므로 무조건 다시 PUT하지 않는다.

---

## T13 · analyzer

같은 입력을 standard 직접 지정과 실제 field 설정 두 방식으로 확인했다.

### 검색어 1 — `인천 도쿄 왕복 직항`

```
POST /_analyze
{ "analyzer": "standard", "text": "인천 도쿄 왕복 직항" }

POST /flights/_analyze
{ "field": "route_desc", "text": "인천 도쿄 왕복 직항" }
```

- 예상 token:
- 실제 token (standard):
- 실제 token (`route_desc`):
- 차이와 이유:

### 검색어 2 — `대한항공`

```
POST /_analyze
{ "analyzer": "standard", "text": "대한항공" }

POST /flights/_analyze
{ "field": "airline", "text": "대한항공" }
```

- 예상 token:
- 실제 token (standard):
- 실제 token (`airline`):
- 차이와 이유:

### 검색어 3 — `Korean Air ICN`

```
POST /_analyze
{ "analyzer": "standard", "text": "Korean Air ICN" }

POST /flights/_analyze
{ "field": "airline", "text": "Korean Air ICN" }
```

- 예상 token:
- 실제 token (standard):
- 실제 token (`airline`):
- 차이와 이유:

두 결과가 같아도 정상이다. `route_desc`와 `airline` 모두 별도 analyzer를 지정하지 않아
기본 standard analyzer를 쓴다. token 수를 검색되는 문서 수로 해석하지 않는다.

---

## T14 · 개인 CRUD

임시 문서 `TRIP-TEST-01`로 생성 → 조회 → 수정 → 재조회 → 삭제 → 삭제 후 조회를 연결했다.

| 단계 | 예상 result | 실제 result | 확인한 값 |
|---|---|---|---|
| 출발 `_count` | 10000 | | |
| 생성 전 GET | 404 | | 미사용 ID |
| `op_type=create` PUT | created | | |
| 수정 전 GET | found:true | | 수정 전 `_source` |
| `_update` total_price | updated | | `total_price`만 변경 |
| 재조회 | found:true | | 나머지 field 유지 |
| 같은 값 update | noop | | |
| DELETE | deleted | | |
| 삭제 후 GET | found:false | | |
| 두 번째 DELETE | not_found | | |
| 마지막 `_count` | 10000 | | |

### 변경 전후 `_source`

```
(수정 전)
```

```
(수정 후)
```

---

## T15 · 데이터 생성

### 실행한 명령

```bash
cd data
python3 flights-create.py
```

### 통과 기준

10,000건이 생성되고 NDJSON 줄 수가 20,000이다. action 줄과 문서 줄이 번갈아 나온다.

### 결과

```
10000건 생성 완료
```

```bash
wc -l flights-10000.ndjson
   20000 flights-10000.ndjson
```

첫 두 줄:

```
{"index": {"_index": "flights", "_id": "TRIP-00001"}}
{"trip_id": "TRIP-00001", "route_desc": "인천 도쿄 왕복 경유", "airline": "티웨이항공", "dep_airport": "ICN", "arr_airport": "NRT", "seat_class": "business", "out_dep_time": "2026-09-15T23:46:28Z", "stay_nights": 5, "total_price": 924066, "is_direct": false, "tags": ["수하물포함", "할인"]}
```

### 로컬 확인

생성 직후 파일에서 직접 세어 본 값이다.

```
노선: SIN 1691 / NRT 1690 / BKK 1670 / HKG 1666 / TPE 1646 / KIX 1637
total_price > 2,000,000: 0건
stay_nights >= 30: 0건
```

로컬 확인은 파일 검사이며 Elasticsearch 저장 성공을 대신하지 않는다. 서버에 들어간 값은
T16에서 다시 확인한다.

### 판정

통과. 생성 규칙과 seed는 `data/generation-notes.md`에 기록했다.

---

## T16 · 적재와 분포 검증

### 실행한 명령

```bash
cd ~/Desktop/es-5days-pbl-course/day-01/docker
ES_PW=$(grep '^ELASTIC_PASSWORD=' .env | cut -d= -f2-)
docker cp ~/Desktop/es-pbl-adieud99/data/flights-10000.ndjson $(docker compose ps -q es01):/tmp/bulk.ndjson
docker compose exec -T es01 curl -s --cacert config/certs/ca/ca.crt -u "elastic:$ES_PW" \
  -H 'Content-Type: application/x-ndjson' \
  -X POST 'https://localhost:9200/_bulk?refresh=wait_for&filter_path=errors' \
  --data-binary @/tmp/bulk.ndjson
```

### 통과 기준

Bulk `errors: false`, `_count`가 10,000.

### 결과

```
Successfully copied 3.55MB to 655561bd7913...:/tmp/bulk.ndjson
{"errors":false}
```

`GET /flights/_search`의 `hits.total.value`: **10000**

### 분포

```json
"by_route": [
  { "key": "SIN", "doc_count": 1691 },
  { "key": "NRT", "doc_count": 1690 },
  { "key": "BKK", "doc_count": 1670 },
  { "key": "HKG", "doc_count": 1666 },
  { "key": "TPE", "doc_count": 1646 },
  { "key": "KIX", "doc_count": 1637 }
],
"by_class": [
  { "key": "economy",  "doc_count": 6978 },
  { "key": "business", "doc_count": 2004 },
  { "key": "first",    "doc_count": 1018 }
],
"by_direct": [
  { "key_as_string": "true",  "doc_count": 6974 },
  { "key_as_string": "false", "doc_count": 3026 }
],
"by_airline": [
  { "key": "진에어",       "doc_count": 2063 },
  { "key": "아시아나항공", "doc_count": 2031 },
  { "key": "제주항공",     "doc_count": 1996 },
  { "key": "티웨이항공",   "doc_count": 1993 },
  { "key": "대한항공",     "doc_count": 1917 }
],
"price": { "count": 10000, "min": 300029, "max": 1199769, "avg": 750878.2616 },
"stay":  { "count": 10000, "min": 1, "max": 10, "avg": 5.48 },
"depart": {
  "min_as_string": "2026-09-01T00:00:56.000Z",
  "max_as_string": "2026-09-30T23:57:57.000Z",
  "avg_as_string": "2026-09-16T00:00:12.416Z"
}
```

| 항목 | 설계값 | 실제 관찰값 | 판정 |
|---|---|---|---|
| 전체 건수 | 10,000 | 10,000 | 일치 |
| 노선 6개 | 각 1,666.7 (균등) | 1,637 ~ 1,691 | 정상 범위 |
| `seat_class` | 70 / 20 / 10 | 69.8 / 20.0 / 10.2 | 일치 |
| `is_direct` | 70 / 30 | 69.7 / 30.3 | 일치 |
| `airline` 5사 | 각 2,000 (균등) | 1,917 ~ 2,063 | 정상 범위 |
| `total_price` | 300,000 ~ 1,200,000 | 300,029 ~ 1,199,769 | 범위 안 |
| `stay_nights` | 1 ~ 10 | 1 ~ 10 | 일치 |
| `out_dep_time` | 2026-09-01 ~ 09-30 | 09-01T00:00:56 ~ 09-30T23:57:57 | 범위 안 |

확률로 생성한 값이므로 비율이 정확한 고정 건수로 나오지 않는다. `total_price`의 실제
최솟값이 300,000이 아니고 최댓값도 1,200,000이 아닌 것도 같은 이유다. 허용 범위의 양 끝값이
무작위 표본에 반드시 등장하지는 않는다.

`total_price`의 평균 750,878이 범위 중앙값 750,000에 매우 가까운 것으로 균등 분포임을
확인할 수 있다. `stay_nights`의 평균 5.48도 1~10의 중앙값 5.5에 가깝다.

### 0건 조건 확인

```
GET /flights/_count
{ "query": { "range": { "total_price": { "gt": 2000000 } } } }
```
```json
{ "count": 0, "_shards": { "total": 1, "successful": 1, "skipped": 0, "failed": 0 } }
```

```
GET /flights/_count
{ "query": { "range": { "stay_nights": { "gte": 30 } } } }
```
```json
{ "count": 0, "_shards": { "total": 1, "successful": 1, "skipped": 0, "failed": 0 } }
```

| 조건 | 기대 | 실제 | 근거 |
|---|---|---|---|
| `total_price` > 2,000,000 | 0건 | 0건 | 생성 범위 상한이 1,200,000 |
| `stay_nights` >= 30 | 0건 | 0건 | 생성 범위 상한이 10 |

0건은 검색 실패가 아니라 조건을 만족하는 문서가 없다는 뜻이다.

### 설계와 다른 점

`seat_class`의 first가 설계 10%인데 실제 10.2%로 나왔다. 이는 난수 표본의 정상 편차다.
1,000건으로 생성했을 때는 편차가 더 컸으나 10,000건에서는 설계값에 가깝게 수렴했다.

---

## T16 · pipeline

판단은 `docs/pipeline-decision.md`에 있다. 결론은 미적용이며 `_simulate`로 동작만 확인했다.

### `_simulate` 결과

| 항목 | 예상 | 실제 |
|---|---|---|
| `carrier_name` | `airline`으로 이름 변경 | |
| `is_direct` 없음 | false 추가 | |
| `is_direct` true | override:false로 true 유지 | |
| `temp` / `raw_price` | 제거 | |
| 나머지 field | 유지 | |

```
(simulate 응답)
```

`_simulate`는 저장하지 않으므로 `_count`가 늘지 않는다.

---

## 겪은 문제와 조치

| 증상 | 원인 | 조치 |
|---|---|---|
| 생성 스크립트 실행 시 `FileNotFoundError: 'data/flights-1000.json'` | 출력 경로에 `data/`가 붙어 있어 `data/` 안에서 실행하면 `data/data/`를 찾음. 파일명도 실제 건수와 달랐음 | 출력 경로를 `flights-{DOCUMENT_COUNT}.json`으로 수정 |
| 노선별 집계 차트를 만들 수 없음 | `arr_airport`가 NRT 하나로 고정되어 있어 막대가 하나뿐 | 도착 공항 6개를 후보로 두고 `route_desc`가 도착 도시명을 따라가도록 수정한 뒤 재생성 |
| 0건 조건이 실제로는 213건 | "퍼스트클래스 총액 50만원 이하"는 `total_price`와 `seat_class`가 독립 생성되어 성립하지 않음 | 단일 field 범위 밖 조건(`total_price` > 2,000,000)으로 변경 |

---

## commit 확인

```bash
git status
git diff --cached
git commit -m "Day 2 데이터 설계와 적재 검증"
git rev-parse --short HEAD
git push origin main
```

- commit SHA:
- branch:
- GitHub에서 같은 commit 확인:

`git diff --cached`에 `.env`·인증값·전체 NDJSON이 없는지 확인한 뒤 commit했다.
