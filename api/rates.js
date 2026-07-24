// 한국수출입은행 공식 Open API를 사용해 환율(매매기준율)을 가져온다.
// 은행 홈페이지 화면을 직접 긁는 방식과 달리, 필드가 명확한 JSON으로 제공되어
// 페이지 구조 변경으로 값이 잘못 읽히는 문제가 없다.
//
// ⚠️ Vercel 프로젝트 설정(Settings → Environment Variables)에
//    EXIM_API_KEY = 발급받은 인증키 를 등록해야 동작합니다.

const EXIM_URL =
  "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON";

function pad(n) {
  return String(n).padStart(2, "0");
}

function kstDateWithOffset(offsetDays) {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  now.setDate(now.getDate() - offsetDays);
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  return `${yyyy}${mm}${dd}`;
}

export default async function handler(req, res) {
  try {
    const authkey = process.env.EXIM_API_KEY;
    if (!authkey) {
      throw new Error(
        "EXIM_API_KEY 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정에서 등록해주세요."
      );
    }

    let rates = null;
    let usedDate = null;

    for (let offset = 0; offset < 7 && !rates; offset++) {
      const searchdate = kstDateWithOffset(offset);
      const url = `${EXIM_URL}?authkey=${encodeURIComponent(
        authkey
      )}&searchdate=${searchdate}&data=AP01`;

      const response = await fetch(url);
      if (!response.ok) continue;

      const json = await response.json();
      if (!Array.isArray(json) || json.length === 0) continue;

      const parsed = {};
      json.forEach((item) => {
        if (String(item.result) !== "1") return;

        const rawCode = (item.cur_unit || "").trim();
        const codeMatch = rawCode.match(/([A-Z]{3})/);
        if (!codeMatch) return;
        const code = codeMatch[1];

        const isPer100 = rawCode.includes("(100)");
        const basicRate = parseFloat(
          String(item.deal_bas_r || "").replace(/,/g, "")
        );
        if (Number.isNaN(basicRate)) return;

        parsed[code] = isPer100 ? basicRate / 100 : basicRate;
      });

      if (Object.keys(parsed).length > 0) {
        rates = parsed;
        usedDate = searchdate;
      }
    }

    if (!rates) {
      throw new Error("최근 7일 이내 환율 데이터를 찾지 못했습니다.");
    }

    res.setHeader("Cache-Control", "s-maxage=240, stale-while-revalidate=60");
    res.status(200).json({
      source: "koreaexim",
      baseDate: usedDate,
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
