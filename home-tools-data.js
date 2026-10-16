export function calculateRealized(values) {
  const fields = [['buy','買入單價',false],['sell','賣出單價',true],['quantity','成交數量',false],['fees','費用合計',true]];
  const parsed = {};
  for (const [key,label,zero] of fields) {
    const raw = String(values[key] ?? '').trim() || (key === 'fees' ? '0' : '');
    const valid = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw);
    const value = Number(raw.replaceAll(',',''));
    if (!valid || !Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER || (zero ? value < 0 : value <= 0)) {
      const error = new Error(`${label}請填${zero ? '零或正數' : '大於零的數字'}，並使用一般小數格式。`);
      error.field = key;throw error;
    }
    parsed[key] = value;
  }
  const cost = parsed.buy * parsed.quantity, proceeds = parsed.sell * parsed.quantity;
  const net = proceeds - cost - parsed.fees;
  if (![cost,proceeds,net].every(n=>Number.isFinite(n) && Math.abs(n)<=Number.MAX_SAFE_INTEGER)) throw new Error('金額超出可可靠試算的範圍，請縮小輸入。');
  return {cost,proceeds,fees:parsed.fees,net:net===0?0:net};
}

export const glossary = [
  {term:'已實現損益',aliases:'已實現收益 realized PnL 落袋',meaning:'已賣出部位對應的損益。賣出收入扣掉該部位成本，才知道實際賺或賠；費用是否已扣，還要看來源口徑。'},
  {term:'未實現損益',aliases:'未實現收益 unrealized PnL 帳面 浮盈 浮虧',meaning:'還持有的部位，按當下估價計算的帳面損益。價格會變，尚未賣出就不代表已經落袋。'},
  {term:'總損益',aliases:'total PnL 總收益',meaning:'同一來源、同一統計期間的已實現與未實現損益合計。總損益漂亮，可能主要來自尚未賣出的帳面收益。'},
  {term:'快照',aliases:'snapshot 更新時間 資料時間',meaning:'把某個時間點取得的資料保留下來，方便之後比較。它是一張定格畫面，不是即時行情；請看來源時間。'},
  {term:'樣本',aliases:'sample 範圍 排名 榜單',meaning:'這一批實際取得、收錄來比較的錢包。樣本內排名不等於全鏈排名，未收錄的錢包也不代表表現不好。'}
];
export function matchingTerms(query) {
  const normalized = query.trim().toLocaleLowerCase();
  return glossary.filter(item=>`${item.term} ${item.aliases} ${item.meaning}`.toLocaleLowerCase().includes(normalized));
}
