(function bookApp() {
  "use strict";
  const DATA_BASE = "/";
  const HISTORY_KEY = "reading-prescription-history-v1";
  const $ = sel => document.querySelector(sel);
  const state = {catalog: [], external: [], themes: [], books: new Map(), records: [], current: null, coverCache: {}};
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("visible"), 2600);
  }
  function normalize(s) { return String(s || "").toLowerCase().replace(/[\s·.,!?~():/'"\-]/g, ""); }
  function oneLine(s) { return String(s || "").replace(/\s+/g," ").trim(); }
  function themeFor(text) {
    const t = normalize(text);
    const ranked = state.themes.map((theme, index) => {
      let score = 0;
      theme.keys.forEach(k => {
        const key = normalize(k);
        if (key && t.includes(key)) score += key.length >= 4 ? 3 : key.length >= 2 ? 2 : 1;
      });
      if (theme.id === "future" && /앞으로|미래|어떻게해야|모르겠|막막/.test(t)) score += 3;
      if (theme.id === "career" && /퇴사|이직|그만/.test(t)) score += 5;
      if (theme.id === "breakup" && /이별|헤어/.test(t)) score += 5;
      if (theme.id === "grief" && /사별|돌아가셨|떠나셨/.test(t)) score += 6;
      return {theme, score, index};
    }).sort((a,b) => b.score-a.score || a.index-b.index);
    return ranked[0]?.score ? ranked[0].theme : state.themes[0];
  }
  function getBook(id) { return state.books.get(String(id)); }
  function kyoboSearch(book) {
    return "https://search.kyobobook.co.kr/search?keyword=" +
      encodeURIComponent(book.title.split(/[:：]/)[0].trim() + " " + (book.author.includes("확인 필요") ? "" : book.author));
  }
  function createNode(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }
  async function getCover(book,img,container) {
    const key = normalize(book.title+" "+book.author);
    if (state.coverCache[key] === false) return;
    if (state.coverCache[key]) { img.src = state.coverCache[key]; return; }
    try {
      const title = book.title.split(/[:：]/)[0].replace(/(\s*vol\.\s*\d+|\s*개정판.*)$/i, "").trim();
      const url = "https://www.googleapis.com/books/v1/volumes?q=" + encodeURIComponent("intitle:"+title) + "&maxResults=6&printType=books";
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(),6000);
      let response;
      try { response = await fetch(url,{signal:controller.signal}); } finally {clearTimeout(timer);}
      if (!response.ok) throw Error("cover API");
      const json = await response.json();
      const expected = normalize(title).slice(0,6);
      const match = (json.items || []).map(x=>x.volumeInfo || {}).find(x=>normalize(x.title).includes(expected) && x.imageLinks?.thumbnail);
      const cover = match?.imageLinks?.thumbnail;
      if (!cover) {state.coverCache[key] = false;return;}
      state.coverCache[key] = cover.replace(/^http:/,"https:");
      if (img.isConnected) img.src = state.coverCache[key];
    } catch {state.coverCache[key] = false;}
  }
  function line(label,value) {
    const node = createNode("div","compact-field");
    node.append(createNode("strong",null,label),createNode("span",null,oneLine(value)));
    return node;
  }
  function copyText(part) {
    const book = getBook(part[0]);
    if (!book) return "";
    const source = typeof book.id === "number" ? "독서클럽 보유" : "외부 추천";
    return `${book.title} | ${book.author} (${source})\n추천 이유: ${part[1]}\n한 줄 처방: ${part[2]}\n복용법: ${part[3]}\n교보문고 검색: ${kyoboSearch(book)}`;
  }
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      toast("처방전을 복사했어요.");
    } catch {
      const el = createNode("textarea");
      el.value = value;
      document.body.append(el);
      el.select();
      const ok = document.execCommand("copy");
      el.remove();
      toast(ok ? "처방전을 복사했어요." : "복사할 수 없습니다.");
    }
  }
  function renderRecord(record, shouldScroll=true) {
    const theme = state.themes.find(x=>x.id === record.themeId) || state.themes[0];
    if (!theme) return;
    state.current = record;
    $("#match-description").textContent = `${theme.label}에 관한 마음을 중심으로 골랐습니다 · 3권 추천`;
    const grid = $("#prescription-grid");
    grid.replaceChildren();
    theme.recommend.slice(0,3).forEach((part,index)=>{
      const book=getBook(part[0]);
      if (!book) return;
      const card=createNode("article","book-card");
      const top=createNode("div","card-top");
      top.append(createNode("span","rank"+(index ? " alternative":""),index===0 ? "01 · 오늘의 책" : `0${index+1} · 대안 처방`),
        createNode("span","source-tag"+(typeof book.id === "string" ? " external":""),typeof book.id === "number" ? "클럽 보유 도서" : "외부 추천"));
      card.append(top);
      const cover=createNode("div","book-cover");
      const fallback=createNode("span","fallback-cover",book.title.split(/[:：]/)[0]);
      const img=document.createElement("img");
      img.alt=`${book.title} 표지`;
      img.loading="lazy";
      img.referrerPolicy="no-referrer";
      img.addEventListener("load",()=>{img.classList.add("ready");cover.classList.add("has-image");});
      img.addEventListener("error",()=>{img.classList.remove("ready");cover.classList.remove("has-image");});
      cover.append(fallback,img);
      card.append(cover);
      getCover(book,img,cover);
      card.append(createNode("h3","book-name",book.title.split(/[:：]/)[0]),createNode("p","book-author",book.author));
      const fields=createNode("div","compact-fields");
      fields.append(line("추천 이유",part[1]),line("한 줄 처방",part[2]),line("복용법",part[3]));
      card.append(fields);
      const actions=createNode("div","card-actions");
      const link=createNode("a",null,"교보문고 검색 ↗");
      link.href=kyoboSearch(book);
      link.rel="noopener noreferrer";
      link.target="_blank";
      const btn=createNode("button",null,"처방 복사 ⧉");
      btn.type="button";
      btn.addEventListener("click",()=>copy(copyText(part)));
      actions.append(link,btn);
      card.append(actions);
      grid.append(card);
    });
    $("#results").hidden=false;
    $("#copy-all").onclick=()=>copy("독서 처방전\n고민: "+record.concern+"\n\n"+theme.recommend.slice(0,3).map((r,i)=>`${i+1}. ${copyText(r)}`).join("\n\n"));
    if (shouldScroll) $("#results").scrollIntoView({behavior:"smooth",block:"start"});
  }
  function safeReadHistory(){
    try {
      const records=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
      return Array.isArray(records) ? records.slice(0,20).filter(x=>x && typeof x.concern==="string" && typeof x.themeId==="string") : [];
    } catch { return []; }
  }
  function saveHistory(){
    try {localStorage.setItem(HISTORY_KEY,JSON.stringify(state.records.slice(0,20)));}
    catch {toast("이 브라우저에서는 기록을 저장할 수 없습니다.");}
  }
  function renderHistory(){
    const section=$("#history-section"),list=$("#history-list");
    list.replaceChildren();
    section.hidden=!state.records.length;
    state.records.forEach((rec,index)=>{
      const item=createNode("li");
      const main=createNode("button","hist-main");
      const title=createNode("strong",null,rec.concern);
      const date=new Date(rec.created);
      const sub=createNode("span",null,`${Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR")} · ${state.themes.find(x=>x.id===rec.themeId)?.label || "독서 처방"}`);
      main.append(title,sub);
      main.onclick=()=>{$("#concern").value=rec.concern;$("#count").textContent=`${rec.concern.length} / 1200`;renderRecord(rec);};
      const del=createNode("button","hist-del","삭제");
      del.type="button";
      del.setAttribute("aria-label","처방 기록 삭제");
      del.onclick=()=>{state.records.splice(index,1);saveHistory();renderHistory();};
      item.append(main,del);
      list.append(item);
    });
  }
  function handleConcern(event){
    event.preventDefault();
    const concern=$("#concern").value.trim();
    if (concern.length<5){toast("고민을 조금 더 자세히 적어주세요.");return;}
    const theme=themeFor(concern);
    const record={id:Date.now(),concern,themeId:theme.id,created:new Date().toISOString()};
    state.records.unshift(record);
    state.records=state.records.slice(0,20);
    saveHistory();
    renderRecord(record);
    renderHistory();
  }
  async function init(){
    try {
      const [catalog,external,themes]=await Promise.all(["catalog.json","extended.json","themes.json"].map(file=>
        fetch(DATA_BASE+file).then(response=>{if(!response.ok)throw Error(file);return response.json();})
      ));
      state.catalog=catalog;state.external=external;state.themes=themes;
      [...catalog,...external].forEach(book=>state.books.set(String(book.id),book));
      state.records=safeReadHistory();
      renderHistory();
      $("#prescription-form").addEventListener("submit",handleConcern);
      $("#concern").addEventListener("input",e=>$("#count").textContent=`${e.target.value.length} / 1200`);
      document.querySelectorAll("[data-example]").forEach(button=>button.addEventListener("click",()=>{
        $("#concern").value=button.dataset.example;
        $("#count").textContent=`${button.dataset.example.length} / 1200`;
      }));
      $("#clear-history").onclick=()=>{
        if(confirm("이 브라우저에 저장된 독서 처방 기록을 모두 삭제할까요?")){
          state.records=[];saveHistory();renderHistory();toast("기록을 모두 삭제했어요.");
        }
      };
    } catch(error){console.error(error);toast("추천 데이터를 불러오지 못했습니다. 새로고침해 주세요.");}
  }
  window.addEventListener("DOMContentLoaded",init);
})();
