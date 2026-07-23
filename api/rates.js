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
    dash: `${yyyy}-${mm}-${dd}`, // 2026-07-24
    compact: `${yyyy}${mm}${dd}`, // 20260724
  };
}

export default async function handler(req, res) {
  try {
    const { dash, compact } = todayStrings();

    const body = new URLSearchParams({
      ajax: "true",
      tmpInpStrDt: dash,
      pbldDvCd: "1", // 1 = 당일 최초 고시 (당일 오전 고시 이후 계속 조회 가능)
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

    const rows = $("div.printdiv tbody > tr");
    const rates = {};

    rows.each((_, el) => {
      const tds = $(el).find("td");
      if (tds.length < 10) return;

      const nameCell = $(tds[0]).text().replace(/\s+/g, " ").trim();
      const codeMatch = nameCell.match(/([A-Z]{3})/);
      if (!codeMatch) return;
      const code = codeMatch[1];

      // 100단위 고시 통화(예: JPY(100), VND(100) 등) 여부 확인
      const isPer100 = /\(100\)/.test(nameCell);

      // 매매기준율은 tbody > tr 의 10번째 td (index 9)
      const basicRateText = $(tds[9]).text().replace(/,/g, "").trim();
      const basicRate = parseFloat(basicRateText);
      if (Number.isNaN(basicRate)) return;

      const perUnit = isPer100 ? basicRate / 100 : basicRate;
      rates[code] = perUnit;
    });

    if (Object.keys(rates).length === 0) {
      throw new Error("환율 테이블을 파싱하지 못했습니다.");
    }

    res.setHeader("Cache-Control", "s-maxage=240, stale-while-revalidate=60");
    res.status(200).json({
      source: "hana-bank",
      updatedAt: new Date().toISOString(),
      rates, // { USD: 1380.5, JPY: 9.32, CNY: 193.1, ... } — 1단위 외화당 KRW
    });
  } catch (err) {
    res.status(500).json({
      error: "fetch_failed",
      message: String(err && err.message ? err.message : err),
    });
  }
}
