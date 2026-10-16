export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeUrl(url) {
  if (typeof url !== 'string' || /[\s\\]/.test(url)) return '#catalog';
  if (/^https:\/\//.test(url)) {
    try {const parsed = new URL(url);return parsed.hostname && !parsed.username && !parsed.password ? url : '#catalog';} catch {return '#catalog';}
  }
  if (/^#(?:catalog|lesson\/[a-z][a-z0-9-]+(?:\?(?:path=[a-z-]+(?:&section=\d+)?|section=\d+))?)$/.test(url)) return url;
  try {return /^\.\/[a-z0-9][a-z0-9._/?=#&%-]*$/i.test(url) && !decodeURIComponent(url.slice(2)).split(/[?#]/)[0].split('/').includes('..') ? url : '#catalog';} catch {return '#catalog';}
}
export const external = url => safeUrl(url).startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : '';
const tags = new Set(['p','strong','b','br','h3','blockquote','ul','ol','li','thead','tbody','tr','th','td','a','div','span']);
const roles = new Set(['tool-grid','tool-card','tool-head','domain','table-wrap']);
export function renderBlocks(nodes, widget = () => '') {
  return (nodes || []).map(node => {
    if (typeof node === 'string') return escapeHtml(node);
    if (!node || typeof node !== 'object') return '';
    if (node.widget) return widget(node.widget);
    const body = renderBlocks(node.children,widget);
    if (node.tag === 'table') return `<div class="learn-table-scroll" role="region" aria-label="對照表，可左右捲動" tabindex="0"><table>${body}</table></div>`;
    if (!tags.has(node.tag)) return '';
    if (node.tag === 'br') return '<br>';
    const attrs = node.tag === 'a' ? ` href="${escapeHtml(safeUrl(node.href))}"${external(node.href)}` : node.tag === 'th' ? ' scope="col"' : '';
    const role = roles.has(node.role) ? ` class="learn-rich-${node.role}"` : '';
    return `<${node.tag}${attrs}${role}>${body}</${node.tag}>`;
  }).join('');
}
export function calculateSpot({buy,sell,amount,fees}) {
  const parse = value => {
    const s = String(value ?? '').trim();
    return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s) ? Number(s.replaceAll(',','')) : NaN;
  };
  const b=parse(buy),s=parse(sell),a=parse(amount),f=parse(fees);
  if (![b,s,a,f].every(Number.isFinite) || b<=0 || a<=0 || s<0 || f<0) throw new Error('買入價格與金額須大於零；賣出價格與費用可為零。請使用有效數字。');
  const quantity=a/b,proceeds=quantity*s,net=proceeds-a-f,percent=net/a*100;
  if (![quantity,proceeds,net,percent].every(Number.isFinite) || [a,f,proceeds,Math.abs(net)].some(n=>n>Number.MAX_SAFE_INTEGER)) throw new Error('數值超出本工具可可靠計算的範圍，請縮小輸入。');
  return {quantity,proceeds,net,percent};
}
export function gradeQuiz(questions,answers) {
  return questions.map((q,i)=>({answered:Number.isInteger(answers[i]) && answers[i]>=0 && answers[i]<q.options.length,correct:answers[i]===q.answer}));
}
