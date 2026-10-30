const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('latest search wins and manual searches persist', async () => {
  const elements = Object.fromEntries(['#word','#result','#source','#search-form','#play-audio'].map(id => [id,{addEventListener(){},value:''}]));
  const requests=[], saved=[];
  const context=vm.createContext({document:{querySelector:id=>elements[id]},chrome:{storage:{local:{get:async()=>({}),set:async value=>saved.push(value)}}},AbortController,setTimeout,clearTimeout,
    fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),
    parseVerbformen:(_,word)=>({word,lemma:word,ipa:[],audio:[],inflectionTables:[],meaning:word})});
  vm.runInContext(fs.readFileSync('popup.js','utf8'),context);
  await Promise.resolve();
  const first=context.runLookup('alt');
  const second=context.runLookup('neu');
  assert.equal(requests[0].options.signal.aborted,true);
  requests[1].resolve({ok:true,text:async()=>'',url:requests[1].url});
  await second;
  const latest=elements['#result'].innerHTML;
  requests[0].resolve({ok:true,text:async()=>'',url:requests[0].url});
  await first;
  assert.equal(elements['#result'].innerHTML,latest);
  assert.match(latest,/neu/);
  assert.equal(saved.at(-1).lookupWord,'neu');
});
