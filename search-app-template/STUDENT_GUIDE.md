# 내 ES 검색 서비스를 로컬에서 실행하는 방법

> 처음 적용하는 학생은 [내 인덱스를 검색 앱에 연결하는 순서](./APPLY_MY_INDEX_GUIDE.md)를 실행 정본으로 사용하세요. 이 문서는 각 설정의 상세 참고와 오류 대응용입니다.

## 1. 이 템플릿에서 하는 일

Day 3에 만든 Search API를 고정된 FE·BE 템플릿에 연결합니다. 학생의 목표는 웹 개발이 아니라 다음 세 가지를 증명하는 것입니다.

- 자신의 인덱스에서 검색된다.
- 자신이 설계한 Query DSL이 의도대로 동작한다.
- 필요한 ES field가 브라우저 결과에 올바르게 표시된다.

학생이 바꾸는 것은 JSON 파일 2개뿐입니다.

```text
config/app.config.json       인덱스와 FE 표시 설정
config/search-request.json   BE가 ES로 보낼 Search API body
```

## 2. 실행 전 확인

### 2.1 Docker Desktop과 ES 확인

Day 1 Docker 폴더에서 다음 명령을 실행합니다.

```powershell
./status.ps1
```

최소 확인 기준은 다음과 같습니다.

- `es01`, `es02`, `es03`, `kibana`가 실행 중이다.
- 클러스터 상태 요청에 응답한다.
- 자신의 인덱스와 데이터가 이미 생성·적재되어 있다.

### 2.2 자신의 인덱스 확인

Kibana Dev Tools에서 실행합니다.

```http
GET /_cat/indices?v
GET /내_인덱스/_count
GET /내_인덱스/_mapping
```

인덱스명, 문서 수, 검색과 화면 표시에 사용할 field 이름과 타입을 기록합니다.

## 3. 첫 번째 설정: `app.config.json`

`config/app.config.json`을 메모장 또는 VS Code로 엽니다.

```json
{
  "appTitle": "도서 검색 서비스",
  "appDescription": "제목과 줄거리로 도서를 검색합니다.",
  "index": "my-books",
  "searchPlaceholder": "제목이나 줄거리를 입력하세요",
  "exampleQueries": ["여행", "과학", "역사"],
  "pageSize": 12,
  "resultFields": {
    "title": "title",
    "description": "summary",
    "badge": "subject",
    "meta": [
      { "label": "저자", "field": "author" },
      { "label": "출판연도", "field": "publish_year", "format": "number", "suffix": "년" },
      { "label": "대출 가능", "field": "available" }
    ]
  }
}
```

### 항목 설명

| 항목 | 의미 | 주의 |
|---|---|---|
| `appTitle` | 브라우저 제목 | 자유롭게 작성 |
| `index` | 자신의 ES 인덱스명 | `GET /_cat/indices` 결과와 정확히 같아야 함 |
| `exampleQueries` | 화면의 예시 검색 버튼 | 실제 결과가 나오는 검색어 2~3개 권장 |
| `pageSize` | 화면에 표시할 최대 결과 수 | 1~50, 기본 12 |
| `title` | 결과 카드의 제목 field | 필수 |
| `description` | 결과 설명 field | 불필요하면 해당 줄 삭제 가능 |
| `badge` | 카드 오른쪽 분류 field | 불필요하면 해당 줄 삭제 가능 |
| `meta` | 카드 아래 부가 field 목록 | 학생 도메인에 맞게 2~4개 권장 |

`field`에는 ES 문서 `_source` 안의 정확한 field 이름을 씁니다. 객체 내부 field는 `author.name`처럼 점 경로를 사용할 수 있습니다.

숫자에 천 단위 구분을 적용하려면 `"format": "number"`를 사용합니다. `suffix`는 `원`, `년`, `점`처럼 값 뒤에 붙는 글자입니다.

## 4. 두 번째 설정: BE Search API 입력

### 4.1 Dev Tools 요청에서 body만 가져오기

Day 3에 완성한 요청이 다음과 같다고 가정합니다.

```http
POST /my-books/_search
{
  "_source": ["title", "summary", "subject", "author", "publish_year", "available"],
  "query": {
    "multi_match": {
      "query": "여행",
      "fields": ["title^3", "summary"]
    }
  },
  "highlight": {
    "fields": {
      "title": {},
      "summary": {}
    }
  }
}
```

`config/search-request.json`에는 첫 줄 `POST /my-books/_search`를 넣지 않고 `{ ... }` JSON body만 넣습니다. 고정 검색어 `여행`을 `{{searchText}}`로 바꿉니다.

```json
{
  "_source": ["title", "summary", "subject", "author", "publish_year", "available"],
  "query": {
    "multi_match": {
      "query": "{{searchText}}",
      "fields": ["title^3", "summary"]
    }
  },
  "highlight": {
    "pre_tags": ["<mark>"],
    "post_tags": ["</mark>"],
    "fields": {
      "title": {},
      "summary": {}
    }
  }
}
```

BE는 브라우저 검색어를 받아 JSON 안의 모든 `{{searchText}}`를 실제 값으로 바꾼 뒤 `POST /my-books/_search`로 전송합니다.

### 4.2 bool/filter 쿼리도 그대로 사용

검색어와 함께 고정 조건을 적용할 수 있습니다.

```json
{
  "_source": ["title", "summary", "subject", "author", "available"],
  "query": {
    "bool": {
      "must": [
        {
          "multi_match": {
            "query": "{{searchText}}",
            "fields": ["title^3", "summary"]
          }
        }
      ],
      "filter": [
        { "term": { "available": true } }
      ]
    }
  },
  "highlight": {
    "pre_tags": ["<mark>"],
    "post_tags": ["</mark>"],
    "fields": { "title": {}, "summary": {} }
  }
}
```

화면에 선택 필터를 새로 만드는 기능은 기본 범위가 아닙니다. `filter` 값은 Query DSL에 고정해 검색 결과 차이를 시연할 수 있습니다.

### 4.3 Search API 작성 규칙

- `search-request.json`은 JSON만 허용합니다. `GET`, `POST`, 주석은 넣지 않습니다.
- 검색어가 들어갈 문자열을 반드시 `{{searchText}}`로 바꿉니다.
- `app.config.json`의 결과 field를 `_source` 목록에 포함합니다.
- `size`는 앱이 `app.config.json`의 `pageSize`로 덮어씁니다.
- highlight를 쓰려면 `pre_tags`와 `post_tags`를 예제처럼 `<mark>`로 지정합니다.
- 인덱스명은 Search API 파일이 아니라 `app.config.json` 한 곳에서 설정합니다.
- ES 비밀번호는 JSON이나 FE 파일에 적지 않습니다.

## 5. 비밀번호 설정

### 과정 저장소 구조를 그대로 사용하는 경우

`start.ps1`이 자동으로 `../day-01/docker/.env`의 `ELASTIC_PASSWORD`를 사용합니다. 별도 설정이 필요 없습니다.

### 이 폴더만 개인 저장소로 복사한 경우

별도로 파일을 만들 필요가 없습니다. `./start.ps1`을 처음 실행하면 Day 1 ES의 `elastic` 비밀번호를 한 번 묻습니다. 입력 문자는 화면에 표시되지 않으며 스크립트가 `.env`를 자동 생성합니다. 이후 실행에서는 다시 묻지 않습니다.

`.env`는 `.gitignore`에 포함되어 있습니다. GitHub에 commit하지 않습니다.

비밀번호를 잘못 입력했거나 Day 1 비밀번호를 변경했다면 로컬 `.env`를 삭제하고 `./start.ps1`을 다시 실행해 새 비밀번호를 입력합니다. `.env.example`은 수동 설정이 필요한 경우에만 참고합니다.

## 6. 로컬에서 FE·BE 실행

이 폴더에서 PowerShell을 열고 실행합니다.

```powershell
./start.ps1
```

처음 한 번은 작은 Node 컨테이너 이미지를 내려받고 앱 이미지를 만듭니다. Node.js와 npm을 Windows에 별도 설치하지 않습니다. 이후 실행은 기존 이미지를 재사용합니다.

성공 메시지:

```text
검색 앱이 시작되었습니다: http://localhost:3000
```

브라우저에서 <http://localhost:3000>을 엽니다. 같은 주소에서 FE와 BE가 함께 실행됩니다.

상태 확인:

```powershell
./status.ps1
```

종료:

```powershell
./stop.ps1
```

## 7. 설정 변경 반영 방법

`search-request.json`을 수정하고 저장한 뒤 브라우저에서 다시 검색하면 새 Query DSL이 반영됩니다. `app.config.json`도 BE에는 즉시 반영되지만 제목·표시 field 같은 FE 설정은 브라우저를 새로 고쳐야 다시 읽습니다. 두 경우 모두 컨테이너 재시작이나 재빌드는 필요하지 않습니다.

단, `public/`, `server.mjs`, `Dockerfile`을 수정했다면 다음 명령으로 다시 빌드해야 합니다.

```powershell
./start.ps1
```

기본 수업에서는 이 코드 파일들을 수정하지 않습니다.

## 8. FE 기능 테스트

다음 순서로 자신의 검색 기능을 직접 확인하고 화면을 캡처합니다.

### 테스트 1: 대표 검색어

1. `exampleQueries`에 넣은 대표 검색어를 클릭합니다.
2. 결과 건수가 1건 이상인지 확인합니다.
3. 제목, 설명, badge, meta 값이 올바른 field에서 나오는지 확인합니다.
4. 검색어가 제목 또는 설명에 highlight되는지 확인합니다.

성공 기준: 자신의 사용자 질문과 일치하는 문서가 상위에 표시됩니다.

### 테스트 2: 다른 검색어

대표 검색어와 의미가 다른 단어를 입력합니다.

성공 기준: 검색어에 따라 결과와 순위가 달라집니다. 결과가 항상 같다면 `{{searchText}}` 위치를 확인합니다.

### 테스트 3: 0건 검색

데이터에 없는 문자열을 입력합니다. 예: `존재하지않는검색어9999`.

성공 기준: 오류 화면이 아니라 `검색 결과가 없습니다`가 표시됩니다.

### 테스트 4: filter 반례

`bool/filter`를 사용했다면 조건에 맞는 문서와 맞지 않는 문서를 Dev Tools에서 먼저 찾습니다. FE에서 각각 연결되는 검색어를 실행합니다.

성공 기준: 조건을 만족하지 않는 문서는 검색어가 일치해도 결과에 나오지 않습니다.

### 테스트 5: 특수문자

`<script>`, 큰따옴표, 한글·영문 혼합 검색어를 입력합니다.

성공 기준: 화면이 깨지거나 코드가 실행되지 않고 일반 검색어로 처리됩니다.

### 테스트 6: 실제 검색 쿼리 확인

1. 결과가 있는 검색어를 실행합니다.
2. 검색 결과 위의 `검색 쿼리 보기` 버튼을 누릅니다.
3. `POST /내인덱스/_search` 경로와 들여쓰기된 JSON을 확인합니다.
4. JSON의 `{{searchText}}` 자리가 실제 입력 검색어로 바뀌었는지 확인합니다.
5. `검색 쿼리 닫기` 버튼을 눌러 패널을 닫습니다.

성공 기준: 화면에 표시된 JSON이 `search-request.json`을 바탕으로 하며, 실제 검색어와 `pageSize`가 반영되어 있습니다. 비밀번호와 인증 헤더는 표시되지 않습니다.

## 9. API만 따로 확인하는 방법

브라우저 주소창 또는 PowerShell에서 BE API를 직접 확인할 수 있습니다.

```powershell
Invoke-RestMethod 'http://localhost:3000/api/health'
Invoke-RestMethod 'http://localhost:3000/api/search?q=무선'
```

첫 요청은 앱과 설정 파일 상태를 확인합니다. 두 번째 요청은 FE를 거치지 않고 BE → ES 검색 결과를 확인합니다.

판단 방법:

- API도 실패: 인덱스, 비밀번호, Query DSL, ES 연결을 확인합니다.
- API는 성공하지만 화면이 비어 있음: `resultFields`와 `_source`를 확인합니다.
- Dev Tools는 성공하지만 API는 실패: `search-request.json`에서 요청 경로와 주석을 제거했는지 확인합니다.

## 10. 자주 발생하는 오류

### 비밀번호 입력 후 인증 오류

- 과정 저장소 안이라면 `day-01/docker/.env`의 비밀번호와 실행 중인 ES 비밀번호가 같은지 확인합니다.
- 개인 저장소라면 `.env`를 삭제하고 `./start.ps1`을 다시 실행해 비밀번호를 재입력합니다.

### `index_not_found_exception`

`app.config.json`의 `index`가 실제 인덱스명과 다릅니다. 다음 결과와 비교합니다.

```http
GET /_cat/indices?v
```

### `설정 JSON 문법 오류`

두 설정 파일 중 하나에 쉼표, 큰따옴표 또는 괄호 오류가 있습니다. Dev Tools에 JSON body를 붙여 문법을 다시 확인합니다. JSON 마지막 항목 뒤에는 쉼표를 쓰지 않습니다.

### 검색은 성공하지만 카드 값이 `-`

- `resultFields`의 field 이름과 mapping을 비교합니다.
- 해당 field가 `search-request.json`의 `_source`에 포함되었는지 확인합니다.
- 실제 문서에 그 field가 존재하는지 확인합니다.

### 모든 검색어에서 같은 결과

`search-request.json`의 실제 검색어 위치가 `{{searchText}}`로 바뀌었는지 확인합니다.

### 앱 화면이 열리지 않음

```powershell
./status.ps1
docker compose logs --tail 100 search-app
```

3000 포트를 다른 프로그램이 사용한다면 `.env`의 `APP_PORT`를 `3001`로 바꾸고 `http://localhost:3001`로 접속합니다.

### ES 연결 오류

Day 1 ES 컨테이너 상태와 9200 포트 바인딩을 확인합니다. 이 템플릿의 기본 `ES_URL`은 Docker Desktop에서 Windows 호스트의 ES로 연결하는 `https://host.docker.internal:9200`입니다.

## 11. 제출·발표 확인표

- [ ] 자신의 인덱스명이 설정되어 있다.
- [ ] 검색 field와 mapping 타입이 의도에 맞는다.
- [ ] `{{searchText}}`가 Query DSL의 올바른 위치에 있다.
- [ ] 화면 표시 field가 `_source`에 포함되어 있다.
- [ ] 대표 검색어에서 기대 문서가 상위에 나온다.
- [ ] 다른 검색어에서 결과가 달라진다.
- [ ] 0건 검색이 정상 표시된다.
- [ ] filter를 사용했다면 반례를 검증했다.
- [ ] `.env`가 GitHub에 올라가지 않았다.
- [ ] 최종 발표에서 사용자 질문, Query DSL, 검색 결과의 관계를 설명할 수 있다.

## 12. 폴더 구조

```text
search-app-template/
├─ config/
│  ├─ app.config.json       # 학생 수정
│  └─ search-request.json   # 학생 수정
├─ public/                  # 고정 FE
├─ server.mjs              # 고정 BE
├─ Dockerfile
├─ docker-compose.yml
├─ .env.example
├─ start.ps1
├─ status.ps1
├─ stop.ps1
└─ STUDENT_GUIDE.md
```

이 템플릿은 로컬 시연용입니다. 인증·권한·HTTPS·운영 모니터링을 별도로 설계하지 않은 상태로 인터넷에 공개하지 않습니다.
