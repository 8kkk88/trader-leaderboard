// Shared by classic scripts and modules. Presentation only; never rounds stored data.
(() => {
  const cents = new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const small = new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:6});
  const format = (value,{signed=false}={}) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const magnitude = Math.abs(value);
    const sign = value < 0 ? '−' : signed && value > 0 ? '+' : '';
    if (magnitude > 0 && magnitude < 0.000001) return sign+'<$0.000001';
    return sign+'$'+(magnitude > 0 && magnitude < 0.01 ? small : cents).format(magnitude);
  };
  globalThis.ResearchMoney = Object.freeze({format});
})();
