# 독서 처방전 (Reading Prescription)

고민을 입력하면 독서클럽 보유 도서와 확장 도서 중 3권을 추천하는 정적 웹앱입니다.

## 기능
- 고민 입력 → 추천 도서 3권
- 저자, 추천 이유, 한 줄 처방, 복용법
- 책 표지 검색 및 교보문고 검색 링크
- 전체 결과 복사, 최근 20개 상담 기록의 브라우저 로컬 저장
- 111개 클럽 도서 목록 항목 + 확장 도서 10권, 18개 고민 유형

## 실행

```bash
cd reading-prescription
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다.

## Vercel 배포
Vercel에서 `thunder13c/Front-end`를 연동하고 프로젝트 Root Directory를 `reading-prescription`으로 지정하세요. Framework Preset은 `Other`, Build Command는 비우고, Output Directory는 `.`으로 설정합니다.

현재 버전은 키워드 기반의 규칙 추천이며 생성형 AI API는 사용하지 않습니다. 고민 내용은 브라우저 내부에서만 처리되며 최근 20건 기록은 localStorage에 저장됩니다.


## v2 - 개인 고민/키워드 관리
- 내장 버튼 12개와 직접 추가한 버튼(최대 100개)을 클릭하면 해당 고민과 주제로 바로 3권을 추천합니다.
- '키워드 추가·관리'에서 이름·고민 문장·추천 주제(18개 기본 + 선택과 집중)를 등록, 수정, 삭제할 수 있습니다.
- 개인 설정은 localStorage에만 저장됩니다. 브라우저/기기 간 공유하려면 JSON 내보내기/가져오기를 사용합니다.
- 도서는 독서클럽 보유목록 111개 항목에 외부 확장 도서를 추가했습니다. 표지는 Google Books에서 조회하고 교보문고 검색 링크를 제공합니다.
- 보안: 입력 문자열은 textContent로 렌더링하며 API 키나 로그인 없이 동작합니다.
