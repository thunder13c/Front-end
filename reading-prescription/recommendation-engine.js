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

  const conceptGroups={
    dream:["꿈","하고싶은일","진짜원하는","열망","열정","꿈을좇","꿈을쫓","현실과꿈","안정과꿈","내길","다른길","그림그리고","예술가"],
    freedom:["자유","억압","틀에박힌","속박","내방식","남이정한","관습","벗어나","독립","구속"],
    responsibility:["책임","가족을버","가족과꿈","민폐","희생","의무","미안","양심","타인에게피해"],
    art:["예술","창작","그림","음악","작가","화가","작품","표현하고","미술","창의적인일"],
    focus:["선택과집중","우선순위","관심사가많","너무많은것","동시에여러","하나에집중","몰입","산만","여러가지"],
    career:["퇴사","이직","직장","회사","커리어","생계","직업","일을그만","창업","출근","업무"],
    burnout:["번아웃","지쳤","지치","쉬고싶","소진","피곤","지긋지긋","의욕이없","탈진","과로"],
    esteem:["남과비교","자존감","자신감","열등감","눈치보","인정받","주눅","스스로부족"],
    loneliness:["외로","외롭","고독","혼자","고립","소외"],
    relationships:["사람과","사람들","인간관계","갈등","친구","동료","상처받","대화","불화","소통"],
    family:["가족","부모","엄마","아빠","자녀","형제","양육","가정"],
    love:["연애","연인","사랑","결혼","남자친구","여자친구"],
    breakup:["헤어졌","이별","헤어진","미련","재회","이혼"],
    grief:["사별","돌아가셨","떠나셨","애도","상실","슬픔","장례"],
    failure:["실패","좌절","도전","낙방","망했","재도전","포기하고","다시시작"],
    identity:["나다움","진짜나","정체성","나를찾","내가누군","나는누구","자아","본모습","나답게"],
    meaning:["삶의의미","왜사는","허무","공허","목적","인생이무의미","가치있는삶"],
    money:["돈","수입","월급","재정","빚","경제적","생활비","부자","소득","재테크"],
    future:["미래","앞날","장래","진로","막막","불확실","앞으로뭘"],
    decisions:["선택","결정","고민","망설","갈림길","후회","판단"],
    creativity:["새로운아이디어","창의","영감","혁신","상상","발상"],
    habits:["습관","미루","꾸준히","계획대로","실천","규칙적으로"],
    society:["불공정","사회","차별","불평등","경쟁","정의"],
    learning:["공부","학습","배움","지식","학문","독서"],
    technology:["인공지능","AI","기술","데이터","과학","디지털","미래기술"],
    health:["건강","질병","죽음","아프","몸","수면","불면"],
    history:["역사","과거","전쟁","한국사","세계사"],
    nature:["자연","환경","생태","동물","지구","기후"]
  };
  const alias={loneliness:"lonely"};
  const weak=new Set(["의미","삶의","왜","싶","계획","나는","나를","내가","찾","누구","고민","선택"]);
  function scoreIntent(text,themes,pinned=[]){
    const clean=normal(text);
    const out=new Map();
    const push=(id,score,word)=>{id=alias[id]||id;const prev=out.get(id)||{id,score:0,matched:[]};prev.score+=score;if(word&&!prev.matched.includes(word))prev.matched.push(word);out.set(id,prev);};
    for(const [id,terms] of Object.entries(conceptGroups)){
      for(const term of terms){
        const key=normal(term);
        if(key.length>1&&clean.includes(key)){
          if(id==="decisions"&&key==="선택"&&clean.includes("선택과집중"))continue;
          if(id==="meaning"&&key==="의미"&&!clean.includes("삶의의미"))continue;
          push(id, key.length>3?6:4,term);
        }
      }
    }
    for(const theme of themes){
      for(const term of theme.keys||[]){
        const key=normal(term);
        if(key.length<2||weak.has(key)||!clean.includes(key))continue;
        if(theme.id==="habits"&&key==="집중"&&/관심사|우선순위|선택과집중/.test(clean))continue;
        push(theme.id,key.length>3?2.5:1.5,term);
      }
    }
    for(const id of [...new Set(pinned)]){
      if(themes.some(t=>t.id===id)||conceptGroups[id])push(id,15,"직접 선택한 주제");
    }
    const scores=[...out.values()].sort((a,b)=>b.score-a.score);
    const max=scores[0]?.score||0;
    return scores.filter(x=>x.score>=3&&x.score>=max*.23).slice(0,4);
  }
  function planForCatalog(concern,themeIds,themes,books,bookTopics,insights,seed=0) {
    const matched=scoreIntent(concern,themes,themeIds);
    const selected=matched.length?matched:[{id:"future",score:1,matched:[]}];
    const weights=new Map(selected.map((x,i)=>[x.id,Math.max(.35,1-i*.16)]));
    const candidates=[];
    for(const book of books.values()){
      const tags=bookTopics[String(book.id)]||[];
      const matches=tags.filter(tag=>weights.has(tag));
      if(!matches.length)continue;
      const tagScore=matches.reduce((total,tag)=>total+(weights.get(tag)||0),0);
      const display=book.title.split(/[:：]/)[0].trim();
      let score=tagScore*120+matches.length*30+Math.min(45,randomUnit(seed,String(book.id))*50);
      if(typeof book.id==="number")score+=12;
      if(insights[String(book.id)])score+=9;
      // Favor manually authored prescriptions over broad topic-only inferences.
      const authoredHits=themes.filter(t=>matches.includes(t.id)&&t.recommend.some(p=>String(p[0])===String(book.id)));
      score+=authoredHits.length*115;
      // Distinctive cross-topic matches answer compound concerns more precisely.
      if(matches.includes("dream")&&matches.includes("art"))score+=65;
      if(matches.includes("dream")&&matches.includes("career"))score+=55;
      if(book.id==="e25"&&matches.includes("dream"))score+=85;
      if(normal(concern).includes(normal(display)))score+=180;
      const uniqueKey=normal(display).replace(/vol[0-9]+$/,"");
      candidates.push({book,tags,matches,score,uniqueKey});
    }
    candidates.sort((a,b)=>b.score-a.score);
    const chosen=[],used=new Set(),covered=new Set();
    while(chosen.length<3&&candidates.length){
      candidates.sort((a,b)=>{
        const merit=x=>x.score+x.matches.filter(id=>!covered.has(id)).length*65;
        return merit(b)-merit(a);
      });
      const next=candidates.shift();
      if(used.has(next.uniqueKey))continue;
      used.add(next.uniqueKey);chosen.push(next);next.matches.forEach(x=>covered.add(x));
    }
    const themeDict=new Map(themes.map(t=>[t.id,t.label]));
    const label=id=>themeDict.get(id)||({dream:"꿈과 현실",freedom:"자유와 자기결정",responsibility:"책임과 관계",art:"예술과 창작",technology:"기술과 미래",health:"건강과 회복",learning:"배움과 탐구",history:"역사와 사회",nature:"자연과 생태"}[id]||id);
    const result=chosen.map(x=>{
      const picked=x.matches.slice(0,3).map(label);
      const primary=matched.find(t=>x.matches.includes(t.id))?.id||x.matches[0];
      const authored=themes.find(t=>t.id===primary)?.recommend.find(p=>String(p[0])===String(x.book.id));
      const reason=authored?.[1]||("이 책은 "+picked.join("·")+"이라는 고민을 다른 관점에서 살펴보도록 돕습니다.");
      const prescription=authored?.[2]||("지금의 고민을 책 속 질문과 나란히 놓고 생각해 보세요.");
      const task=authored?.[3]||("인상 깊은 장면이나 주장 하나를 고르고 자신의 경험을 한 줄로 연결해 보세요.");
      return {bookId:x.book.id,part:[x.book.id,reason,prescription,task],labels:picked,themeIds:x.matches};
    });
    return {themes:selected.map(x=>({id:x.id,label:label(x.id)})),items:result,matched};
  }
  root.ReadingPrescriptionEngine={detectThemes,planForThemes,scoreIntent,planForCatalog};
})(window);