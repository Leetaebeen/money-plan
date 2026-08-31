import { useEffect, useMemo, useState } from "react";
import type { FinancialProductFact } from "@money-plan/financial-info";
import type { FinancialProductCatalog } from "@money-plan/financial-info/catalog";
import { SkipLink } from "../../components/SkipLink";
import { UpdatePrompt } from "../../components/UpdatePrompt";
import { formatWon } from "../../domain/plan-form";
import {
  catalogProducts,
  emptyProductFactFilters,
  filterProductFacts,
  loadFinancialProductCatalog,
  productInstitutions,
  productTerms,
  type ProductFactFilters,
} from "./product-facts";
import "./product-facts.css";

const FINLIFE_INFO_URL = "https://finlife.fss.or.kr/finlife/main/contents.do?menuNo=700029";

interface ProductFactsProps {
  onHome: () => void;
}

function percent(value: number | null): string {
  return value === null ? "미공시" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 3 })}%`;
}

function localDateTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function FactCard({ product }: { product: FinancialProductFact }) {
  return (
    <article className="product-fact-card">
      <header>
        <div>
          <span className="product-kind">{product.kind === "DEPOSIT" ? "정기예금" : "적금"}</span>
          <p>{product.institutionName}</p>
          <h2>{product.productName}</h2>
        </div>
        <span className="product-code">상품코드 {product.productCode}</span>
      </header>

      {product.options.length > 0 ? (
        <div className="product-options-wrap">
          <table>
            <caption className="sr-only">{product.productName} 공시 금리 옵션</caption>
            <thead><tr><th>기간</th><th>방식</th><th>기본금리</th><th>최고우대금리</th></tr></thead>
            <tbody>
              {product.options.map((option) => (
                <tr key={`${option.termMonths}-${option.rateTypeCode}-${option.savingTypeCode ?? ""}`}>
                  <th scope="row">{option.termMonths}개월</th>
                  <td>{option.savingTypeName ?? option.rateTypeName}</td>
                  <td>{percent(option.baseRatePct)}</td>
                  <td>{percent(option.maximumRatePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="product-no-options">공시된 금리 옵션이 없습니다.</p>}

      <dl className="product-facts-list">
        <div><dt>가입 방법</dt><dd>{product.joinWay ?? "미공시"}</dd></div>
        <div><dt>가입 대상</dt><dd>{product.eligibleCustomers ?? "미공시"}</dd></div>
        <div><dt>최고 한도</dt><dd>{product.maximumLimitWon === null ? "미공시" : formatWon(product.maximumLimitWon)}</dd></div>
      </dl>

      {(product.specialConditions || product.maturityInterest || product.notes) ? (
        <details>
          <summary>우대조건·만기 후 금리·유의사항 보기</summary>
          {product.specialConditions ? <p><strong>우대조건</strong>{product.specialConditions}</p> : null}
          {product.maturityInterest ? <p><strong>만기 후 금리</strong>{product.maturityInterest}</p> : null}
          {product.notes ? <p><strong>유의사항</strong>{product.notes}</p> : null}
        </details>
      ) : null}

      <footer>
        <span>공시월 {product.source.disclosedMonth}</span>
        <span>수집 {localDateTime(product.source.collectedAt)}</span>
        <a href={FINLIFE_INFO_URL} target="_blank" rel="noreferrer">금융감독원 출처 확인</a>
      </footer>
    </article>
  );
}

export function ProductFacts({ onHome }: ProductFactsProps) {
  const [catalog, setCatalog] = useState<FinancialProductCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProductFactFilters>(emptyProductFactFilters);

  useEffect(() => {
    let mounted = true;
    void loadFinancialProductCatalog(`${import.meta.env.BASE_URL}data/financial-products.json`)
      .then((loaded) => {
        if (mounted) setCatalog(loaded);
      })
      .catch((error: unknown) => {
        if (mounted) setLoadError(error instanceof Error ? error.message : "금융상품 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const products = useMemo(() => catalog ? catalogProducts(catalog) : [], [catalog]);
  const institutions = useMemo(() => productInstitutions(products), [products]);
  const terms = useMemo(() => productTerms(products), [products]);
  const filtered = useMemo(() => filterProductFacts(products, filters), [products, filters]);

  return (
    <div className="product-facts-shell">
      <SkipLink />
      <header className="site-header product-facts-header">
        <button className="brand brand--button" type="button" onClick={onHome} aria-label="머니플랜 홈">
          <img src={`${import.meta.env.BASE_URL}money-plan-icon.svg`} alt="" />
          <span>머니플랜</span>
        </button>
        <span className="local-badge">공식 공시 사실조회</span>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="product-facts-hero">
          <span className="eyebrow">금융감독원 금융상품 한눈에</span>
          <h1>추천 없이<br /><em>공시된 사실만</em> 확인하세요.</h1>
          <p>기관명·상품명·상품 종류·저축기간으로 찾아보고, 각 항목의 공시월과 수집시각을 함께 확인할 수 있습니다.</p>
          <button className="button button--secondary" type="button" onClick={onHome}>머니플랜으로 돌아가기</button>
        </section>

        {loading ? (
          <section className="product-state" role="status"><h2>공식정보 스냅샷을 확인하고 있어요.</h2></section>
        ) : loadError ? (
          <section className="product-state product-state--error" role="alert">
            <h2>공식정보 스냅샷을 열지 못했어요.</h2><p>{loadError}</p>
          </section>
        ) : products.length === 0 ? (
          <section className="product-state">
            <span className="eyebrow">데이터 미연결</span>
            <h2>아직 배포된 공식 상품 스냅샷이 없습니다.</h2>
            <p>화면과 데이터 검증 계약은 준비됐습니다. 서버 환경에서 금융감독원 인증키로 수집한 JSON이 배포되면 상품 사실이 표시됩니다.</p>
            <a href={FINLIFE_INFO_URL} target="_blank" rel="noreferrer">금융감독원 오픈 API 안내 보기</a>
          </section>
        ) : (
          <>
            <section className="product-filters" aria-labelledby="product-filters-title">
              <div className="section-heading">
                <span className="eyebrow">검색 조건</span>
                <h2 id="product-filters-title">순위 없이 조건으로 좁혀보기</h2>
              </div>
              <div className="product-filter-grid">
                <label><span>기관명 또는 상품명</span><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} type="search" /></label>
                <label><span>상품 종류</span><select value={filters.kind} onChange={(event) => setFilters((current) => ({ ...current, kind: event.target.value as ProductFactFilters["kind"] }))}><option value="ALL">전체</option><option value="DEPOSIT">정기예금</option><option value="SAVING">적금</option></select></label>
                <label><span>금융회사</span><select value={filters.institutionCode} onChange={(event) => setFilters((current) => ({ ...current, institutionCode: event.target.value }))}><option value="">전체</option>{institutions.map((institution) => <option key={institution.code} value={institution.code}>{institution.name}</option>)}</select></label>
                <label><span>저축기간</span><select value={filters.termMonths ?? ""} onChange={(event) => setFilters((current) => ({ ...current, termMonths: event.target.value ? Number(event.target.value) : null }))}><option value="">전체</option>{terms.map((term) => <option key={term} value={term}>{term}개월</option>)}</select></label>
              </div>
            </section>

            <section className="product-results" aria-labelledby="product-results-title">
              <div className="section-heading section-heading--row">
                <div><span className="eyebrow">공시 상품</span><h2 id="product-results-title">조건에 맞는 상품 {filtered.length}개</h2></div>
                <span>스냅샷 생성 {catalog?.generatedAt ? localDateTime(catalog.generatedAt) : "미확인"}</span>
              </div>
              {filtered.length > 0 ? <div className="product-fact-grid">{filtered.map((product) => <FactCard key={product.id} product={product} />)}</div> : <div className="product-state"><h2>조건에 맞는 상품이 없습니다.</h2><button className="button button--secondary" type="button" onClick={() => setFilters(emptyProductFactFilters)}>조건 초기화</button></div>}
            </section>
          </>
        )}

        <section className="product-facts-disclosure">
          <h2>표시 기준</h2>
          <p>금리는 세전 연이율 공시값이며 실제 가입 가능 여부와 적용 금리는 금융회사에서 다시 확인해야 합니다. 이 화면은 상품을 추천하거나 금리순으로 순위를 매기지 않습니다.</p>
        </section>
      </main>
      <UpdatePrompt />
    </div>
  );
}
