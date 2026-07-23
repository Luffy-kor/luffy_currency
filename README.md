# 환율 보드 (하나은행 매매기준율)

5개국 환율을 비교하는 모바일 친화적 계산기. 서버(Vercel Serverless Function)에서
하나은행 "현재환율" 페이지를 직접 조회해 CORS 없이 JSON으로 변환하고, 프런트엔드가
5분마다 이 API를 폴링해서 화면을 갱신합니다.

## 프로젝트 구조

```
├── api/rates.js        # Vercel 서버리스 함수: 하나은행 데이터를 서버에서 가져와 JSON으로 반환
├── src/App.jsx          # 메인 화면 (5개 리스트, 콤보박스, 순서 변경, 5분 자동 갱신)
├── src/main.jsx         # React 진입점
├── index.html
└── package.json
```

## 로컬에서 실행하기 (선택 사항)

```bash
npm install
npm run dev
```

`npm run dev`는 `/api/rates`를 실행하지 않는 정적 프리뷰이므로, API까지 로컬에서 테스트하려면
아래처럼 Vercel CLI를 쓰는 걸 추천합니다.

```bash
npm install -g vercel
vercel dev
```

## Vercel에 배포하기

### 방법 A — 웹 대시보드 (가장 쉬움, 터미널 불필요)

1. 이 폴더를 GitHub 저장소로 올립니다. (GitHub Desktop이나 웹 업로드로도 가능)
2. https://vercel.com 에 로그인 → **Add New → Project**
3. 방금 올린 GitHub 저장소를 선택 → Framework Preset은 **Vite**로 자동 인식됩니다.
4. **Deploy** 클릭. 2~3분 후 `https://프로젝트이름.vercel.app` 주소가 생깁니다.
5. 이 주소를 카카오톡 등으로 공유하면 어디서든 브라우저로 바로 열립니다.

### 방법 B — Vercel CLI

```bash
npm install -g vercel
cd hana-fx-app
vercel        # 첫 배포 (질문에 답하면 자동으로 설정됨)
vercel --prod # 프로덕션 배포
```

배포가 끝나면 터미널에 `https://...vercel.app` 주소가 출력됩니다.

## 동작 방식 / 주의사항

- `api/rates.js`는 하나은행 홈페이지가 내부적으로 쓰는 조회 URL
  (`https://www.kebhana.com/cms/rate/wpfxd651_01i_01.do`)을 서버에서 대신 호출해
  HTML 표를 파싱한 뒤 JSON으로 돌려줍니다. 브라우저가 아닌 서버에서 호출하기 때문에
  CORS 제한을 받지 않습니다.
- 라오스킵(LAK)·미얀마짯(MMK)·캄보디아리엘(KHR)은 하나은행이 고시하지 않는 경우가 많아,
  이 경우 화면에 "(대체값)"으로 표시되는 고정 환율을 대신 사용합니다.
- 하나은행이 페이지 구조(HTML 태그, 파라미터)를 변경하면 `api/rates.js`의 파싱 로직도
  함께 수정해야 할 수 있습니다.
- 실거래(송금/환전) 전에는 반드시 하나은행 앱/창구에서 최종 환율을 다시 확인하세요.
