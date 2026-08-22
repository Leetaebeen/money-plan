# Money Plan

월급과 여윳돈을 용도별 예산 버킷으로 나누는 개인 재무 PWA 프로젝트입니다.

현재 구현 범위는 외부 서비스와 무관한 순수 TypeScript 계산 엔진입니다. 엔진은 특정 은행 상품, ETF, 종목, 매수 시점이나 예상수익률을 출력하지 않습니다.

## 현재 구조

```text
money-plan/
├─ docs/
│  └─ allocation-engine-v1.md
└─ packages/
   └─ finance-engine/
      ├─ src/
      └─ tests/
```

## 테스트

Node.js 24 이상에서 별도 패키지 설치 없이 실행할 수 있습니다.

```bash
npm test
```

## 다음 단계

1. 계산 엔진 UI 데이터 계약 확정
2. PWA 화면과 IndexedDB 저장 구현
3. 공개 계산기 정적 페이지 구현
4. 공식 금융정보 수집기를 별도 패키지로 연결

