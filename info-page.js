window.ResearchShell.mount({active:null});
document.querySelector('.skip')?.addEventListener('click',event => {
  event.preventDefault();
  const main=document.getElementById('main-content');
  main.tabIndex=-1;main.focus();main.scrollIntoView({block:'start'});
});
