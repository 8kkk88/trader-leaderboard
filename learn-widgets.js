import {escapeHtml as e,safeUrl,external,calculateSpot,gradeQuiz} from './learn-render.js?v=2';
const resource = (title,description,url) => `<a class="learn-resource" href="${e(safeUrl(url))}"${external(url)}><strong>${e(title)} <span aria-hidden="true">↗</span></strong><span>${e(description)}</span><small>${e(new URL(url).hostname)}</small></a>`;
export function renderWidget(kind,data) {
  if (kind === 'exchanges') return `<div class="learn-resources">${[['Binance','幣安官方網站','https://www.binance.com/'],['OKX','OKX 官方網站','https://www.okx.com/'],['Bybit','Bybit 官方網站','https://www.bybit.com/'],['Gate','Gate 官方網站','https://www.gate.com/']].map(args=>resource(...args)).join('')}</div><p class="learn-small">入口依原課程收錄，不是平台排名。使用前請自行確認所在地資格、完整費用與提領規則。</p>`;
  if (kind === 'onchain') return `<div class="learn-resources">${resource('DeBot','鏈上資訊與交易工具；先確認支援網路、權限及費用。','https://debot.ai/')}${resource('幣安錢包','閱讀官方產品介紹與備份方式。','https://web3.binance.com/')}</div>`;
  if (kind === 'binancewallet') return `<div class="learn-resources">${resource('幣安錢包','官方產品入口','https://web3.binance.com/')}${resource('備份與恢復','先了解各備份方式的恢復條件。','https://www.binance.com/en/support/faq/detail/53521dedad474c908ec3761a935cb8d6')}</div>`;
  if (kind === 'quiz') return `<form class="learn-widget" data-widget="quiz"><p class="learn-widget-intro">先選答案，再看解說。答錯也沒關係，旁邊有回到課程的入口。</p>${data.quiz.map((q,i)=>`<fieldset><legend><span>${String(i+1).padStart(2,'0')}</span> ${e(q.question)}</legend>${q.options.map((option,j)=>`<label class="learn-choice"><input type="radio" name="quiz-${i}" value="${j}" required><span>${e(option)}</span></label>`).join('')}<div class="learn-answer" data-answer="${i}" hidden></div></fieldset>`).join('')}<div class="learn-widget-actions"><button class="button primary" type="submit">查看答案與解說</button><button class="button" type="reset">重新作答</button></div><p class="learn-widget-status" role="status" aria-live="polite"></p></form>`;
  if (kind === 'calculator') return `<form class="learn-widget" data-widget="calculator" novalidate><p class="learn-widget-intro">只做現貨假設試算，所有金額請使用同一報價單位。費用合計包含買賣與其他成本；本工具不含槓桿、利息或稅務。</p><div class="learn-calc-fields">${[['buy','買入單價','例如 100'],['sell','賣出單價','例如 120'],['amount','買入金額（未含費用）','例如 1,000'],['fees','費用合計','可輸入 0']].map(([key,label,placeholder])=>`<label for="calc-${key}">${label}<input id="calc-${key}" name="${key}" type="text" inputmode="decimal" placeholder="${placeholder}" required autocomplete="off" aria-describedby="calc-status"></label>`).join('')}</div><div class="learn-widget-actions"><button class="button primary" type="submit">計算盈虧</button><button class="button" type="reset">清空</button></div><p class="learn-widget-status" id="calc-status" role="status" aria-live="polite"></p><div class="learn-calc-result" hidden></div><details class="learn-formula"><summary>計算方式</summary><p>數量＝買入金額 ÷ 買入單價<br>估算淨損益＝數量 × 賣出單價 − 買入金額 − 費用合計<br>損益率＝估算淨損益 ÷ 買入金額 × 100%</p><p>假設全數按輸入價格成交；實際成交、滑價與費用可能不同。結果經四捨五入，極小數值可能顯示為零。</p></details></form>`;
  if (kind === 'checklist') return `<form class="learn-widget" data-widget="checklist"><p class="learn-widget-intro">紙上演練用清單。逐項確認，不需要在這裡輸入地址或連接錢包。</p>${data.checklist.map(line=>`<label class="learn-choice"><input type="checkbox"><span>${e(line)}</span></label>`).join('')}<p class="learn-widget-status" role="status" aria-live="polite">已核對 0 / ${data.checklist.length} 項</p><button class="button" type="reset">重設清單</button></form>`;
  return '';
}
export function mountWidgets(root,data) {
  const quiz=root.querySelector('[data-widget="quiz"]');
  if (quiz) {
    const clear = () => {quiz.querySelectorAll('[data-answer]').forEach(n=>{n.hidden=true;n.textContent='';});quiz.querySelector('[role="status"]').textContent='';};
    quiz.addEventListener('reset',clear);
    quiz.addEventListener('change',clear);
    quiz.addEventListener('submit',event=>{
      event.preventDefault();const answers=data.quiz.map((_,i)=>{const value=new FormData(quiz).get(`quiz-${i}`);return value===null?null:Number(value);});
      const result=gradeQuiz(data.quiz,answers);
      if (result.some(r=>!r.answered)) {quiz.querySelector('[role="status"]').textContent='請先完成每一道題目。';return;}
      data.quiz.forEach((q,i)=>{const box=quiz.querySelector(`[data-answer="${i}"]`);box.hidden=false;box.innerHTML=`<strong>${result[i].correct?'答對了':'再想一下'} · ${e(q.options[q.answer])}</strong><p>${e(q.explanation)}</p><a href="#lesson/${e(q.lesson)}">回課程複習 →</a>`;});
      quiz.querySelector('[role="status"]').textContent=`答對 ${result.filter(r=>r.correct).length} / ${result.length} 題。每一題下方都有解說，可回頭複習。`;
    });
  }
  const calc=root.querySelector('[data-widget="calculator"]');
  if (calc) {
    const result=calc.querySelector('.learn-calc-result'),status=calc.querySelector('[role="status"]');
    const clear=()=>{result.hidden=true;result.textContent='';status.textContent='';};
    calc.addEventListener('input',clear);calc.addEventListener('reset',clear);
    calc.addEventListener('submit',event=>{
      event.preventDefault();clear();
      try {
        const v=calculateSpot(Object.fromEntries(new FormData(calc))),num=n=>n.toLocaleString('zh-TW',{maximumFractionDigits:4});
        result.hidden=false;result.innerHTML=`<span>估算淨損益</span><strong>${v.net>0?'+':''}${e(num(v.net))}</strong><span>損益率 ${e(num(v.percent))}%</span><dl><div><dt>取得數量</dt><dd>${e(num(v.quantity))}</dd></div><div><dt>賣出總額（未扣費）</dt><dd>${e(num(v.proceeds))}</dd></div></dl>`;
        status.textContent=`試算完成：估算淨損益 ${num(v.net)}，損益率 ${num(v.percent)}%。`;
      } catch(error) {status.textContent=error.message;}
    });
  }
  const checklist=root.querySelector('[data-widget="checklist"]');
  if (checklist) {
    const update=count=>{checklist.querySelector('[role="status"]').textContent=`已核對 ${count} / ${data.checklist.length} 項${count===data.checklist.length?'。正式操作前，仍需再次確認錢包或平台的最終確認頁。':''}`;};
    checklist.addEventListener('change',()=>update(checklist.querySelectorAll(':checked').length));checklist.addEventListener('reset',()=>update(0));
  }
  const search=root.querySelector('#glossary-search');
  if (search) {
    const rows=[...root.querySelectorAll('.learn-article-section tbody tr')];
    search.addEventListener('input',()=>{const query=search.value.trim().toLocaleLowerCase();let count=0;rows.forEach(row=>{row.hidden=!row.textContent.toLocaleLowerCase().includes(query);if (!row.hidden) count++;});root.querySelector('#glossary-status').textContent=`找到 ${count} 個詞條${count?'':'，試試其他關鍵字。'}`;});
  }
}
