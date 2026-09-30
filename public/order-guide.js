function openOrderGuide(){const m=document.getElementById('orderGuideModal');if(!m)return;m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.classList.add('guide-open');}
function closeOrderGuide(){const m=document.getElementById('orderGuideModal');if(!m)return;m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.classList.remove('guide-open');}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeOrderGuide();});
document.addEventListener('click',e=>{const m=document.getElementById('orderGuideModal');if(m&&e.target===m)closeOrderGuide();});
