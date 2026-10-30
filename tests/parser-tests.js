const fixtures = [
  {name:'noun with empty cells and headers',word:'Haus',html:'<main><h1>Noun Haus</h1><h2>Declension</h2><table><tr><th></th><th>Singular</th><th>Plural</th></tr><tr><th>Nom.</th><td>Haus</td><td>Häuser</td></tr><tr><th>Gen.</th><td></td><td>Häuser</td></tr><tr><th>Dat.</th><td colspan="2">Haus</td></tr></table></main>',check:d=>d.inflectionTables[0].rows[2][1]==='' && d.inflectionTables[0].rows[0][1]==='Singular' && d.inflectionTables[0].cells[0][1].header && d.inflectionTables[0].cells[3][1].colSpan===2},
  {name:'inflected verb',word:'gehst',html:'<main><h1>Verb gehen</h1><table><tr><td>ich</td><td>gehe</td></tr><tr><td>du</td><td>gehst</td></tr><tr><td>wir</td><td>gehen</td></tr></table></main>',check:d=>d.lemma==='gehen' && d.matchedForm.startsWith('du')},
  {name:'adjective',word:'gut',html:'<main><h1>Adjective gut</h1><table><tr><th>Masculine</th><td>guter</td></tr></table></main>',check:d=>d.inflectionTables.length===1},
  {name:'missing entry',word:'xyz',html:'<main><h1>No results</h1></main>',check:d=>d.meaning==='' && d.inflectionTables.length===0}
];
let failures=0;
for(const fixture of fixtures){try{if(!fixture.check(parseVerbformen(fixture.html,fixture.word,'https://www.verbformen.com/')))throw Error('Unexpected parsed result'); document.querySelector('#output').textContent+='PASS '+fixture.name+'\n';}catch(error){failures++;document.querySelector('#output').textContent+='FAIL '+fixture.name+': '+error.message+'\n';}}
document.title=failures?'FAIL':'PASS';
