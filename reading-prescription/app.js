(function bookApp() {
  "use strict";
  const DATA_BASE = "/";
  const HISTORY_KEY = "reading-prescription-history-v1";
  const PRESETS_KEY = "reading-prescription-presets-v2";
  const builtInPresets = [{label:"번아웃",concern:"요즘 일에 지치고 매일 반복되는 일상이 무의미하게 느껴져요.",themeId:"burnout"},{label:"미래·진로",concern:"앞으로의 미래가 막막하고 직장을 계속 다녀야 할지 모르겠어요.",themeId:"future"},{label:"자존감",concern:"자꾸 다른 사람과 비교하게 되고 자신감이 떨어져요.",themeId:"esteem"},{label:"인간관계",concern:"사람들과 관계를 맺는 게 어렵고 자주 상처받아요.",themeId:"relationships"},{label:"선택과 집중",concern:"관심사가 너무 많고 하고 싶은 일이 많아서 무엇에 집중해야 할지 모르겠어요.",themeId:"focus"},{label:"돈과 미래",concern:"경제적으로 불안하고 미래 계획을 어떻게 해야 할지 고민이에요.",themeId:"money"},{label:"이별",concern:"소중한 사람과 헤어져서 마음을 어떻게 정리해야 할지 모르겠어요.",themeId:"breakup"},{label:"나를 찾기",concern:"내가 어떤 삶을 원하는지, 정말 좋아하는 일이 뭔지 모르겠어요.",themeId:"identity"},{label:"실패·재도전",concern:"실패 후 다시 시작하는 것이 두렵고 용기가 나지 않아요.",themeId:"failure"},{label:"가족",concern:"가족과 생각이 달라서 이해하고 대화하는 방법이 고민이에요.",themeId:"family"},{label:"외로움",concern:"혼자라고 느껴져서 외롭고 사람들과 연결되고 싶어요.",themeId:"lonely"},{label:"일과 삶의 균형",concern:"회사 일에 매달리다 보니 나를 위한 시간이 없고 균형을 찾고 싶어요.",themeId:"burnout"}];
  const $ = sel => document.querySelector(sel);
  const state = {catalog: [], external: [], themes: [], books: new Map(), records: [], current: null, coverCache: {}, insights: {}, presets: [], editingPresetId: null, selectedPresetKeys: [], activeSelectionId: null};
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("visible");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("visible"), 2600);
  }
  function normalize(s) { return String(s || "").toLowerCase().replace(/[\s·.,!?~():/'"\-]/g, ""); }
  function oneLine(s) { return String(s || "").replace(/\s+/g," ").trim(); }
  const engine=window.ReadingPrescriptionEngine;
  if (!engine) throw new Error("Recommendation engine is missing.");
  function resolveThemes(concern,forcedIds=[]) {
    return engine.detectThemes(concern,state.themes,forcedIds);
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
  const coversPending=new Map();
  async function fetchJson(url) {
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),8000);
    try {
      const res=await fetch(url,{signal:ctl.signal,headers:{Accept:"application/json"}});
      if(!res.ok)throw Error("cover API "+res.status);
      return await res.json();
    } finally {clearTimeout(timer);}
  }
  function coverTitle(book) {
    return book.title.split(/[:：]/)[0].replace(/(\s*vol\.\s*\d+|\s*개정판.*)$/i,"").trim();
  }
  function validImageUrl(url) {
    if(typeof url!=="string")return null;
    try {const u=new URL(url.replace(/^http:/,"https:"));return u.protocol==="https:"?u.href:null;}catch{return null;}
  }
  async function findBookCover(book) {
    const title=coverTitle(book),author=book.author||"";
    const expected=normalize(title);
    // Google Books offers real thumbnail URLs for matching editions.
    try {
      const q="intitle:"+title+(author&&!author.includes("확인 필요")?" inauthor:"+author.split(/[·,]/)[0]:"");
      const queries=[q,"intitle:"+title];
      for(const query of queries){
        const data=await fetchJson("https://www.googleapis.com/books/v1/volumes?q="+encodeURIComponent(query)+"&maxResults=15&printType=books");
        const candidates=(data.items||[]).map(item=>item.volumeInfo||{});
        const match=candidates.find(v=>{
          const name=normalize(v.title);
          return expected&&name&&(name.includes(expected)||expected.includes(name))&&(v.imageLinks?.thumbnail||v.imageLinks?.smallThumbnail);
        });
        if(match){
          const url=validImageUrl(match.imageLinks.thumbnail||match.imageLinks.smallThumbnail);
          if(url)return url.replace(/([?&])zoom=\d+/, "$1zoom=1");
        }
      }
    } catch(error){ /* Try a second image catalog below. */ }
    // Open Library is an independent fallback; do not use an arbitrary unrelated cover.
    try {
      const response=await fetchJson("https://openlibrary.org/search.json?title="+encodeURIComponent(title)+"&limit=12&fields=title,author_name,cover_i,isbn");
      const matched=(response.docs||[]).find(d=>{
        const name=normalize(d.title);
        return expected&&name&&(name.includes(expected)||expected.includes(name))&&d.cover_i;
      });
      if(matched?.cover_i)return "https://covers.openlibrary.org/b/id/"+matched.cover_i+"-L.jpg";
    } catch(error){ /* Genuine cover unavailable. */ }
    return null;
  }
  function getCover(book,img,container) {
    const key=normalize(book.title+" "+book.author);
    const urls=[];
    const pinned=validImageUrl(book.coverUrl);
    if(pinned)urls.push(pinned);
    if(state.coverCache[key])urls.push(state.coverCache[key]);
    let index=0;
    let triedLookup=false;
    const showNext=async()=>{
      if(!img.isConnected)return;
      if(index<urls.length){
        img.src=urls[index++];
        return;
      }
      if(triedLookup)return;
      triedLookup=true;
      if(state.coverCache[key]===false)return;
      if(!coversPending.has(key))coversPending.set(key,findBookCover(book));
      const discovered=await coversPending.get(key);
      coversPending.delete(key);
      if(!img.isConnected)return;
      if(discovered&&!urls.includes(discovered)){
        state.coverCache[key]=discovered;
        urls.push(discovered);
        showNext();
      }else state.coverCache[key]=false;
    };
    img.addEventListener("error",()=>{
      img.classList.remove("ready");
      container.classList.remove("has-image");
      showNext();
    });
    showNext();
  }
  function line(label,value) {
    const node = createNode("div","compact-field");
    node.append(createNode("strong",null,label),createNode("span",null,oneLine(value)));
    return node;
  }
  function copyText(part,detailed=false) {
    const book = getBook(part[0]);
    if (!book) return "";
    const source = typeof book.id === "number" ? "독서클럽 보유" : "외부 추천";
    const basic=`${book.title} | ${book.author} (${source})\n추천 이유: ${part[1]}\n한 줄 처방: ${part[2]}\n복용법: ${part[3]}\n교보문고 검색: ${kyoboSearch(book)}`;
    const insight=state.insights[String(book.id)];
    if(!detailed||!insight)return basic;
    const meaning=insight.type==="novel"?"줄거리":insight.type==="poetry"?"시집 소개":"핵심 내용";
    return basic+"\n"+meaning+": "+insight.summary+"\n생각해 볼 관점:\n"+insight.perspectives.map((p,i)=>"  "+(i+1)+". "+p).join("\n");
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
    const themeIds=Array.isArray(record.themeIds)&&record.themeIds.length ? record.themeIds : [record.themeId];
    const plan=engine.planForThemes(themeIds,state.themes,state.books,record.seed||0);
    if(!plan.items.length)return;
    state.current=record;
    const summary=plan.themes.map(x=>x.label).join(" + ");
    const more=(record.selectedLabels?.length||0)>3 ? " · 여러 키워드 중 상위 3개 주제 반영" : "";
    $("#match-description").textContent=plan.themes.length>1
      ? `복합 고민 처방 · ${summary}${more} · ${plan.items.length}권 추천`
      : `${summary}을(를) 중심으로 골랐습니다 · ${plan.items.length}권 추천`;
    const grid = $("#prescription-grid");
    grid.replaceChildren();
    plan.items.forEach(({part,labels},index)=>{
      const book=getBook(part[0]);
      if (!book) return;
      const card=createNode("article","book-card");
      const top=createNode("div","card-top");
      top.append(createNode("span","rank"+(index ? " alternative":""),index===0 ? "01 · 오늘의 책" : `0${index+1} · 대안 처방`),
        createNode("span","source-tag"+(typeof book.id === "string" ? " external":""),typeof book.id === "number" ? "클럽 보유 도서" : "외부 추천"));
      card.append(top);
      if(plan.themes.length>1)card.append(createNode("p","book-topics","연결 주제 · "+labels.join(" · ")));
      const cover=createNode("a","book-cover");
      cover.href=kyoboSearch(book);cover.target="_blank";cover.rel="noopener noreferrer";cover.title=book.title+" · 교보문고에서 보기";
      const fallback=createNode("span","fallback-cover",book.title.split(/[:：]/)[0]);
      fallback.setAttribute("aria-hidden","true");
      const img=document.createElement("img");
      img.alt=`${book.title} 표지`;
      img.loading="eager";
      img.decoding="async";
      img.referrerPolicy="no-referrer";
      img.addEventListener("load",()=>{img.classList.add("ready");cover.classList.add("has-image");});
      cover.append(fallback,img);
      card.append(cover);
      getCover(book,img,cover);
      card.append(createNode("h3","book-name",book.title.split(/[:：]/)[0]),createNode("p","book-author",book.author));
      const fields=createNode("div","compact-fields");
      fields.append(line("추천 이유",part[1]),line("한 줄 처방",part[2]),line("복용법",part[3]));
      card.append(fields);
      const insight=state.insights[String(book.id)];
      if(insight){
        const details=createNode("details","book-insights");
        const summary=createNode("summary","insight-toggle","책의 내용 · 다양한 독서 관점 펼치기");
        details.append(summary);
        const body=createNode("div","insight-body");
        const heading=insight.type==="novel"?"줄거리":insight.type==="poetry"?"시집 소개":"핵심 내용";
        body.append(createNode("h4","insight-subtitle",heading),createNode("p","insight-summary",insight.summary));
        body.append(createNode("h4","insight-subtitle","이 책을 다르게 읽는 3가지 관점"));
        const perspectives=createNode("ol","perspective-list");
        ["공감하며 읽기","다시 질문하기","내 삶에 적용하기"].forEach((label,i)=>{
          const item=createNode("li","perspective-item");
          item.append(createNode("strong",null,label),createNode("span",null,insight.perspectives[i]));
          perspectives.append(item);
        });
        body.append(perspectives);
        const note=createNode("p","insight-note","※ 실제 독자 리뷰나 책의 직접 인용이 아닌, 독서 상담을 위한 해석 예시입니다.");
        body.append(note);
        const detailedCopy=createNode("button","insight-copy","상세 처방 복사 ⧉");
        detailedCopy.type="button";
        detailedCopy.addEventListener("click",()=>copy(copyText(part,true)));
        body.append(detailedCopy);
        details.append(body);
        card.append(details);
      }
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
    $("#copy-all").onclick=()=>copy("독서 처방전\n고민: "+record.concern+"\n분석 주제: "+summary+"\n\n"+plan.items.map((r,i)=>`${i+1}. ${copyText(r.part)}`).join("\n\n"));
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
      const sub=createNode("span",null,`${Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ko-KR")} · ${(Array.isArray(rec.themeIds) && rec.themeIds.length ? rec.themeIds : [rec.themeId]).map(id=>state.themes.find(x=>x.id===id)?.label).filter(Boolean).join(" + ") || "독서 처방"}`);
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
  function readPresets(){try{const v=JSON.parse(localStorage.getItem(PRESETS_KEY)||"[]");return Array.isArray(v)?v.filter(x=>x&&typeof x.label==="string"&&typeof x.concern==="string"&&typeof x.themeId==="string"&&x.concern.length>=5&&state.themes.some(t=>t.id===x.themeId)).slice(0,100).map(x=>({id:String(x.id||Date.now()),label:x.label.slice(0,28),concern:x.concern.slice(0,600),themeId:x.themeId})):[];}catch{return [];}}
  function storePresets(){try{localStorage.setItem(PRESETS_KEY,JSON.stringify(state.presets));return true;}catch{toast("저장 공간에 접근할 수 없습니다.");return false;}}
  function presetEntries() {
    return [...builtInPresets.map((p,i)=>({key:"builtin-"+i,preset:p})),
      ...state.presets.map(p=>({key:"custom-"+p.id,preset:p}))];
  }
  function resetSelection(){
    state.selectedPresetKeys=[];
    state.activeSelectionId=null;
    renderPresets();
  }
  function usePreset(preset,key) {
    const keys=state.selectedPresetKeys;
    if(keys.includes(key))state.selectedPresetKeys=keys.filter(k=>k!==key);
    else {
      if(keys.length>=6)return toast("한 번에 최대 6개 키워드를 조합할 수 있어요.");
      state.selectedPresetKeys=[...keys,key];
    }
    const selected=presetEntries().filter(x=>state.selectedPresetKeys.includes(x.key));
    state.selectedPresetKeys=selected.map(x=>x.key);
    if(!selected.length){
      state.activeSelectionId=null;
      $("#concern").value="";
      $("#count").textContent="0 / 1200";
      $("#results").hidden=true;
      renderPresets();
      return;
    }
    const concern=selected.map(x=>x.preset.label+" : "+x.preset.concern).join(" + ").slice(0,1200);
    $("#concern").value=concern;
    $("#count").textContent=`${concern.length} / 1200`;
    submitConcern(concern,{
      forcedIds:selected.map(x=>x.preset.themeId),
      selectedLabels:selected.map(x=>x.preset.label),
      reuseSelection:true
    });
    renderPresets();
  }
  function renderPresets(){
    const grid=$("#custom-prompts"),list=$("#preset-list");grid.replaceChildren();list.replaceChildren();
    const entries=presetEntries();
    entries.forEach(({key,preset},i)=>{
      const selected=state.selectedPresetKeys.includes(key);
      const button=createNode("button",(i<builtInPresets.length?"preset-chip":"preset-chip custom-chip")+(selected?" selected":""),preset.label);
      button.type="button";button.title=preset.concern;button.setAttribute("aria-pressed",String(selected));
      button.addEventListener("click",()=>usePreset(preset,key));grid.append(button);
    });
    const count=$("#selected-count");
    count.textContent=state.selectedPresetKeys.length
      ? `${state.selectedPresetKeys.length}개 선택 · 함께 분석하여 3권 추천` : "키워드를 여러 개 눌러 고민을 조합할 수 있어요.";
    $("#clear-selected").hidden=!state.selectedPresetKeys.length;
    document.querySelectorAll("[data-example]").forEach((button,i)=>{
      const selected=state.selectedPresetKeys.includes("builtin-"+i);
      button.classList.toggle("selected",selected);
      button.setAttribute("aria-pressed",String(selected));
    });
    state.presets.forEach(item=>{const li=createNode("li","preset-row");const info=createNode("div","preset-info");info.append(createNode("strong",null,item.label),createNode("small",null,item.concern));const actions=createNode("div","preset-row-actions");const edit=createNode("button",null,"수정");edit.type="button";edit.onclick=()=>{state.editingPresetId=item.id;$("#preset-label").value=item.label;$("#preset-concern").value=item.concern;$("#preset-theme").value=item.themeId;$("#save-preset").textContent="수정 저장";$("#cancel-edit").hidden=false;$("#preset-label").focus();};const del=createNode("button",null,"삭제");del.type="button";del.onclick=()=>{if(confirm("이 키워드를 삭제할까요?")){state.presets=state.presets.filter(x=>x.id!==item.id);state.selectedPresetKeys=state.selectedPresetKeys.filter(k=>k!=="custom-"+item.id);storePresets();renderPresets();}};actions.append(edit,del);li.append(info,actions);list.append(li);});
  }
  function resetPresetForm(){$("#preset-form").reset();state.editingPresetId=null;$("#save-preset").textContent="키워드 저장";$("#cancel-edit").hidden=true;}
  function setupPresetManager(){
    $("#preset-theme").replaceChildren();state.themes.forEach(t=>{const op=createNode("option",null,t.label);op.value=t.id;$("#preset-theme").append(op);});
    state.presets=readPresets();renderPresets();
    $("#clear-selected").onclick=()=>{resetSelection();$("#results").hidden=true;$("#concern").value="";$("#count").textContent="0 / 1200";};
    $("#toggle-manager").onclick=()=>{const panel=$("#manager-form");panel.hidden=!panel.hidden;$("#toggle-manager").setAttribute("aria-expanded",String(!panel.hidden));};
    $("#cancel-edit").onclick=resetPresetForm;
    $("#preset-form").addEventListener("submit",e=>{e.preventDefault();const label=$("#preset-label").value.trim(),concern=$("#preset-concern").value.trim(),themeId=$("#preset-theme").value;if(!label||concern.length<5||!state.themes.some(t=>t.id===themeId))return toast("입력을 확인해 주세요.");if(state.presets.length>=100&&!state.editingPresetId)return toast("키워드는 최대 100개까지 저장할 수 있습니다.");const p={id:state.editingPresetId||String(Date.now())+"-"+Math.random().toString(36).slice(2,7),label,concern,themeId};if(state.editingPresetId)state.presets=state.presets.map(x=>x.id===state.editingPresetId?p:x);else state.presets.push(p);storePresets();resetPresetForm();renderPresets();toast("키워드를 저장했어요.");});
    $("#export-settings").onclick=()=>{const data=JSON.stringify({version:1,presets:state.presets},null,2);const url=URL.createObjectURL(new Blob([data],{type:"application/json"}));const a=createNode("a");a.href=url;a.download="reading-prescription-keywords.json";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    $("#import-settings").addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>200000)return toast("설정 파일이 너무 큽니다.");try{const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.presets)||data.presets.length>100)throw Error("bad schema");const incoming=data.presets.map(p=>({id:String(p.id||""),label:String(p.label||"").trim().slice(0,28),concern:String(p.concern||"").trim().slice(0,600),themeId:String(p.themeId||"")}));if(incoming.some(p=>!p.id||!p.label||p.concern.length<5||!state.themes.some(t=>t.id===p.themeId)))throw Error("invalid preset");if(!confirm("현재 직접 등록한 키워드를 가져온 설정으로 바꿀까요?"))return;state.presets=incoming;storePresets();renderPresets();resetPresetForm();toast("키워드를 가져왔어요.");}catch{toast("올바른 설정 파일이 아닙니다.");}finally{e.target.value="";}});
  }
  function submitConcern(concern, options={}) {
    if(concern.length<5){toast("고민을 조금 더 자세히 적어주세요.");return;}
    const themeIds=resolveThemes(concern,options.forcedIds||[]);
    const record={
      id:options.reuseSelection&&state.activeSelectionId ? state.activeSelectionId : Date.now(),
      concern,themeId:themeIds[0],themeIds,selectedLabels:options.selectedLabels||[],
      created:new Date().toISOString(),seed:Math.floor(Math.random()*4294967295)
    };
    const idx=options.reuseSelection&&state.activeSelectionId
      ? state.records.findIndex(r=>r.id===state.activeSelectionId) : -1;
    if(idx>=0)state.records.splice(idx,1);
    state.records.unshift(record);
    state.records=state.records.slice(0,20);
    if(options.reuseSelection)state.activeSelectionId=record.id;
    saveHistory();renderRecord(record);renderHistory();
  }
  function handleConcern(event){
    event.preventDefault();
    const concern=$("#concern").value.trim();
    resetSelection();
    submitConcern(concern);
  }
  async function init(){
    try {
      const [catalog,external,themes,insights]=await Promise.all(["catalog.json","extended.json","themes.json","book-insights.json"].map(file=>
        fetch(DATA_BASE+file).then(response=>{if(!response.ok)throw Error(file);return response.json();})
      ));
      state.catalog=catalog;state.external=external;state.themes=themes;
      state.insights=insights && typeof insights==="object"&&!Array.isArray(insights)?insights:{};
      [...catalog,...external].forEach(book=>state.books.set(String(book.id),book));
      setupPresetManager();
      state.records=safeReadHistory();
      renderHistory();
      $("#prescription-form").addEventListener("submit",handleConcern);
      $("#concern").addEventListener("input",e=>{resetSelection();$("#count").textContent=`${e.target.value.length} / 1200`;});
      document.querySelectorAll("[data-example]").forEach((button,i)=>button.addEventListener("click",()=>usePreset(builtInPresets[i],"builtin-"+i)));
      $("#clear-history").onclick=()=>{
        if(confirm("이 브라우저에 저장된 독서 처방 기록을 모두 삭제할까요?")){
          state.records=[];saveHistory();renderHistory();toast("기록을 모두 삭제했어요.");
        }
      };
    } catch(error){console.error(error);toast("추천 데이터를 불러오지 못했습니다. 새로고침해 주세요.");}
  }
  window.addEventListener("DOMContentLoaded",init);
})();
