/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Settings, TrendingDown, AlertCircle, CheckCircle2, BarChart3, Search, Info, ArrowUpRight, RefreshCw, Clock, Loader2, ShieldAlert, X, Zap, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

// 初始台股數據 (作為備援)
const INITIAL_STOCKS: Stock[] = [
  { ticker: '2330.TW', name: '台積電', price: 780, pe: 20.5, pb: 5.2, low52: 520, high52: 820, marketCap: 200000 },
  { ticker: '2317.TW', name: '鴻海', price: 145, pe: 13.2, pb: 1.4, low52: 98, high52: 150, marketCap: 20000 },
  { ticker: '2454.TW', name: '聯發科', price: 1100, pe: 16.8, pb: 3.5, low52: 650, high52: 1200, marketCap: 17000 },
  { ticker: '2881.TW', name: '富邦金', price: 70, pe: 10.5, pb: 1.1, low52: 58, high52: 72, marketCap: 9000 },
  { ticker: '2308.TW', name: '台達電', price: 320, pe: 22.1, pb: 4.1, low52: 270, high52: 380, marketCap: 5000 },
  { ticker: '2002.TW', name: '中鋼', price: 24, pe: 35.0, pb: 1.05, low52: 23, high52: 31, marketCap: 3800 },
  { ticker: '2891.TW', name: '中信金', price: 31, pe: 11.2, pb: 1.2, low52: 25, high52: 32, marketCap: 6000 },
  { ticker: '1101.TW', name: '台泥', price: 32, pe: 18.5, pb: 0.9, low52: 31, high52: 40, marketCap: 2300 },
  { ticker: '2382.TW', name: '廣達', price: 280, pe: 24.5, pb: 3.8, low52: 105, high52: 299, marketCap: 10000 },
  { ticker: '3231.TW', name: '緯創', price: 115, pe: 19.2, pb: 2.1, low52: 45, high52: 161, marketCap: 3300 },
];

interface Stock {
  ticker: string;
  name: string;
  price: number;
  pe: number;
  pb: number;
  low52: number;
  high52: number;
  marketCap?: number; // 新增市值 (億)
}

export default function App() {
  const [stocks, setStocks] = useState<Stock[]>(INITIAL_STOCKS);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  
  // 新增股票功能
  const addStock = () => {
    if (!newTicker.trim()) return;
    const ticker = newTicker.trim().toUpperCase();
    if (stocks.some(s => s.ticker === ticker)) {
      setSyncError("該股票已在清單中。");
      return;
    }
    
    // 初始化一個空數據的股票，等待同步
    const newStock: Stock = {
      ticker,
      name: ticker.split('.')[0], // 暫時用代號當名稱
      price: 0,
      pe: 0,
      pb: 0,
      low52: 0,
      high52: 0
    };
    
    setStocks(prev => [...prev, newStock]);
    setNewTicker('');
    // 自動觸發一次同步
    setTimeout(() => syncMarketData(), 500);
  };

  // 移除股票功能
  const removeStock = (ticker: string) => {
    setStocks(prev => prev.filter(s => s.ticker !== ticker));
  };
  
  // 風險分析狀態
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
  const [riskAnalysis, setRiskAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 自訂篩選條件狀態
  const [maxPE, setMaxPE] = useState(15);
  const [maxPB, setMaxPB] = useState(1.5);
  const [lowBaseMargin, setLowBaseMargin] = useState(15);
  const [searchTerm, setSearchTerm] = useState('');
  const [newTicker, setNewTicker] = useState('');

  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  // 檢查伺服器連線
  useEffect(() => {
    const checkServer = async () => {
      try {
        const res = await fetch('/stock-api/health');
        if (res.ok) {
          setServerStatus('online');
        } else {
          setServerStatus('offline');
        }
      } catch (e) {
        setServerStatus('offline');
      }
    };
    checkServer();
  }, []);

  // AI 同步功能：呼叫後端 API 抓取即時數據
  const syncMarketData = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    setSyncError(null);
    
    try {
      const tickers = stocks.map(s => s.ticker).join(', ');
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
      
      const response = await fetch('/stock-api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers, now })
      });

      const contentType = response.headers.get("content-type");
      const serverType = response.headers.get("X-Server-Type");
      
      if (!response.ok) {
        let errorMessage = "同步失敗";
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } else {
          const text = await response.text();
          errorMessage = `伺服器錯誤 (${response.status}): ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`;
        }
        
        if (!serverType) {
          errorMessage += " (警告: 請求未到達後端伺服器，可能被靜態託管攔截)";
        }
        throw new Error(errorMessage);
      }

      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("伺服器回傳了非 JSON 格式的數據。");
      }

      const fetchedData = await response.json();
      
      if (Array.isArray(fetchedData) && fetchedData.length > 0) {
        setStocks(prev => prev.map(stock => {
          const newData = fetchedData.find((d: any) => d.ticker === stock.ticker);
          return newData ? { ...stock, ...newData } : stock;
        }));
        setLastUpdated(new Date().toLocaleString('zh-TW', { 
          year: 'numeric', 
          month: 'numeric', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false
        }));
      } else {
        throw new Error("伺服器回傳數據格式不正確或為空。");
      }
    } catch (error: any) {
      console.error("Market sync failed:", error);
      setSyncError(error.message || "同步失敗，請檢查伺服器狀態。");
    } finally {
      setIsSyncing(false);
    }
  };

  // AI 風險分析功能：呼叫後端 API
  const analyzeStockRisk = async (stock: Stock) => {
    setSelectedStock(stock);
    setIsAnalyzing(true);
    setRiskAnalysis(null);

    try {
      const response = await fetch('/stock-api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock })
      });

      const contentType = response.headers.get("content-type");
      const serverType = response.headers.get("X-Server-Type");

      if (!response.ok) {
        let errorMessage = "分析失敗";
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } else {
          const text = await response.text();
          errorMessage = `伺服器錯誤 (${response.status}): ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`;
        }

        if (!serverType) {
          errorMessage += " (警告: 請求未到達後端伺服器)";
        }
        throw new Error(errorMessage);
      }

      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("伺服器回傳了非 JSON 格式的數據。");
      }

      const data = await response.json();
      setRiskAnalysis(data.text || "無法產生分析報告。");
    } catch (error: any) {
      console.error("Risk analysis failed:", error);
      setRiskAnalysis(error.message || "分析過程中發生錯誤，請稍後再試。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 即時計算與過濾股票清單
  const processedStocks = useMemo(() => {
    return stocks.map(stock => {
      const lowBaseThreshold = stock.low52 * (1 + lowBaseMargin / 100);
      const isLowBase = stock.price <= lowBaseThreshold;
      const isValueStock = stock.pe <= maxPE && stock.pb <= maxPB;
      const hasRisk = stock.pe > maxPE || stock.pb > maxPB;

      return {
        ...stock,
        isLowBase,
        isValueStock,
        hasRisk
      };
    }).filter(stock => 
      stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
      stock.name.includes(searchTerm)
    );
  }, [stocks, maxPE, maxPB, lowBaseMargin, searchTerm]);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 md:p-8 font-sans text-slate-800 selection:bg-blue-100">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row items-start md:items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-slate-200/60 gap-4"
        >
          <div className="flex items-center space-x-4">
            <div className="p-3.5 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-200">
              <BarChart3 size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">台股自動化選股系統</h1>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm font-medium text-slate-500">即時監控市場價值點</p>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${
                    serverStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 
                    serverStatus === 'offline' ? 'bg-rose-500' : 'bg-amber-500'
                  }`} />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {serverStatus === 'online' ? 'Server Online' : 
                     serverStatus === 'offline' ? 'Server Offline' : 'Checking...'}
                  </span>
                </div>
                {lastUpdated && (
                  <span className="flex items-center gap-1 text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                    <Clock size={10} /> 最後更新: {lastUpdated}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {syncError && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold border border-red-100"
              >
                <AlertCircle size={14} />
                {syncError}
              </motion.div>
            )}
            <button 
              onClick={syncMarketData}
              disabled={isSyncing}
              className={`flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all w-full sm:w-auto ${
                isSyncing 
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                : 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95'
              }`}
            >
              {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              {isSyncing ? '同步中...' : '同步市場數據'}
            </button>
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="搜尋代號或名稱..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input 
                type="text" 
                placeholder="新增代號 (如 2330.TW)" 
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addStock()}
                className="flex-1 sm:w-48 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-bold"
              />
              <button 
                onClick={addStock}
                className="p-3 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all active:scale-95"
              >
                <Zap size={18} />
              </button>
            </div>
          </div>
        </motion.header>

        {/* 價值與風險分佈矩陣 (P/E vs P/B) */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/60"
        >
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                <LayoutGrid size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">價值與風險分佈矩陣</h2>
                <p className="text-xs font-medium text-slate-500">視覺化 P/E 與 P/B 的相對位置</p>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
              <div className="flex items-center gap-1.5 text-emerald-600">
                <div className="w-2 h-2 rounded-full bg-emerald-500" /> 價值區 (低 PE/PB)
              </div>
              <div className="flex items-center gap-1.5 text-red-600">
                <div className="w-2 h-2 rounded-full bg-red-500" /> 風險區 (高 PE/PB)
              </div>
            </div>
          </div>

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis 
                  type="number" 
                  dataKey="pe" 
                  name="P/E" 
                  domain={[0, 'auto']}
                  label={{ value: '本益比 (P/E)', position: 'bottom', offset: 0, fontSize: 12, fontWeight: 600, fill: '#64748b' }}
                  stroke="#94a3b8"
                  fontSize={11}
                  tick={{ fill: '#64748b' }}
                />
                <YAxis 
                  type="number" 
                  dataKey="pb" 
                  name="P/B" 
                  domain={[0, 'auto']}
                  label={{ value: '股價淨值比 (P/B)', angle: -90, position: 'left', offset: 0, fontSize: 12, fontWeight: 600, fill: '#64748b' }}
                  stroke="#94a3b8"
                  fontSize={11}
                  tick={{ fill: '#64748b' }}
                />
                <ZAxis 
                  type="number" 
                  dataKey="marketCap" 
                  range={[100, 4000]} 
                  name="市值" 
                  unit="億" 
                />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-200 min-w-[180px]">
                          <div className="font-black text-slate-900 mb-2 flex items-center justify-between border-b border-slate-50 pb-2">
                            <span>{data.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">{data.ticker}</span>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-400">本益比 (P/E)</span>
                              <span className={data.pe > maxPE ? 'text-red-500' : 'text-blue-600'}>{data.pe}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-400">淨值比 (P/B)</span>
                              <span className={data.pb > maxPB ? 'text-red-500' : 'text-blue-600'}>{data.pb}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-400">市值規模</span>
                              <span className="text-slate-700">{data.marketCap?.toLocaleString()} 億</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-400">目前股價</span>
                              <span className="text-slate-900">${data.price}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                {/* 策略基準線 */}
                <ReferenceLine x={maxPE} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: 'PE 門檻', position: 'top', fill: '#3b82f6', fontSize: 10, fontWeight: 700 }} />
                <ReferenceLine y={maxPB} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: 'PB 門檻', position: 'right', fill: '#3b82f6', fontSize: 10, fontWeight: 700 }} />
                
                <Scatter name="Stocks" data={stocks}>
                  {stocks.map((entry, index) => {
                    const isValue = entry.pe <= maxPE && entry.pb <= maxPB;
                    const isRisk = entry.pe > maxPE || entry.pb > maxPB;
                    let color = "#94a3b8"; // Default
                    if (isValue) color = "#10b981"; // Emerald
                    else if (isRisk) color = "#ef4444"; // Red
                    
                    return <Cell key={`cell-${index}`} fill={color} stroke={color} strokeWidth={1} fillOpacity={0.5} />;
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左側：控制面板 */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-3 space-y-6"
          >
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200/60">
              <div className="flex items-center space-x-2 mb-8">
                <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                  <Settings size={18} />
                </div>
                <h2 className="text-lg font-bold text-slate-900">篩選策略設定</h2>
              </div>
              
              <div className="space-y-8">
                {/* P/E 控制 */}
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <label className="text-sm font-bold text-slate-700">本益比 (P/E) 上限</label>
                    <span className="text-lg font-black text-blue-600 tabular-nums">{maxPE}</span>
                  </div>
                  <input 
                    type="range" min="5" max="40" step="1" 
                    value={maxPE} onChange={(e) => setMaxPE(Number(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                    <Info size={12} />
                    <span>超過此數值將標示為高估風險</span>
                  </div>
                </div>

                {/* P/B 控制 */}
                <div className="space-y-3">
                  <div className="flex justify-between items-end">
                    <label className="text-sm font-bold text-slate-700">股價淨值比 (P/B)</label>
                    <span className="text-lg font-black text-blue-600 tabular-nums">{maxPB}</span>
                  </div>
                  <input 
                    type="range" min="0.5" max="5" step="0.1" 
                    value={maxPB} onChange={(e) => setMaxPB(Number(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* 低基期控制 */}
                <div className="space-y-3 pt-6 border-t border-slate-100">
                  <div className="flex justify-between items-end">
                    <label className="text-sm font-bold text-slate-700">低基期定義 (距離低點)</label>
                    <span className="text-lg font-black text-emerald-600 tabular-nums">+{lowBaseMargin}%</span>
                  </div>
                  <input 
                    type="range" min="5" max="50" step="1" 
                    value={lowBaseMargin} onChange={(e) => setLowBaseMargin(Number(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                  <p className="text-[11px] font-medium text-slate-400 leading-relaxed">
                    股價距離 52 週最低點不超過 {lowBaseMargin}% 即判定為低基期。
                  </p>
                </div>
              </div>
            </div>

            {/* 策略統計 */}
            <div className="bg-slate-900 p-6 rounded-3xl shadow-xl shadow-slate-200 text-white overflow-hidden relative">
              <div className="absolute -right-4 -top-4 opacity-10 rotate-12">
                <BarChart3 size={120} />
              </div>
              <h3 className="text-sm font-bold text-slate-400 mb-6 flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                目前監控池統計
              </h3>
              <div className="grid grid-cols-1 gap-4 relative z-10">
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">符合低基期</span>
                    <TrendingDown size={14} className="text-emerald-400" />
                  </div>
                  <div className="text-3xl font-black text-emerald-400 mt-1">
                    {processedStocks.filter(s => s.isLowBase).length}
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">價值投資達標</span>
                    <CheckCircle2 size={14} className="text-blue-400" />
                  </div>
                  <div className="text-3xl font-black text-blue-400 mt-1">
                    {processedStocks.filter(s => s.isValueStock).length}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* 右側：股票清單與結果 */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-9 bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-8 py-5 font-bold text-xs uppercase tracking-wider text-slate-500">股票名稱 / 代號</th>
                    <th className="px-6 py-5 font-bold text-xs uppercase tracking-wider text-slate-500">目前股價</th>
                    <th className="px-6 py-5 font-bold text-xs uppercase tracking-wider text-slate-500">P/E</th>
                    <th className="px-6 py-5 font-bold text-xs uppercase tracking-wider text-slate-500">P/B</th>
                    <th className="px-6 py-5 font-bold text-xs uppercase tracking-wider text-slate-500">價格位階 (52週)</th>
                    <th className="px-6 py-5 font-bold text-xs uppercase tracking-wider text-slate-500">AI 判定</th>
                    <th className="px-8 py-5 font-bold text-xs uppercase tracking-wider text-slate-500 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <AnimatePresence mode="popLayout">
                    {processedStocks.length > 0 ? (
                      processedStocks.map((stock) => (
                        <motion.tr 
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          key={stock.ticker} 
                          className="group hover:bg-blue-50/30 transition-colors"
                        >
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                {stock.name[0]}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                  {stock.name}
                                  <ArrowUpRight size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="text-xs font-mono font-medium text-slate-400">{stock.ticker}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="text-sm font-bold text-slate-900 tabular-nums">
                              ${stock.price.toLocaleString()}
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`text-sm font-bold tabular-nums ${stock.pe > maxPE ? 'text-red-500' : 'text-blue-600'}`}>
                              {stock.pe}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <span className={`text-sm font-bold tabular-nums ${stock.pb > maxPB ? 'text-red-500' : 'text-blue-600'}`}>
                              {stock.pb}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="w-32 space-y-1.5">
                              <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                                <span>{stock.low52}</span>
                                <span>{stock.high52}</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative border border-slate-200/30">
                                {stock.high52 > stock.low52 && (
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ 
                                      width: `${Math.min(100, Math.max(0, ((stock.price - stock.low52) / (stock.high52 - stock.low52)) * 100))}%` 
                                    }}
                                    className={`h-full rounded-full ${stock.isLowBase ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]'}`}
                                  />
                                )}
                              </div>
                              <div className="text-[10px] font-bold text-slate-500 text-center tabular-nums">
                                目前: ${stock.price}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex flex-col gap-1.5">
                              {stock.isLowBase && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/50">
                                  <TrendingDown size={12} /> 低基期
                                </span>
                              )}
                              {stock.isValueStock && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 ring-1 ring-blue-200/50">
                                  <CheckCircle2 size={12} /> 價值浮現
                                </span>
                              )}
                              {!stock.isLowBase && !stock.isValueStock && stock.hasRisk && (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700 ring-1 ring-red-200/50">
                                  <AlertCircle size={12} /> 估值偏高
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => analyzeStockRisk(stock)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all active:scale-95"
                                title="風險分析"
                              >
                                <ShieldAlert size={14} />
                                <span className="hidden sm:inline">風險分析</span>
                              </button>
                              <button 
                                onClick={() => removeStock(stock.ticker)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                                title="移除追蹤"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))
                    ) : (
                      <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <td colSpan={6} className="px-8 py-24 text-center">
                          <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="p-4 bg-slate-50 rounded-full text-slate-300">
                              <Search size={40} />
                            </div>
                            <p className="text-slate-400 font-medium">找不到符合條件的股票，請調整篩選策略</p>
                          </div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </motion.div>

        </div>
      </div>

      {/* 風險分析 Modal */}
      <AnimatePresence>
        {selectedStock && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStock(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl overflow-hidden border border-slate-200"
            >
              {/* Modal Header */}
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-slate-900 rounded-2xl text-white">
                    <ShieldAlert size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900">{selectedStock.name} 風險評估報告</h2>
                    <p className="text-xs font-mono font-bold text-slate-400 mt-0.5">{selectedStock.ticker}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedStock(null)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {isAnalyzing ? (
                  <div className="py-20 flex flex-col items-center justify-center space-y-4">
                    <div className="relative">
                      <Loader2 size={48} className="text-blue-600 animate-spin" />
                      <Zap size={20} className="text-blue-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                    </div>
                    <div className="text-center">
                      <p className="text-slate-900 font-bold">AI 分析師正在研閱市場數據...</p>
                      <p className="text-slate-400 text-xs mt-1">這可能需要幾秒鐘的時間</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* 數據摘要 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: '目前股價', value: `$${selectedStock.price}` },
                        { label: '本益比', value: selectedStock.pe },
                        { label: '淨值比', value: selectedStock.pb },
                        { label: '52週低點', value: `$${selectedStock.low52}` },
                      ].map((item, i) => (
                        <div key={i} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</div>
                          <div className="text-lg font-black text-slate-900 mt-1">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* 分析文本 */}
                    <div className="prose prose-slate max-w-none">
                      <div className="whitespace-pre-wrap text-slate-600 leading-relaxed font-medium text-sm md:text-base">
                        {riskAnalysis}
                      </div>
                    </div>

                    {/* 免責聲明 */}
                    <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                      <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-800 font-medium leading-normal">
                        本報告由 AI 自動產生，僅供參考，不構成任何投資建議。投資人應獨立判斷並自負投資風險。
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setSelectedStock(null)}
                  className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition-all active:scale-95"
                >
                  關閉報告
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
