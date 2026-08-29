# Money Plan

월급과 여윳돈을 용도별 예산 버킷으로 나누는 개인 재무 PWA 프로젝트입니다.

현재 구현 범위는 외부 서비스와 무관한 TypeScript 계산 엔진과 모바일 우선 PWA입니다. 입력 중인 월급·여윳돈 계획은 브라우저에 자동 저장되며, 사용자가 선택해 저장한 계산 결과의 전체 이력을 다시 열거나 개별 삭제하고 월급 계획의 월별 변화를 비교할 수 있습니다. 엔진은 특정 은행 상품, ETF, 종목, 매수 시점이나 예상수익률을 출력하지 않습니다.

## 현재 구조

```text
money-plan/
├─ apps/
│  └─ web/                 # React + Vite PWA
│     ├─ src/
│     └─ tests/
├─ docs/
│  └─ allocation-engine-v1.md
└─ packages/
   └─ finance-engine/
      ├─ src/
      └─ tests/
```

## 테스트

Node.js 24 이상에서 실행할 수 있습니다.

```bash
npm install
npm run dev:web
```

전체 보안 검사, 타입 검사, 테스트, 프로덕션 빌드는 다음 명령으로 확인합니다.

```bash
npm run check
npm test
```

월급·지출·목표 데이터, 작성 중 초안과 사용자가 저장한 시나리오는 브라우저 IndexedDB에만 저장합니다. 회원가입과 서버 전송은 아직 사용하지 않습니다.

## 무료 배포

`main` 브랜치의 CI 검증이 끝나면 GitHub Pages용 PWA를 빌드하고 자동 배포합니다.

- 공개 주소: <https://leetaebeen.github.io/money-plan/>
- 배포 빌드: `npm run build:pages`
- 배포 산출물 검사: `npm run check:pages`

첫 배포 전에 저장소의 `Settings` → `Pages` → `Build and deployment`에서 `Source`를 `GitHub Actions`로 한 번 선택해야 할 수 있습니다. API 키는 필요하지 않습니다.

## 다음 단계

1. 실기기 PWA 베타 결과 수집 및 보완
2. 공개 계산기 정적 페이지 구현
3. 공식 금융정보 수집기를 별도 패키지로 연결
4. 출처와 기준일이 있는 금융상품 사실조회 화면 구현
