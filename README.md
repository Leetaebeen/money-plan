# Money Plan

월급과 여윳돈을 용도별 예산 버킷으로 나누는 개인 재무 PWA 프로젝트입니다.

현재 구현 범위는 외부 서비스와 무관한 TypeScript 계산 엔진과 모바일 우선 PWA입니다. 엔진은 특정 은행 상품, ETF, 종목, 매수 시점이나 예상수익률을 출력하지 않습니다.

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

월급·지출·목표 데이터와 사용자가 저장한 시나리오는 브라우저 IndexedDB에만 저장합니다. 회원가입과 서버 전송은 아직 사용하지 않습니다.

## 다음 단계

1. 공개 계산기 정적 페이지 구현
2. PWA 접근성·실사용 베타 검증
3. 공식 금융정보 수집기를 별도 패키지로 연결
4. 출처와 기준일이 있는 금융상품 사실조회 화면 구현
