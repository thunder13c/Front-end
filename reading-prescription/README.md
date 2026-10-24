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
