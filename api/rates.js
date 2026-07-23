import * as cheerio from "cheerio";

// 하나은행 "현재환율" 페이지가 내부적으로 호출하는 AJAX 엔드포인트.
// 브라우저에서 직접 호출하면 CORS로 막히기 때문에, 이 서버리스 함수(서버 사이드)에서 대신 호출한다.
const HANA_URL = "https://www.kebhana.com/cms/rate/wpfxd651_01i_01.do";

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayStrings() {
  // 한국 시간(KST) 기준 날짜 계산
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  return {
    dash: `${yyyy}-${mm}-${dd}`,
    compact: `${yyyy}${mm}${dd}`,
  };
}

export default async function handler(req, res) {
  try {
    const { dash, compact } = todayStrings();

    const body = new URLSearchParams({
      ajax: "true",
      tmpInpStrDt: dash,
      pbldDvCd: "1",
      inqStrDt: compact,
      inqKindCd: "1",
      requestTarget: "searchContentDiv",
    });

    const response = await fetch(HANA_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": "Mozilla/5.0 (compatible; FXBoard/1.0)",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`하나은행 응답 오류: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 1) 헤더 행에서 "매매기준율" 칸의 실제 위치(인덱스)를 찾는다.
    const headerCells = $("div.printdiv thead th, div.printdiv thead td");
    let basicRateIdx = -1;
    headerCells.each((i, el) => {
      const text = $(el).text().replace(/\s+/g, "");
      if (text.includes("매매기준율")) {
        basicRateIdx = i;
      }
    });
    if (basicRateIdx === -1) basicRateIdx = 9;

    // 2) 통화별 상식적인 범위(1단위당 KRW). 벗어나면 잘못 읽은 것으로 보고 버린다.
    const PLAUSIBLE_RANGE = {
      USD: [900, 2500],
      CNY: [100, 400],
      JPY: [5, 20],
      GBP: [1000, 3000],
      AUD: [500, 1500],
      PHP: [10, 50],
      VND: [0.02, 0.1],
      LAK: [0.02, 0.15],
      MMK: [0.3, 1.5],
      KHR: [0.2, 0.6],
    };

    const rows = $("div.printdiv tbody > tr");
    const rates = {};

    rows.each((_, el) => {
      const tds = $(el).find("td");
      if (tds.length <= basicRateIdx) return;

      const nameCell = $(tds[0]).text().replace(/\s+/g, " ").trim();
      const codeMatch = nameCell.match(/([A-Z]{3})/);
      if (!codeMatch) return;
      const code = codeMatch[1];

      const isPer100 = /100/.test(nameCell);

      const basicRateText = $(tds[basicRateIdx]).text().replace(/,/g, "").trim();
      const basicRate = parseFloat(basicRateText);
      if (Number.isNaN(basicRate)) return;

      const perUnit = isPer100 ? basicRate / 100 : basicRate;

      const range = PLAUSIBLE_RANGE[code];
      if (range && (perUnit < range[0] || perUnit > range[1])) return;

      rates[code] = perUnit;
    });

    if (Object.keys(rates).length === 0) {
      throw new Error("환율 테이블을 파싱하지 못했습니다.");
    }

    res.setHeader("Cache-Control", "s-maxage=240, stale-while-revalidate=60");
    res.status(200).json({
      source: "hana-bank",
      updatedAt: new Date().toISOString(),
      rates,
    });
  } catch (err) {
    res.status(500).json({
      error: "fetch_failed",
      message: String(err && err.message ? err.message : err),
    });
  }
}
