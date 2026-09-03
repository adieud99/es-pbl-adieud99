# FE·BE 검색 앱 템플릿

이 폴더는 자신의 ES 인덱스와 Search API를 브라우저 검색 화면으로 시연하기 위한 학생용 템플릿입니다. FE·BE 코드를 작성하는 과제가 아닙니다.

## 가장 빠른 시작

준비물은 Day 1에 설치한 Docker Desktop과 실행 중인 3노드 ES뿐입니다. Node.js, npm, 웹 서버를 별도로 설치하지 않습니다.

1. `config/app.config.json`에서 자신의 인덱스명과 화면 표시 field를 바꿉니다.
2. `config/search-request.json`에 자신의 Search API body를 넣고 검색어를 `{{searchText}}`로 바꿉니다.
3. PowerShell에서 `./start.ps1`을 실행합니다. 개인 저장소로 복사한 뒤 처음 실행하면 Day 1 ES 비밀번호를 한 번 묻고 `.env`를 자동 생성합니다.
4. 브라우저에서 <http://localhost:3000>을 엽니다.

개인 인덱스를 처음 연결할 때는 **[APPLY_MY_INDEX_GUIDE.md](./APPLY_MY_INDEX_GUIDE.md)**를 0단계부터 순서대로 진행합니다. 전체 설정 참고와 오류 대응은 [STUDENT_GUIDE.md](./STUDENT_GUIDE.md)를 사용합니다.

## 학생이 수정하는 파일

| 파일 | 수정 내용 |
|---|---|
| `config/app.config.json` | 앱 제목, 인덱스명, 검색 예시, 결과에 표시할 field |
| `config/search-request.json` | 자신이 Day 3에 완성한 `POST /{index}/_search`의 JSON body |

그 밖의 `public/`, `server.mjs`, `Dockerfile`, `docker-compose.yml`은 기본 실습에서 수정하지 않습니다.

> 개인 저장소로 폴더를 복사해도 직접 수정할 설정 파일은 위 2개뿐입니다. 첫 실행의 비밀번호 입력은 ES 연결을 위한 1회 실행 설정이며 `.env`는 스크립트가 만들고 Git에서 제외합니다.

## 주요 명령

```powershell
./start.ps1
./status.ps1
./stop.ps1
```

오류가 발생하면 다음 로그를 확인합니다.

```powershell
docker compose logs --tail 100 search-app
```

## 구성

```text
브라우저 FE ── GET /api/search?q=검색어 ── 고정 BE ── POST /내인덱스/_search ── ES
```

- FE는 결과 목록, 건수, highlight, 0건과 오류 상태를 표시합니다.
- 검색 후 `검색 쿼리 보기`를 누르면 BE가 실제로 실행한 Search API와 검색어가 반영된 JSON body를 확인하고 다시 닫을 수 있습니다.
- BE는 비밀번호를 브라우저에 노출하지 않고 ES에 Search API를 전송합니다.
- BE는 `search-request.json`을 검색할 때마다 다시 읽으므로 JSON 저장 후 앱을 재시작할 필요가 없습니다.
- 이 템플릿은 로컬 교육 환경용입니다. 인터넷에 그대로 공개 배포하지 않습니다.
