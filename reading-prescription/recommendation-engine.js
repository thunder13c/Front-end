/* Multi-topic reading recommendation engine (rule-based, no external AI). */
(function (root) {
  "use strict";
  const ignored = new Set(["싶", "왜", "내가", "나를", "나는", "찾", "누구", "뭘", "의미", "삶의", "못해", "계획"]);
  const normal = s => String(s || "").toLowerCase().replace(/[\s·.,!?~():/'"\-]/g,"");
  function detectThemes(concern, themes, pinnedIds = []) {
    const pinned = [...new Set(pinnedIds)].filter(id => themes.some(t => t.id === id));
    if (pinned.length) return pinned.slice(0,3); // User-selected themes outrank inferred ones.
    const text = normal(concern);
    const ranked = themes.map((theme,index) => {
      let score = 0;
      for (const term of theme.keys || []) {
        const key = normal(term);
        if (!key || ignored.has(key) || key.length < 2) continue;
        if (theme.id === "habits" && key === "집중" && /관심사|우선순위|선택과집중|하고싶은|여러가지/.test(text)) continue;
        if (theme.id === "decisions" && key === "선택" && text.includes("선택과집중")) continue;
        if (text.includes(key)) score += key.length >= 4 ? 4 : 3;
      }
      if (theme.id === "focus" && /우선순위|선택과집중|관심사가|너무많은일/.test(text)) score += 5;
      if (theme.id === "future" && /미래|앞으로|막막|진로/.test(text)) score += 3;
      if (theme.id === "career" && /퇴사|이직/.test(text)) score += 5;
      if (theme.id === "breakup" && /이별|헤어/.test(text)) score += 5;
      if (theme.id === "grief" && /사별|돌아가셨|떠나셨/.test(text)) score += 6;
      return {id:theme.id,score,index};
    }).sort((a,b)=>b.score-a.score||a.index-b.index);
    const max = ranked[0]?.score || 0;
    if (!max) return [themes[0]?.id].filter(Boolean);
    return ranked.filter(x=>x.score>=3 && x.score>=max*.27).slice(0,3).map(x=>x.id);
  }
  function randomUnit(seed, key) {
    let h=(seed>>>0)||1;
    for(const c of String(key)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
    h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;
    return (h>>>0)/4294967295;
  }
  function planForThemes(ids, themes, books, seed=0) {
    const selected = [...new Set(ids)].map(id=>themes.find(t=>t.id===id)).filter(Boolean).slice(0,3);
    if (!selected.length) return {themes:[],items:[]};
    const candidates = new Map();
    selected.forEach((theme,themeIndex) => {
      (theme.recommend||[]).forEach((part,rank) => {
        const book=books.get(String(part[0]));
        if(!book)return;
        // Avoid recommending the same work in two different editions.
        const key=normal(book.title.split(/[:：]/)[0].replace(/(?:개정판.*|\s*vol\.\s*[12].*)$/i,""));
        const prev=candidates.get(key);
        if (!prev || (typeof prev.book.id === "string" && typeof book.id === "number")) {
          const matches=prev?.matches||[];
          candidates.set(key,{key,book,matches});
        }
        const item=candidates.get(key);
        item.matches.push({themeId:theme.id,themeIndex,rank,part});
      });
    });
    const pool=[...candidates.values()];
    const chosen=[],covered=new Set();
    while (chosen.length<3 && pool.length) {
      pool.sort((a,b)=>{
        function merit(c) {
          const hits=new Set(c.matches.map(m=>m.themeId));
          let s=[...hits].reduce((sum,id)=>sum+(!covered.has(id)?220:0),0);
          s+=(hits.size-1)*120;
          s+=c.matches.reduce((sum,m)=>sum+(4-m.rank)*100/(1+m.themeIndex*.35),0);
          if(typeof c.book.id==="number")s+=10;
          // Bounded exploration: never overrides the matched-theme relevance rules.
          s+=randomUnit(seed,c.key)*160;
          return s;
        }
        return merit(b)-merit(a)||a.matches[0].themeIndex-b.matches[0].themeIndex;
      });
      const candidate=pool.shift();
      chosen.push(candidate);
      candidate.matches.forEach(m=>covered.add(m.themeId));
    }
    const items=chosen.map(candidate=>{
      const matches=candidate.matches.slice().sort((a,b)=>a.themeIndex-b.themeIndex||a.rank-b.rank);
      const primary=matches[0].part;
      const labels=matches.map(m=>selected.find(t=>t.id===m.themeId)?.label).filter(Boolean);
      const reason=labels.length>1
        ? primary[1].replace(/[.!?]+$/,"")+" — 연관 고민: "+labels.join("·")
        : primary[1];
      return {bookId:candidate.book.id,part:[candidate.book.id,reason,primary[2],primary[3]],themeIds:matches.map(m=>m.themeId),labels};
    });
    return {themes:selected,items};
  }
  root.ReadingPrescriptionEngine={detectThemes,planForThemes};
})(window);