import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

async function startServer() {
  console.log(`Server starting in ${process.env.NODE_ENV || 'development'} mode...`);
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // Request logging and identification
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    res.setHeader('X-Server-Type', 'Express-Custom-Server');
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      env: process.env.NODE_ENV,
      time: new Date().toISOString(),
      port: PORT
    });
  });

  // API Routes
  app.get("/api/sync", (req, res) => {
    res.json({ message: "後端伺服器連線正常，請使用 POST 方法進行同步數據。" });
  });

  app.post("/api/sync", async (req, res) => {
    try {
      const { tickers, now } = req.body;
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

      if (!apiKey) {
        return res.status(401).json({ error: "伺服器端找不到 API 金鑰。請在設定中配置 GEMINI_API_KEY。" });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `現在時間是台北時間 ${now}。請直接造訪 https://tw.stock.yahoo.com/ 搜尋並提供以下台股代號的「最新即時」市場數據：${tickers}。
需包含：現價(price)、本益比(pe)、股價淨值比(pb)、52週最低價(low52)、52週最高價(high52)、市值(marketCap，單位為億台幣)。
請確保數據與 Yahoo 股市網頁上顯示的即時成交資訊一致。
請嚴格以 JSON 陣列格式回傳，每個物件包含 ticker, price, pe, pb, low52, high52, marketCap 欄位。`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                ticker: { type: Type.STRING },
                price: { type: Type.NUMBER },
                pe: { type: Type.NUMBER },
                pb: { type: Type.NUMBER },
                low52: { type: Type.NUMBER },
                high52: { type: Type.NUMBER },
                marketCap: { type: Type.NUMBER },
              },
              required: ["ticker", "price", "pe", "pb", "low52", "high52", "marketCap"]
            }
          }
        },
      });

      const fetchedText = response.text || "[]";
      console.log("Fetched AI Text:", fetchedText);
      
      try {
        const parsedData = JSON.parse(fetchedText);
        res.json(parsedData);
      } catch (parseError) {
        console.error("JSON Parse Error:", parseError, "Raw Text:", fetchedText);
        res.status(500).json({ error: "AI 回傳數據格式錯誤", raw: fetchedText });
      }
    } catch (error: any) {
      console.error("Server Sync Error:", error);
      res.status(500).json({ error: error.message || "同步失敗" });
    }
  });

  app.post("/api/analyze", async (req, res) => {
    try {
      const { stock } = req.body;
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

      if (!apiKey) {
        return res.status(401).json({ error: "伺服器端找不到 API 金鑰。" });
      }

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `你是一位專業的台股分析師。請針對以下股票進行即時風險分析：
股票名稱：${stock.name} (${stock.ticker})
目前股價：${stock.price}
本益比 (PE)：${stock.pe}
股價淨值比 (PB)：${stock.pb}
市值：${stock.marketCap || '未知'} 億
52週最低價：${stock.low52}
52週最高價：${stock.high52}

請提供以下三個面向的簡短分析（每項約 100 字）：
1. 估值風險 (Valuation Risk)：從 PE/PB 與市值規模角度分析目前是否過貴。
2. 位階風險 (Price Position Risk)：從 52 週高低點分析目前股價所處位置。
3. 綜合建議 (AI Recommendation)：給予投資者的核心建議。

請以專業且易懂的繁體中文回傳，並使用清晰的分段。`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      res.json({ text: response.text || "無法產生分析報告。" });
    } catch (error: any) {
      console.error("Server Analyze Error:", error);
      res.status(500).json({ error: error.message || "分析失敗" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
