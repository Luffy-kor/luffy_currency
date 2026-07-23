import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { ChevronUp, ChevronDown, RefreshCw } from "lucide-react";

// 국가 메타데이터 (환율은 KRW 기준 pivot 방식으로 관리: "1단위 외화 = ? KRW")
const COUNTRY_META = [
  { code: "KR", name: "대한민국", currency: "KRW", symbol: "₩", decimals: 0 },
  { code: "US", name: "미국", currency: "USD", symbol: "$", decimals: 2 },
  { code: "CN", name: "중국", currency: "CNY", symbol: "¥", decimals: 2 },
  { code: "JP", name: "일본", currency: "JPY", symbol: "¥", decimals: 0 },
  { code: "GB", name: "영국", currency: "GBP", symbol: "£", decimals: 2 },
  { code: "AU", name: "호주", currency: "AUD", symbol: "A$", decimals: 2 },
  { code: "PH", name: "필리핀", currency: "PHP", symbol: "₱", decimals: 2 },
  { code: "VN", name: "베트남", currency: "VND", symbol: "₫", decimals: 0 },
  { code: "LA", name: "라오스", currency: "LAK", symbol: "₭", decimals: 0 },
  { code: "MM", name: "미얀마", currency: "MMK", symbol: "K", decimals: 0 },
  { code: "KH", name: "캄보디아", currency: "KHR", symbol: "៛", decimals: 0 },
];

// 하나은행에서 고시하지 않거나 조회 실패 시 사용하는 대체(고정) 환율: 1단위 외화 = ? KRW
const FALLBACK_RATES = {
  KRW: 1,
  USD: 1380,
  CNY: 193,
  JPY: 9.3,
  GBP: 1840,
  AUD: 910,
  PHP: 24.4,
  VND: 0.0543,
  LAK: 0.0636,
  MMK: 0.657,
  KHR: 0.343,
};

const findCountry = (code) => COUNTRY_META.find((c) => c.code === code);

function formatNumber(value, decimals) {
  if (Number.isNaN(value)) return "";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function App() {
  const [rows, setRows] = useState(["KR", "US", "JP", "VN", "PH"]);
  const [amount, setAmount] = useState("1000");
  const [rates, setRates] = useState(() => {
    const init = {};
    Object.entries(FALLBACK_RATES).forEach(([code, val]) => {
      init[code] = { value: val, live: false };
    });
    return init;
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [fetchError, setFetchError] = useState(false);
  const intervalRef = useRef(null);

  const fetchHanaRates = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const response = await fetch("/api/rates");
      if (!response.ok) throw new Error(`API 오류: ${response.status}`);
      const data = await response.json();

      setRates((prev) => {
        const next = { ...prev };
        Object.entries(data.rates || {}).forEach(([code, val]) => {
          const num = Number(val);
          if (!Number.isNaN(num) && num > 0) {
            next[code] = { value: num, live: true };
          }
        });
        return next;
      });
      setLastUpdated(new Date());
    } catch (err) {
      console.error("환율 조회 실패:", err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHanaRates();
    intervalRef.current = setInterval(fetchHanaRates, 5 * 60 * 1000); // 5분마다
    return () => clearInterval(intervalRef.current);
  }, [fetchHanaRates]);

  const baseCountry = findCountry(rows[0]);
  const numericAmount = parseFloat(amount.replace(/,/g, "")) || 0;
  const baseRate = rates[baseCountry.currency]?.value ?? FALLBACK_RATES[baseCountry.currency];
  const baseKrw = numericAmount * baseRate;

  const computed = useMemo(() => {
    return rows.map((code) => {
      const country = findCountry(code);
      const rateInfo = rates[country.currency] ?? { value: FALLBACK_RATES[country.currency], live: false };
      const value = baseKrw / rateInfo.value;
      return { code, country, value, live: rateInfo.live };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, baseKrw, rates]);

  const usedCodes = new Set(rows);

  const moveRow = (index, dir) => {
    setRows((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const changeCountry = (index, newCode) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = newCode;
      return next;
    });
  };

  const handleAmountChange = (e) => {
    const raw = e.target.value;
    if (/^[0-9]*\.?[0-9]*$/.test(raw)) {
      setAmount(raw);
    }
  };

  const formatUpdatedTime = (d) => {
    if (!d) return "조회 중...";
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <div
      className="min-h-screen w-full bg-[#0B1220] text-[#E7ECF3] flex flex-col items-center py-10 px-4"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* 헤더 */}
      <div className="w-full max-w-md mb-6">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-[#F5C451]">환율 보드</h1>
          <span className="text-[11px] text-[#5B6B85] tracking-widest uppercase">Exchange Board</span>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-[#F5C451]/60 via-[#2A3550] to-transparent mt-3" />

        {/* 상태 바: 마지막 업데이트 시각 + 새로고침 */}
        <div className="flex items-center justify-between mt-3 text-[11px] text-[#5B6B85]">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                fetchError ? "bg-[#E05A5A]" : "bg-[#4ADE80]"
              }`}
            />
            <span>하나은행 매매기준율 · {formatUpdatedTime(lastUpdated)} 기준</span>
          </div>
          <button
            onClick={fetchHanaRates}
            disabled={loading}
            className="flex items-center gap-1 text-[#8FA3C7] hover:text-[#F5C451] disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            새로고침
          </button>
        </div>
        {fetchError && (
          <p className="text-[11px] text-[#E05A5A] mt-1">
            환율 조회에 실패하여 이전 값 또는 대체 환율을 표시 중입니다.
          </p>
        )}
      </div>

      <div className="w-full max-w-md flex flex-col gap-3">
        {computed.map((row, index) => {
          const isBase = index === 0;
          return (
            <div
              key={row.code + index}
              className={`relative rounded-xl border transition-colors ${
                isBase
                  ? "border-[#F5C451] bg-[#151E33] shadow-[0_0_0_1px_rgba(245,196,81,0.15)]"
                  : "border-[#232E48] bg-[#101828]"
              } px-4 py-3 flex items-center gap-3`}
            >
              {/* 순서 변경 버튼 */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => moveRow(index, -1)}
                  disabled={index === 0}
                  className={`w-6 h-6 flex items-center justify-center rounded-md ${
                    index === 0
                      ? "text-[#2A3550] cursor-not-allowed"
                      : "text-[#8FA3C7] hover:bg-[#1E2A45] hover:text-[#F5C451]"
                  }`}
                  aria-label="위로 이동"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => moveRow(index, 1)}
                  disabled={index === computed.length - 1}
                  className={`w-6 h-6 flex items-center justify-center rounded-md ${
                    index === computed.length - 1
                      ? "text-[#2A3550] cursor-not-allowed"
                      : "text-[#8FA3C7] hover:bg-[#1E2A45] hover:text-[#F5C451]"
                  }`}
                  aria-label="아래로 이동"
                >
                  <ChevronDown size={16} />
                </button>
              </div>

              {/* 국가 선택 콤보박스 */}
              <div className="flex flex-col min-w-[92px]">
                <select
                  value={row.code}
                  onChange={(e) => changeCountry(index, e.target.value)}
                  className="bg-[#0D1524] border border-[#2A3550] text-[#E7ECF3] text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#F5C451] cursor-pointer"
                >
                  {COUNTRY_META.map((c) => (
                    <option key={c.code} value={c.code} disabled={usedCodes.has(c.code) && c.code !== row.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-[#5B6B85] mt-1 tracking-wide flex items-center gap-1">
                  {row.country.currency} · {row.country.symbol}
                  {!row.live && (
                    <span className="text-[#E0A55A]" title="실시간 조회 실패 또는 미제공으로 대체 환율 사용 중">
                      (대체값)
                    </span>
                  )}
                </span>
              </div>

              {/* 금액 표시 / 입력 */}
              <div className="flex-1 text-right">
                {isBase ? (
                  <input
                    value={amount}
                    onChange={handleAmountChange}
                    inputMode="decimal"
                    className="w-full bg-transparent text-right text-2xl font-semibold text-[#F5C451] focus:outline-none tabular-nums"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  />
                ) : (
                  <div
                    className="text-2xl font-semibold text-[#E7ECF3] tabular-nums"
                    style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                  >
                    {formatNumber(row.value, row.country.decimals)}
                  </div>
                )}
                {isBase && (
                  <span className="text-[10px] text-[#F5C451]/70 uppercase tracking-widest">기준 입력값</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-[#4A5773] mt-6 max-w-md text-center leading-relaxed">
        환율은 하나은행 홈페이지에서 서버(API 라우트)를 통해 5분마다 자동 갱신됩니다. 일부 통화(라오스킵·미얀마짯·캄보디아리엘 등)는
        하나은행에서 고시하지 않을 수 있으며, 이 경우 대체 환율이 표시됩니다.
        <br />
        본 앱은 참고용이며 실제 거래 환율과 차이가 있을 수 있습니다.
      </p>
    </div>
  );
}
