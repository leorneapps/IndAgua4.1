
/* Telegram: credenciais carregadas dinamicamente do IndexedDB */
let _telegramToken = '';
let _telegramChatId1 = '';
let _telegramChatId2 = '';

const DB_NAME = 'IndAguaLiriosDB';
const DB_VERSION = 47;
const ALL_STORES = [
  'empresa_config','clientes','funcionarios','fornecedores','produtos','insumos',
  'compras','movimentos_estoque','telegram_queue','tipos_custos','custos_lancamentos',
  'vendas','vale','limites_credito','folha_pagamento','financeiro_lancamentos',
  'configuracoes','usuarios','logs_sistema','backups','producoes','configuracoes_telegram',
  'fechamentos_caixa','contas_pagar','cidades','comodato_movimentacoes','documentos_arvore','documentos_escada','patrimonio_bens','rh_faltas',
  'rh_licencas', /* v3.4: licencas e afastamentos por periodo */
  'backup_snapshots',
  'extrato_eventos' /* v3.6: extrato diário local */
];
let db = null;
let carrinho=[];
let isProcessing=false;

function ensureStores(database){
  ALL_STORES.forEach((s)=>{ if(!database.objectStoreNames.contains(s)){ database.createObjectStore(s,{keyPath:'id'}); } });
}
function initDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=(e)=>ensureStores(e.target.result);
    req.onsuccess=async(e)=>{ db=e.target.result; await seedEmpresaConfig(); await seedCidades(); resolve(db); };
    req.onerror=()=>reject(req.error);
  });
}
function seedEmpresaConfig(){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('empresa_config','readwrite');
    tx.objectStore('empresa_config').put({id:1,nome:'Grupo Leorne',updatedAt:new Date().toISOString()});
    tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error||new Error('Falha ao gravar empresa_config.'));
  });
}
async function seedCidades(){
  const existentes=await reqToPromise(getStore('cidades').getAll());
  if(existentes.length>0) return;
  const cidadesSeed=[
    {id:idGen(),nome:'Santana do Acaraú',estado:'CE',criadoEm:new Date().toISOString()},
    {id:idGen()+1,nome:'Sobral',estado:'CE',criadoEm:new Date().toISOString()},
    {id:idGen()+2,nome:'Fortaleza',estado:'CE',criadoEm:new Date().toISOString()},
    {id:idGen()+3,nome:'Massapê',estado:'CE',criadoEm:new Date().toISOString()},
    {id:idGen()+4,nome:'Meruoca',estado:'CE',criadoEm:new Date().toISOString()},
    {id:idGen()+5,nome:'Acaraú',estado:'CE',criadoEm:new Date().toISOString()}
  ];
  const tx=db.transaction('cidades','readwrite');
  cidadesSeed.forEach(c=>tx.objectStore('cidades').put(c));
  await txToPromise(tx);
}
function getStore(name, mode='readonly'){ return db.transaction(name,mode).objectStore(name); }
function reqToPromise(req){ return new Promise((resolve,reject)=>{ req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }
function txToPromise(tx){ return new Promise((resolve,reject)=>{ tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error||new Error('Transação abortada.')); }); }
function idGen(){ return Date.now()+Math.floor(Math.random()*1000); }
function esc(v){ return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
function formatDateBR(v){ if(!v) return ''; const p=v.split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:v; }
function moneyBR(v){ return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function currentStock(item){ return Number(item.estoqueAtual ?? item.estoqueInicial ?? 0); }
function showScreen(id){ document.querySelectorAll('.screen').forEach((s)=>{ s.classList.add('hidden'); s.classList.remove('active'); }); const t=document.getElementById(id); if(t){ t.classList.remove('hidden'); t.classList.add('active'); } }
async function fetchAllSorted(store,key='nome',desc=false){ const items=await reqToPromise(getStore(store).getAll()); if(desc){ return items.sort((a,b)=>String(b[key]??'').localeCompare(String(a[key]??''))); } return items.sort((a,b)=>String(a[key]??'').localeCompare(String(b[key]??''))); }
function setTodayIfEmpty(id){ const el=document.getElementById(id); if(el && !el.value) el.value=new Date().toISOString().slice(0,10); }
function renderEntityList(listId,totalId,items,emptyText,renderHtml,bindActions){
  const list=document.getElementById(listId);
  const total=document.getElementById(totalId);
  if(total) total.textContent = items.length===1 ? '1 item' : `${items.length} itens`;
  if(!list) return;
  if(!items.length){ list.innerHTML=`<div class="empty-list">${emptyText}</div>`; return; }
  list.innerHTML = items.map(renderHtml).join('');
  if(bindActions) bindActions(list);
}
function actionButtons(id){
  return `<div class="row-actions"><button class="btn-small js-edit" data-id="${id}" type="button">Editar</button><button class="btn-danger js-delete" data-id="${id}" type="button">Excluir</button></div>`;
}
function funcionarioEstaAtivo(func){ return String(func?.status||'ATIVO').toUpperCase() !== 'INATIVO'; }

/* ========== CLIENTES ========== */
function resetClienteForm(){ const f=document.getElementById('cliente-form'); if(f) f.reset(); document.getElementById('cliente-id').value=''; document.getElementById('cliente-limite-credito').value='0'; document.getElementById('btn-salvar-cliente').textContent='Salvar Cliente'; }
async function salvarCliente(event){
  event.preventDefault();
  const idVal=document.getElementById('cliente-id').value.trim();
  const obj={ id:idVal?Number(idVal):idGen(), nome:document.getElementById('cliente-nome').value.trim(), documento:document.getElementById('cliente-documento').value.trim(), telefone:document.getElementById('cliente-telefone').value.trim(), cidade:document.getElementById('cliente-cidade').value.trim(), limiteCredito:Number(document.getElementById('cliente-limite-credito').value||0), endereco:(document.getElementById('cliente-endereco')?document.getElementById('cliente-endereco').value.trim():''), observacao:(document.getElementById('cliente-observacao')?document.getElementById('cliente-observacao').value.trim():''), updatedAt:new Date().toISOString() };
  if(!obj.nome) return alert('Informe o nome do cliente.');
  const isNovoCliente = !idVal;
  const limiteExistente=await reqToPromise(getStore('limites_credito').get(obj.id));
  const saldoDevedorAtual=limiteExistente?Number(limiteExistente.saldoDevedor||0):0;
  const tx=db.transaction(['clientes','limites_credito'],'readwrite');
  tx.objectStore('clientes').put(obj);
  tx.objectStore('limites_credito').put({id:obj.id,clienteId:obj.id,clienteNome:obj.nome,limite:obj.limiteCredito,saldoDevedor:saldoDevedorAtual,updatedAt:new Date().toISOString()});
  await txToPromise(tx);
  if(isNovoCliente){ await registrarEventoAuditoria('CADASTRO','Novo cliente cadastrado',`Cliente: ${obj.nome}\nLimite: ${moneyBR(obj.limiteCredito)}`); }
  else { await registrarEventoAuditoria('CADASTRO','Cliente atualizado',`Cliente: ${obj.nome}`); }
  resetClienteForm(); await renderClientes(); await carregarClientesVenda();
}
async function editarCliente(id){ const x=await reqToPromise(getStore('clientes').get(id)); if(!x) return; document.getElementById('cliente-id').value=x.id; document.getElementById('cliente-nome').value=x.nome||''; document.getElementById('cliente-documento').value=x.documento||''; document.getElementById('cliente-telefone').value=x.telefone||''; document.getElementById('cliente-cidade').value=x.cidade||''; document.getElementById('cliente-limite-credito').value=Number(x.limiteCredito||0); if(document.getElementById('cliente-endereco')) document.getElementById('cliente-endereco').value=x.endereco||''; if(document.getElementById('cliente-observacao')) document.getElementById('cliente-observacao').value=x.observacao||''; document.getElementById('btn-salvar-cliente').textContent='Atualizar Cliente'; }
async function excluirCliente(id){ const cliente=await reqToPromise(getStore('clientes').get(id)); if(!confirm(`Tem certeza que deseja excluir "${cliente.nome}"? Esta ação não pode ser desfeita.`)) return; const tx=db.transaction(['clientes','limites_credito'],'readwrite'); tx.objectStore('clientes').delete(id); tx.objectStore('limites_credito').delete(id); await txToPromise(tx); resetClienteForm(); await renderClientes(); await carregarClientesVenda(); }
async function renderClientes(){
  const items=await fetchAllSorted('clientes');
  const limites=await fetchAllSorted('limites_credito');
  const mapa=new Map(limites.map(x=>[Number(x.clienteId||x.id), Number(x.saldoDevedor||0)]));
  renderEntityList('clientes-lista','clientes-total',items,'Nenhum cliente cadastrado ainda.',
    (x)=>`<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(x.nome)}</h4><p class="entity-meta">${x.cidade?`Cidade: ${esc(x.cidade)}<br>`:''}Limite de Crédito: ${esc(moneyBR(x.limiteCredito))}<br>Dívida Atual: ${esc(moneyBR(mapa.get(Number(x.id))||0))}${x.documento?`<br>CPF/CNPJ: ${esc(x.documento)}`:''}${x.telefone?`<br>Telefone: ${esc(x.telefone)}`:''}${x.endereco?`<br>Endereço: ${esc(x.endereco)}`:''}${x.observacao?`<br>Obs: ${esc(x.observacao)}`:''}</p></div>${actionButtons(x.id)}</div></article>`,
    (list)=>{ list.querySelectorAll('.js-edit').forEach((b)=>b.addEventListener('click',()=>editarCliente(Number(b.dataset.id)))); list.querySelectorAll('.js-delete').forEach((b)=>b.addEventListener('click',()=>excluirCliente(Number(b.dataset.id)))); }
  );
}

/* ========== FUNCIONARIOS ========== */
function resetFuncionarioForm(){ const f=document.getElementById('funcionario-form'); if(f) f.reset(); document.getElementById('funcionario-id').value=''; if(document.getElementById('funcionario-salario-base')) document.getElementById('funcionario-salario-base').value='0'; if(document.getElementById('funcionario-status')) document.getElementById('funcionario-status').value='ATIVO'; document.getElementById('btn-salvar-funcionario').textContent='Salvar Funcionário'; }
async function salvarFuncionario(event){ event.preventDefault(); const idVal=document.getElementById('funcionario-id').value.trim(); const obj={ id:idVal?Number(idVal):idGen(), nome:document.getElementById('funcionario-nome').value.trim(), cpf:document.getElementById('funcionario-cpf').value.trim(), telefone:document.getElementById('funcionario-telefone').value.trim(), funcao:document.getElementById('funcionario-funcao').value.trim(), salarioBase:Number(document.getElementById('funcionario-salario-base') ? document.getElementById('funcionario-salario-base').value || 0 : 0), rg:(document.getElementById('funcionario-rg')?document.getElementById('funcionario-rg').value.trim():''), dataAdmissao:(document.getElementById('funcionario-data-admissao')?document.getElementById('funcionario-data-admissao').value:''), tipoContrato:(document.getElementById('funcionario-tipo-contrato')?document.getElementById('funcionario-tipo-contrato').value:''), chavePix:(document.getElementById('funcionario-chave-pix')?document.getElementById('funcionario-chave-pix').value.trim():''), status:((document.getElementById('funcionario-status')?document.getElementById('funcionario-status').value:'ATIVO')||'ATIVO').toUpperCase(), updatedAt:new Date().toISOString() }; if(!obj.nome) return alert('Informe o nome do funcionário.'); const isNovo = !idVal; const tx=db.transaction('funcionarios','readwrite'); tx.objectStore('funcionarios').put(obj); await txToPromise(tx); if(isNovo){ await registrarEventoAuditoria('CADASTRO','Novo funcionário',`Nome: ${obj.nome}\nFunção: ${obj.funcao||'-'}\nSalário: ${moneyBR(obj.salarioBase)}`); } resetFuncionarioForm(); await renderFuncionarios(); }
async function editarFuncionario(id){ const x=await reqToPromise(getStore('funcionarios').get(id)); if(!x) return; document.getElementById('funcionario-id').value=x.id; document.getElementById('funcionario-nome').value=x.nome||''; document.getElementById('funcionario-cpf').value=x.cpf||''; document.getElementById('funcionario-telefone').value=x.telefone||''; document.getElementById('funcionario-funcao').value=x.funcao||''; if(document.getElementById('funcionario-salario-base')) document.getElementById('funcionario-salario-base').value=Number(x.salarioBase||0); if(document.getElementById('funcionario-rg')) document.getElementById('funcionario-rg').value=x.rg||''; if(document.getElementById('funcionario-data-admissao')) document.getElementById('funcionario-data-admissao').value=x.dataAdmissao||''; if(document.getElementById('funcionario-tipo-contrato')) document.getElementById('funcionario-tipo-contrato').value=x.tipoContrato||''; if(document.getElementById('funcionario-chave-pix')) document.getElementById('funcionario-chave-pix').value=x.chavePix||''; if(document.getElementById('funcionario-status')) document.getElementById('funcionario-status').value=funcionarioEstaAtivo(x)?'ATIVO':'INATIVO'; document.getElementById('btn-salvar-funcionario').textContent='Atualizar Funcionário'; }
async function excluirFuncionario(id){ const func=await reqToPromise(getStore('funcionarios').get(id)); if(!confirm(`Tem certeza que deseja excluir "${func.nome}"? Esta ação não pode ser desfeita.`)) return; const tx=db.transaction('funcionarios','readwrite'); tx.objectStore('funcionarios').delete(id); await txToPromise(tx); resetFuncionarioForm(); await renderFuncionarios(); }
async function renderFuncionarios(){ const items=await fetchAllSorted('funcionarios'); const todasFaltas=await reqToPromise(getStore('rh_faltas').getAll()); const faltasMap=new Map(); todasFaltas.forEach(f=>{const k=f.funcionarioId; faltasMap.set(k,(faltasMap.get(k)||0)+1);}); renderEntityList('funcionarios-lista','funcionarios-total',items,'Nenhum funcionário cadastrado ainda.', (x)=>{const qtdF=faltasMap.get(x.id)||0; const ativo=funcionarioEstaAtivo(x); return `<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(x.nome)} <span class="funcionario-status ${ativo?'funcionario-status-ativo':'funcionario-status-inativo'}">${ativo?'Ativo':'Inativo'}</span></h4><p class="entity-meta">${x.cpf?`CPF: ${esc(x.cpf)}<br>`:''}${x.rg?`RG: ${esc(x.rg)}<br>`:''}${x.telefone?`Telefone: ${esc(x.telefone)}<br>`:''}${x.funcao?`Função: ${esc(x.funcao)}<br>`:''}${x.tipoContrato?`Contrato: ${esc(x.tipoContrato)}<br>`:''}Salário Base: ${esc(moneyBR(x.salarioBase||0))}${x.dataAdmissao?`<br>Admissão: ${formatDateBR(x.dataAdmissao)}`:''}${x.chavePix?`<br>Pix: ${esc(x.chavePix)}`:''}${qtdF>0?`<br><strong style="color:#b91c1c;">Faltas registradas: ${qtdF}</strong>`:''}</p></div><div class="row-actions"><button class="btn-small js-edit" data-id="${x.id}" type="button">Editar</button><button class="btn-danger js-delete" data-id="${x.id}" type="button">Excluir</button></div></div></article>`;}, (list)=>{ list.querySelectorAll('.js-edit').forEach((b)=>b.addEventListener('click',()=>editarFuncionario(Number(b.dataset.id)))); list.querySelectorAll('.js-delete').forEach((b)=>b.addEventListener('click',()=>excluirFuncionario(Number(b.dataset.id)))); }); }

/* ========== FALTAS DE FUNCIONÁRIOS v2.8 ========== */
async function abrirPainelFaltas(funcId, funcNome){
  const panel = document.getElementById('faltas-panel-'+funcId);
  if(!panel) return;
  if(panel.style.display==='block'){ panel.style.display='none'; return; }
  panel.style.display='block';
  const hoje = new Date().toISOString().slice(0,10);
  panel.innerHTML = `<div style="margin-bottom:10px;"><strong>Lançar Falta — ${esc(funcNome)}</strong></div><div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;"><div class="field" style="flex:1;min-width:150px;"><label for="falta-data-${funcId}">Data da Falta</label><input id="falta-data-${funcId}" type="date" value="${hoje}" style="width:100%;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px;" /></div><button class="btn-primary btn-small js-salvar-falta" data-id="${funcId}" data-nome="${esc(funcNome)}" type="button" style="height:36px;">Registrar Falta</button></div><div id="faltas-lista-${funcId}" style="margin-top:10px;"><div class="empty-list">Carregando...</div></div>`;
  panel.querySelector('.js-salvar-falta').addEventListener('click', async()=>{
    const dataFalta = document.getElementById('falta-data-'+funcId).value;
    if(!dataFalta) return alert('Informe a data da falta.');
    await salvarFalta(funcId, funcNome, dataFalta);
  });
  await renderFaltasPainel(funcId);
}
async function salvarFalta(funcId, funcNome, dataFalta){
  const todasFaltas = await reqToPromise(getStore('rh_faltas').getAll());
  const duplicada = todasFaltas.find(f => f.funcionarioId===funcId && f.data===dataFalta);
  if(duplicada) return alert('Já existe uma falta registrada para este funcionário nesta data.');
  const obj = { id:idGen(), funcionarioId:funcId, funcionarioNome:funcNome, data:dataFalta, criadoEm:new Date().toISOString() };
  const tx = db.transaction('rh_faltas','readwrite');
  tx.objectStore('rh_faltas').put(obj);
  await txToPromise(tx);
  await renderFaltasPainel(funcId);
  await renderFuncionarios();
  const panel = document.getElementById('faltas-panel-'+funcId);
  if(panel) panel.style.display='block';
  await renderFaltasPainel(funcId);
}
async function excluirFalta(faltaId, funcId){
  if(!confirm('Deseja excluir esta falta?')) return;
  const tx = db.transaction('rh_faltas','readwrite');
  tx.objectStore('rh_faltas').delete(faltaId);
  await txToPromise(tx);
  await renderFaltasPainel(funcId);
  await renderFuncionarios();
  const panel = document.getElementById('faltas-panel-'+funcId);
  if(panel) panel.style.display='block';
  await renderFaltasPainel(funcId);
}
async function renderFaltasPainel(funcId){
  const container = document.getElementById('faltas-lista-'+funcId);
  if(!container) return;
  const todasFaltas = await reqToPromise(getStore('rh_faltas').getAll());
  const faltas = todasFaltas.filter(f=>f.funcionarioId===funcId).sort((a,b)=>b.data.localeCompare(a.data));
  if(!faltas.length){ container.innerHTML='<div class="empty-list" style="font-size:0.85rem;">Nenhuma falta registrada.</div>'; return; }
  container.innerHTML = faltas.map(f=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #fde68a;font-size:0.88rem;"><span>${formatDateBR(f.data)}</span><button class="btn-danger btn-small js-excluir-falta" data-id="${f.id}" data-func="${funcId}" type="button" style="padding:2px 8px;font-size:0.78rem;">Excluir</button></div>`).join('');
  container.querySelectorAll('.js-excluir-falta').forEach(b=>b.addEventListener('click',()=>excluirFalta(Number(b.dataset.id),Number(b.dataset.func))));
}
/* ========== MODAL DE FALTAS v2.8.1 ========== */
async function abrirModalFaltas(){
  const modal = document.getElementById('modal-faltas');
  if(!modal) return;
  const sel = document.getElementById('modal-falta-funcionario');
  const funcs = (await fetchAllSorted('funcionarios')).filter(funcionarioEstaAtivo);
  sel.innerHTML = '<option value="">Selecione o funcion\u00e1rio...</option>' + funcs.map(f=>`<option value="${f.id}">${esc(f.nome)}</option>`).join('');
  document.getElementById('modal-falta-data').value = new Date().toISOString().slice(0,10);
  await renderUltimasFaltasModal();
  modal.style.display='flex';
}

async function confirmarFaltaModal(){
  const funcId = Number(document.getElementById('modal-falta-funcionario').value);
  if(!funcId) return alert('Selecione um funcion\u00e1rio.');
  const funcNome = document.getElementById('modal-falta-funcionario').selectedOptions[0].textContent;
  const dataFalta = document.getElementById('modal-falta-data').value;
  if(!dataFalta) return alert('Informe a data da falta.');
  await salvarFalta(funcId, funcNome, dataFalta);
  await renderUltimasFaltasModal();
  alert('Falta registrada com sucesso!');
}
async function renderUltimasFaltasModal(){
  const container = document.getElementById('modal-faltas-ultimas');
  if(!container) return;
  const todasFaltas = await reqToPromise(getStore('rh_faltas').getAll());
  const ultimas = todasFaltas.sort((a,b)=>(b.criadoEm||'').localeCompare(a.criadoEm||'')).slice(0,5);
  if(!ultimas.length){ container.innerHTML='<div class="empty-list" style="font-size:0.85rem;">Nenhuma falta registrada.</div>'; return; }
  container.innerHTML = ultimas.map(f=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #fde68a;"><span><strong>${esc(f.funcionarioNome||'')}</strong> &mdash; ${formatDateBR(f.data)}</span><button class="btn-danger btn-small js-excluir-falta-modal" data-id="${f.id}" data-func="${f.funcionarioId}" type="button" style="padding:2px 8px;font-size:0.78rem;">Excluir</button></div>`).join('');
  container.querySelectorAll('.js-excluir-falta-modal').forEach(b=>b.addEventListener('click', async()=>{ await excluirFalta(Number(b.dataset.id), Number(b.dataset.func)); await renderUltimasFaltasModal(); }));
}

async function contarFaltasMes(funcId, mes, ano){
  const prefix = `${ano}-${String(mes).padStart(2,'0')}`;
  const todasFaltas = await reqToPromise(getStore('rh_faltas').getAll());
  return todasFaltas.filter(f=>f.funcionarioId===funcId && f.data && f.data.startsWith(prefix)).length;
}
function calcularDescontoFaltas(salarioBase, qtdFaltas){
  if(!qtdFaltas || qtdFaltas<=0) return 0;
  return (salarioBase / 30) * qtdFaltas;
}

/* ========== LICENÇAS / AFASTAMENTOS v3.4 ========== */
async function contarDiasLicencaMes(funcId, mes, ano){
  /* Retorna quantidade de dias de licença que caem no mês/ano informado */
  const todasLicencas = await reqToPromise(getStore('rh_licencas').getAll());
  const licFuncionario = todasLicencas.filter(l => l.funcionarioId === funcId);
  const primeiroDia = new Date(`${ano}-${String(mes).padStart(2,'0')}-01`);
  const ultimoDia = new Date(Number(ano), Number(mes), 0); /* ultimo dia do mes */
  let totalDias = 0;
  licFuncionario.forEach(lic => {
    const inicio = new Date(lic.dataInicio + 'T00:00:00');
    const fim = new Date(lic.dataFim + 'T00:00:00');
    /* interseccão entre o período da licença e o mês */
    const efInicio = inicio < primeiroDia ? primeiroDia : inicio;
    const efFim = fim > ultimoDia ? ultimoDia : fim;
    if(efFim >= efInicio){
      const dias = Math.round((efFim - efInicio) / (1000*60*60*24)) + 1;
      totalDias += dias;
    }
  });
  return totalDias;
}
function calcularDescontoLicenca(salarioBase, diasLicenca){
  if(!diasLicenca || diasLicenca <= 0) return 0;
  return (salarioBase / 30) * diasLicenca;
}
async function salvarLicenca(){
  const funcId = Number(document.getElementById('lic-funcionario-id')?.value);
  const funcNome = document.getElementById('lic-funcionario-nome')?.value?.trim();
  const dataInicio = document.getElementById('lic-data-inicio')?.value;
  const dataFim = document.getElementById('lic-data-fim')?.value;
  const tipo = document.getElementById('lic-tipo')?.value;
  const observacao = document.getElementById('lic-observacao')?.value?.trim()||'';
  if(!funcId) return alert('Selecione o funcionário.');
  if(!dataInicio || !dataFim) return alert('Informe as datas de início e fim.');
  if(dataFim < dataInicio) return alert('A data final não pode ser menor que a data inicial.');
  /* verificar duplicata exata */
  const todas = await reqToPromise(getStore('rh_licencas').getAll());
  const duplicata = todas.find(l => l.funcionarioId===funcId && l.dataInicio===dataInicio && l.dataFim===dataFim && l.tipo===tipo);
  if(duplicata) return alert('Já existe uma licença idêntica registrada para este funcionário neste período.');
  const obj = { id:idGen(), funcionarioId:funcId, funcionarioNome:funcNome, dataInicio, dataFim, tipo, observacao, criadoEm:new Date().toISOString() };
  const tx = db.transaction('rh_licencas','readwrite');
  tx.objectStore('rh_licencas').put(obj);
  await txToPromise(tx);
  fecharModalLicenca();
  await renderLicencasRecentes();
  /* se funcionario estiver selecionado na folha, recalcular */
  const folhaFuncId = Number(document.getElementById('folha-funcionario-id')?.value);
  if(folhaFuncId && folhaFuncId === funcId) await recalcularLicencaFolha();
  alert(`Licença registrada com sucesso!`);
}
async function excluirLicenca(id){
  if(!confirm('Excluir esta licença?')) return;
  const tx = db.transaction('rh_licencas','readwrite');
  tx.objectStore('rh_licencas').delete(Number(id));
  await txToPromise(tx);
  await renderLicencasRecentes();
}
async function renderLicencasRecentes(){
  const el = document.getElementById('licencas-recentes-lista');
  if(!el) return;
  const todas = await reqToPromise(getStore('rh_licencas').getAll());
  const ordenadas = todas.sort((a,b)=>b.criadoEm.localeCompare(a.criadoEm)).slice(0,15);
  if(!ordenadas.length){ el.innerHTML='<p style="color:#6b7280;font-size:0.85rem;">Nenhuma licença registrada.</p>'; return; }
  el.innerHTML = ordenadas.map(l=>{
    const inicio = formatDateBR ? formatDateBR(l.dataInicio) : l.dataInicio;
    const fim = formatDateBR ? formatDateBR(l.dataFim) : l.dataFim;
    const dias = Math.round((new Date(l.dataFim+'T00:00:00') - new Date(l.dataInicio+'T00:00:00'))/(1000*60*60*24))+1;
    return `<article class="entity-item" style="border-left:4px solid #f59e0b;">
      <div class="row-head">
        <div>
          <h4 class="entity-name">${esc(l.funcionarioNome)}</h4>
          <p class="entity-meta">${esc(l.tipo)} &bull; ${inicio} a ${fim} (${dias} dia${dias>1?'s':''})${l.observacao?` &bull; ${esc(l.observacao)}`:''}</p>
        </div>
        <button class="btn-danger" type="button" data-id="${l.id}" onclick="excluirLicenca(${l.id})" style="font-size:0.78rem;padding:6px 10px;">Excluir</button>
      </div>
    </article>`;
  }).join('');
}
function abrirModalLicenca(){
  const modal = document.getElementById('modal-licenca');
  if(modal) modal.style.display='flex';
  /* popular select de funcionarios */
  const sel = document.getElementById('lic-funcionario-id');
  if(sel){
    reqToPromise(getStore('funcionarios').getAll()).then(funcs=>{
      sel.innerHTML = '<option value="">Selecione</option>' + funcs.filter(funcionarioEstaAtivo).sort((a,b)=>a.nome.localeCompare(b.nome)).map(f=>`<option value="${f.id}" data-nome="${esc(f.nome)}">${esc(f.nome)}</option>`).join('');
    });
  }
}
function fecharModalLicenca(){
  const modal = document.getElementById('modal-licenca');
  if(modal) modal.style.display='none';
  const form = document.getElementById('licenca-form');
  if(form) form.reset();
}
async function recalcularLicencaFolha(){
  const funcId = Number(document.getElementById('folha-funcionario-id')?.value);
  if(!funcId) return;
  const salBase = Number(document.getElementById('folha-salario-base')?.value||0);
  const mesRef = document.getElementById('folha-mes-referencia')?.value;
  const anoRef = document.getElementById('folha-ano-referencia')?.value;
  if(!mesRef || !anoRef) return;
  const diasLic = await contarDiasLicencaMes(funcId, mesRef, anoRef);
  const descLic = calcularDescontoLicenca(salBase, diasLic);
  const elDias = document.getElementById('folha-licenca-dias');
  const elDesc = document.getElementById('folha-licenca-desconto');
  if(elDias) elDias.value = diasLic;
  if(elDesc) elDesc.value = descLic.toFixed(2);
  /* atualizar total de descontos */
  const totalVales = Number(document.getElementById('folha-vales-pendentes')?.value||0);
  const descontoFaltas = Number(document.getElementById('folha-faltas-desconto')?.value||0);
  document.getElementById('folha-descontos').value = (totalVales + descontoFaltas + descLic).toFixed(2);
  calcularFolhaTotal();
  /* status mes inteiro */
  const diasNoMes = new Date(Number(anoRef), Number(mesRef), 0).getDate();
  const statusEl = document.getElementById('folha-licenca-status');
  if(statusEl){
    if(diasLic >= diasNoMes){
      statusEl.textContent = '⚠️ Em licença no mês inteiro — valor a pagar: R$ 0,00';
      statusEl.style.display = 'block';
      document.getElementById('folha-total').value = '0.00';
    } else if(diasLic > 0){
      statusEl.textContent = `📅 ${diasLic} dia(s) de licença neste mês — desconto: ${moneyBR(descLic)}`;
      statusEl.style.display = 'block';
    } else {
      statusEl.style.display = 'none';
    }
  }
}
function setupLicencasListeners(){
  const btnLancar = document.getElementById('btn-lancar-licenca');
  if(btnLancar) btnLancar.addEventListener('click', abrirModalLicenca);
  const btnFechar = document.getElementById('btn-fechar-modal-licenca');
  if(btnFechar) btnFechar.addEventListener('click', fecharModalLicenca);
  const overlay = document.getElementById('modal-licenca');
  if(overlay) overlay.addEventListener('click', (e)=>{ if(e.target===overlay) fecharModalLicenca(); });
  const btnSalvar = document.getElementById('btn-salvar-licenca');
  if(btnSalvar) btnSalvar.addEventListener('click', salvarLicenca);
  const selFunc = document.getElementById('lic-funcionario-id');
  if(selFunc) selFunc.addEventListener('change', ()=>{
    const opt = selFunc.options[selFunc.selectedIndex];
    const nomeEl = document.getElementById('lic-funcionario-nome');
    if(nomeEl) nomeEl.value = opt ? opt.dataset.nome||opt.text : '';
  });
}

/* ========== FORNECEDORES ========== */
function resetFornecedorForm(){ const f=document.getElementById('fornecedor-form'); if(f) f.reset(); document.getElementById('fornecedor-id').value=''; document.getElementById('btn-salvar-fornecedor').textContent='Salvar Fornecedor'; }
async function salvarFornecedor(event){ event.preventDefault(); const idVal=document.getElementById('fornecedor-id').value.trim(); const obj={ id:idVal?Number(idVal):idGen(), nome:document.getElementById('fornecedor-nome').value.trim(), documento:document.getElementById('fornecedor-documento').value.trim(), telefone:document.getElementById('fornecedor-telefone').value.trim(), cidade:document.getElementById('fornecedor-cidade').value.trim(), endereco:(document.getElementById('fornecedor-endereco')?document.getElementById('fornecedor-endereco').value.trim():''), email:(document.getElementById('fornecedor-email')?document.getElementById('fornecedor-email').value.trim():''), observacao:(document.getElementById('fornecedor-observacao')?document.getElementById('fornecedor-observacao').value.trim():''), updatedAt:new Date().toISOString() }; if(!obj.nome) return alert('Informe o nome do fornecedor.'); const tx=db.transaction('fornecedores','readwrite'); tx.objectStore('fornecedores').put(obj); await txToPromise(tx); resetFornecedorForm(); await renderFornecedores(); await carregarFornecedoresCompra(); }
async function editarFornecedor(id){ const x=await reqToPromise(getStore('fornecedores').get(id)); if(!x) return; document.getElementById('fornecedor-id').value=x.id; document.getElementById('fornecedor-nome').value=x.nome||''; document.getElementById('fornecedor-documento').value=x.documento||''; document.getElementById('fornecedor-telefone').value=x.telefone||''; document.getElementById('fornecedor-cidade').value=x.cidade||''; if(document.getElementById('fornecedor-endereco')) document.getElementById('fornecedor-endereco').value=x.endereco||''; if(document.getElementById('fornecedor-email')) document.getElementById('fornecedor-email').value=x.email||''; if(document.getElementById('fornecedor-observacao')) document.getElementById('fornecedor-observacao').value=x.observacao||''; document.getElementById('btn-salvar-fornecedor').textContent='Atualizar Fornecedor'; }
async function excluirFornecedor(id){ const forn=await reqToPromise(getStore('fornecedores').get(id)); if(!confirm(`Tem certeza que deseja excluir "${forn.nome}"? Esta ação não pode ser desfeita.`)) return; const tx=db.transaction('fornecedores','readwrite'); tx.objectStore('fornecedores').delete(id); await txToPromise(tx); resetFornecedorForm(); await renderFornecedores(); await carregarFornecedoresCompra(); }
async function renderFornecedores(){ const items=await fetchAllSorted('fornecedores'); renderEntityList('fornecedores-lista','fornecedores-total',items,'Nenhum fornecedor cadastrado ainda.', (x)=>`<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(x.nome)}</h4><p class="entity-meta">${x.documento?`CNPJ/CPF: ${esc(x.documento)}<br>`:''}${x.telefone?`Telefone: ${esc(x.telefone)}<br>`:''}${x.cidade?`Cidade: ${esc(x.cidade)}<br>`:''}${x.endereco?`Endereço: ${esc(x.endereco)}<br>`:''}${x.email?`E-mail: ${esc(x.email)}<br>`:''}${x.observacao?`Obs: ${esc(x.observacao)}`:''}</p></div>${actionButtons(x.id)}</div></article>`, (list)=>{ list.querySelectorAll('.js-edit').forEach((b)=>b.addEventListener('click',()=>editarFornecedor(Number(b.dataset.id)))); list.querySelectorAll('.js-delete').forEach((b)=>b.addEventListener('click',()=>excluirFornecedor(Number(b.dataset.id)))); }); }

/* ========== INSUMOS ========== */
function resetInsumoForm(){ const f=document.getElementById('insumo-form'); if(f) f.reset(); document.getElementById('insumo-id').value=''; document.getElementById('insumo-estoque-inicial').value='0'; document.getElementById('btn-salvar-insumo').textContent='Salvar Insumo'; }
async function salvarInsumo(event){ event.preventDefault(); const idVal=document.getElementById('insumo-id').value.trim(); const nome=document.getElementById('insumo-nome').value.trim(); const estoqueInicial=Number(document.getElementById('insumo-estoque-inicial').value||0); if(!nome) return alert('Informe o nome do insumo.'); const original=idVal?await reqToPromise(getStore('insumos').get(Number(idVal))):null; const isNovo = !idVal; const obj={ id:idVal?Number(idVal):idGen(), nome, estoqueInicial, estoqueAtual:original?currentStock(original):estoqueInicial, estoqueMinimo:Number(document.getElementById('insumo-estoque-minimo')?document.getElementById('insumo-estoque-minimo').value||0:0), observacao:(document.getElementById('insumo-observacao')?document.getElementById('insumo-observacao').value.trim():''), updatedAt:new Date().toISOString() }; const tx=db.transaction('insumos','readwrite'); tx.objectStore('insumos').put(obj); await txToPromise(tx); if(isNovo){ await registrarEventoAuditoria('CADASTRO','Novo insumo cadastrado',`Insumo: ${obj.nome}\nEstoque inicial: ${obj.estoqueInicial}`); } resetInsumoForm(); await renderInsumos(); await carregarProdutoSelect(); await carregarItensCompra(); await renderProdutos(); }
async function editarInsumo(id){ const x=await reqToPromise(getStore('insumos').get(id)); if(!x) return; document.getElementById('insumo-id').value=x.id; document.getElementById('insumo-nome').value=x.nome||''; document.getElementById('insumo-estoque-inicial').value=Number(x.estoqueInicial||0); if(document.getElementById('insumo-estoque-minimo')) document.getElementById('insumo-estoque-minimo').value=Number(x.estoqueMinimo||0); if(document.getElementById('insumo-observacao')) document.getElementById('insumo-observacao').value=x.observacao||''; document.getElementById('btn-salvar-insumo').textContent='Atualizar Insumo'; }
async function excluirInsumo(id){ const ins=await reqToPromise(getStore('insumos').get(id)); if(!confirm(`Tem certeza que deseja excluir "${ins.nome}"? Esta ação não pode ser desfeita.`)) return; const tx=db.transaction('insumos','readwrite'); tx.objectStore('insumos').delete(id); await txToPromise(tx); resetInsumoForm(); await renderInsumos(); await carregarProdutoSelect(); await carregarItensCompra(); await renderProdutos(); }
async function renderInsumos(){ const items=await fetchAllSorted('insumos'); renderEntityList('insumos-lista','insumos-total',items,'Nenhum insumo cadastrado ainda.', (x)=>`<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(x.nome)}</h4><p class="entity-meta">Saldo Atual: ${esc(String(currentStock(x)))}${x.estoqueMinimo?` | Mín: ${x.estoqueMinimo}`:''}${x.observacao?`<br>Obs: ${esc(x.observacao)}`:''}</p></div>${actionButtons(x.id)}</div></article>`, (list)=>{ list.querySelectorAll('.js-edit').forEach((b)=>b.addEventListener('click',()=>editarInsumo(Number(b.dataset.id)))); list.querySelectorAll('.js-delete').forEach((b)=>b.addEventListener('click',()=>excluirInsumo(Number(b.dataset.id)))); }); }

/* ========== TIPOS DE CUSTOS ========== */
function resetTipoCustoForm(){ const f=document.getElementById('tipo-custo-form'); if(f) f.reset(); document.getElementById('tipo-custo-id').value=''; document.getElementById('btn-salvar-tipo-custo').textContent='Salvar Tipo'; }
async function salvarTipoCusto(event){ event.preventDefault(); const idVal=document.getElementById('tipo-custo-id').value.trim(); const obj={ id:idVal?Number(idVal):idGen(), nome:document.getElementById('tipo-custo-nome').value.trim(), observacao:document.getElementById('tipo-custo-observacao').value.trim(), updatedAt:new Date().toISOString() }; if(!obj.nome) return alert('Informe o nome do tipo de custo.'); const tx=db.transaction('tipos_custos','readwrite'); tx.objectStore('tipos_custos').put(obj); await txToPromise(tx); resetTipoCustoForm(); await renderTiposCustos(); }
async function editarTipoCusto(id){ const x=await reqToPromise(getStore('tipos_custos').get(id)); if(!x) return; document.getElementById('tipo-custo-id').value=x.id; document.getElementById('tipo-custo-nome').value=x.nome||''; document.getElementById('tipo-custo-observacao').value=x.observacao||''; document.getElementById('btn-salvar-tipo-custo').textContent='Atualizar Tipo'; }
async function excluirTipoCusto(id){ const tipo=await reqToPromise(getStore('tipos_custos').get(id)); if(!confirm(`Tem certeza que deseja excluir "${tipo.nome}"? Esta ação não pode ser desfeita.`)) return; const tx=db.transaction('tipos_custos','readwrite'); tx.objectStore('tipos_custos').delete(id); await txToPromise(tx); resetTipoCustoForm(); await renderTiposCustos(); }
async function renderTiposCustos(){ const items=await fetchAllSorted('tipos_custos'); renderEntityList('tipos-custos-lista','tipos-custos-total',items,'Nenhum tipo de custo cadastrado ainda.', (x)=>`<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(x.nome)}</h4><p class="entity-meta">${x.observacao?esc(x.observacao):'Sem observação.'}</p></div>${actionButtons(x.id)}</div></article>`, (list)=>{ list.querySelectorAll('.js-edit').forEach((b)=>b.addEventListener('click',()=>editarTipoCusto(Number(b.dataset.id)))); list.querySelectorAll('.js-delete').forEach((b)=>b.addEventListener('click',()=>excluirTipoCusto(Number(b.dataset.id)))); }); }

/* ========== CIDADES ========== */
function resetCidadeForm(){ const f=document.getElementById('cidade-form'); if(f) f.reset(); document.getElementById('cidade-id').value=''; document.getElementById('cidade-estado').value='CE'; document.getElementById('btn-salvar-cidade').textContent='Salvar Cidade'; }
async function salvarCidade(event){
  event.preventDefault();
  const idVal=document.getElementById('cidade-id').value.trim();
  const obj={ id:idVal?Number(idVal):idGen(), nome:document.getElementById('cidade-nome').value.trim(), estado:document.getElementById('cidade-estado').value.trim()||'CE', criadoEm:new Date().toISOString() };
  if(!obj.nome) return alert('Informe o nome da cidade.');
  const tx=db.transaction('cidades','readwrite');
  tx.objectStore('cidades').put(obj);
  await txToPromise(tx);
  resetCidadeForm(); await renderCidades(); await carregarCidadesSelect();
}
async function editarCidade(id){ const x=await reqToPromise(getStore('cidades').get(id)); if(!x) return; document.getElementById('cidade-id').value=x.id; document.getElementById('cidade-nome').value=x.nome||''; document.getElementById('cidade-estado').value=x.estado||'CE'; document.getElementById('btn-salvar-cidade').textContent='Atualizar Cidade'; }
async function excluirCidade(id){ const c=await reqToPromise(getStore('cidades').get(id)); if(!confirm(`Tem certeza que deseja excluir "${c.nome}"? Esta ação não pode ser desfeita.`)) return; const tx=db.transaction('cidades','readwrite'); tx.objectStore('cidades').delete(id); await txToPromise(tx); resetCidadeForm(); await renderCidades(); await carregarCidadesSelect(); }
async function renderCidades(){
  const items=await fetchAllSorted('cidades');
  renderEntityList('cidades-lista','cidades-total',items,'Nenhuma cidade cadastrada ainda.',
    (x)=>`<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(x.nome)}</h4><p class="entity-meta">Estado: ${esc(x.estado||'CE')}</p></div>${actionButtons(x.id)}</div></article>`,
    (list)=>{ list.querySelectorAll('.js-edit').forEach((b)=>b.addEventListener('click',()=>editarCidade(Number(b.dataset.id)))); list.querySelectorAll('.js-delete').forEach((b)=>b.addEventListener('click',()=>excluirCidade(Number(b.dataset.id)))); }
  );
}
async function carregarCidadesSelect(){
  const cidades=await fetchAllSorted('cidades');
  /* Popula todos os selects de cidade na página */
  document.querySelectorAll('.cidade-select').forEach((sel)=>{
    const valorAtual=sel.value;
    sel.innerHTML='<option value="">Selecione a Cidade</option>';
    cidades.forEach((c)=>{ const o=document.createElement('option'); o.value=c.nome; o.textContent=`${c.nome} - ${c.estado}`; sel.appendChild(o); });
    if(valorAtual) sel.value=valorAtual;
  });
}

/* ========== PRODUTOS ========== */
function resetProdutoForm(){ const f=document.getElementById('produto-form'); if(f) f.reset(); document.getElementById('produto-id').value=''; document.getElementById('produto-estoque-inicial').value='0'; document.getElementById('produto-preco-venda').value='0'; document.getElementById('btn-salvar-produto').textContent='Salvar Produto'; document.getElementById('ficha-tecnica-lista').innerHTML=''; adicionarLinhaFichaTecnica(); }
async function montarSelectInsumos(selectEl, selectedId=''){ const insumos=await fetchAllSorted('insumos'); selectEl.innerHTML='<option value="">Selecione o insumo</option>'; insumos.forEach((i)=>{ const o=document.createElement('option'); o.value=String(i.id); o.textContent=i.nome; if(String(i.id)===String(selectedId)) o.selected=true; selectEl.appendChild(o); }); }
function adicionarLinhaFichaTecnica(){ const container=document.getElementById('ficha-tecnica-lista'); if(!container) return; const row=document.createElement('div'); row.className='recipe-row'; row.innerHTML=`<select class="insumo-select"><option value="">Selecione insumo</option></select><input type="number" class="insumo-qtd" min="0.01" step="0.01" placeholder="Qtd" /><button type="button" class="btn-small btn-danger js-remove-linha">Remover</button>`; container.appendChild(row); montarSelectInsumos(row.querySelector('.insumo-select')); row.querySelector('.js-remove-linha').addEventListener('click',(e)=>{ e.preventDefault(); row.remove(); }); }
async function salvarProduto(event){ event.preventDefault(); const idVal=document.getElementById('produto-id').value.trim(); const nome=document.getElementById('produto-nome').value.trim(); const estoqueInicial=Number(document.getElementById('produto-estoque-inicial').value||0); const precoVenda=Number(document.getElementById('produto-preco-venda').value||0); if(!nome) return alert('Informe o nome do produto.'); const original=idVal?await reqToPromise(getStore('produtos').get(Number(idVal))):null; const isNovo = !idVal; const obj={ id:idVal?Number(idVal):idGen(), nome, estoqueInicial, estoqueAtual:original?currentStock(original):estoqueInicial, precoVenda, codigo:(document.getElementById('produto-codigo')?document.getElementById('produto-codigo').value.trim():''), estoqueMinimo:Number(document.getElementById('produto-estoque-minimo')?document.getElementById('produto-estoque-minimo').value||0:0), observacao:(document.getElementById('produto-observacao')?document.getElementById('produto-observacao').value.trim():''), updatedAt:new Date().toISOString() }; const linhas=document.querySelectorAll('#ficha-tecnica-lista .recipe-row'); const receita=[]; linhas.forEach((linha)=>{ const insumoId=Number(linha.querySelector('.insumo-select').value); const qtd=Number(linha.querySelector('.insumo-qtd').value||0); if(insumoId && qtd>0) receita.push({insumoId, quantidade:qtd}); }); obj.receita=receita; const tx=db.transaction('produtos','readwrite'); tx.objectStore('produtos').put(obj); await txToPromise(tx); if(isNovo){ await registrarEventoAuditoria('CADASTRO','Novo produto cadastrado',`Produto: ${obj.nome}\nPreço: ${moneyBR(obj.precoVenda)}`); } resetProdutoForm(); await renderProdutos(); await carregarProdutoSelect(); await carregarProdutosVenda(); }
async function editarProduto(id){ const x=await reqToPromise(getStore('produtos').get(id)); if(!x) return; document.getElementById('produto-id').value=x.id; document.getElementById('produto-nome').value=x.nome||''; document.getElementById('produto-estoque-inicial').value=Number(x.estoqueInicial||0); document.getElementById('produto-preco-venda').value=Number(x.precoVenda||0); if(document.getElementById('produto-codigo')) document.getElementById('produto-codigo').value=x.codigo||''; if(document.getElementById('produto-estoque-minimo')) document.getElementById('produto-estoque-minimo').value=Number(x.estoqueMinimo||0); if(document.getElementById('produto-observacao')) document.getElementById('produto-observacao').value=x.observacao||''; document.getElementById('btn-salvar-produto').textContent='Atualizar Produto'; const container=document.getElementById('ficha-tecnica-lista'); container.innerHTML=''; (x.receita||[]).forEach((r)=>{ const row=document.createElement('div'); row.className='recipe-row'; row.innerHTML=`<select class="insumo-select"><option value="">Selecione insumo</option></select><input type="number" class="insumo-qtd" min="0.01" step="0.01" placeholder="Qtd" /><button type="button" class="btn-small btn-danger js-remove-linha">Remover</button>`; container.appendChild(row); montarSelectInsumos(row.querySelector('.insumo-select'), r.insumoId); row.querySelector('.insumo-qtd').value=r.quantidade; row.querySelector('.js-remove-linha').addEventListener('click',(e)=>{ e.preventDefault(); row.remove(); }); }); adicionarLinhaFichaTecnica(); }
async function excluirProduto(id){ const prod=await reqToPromise(getStore('produtos').get(id)); if(!confirm(`Tem certeza que deseja excluir "${prod.nome}"? Esta ação não pode ser desfeita.`)) return; const tx=db.transaction('produtos','readwrite'); tx.objectStore('produtos').delete(id); await txToPromise(tx); resetProdutoForm(); document.getElementById('produto-detalhe').innerHTML='Clique em um produto para visualizar os insumos vinculados.'; await renderProdutos(); await carregarProdutoSelect(); await carregarItensCompra(); await carregarProdutosVenda(); await refreshProducaoMetricas(); }
async function renderProdutos(){ const items=await fetchAllSorted('produtos'); renderEntityList('produtos-lista','produtos-total',items,'Nenhum produto cadastrado ainda.', (x)=>`<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(x.nome)}</h4><p class="entity-meta">${x.codigo?`Cód: ${esc(x.codigo)} | `:''}Estoque: ${esc(String(currentStock(x)))}${x.estoqueMinimo?` | Mín: ${x.estoqueMinimo}`:''}<br>Preço de Venda: ${esc(moneyBR(x.precoVenda||0))}${x.observacao?`<br>Obs: ${esc(x.observacao)}`:''}</p></div><button class="btn-small js-view-receita" data-id="${x.id}" type="button">Ver Receita</button>${actionButtons(x.id)}</div></article>`, (list)=>{ list.querySelectorAll('.js-edit').forEach((b)=>b.addEventListener('click',()=>editarProduto(Number(b.dataset.id)))); list.querySelectorAll('.js-delete').forEach((b)=>b.addEventListener('click',()=>excluirProduto(Number(b.dataset.id)))); list.querySelectorAll('.js-view-receita').forEach((b)=>b.addEventListener('click',async()=>{ const prod=await reqToPromise(getStore('produtos').get(Number(b.dataset.id))); if(!prod) return; let html='<strong>'+esc(prod.nome)+'</strong><br>'; if(prod.receita && prod.receita.length>0){ const insumos=await fetchAllSorted('insumos'); const mapaIns=new Map(insumos.map(i=>[i.id, i.nome])); prod.receita.forEach((r)=>{ html+=`• ${esc(mapaIns.get(r.insumoId)||'Insumo removido')} x ${r.quantidade}<br>`; }); } else { html+='Sem insumos vinculados.'; } document.getElementById('produto-detalhe').innerHTML=html; })); }); }

/* ========== VENDAS — SISTEMA DE 4 GAVETAS ========== */
async function carregarClientesVenda(){ const sel=document.getElementById('venda-cliente-id'); if(!sel) return; const items=await fetchAllSorted('clientes'); sel.innerHTML='<option value="">Selecione</option>'; items.forEach((c)=>{ const o=document.createElement('option'); o.value=String(c.id); o.textContent=c.nome; sel.appendChild(o); }); }
async function carregarProdutosVenda(){ const sel=document.getElementById('venda-produto-id'); if(!sel) return; const items=await fetchAllSorted('produtos'); sel.innerHTML='<option value="">Selecione</option>'; items.forEach((p)=>{ const o=document.createElement('option'); o.value=String(p.id); o.textContent=`${p.nome} (Estoque: ${currentStock(p)})`; sel.appendChild(o); }); }
function atualizarPrecoVenda(){ const sel=document.getElementById('venda-produto-id'); const precoEl=document.getElementById('venda-preco-unitario'); if(!sel||!precoEl) return; const prodId=Number(sel.value); if(!prodId){ precoEl.value='0'; return; } reqToPromise(getStore('produtos').get(prodId)).then((p)=>{ if(p) precoEl.value=Number(p.precoVenda||0); atualizarSubtotalItemVenda(); }); }
function atualizarSubtotalItemVenda(){ const qtd=Number(document.getElementById('venda-quantidade').value||0); const preco=Number(document.getElementById('venda-preco-unitario').value||0); document.getElementById('venda-subtotal-item').value=(qtd*preco).toFixed(2); }
async function atualizarLimiteDisponivel(){
  const clienteId=Number(document.getElementById('venda-cliente-id').value);
  const box=document.getElementById('venda-limite-box');
  const creditoBox=document.getElementById('venda-credito-cliente-box');
  const creditoValorEl=document.getElementById('venda-credito-valor');
  if(!clienteId){ box.textContent='Selecione um cliente'; if(creditoBox) creditoBox.classList.add('hidden'); return; }
  const reg=await reqToPromise(getStore('limites_credito').get(clienteId));
  const limite=Number(reg?.limite||0);
  const devedor=Number(reg?.saldoDevedor||0);
  const credito=Number(reg?.saldoCredito||0);
  box.textContent=`Limite: ${moneyBR(limite)} | Dívida: ${moneyBR(devedor)} | Disponível: ${moneyBR(limite-devedor)}`;
  /* Mostrar caixa de crédito se houver */
  if(creditoBox && creditoValorEl){
    if(credito > 0){
      creditoValorEl.textContent = moneyBR(credito);
      creditoBox.classList.remove('hidden');
      creditoBox.style.display='flex';
    } else {
      creditoBox.classList.add('hidden');
    }
  }
}
function validarLimiteVenda(){}
async function adicionarItemAoPedido(){ const prodId=Number(document.getElementById('venda-produto-id').value); const qtd=Number(document.getElementById('venda-quantidade').value||0); const preco=Number(document.getElementById('venda-preco-unitario').value||0); if(!prodId || qtd<=0 || preco<=0) return alert('Selecione um produto, quantidade e preço válidos.'); const prod=await reqToPromise(getStore('produtos').get(prodId)); if(!prod) return alert('Produto não encontrado.'); carrinho.push({produtoId:prodId, produtoNome:prod.nome, quantidade:qtd, precoUnitario:preco, subtotal:qtd*preco}); renderCarrinho(); document.getElementById('venda-produto-id').value=''; document.getElementById('venda-quantidade').value='1'; document.getElementById('venda-preco-unitario').value='0'; document.getElementById('venda-subtotal-item').value='0'; }
function renderCarrinho(){ const lista=document.getElementById('venda-carrinho-lista'); if(!lista) return; if(!carrinho.length){ lista.innerHTML='<div class="empty-list">Carrinho vazio.</div>'; document.getElementById('venda-total').value='0'; return; } let total=0; lista.innerHTML=carrinho.map((item,i)=>{ total+=item.subtotal; return `<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(item.produtoNome)}</h4><p class="entity-meta">Qtd: ${item.quantidade} x ${moneyBR(item.precoUnitario)} = ${moneyBR(item.subtotal)}</p></div><button class="btn-danger btn-small js-remove-carrinho" data-index="${i}" type="button">Remover</button></div></article>`; }).join(''); document.getElementById('venda-total').value=total.toFixed(2); lista.querySelectorAll('.js-remove-carrinho').forEach((b)=>b.addEventListener('click',()=>{ carrinho.splice(Number(b.dataset.index),1); renderCarrinho(); })); }
function resetVendaForm(){ const f=document.getElementById('venda-form'); if(f) f.reset(); document.getElementById('venda-id').value=''; document.getElementById('venda-total').value='0'; document.getElementById('venda-subtotal-item').value='0'; document.getElementById('venda-limite-box').textContent='Selecione um cliente'; document.getElementById('venda-alerta-credito').classList.add('hidden'); document.getElementById('venda-autorizacao-especial').checked=false; const cb=document.getElementById('venda-credito-cliente-box'); if(cb) cb.classList.add('hidden'); const tb=document.getElementById('venda-troco-box'); if(tb) tb.classList.add('hidden'); const vp=document.getElementById('venda-valor-pago'); if(vp) vp.value=''; carrinho=[]; renderCarrinho(); setTodayIfEmpty('venda-data'); }

async function salvarVenda(event){
  event.preventDefault();
  if(isProcessing) return; isProcessing=true;
  try{
    const clienteId=Number(document.getElementById('venda-cliente-id').value);
    const data=document.getElementById('venda-data').value;
    const formaPagamento=document.getElementById('venda-forma-pagamento').value;
    const total=Number(document.getElementById('venda-total').value||0);
    if(!clienteId||!data||!formaPagamento||total<=0||!carrinho.length) { isProcessing=false; return alert('Preencha todos os campos e adicione itens ao carrinho.'); }
    const cliente=await reqToPromise(getStore('clientes').get(clienteId));
    if(!cliente){ isProcessing=false; return alert('Cliente não encontrado.'); }
    const isPrazo = formaPagamento==='Prazo';

    /* === Valor pago e crédito === */
    const valorPagoInput = Number(document.getElementById('venda-valor-pago')?.value||0);
    const limiteReg=await reqToPromise(getStore('limites_credito').get(clienteId));
    const saldoDevedorAtual=Number(limiteReg?.saldoDevedor||0);
    const saldoCreditoAtual=Number(limiteReg?.saldoCredito||0);

    /* Valor efetivamente recebido = total da venda (para gaveta) */
    let valorEntradaCaixa = total;
    let novoCreditoGerado = 0;
    let creditoUsado = 0;

    if(!isPrazo){
      if(valorPagoInput > 0 && valorPagoInput > total){
        /* Cliente pagou mais: gera crédito */
        novoCreditoGerado = valorPagoInput - total;
        valorEntradaCaixa = valorPagoInput; /* entra o valor real pago */
      } else if(valorPagoInput > 0 && valorPagoInput < total){
        /* Pagou menos: usa crédito existente para completar, se houver */
        const diferenca = total - valorPagoInput;
        if(saldoCreditoAtual >= diferenca){
          creditoUsado = diferenca;
          valorEntradaCaixa = valorPagoInput;
        }
        /* se não houver crédito suficiente, usa total normal */
      }
    }

    /* === Gaveta de destino === */
    let gaveta = formaPagamento;

    const produtos=[];
    for(const item of carrinho){
      const p=await reqToPromise(getStore('produtos').get(item.produtoId));
      produtos.push(p);
    }

    /* === Transação de escrita === */
    const storesList=['vendas','produtos','movimentos_estoque','financeiro_lancamentos','limites_credito'];
    const tx=db.transaction(storesList,'readwrite');
    const vendaId=idGen();
    const vendaObj={
      id:vendaId, data, clienteId, clienteNome:cliente.nome, itens:[...carrinho], total,
      formaPagamento, gaveta,
      statusPagamento: isPrazo ? 'Em Aberto' : 'Recebido',
      saldoDevedor: isPrazo ? total : 0,
      valorRecebido: isPrazo ? 0 : total,
      valorPago: valorPagoInput||total,
      creditoGerado: novoCreditoGerado,
      creditoUsado,
      updatedAt:new Date().toISOString()
    };
    tx.objectStore('vendas').put(vendaObj);

    /* Baixa de estoque */
    carrinho.forEach((item,i)=>{
      const prod=produtos[i];
      if(prod){
        const novoEstoque=currentStock(prod)-item.quantidade;
        tx.objectStore('produtos').put({...prod, estoqueAtual:novoEstoque, updatedAt:new Date().toISOString()});
        tx.objectStore('movimentos_estoque').put({id:idGen(),tipo:'saida',itemTipo:'produto',itemId:prod.id,itemNome:prod.nome,quantidade:item.quantidade,data,origem:'venda',referenciaId:vendaId,updatedAt:new Date().toISOString()});
      }
    });

    /* Financeiro: entrada no caixa se à vista */
    if(!isPrazo){
      tx.objectStore('financeiro_lancamentos').put({
        id:idGen(), data, tipo:'entrada', valor:valorEntradaCaixa,
        descricao:`Venda: ${cliente.nome}${novoCreditoGerado>0?' (incl. crédito gerado)':''}${creditoUsado>0?' (crédito utilizado)':''}`,
        formaPagamento, gaveta,
        origem:'venda', referenciaId:vendaId, updatedAt:new Date().toISOString()
      });
    }

    /* Limites de crédito: aplicar saldo líquido - crédito abate dívida automaticamente */
    let novoSaldoCredito = saldoCreditoAtual + novoCreditoGerado - creditoUsado;
    let novoSaldoDevedor = saldoDevedorAtual + (isPrazo ? total : 0);
    /* Abatimento automático: se há crédito e dívida, compensar */
    if(novoSaldoCredito > 0 && novoSaldoDevedor > 0){
      const abatimento = Math.min(novoSaldoCredito, novoSaldoDevedor);
      novoSaldoCredito -= abatimento;
      novoSaldoDevedor -= abatimento;
    }
    novoSaldoCredito = Math.max(0, novoSaldoCredito);
    novoSaldoDevedor = Math.max(0, novoSaldoDevedor);
    if(isPrazo || novoCreditoGerado > 0 || creditoUsado > 0){
      tx.objectStore('limites_credito').put({
        id:clienteId, clienteId, clienteNome:cliente.nome,
        limite:Number(cliente.limiteCredito||0),
        saldoDevedor: novoSaldoDevedor,
        saldoCredito: novoSaldoCredito,
        updatedAt:new Date().toISOString()
      });
    }

    await txToPromise(tx);

    /* v2.9: Snapshot silencioso (caixa preta) */
    if(typeof BackupManager !== 'undefined') BackupManager.salvarSnapshot(db, 'venda_finalizada').catch(function(e){ console.error('[Snapshot] Erro após venda:', e); });

    /* Cupom de venda */
    exibirModalCupom(vendaObj);

    /* Notificação Telegram */
    const itensLinhas = carrinho.map(item => `  ${item.quantidade}x ${item.produtoNome} — ${moneyBR(item.precoUnitario)} (Total: ${moneyBR(item.quantidade * item.precoUnitario)})`).join('\n');
    let telegramExtra = '';
    if(novoCreditoGerado>0) telegramExtra += `\n💰 Crédito Gerado: ${moneyBR(novoCreditoGerado)}`;
    if(creditoUsado>0) telegramExtra += `\n💰 Crédito Usado: ${moneyBR(creditoUsado)}`;
    await registrarEventoAuditoria('VENDA','Venda realizada',`Cliente: ${cliente.nome}\nItens:\n${itensLinhas}\nTotal: ${moneyBR(total)}\nPagamento: ${formaPagamento}\nGaveta: ${gaveta}${telegramExtra}`);

    /* Refresh */
    await atualizarResumoFinanceiro(); await renderFinanceiro(); await renderVendas();
    await renderClientesDevedores(); await carregarProdutosVenda(); await renderEstoqueGeral();
    resetVendaForm();
  }catch(e){ console.error('Erro ao salvar venda:', e); alert('Erro ao salvar venda: '+e.message); }
  finally{ isProcessing=false; }
}

async function renderVendas(){
  const items=(await fetchAllSorted('vendas','data',true)).slice(0,10);
  renderEntityList('vendas-lista','vendas-total',items,'Nenhuma venda registrada.',
    (x)=>`<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(x.clienteNome)}</h4><p class="entity-meta">Data: ${formatDateBR(x.data)}<br>Total: ${moneyBR(x.total)} | ${x.formaPagamento}<br>Status: ${x.statusPagamento}</p></div><button class="btn-small js-view-venda" data-id="${x.id}" type="button">Ver Cupom</button></div></article>`,
    (list)=>{ list.querySelectorAll('.js-view-venda').forEach((b)=>b.addEventListener('click',async()=>{
      const v=await reqToPromise(getStore('vendas').get(Number(b.dataset.id)));
      if(!v) return;
      let html=`<strong>Cupom #${v.id}</strong><br>Data: ${formatDateBR(v.data)}<br>Cliente: ${esc(v.clienteNome)}<br>Pagamento: ${v.formaPagamento}<br><br>`;
      (v.itens||[]).forEach((it)=>{ html+=`${esc(it.produtoNome)} x ${it.quantidade} = ${moneyBR(it.subtotal)}<br>`; });
      html+=`<br><strong>TOTAL: ${moneyBR(v.total)}</strong>`;
      document.getElementById('venda-detalhe').innerHTML=html;
    })); }
  );
}

/* Cupom de venda + WhatsApp */
function gerarCupomTexto(venda){
  let cupom=`🧾 CUPOM DE VENDA\n━━━━━━━━━━━━━━━━━━\n`;
  cupom+=`Data: ${formatDateBR(venda.data)}\nCliente: ${venda.clienteNome}\n━━━━━━━━━━━━━━━━━━\n`;
  (venda.itens||[]).forEach((it)=>{ cupom+=`${it.produtoNome}\n  ${it.quantidade} x ${moneyBR(it.precoUnitario)} = ${moneyBR(it.subtotal)}\n`; });
  cupom+=`━━━━━━━━━━━━━━━━━━\nTOTAL: ${moneyBR(venda.total)}\nPagamento: ${venda.formaPagamento}\n━━━━━━━━━━━━━━━━━━\nIndAguaLirios v1.0.0`;
  return cupom;
}
function exibirModalCupom(venda){
  const cupomTexto=gerarCupomTexto(venda);
  const modal=document.createElement('div');
  modal.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML=`<div style="background:white;padding:24px;border-radius:16px;max-width:420px;width:90%;max-height:80vh;overflow-y:auto;"><pre style="white-space:pre-wrap;font-size:0.9rem;">${esc(cupomTexto)}</pre><div style="display:flex;gap:10px;margin-top:16px;"><button id="btn-cupom-whatsapp" class="btn-primary" style="flex:1;">Enviar WhatsApp</button><button id="btn-cupom-fechar" class="btn-secondary" style="flex:1;">Fechar</button></div></div>`;
  document.body.appendChild(modal);
  document.getElementById('btn-cupom-fechar').addEventListener('click',()=>modal.remove());
  document.getElementById('btn-cupom-whatsapp').addEventListener('click',()=>{ window.open(`https://wa.me/?text=${encodeURIComponent(cupomTexto)}`,'_blank'); });
}

/* ========== COMPRAS — COM CONTAS A PAGAR ========== */
async function carregarFornecedoresCompra(){ const sel=document.getElementById('compra-fornecedor-id'); if(!sel) return; const items=await fetchAllSorted('fornecedores'); sel.innerHTML='<option value="">Selecione</option>'; items.forEach((f)=>{ const o=document.createElement('option'); o.value=String(f.id); o.textContent=f.nome; sel.appendChild(o); }); }
async function carregarItensCompra(){ const sel=document.getElementById('compra-item-id'); if(!sel) return; const tipo=document.getElementById('compra-item-tipo').value; let items=[]; if(tipo==='produto') items=await fetchAllSorted('produtos'); else if(tipo==='insumo') items=await fetchAllSorted('insumos'); sel.innerHTML='<option value="">Selecione</option>'; items.forEach((x)=>{ const o=document.createElement('option'); o.value=String(x.id); o.textContent=x.nome; sel.appendChild(o); }); }
function atualizarTotalCompra(){ const qtd=Number(document.getElementById('compra-quantidade').value||0); const preco=Number(document.getElementById('compra-preco-unitario').value||0); document.getElementById('compra-total').value=(qtd*preco).toFixed(2); }
function resetCompraForm(){ const f=document.getElementById('compra-form'); if(f) f.reset(); document.getElementById('compra-id').value=''; document.getElementById('compra-total').value='0'; const vcto=document.getElementById('compra-data-vencimento'); if(vcto) vcto.closest('.field').style.display='none'; setTodayIfEmpty('compra-data'); }

async function salvarCompra(event){
  event.preventDefault();
  const data=document.getElementById('compra-data').value;
  const fornecedorId=Number(document.getElementById('compra-fornecedor-id').value);
  const itemTipo=document.getElementById('compra-item-tipo').value;
  const itemId=Number(document.getElementById('compra-item-id').value);
  const quantidade=Number(document.getElementById('compra-quantidade').value||0);
  const precoUnitario=Number(document.getElementById('compra-preco-unitario').value||0);
  const total=Number(document.getElementById('compra-total').value||0);
  const formaPagamento=document.getElementById('compra-forma-pagamento').value;
  if(!data||!fornecedorId||!itemTipo||!itemId||quantidade<=0||precoUnitario<=0||!formaPagamento) return alert('Preencha todos os campos.');

  /* Pré-leitura */
  const fornecedor=await reqToPromise(getStore('fornecedores').get(fornecedorId));
  const storeName=itemTipo==='produto'?'produtos':'insumos';
  const item=await reqToPromise(getStore(storeName).get(itemId));
  if(!fornecedor||!item) return alert('Fornecedor ou item não encontrado.');

  const isPrazo = formaPagamento==='Prazo';
  const dataVencimento = isPrazo ? (document.getElementById('compra-data-vencimento')?.value || '') : '';

  /* Transação */
  const stores=['compras',storeName,'movimentos_estoque','financeiro_lancamentos','contas_pagar'];
  const tx=db.transaction(stores,'readwrite');
  const compraId=idGen();
  const compraObj={
    id:compraId, data, fornecedorId, fornecedorNome:fornecedor.nome,
    itemTipo, itemId, itemNome:item.nome, quantidade, precoUnitario, total,
    formaPagamento, dataVencimento,
    updatedAt:new Date().toISOString()
  };
  tx.objectStore('compras').put(compraObj);

  /* Entrada de estoque */
  const novoEstoque=currentStock(item)+quantidade;
  tx.objectStore(storeName).put({...item, estoqueAtual:novoEstoque, updatedAt:new Date().toISOString()});
  tx.objectStore('movimentos_estoque').put({id:idGen(),tipo:'entrada',itemTipo,itemId:item.id,itemNome:item.nome,quantidade,data,origem:'compra',referenciaId:compraId,updatedAt:new Date().toISOString()});

  /* Financeiro: saída se à vista */
  if(!isPrazo){
    tx.objectStore('financeiro_lancamentos').put({
      id:idGen(), data, tipo:'saida', valor:total,
      descricao:`Compra: ${item.nome} (${fornecedor.nome})`, formaPagamento, gaveta:formaPagamento,
      origem:'compra', referenciaId:compraId, updatedAt:new Date().toISOString()
    });
  }

  /* Contas a pagar: se prazo */
  if(isPrazo){
    tx.objectStore('contas_pagar').put({
      id:idGen(), fornecedorId, fornecedorNome:fornecedor.nome,
      descricao:item.nome, valor:total, valorPago:0, saldoRestante:total,
      dataVencimento, dataCompra:data, compraId,
      status:'Em Aberto', updatedAt:new Date().toISOString()
    });
  }

  await txToPromise(tx);
  await registrarEventoAuditoria('COMPRA','Compra registrada',`Item: ${item.nome}\nFornecedor: ${fornecedor.nome}\nTotal: ${moneyBR(total)}\nPagamento: ${formaPagamento}`);
  await atualizarResumoFinanceiro(); await renderFinanceiro(); await renderCompras();
  await renderEstoqueGeral(); await renderContasAPagar();
  if(itemTipo==='produto'){ await renderProdutos(); await carregarProdutosVenda(); }
  else { await renderInsumos(); }
  resetCompraForm();
}

async function renderCompras(){
  const items=await fetchAllSorted('compras','data',true);
  renderEntityList('compras-lista','compras-total',items,'Nenhuma compra registrada.',
    (x)=>`<article class="entity-item"><div><h4 class="entity-name">${esc(x.itemNome)}</h4><p class="entity-meta">Fornecedor: ${esc(x.fornecedorNome)}<br>Data: ${formatDateBR(x.data)} | Qtd: ${x.quantidade} x ${moneyBR(x.precoUnitario)}<br>Total: ${moneyBR(x.total)} | ${x.formaPagamento}</p></div></article>`, null
  );
}

/* ========== PRODUÇÃO ========== */
async function carregarProdutoSelect(){ const sel=document.getElementById('producao-produto-id'); if(!sel) return; const items=await fetchAllSorted('produtos'); sel.innerHTML='<option value="">Selecione</option>'; items.forEach((p)=>{ const o=document.createElement('option'); o.value=String(p.id); o.textContent=`${p.nome} (Estoque: ${currentStock(p)})`; sel.appendChild(o); }); }
async function atualizarPreviewProducao(){ const prodId=Number(document.getElementById('producao-produto-id').value); const qtd=Number(document.getElementById('producao-quantidade').value||0); const preview=document.getElementById('producao-preview'); if(!prodId||qtd<=0){ preview.value=''; return; } const prod=await reqToPromise(getStore('produtos').get(prodId)); if(!prod||!prod.receita||!prod.receita.length){ preview.value='Produto sem ficha técnica.'; return; } const insumos=await fetchAllSorted('insumos'); const mapa=new Map(insumos.map(i=>[i.id, i])); let txt='Consumo previsto:\n'; prod.receita.forEach((r)=>{ const ins=mapa.get(r.insumoId); const consumo=r.quantidade*qtd; txt+=`• ${ins?ins.nome:'Insumo removido'}: ${consumo} (Estoque: ${ins?currentStock(ins):0})\n`; }); preview.value=txt; }
function resetProducaoForm(){ const f=document.getElementById('producao-form'); if(f) f.reset(); document.getElementById('producao-preview').value=''; setTodayIfEmpty('producao-data'); }
async function refreshProducaoMetricas(){ const prods=await fetchAllSorted('produtos'); const ins=await fetchAllSorted('insumos'); const movs=await fetchAllSorted('movimentos_estoque'); const procs=await fetchAllSorted('producoes'); const el1=document.getElementById('metric-produtos'); if(el1) el1.textContent=prods.length; const el2=document.getElementById('metric-insumos'); if(el2) el2.textContent=ins.length; const el3=document.getElementById('metric-movimentos'); if(el3) el3.textContent=movs.length; const el4=document.getElementById('metric-producoes'); if(el4) el4.textContent=procs.length; }
async function registrarProducao(event){
  event.preventDefault();
  const data=document.getElementById('producao-data').value;
  const prodId=Number(document.getElementById('producao-produto-id').value);
  const qtd=Number(document.getElementById('producao-quantidade').value||0);
  if(!data||!prodId||qtd<=0) return alert('Preencha todos os campos.');
  const prod=await reqToPromise(getStore('produtos').get(prodId));
  if(!prod) return alert('Produto não encontrado.');
  const insumos=await fetchAllSorted('insumos');
  const mapaIns=new Map(insumos.map(i=>[i.id, i]));

  const stores=['producoes','produtos','insumos','movimentos_estoque'];
  const tx=db.transaction(stores,'readwrite');
  const producaoId=idGen();
  tx.objectStore('producoes').put({id:producaoId,data,produtoId:prodId,produtoNome:prod.nome,quantidade:qtd,updatedAt:new Date().toISOString()});

  /* Entrada de estoque do produto */
  const novoEstoqueProd=currentStock(prod)+qtd;
  tx.objectStore('produtos').put({...prod,estoqueAtual:novoEstoqueProd,updatedAt:new Date().toISOString()});
  tx.objectStore('movimentos_estoque').put({id:idGen(),tipo:'entrada',itemTipo:'produto',itemId:prod.id,itemNome:prod.nome,quantidade:qtd,data,origem:'producao',referenciaId:producaoId,updatedAt:new Date().toISOString()});

  /* Baixa de insumos */
  (prod.receita||[]).forEach((r)=>{
    const ins=mapaIns.get(r.insumoId);
    if(ins){
      const consumo=r.quantidade*qtd;
      const novoEstoqueIns=currentStock(ins)-consumo;
      tx.objectStore('insumos').put({...ins,estoqueAtual:novoEstoqueIns,updatedAt:new Date().toISOString()});
      tx.objectStore('movimentos_estoque').put({id:idGen(),tipo:'saida',itemTipo:'insumo',itemId:ins.id,itemNome:ins.nome,quantidade:consumo,data,origem:'producao',referenciaId:producaoId,updatedAt:new Date().toISOString()});
    }
  });

  await txToPromise(tx);

  /* v2.9: Snapshot silencioso (caixa preta) */
  if(typeof BackupManager !== 'undefined') BackupManager.salvarSnapshot(db, 'producao_registrada').catch(function(e){ console.error('[Snapshot] Erro após produção:', e); });

  await registrarEventoAuditoria('PRODUÇÃO','Produção registrada',`Produto: ${prod.nome}\nQtd: ${qtd}`);
  resetProducaoForm(); await renderProducoes(); await renderProdutos(); await renderInsumos();
  await carregarProdutoSelect(); await carregarProdutosVenda(); await refreshProducaoMetricas();
  await renderEstoqueGeral(); await renderMovimentosEstoque();
}
async function renderProducoes(){ const items=await fetchAllSorted('producoes','data',true); renderEntityList('producoes-lista','producoes-total',items,'Nenhuma produção registrada.', (x)=>`<article class="entity-item"><div><h4 class="entity-name">${esc(x.produtoNome)}</h4><p class="entity-meta">Data: ${formatDateBR(x.data)} | Quantidade: ${x.quantidade}</p></div></article>`, null); }

/* ========== ESTOQUE ========== */
async function renderEstoqueGeral(){
  const produtos=await fetchAllSorted('produtos');
  const insumos=await fetchAllSorted('insumos');
  const tbodyProd=document.getElementById('estoque-produtos-lista');
  const tbodyIns=document.getElementById('estoque-insumos-lista');
  const totalProd=document.getElementById('estoque-produtos-total');
  const totalIns=document.getElementById('estoque-insumos-total');
  if(totalProd) totalProd.textContent=`${produtos.length} produtos`;
  if(totalIns) totalIns.textContent=`${insumos.length} insumos`;
  if(tbodyProd){
    tbodyProd.innerHTML=produtos.map((p)=>{
      const est=currentStock(p);
      const icon=est===0?'🔴':est<=5?'🟡':'🟢';
      const cls=est===0?'estoque-alerta':est<=5?'estoque-baixo':'';
      return `<tr class="${cls}"><td class="status-icon">${icon}</td><td>${esc(p.nome)}</td><td style="text-align:center">${est}</td><td style="text-align:center">${moneyBR(p.precoVenda||0)}</td><td style="text-align:center"><button class="btn-small js-ajuste-estoque" data-tipo="produto" data-id="${p.id}" type="button">Ajustar</button></td></tr>`;
    }).join('');
    tbodyProd.querySelectorAll('.js-ajuste-estoque').forEach((b)=>b.addEventListener('click',()=>abrirModalAjusteEstoque(b.dataset.tipo, Number(b.dataset.id))));
  }
  if(tbodyIns){
    tbodyIns.innerHTML=insumos.map((ins)=>{
      const est=currentStock(ins);
      const icon=est===0?'🔴':est<=5?'🟡':'🟢';
      const cls=est===0?'estoque-alerta':est<=5?'estoque-baixo':'';
      return `<tr class="${cls}"><td class="status-icon">${icon}</td><td>${esc(ins.nome)}</td><td style="text-align:center">${est}</td><td style="text-align:center">-</td></tr>`;
    }).join('');
  }
}
async function renderMovimentosEstoque(){
  const filtro=document.getElementById('filtro-movimento-tipo')?.value||'todos';
  let items=await fetchAllSorted('movimentos_estoque','data',true);
  if(filtro!=='todos') items=items.filter(m=>m.tipo===filtro||m.origem===filtro);
  const el=document.getElementById('estoque-movimentos-total'); if(el) el.textContent=`${items.length} registros`;
  renderEntityList('estoque-movimentos-lista','estoque-movimentos-total',items,'Nenhuma movimentação registrada.',
    (x)=>`<article class="entity-item"><div><h4 class="entity-name">${x.tipo==='entrada'?'📥':'📤'} ${esc(x.itemNome)}</h4><p class="entity-meta">Tipo: ${x.tipo} | Origem: ${x.origem}<br>Qtd: ${x.quantidade} | Data: ${formatDateBR(x.data)}</p></div></article>`, null);
}
function abrirModalAjusteEstoque(tipo, id){
  const modal=document.createElement('div');
  modal.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML=`<div style="background:white;padding:24px;border-radius:16px;max-width:400px;width:90%;"><h3>Ajustar Estoque</h3><div class="field"><label>Novo Estoque</label><input type="number" id="modal-novo-estoque" min="0" step="0.01" /></div><div style="display:flex;gap:10px;"><button id="btn-cancelar-ajuste" class="btn-secondary" style="flex:1;">Cancelar</button><button id="btn-confirmar-ajuste" class="btn-primary" style="flex:1;">Confirmar</button></div></div>`;
  document.body.appendChild(modal);
  document.getElementById('btn-cancelar-ajuste').addEventListener('click',()=>modal.remove());
  document.getElementById('btn-confirmar-ajuste').addEventListener('click',async()=>{
    const novoEstoque=Number(document.getElementById('modal-novo-estoque').value||0);
    const storeName=tipo==='produto'?'produtos':'insumos';
    const item=await reqToPromise(getStore(storeName).get(id));
    if(!item) return;
    const tx=db.transaction([storeName,'movimentos_estoque'],'readwrite');
    const diff=novoEstoque-currentStock(item);
    tx.objectStore(storeName).put({...item,estoqueAtual:novoEstoque,updatedAt:new Date().toISOString()});
    tx.objectStore('movimentos_estoque').put({id:idGen(),tipo:diff>=0?'entrada':'saida',itemTipo:tipo,itemId:item.id,itemNome:item.nome,quantidade:Math.abs(diff),data:new Date().toISOString().slice(0,10),origem:'ajuste_manual',updatedAt:new Date().toISOString()});
    await txToPromise(tx);
    modal.remove();
    await renderEstoqueGeral(); await renderMovimentosEstoque();
    if(tipo==='produto'){ await renderProdutos(); await carregarProdutosVenda(); }
    else { await renderInsumos(); }
  });
}

/* ========== FINANCEIRO — 4 GAVETAS ========== */
async function atualizarResumoFinanceiro(){
  const lancamentos=await reqToPromise(getStore('financeiro_lancamentos').getAll());
  let totalEntradas=0, totalSaidas=0;
  let gavetaDinheiro=0, gavetaPix=0, gavetaTesoureiro=0;
  /* v3.3.3: origens técnicas de estorno afetam gaveta mas NÃO contam como entrada/saída real */
  const _ORIGENS_TECNICAS = new Set(['transferencia','estorno_vale','estorno_folha','estorno_venda']);
  /* v3.3.4: pré-calcular total de estornos de vale para neutralizar saidas de vale estornado */
  const _totalEstornosVale = lancamentos.filter(l=>l.tipo==='entrada'&&l.origem==='estorno_vale').reduce((s,l)=>s+Number(l.valor||0),0);
  let _saidaValeAcum = 0; /* acumula saidas de vale para aplicar neutralização */
  lancamentos.forEach((l)=>{
    const v=Number(l.valor||0);
    const gaveta=l.gaveta||l.formaPagamento||'Dinheiro';
    /* Transferencias e estornos técnicos afetam saldo de gaveta mas NAO contam como receita/despesa real */
    if(l.tipo==='entrada'){
      if(gaveta==='Dinheiro') gavetaDinheiro+=v;
      else if(gaveta==='Pix') gavetaPix+=v;
      else if(gaveta==='Tesoureiro') gavetaTesoureiro+=v;
      if(!_ORIGENS_TECNICAS.has(l.origem||'')) totalEntradas+=v; /* v3.3.3: exclui estornos técnicos */
    } else {
      if(gaveta==='Dinheiro') gavetaDinheiro-=v;
      else if(gaveta==='Pix') gavetaPix-=v;
      else if(gaveta==='Tesoureiro') gavetaTesoureiro-=v;
      if(!_ORIGENS_TECNICAS.has(l.origem||'')){
        if(l.origem==='vale') _saidaValeAcum+=v; /* v3.3.4: acumula para neutralizar */
        else totalSaidas+=v;
      }
    }
  });
  /* v3.3.4: saidas de vale neutralizadas pelos estornos correspondentes */
  const _saidaValeEfetiva = Math.max(0, _saidaValeAcum - _totalEstornosVale);
  totalSaidas += _saidaValeEfetiva;
  const saldo=totalEntradas-totalSaidas;
  const elSaldo=document.getElementById('financeiro-saldo'); if(elSaldo) elSaldo.textContent=moneyBR(saldo);
  const elEnt=document.getElementById('financeiro-entradas'); if(elEnt) elEnt.textContent=moneyBR(totalEntradas);
  const elSai=document.getElementById('financeiro-saidas'); if(elSai) elSai.textContent=moneyBR(totalSaidas);
  /* Gavetas */
  const elGDin=document.getElementById('gaveta-dinheiro'); if(elGDin) elGDin.textContent=moneyBR(gavetaDinheiro);
  const elGPix=document.getElementById('gaveta-pix'); if(elGPix) elGPix.textContent=moneyBR(gavetaPix);
  const elGTes=document.getElementById('gaveta-tesoureiro'); if(elGTes) elGTes.textContent=moneyBR(gavetaTesoureiro);
  const elGTotal=document.getElementById('gaveta-total'); if(elGTotal) elGTotal.textContent=moneyBR(gavetaDinheiro+gavetaPix+gavetaTesoureiro);
}

async function renderFinanceiro(){
  const items=(await fetchAllSorted('financeiro_lancamentos','data',true));
  renderEntityList('financeiro-lista','financeiro-total',items,'Nenhum lançamento registrado.',
    (x)=>{
      const isEntrada=x.tipo==='entrada';
      const cls=isEntrada?'entry-positive':'entry-negative';
      const sinal=isEntrada?'+':'-';
      const gaveta=x.gaveta||x.formaPagamento||'-';
      return `<article class="entity-item"><div><h4 class="entity-name ${cls}">${sinal} ${moneyBR(x.valor)}</h4><p class="entity-meta">${esc(x.descricao)}<br>Data: ${formatDateBR(x.data)} | ${x.formaPagamento||'-'} | Gaveta: ${gaveta}<br>Origem: ${x.origem||'-'}</p></div></article>`;
    }, null
  );
}

/* ========== LANÇAMENTO DE CUSTO ========== */
async function carregarTiposCustosFinanceiro(){ const sel=document.getElementById('financeiro-tipo-custo-id'); if(!sel) return; try{ if(!db || !db.objectStoreNames.length){ await initDB(); } const items=await fetchAllSorted('tipos_custos'); sel.innerHTML='<option value="">Selecione</option>'; items.forEach((t)=>{ const o=document.createElement('option'); o.value=String(t.id); o.textContent=t.nome; sel.appendChild(o); }); }catch(e){ console.error('Erro ao carregar tipos de custo:',e); sel.innerHTML='<option value="">Erro ao carregar</option>'; } }
function resetFinanceiroForm(){ const f=document.getElementById('financeiro-form'); if(f) f.reset(); document.getElementById('financeiro-id').value=''; document.getElementById('financeiro-valor').value='0'; setTodayIfEmpty('financeiro-data'); }
function toggleFinanceiroGavetaVencimento(valor){
  const gavetaField = document.getElementById('financeiro-gaveta-field');
  const vencField = document.getElementById('financeiro-vencimento-field');
  const aviso = document.getElementById('financeiro-aprazo-aviso');
  if(!gavetaField || !vencField) return;
  if(valor==='APrazo'){
    gavetaField.style.display='none';
    vencField.style.display='';
    if(aviso) aviso.style.display='block';
  } else {
    gavetaField.style.display='';
    vencField.style.display='none';
    if(aviso) aviso.style.display='none';
  }
}

async function salvarLancamentoFinanceiro(event){
  event.preventDefault();
  const data=document.getElementById('financeiro-data').value;
  const tipoCustoId=Number(document.getElementById('financeiro-tipo-custo-id').value);
  const descricao=document.getElementById('financeiro-descricao').value.trim();
  const valor=Number(document.getElementById('financeiro-valor').value||0);
  const formaPag=document.getElementById('financeiro-forma-pagamento')?.value||'Dinheiro';
  const gavetaOrigem=document.getElementById('financeiro-gaveta-origem')?.value||'Dinheiro';
  const vencimento=document.getElementById('financeiro-vencimento')?.value||'';
  if(!data||!tipoCustoId||!descricao||valor<=0) return alert('Preencha todos os campos.');
  const tipoCusto=await reqToPromise(getStore('tipos_custos').get(tipoCustoId));
  const categoriaNome = tipoCusto ? tipoCusto.nome : '-';

  if(formaPag==='APrazo'){
    /* === A PRAZO: cria conta a pagar, sem tocar no caixa === */
    const tx=db.transaction('contas_pagar','readwrite');
    tx.objectStore('contas_pagar').put({
      id:idGen(), fornecedorId:0, fornecedorNome:categoriaNome,
      descricao, valor, valorPago:0, saldoRestante:valor,
      dataVencimento:vencimento||null, dataCompra:data,
      tipoCusto:categoriaNome, tipoCustoId, origem:'custo_aprazo',
      status:'Em Aberto', updatedAt:new Date().toISOString()
    });
    await txToPromise(tx);
    /* v2.9: Snapshot silencioso (caixa preta) */
    if(typeof BackupManager !== 'undefined') BackupManager.salvarSnapshot(db, 'custo_aprazo_lancado').catch(function(e){ console.error('[Snapshot] Erro após custo a prazo:', e); });
    await registrarEventoAuditoria('CUSTO','Novo custo a prazo',`Categoria: ${categoriaNome}\nDescrição: ${descricao}\nValor: ${moneyBR(valor)}\nEnviado para Contas a Pagar`);
    resetFinanceiroForm();
    toggleFinanceiroGavetaVencimento('Dinheiro');
    await renderContasAPagar();
    alert('📄 Custo a prazo registrado! Acesse Contas a Pagar para realizar a baixa quando pagar.');
  } else {
    /* === À VISTA: comportamento original === */
    const tx=db.transaction('financeiro_lancamentos','readwrite');
    tx.objectStore('financeiro_lancamentos').put({
      id:idGen(), data, tipo:'saida', valor, descricao,
      tipoCusto:categoriaNome, tipoCustoId,
      formaPagamento:formaPag, gaveta:formaPag,
      origem:'custo_manual', updatedAt:new Date().toISOString()
    });
    await txToPromise(tx);
    /* v2.9: Snapshot silencioso (caixa preta) */
    if(typeof BackupManager !== 'undefined') BackupManager.salvarSnapshot(db, 'custo_manual_lancado').catch(function(e){ console.error('[Snapshot] Erro após custo manual:', e); });
    await registrarEventoAuditoria('CUSTO','Custo lançado',`Descrição: ${descricao}\nValor: ${moneyBR(valor)}\nCategoria: ${categoriaNome}\nGaveta: ${formaPag}`);
    resetFinanceiroForm();
    toggleFinanceiroGavetaVencimento('Dinheiro');
    await atualizarResumoFinanceiro(); await renderFinanceiro();
  }
}

/* ========== CLIENTES DEVEDORES + RECEBIMENTO FRACIONADO ========== */
/* ========== TOGGLE GAVETA/VENCIMENTO CUSTO v1.5 ========== */
function toggleCustoGavetaVencimento(valor){
  const gavetaField = document.getElementById('custo-gaveta-field');
  const vencField = document.getElementById('custo-vencimento-field');
  const aviso = document.getElementById('custo-aprazo-aviso');
  if(!gavetaField || !vencField) return;
  if(valor==='APrazo'){
    gavetaField.style.display='none';
    vencField.style.display='';
    if(aviso) aviso.style.display='block';
  } else {
    gavetaField.style.display='';
    vencField.style.display='none';
    if(aviso) aviso.style.display='none';
  }
}

/* ========== TEMPLATES DE COMUNICAÇÃO v1.3 ========== */
const TEMPLATES_KEY = 'indagualirios_templates_comunicacao';

function carregarTemplatesComunicacao(){
  try{
    const raw = localStorage.getItem(TEMPLATES_KEY);
    const tpls = raw ? JSON.parse(raw) : {};
    const fEl = document.getElementById('template-formal');
    const aEl = document.getElementById('template-amigavel');
    const iEl = document.getElementById('template-informativo');
    if(fEl) fEl.value = tpls.formal || '';
    if(aEl) aEl.value = tpls.amigavel || '';
    if(iEl) iEl.value = tpls.informativo || '';
  }catch(e){ console.warn('Erro ao carregar templates:', e); }
}

function salvarTemplatesComunicacao(){
  const fEl = document.getElementById('template-formal');
  const aEl = document.getElementById('template-amigavel');
  const iEl = document.getElementById('template-informativo');
  const tpls = {
    formal: fEl ? fEl.value : '',
    amigavel: aEl ? aEl.value : '',
    informativo: iEl ? iEl.value : ''
  };
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(tpls));
  const status = document.getElementById('templates-status');
  if(status){ status.textContent = '✅ Templates salvos com sucesso!'; status.style.color='#15803d'; setTimeout(()=>{ status.textContent=''; }, 3000); }
}

function getTemplates(){
  try{
    const raw = localStorage.getItem(TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : {};
  }catch(e){ return {}; }
}

function aplicarTemplate(template, nome, valor, dataHoje){
  return (template || '')
    .replace(/\{nome_cliente\}/g, nome)
    .replace(/\{valor_debito\}/g, valor)
    .replace(/\{data_hoje\}/g, dataHoje);
}

async function renderClientesDevedores(){
  const limites=await reqToPromise(getStore('limites_credito').getAll());
  /* Calcular saldo líquido: crédito abate dívida automaticamente */
  const comSaldo = limites.map(l=>{
    const divida = Number(l.saldoDevedor||0);
    const credito = Number(l.saldoCredito||0);
    const saldoLiquido = credito - divida; /* positivo = cliente tem crédito líquido; negativo = cliente deve */
    return {...l, saldoLiquido};
  }).filter(l=>Math.abs(l.saldoLiquido)>0.009||Number(l.saldoDevedor||0)>0.009);
  /* Separar devedores (saldo líquido negativo) e adiantamentos (saldo líquido positivo) */
  const devedores = comSaldo.filter(l=>l.saldoLiquido < -0.009);
  const adiantamentos = comSaldo.filter(l=>l.saldoLiquido > 0.009);
  const el=document.getElementById('devedores-total'); if(el) el.textContent=`${devedores.length} devedores | ${adiantamentos.length} adiantamentos`;
  const lista=document.getElementById('devedores-lista');
  if(!lista) return;
  if(!comSaldo.length){ lista.innerHTML='<div class="empty-list">Nenhum cliente devedor ou com crédito.</div>'; return; }
  let html = '';
  if(devedores.length){
    html += `<div style="font-weight:700;color:#dc2626;padding:8px 0 4px;">📉 DEVEDORES (${devedores.length})</div>`;
    html += devedores.map(d=>{
      const cid = d.clienteId||d.id;
      const valorDevido = moneyBR(Math.abs(d.saldoLiquido));
      return `<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(d.clienteNome)}</h4><p class="entity-meta" style="color:#dc2626;">Saldo Líquido: ${valorDevido} (deve à fábrica)</p></div></div><div class="devedores-acoes"><button class="btn-small js-ver-devedor" data-id="${cid}" type="button">💰 Receber</button><button class="btn-small js-whatsapp-formal" data-id="${cid}" type="button" style="background:#25d366;color:#fff;">🟢 Formal</button><button class="btn-small js-whatsapp-amigavel" data-id="${cid}" type="button" style="background:#128c7e;color:#fff;">🔵 Amigável</button><button class="btn-small js-whatsapp-informativo" data-id="${cid}" type="button" style="background:#0ea5e9;color:#fff;">📄 Informativo</button></div></article>`;
    }).join('');
  }
  if(adiantamentos.length){
    html += `<div style="font-weight:700;color:#7c3aed;padding:8px 0 4px;">💰 ADIANTAMENTOS / CRÉDITOS (${adiantamentos.length})</div>`;
    html += adiantamentos.map(d=>{
      const cid = d.clienteId||d.id;
      const valorCredito = moneyBR(d.saldoLiquido);
      return `<article class="entity-item" style="border-left:4px solid #7c3aed;"><div class="row-head"><div><h4 class="entity-name">${esc(d.clienteNome)}</h4><p class="entity-meta" style="color:#7c3aed;font-weight:600;">Crédito Líquido: ${valorCredito} (a fábrica deve ao cliente)</p></div></div></article>`;
    }).join('');
  }
  lista.innerHTML = html;
  lista.querySelectorAll('.js-ver-devedor').forEach((b)=>b.addEventListener('click',()=>abrirDetalheDevedor(Number(b.dataset.id))));
  lista.querySelectorAll('.js-whatsapp-formal').forEach((b)=>b.addEventListener('click',async()=>{ await enviarCobrancaWhatsApp(Number(b.dataset.id), 'formal'); }));
  lista.querySelectorAll('.js-whatsapp-amigavel').forEach((b)=>b.addEventListener('click',async()=>{ await enviarCobrancaWhatsApp(Number(b.dataset.id), 'amigavel'); }));
  lista.querySelectorAll('.js-whatsapp-informativo').forEach((b)=>b.addEventListener('click',async()=>{ await enviarCobrancaWhatsApp(Number(b.dataset.id), 'informativo'); }));
}

async function enviarCobrancaWhatsApp(clienteId, tipo){
  const cliente=await reqToPromise(getStore('clientes').get(clienteId));
  const reg=await reqToPromise(getStore('limites_credito').get(clienteId));
  if(!cliente || !reg) return alert('Cliente não encontrado.');
  const telefone=(cliente.telefone||'').replace(/\D/g,'');
  if(!telefone) return alert('Cliente sem telefone cadastrado. Cadastre o telefone primeiro.');
  const nome = cliente.nome;
  const valor = moneyBR(reg.saldoDevedor||0);
  const dataHoje = new Date().toLocaleDateString('pt-BR');
  const tpls = getTemplates();
  let templateBase = '';
  if(tipo==='formal'){
    templateBase = tpls.formal || `Prezado(a) ${nome}, informamos que consta em nosso sistema um débito no valor de ${valor}. Solicitamos a regularização do pagamento. Atenciosamente, IndÁgua Lírios.`;
  } else if(tipo==='amigavel'){
    templateBase = tpls.amigavel || `Olá ${nome}! Passando pra lembrar que você tem um saldo de ${valor} em aberto. Quando puder regularizar, ficaremos agradecidos! Abraço!`;
  } else {
    templateBase = tpls.informativo || `${nome}, segue atualização do seu saldo em ${dataHoje}: ${valor}.`;
  }
  const msg = aplicarTemplate(templateBase, nome, valor, dataHoje);
  const tel = telefone.startsWith('55') ? telefone : '55'+telefone;
  const url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
  window.open(url,'_blank');
}
async function abrirDetalheDevedor(clienteId){
  const reg=await reqToPromise(getStore('limites_credito').get(clienteId));
  if(!reg) return;
  const vendas=await reqToPromise(getStore('vendas').getAll());
  const vendasAbertas=vendas.filter(v=>v.clienteId===clienteId && v.statusPagamento==='Em Aberto');
  const detalhe=document.getElementById('devedor-detalhe');
  if(!detalhe) return;
  const saldoDevedor=Number(reg.saldoDevedor||0);

  let html=`<h4>${esc(reg.clienteNome)}</h4><p>Dívida Total: <strong>${moneyBR(saldoDevedor)}</strong></p>`;
  html+=`<h5>Vendas em Aberto:</h5>`;
  vendasAbertas.forEach((v)=>{
    html+=`<div class="entity-item" style="margin-bottom:8px;"><p>${formatDateBR(v.data)} — ${moneyBR(v.total)} (Pago: ${moneyBR(v.valorRecebido||0)} | Restante: ${moneyBR(v.saldoDevedor||0)})</p></div>`;
  });

  html+=`<div style="margin-top:16px;padding:16px;background:#f9fafb;border-radius:14px;">`;
  html+=`<h5>Receber Pagamento (3 Partes)</h5>`;
  html+=`<p style="color:#6b7280;margin-bottom:12px;">Saldo devedor: <strong>${moneyBR(saldoDevedor)}</strong></p>`;
  html+=`<div class="form-grid two-columns">`;
  html+=`<div class="field"><label>Valor em Dinheiro (R$)</label><input type="number" id="recebimento-dinheiro" min="0" step="0.01" value="0" /></div>`;
  html+=`<div class="field"><label>Valor em Pix (R$)</label><input type="number" id="recebimento-pix" min="0" step="0.01" value="0" /></div>`;
  html+=`</div>`;
  html+=`<div style="margin-top:12px;padding:12px;background:#e0f2fe;border-radius:10px;"><strong>Restante no Vale:</strong> <span id="recebimento-restante-vale" style="font-size:1.1em;font-weight:bold;">${moneyBR(saldoDevedor)}</span></div>`;
  html+=`<button class="btn-primary" id="btn-confirmar-recebimento" type="button" style="margin-top:12px;">Confirmar Recebimento</button>`;
  html+=`</div>`;

  detalhe.innerHTML=html;

  /* Cálculo em tempo real do restante no vale */
  const inputDin=document.getElementById('recebimento-dinheiro');
  const inputPix=document.getElementById('recebimento-pix');
  const spanRestante=document.getElementById('recebimento-restante-vale');
  function atualizarRestanteVale(){
    const din=Number(inputDin.value||0);
    const pix=Number(inputPix.value||0);
    const restante=Math.max(0, saldoDevedor - din - pix);
    spanRestante.textContent=moneyBR(restante);
    spanRestante.style.color=restante>0?'#b91c1c':'#15803d';
  }
  inputDin.addEventListener('input', atualizarRestanteVale);
  inputPix.addEventListener('input', atualizarRestanteVale);

  document.getElementById('btn-confirmar-recebimento').addEventListener('click',()=>confirmarRecebimento(clienteId));
}

async function confirmarRecebimento(clienteId){
  const valorDinheiro=Number(document.getElementById('recebimento-dinheiro').value||0);
  const valorPix=Number(document.getElementById('recebimento-pix').value||0);
  const totalReceber=valorDinheiro+valorPix;
  if(totalReceber<=0) return alert('Informe pelo menos um valor (Dinheiro ou Pix) maior que zero.');

  /* Pré-leitura */
  const reg=await reqToPromise(getStore('limites_credito').get(clienteId));
  if(!reg) return alert('Registro de crédito não encontrado.');
  const saldoAtual=Number(reg.saldoDevedor||0);
  if(totalReceber>saldoAtual) return alert(`Valor total (${moneyBR(totalReceber)}) maior que a dívida (${moneyBR(saldoAtual)}).`);

  const vendas=await reqToPromise(getStore('vendas').getAll());
  const vendasAbertas=vendas.filter(v=>v.clienteId===clienteId && v.statusPagamento==='Em Aberto').sort((a,b)=>a.data.localeCompare(b.data));

  /* Calcular abatimento por venda (mais antiga primeiro) */
  let restante=totalReceber;
  const vendasAtualizadas=[];
  for(const v of vendasAbertas){
    if(restante<=0) break;
    const devedorVenda=Number(v.saldoDevedor||0);
    const abater=Math.min(restante, devedorVenda);
    const novoDevedor=devedorVenda-abater;
    const novoRecebido=Number(v.valorRecebido||0)+abater;
    vendasAtualizadas.push({
      ...v,
      saldoDevedor:novoDevedor,
      valorRecebido:novoRecebido,
      statusPagamento:novoDevedor<=0?'Recebido':'Em Aberto',
      updatedAt:new Date().toISOString()
    });
    restante-=abater;
  }

  const novoSaldoDevedor=saldoAtual-totalReceber;
  const restanteVale=novoSaldoDevedor;
  const hoje=new Date().toISOString().slice(0,10);

  /* Transação de escrita */
  const tx=db.transaction(['limites_credito','financeiro_lancamentos','vendas'],'readwrite');
  tx.objectStore('limites_credito').put({
    ...reg, saldoDevedor:novoSaldoDevedor, updatedAt:new Date().toISOString()
  });
  /* Lançar entrada na gaveta Dinheiro se valorDinheiro > 0 */
  if(valorDinheiro>0){
    tx.objectStore('financeiro_lancamentos').put({
      id:idGen(), data:hoje, tipo:'entrada', valor:valorDinheiro,
      descricao:`Recebimento (Dinheiro): ${reg.clienteNome}`,
      formaPagamento:'Dinheiro', gaveta:'Dinheiro',
      origem:'recebimento', updatedAt:new Date().toISOString()
    });
  }
  /* Lançar entrada na gaveta Pix se valorPix > 0 */
  if(valorPix>0){
    tx.objectStore('financeiro_lancamentos').put({
      id:idGen()+1, data:hoje, tipo:'entrada', valor:valorPix,
      descricao:`Recebimento (Pix): ${reg.clienteNome}`,
      formaPagamento:'Pix', gaveta:'Pix',
      origem:'recebimento', updatedAt:new Date().toISOString()
    });
  }
  vendasAtualizadas.forEach((v)=>tx.objectStore('vendas').put(v));
  await txToPromise(tx);

  await registrarEventoAuditoria('RECEBIMENTO','Recebimento parcial',`Cliente: ${reg.clienteNome}\nDinheiro: ${moneyBR(valorDinheiro)}\nPix: ${moneyBR(valorPix)}\nRestante: ${moneyBR(restanteVale)}`);
  await atualizarResumoFinanceiro(); await renderFinanceiro();
  await renderClientesDevedores(); await renderVendas();
  document.getElementById('devedor-detalhe').innerHTML=`<div style="padding:16px;background:#d1fae5;border-radius:14px;text-align:center;"><strong>✅ Recebimento confirmado!</strong><br>Dinheiro: ${moneyBR(valorDinheiro)} | Pix: ${moneyBR(valorPix)}<br>Restante no Vale: ${moneyBR(restanteVale)}</div>`;
}

/* ========== ALERTA DE ESTOQUE MÍNIMO ========== */
async function verificarEstoqueMinimo(){
  const produtos=await fetchAllSorted('produtos');
  const insumos=await fetchAllSorted('insumos');
  const alertas=[];
  produtos.forEach((p)=>{
    const min=Number(p.estoqueMinimo||0);
    if(min>0 && currentStock(p)<=min){
      alertas.push(`${p.nome} (Produto): Estoque ${currentStock(p)} / M\u00edn ${min}`);
    }
  });
  insumos.forEach((ins)=>{
    const min=Number(ins.estoqueMinimo||0);
    if(min>0 && currentStock(ins)<=min){
      alertas.push(`${ins.nome} (Insumo): Estoque ${currentStock(ins)} / M\u00edn ${min}`);
    }
  });
  if(alertas.length>0){
    const msg=`ALERTA DE ESTOQUE MÍNIMO:\n${alertas.join('\n')}`;
    await registrarEventoAuditoria('ALERTA','Estoque mínimo atingido',msg);
  }
}
/* ========== TRANSFERÊNCIA ENTRE CONTAS ========== */
const CONTAS_TRANSFER={
  'Caixa Físico (Dinheiro)':'Dinheiro',
  'Caixa Digital (Pix/Cartão)':'Pix',
  'Tesouraria (Gaudencio)':'Tesoureiro'
};
const CONTAS_TRANSFER_LABELS={
  'Dinheiro':'Caixa Físico (Dinheiro)',
  'Pix':'Caixa Digital (Pix/Cartão)',
  'Tesoureiro':'Tesouraria (Gaudencio)'
};
async function transferirFundos(origem, destino, valor){
  if(!origem || !destino || valor<=0) return alert('Preenchimento inválido.');
  if(origem===destino) return alert('Origem e destino devem ser diferentes.');
  const gavetaOrigem=CONTAS_TRANSFER[origem];
  const gavetaDestino=CONTAS_TRANSFER[destino];
  if(!gavetaOrigem || !gavetaDestino) return alert('Conta inválida.');
  const tx=db.transaction('financeiro_lancamentos','readwrite');
  const store=tx.objectStore('financeiro_lancamentos');
  const agora=new Date().toISOString();
  store.put({
    id:idGen(),
    data:agora.split('T')[0],
    tipo:'saida',
    valor:Number(valor),
    descricao:`Sangria para ${destino}`,
    formaPagamento:gavetaOrigem,
    gaveta:gavetaOrigem,
    origem:'transferencia',
    updatedAt:agora
  });
  store.put({
    id:idGen(),
    data:agora.split('T')[0],
    tipo:'entrada',
    valor:Number(valor),
    descricao:`Suprimento de ${origem}`,
    formaPagamento:gavetaDestino,
    gaveta:gavetaDestino,
    origem:'transferencia',
    updatedAt:agora
  });
  await txToPromise(tx);
  await atualizarResumoFinanceiro();
  await renderFinanceiro();
  await registrarEventoAuditoria('TRANSFERÊNCIA','Transferência entre contas',`Origem: ${origem}\nDestino: ${destino}\nValor: ${moneyBR(Number(valor))}`);
  alert('Transferência realizada com sucesso!');
}
/* ========== FOLHA DE PAGAMENTO ========== */
async function mostrarHistoricoRapidoFolha(funcId){
  const historicoCont = document.getElementById('folha-historico-rapido');
  const historicoLista = document.getElementById('folha-historico-lista');
  if(!historicoCont || !historicoLista) return;
  const todos = await fetchAllSorted('folha_pagamento','data',true);
  const doFunc = todos.filter(p => p.funcionarioId === funcId).slice(0,3);
  if(!doFunc.length){ historicoCont.style.display='none'; return; }
  historicoLista.innerHTML = doFunc.map(p => `<div style="padding:4px 0;border-bottom:1px solid #e0f2fe;">${formatDateBR(p.data)} &mdash; <strong>${moneyBR(p.totalLiquido)}</strong> (Ref: ${p.mesReferencia||'-'}/${p.anoReferencia||'-'})</div>`).join('');
  historicoCont.style.display='block';
}

async function carregarFolhaFuncionarios(){ const items=(await fetchAllSorted('funcionarios')).filter(funcionarioEstaAtivo); const lista=document.getElementById('folha-funcionarios-lista'); if(!lista) return; lista.innerHTML=items.map((f)=>`<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(f.nome)}</h4><p class="entity-meta">Função: ${esc(f.funcao||'-')} | Salário: ${moneyBR(f.salarioBase||0)}</p></div><button class="btn-small js-selecionar-folha" data-id="${f.id}" type="button">Selecionar</button></div></article>`).join(''); lista.querySelectorAll('.js-selecionar-folha').forEach((b)=>b.addEventListener('click',async()=>{ const func=await reqToPromise(getStore('funcionarios').get(Number(b.dataset.id))); if(!func || !funcionarioEstaAtivo(func)) return; document.getElementById('folha-funcionario-id').value=func.id; document.getElementById('folha-funcionario-nome').value=func.nome; const salBase=Number(func.salarioBase||0); document.getElementById('folha-salario-base').value=salBase; const vales=await fetchAllSorted('vale'); const valesPendentes=vales.filter(v=>v.funcionarioId===func.id && !v.liquidado && !v.estornado); /* v3.3.2: ignora vales estornados */ const totalVales=valesPendentes.reduce((s,v)=>s+Number(v.valor||0),0); document.getElementById('folha-vales-pendentes').value=totalVales.toFixed(2); /* v2.8: Faltas automáticas */ const mesRef=document.getElementById('folha-mes-referencia').value; const anoRef=document.getElementById('folha-ano-referencia').value; let qtdFaltas=0; let descontoFaltas=0; if(mesRef && anoRef){ qtdFaltas=await contarFaltasMes(func.id,mesRef,anoRef); descontoFaltas=calcularDescontoFaltas(salBase,qtdFaltas); } const elFaltasQtd=document.getElementById('folha-faltas-qtd'); const elFaltasDesc=document.getElementById('folha-faltas-desconto'); if(elFaltasQtd) elFaltasQtd.value=qtdFaltas; if(elFaltasDesc) elFaltasDesc.value=descontoFaltas.toFixed(2); /* v3.4: Licenças automáticas */ let diasLicenca=0; let descontoLicenca=0; if(mesRef && anoRef){ diasLicenca=await contarDiasLicencaMes(func.id,mesRef,anoRef); descontoLicenca=calcularDescontoLicenca(salBase,diasLicenca); } const elLicDias=document.getElementById('folha-licenca-dias'); const elLicDesc=document.getElementById('folha-licenca-desconto'); if(elLicDias) elLicDias.value=diasLicenca; if(elLicDesc) elLicDesc.value=descontoLicenca.toFixed(2); document.getElementById('folha-descontos').value=(totalVales+descontoFaltas+descontoLicenca).toFixed(2); calcularFolhaTotal(); /* status licenca */ const diasNoMes=mesRef&&anoRef?new Date(Number(anoRef),Number(mesRef),0).getDate():30; const statusEl=document.getElementById('folha-licenca-status'); if(statusEl){ if(diasLicenca>=diasNoMes){ statusEl.textContent='⚠️ Em licença no mês inteiro — valor a pagar: R$ 0,00'; statusEl.style.display='block'; document.getElementById('folha-total').value='0.00'; } else if(diasLicenca>0){ statusEl.textContent=`📅 ${diasLicenca} dia(s) de licença neste mês — desconto: ${moneyBR(descontoLicenca)}`; statusEl.style.display='block'; } else { statusEl.style.display='none'; } } await mostrarHistoricoRapidoFolha(func.id); })); const totalEl=document.getElementById('folha-funcionarios-total'); if(totalEl) totalEl.textContent=`${items.length} itens`; }
function calcularFolhaTotal(){ const base=Number(document.getElementById('folha-salario-base').value||0); const adicionais=Number(document.getElementById('folha-adicionais').value||0); const descontos=Number(document.getElementById('folha-descontos').value||0); document.getElementById('folha-total').value=Math.max(0,base+adicionais-descontos).toFixed(2); }
function resetFolhaForm(){
  const agora=new Date();
  const mesAtual=String(agora.getMonth()+1).padStart(2,'0');
  const anoAtual=agora.getFullYear();
  document.getElementById('folha-funcionario-id').value='';
  document.getElementById('folha-funcionario-nome').value='';
  document.getElementById('folha-salario-base').value='0';
  document.getElementById('folha-adicionais').value='0';
  document.getElementById('folha-descontos').value='0';
  document.getElementById('folha-vales-pendentes').value='0';
  const elFaltasQtd=document.getElementById('folha-faltas-qtd'); if(elFaltasQtd) elFaltasQtd.value='0';
  const elFaltasDesc=document.getElementById('folha-faltas-desconto'); if(elFaltasDesc) elFaltasDesc.value='0';
  /* v3.4: reset licenca */ const elLicDias=document.getElementById('folha-licenca-dias'); if(elLicDias) elLicDias.value='0'; const elLicDesc=document.getElementById('folha-licenca-desconto'); if(elLicDesc) elLicDesc.value='0'; const elLicSt=document.getElementById('folha-licenca-status'); if(elLicSt) elLicSt.style.display='none';
  document.getElementById('folha-total').value='0';
  document.getElementById('folha-mes-referencia').value=mesAtual;
  document.getElementById('folha-ano-referencia').value=anoAtual;
  setTodayIfEmpty('folha-data-pagamento');
}
async function salvarPagamentoFolha(event){
  event.preventDefault();
  const funcId=Number(document.getElementById('folha-funcionario-id').value);
  const funcNome=document.getElementById('folha-funcionario-nome').value;
  const salarioBase=Number(document.getElementById('folha-salario-base').value||0);
  const adicionais=Number(document.getElementById('folha-adicionais').value||0);
  const descontos=Number(document.getElementById('folha-descontos').value||0);
  const totalLiquido=Number(document.getElementById('folha-total').value||0);
  /* v2.8: Faltas */
  const faltasQtd=Number((document.getElementById('folha-faltas-qtd')||{}).value||0);
  const faltasDesconto=Number((document.getElementById('folha-faltas-desconto')||{}).value||0);
  const data=document.getElementById('folha-data-pagamento').value;
  const mesReferencia=document.getElementById('folha-mes-referencia').value;
  const anoReferencia=document.getElementById('folha-ano-referencia').value;
  const gavetaOrigem=document.getElementById('folha-gaveta-origem')?.value||'Dinheiro';
  if(!funcId||!data||totalLiquido<=0||!mesReferencia||!anoReferencia) return alert('Preencha todos os campos.');

  /* === ALERTA DE DUPLICIDADE v1.3.2 === */
  const todosPagamentos = await fetchAllSorted('folha_pagamento','data',true);
  const duplicado = todosPagamentos.find(p => p.funcionarioId === funcId && p.data === data);
  if(duplicado){
    const continuar = confirm(`⚠️ Atenção: Já existe um pagamento lançado para este funcionário hoje (${moneyBR(duplicado.totalLiquido)}). Deseja continuar mesmo assim?`);
    if(!continuar) return;
  }

  /* Liquidar vales pendentes */
  const vales=await fetchAllSorted('vale');
  const valesPendentes=vales.filter(v=>v.funcionarioId===funcId && !v.liquidado && !v.estornado); /* v3.3.2: ignora vales estornados na liquidação */

  const stores=['folha_pagamento','financeiro_lancamentos','vale'];
  const tx=db.transaction(stores,'readwrite');
  tx.objectStore('folha_pagamento').put({id:idGen(),funcionarioId:funcId,funcionarioNome:funcNome,salarioBase,adicionais,descontos,totalLiquido,faltasQtd,faltasDesconto,data,mesReferencia,anoReferencia,gavetaOrigem,updatedAt:new Date().toISOString()});
  tx.objectStore('financeiro_lancamentos').put({id:idGen(),data,tipo:'saida',valor:totalLiquido,descricao:`Folha: ${funcNome}`,formaPagamento:gavetaOrigem,gaveta:gavetaOrigem,origem:'folha',updatedAt:new Date().toISOString()});
  valesPendentes.forEach((v)=>tx.objectStore('vale').put({...v,liquidado:true,updatedAt:new Date().toISOString()}));
  await txToPromise(tx);

  const mesNome=['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][Number(mesReferencia)];
  await registrarEventoAuditoria('FOLHA','Folha paga',`Funcionário: ${funcNome}\nValor líquido: ${moneyBR(totalLiquido)}\nData: ${formatDateBR(data)}\nRef: ${mesNome}/${anoReferencia}\nGaveta: ${gavetaOrigem}`);
  resetFolhaForm(); await renderFolhaPagamentos(); await atualizarResumoFinanceiro(); await renderFinanceiro();
}
async function renderFolhaPagamentos(){
  const items=await fetchAllSorted('folha_pagamento','data',true);
  const mesNomes=['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const lista = document.getElementById('folha-pagamentos-lista');
  if(!lista) return;
  if(!items.length){ lista.innerHTML='<div class="empty-list">Nenhum pagamento registrado.</div>'; return; }
  lista.innerHTML = items.map(x=>{
    const mesNome=mesNomes[Number(x.mesReferencia||'01')]||'';
    const refText=x.mesReferencia && x.anoReferencia ? ` | Ref: ${mesNome}/${x.anoReferencia}` : '';
    const fQ=Number(x.faltasQtd||0); const fD=Number(x.faltasDesconto||0);
    const faltasInfo=fQ>0?`<br><strong style="color:#b91c1c;">Faltas: ${fQ} | Desconto Faltas: ${moneyBR(fD)}</strong>`:'';
    return `<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(x.funcionarioNome)}</h4><p class="entity-meta">Data: ${formatDateBR(x.data)}${refText}<br>Salário: ${moneyBR(x.salarioBase)} + Adicionais: ${moneyBR(x.adicionais)} - Descontos: ${moneyBR(x.descontos)}${faltasInfo}<br><strong>Total Pago: ${moneyBR(x.totalLiquido)}</strong></p></div><button class="btn-danger btn-small js-excluir-folha" data-id="${x.id}" data-valor="${x.totalLiquido}" data-gaveta="${x.gavetaOrigem||'Dinheiro'}" data-nome="${esc(x.funcionarioNome)}" data-data-original="${formatDateBR(x.data)}" type="button">🗑️ Excluir</button></div></article>`;
  }).join('');
  lista.querySelectorAll('.js-excluir-folha').forEach(b=>b.addEventListener('click',async()=>{
    const id = b.dataset.id;
    const valor = Number(b.dataset.valor||0);
    const gaveta = b.dataset.gaveta||'Dinheiro';
    const nome = b.dataset.nome;
    const ok = confirm(`🗑️ Confirma a exclusão do pagamento de ${nome} (${moneyBR(valor)})? O valor será estornado para a gaveta ${gaveta}.`);
    if(!ok) return;
    const tx = db.transaction(['folha_pagamento','financeiro_lancamentos'],'readwrite');
    tx.objectStore('folha_pagamento').delete(id);
    tx.objectStore('financeiro_lancamentos').put({id:idGen(),data:new Date().toISOString().slice(0,10),tipo:'entrada',valor,descricao:`Estorno Folha: ${nome}`,formaPagamento:gaveta,gaveta,origem:'estorno_folha',updatedAt:new Date().toISOString()});
    await txToPromise(tx);
    await renderFolhaPagamentos();
    await atualizarResumoFinanceiro();
    await renderFinanceiro();
    const horaExclusao = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const dataOriginal = b.dataset.dataOriginal || '-';
    await registrarEventoAuditoria('ESTORNO','Exclusão de folha',`Funcionário: ${nome}\nValor Estornado: ${moneyBR(valor)}\nDestino: ${gaveta}\nData Original: ${dataOriginal}\nHora da Exclusão: ${horaExclusao}`);
    alert('✅ Lançamento excluído e valor estornado para o financeiro.');
  }));
}

/* ========== VALES ========== */
async function carregarFuncionariosVales(){ const sel=document.getElementById('vale-funcionario-id'); if(!sel) return; const items=(await fetchAllSorted('funcionarios')).filter(funcionarioEstaAtivo); sel.innerHTML='<option value="">Selecione</option>'; items.forEach((f)=>{ const o=document.createElement('option'); o.value=String(f.id); o.textContent=f.nome; sel.appendChild(o); }); }
function resetValeForm(){ const f=document.getElementById('vale-form'); if(f) f.reset(); setTodayIfEmpty('vale-data'); }
async function registrarVale(event){
  event.preventDefault();
  const funcId=Number(document.getElementById('vale-funcionario-id').value);
  const valor=Number(document.getElementById('vale-valor').value||0);
  const data=document.getElementById('vale-data').value;
  const gavetaOrigem=document.getElementById('vale-gaveta-origem')?.value||'Dinheiro';
  if(!funcId||valor<=0||!data) return alert('Preencha todos os campos.');
  const func=await reqToPromise(getStore('funcionarios').get(funcId));
  if(!func) return;
  const tx=db.transaction(['vale','financeiro_lancamentos'],'readwrite');
  tx.objectStore('vale').put({id:idGen(),funcionarioId:funcId,funcionarioNome:func.nome,valor,data,liquidado:false,updatedAt:new Date().toISOString()});
  tx.objectStore('financeiro_lancamentos').put({id:idGen(),data,tipo:'saida',valor,descricao:`Vale: ${func.nome}`,formaPagamento:gavetaOrigem,gaveta:gavetaOrigem,origem:'vale',updatedAt:new Date().toISOString()});
  await txToPromise(tx);
  await registrarEventoAuditoria('VALE','Vale registrado',`Funcionário: ${func.nome}\nValor: ${moneyBR(valor)}\nGaveta: ${gavetaOrigem}`);
  await atualizarResumoFinanceiro(); await renderFinanceiro(); resetValeForm(); await renderVales();
}
async function renderVales(){ const vales=await fetchAllSorted('vale','data',true); renderEntityList('vales-lista','vales-total',vales,'Nenhum vale registrado.', (x)=>`<article class="entity-item"><div><h4 class="entity-name">${esc(x.funcionarioNome)}</h4><p class="entity-meta">Data: ${formatDateBR(x.data)}<br>Valor: ${moneyBR(x.valor)}<br>Status: ${x.liquidado?'Liquidado':'Pendente'}</p></div></article>`, null); }

/* ========== CONTAS A PAGAR (TOTAL + PARCIAL) ========== */
async function renderContasAPagar(){
  const contas=await reqToPromise(getStore('contas_pagar').getAll());
  contas.sort((a,b)=>(a.dataVencimento||'').localeCompare(b.dataVencimento||''));
  const hoje=new Date().toISOString().slice(0,10);
  const lista=document.getElementById('contas-pagar-lista');
  const totalEl=document.getElementById('contas-pagar-total');
  if(totalEl) totalEl.textContent=`${contas.length} itens`;
  if(!lista) return;
  if(!contas.length){ lista.innerHTML='<div class="empty-list">Nenhuma conta a pagar.</div>'; return; }
  lista.innerHTML=contas.map((x)=>{
    const isPaga=x.status==='Paga';
    const status=isPaga?'✅':(x.dataVencimento&&x.dataVencimento<hoje?'🔴':'🟡');
    const saldoRestante=Number(x.saldoRestante??x.valor??0);
    const valorPago=Number(x.valorPago||0);
    return `<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${status} ${esc(x.fornecedorNome)}</h4><p class="entity-meta">${esc(x.descricao)}<br>Valor Total: ${moneyBR(x.valor)} | Pago: ${moneyBR(valorPago)} | Restante: ${moneyBR(saldoRestante)}<br>Vencimento: ${x.dataVencimento?formatDateBR(x.dataVencimento):'-'} | Status: ${x.status}</p></div>${!isPaga?`<div class="row-actions"><button class="btn-small js-pagar-total" data-id="${x.id}" type="button">Pagar Total</button><button class="btn-small js-pagar-parcial" data-id="${x.id}" type="button">Pagar Parcial</button></div>`:''}</div></article>`;
  }).join('');
  lista.querySelectorAll('.js-pagar-total').forEach((b)=>b.addEventListener('click',()=>abrirModalPagarConta(Number(b.dataset.id),'total')));
  lista.querySelectorAll('.js-pagar-parcial').forEach((b)=>b.addEventListener('click',()=>abrirModalPagarConta(Number(b.dataset.id),'parcial')));
}

async function abrirModalPagarConta(contaId, modo){
  const conta=await reqToPromise(getStore('contas_pagar').get(contaId));
  if(!conta) return;
  const saldoRestante=Number(conta.saldoRestante??conta.valor??0);
  const modal=document.createElement('div');
  modal.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
  modal.innerHTML=`<div style="background:white;padding:24px;border-radius:16px;max-width:420px;width:90%;"><h3>${modo==='total'?'Pagar Total':'Pagar Parcial'}</h3><p>${esc(conta.fornecedorNome)} — ${esc(conta.descricao)}<br>Restante: <strong>${moneyBR(saldoRestante)}</strong></p>${modo==='parcial'?`<div class="field"><label>Valor a Pagar</label><input type="number" id="modal-valor-parcial" min="0.01" step="0.01" max="${saldoRestante}" /></div>`:`<p>Valor: <strong>${moneyBR(saldoRestante)}</strong></p>`}<div class="field"><label>Gaveta de Origem</label><select id="modal-gaveta-pagar"><option value="Dinheiro">Gaveta Dinheiro</option><option value="Pix">Gaveta Pix</option><option value="Tesoureiro">Gaveta Tesoureiro</option></select></div><div style="display:flex;gap:10px;margin-top:16px;"><button id="btn-cancelar-pagar" class="btn-secondary" style="flex:1;">Cancelar</button><button id="btn-confirmar-pagar" class="btn-primary" style="flex:1;">Confirmar</button></div></div>`;
  document.body.appendChild(modal);
  document.getElementById('btn-cancelar-pagar').addEventListener('click',()=>modal.remove());
  document.getElementById('btn-confirmar-pagar').addEventListener('click',async()=>{
    const valorPagar=modo==='total'?saldoRestante:Number(document.getElementById('modal-valor-parcial').value||0);
    const gaveta=document.getElementById('modal-gaveta-pagar').value;
    if(valorPagar<=0||valorPagar>saldoRestante) return alert('Valor inválido.');
    await pagarConta(contaId, valorPagar, gaveta);
    modal.remove();
  });
}

async function pagarConta(contaId, valorPagar, gaveta){
  const conta=await reqToPromise(getStore('contas_pagar').get(contaId));
  if(!conta) return;
  const saldoRestanteAtual=Number(conta.saldoRestante??conta.valor??0);
  const novoSaldoRestante=saldoRestanteAtual-valorPagar;
  const novoValorPago=Number(conta.valorPago||0)+valorPagar;
  const novoStatus=novoSaldoRestante<=0?'Paga':'Em Aberto';
  const hoje=new Date().toISOString().slice(0,10);

  const tx=db.transaction(['contas_pagar','financeiro_lancamentos'],'readwrite');
  tx.objectStore('contas_pagar').put({...conta, valorPago:novoValorPago, saldoRestante:Math.max(0,novoSaldoRestante), status:novoStatus, updatedAt:new Date().toISOString()});
  tx.objectStore('financeiro_lancamentos').put({id:idGen(),data:hoje,tipo:'saida',valor:valorPagar,descricao:`Pagamento: ${conta.fornecedorNome} (${conta.descricao})`,formaPagamento:gaveta,gaveta,origem:'conta_pagar',updatedAt:new Date().toISOString()});
  await txToPromise(tx);

  await registrarEventoAuditoria('PAGAMENTO','Conta paga',`Fornecedor: ${conta.fornecedorNome}\nValor: ${moneyBR(valorPagar)}\nGaveta: ${gaveta}\nRestante: ${moneyBR(Math.max(0,novoSaldoRestante))}`);
  await atualizarResumoFinanceiro(); await renderFinanceiro(); await renderContasAPagar();
}

/* ========== FECHAMENTO DE CAIXA v1.8 ========== */
async function renderTelaFechamentoCaixa(){
  const hoje=new Date().toISOString().slice(0,10);
  const lancamentos=await reqToPromise(getStore('financeiro_lancamentos').getAll());
  const hojeItems=lancamentos.filter(l=>l.data===hoje);
  const getGaveta=l=>l.gaveta||l.formaPagamento||'Dinheiro';
  /* Saldos históricos por gaveta */
  let saldoDinheiro=0, saldoPix=0, saldoTesoureiro=0;
  lancamentos.forEach(l=>{
    const v=Number(l.valor||0); const g=getGaveta(l);
    if(l.tipo==='entrada'){ if(g==='Dinheiro') saldoDinheiro+=v; else if(g==='Pix') saldoPix+=v; else if(g==='Tesoureiro') saldoTesoureiro+=v; }
    else { if(g==='Dinheiro') saldoDinheiro-=v; else if(g==='Pix') saldoPix-=v; else if(g==='Tesoureiro') saldoTesoureiro-=v; }
  });
  const totalEntradas=hojeItems.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+Number(l.valor||0),0);
  const totalSaidas=hojeItems.filter(l=>l.tipo==='saida').reduce((s,l)=>s+Number(l.valor||0),0);
  const saldoEsperado=totalEntradas-totalSaidas;
  const elEnt=document.getElementById('fechamento-entradas'); if(elEnt) elEnt.textContent=moneyBR(totalEntradas);
  const elSai=document.getElementById('fechamento-saidas'); if(elSai) elSai.textContent=moneyBR(totalSaidas);
  const elSaldo=document.getElementById('fechamento-saldo-esperado'); if(elSaldo) elSaldo.textContent=moneyBR(saldoEsperado);
  /* Preencher saldos esperados por gaveta */
  const elExpDin=document.getElementById('fechamento-esperado-dinheiro'); if(elExpDin) elExpDin.textContent=moneyBR(saldoDinheiro);
  const elExpPix=document.getElementById('fechamento-esperado-pix'); if(elExpPix) elExpPix.textContent=moneyBR(saldoPix);
  const elExpTes=document.getElementById('fechamento-esperado-tesoureiro'); if(elExpTes) elExpTes.textContent=moneyBR(saldoTesoureiro);
  /* Bloquear campo Tesoureiro */
  const elTes=document.getElementById('fechamento-tesoureiro-contado'); if(elTes){ elTes.value=saldoTesoureiro.toFixed(2); elTes.readOnly=true; elTes.style.background='#f1f5f9'; }
  /* Limpar campos editáveis */
  const elDin=document.getElementById('fechamento-dinheiro-contado'); if(elDin) elDin.value='';
  const elPix=document.getElementById('fechamento-pix-contado'); if(elPix) elPix.value='';
  const elDif=document.getElementById('fechamento-diferenca'); if(elDif) elDif.textContent='';
  /* Listener de cálculo em tempo real */
  function calcDiferencas(){
    const dinContado=Number(document.getElementById('fechamento-dinheiro-contado')?.value||0);
    const pixContado=Number(document.getElementById('fechamento-pix-contado')?.value||0);
    const difDin=dinContado-saldoDinheiro; const difPix=pixContado-saldoPix;
    const elDD=document.getElementById('fechamento-dif-dinheiro'); if(elDD){ elDD.textContent=(difDin>=0?'+':'')+moneyBR(difDin); elDD.style.color=difDin>=0?'#15803d':'#b91c1c'; }
    const elDP=document.getElementById('fechamento-dif-pix'); if(elDP){ elDP.textContent=(difPix>=0?'+':'')+moneyBR(difPix); elDP.style.color=difPix>=0?'#15803d':'#b91c1c'; }
    const totalContado=dinContado+pixContado+saldoTesoureiro;
    const totalEsperado=saldoDinheiro+saldoPix+saldoTesoureiro;
    const difTotal=totalContado-totalEsperado;
    const st=difTotal===0?'✅ Conferido':difTotal>0?`➕ Sobra ${moneyBR(Math.abs(difTotal))}`:`➖ Falta ${moneyBR(Math.abs(difTotal))}`;
    const elDifEl=document.getElementById('fechamento-diferenca'); if(elDifEl){ elDifEl.textContent=st; elDifEl.style.color=difTotal>=0?'#15803d':'#b91c1c'; }
  }
  document.getElementById('fechamento-dinheiro-contado')?.addEventListener('input',calcDiferencas);
  document.getElementById('fechamento-pix-contado')?.addEventListener('input',calcDiferencas);
}
async function fecharCaixa(){
  const dinheiroContado=Number(document.getElementById('fechamento-dinheiro-contado')?.value||0);
  const pixContado=Number(document.getElementById('fechamento-pix-contado')?.value||0);
  const hoje=new Date().toISOString().slice(0,10);
  const lancamentos=await reqToPromise(getStore('financeiro_lancamentos').getAll());
  const hojeItems=lancamentos.filter(l=>l.data===hoje);
  const getGaveta=l=>l.gaveta||l.formaPagamento||'Dinheiro';
  let saldoDinheiro=0, saldoPix=0, saldoTesoureiro=0;
  lancamentos.forEach(l=>{
    const v=Number(l.valor||0); const g=getGaveta(l);
    if(l.tipo==='entrada'){ if(g==='Dinheiro') saldoDinheiro+=v; else if(g==='Pix') saldoPix+=v; else if(g==='Tesoureiro') saldoTesoureiro+=v; }
    else { if(g==='Dinheiro') saldoDinheiro-=v; else if(g==='Pix') saldoPix-=v; else if(g==='Tesoureiro') saldoTesoureiro-=v; }
  });
  const totalEntradas=hojeItems.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+Number(l.valor||0),0);
  const totalSaidas=hojeItems.filter(l=>l.tipo==='saida').reduce((s,l)=>s+Number(l.valor||0),0);
  const saldoEsperado=totalEntradas-totalSaidas;
  const totalContado=dinheiroContado+pixContado+saldoTesoureiro;
  const diferenca=totalContado-(saldoDinheiro+saldoPix+saldoTesoureiro);
  const tx=db.transaction('fechamentos_caixa','readwrite');
  tx.objectStore('fechamentos_caixa').put({id:idGen(),data:hoje,totalEntradas,totalSaidas,saldoEsperado,dinheiroContado,pixContado,saldoTesoureiro,diferenca,updatedAt:new Date().toISOString()});
  await txToPromise(tx);
  const status=diferenca===0?'✅':diferenca>0?'➕':'➖';
  const elDif=document.getElementById('fechamento-diferenca');
  if(elDif){ elDif.textContent=`${status} ${moneyBR(Math.abs(diferenca))}`; elDif.style.color=diferenca>=0?'#15803d':'#b91c1c'; }
  await preencherRelatorioFechamento(hojeItems, saldoEsperado, totalContado, {dinheiroContado, pixContado, saldoTesoureiro, saldoDinheiro, saldoPix});
  const btnCompartilhar=document.getElementById('btn-compartilhar-fechamento');
  if(btnCompartilhar) btnCompartilhar.style.display='block';
  /* Enviar Super Resumo Telegram */
  await enviarSuperResumoTelegram(hojeItems, {dinheiroContado, pixContado, saldoTesoureiro, saldoDinheiro, saldoPix, diferenca, status});

  /* v2.9: Snapshot silencioso (caixa preta) + envio JSON completo via Telegram */
  if(typeof BackupManager !== 'undefined'){
    try{
      await BackupManager.salvarSnapshot(db, 'fechamento_caixa');
      await BackupManager.enviarJSONTelegram(db, _telegramToken, _telegramChatId1, _telegramChatId2);
    }catch(e){ console.error('[Fechamento] Erro no backup/envio JSON:', e); }
  }

  alert(`Caixa fechado! Diferença: ${status} ${moneyBR(Math.abs(diferenca))}`);
}

/* ========== RELATÓRIOS v4.1 — VENDAS LÍQUIDAS (base v4.0 preservada) ========== */
/*
 * Camada exclusivamente de leitura/apresentação.
 * Critério temporal preservado: a competência é a data da venda (v.data).
 * Estornos válidos vinculados à venda reduzem sua quantidade e faturamento
 * no mesmo período da venda, sem alterar data, estoque, financeiro ou banco.
 */
function _relVendasCampoExiste(valor){
  return valor!==undefined && valor!==null && valor!=='';
}
function _relVendasNumero(obj,...campos){
  for(const campo of campos){
    if(_relVendasCampoExiste(obj?.[campo])){
      const valor=Number(obj[campo]);
      return Number.isFinite(valor)?valor:0;
    }
  }
  return 0;
}
function _relVendasChave(valor){ return String(valor??''); }
function _relVendasItemId(item){
  if(_relVendasCampoExiste(item?.produtoId)) return _relVendasChave(item.produtoId);
  if(_relVendasCampoExiste(item?.itemId)) return _relVendasChave(item.itemId);
  return '';
}
function _relVendasEstornoValido(movimento){
  if(!movimento || movimento.origem!=='estorno_venda' || movimento.tipo!=='entrada') return false;
  if([movimento.cancelado,movimento.cancelada,movimento.invalido,movimento.invalidado,movimento.anulado,movimento.anulada,movimento.excluido].some(v=>v===true)) return false;
  const status=String(movimento.statusEstorno??movimento.status??'').trim().toLowerCase();
  return !['cancelado','cancelada','inválido','invalido','invalidado','anulado','anulada','excluído','excluido'].includes(status);
}
function _relVendasQtdEstorno(movimento){
  return Math.max(0,_relVendasNumero(movimento,'quantidadeEstornada','quantidadeEstorno','quantidade','qtd','unidades'));
}
function _relVendasValorEstorno(movimento){
  for(const campo of ['valorEstornado','valorEstorno','subtotalEstornado','valorItemEstornado']){
    if(_relVendasCampoExiste(movimento?.[campo])){
      const valor=Number(movimento[campo]);
      return Number.isFinite(valor)?Math.max(0,valor):0;
    }
  }
  return null;
}
function _relVendasIndiceEstorno(movimento){
  const valor=movimento?.itemIndex??movimento?.indiceItem??movimento?.linhaItem??movimento?.produtoIndex;
  if(!(valor===0 || _relVendasCampoExiste(valor)) || !/^\d+$/.test(String(valor))) return null;
  return Number(valor);
}
function _relVendasQtdItem(item){ return Math.max(0,_relVendasNumero(item,'quantidade','qtd','unidades')); }
function _relVendasValorItem(item){
  if(_relVendasCampoExiste(item?.subtotal)) return Math.max(0,Number(item.subtotal)||0);
  if(_relVendasCampoExiste(item?.valor)) return Math.max(0,Number(item.valor)||0);
  return _relVendasQtdItem(item)*Math.max(0,_relVendasNumero(item,'precoUnitario','preco','valorUnitario'));
}
function _relVendasPrecoHistorico(linha){
  if(linha.quantidadeBruta>0) return linha.valorBruto/linha.quantidadeBruta;
  return Math.max(0,_relVendasNumero(linha.item,'precoUnitario','preco','valorUnitario'));
}
function _relVendasAplicarEstorno(linhas,movimento){
  const idItem=_relVendasCampoExiste(movimento?.itemId)?_relVendasChave(movimento.itemId):(_relVendasCampoExiste(movimento?.produtoId)?_relVendasChave(movimento.produtoId):'');
  const indice=_relVendasIndiceEstorno(movimento);
  let candidatas=[];
  if(indice!==null && linhas[indice]) candidatas=[linhas[indice]];
  else if(idItem) candidatas=linhas.filter(linha=>_relVendasItemId(linha.item)===idItem);
  if(!candidatas.length) return;

  /* Sem índice/preço explícito, não escolher arbitrariamente entre duas linhas do mesmo produto. */
  const precoExplicito=movimento?.precoUnitarioEstornado??movimento?.precoEstornado;
  if(candidatas.length>1 && indice===null && !_relVendasCampoExiste(precoExplicito)) return;
  if(_relVendasCampoExiste(precoExplicito)){
    const alvo=Number(precoExplicito);
    const porPreco=candidatas.filter(linha=>Math.abs(_relVendasPrecoHistorico(linha)-alvo)<0.005);
    if(porPreco.length) candidatas=porPreco;
    else if(candidatas.length>1) return;
  }

  let quantidadeRestante=_relVendasQtdEstorno(movimento);
  const valorRegistrado=_relVendasValorEstorno(movimento);
  if(quantidadeRestante<=0 && !(valorRegistrado>0)) return;
  if(quantidadeRestante<=0 && valorRegistrado>0){
    const preco=_relVendasPrecoHistorico(candidatas[0]);
    quantidadeRestante=preco>0?valorRegistrado/preco:0;
  }

  const alocacoes=[];
  for(const linha of candidatas){
    if(quantidadeRestante<=0) break;
    const disponivel=Math.max(0,linha.quantidadeBruta-linha.quantidadeEstornada);
    if(disponivel<=0) continue;
    const quantidade=Math.min(disponivel,quantidadeRestante);
    linha.quantidadeEstornada+=quantidade;
    quantidadeRestante-=quantidade;
    alocacoes.push({linha,quantidade});
  }
  if(!alocacoes.length) return;

  if(valorRegistrado!==null){
    let valorRestante=valorRegistrado;
    alocacoes.forEach((alocacao,indiceAlocacao)=>{
      const limite=Math.max(0,alocacao.linha.valorBruto-alocacao.linha.valorEstornado);
      const parte=indiceAlocacao===alocacoes.length-1?valorRestante:Math.min(limite,alocacao.quantidade*_relVendasPrecoHistorico(alocacao.linha));
      const aplicada=Math.min(limite,Math.max(0,parte));
      alocacao.linha.valorEstornado+=aplicada;
      valorRestante-=aplicada;
    });
  } else {
    alocacoes.forEach(({linha,quantidade})=>{
      const limite=Math.max(0,linha.valorBruto-linha.valorEstornado);
      linha.valorEstornado+=Math.min(limite,quantidade*_relVendasPrecoHistorico(linha));
    });
  }
}
function _relVendasNormalizarVenda(venda,movimentos){
  const itens=Array.isArray(venda?.itens)?venda.itens:[];
  const linhas=itens.map((item,indice)=>({item,indice,quantidadeBruta:_relVendasQtdItem(item),valorBruto:_relVendasValorItem(item),quantidadeEstornada:0,valorEstornado:0}));
  const vendaEstornada=String(venda?.statusPagamento||'').trim().toLowerCase()==='estornado';
  if(vendaEstornada){
    /* O status operacional Estornado representa estorno integral. */
    linhas.forEach(linha=>{ linha.quantidadeEstornada=linha.quantidadeBruta; linha.valorEstornado=linha.valorBruto; });
  } else {
    movimentos.forEach(movimento=>_relVendasAplicarEstorno(linhas,movimento));
  }
  const itensLiquidos=linhas.map(linha=>({...linha.item,quantidadeBruta:linha.quantidadeBruta,quantidadeEstornada:linha.quantidadeEstornada,quantidadeLiquida:Math.max(0,linha.quantidadeBruta-linha.quantidadeEstornada),valorBruto:linha.valorBruto,valorEstornado:Math.min(linha.valorBruto,linha.valorEstornado),valorLiquido:Math.max(0,linha.valorBruto-Math.min(linha.valorBruto,linha.valorEstornado))}));
  const quantidadeBruta=linhas.reduce((s,linha)=>s+linha.quantidadeBruta,0);
  const quantidadeEstornada=linhas.reduce((s,linha)=>s+Math.min(linha.quantidadeBruta,linha.quantidadeEstornada),0);
  const quantidadeLiquida=Math.max(0,quantidadeBruta-quantidadeEstornada);
  const valorBrutoItens=linhas.reduce((s,linha)=>s+linha.valorBruto,0);
  const valorBruto=_relVendasCampoExiste(venda?.total)?Math.max(0,Number(venda.total)||0):valorBrutoItens;
  const valorEstornado=vendaEstornada?valorBruto:Math.min(valorBruto,linhas.reduce((s,linha)=>s+Math.min(linha.valorBruto,linha.valorEstornado),0));
  return {...venda,itensLiquidos,quantidadeBruta,quantidadeEstornada,quantidadeLiquida,valorBruto,valorEstornado,valorLiquido:Math.max(0,valorBruto-valorEstornado)};
}
async function _carregarVendasLiquidasRelatorios(){
  const [vendas,movimentos]=await Promise.all([fetchAllSorted('vendas','data',true),reqToPromise(getStore('movimentos_estoque').getAll())]);
  const porVenda=new Map();
  const idsVistos=new Set();
  movimentos.filter(_relVendasEstornoValido).forEach((movimento,indice)=>{
    const referencia=movimento.referenciaId??movimento.vendaId??movimento.pedidoId;
    if(!_relVendasCampoExiste(referencia)) return;
    const idRegistro=_relVendasCampoExiste(movimento.id)?`id:${_relVendasChave(movimento.id)}`:`idx:${indice}`;
    if(idsVistos.has(idRegistro)) return;
    idsVistos.add(idRegistro);
    const chave=_relVendasChave(referencia);
    if(!porVenda.has(chave)) porVenda.set(chave,[]);
    porVenda.get(chave).push(movimento);
  });
  return vendas.map(venda=>_relVendasNormalizarVenda(venda,porVenda.get(_relVendasChave(venda.id))||[]));
}
function _relVendasResumo(vendas){
  return vendas.reduce((resumo,venda)=>{
    resumo.vendasLiquidas+=venda.valorLiquido>0||venda.quantidadeLiquida>0?1:0;
    resumo.quantidadeBruta+=venda.quantidadeBruta;
    resumo.quantidadeEstornada+=venda.quantidadeEstornada;
    resumo.quantidadeLiquida+=venda.quantidadeLiquida;
    resumo.valorBruto+=venda.valorBruto;
    resumo.valorEstornado+=venda.valorEstornado;
    resumo.valorLiquido+=venda.valorLiquido;
    if(venda.statusPagamento==='Recebido') resumo.recebido+=venda.valorLiquido;
    if(venda.statusPagamento==='Em Aberto') resumo.aReceber+=Math.max(0,Math.min(Number(venda.saldoDevedor||0),venda.valorLiquido));
    return resumo;
  },{vendasLiquidas:0,quantidadeBruta:0,quantidadeEstornada:0,quantidadeLiquida:0,valorBruto:0,valorEstornado:0,valorLiquido:0,recebido:0,aReceber:0});
}
function _relVendasVendaValida(venda){
  return Number(venda?.valorLiquido||0)>0 || Number(venda?.quantidadeLiquida||0)>0;
}
function _relVendasQtdBR(valor){ return Number(valor||0).toLocaleString('pt-BR',{maximumFractionDigits:2}); }

async function renderRelatorioVendas(periodo){
  const vendas=await _carregarVendasLiquidasRelatorios();
  const hoje=new Date(); const hojeStr=hoje.toISOString().slice(0,10);
  const mesAtual=`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const filtradas=periodo==='hoje'?vendas.filter(v=>v.data===hojeStr):vendas.filter(v=>v.data&&v.data.startsWith(mesAtual));
  const resumo=_relVendasResumo(filtradas);
  const periodoLabel=periodo==='hoje'?'Hoje':mesAtual;
  const indicadores=[
    ['Quantidade de vendas',resumo.vendasLiquidas],
    ['Quantidade líquida',_relVendasQtdBR(resumo.quantidadeLiquida)],
    ['Total de pedidos',filtradas.length],
    ['Faturamento',moneyBR(resumo.valorLiquido)],
    ['Total recebido',moneyBR(resumo.recebido)],
    ['Total a receber',moneyBR(resumo.aReceber)],
    ['Quantidade bruta',_relVendasQtdBR(resumo.quantidadeBruta)],
    ['Quantidade estornada',_relVendasQtdBR(resumo.quantidadeEstornada)],
    ['Valor bruto',moneyBR(resumo.valorBruto)],
    ['Valor estornado',moneyBR(resumo.valorEstornado)],
    ['Valor líquido',moneyBR(resumo.valorLiquido)],
    ['Vendas com saldo líquido',resumo.vendasLiquidas]
  ];
  let html=`<div class="relatorio-vendas-resumo-cabecalho"><strong>Período: ${esc(periodoLabel)}</strong><span>Apuração líquida conforme a versão 4.0</span></div>`;
  html+='<div class="relatorio-vendas-indicadores">';
  indicadores.forEach(([rotulo,valor])=>{ html+=`<div class="relatorio-vendas-indicador"><span class="relatorio-vendas-indicador-label">${esc(rotulo)}</span><strong class="relatorio-vendas-indicador-value">${esc(valor)}</strong></div>`; });
  html+='</div>';
  html+=`<div class="relatorio-vendas-resumo-detalhado"><strong>Detalhamento do período</strong><br>Bruto: ${_relVendasQtdBR(resumo.quantidadeBruta)} un. / ${moneyBR(resumo.valorBruto)}<br>Estornado: ${_relVendasQtdBR(resumo.quantidadeEstornada)} un. / ${moneyBR(resumo.valorEstornado)}<br>Líquido: ${_relVendasQtdBR(resumo.quantidadeLiquida)} un. / ${moneyBR(resumo.valorLiquido)}</div>`;
  if(filtradas.length){
    html+='<div class="relatorio-vendas-lista-periodo">';
    filtradas.forEach((venda)=>{
      const estorno=venda.valorEstornado>0||venda.quantidadeEstornada>0;
      const detalhe=estorno?` · Bruto: ${moneyBR(venda.valorBruto)} · Estorno: ${moneyBR(venda.valorEstornado)} · Líquido: ${moneyBR(venda.valorLiquido)}`:'';
      html+=`<div class="relatorio-vendas-linha">${formatDateBR(venda.data)} — <strong>${esc(venda.clienteNome||'Cliente não identificado')}</strong>: ${moneyBR(venda.valorLiquido)} (${esc(venda.statusPagamento||'Não informado')})${detalhe}</div>`;
    });
    html+='</div>';
  } else {
    html+='<div class="empty-list" style="margin-top:12px;">Nenhuma venda encontrada no período selecionado.</div>';
  }
  const el=document.getElementById('relatorio-vendas-detalhe'); if(el) el.innerHTML=html;
}

/* ========== ANÁLISE MATRICIAL v4.1 — apresentação ampliada ========== */
let _matrizModo = 'qtd'; /* 'qtd' ou 'fat' */

async function renderMatrizVendas(modo){
  _matrizModo = modo || _matrizModo;
  const anoInput = document.getElementById('matriz-ano');
  const mesInput = document.getElementById('matriz-mes');
  const container = document.getElementById('matriz-vendas-container');
  if(!container) return;
  const ano = anoInput ? String(anoInput.value || new Date().getFullYear()) : String(new Date().getFullYear());
  const mes = mesInput ? mesInput.value : '';
  document.querySelectorAll('.matriz-tab-btn').forEach(b => b.classList.remove('active'));
  const btnAtivo = document.getElementById(_matrizModo === 'qtd' ? 'btn-matriz-qtd' : 'btn-matriz-fat');
  if(btnAtivo) btnAtivo.classList.add('active');
  const vendas = await _carregarVendasLiquidasRelatorios();
  const prefixo = mes ? `${ano}-${mes}` : ano;
  const filtradas = vendas.filter(v => v.data && v.data.startsWith(prefixo));
  const vendasValidas = filtradas.filter(_relVendasVendaValida);
  if(!vendasValidas.length && !mes){ container.innerHTML = '<div class="empty-list">Nenhuma venda líquida encontrada para o período selecionado.</div>'; return; }
  const produtosMap = {};
  const colunasSet = new Set(mes ? Array.from({length:new Date(Number(ano),Number(mes),0).getDate()},(_,i)=>String(i+1).padStart(2,'0')) : []);
  vendasValidas.forEach(v => {
    const col = mes ? v.data.slice(8, 10) : v.data.slice(5, 7);
    colunasSet.add(col);
    (v.itensLiquidos || []).forEach(it => { produtosMap[it.produtoNome || 'Desconhecido'] = true; });
  });
  const colunas = Array.from(colunasSet).sort();
  const produtos = Object.keys(produtosMap).sort();
  const MESES_ABREV = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const nomeColuna = col => mes ? `Dia ${col}` : (MESES_ABREV[parseInt(col, 10)] || col);
  const matriz = {};
  const totaisColunas = {};
  const totaisProdutos = {};
  colunas.forEach(c => { totaisColunas[c] = 0; });
  produtos.forEach(p => { totaisProdutos[p] = 0; matriz[p] = {}; colunas.forEach(c => { matriz[p][c] = 0; }); });
  vendasValidas.forEach(v => {
    const col = mes ? v.data.slice(8, 10) : v.data.slice(5, 7);
    (v.itensLiquidos || []).forEach(it => {
      const nome = it.produtoNome || 'Desconhecido';
      const val = _matrizModo === 'qtd' ? Number(it.quantidadeLiquida || 0) : Number(it.valorLiquido || 0);
      if(matriz[nome] !== undefined){
        matriz[nome][col] = (matriz[nome][col] || 0) + val;
        totaisColunas[col] = (totaisColunas[col] || 0) + val;
        totaisProdutos[nome] = (totaisProdutos[nome] || 0) + val;
      }
    });
  });
  const totalGeral = Object.values(totaisProdutos).reduce((s, v) => s + v, 0);
  const isFat = _matrizModo === 'fat';
  const fmt = v => isFat ? moneyBR(v) : (v > 0 ? String(v) : '-');
  let html = '<table class="matriz-tabela">';
  html += '<thead><tr><th class="col-produto">Produto</th>';
  colunas.forEach(c => { html += `<th>${nomeColuna(c)}</th>`; });
  html += '<th class="col-total">TOTAL</th></tr></thead><tbody>';
  produtos.forEach(p => {
    html += `<tr><td class="col-produto">${esc(p)}</td>`;
    colunas.forEach(c => { const v = matriz[p][c] || 0; html += `<td class="${v > 0 ? 'cel-positivo' : 'cel-zero'}">${fmt(v)}</td>`; });
    html += `<td class="col-total">${fmt(totaisProdutos[p])}</td></tr>`;
  });
  html += '<tr class="linha-total"><td class="col-produto">TOTAL</td>';
  colunas.forEach(c => { html += `<td>${fmt(totaisColunas[c] || 0)}</td>`; });
  html += `<td class="col-total">${fmt(totalGeral)}</td></tr></tbody></table>`;
  container.innerHTML = html;
}


/* ========== HISTÓRICO DETALHADO DE VENDAS v4.1 — somente leitura ========== */
let _historicoVendasDados=null;
let _historicoVendasDataAtual='';

function _historicoVendasHojeLocal(){
  const agora=new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth()+1).padStart(2,'0')}-${String(agora.getDate()).padStart(2,'0')}`;
}
function _historicoVendasHora(venda){
  const hora=venda?.hora||venda?.horario||venda?.horaVenda||venda?.horarioVenda;
  if(hora) return String(hora).slice(0,8);
  /* O estorno operacional da v4.0 atualiza updatedAt da venda. Sem um campo
     histórico próprio, não apresentar a hora do estorno como hora da venda. */
  if(String(venda?.statusPagamento||'').trim().toLowerCase()==='estornado') return '';
  const ts=String(venda?.updatedAt||'');
  if(!ts) return '';
  if(venda?.data&&ts.slice(0,10)!==String(venda.data).slice(0,10)) return '';
  const dataTs=new Date(ts);
  if(Number.isNaN(dataTs.getTime())) return '';
  return dataTs.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
function _historicoVendasOrdem(venda){
  const hora=_historicoVendasHora(venda);
  const horaKey=hora?hora.replaceAll(':',''):'999999';
  return `${String(venda?.data||'9999-99-99')}T${horaKey}|${String(venda?.updatedAt||'')}|${String(venda?.id||'')}`;
}
function _historicoVendasEstornoReferencia(movimento){
  return movimento?.referenciaId??movimento?.vendaId??movimento?.pedidoId;
}
async function _historicoVendasCarregarDados(){
  if(_historicoVendasDados) return _historicoVendasDados;
  const [vendas,movimentos]=await Promise.all([
    _carregarVendasLiquidasRelatorios(),
    reqToPromise(getStore('movimentos_estoque').getAll())
  ]);
  const estornos=[];
  const estornosPorVenda=new Map();
  movimentos.filter(_relVendasEstornoValido).forEach((movimento)=>{
    const referencia=_historicoVendasEstornoReferencia(movimento);
    if(!_relVendasCampoExiste(referencia)) return;
    const chave=_relVendasChave(referencia);
    const registro={...movimento,referenciaVenda:chave};
    estornos.push(registro);
    if(!estornosPorVenda.has(chave)) estornosPorVenda.set(chave,[]);
    estornosPorVenda.get(chave).push(registro);
  });
  vendas.sort((a,b)=>_historicoVendasOrdem(a).localeCompare(_historicoVendasOrdem(b)));
  estornos.sort((a,b)=>_historicoVendasOrdem(a).localeCompare(_historicoVendasOrdem(b)));
  _historicoVendasDados={vendas,estornos,estornosPorVenda};
  return _historicoVendasDados;
}
function _historicoVendasDataLabel(data){ return data?formatDateBR(data):'Data não informada'; }
function _historicoVendasItemTexto(item){ return String(item?.produtoNome||item?.produto||'Produto não identificado').toLowerCase(); }
function _historicoVendasVendaCombina(venda,termo){
  if(!termo) return true;
  const cliente=String(venda?.clienteNome||'').toLowerCase();
  return cliente.includes(termo)||(venda.itensLiquidos||[]).some(item=>_historicoVendasItemTexto(item).includes(termo));
}
function _historicoVendasMovimentoCombina(movimento,venda,termo){
  if(!termo) return true;
  const cliente=String(venda?.clienteNome||movimento?.clienteNome||'').toLowerCase();
  const produto=String(movimento?.itemNome||movimento?.produtoNome||'').toLowerCase();
  return cliente.includes(termo)||produto.includes(termo);
}
function _historicoVendasQuantidadeTexto(valor){ return _relVendasQtdBR(valor); }
function _historicoVendasRenderResumo(vendas,estornosDoDia,filtradas){
  const resumo=_relVendasResumo(vendas);
  const clientes=new Set(vendas.map(v=>_relVendasCampoExiste(v.clienteId)?`id:${v.clienteId}`:`nome:${String(v.clienteNome||'').toLowerCase()}`));
  let html=`<div class="historico-vendas-resumo-item"><span>Vendas</span><strong>${vendas.length}</strong></div>`;
  html+=`<div class="historico-vendas-resumo-item"><span>Clientes atendidos</span><strong>${clientes.size}</strong></div>`;
  html+=`<div class="historico-vendas-resumo-item"><span>Quantidade líquida</span><strong>${_historicoVendasQuantidadeTexto(resumo.quantidadeLiquida)}</strong></div>`;
  html+=`<div class="historico-vendas-resumo-item"><span>Faturamento líquido</span><strong>${moneyBR(resumo.valorLiquido)}</strong></div>`;
  html+=`<div class="historico-vendas-resumo-item"><span>Quantidade estornada</span><strong>${_historicoVendasQuantidadeTexto(resumo.quantidadeEstornada)}</strong></div>`;
  html+=`<div class="historico-vendas-resumo-item"><span>Valor estornado</span><strong>${moneyBR(resumo.valorEstornado)}</strong></div>`;
  if(estornosDoDia.length){
    const qtd=estornosDoDia.reduce((s,m)=>s+_relVendasQtdEstorno(m),0);
    const valor=estornosDoDia.reduce((s,m)=>s+Number(_relVendasValorEstorno(m)||0),0);
    html+=`<div class="historico-vendas-resumo-item"><span>Estornos registrados na data</span><strong>${_historicoVendasQuantidadeTexto(qtd)} un. · ${moneyBR(valor)}</strong></div>`;
  }
  if(filtradas){
    const resumoPesquisa=_relVendasResumo(filtradas);
    html+=`<div class="historico-vendas-pesquisa-total">Total da pesquisa: ${filtradas.length} venda(s) · ${_historicoVendasQuantidadeTexto(resumoPesquisa.quantidadeLiquida)} un. líquidas · ${moneyBR(resumoPesquisa.valorLiquido)}</div>`;
  }
  return html;
}
function _historicoVendasRenderVenda(venda,estornos){
  const itens=Array.isArray(venda.itensLiquidos)?venda.itensLiquidos:[];
  const temEstorno=venda.quantidadeEstornada>0||venda.valorEstornado>0||String(venda.statusPagamento||'').toLowerCase()==='estornado';
  const status=temEstorno?`Estorno: ${_historicoVendasQuantidadeTexto(venda.quantidadeEstornada)} un. / ${moneyBR(venda.valorEstornado)}`:(venda.statusPagamento||'Situação não informada');
  let html=`<article class="historico-venda-card${temEstorno?' historico-venda-estornada':''}">`;
  html+=`<div class="historico-venda-cabecalho"><div><h4>${_historicoVendasHora(venda)||'Horário não informado'} — ${esc(venda.clienteNome||'Cliente não identificado')}</h4><p class="historico-venda-meta">Data: ${_historicoVendasDataLabel(venda.data)} · Forma de pagamento: ${esc(venda.formaPagamento||'Não informada')}</p></div><span class="historico-venda-status${temEstorno?' estorno':''}">${esc(status)}</span></div>`;
  if(!itens.length){
    html+='<div class="empty-list">Itens não identificados na estrutura histórica desta venda.</div>';
  } else {
    html+='<div class="historico-venda-tabela-wrap"><table class="historico-venda-tabela"><thead><tr><th>Produto</th><th>Qtd. original</th><th>Qtd. estornada</th><th>Qtd. líquida</th><th>Preço unitário</th><th>Subtotal original</th><th>Valor estornado</th><th>Subtotal líquido</th></tr></thead><tbody>';
    itens.forEach((item)=>{
      const unit=_relVendasCampoExiste(item?.precoUnitario)?moneyBR(item.precoUnitario):'Não informado';
      html+=`<tr><td data-label="Produto">${esc(item.produtoNome||'Produto não identificado')}</td><td data-label="Qtd. original">${_historicoVendasQuantidadeTexto(item.quantidadeBruta)}</td><td data-label="Qtd. estornada" class="historico-estorno-cell">${_historicoVendasQuantidadeTexto(item.quantidadeEstornada)}</td><td data-label="Qtd. líquida" class="historico-liquido-cell">${_historicoVendasQuantidadeTexto(item.quantidadeLiquida)}</td><td data-label="Preço unitário">${unit}</td><td data-label="Subtotal original">${moneyBR(item.valorBruto)}</td><td data-label="Valor estornado" class="historico-estorno-cell">${moneyBR(item.valorEstornado)}</td><td data-label="Subtotal líquido" class="historico-liquido-cell">${moneyBR(item.valorLiquido)}</td></tr>`;
    });
    html+='</tbody></table></div>';
  }
  html+=`<div class="historico-venda-total"><span>Valor total original: <strong>${moneyBR(venda.valorBruto)}</strong></span><span>Valor estornado: <strong>${moneyBR(venda.valorEstornado)}</strong></span><span>Total líquido da venda: <strong>${moneyBR(venda.valorLiquido)}</strong></span></div>`;
  if(estornos?.length){
    const datas=[...new Set(estornos.map(m=>m.data).filter(Boolean))].sort();
    const textoDatas=datas.map(_historicoVendasDataLabel).join(', ');
    html+=`<div class="historico-venda-conferencia alerta">↩ Estorno identificado nos registros de estoque${textoDatas?` nas datas: ${textoDatas}`:''}. A venda original permanece visível e os valores líquidos seguem a apuração da v4.0.</div>`;
  }
  html+='</article>';
  return html;
}
function _historicoVendasRenderEstornoForaDoDia(movimento,venda){
  const produto=movimento.itemNome||movimento.produtoNome||'Produto não identificado';
  const quantidade=_relVendasQtdEstorno(movimento);
  const valor=_relVendasValorEstorno(movimento);
  return `<article class="historico-estorno-evento"><h4>↩ Estorno registrado em ${_historicoVendasDataLabel(movimento.data)}</h4><p><strong>Cliente:</strong> ${esc(venda?.clienteNome||'Cliente não identificado')}</p><p><strong>Venda original:</strong> ${_historicoVendasDataLabel(venda?.data)}${venda?.id!==undefined?` · Pedido #${esc(venda.id)}`:''}</p><p><strong>Produto:</strong> ${esc(produto)} · <strong>Quantidade estornada:</strong> ${_historicoVendasQuantidadeTexto(quantidade)}${valor!==null?` · <strong>Valor estornado:</strong> ${moneyBR(valor)}`:''}</p><p>A data da venda original e a data do estorno foram preservadas.</p></article>`;
}
async function renderHistoricoVendas(){
  const dataEl=document.getElementById('historico-vendas-data');
  const lista=document.getElementById('historico-vendas-lista');
  if(!dataEl||!lista) return;
  if(!dataEl.value) dataEl.value=_historicoVendasHojeLocal();
  _historicoVendasDataAtual=dataEl.value;
  const dados=await _historicoVendasCarregarDados();
  const termo=String(document.getElementById('historico-vendas-pesquisa')?.value||'').trim().toLowerCase();
  const vendasDoDia=dados.vendas.filter(v=>v.data===_historicoVendasDataAtual).sort((a,b)=>_historicoVendasOrdem(a).localeCompare(_historicoVendasOrdem(b)));
  const estornosDoDia=dados.estornos.filter(m=>m.data===_historicoVendasDataAtual).sort((a,b)=>_historicoVendasOrdem(a).localeCompare(_historicoVendasOrdem(b)));
  const vendasFiltradas=vendasDoDia.filter(v=>_historicoVendasVendaCombina(v,termo));
  const legenda=document.getElementById('historico-vendas-data-legenda');
  if(legenda) legenda.textContent=`Data selecionada: ${_historicoVendasDataLabel(_historicoVendasDataAtual)}`;
  const estornosForaDoDia=estornosDoDia.filter(m=>{
    const venda=dados.vendas.find(v=>_relVendasChave(v.id)===String(m.referenciaVenda));
    return !venda||venda.data!==_historicoVendasDataAtual;
  }).filter(m=>{
    const venda=dados.vendas.find(v=>_relVendasChave(v.id)===String(m.referenciaVenda));
    return _historicoVendasMovimentoCombina(m,venda,termo);
  });
  const resumoEl=document.getElementById('historico-vendas-resumo');
  if(resumoEl) resumoEl.innerHTML=_historicoVendasRenderResumo(vendasDoDia,estornosDoDia,termo?vendasFiltradas:null);
  const blocos=[];
  vendasFiltradas.forEach(v=>blocos.push(_historicoVendasRenderVenda(v,dados.estornosPorVenda.get(_relVendasChave(v.id))||[])));
  estornosForaDoDia.forEach(m=>{
    const venda=dados.vendas.find(v=>_relVendasChave(v.id)===String(m.referenciaVenda));
    blocos.push(_historicoVendasRenderEstornoForaDoDia(m,venda));
  });
  if(!blocos.length){
    lista.innerHTML=termo?'<div class="empty-list">Nenhuma venda ou estorno corresponde à pesquisa nesta data.</div>':'<div class="empty-list">Nenhuma venda ou estorno registrado para esta data.</div>';
  } else {
    lista.innerHTML=blocos.join('');
  }
}
function _historicoVendasAlterarData(delta){
  const dataEl=document.getElementById('historico-vendas-data');
  if(!dataEl) return;
  const base=dataEl.value?new Date(`${dataEl.value}T12:00:00`):new Date();
  base.setDate(base.getDate()+delta);
  dataEl.value=`${base.getFullYear()}-${String(base.getMonth()+1).padStart(2,'0')}-${String(base.getDate()).padStart(2,'0')}`;
  renderHistoricoVendas();
}

function _historicoClienteCampoExiste(valor){
  return valor!==undefined && valor!==null && valor!=='';
}
function _historicoClienteValorItem(item){
  /* Usa somente os valores históricos gravados dentro da própria venda. */
  if(_historicoClienteCampoExiste(item?.subtotal)) return Number(item.subtotal||0);
  if(_historicoClienteCampoExiste(item?.quantidade) && _historicoClienteCampoExiste(item?.precoUnitario)){
    return Number(item.quantidade||0)*Number(item.precoUnitario||0);
  }
  return null;
}
function _historicoClienteRenderVenda(venda){
  const itens=Array.isArray(venda.itens)?venda.itens:[];
  let somaItens=0;
  let itensComValor=0;
  let itensHtml='';

  if(itens.length){
    itensHtml='<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);overflow-x:auto;">';
    itensHtml+='<div style="font-weight:700;margin-bottom:8px;">Produtos do pedido</div>';
    itensHtml+='<table style="width:100%;border-collapse:collapse;min-width:560px;font-size:.86rem;"><thead><tr style="background:#f8fafc;"><th style="padding:7px;text-align:left;border-bottom:1px solid #e5e7eb;">Produto</th><th style="padding:7px;text-align:right;border-bottom:1px solid #e5e7eb;">Quantidade</th><th style="padding:7px;text-align:right;border-bottom:1px solid #e5e7eb;">Valor unitário</th><th style="padding:7px;text-align:right;border-bottom:1px solid #e5e7eb;">Subtotal</th></tr></thead><tbody>';
    itens.forEach((item)=>{
      const nome=item?.produtoNome||'Produto não identificado';
      const qtd=_historicoClienteCampoExiste(item?.quantidade)?String(item.quantidade):'Não informado';
      const unit=_historicoClienteCampoExiste(item?.precoUnitario)?moneyBR(item.precoUnitario):'Não informado';
      const subtotal=_historicoClienteValorItem(item);
      const subtotalLabel=subtotal===null?'Não informado':moneyBR(subtotal);
      if(subtotal!==null){ somaItens+=subtotal; itensComValor++; }
      itensHtml+=`<tr><td style="padding:7px;border-bottom:1px solid #f1f5f9;text-align:left;">${esc(nome)}</td><td style="padding:7px;border-bottom:1px solid #f1f5f9;text-align:right;">${esc(qtd)}</td><td style="padding:7px;border-bottom:1px solid #f1f5f9;text-align:right;">${unit}</td><td style="padding:7px;border-bottom:1px solid #f1f5f9;text-align:right;">${subtotalLabel}</td></tr>`;
    });
    itensHtml+='</tbody></table></div>';
  } else {
    itensHtml='<div style="margin-top:12px;padding:10px 12px;border-top:1px solid var(--border);color:var(--muted);font-size:.88rem;">Itens não identificados na estrutura histórica desta venda.</div>';
  }

  const totalVenda=Number(venda.total||0);
  let conferencia='';
  if(itens.length && itensComValor===itens.length){
    const diferenca=totalVenda-somaItens;
    conferencia=Math.abs(diferenca)<0.005
      ? '<div style="margin-top:8px;color:#15803d;font-size:.82rem;font-weight:700;">✓ Subtotais dos itens conferem com o total original do pedido.</div>'
      : `<div style="margin-top:8px;color:#9a3412;font-size:.82rem;font-weight:700;">⚠ Diferença histórica de conferência: ${moneyBR(diferenca)}. Nenhum valor foi alterado.</div>`;
  } else if(itens.length){
    conferencia='<div style="margin-top:8px;color:#9a3412;font-size:.82rem;font-weight:700;">⚠ Alguns valores históricos dos itens não estão disponíveis para conferência.</div>';
  }

  const pedidoId=_historicoClienteCampoExiste(venda.id)?`Pedido #${esc(venda.id)} · `:'';
  return `<article class="entity-item"><div><h4 class="entity-name">${pedidoId}${formatDateBR(venda.data)}</h4><p class="entity-meta">Total do pedido: <strong>${moneyBR(venda.total)}</strong><br>Forma de pagamento: ${esc(venda.formaPagamento||'-')}<br>Status: ${esc(venda.statusPagamento||'-')}</p>${itensHtml}${conferencia}</div></article>`;
}
async function carregarRelatorioClienteSelect(){
  const sel=document.getElementById('relatorio-cliente-select'); if(!sel) return;
  const clientes=await fetchAllSorted('clientes');
  sel.innerHTML='<option value="">Selecione</option>';
  clientes.forEach((c)=>{ const o=document.createElement('option'); o.value=String(c.id); o.textContent=c.nome; sel.appendChild(o); });
  sel.onchange=async()=>{
    const cId=Number(sel.value);
    const el=document.getElementById('relatorio-cliente-detalhe'); if(!el) return;
    if(!cId){ el.innerHTML=''; return; }
    const vendas=await fetchAllSorted('vendas','data',true);
    /* Mesma busca da v3.7: somente clienteId, sem alterar a regra de estorno. */
    const filtradas=vendas.filter(v=>v.clienteId===cId);
    if(!filtradas.length){ el.innerHTML='<div class="empty-list">Nenhuma venda para este cliente.</div>'; return; }
    el.innerHTML=filtradas.map(_historicoClienteRenderVenda).join('');
  };
}
async function renderRelatorioVendaMes(){
  const vendas=await _carregarVendasLiquidasRelatorios();
  const hoje=new Date();
  const mesAtual=`${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  const mesAnteriorDate=new Date(hoje.getFullYear(),hoje.getMonth()-1,1);
  const mesAnterior=`${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth()+1).padStart(2,'0')}`;
  const totalAtual=vendas.filter(v=>v.data&&v.data.startsWith(mesAtual)).reduce((s,v)=>s+v.valorLiquido,0);
  const totalAnterior=vendas.filter(v=>v.data&&v.data.startsWith(mesAnterior)).reduce((s,v)=>s+v.valorLiquido,0);
  const variacao=totalAnterior>0?((totalAtual-totalAnterior)/totalAnterior*100).toFixed(1):0;
  const el1=document.getElementById('relatorio-mes-atual'); if(el1) el1.textContent=moneyBR(totalAtual);
  const el2=document.getElementById('relatorio-mes-anterior'); if(el2) el2.textContent=moneyBR(totalAnterior);
  const el3=document.getElementById('relatorio-mes-variacao'); if(el3) el3.textContent=`${variacao}%`;
}
async function renderRelatorioCaixaDia(){
  const hoje=new Date().toISOString().slice(0,10);
  const lancamentos=await reqToPromise(getStore('financeiro_lancamentos').getAll());
  const hojeItems=lancamentos.filter(l=>l.data===hoje);
  const entradas=hojeItems.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+Number(l.valor||0),0);
  const saidas=hojeItems.filter(l=>l.tipo==='saida').reduce((s,l)=>s+Number(l.valor||0),0);
  const el1=document.getElementById('relatorio-caixa-entradas'); if(el1) el1.textContent=moneyBR(entradas);
  const el2=document.getElementById('relatorio-caixa-saidas'); if(el2) el2.textContent=moneyBR(saidas);
  const el3=document.getElementById('relatorio-caixa-saldo'); if(el3) el3.textContent=moneyBR(entradas-saidas);
  const movEl=document.getElementById('relatorio-caixa-movimentacoes'); if(!movEl) return;
  if(!hojeItems.length){ movEl.innerHTML='<div class="empty-list">Sem movimentações hoje.</div>'; return; }
  movEl.innerHTML=hojeItems.map((l)=>{
    const cls=l.tipo==='entrada'?'entry-positive':'entry-negative';
    const sinal=l.tipo==='entrada'?'+':'-';
    return `<article class="entity-item"><div><h4 class="entity-name ${cls}">${sinal} ${moneyBR(l.valor)}</h4><p class="entity-meta">${esc(l.descricao)} | ${l.gaveta||l.formaPagamento||'-'}</p></div></article>`;
  }).join('');
}

/* ========== DRE v2.5 — DEMONSTRATIVO DE RESULTADO (DUAL REGIME) ========== */

/* Regime ativo: 'competencia' ou 'caixa' */
let _dreRegime = 'competencia';

function setDRERegime(regime){
  _dreRegime = regime;
  const labelEl = document.getElementById('dre-regime-label');
  const btnComp = document.getElementById('btn-dre-regime-competencia');
  const btnCaixa = document.getElementById('btn-dre-regime-caixa');
  if(regime === 'competencia'){
    if(labelEl) labelEl.innerHTML = '📊 <strong>Regime de Competência</strong> — Receita = Vendas realizadas (tabela vendas). Despesas = Todos os custos gerados (pagos ou a pagar).';
    if(btnComp){ btnComp.className='btn-primary'; btnComp.style.flex='1'; btnComp.style.minWidth='140px'; }
    if(btnCaixa){ btnCaixa.className='btn-secondary'; btnCaixa.style.flex='1'; btnCaixa.style.minWidth='140px'; }
  } else {
    if(labelEl) labelEl.innerHTML = '💵 <strong>Regime de Caixa</strong> — Receita = Entradas reais no financeiro (Dinheiro/Pix). Despesas = Saídas efetivadas das gavetas.';
    if(btnComp){ btnComp.className='btn-secondary'; btnComp.style.flex='1'; btnComp.style.minWidth='140px'; }
    if(btnCaixa){ btnCaixa.className='btn-primary'; btnCaixa.style.flex='1'; btnCaixa.style.minWidth='140px'; }
  }
}

/* Origens que NÃO são receita/despesa operacional (transferências internas, sangrias, suprimentos) */
const _ORIGENS_NEUTRAS = new Set(['sangria','suprimento','transferencia','estorno_folha','ajuste','estorno_vale']); /* v3.3.2: estorno_vale é compensação interna, não receita operacional */

async function renderDREMensal(){
  const hoje=new Date();
  const mesSelect=document.getElementById('dre-mes-select')?.value || `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;

  let html = '';

  /* === Helper: detecta se lançamento é pró-labore === */
  function _ehProLabore(l){
    const desc = (l.descricao||'').toLowerCase();
    const tipo = (l.tipoCusto||'').toLowerCase();
    return desc.indexOf('pro-labore')!==-1 || desc.indexOf('pró-labore')!==-1 || desc.indexOf('prolabore')!==-1 || desc.indexOf('pro labore')!==-1 || desc.indexOf('pró labore')!==-1 || tipo.indexOf('pro-labore')!==-1 || tipo.indexOf('pró-labore')!==-1 || tipo.indexOf('prolabore')!==-1 || tipo.indexOf('pro labore')!==-1 || tipo.indexOf('pró labore')!==-1;
  }

  /* === Helper: extrai nome legível da descrição do lançamento === */
  function _extrairNome(l){
    const d = l.descricao||'';
    const idx = d.indexOf(':');
    if(idx!==-1) return d.substring(idx+1).trim();
    return d || '-';
  }

  /* === Helper: traduz origem para rótulo legível === */
  function _origemLabel(o){
    const map = {folha:'Folha',ferias:'Férias',ferias_especial:'Férias',avulso:'Pg. Avulso',vale:'Vale',compra:'Compra',conta_pagar:'Conta Paga',custo_manual:'Custo Manual'};
    return map[o] || o || '-';
  }

  /* === Helper: gera botão "Ver detalhes" e tabela oculta === */
  let _dreDetalheCounter = 0;
  function _btnDetalhes(items){
    if(!items || !items.length) return '';
    _dreDetalheCounter++;
    const uid = 'dre-det-' + _dreDetalheCounter;
    let h = ` <button onclick="(function(){var el=document.getElementById('${uid}');el.style.display=el.style.display==='none'?'':'none';})()" style="font-size:0.75rem;padding:2px 8px;margin-left:8px;cursor:pointer;background:#4169E1;color:#fff;border:none;border-radius:6px;vertical-align:middle;">\u{1F441} Ver detalhes</button>`;
    h += `<div id="${uid}" style="display:none;margin:6px 0 10px 0;">`;
    h += `<table style="width:100%;font-size:0.8rem;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;">`;
    h += `<thead><tr style="background:#4169E1;color:#fff;"><th style="padding:4px 6px;text-align:left;">Data</th><th style="padding:4px 6px;text-align:left;">Origem</th><th style="padding:4px 6px;text-align:left;">Nome</th><th style="padding:4px 6px;text-align:right;">Valor</th></tr></thead><tbody>`;
    const sorted = items.slice().sort((a,b)=>(a.data||'').localeCompare(b.data||''));
    sorted.forEach(l => {
      h += `<tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:3px 6px;">${formatDateBR(l.data)}</td><td style="padding:3px 6px;">${esc(_origemLabel(l.origem))}</td><td style="padding:3px 6px;">${esc(_extrairNome(l))}</td><td style="padding:3px 6px;text-align:right;">${moneyBR(l.valor)}</td></tr>`;
    });
    h += `</tbody></table></div>`;
    return h;
  }

  if(_dreRegime === 'competencia'){
    /* ===== REGIME DE COMPETÊNCIA ===== */
    /* Receita: soma da tabela vendas (não financeiro_lancamentos) */
    const todasVendas = await reqToPromise(getStore('vendas').getAll());
    const vendasMes = todasVendas.filter(v => v.data && v.data.startsWith(mesSelect));
    const receitaVendas = vendasMes.reduce((s,v) => s + Number(v.total||0), 0);
    const receitaRecebimentos = 0; /* Competência: não conta recebimentos de prazo como nova receita */

    /* Despesas: todos os custos gerados no período (pagos ou a pagar) */
    const lancamentos = await reqToPromise(getStore('financeiro_lancamentos').getAll());
    const mesLanc = lancamentos.filter(l => l.data && l.data.startsWith(mesSelect) && !_ORIGENS_NEUTRAS.has(l.origem||''));
    const custosManuais = mesLanc.filter(l => l.tipo==='saida' && l.origem==='custo_manual');
    const tiposCustoMap = new Map();
    custosManuais.forEach(l => { const t=l.tipoCusto||'Outros'; tiposCustoMap.set(t,(tiposCustoMap.get(t)||0)+Number(l.valor||0)); });
    const comprasInsumos = mesLanc.filter(l => l.tipo==='saida' && l.origem==='compra').reduce((s,l)=>s+Number(l.valor||0),0);
    const folha = mesLanc.filter(l => l.tipo==='saida' && (l.origem==='folha'||l.origem==='ferias'||l.origem==='avulso')).reduce((s,l)=>s+Number(l.valor||0),0);
    const valesRaw = mesLanc.filter(l => l.tipo==='saida' && l.origem==='vale').reduce((s,l)=>s+Number(l.valor||0),0);
    const valesEstornos = lancamentos.filter(l => l.data && l.data.startsWith(mesSelect) && l.tipo==='entrada' && l.origem==='estorno_vale').reduce((s,l)=>s+Number(l.valor||0),0);
    const vales = Math.max(0, valesRaw - valesEstornos); /* v3.3.2: desconta estornos de vales */
    const contasPagas = mesLanc.filter(l => l.tipo==='saida' && l.origem==='conta_pagar').reduce((s,l)=>s+Number(l.valor||0),0);
    let totalDespesas = comprasInsumos + folha + vales + contasPagas;
    tiposCustoMap.forEach(v => totalDespesas += v);
    const totalReceitas = receitaVendas;
    const resultado = totalReceitas - totalDespesas;
    const corResultado = resultado>=0?'#15803d':'#b91c1c';

    /* --- DRE Detalhada v2.9.2: separar lançamentos para detalhamento --- */
    const _lancFolhaSemPL = mesLanc.filter(l => l.tipo==='saida' && (l.origem==='folha'||l.origem==='ferias'||l.origem==='avulso') && !_ehProLabore(l));
    const _lancVales = mesLanc.filter(l => l.tipo==='saida' && l.origem==='vale'); /* v3.3.2: saidas originais de vale */
    const _lancProLabore = mesLanc.filter(l => l.tipo==='saida' && _ehProLabore(l));
    const _lancCompras = mesLanc.filter(l => l.tipo==='saida' && l.origem==='compra');
    const _lancContas = mesLanc.filter(l => l.tipo==='saida' && l.origem==='conta_pagar');
    const _lancCustoManualMap = new Map();
    custosManuais.filter(l => !_ehProLabore(l)).forEach(l => {
      const t = l.tipoCusto||'Outros';
      if(!_lancCustoManualMap.has(t)) _lancCustoManualMap.set(t,[]);
      _lancCustoManualMap.get(t).push(l);
    });

    /* Valores separados para exibição analítica (somente leitura) */
    /* v3.3.2: _vlrCustoPessoas usa 'vales' já descontado dos estornos */
    const _vlrCustoPessoas = _lancFolhaSemPL.reduce((s,l)=>s+Number(l.valor||0),0) + vales;
    const _vlrProLabore = _lancProLabore.reduce((s,l)=>s+Number(l.valor||0),0);

    html = `<div style="font-family:monospace;padding:16px;background:#fafafa;border-radius:14px;border:1px solid #e5e7eb;">`;
    html += `<h3 style="text-align:center;">DRE — REGIME DE COMPETÊNCIA</h3>`;
    html += `<p style="text-align:center;color:#6b7280;">${mesSelect} — IndAguaLirios</p><hr>`;
    html += `<h4>RECEITAS (Vendas Realizadas)</h4>`;
    html += `<table style="width:100%;"><tr><td>Vendas do Período</td><td style="text-align:right;">${moneyBR(receitaVendas)}</td></tr>`;
    html += `<tr style="font-weight:bold;border-top:2px solid #333;"><td>TOTAL RECEITAS</td><td style="text-align:right;">${moneyBR(totalReceitas)}</td></tr></table>`;
    html += `<br><h4>CUSTOS E DESPESAS (Gerados no Período)</h4><table style="width:100%;">`;

    /* Custos com Pessoas (sem pró-labore) */
    html += `<tr><td>Custos com Pessoas (Folha / Férias / Avulsos / Vales)</td><td style="text-align:right;">${moneyBR(_vlrCustoPessoas)}</td></tr>`;
    html += `<tr><td colspan="2">${_btnDetalhes([..._lancFolhaSemPL, ..._lancVales])}</td></tr>`;

    /* Pró-labore (grupo separado) */
    if(_vlrProLabore > 0 || _lancProLabore.length > 0){
      html += `<tr><td>Pró-labore</td><td style="text-align:right;">${moneyBR(_vlrProLabore)}</td></tr>`;
      html += `<tr><td colspan="2">${_btnDetalhes(_lancProLabore)}</td></tr>`;
    }

    /* Custos Operacionais (custos manuais por tipo, exceto pró-labore) */
    _lancCustoManualMap.forEach((items,k) => {
      const v = items.reduce((s,l)=>s+Number(l.valor||0),0);
      html += `<tr><td>${esc(k)}</td><td style="text-align:right;">${moneyBR(v)}</td></tr>`;
      html += `<tr><td colspan="2">${_btnDetalhes(items)}</td></tr>`;
    });

    /* Compras de Insumos */
    html += `<tr><td>Compras de Insumos</td><td style="text-align:right;">${moneyBR(comprasInsumos)}</td></tr>`;
    html += `<tr><td colspan="2">${_btnDetalhes(_lancCompras)}</td></tr>`;

    /* Pagamento de Contas */
    html += `<tr><td>Pagamento de Contas</td><td style="text-align:right;">${moneyBR(contasPagas)}</td></tr>`;
    html += `<tr><td colspan="2">${_btnDetalhes(_lancContas)}</td></tr>`;

    html += `<tr style="font-weight:bold;border-top:2px solid #333;"><td>TOTAL DESPESAS</td><td style="text-align:right;">${moneyBR(totalDespesas)}</td></tr></table>`;
    html += `<br><h4>RESULTADO</h4><table style="width:100%;">`;
    html += `<tr><td>Receita Bruta</td><td style="text-align:right;">${moneyBR(totalReceitas)}</td></tr>`;
    html += `<tr><td>(-) Total Despesas</td><td style="text-align:right;">${moneyBR(totalDespesas)}</td></tr>`;
    html += `<tr style="font-weight:bold;font-size:1.2em;border-top:2px solid #333;"><td>RESULTADO LÍQUIDO</td><td style="text-align:right;color:${corResultado};">${moneyBR(resultado)}</td></tr></table></div>`;

  } else {
    /* ===== REGIME DE CAIXA ===== */
    /* Receita: apenas entradas reais no financeiro (venda + recebimento), excluindo transferências */
    const lancamentos = await reqToPromise(getStore('financeiro_lancamentos').getAll());
    const mesLanc = lancamentos.filter(l => l.data && l.data.startsWith(mesSelect) && !_ORIGENS_NEUTRAS.has(l.origem||''));
    const entradasVenda = mesLanc.filter(l => l.tipo==='entrada' && l.origem==='venda').reduce((s,l)=>s+Number(l.valor||0),0);
    const entradasRecebimento = mesLanc.filter(l => l.tipo==='entrada' && l.origem==='recebimento').reduce((s,l)=>s+Number(l.valor||0),0);
    const totalReceitas = entradasVenda + entradasRecebimento;

    /* Despesas: apenas saídas efetivadas das gavetas */
    const custosManuais = mesLanc.filter(l => l.tipo==='saida' && l.origem==='custo_manual');
    const tiposCustoMap = new Map();
    custosManuais.forEach(l => { const t=l.tipoCusto||'Outros'; tiposCustoMap.set(t,(tiposCustoMap.get(t)||0)+Number(l.valor||0)); });
    const comprasInsumos = mesLanc.filter(l => l.tipo==='saida' && l.origem==='compra').reduce((s,l)=>s+Number(l.valor||0),0);
    const folha = mesLanc.filter(l => l.tipo==='saida' && (l.origem==='folha'||l.origem==='ferias'||l.origem==='avulso')).reduce((s,l)=>s+Number(l.valor||0),0);
    const valesRawCx = mesLanc.filter(l => l.tipo==='saida' && l.origem==='vale').reduce((s,l)=>s+Number(l.valor||0),0);
    const valesEstornosCx = lancamentos.filter(l => l.data && l.data.startsWith(mesSelect) && l.tipo==='entrada' && l.origem==='estorno_vale').reduce((s,l)=>s+Number(l.valor||0),0);
    const vales = Math.max(0, valesRawCx - valesEstornosCx); /* v3.3.2: desconta estornos de vales (Caixa) */
    const contasPagas = mesLanc.filter(l => l.tipo==='saida' && l.origem==='conta_pagar').reduce((s,l)=>s+Number(l.valor||0),0);
    let totalDespesas = comprasInsumos + folha + vales + contasPagas;
    tiposCustoMap.forEach(v => totalDespesas += v);
    const resultado = totalReceitas - totalDespesas;
    const corResultado = resultado>=0?'#15803d':'#b91c1c';

    /* --- DRE Detalhada v2.9.2: separar lançamentos para detalhamento (Caixa) --- */
    const _lancFolhaSemPL = mesLanc.filter(l => l.tipo==='saida' && (l.origem==='folha'||l.origem==='ferias'||l.origem==='avulso') && !_ehProLabore(l));
    const _lancVales = mesLanc.filter(l => l.tipo==='saida' && l.origem==='vale'); /* v3.3.2: lista original para detalhamento */
    const _lancProLabore = mesLanc.filter(l => l.tipo==='saida' && _ehProLabore(l));
    const _lancCompras = mesLanc.filter(l => l.tipo==='saida' && l.origem==='compra');
    const _lancContas = mesLanc.filter(l => l.tipo==='saida' && l.origem==='conta_pagar');
    const _lancCustoManualMap = new Map();
    custosManuais.filter(l => !_ehProLabore(l)).forEach(l => {
      const t = l.tipoCusto||'Outros';
      if(!_lancCustoManualMap.has(t)) _lancCustoManualMap.set(t,[]);
      _lancCustoManualMap.get(t).push(l);
    });

    /* v3.3.2: _vlrCustoPessoas usa 'vales' já descontado dos estornos (Caixa) */
    const _vlrCustoPessoas = _lancFolhaSemPL.reduce((s,l)=>s+Number(l.valor||0),0) + vales;
    const _vlrProLabore = _lancProLabore.reduce((s,l)=>s+Number(l.valor||0),0);

    html = `<div style="font-family:monospace;padding:16px;background:#fafafa;border-radius:14px;border:1px solid #e5e7eb;">`;
    html += `<h3 style="text-align:center;">DRE — REGIME DE CAIXA</h3>`;
    html += `<p style="text-align:center;color:#6b7280;">${mesSelect} — IndAguaLirios</p><hr>`;
    html += `<h4>RECEITAS (Entradas Reais no Caixa)</h4>`;
    html += `<table style="width:100%;"><tr><td>Vendas Recebidas (à Vista)</td><td style="text-align:right;">${moneyBR(entradasVenda)}</td></tr>`;
    html += `<tr><td>Recebimentos de Clientes (Prazo)</td><td style="text-align:right;">${moneyBR(entradasRecebimento)}</td></tr>`;
    html += `<tr style="font-weight:bold;border-top:2px solid #333;"><td>TOTAL RECEITAS</td><td style="text-align:right;">${moneyBR(totalReceitas)}</td></tr></table>`;
    html += `<br><h4>DESPESAS (Saídas Efetivadas)</h4><table style="width:100%;">`;

    /* Custos com Pessoas (sem pró-labore) */
    html += `<tr><td>Custos com Pessoas (Folha / Férias / Avulsos / Vales)</td><td style="text-align:right;">${moneyBR(_vlrCustoPessoas)}</td></tr>`;
    html += `<tr><td colspan="2">${_btnDetalhes([..._lancFolhaSemPL, ..._lancVales])}</td></tr>`;

    /* Pró-labore (grupo separado) */
    if(_vlrProLabore > 0 || _lancProLabore.length > 0){
      html += `<tr><td>Pró-labore</td><td style="text-align:right;">${moneyBR(_vlrProLabore)}</td></tr>`;
      html += `<tr><td colspan="2">${_btnDetalhes(_lancProLabore)}</td></tr>`;
    }

    /* Custos Operacionais (custos manuais por tipo, exceto pró-labore) */
    _lancCustoManualMap.forEach((items,k) => {
      const v = items.reduce((s,l)=>s+Number(l.valor||0),0);
      html += `<tr><td>${esc(k)}</td><td style="text-align:right;">${moneyBR(v)}</td></tr>`;
      html += `<tr><td colspan="2">${_btnDetalhes(items)}</td></tr>`;
    });

    /* Compras de Insumos */
    html += `<tr><td>Compras de Insumos</td><td style="text-align:right;">${moneyBR(comprasInsumos)}</td></tr>`;
    html += `<tr><td colspan="2">${_btnDetalhes(_lancCompras)}</td></tr>`;

    /* Pagamento de Contas */
    html += `<tr><td>Pagamento de Contas</td><td style="text-align:right;">${moneyBR(contasPagas)}</td></tr>`;
    html += `<tr><td colspan="2">${_btnDetalhes(_lancContas)}</td></tr>`;

    html += `<tr style="font-weight:bold;border-top:2px solid #333;"><td>TOTAL DESPESAS</td><td style="text-align:right;">${moneyBR(totalDespesas)}</td></tr></table>`;
    html += `<br><h4>RESULTADO</h4><table style="width:100%;">`;
    html += `<tr><td>Receita Bruta</td><td style="text-align:right;">${moneyBR(totalReceitas)}</td></tr>`;
    html += `<tr><td>(-) Total Despesas</td><td style="text-align:right;">${moneyBR(totalDespesas)}</td></tr>`;
    html += `<tr style="font-weight:bold;font-size:1.2em;border-top:2px solid #333;"><td>RESULTADO LÍQUIDO</td><td style="text-align:right;color:${corResultado};">${moneyBR(resultado)}</td></tr></table></div>`;
  }

  const el=document.getElementById('dre-mensal-conteudo'); if(el) el.innerHTML=html;
}

async function renderDREAnual(){
  const anoSelect=document.getElementById('dre-ano-select')?.value || String(new Date().getFullYear());
  const meses=['01','02','03','04','05','06','07','08','09','10','11','12'];
  const nomesMeses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  let dados;

  if(_dreRegime === 'competencia'){
    /* Competência: receita da tabela vendas, despesas do financeiro sem origens neutras */
    const todasVendas = await reqToPromise(getStore('vendas').getAll());
    const lancamentos = await reqToPromise(getStore('financeiro_lancamentos').getAll());
    dados = meses.map(m => {
      const prefix = `${anoSelect}-${m}`;
      const receitas = todasVendas.filter(v=>v.data&&v.data.startsWith(prefix)).reduce((s,v)=>s+Number(v.total||0),0);
      /* v3.3.4: neutralizar par vale+estorno_vale por mês */
      const _valesRaw = lancamentos.filter(l=>l.data&&l.data.startsWith(prefix)&&l.tipo==='saida'&&l.origem==='vale').reduce((s,l)=>s+Number(l.valor||0),0);
      const _estornosVale = lancamentos.filter(l=>l.data&&l.data.startsWith(prefix)&&l.tipo==='entrada'&&l.origem==='estorno_vale').reduce((s,l)=>s+Number(l.valor||0),0);
      const _valesEfetivos = Math.max(0, _valesRaw - _estornosVale);
      const despesasSemVale = lancamentos.filter(l=>l.data&&l.data.startsWith(prefix)&&l.tipo==='saida'&&!_ORIGENS_NEUTRAS.has(l.origem||'')&&l.origem!=='vale').reduce((s,l)=>s+Number(l.valor||0),0);
      const despesas = despesasSemVale + _valesEfetivos;
      return {receitas, despesas, resultado:receitas-despesas};
    });
  } else {
    /* Caixa: entradas/saídas reais do financeiro sem origens neutras */
    const lancamentos = await reqToPromise(getStore('financeiro_lancamentos').getAll());
    dados = meses.map(m => {
      const prefix = `${anoSelect}-${m}`;
      const mesItems = lancamentos.filter(l=>l.data&&l.data.startsWith(prefix)&&!_ORIGENS_NEUTRAS.has(l.origem||''));
      const receitas = mesItems.filter(l=>l.tipo==='entrada').reduce((s,l)=>s+Number(l.valor||0),0);
      /* v3.3.4: neutralizar par vale+estorno_vale por mês (Caixa) */
      const _valesRawCx = mesItems.filter(l=>l.tipo==='saida'&&l.origem==='vale').reduce((s,l)=>s+Number(l.valor||0),0);
      const _estornosValeCx = lancamentos.filter(l=>l.data&&l.data.startsWith(prefix)&&l.tipo==='entrada'&&l.origem==='estorno_vale').reduce((s,l)=>s+Number(l.valor||0),0);
      const _valesEfetivosCx = Math.max(0, _valesRawCx - _estornosValeCx);
      const despesasSemValeCx = mesItems.filter(l=>l.tipo==='saida'&&l.origem!=='vale').reduce((s,l)=>s+Number(l.valor||0),0);
      const despesas = despesasSemValeCx + _valesEfetivosCx;
      return {receitas, despesas, resultado:receitas-despesas};
    });
  }

  const totalReceitas=dados.reduce((s,d)=>s+d.receitas,0);
  const totalDespesas=dados.reduce((s,d)=>s+d.despesas,0);
  const totalResultado=totalReceitas-totalDespesas;
  const regimeLabel = _dreRegime==='competencia' ? 'COMPETÊNCIA' : 'CAIXA';

  let html=`<div class="dre-anual-container" style="overflow-x:auto;font-family:monospace;padding:16px;background:#fafafa;border-radius:14px;border:1px solid #e5e7eb;">`;
  html+=`<h3 style="text-align:center;">DRE ANUAL (${regimeLabel}) — ${anoSelect}</h3><hr>`;
  html+=`<table style="width:100%;border-collapse:collapse;font-size:0.85rem;"><thead><tr style="background:#f0f0f0;"><th style="padding:8px;text-align:left;">Item</th>`;
  nomesMeses.forEach(n=>{ html+=`<th style="padding:8px;text-align:right;">${n}</th>`; });
  html+=`<th style="padding:8px;text-align:right;font-weight:bold;">TOTAL</th></tr></thead><tbody>`;
  html+=`<tr style="color:#15803d;"><td style="padding:6px;">Receitas</td>`;
  dados.forEach(d=>{ html+=`<td style="text-align:right;padding:6px;">${moneyBR(d.receitas)}</td>`; });
  html+=`<td style="text-align:right;padding:6px;font-weight:bold;">${moneyBR(totalReceitas)}</td></tr>`;
  html+=`<tr style="color:#b91c1c;"><td style="padding:6px;">Despesas</td>`;
  dados.forEach(d=>{ html+=`<td style="text-align:right;padding:6px;">${moneyBR(d.despesas)}</td>`; });
  html+=`<td style="text-align:right;padding:6px;font-weight:bold;">${moneyBR(totalDespesas)}</td></tr>`;
  html+=`<tr style="font-weight:bold;border-top:2px solid #333;"><td style="padding:6px;">Resultado</td>`;
  dados.forEach(d=>{ const cor=d.resultado>=0?'#15803d':'#b91c1c'; html+=`<td style="text-align:right;padding:6px;color:${cor};">${moneyBR(d.resultado)}</td>`; });
  const corTotal=totalResultado>=0?'#15803d':'#b91c1c';
  html+=`<td style="text-align:right;padding:6px;color:${corTotal};">${moneyBR(totalResultado)}</td></tr>`;
  html+=`</tbody></table></div>`;

  const el=document.getElementById('dre-anual-conteudo'); if(el) el.innerHTML=html;
}

function imprimirDRE(){ window.print(); }

/* ========== RELATÓRIO DE VENDAS POR CIDADE ========== */
/*
 * O relatório continua sendo somente leitura. O estado abaixo vive apenas em
 * memória para controlar a navegação do drill-down e não é persistido.
 */
const _relCidadeMeses=['01','02','03','04','05','06','07','08','09','10','11','12'];
const _relCidadeNomesMeses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
let _relCidadeEstado={modo:'',periodo:'',cidade:'',clienteKey:''};

function _relCidadeChave(v){ return String(v??''); }
function _relCidadeQtdBR(v){
  const n=Number(v||0);
  return n===0?'–':n.toLocaleString('pt-BR',{maximumFractionDigits:2});
}
function _relCidadeValorItem(item){
  /* subtotal/precoUnitario são os valores históricos gravados na venda. */
  if(item && item.subtotal!==undefined && item.subtotal!==null && item.subtotal!=='') return Number(item.subtotal||0);
  return Number(item?.quantidade||0)*Number(item?.precoUnitario||0);
}
function _relCidadeCarregarDados(){
  return Promise.all([
    reqToPromise(getStore('vendas').getAll()),
    reqToPromise(getStore('clientes').getAll()),
    reqToPromise(getStore('produtos').getAll())
  ]).then(([vendas,clientes,produtos])=>({vendas,clientes,produtos}));
}
function _relCidadeInfoCliente(v,clienteMap){
  const cli=v?.clienteId!==undefined&&v?.clienteId!==null ? clienteMap.get(_relCidadeChave(v.clienteId)) : null;
  const nome=cli?.nome||v?.clienteNome||'Cliente não identificado';
  const cidade=cli?.cidade||'Sem Cidade';
  const clienteKey=cli ? `id:${_relCidadeChave(cli.id)}` : (v?.clienteId!==undefined&&v?.clienteId!==null&&v.clienteId!=='' ? `id:${_relCidadeChave(v.clienteId)}` : `nome:${nome}`);
  return {cli,nome,cidade,clienteKey};
}
function _relCidadeInfoProduto(item,produtoMap){
  const prod=item?.produtoId!==undefined&&item?.produtoId!==null&&item.produtoId!=='' ? produtoMap.get(_relCidadeChave(item.produtoId)) : null;
  const nome=prod?.nome||item?.produtoNome||'Produto não identificado';
  const produtoKey=prod ? `id:${_relCidadeChave(prod.id)}` : (item?.produtoId!==undefined&&item?.produtoId!==null&&item.produtoId!=='' ? `id:${_relCidadeChave(item.produtoId)}` : `nome:${nome}`);
  return {prod,nome,produtoKey};
}
function _relCidadeMesIndex(data){
  const idx=Number(String(data||'').slice(5,7))-1;
  return idx>=0&&idx<12?idx:0;
}
function _relCidadeVincularCidades(container,modo,periodo){
  if(!container) return;
  container.querySelectorAll('.js-rel-cidade').forEach((btn)=>btn.addEventListener('click',()=>renderRelatorioCidadeClientes(btn.dataset.cidade,modo,periodo)));
}
function _relCidadeOcultarDetalhamento(){
  const el=document.getElementById('rel-cidade-detalhamento');
  if(el){ el.innerHTML=''; el.classList.add('hidden'); }
}
function _relCidadeMostrarDetalhamento(html){
  const el=document.getElementById('rel-cidade-detalhamento');
  if(el){ el.innerHTML=html; el.classList.remove('hidden'); el.scrollIntoView({behavior:'smooth',block:'start'}); }
  return el;
}
function _relCidadeVoltarRaiz(modo){
  return modo==='mensal' ? renderRelatorioCidadesMensal() : renderRelatorioCidadesAnual();
}
function _relCidadeMontarDetalhamento(vendas,clientes,produtos,modo,periodo,cidade){
  const clienteMap=new Map(clientes.map(c=>[_relCidadeChave(c.id),c]));
  const produtoMap=new Map(produtos.map(p=>[_relCidadeChave(p.id),p]));
  const porCliente=new Map();

  vendas.filter(v=>v?.data&&v.data.startsWith(periodo)).forEach((v)=>{
    const infoCliente=_relCidadeInfoCliente(v,clienteMap);
    if(infoCliente.cidade!==cidade) return;
    if(!porCliente.has(infoCliente.clienteKey)){
      porCliente.set(infoCliente.clienteKey,{key:infoCliente.clienteKey,nome:infoCliente.nome,cidade:infoCliente.cidade,vendas:0,total:0,meses:_relCidadeMeses.map(()=>({qtdVendas:0,total:0})),produtos:new Map()});
    }
    const cliente=porCliente.get(infoCliente.clienteKey);
    const vendaTotal=Number(v.total||0);
    const mesIdx=modo==='anual'?_relCidadeMesIndex(v.data):0;
    cliente.vendas++;
    cliente.total+=vendaTotal;
    cliente.meses[mesIdx].qtdVendas++;
    cliente.meses[mesIdx].total+=vendaTotal;

    (Array.isArray(v.itens)?v.itens:[]).forEach((item)=>{
      const infoProduto=_relCidadeInfoProduto(item,produtoMap);
      if(!cliente.produtos.has(infoProduto.produtoKey)){
        cliente.produtos.set(infoProduto.produtoKey,{key:infoProduto.produtoKey,nome:infoProduto.nome,qtd:_relCidadeMeses.map(()=>0),valor:_relCidadeMeses.map(()=>0),ajuste:false});
      }
      const produto=cliente.produtos.get(infoProduto.produtoKey);
      produto.qtd[mesIdx]+=Number(item.quantidade||0);
      produto.valor[mesIdx]+=_relCidadeValorItem(item);
    });
  });

  porCliente.forEach((cliente)=>{
    /*
     * O total superior vem da venda.total, enquanto o detalhamento usa os
     * subtotais históricos dos itens. Se um cadastro antigo não fechar, a
     * diferença fica explícita em uma linha neutra, sem alterar o banco e sem
     * esconder a inconsistência.
     */
    _relCidadeMeses.forEach((_,mesIdx)=>{
      const somaProdutos=[...cliente.produtos.values()].reduce((s,p)=>s+p.valor[mesIdx],0);
      const diferenca=cliente.meses[mesIdx].total-somaProdutos;
      if(Math.abs(diferenca)>=0.005){
        const ajusteKey='__ajuste__';
        if(!cliente.produtos.has(ajusteKey)) cliente.produtos.set(ajusteKey,{key:ajusteKey,nome:'Valor não detalhado (conferência)',qtd:_relCidadeMeses.map(()=>0),valor:_relCidadeMeses.map(()=>0),ajuste:true});
        cliente.produtos.get(ajusteKey).valor[mesIdx]+=diferenca;
      }
    });
    cliente.produtosLista=[...cliente.produtos.values()].sort((a,b)=>a.ajuste===b.ajuste?a.nome.localeCompare(b.nome):a.ajuste?1:-1);
    cliente.temAjuste=cliente.produtosLista.some(p=>p.ajuste);
    cliente.totalProdutosItens=cliente.produtosLista.filter(p=>!p.ajuste).reduce((s,p)=>s+p.valor.reduce((a,v)=>a+v,0),0);
    cliente.totalProdutos=cliente.produtosLista.reduce((s,p)=>s+p.valor.reduce((a,v)=>a+v,0),0);
  });
  return [...porCliente.values()].sort((a,b)=>a.nome.localeCompare(b.nome));
}
async function renderRelatorioCidadesMensal(){
  const mesSelect=document.getElementById('rel-cidade-mes-select')?.value;
  if(!mesSelect) return alert('Selecione o mês.');
  const {vendas,clientes}=await _relCidadeCarregarDados();
  const clienteMap=new Map(clientes.map(c=>[_relCidadeChave(c.id),c]));
  const filtradas=vendas.filter(v=>v.data&&v.data.startsWith(mesSelect));
  const cidadeMap=new Map();
  filtradas.forEach((v)=>{
    const cidade=_relCidadeInfoCliente(v,clienteMap).cidade;
    if(!cidadeMap.has(cidade)) cidadeMap.set(cidade,{qtd:0,total:0});
    const reg=cidadeMap.get(cidade); reg.qtd++; reg.total+=Number(v.total||0);
  });
  const cidades=[...cidadeMap.entries()].sort((a,b)=>b[1].total-a[1].total);
  const totalGeral=cidades.reduce((s,c)=>s+c[1].total,0);
  const qtdGeral=cidades.reduce((s,c)=>s+c[1].qtd,0);
  let html=`<div class="rel-cidade-raiz-relatorio"><h3 style="text-align:center;">VENDAS POR CIDADE — ${esc(mesSelect)}</h3><p style="text-align:center;color:#6b7280;">IndAguaLirios</p><hr>`;
  html+=`<table class="rel-cidade-tabela"><thead><tr><th>Cidade</th><th>Qtd Vendas</th><th>Total (R$)</th></tr></thead><tbody>`;
  cidades.forEach(([cidade,dados])=>{ html+=`<tr><td><button type="button" class="rel-cidade-link js-rel-cidade" data-cidade="${esc(cidade)}">${esc(cidade)}</button></td><td>${dados.qtd}</td><td>${moneyBR(dados.total)}</td></tr>`; });
  html+=`<tr class="rel-cidade-total"><td>TOTAL</td><td>${qtdGeral}</td><td>${moneyBR(totalGeral)}</td></tr></tbody></table></div>`;
  const el=document.getElementById('rel-cidade-mensal-conteudo'); if(el) el.innerHTML=html;
  _relCidadeEstado={modo:'mensal',periodo:mesSelect,cidade:'',clienteKey:''}; _relCidadeOcultarDetalhamento(); _relCidadeVincularCidades(el,'mensal',mesSelect);
}
async function renderRelatorioCidadesAnual(){
  const anoSelect=document.getElementById('rel-cidade-ano-select')?.value||String(new Date().getFullYear());
  const {vendas,clientes}=await _relCidadeCarregarDados();
  const clienteMap=new Map(clientes.map(c=>[_relCidadeChave(c.id),c]));
  const todasCidades=new Set();
  vendas.filter(v=>v.data&&v.data.startsWith(anoSelect)).forEach((v)=>todasCidades.add(_relCidadeInfoCliente(v,clienteMap).cidade));
  const cidadesArr=[...todasCidades].sort();
  const dados=new Map(); cidadesArr.forEach(c=>dados.set(c,_relCidadeMeses.map(()=>({qtd:0,total:0}))));
  vendas.filter(v=>v.data&&v.data.startsWith(anoSelect)).forEach((v)=>{
    const cidade=_relCidadeInfoCliente(v,clienteMap).cidade; const mesIdx=_relCidadeMesIndex(v.data);
    if(dados.has(cidade)){ dados.get(cidade)[mesIdx].qtd++; dados.get(cidade)[mesIdx].total+=Number(v.total||0); }
  });
  let html=`<div class="dre-anual-container rel-cidade-raiz-relatorio"><h3 style="text-align:center;">VENDAS POR CIDADE — ${esc(anoSelect)} (Anual)</h3><hr><table class="rel-cidade-tabela rel-cidade-tabela-anual"><thead><tr><th>Cidade</th>`;
  _relCidadeNomesMeses.forEach(n=>{ html+=`<th>${n}</th>`; }); html+=`<th>TOTAL</th></tr></thead><tbody>`;
  const totaisMes=_relCidadeMeses.map(()=>0); let totalGeral=0;
  cidadesArr.forEach((cidade)=>{ const mesesDados=dados.get(cidade); const totalCidade=mesesDados.reduce((s,m)=>s+m.total,0); totalGeral+=totalCidade; html+=`<tr><td><button type="button" class="rel-cidade-link js-rel-cidade" data-cidade="${esc(cidade)}">${esc(cidade)}</button></td>`; mesesDados.forEach((m,i)=>{ totaisMes[i]+=m.total; html+=`<td>${m.total>0?moneyBR(m.total):'-'}</td>`; }); html+=`<td class="rel-cidade-numero-total">${moneyBR(totalCidade)}</td></tr>`; });
  html+=`<tr class="rel-cidade-total"><td>TOTAL GERAL</td>`; totaisMes.forEach(t=>{ html+=`<td>${moneyBR(t)}</td>`; }); html+=`<td>${moneyBR(totalGeral)}</td></tr></tbody></table></div>`;
  const el=document.getElementById('rel-cidade-anual-conteudo'); if(el) el.innerHTML=html;
  _relCidadeEstado={modo:'anual',periodo:anoSelect,cidade:'',clienteKey:''}; _relCidadeOcultarDetalhamento(); _relCidadeVincularCidades(el,'anual',anoSelect);
}
async function renderRelatorioCidadeClientes(cidade,modo,periodo){
  const dados=await _relCidadeCarregarDados();
  const clientes=_relCidadeMontarDetalhamento(dados.vendas,dados.clientes,dados.produtos,modo,periodo,cidade);
  _relCidadeEstado={modo,periodo,cidade,clienteKey:''};
  const totalCidade=clientes.reduce((s,c)=>s+c.total,0);
  let html=`<div class="rel-cidade-detalhe-cabecalho"><div><span class="rel-cidade-breadcrumb">Vendas por Cidade → Cidade</span><h3>VENDAS — ${esc(cidade)}</h3><p>Período: ${esc(modo==='mensal'?periodo:`Ano ${periodo}`)}</p></div><button type="button" class="btn-secondary js-rel-cidade-voltar-raiz">← Voltar para cidades</button></div>`;
  html+=`<div class="rel-cidade-resumo"><div><span>Cidade</span><strong>${esc(cidade)}</strong></div><div><span>Clientes</span><strong>${clientes.length}</strong></div><div><span>Total da cidade</span><strong>${moneyBR(totalCidade)}</strong></div></div>`;
  if(!clientes.length) html+=`<div class="empty-list">Nenhum cliente encontrado para esta cidade no período selecionado.</div>`;
  else { html+=`<div class="rel-cidade-lista-clientes">`; clientes.forEach((cliente)=>{ const fechamento=!cliente.temAjuste&&Math.abs(cliente.totalProdutosItens-cliente.total)<0.005; html+=`<article class="rel-cidade-cliente-card"><div><h4>${esc(cliente.nome)}</h4><p>${cliente.vendas} venda${cliente.vendas===1?'':'s'} · Total: <strong>${moneyBR(cliente.total)}</strong></p>${fechamento?'<span class="rel-cidade-fechamento-ok">✓ Produtos fecham com o cliente</span>':'<span class="rel-cidade-fechamento-alerta">⚠ Conferência requer atenção</span>'}</div><button type="button" class="btn-small js-rel-cliente" data-cliente-key="${esc(cliente.key)}">Ver produtos</button></article>`; }); html+=`</div>`; }
  const el=_relCidadeMostrarDetalhamento(html);
  if(!el) return;
  el.querySelector('.js-rel-cidade-voltar-raiz')?.addEventListener('click',()=>_relCidadeVoltarRaiz(modo));
  el.querySelectorAll('.js-rel-cliente').forEach((btn)=>btn.addEventListener('click',()=>renderRelatorioCidadeProdutos(cidade,btn.dataset.clienteKey,modo,periodo)));
}
async function renderRelatorioCidadeProdutos(cidade,clienteKey,modo,periodo){
  const dados=await _relCidadeCarregarDados();
  const clientes=_relCidadeMontarDetalhamento(dados.vendas,dados.clientes,dados.produtos,modo,periodo,cidade);
  const cliente=clientes.find(c=>c.key===clienteKey);
  if(!cliente) return renderRelatorioCidadeClientes(cidade,modo,periodo);
  _relCidadeEstado={modo,periodo,cidade,clienteKey};
  const mesIdx=modo==='mensal'?0:null;
  let html=`<div class="rel-cidade-detalhe-cabecalho"><div><span class="rel-cidade-breadcrumb">Vendas por Cidade → ${esc(cidade)} → Cliente</span><h3>CLIENTE: ${esc(cliente.nome)}</h3><p>CIDADE: ${esc(cidade)} · ${esc(modo==='mensal'?periodo:`ANO ${periodo}`)}</p></div><div class="rel-cidade-detalhe-acoes"><button type="button" class="btn-secondary js-rel-cidade-voltar-clientes">← Clientes</button><button type="button" class="btn-secondary js-rel-cidade-voltar-raiz">Vendas por Cidade</button></div></div>`;
  html+=`<div class="rel-cidade-resumo"><div><span>Cliente</span><strong>${esc(cliente.nome)}</strong></div><div><span>Vendas</span><strong>${cliente.vendas}</strong></div><div><span>Total do cliente</span><strong>${moneyBR(cliente.total)}</strong></div></div>`;
  if(!cliente.produtosLista.length) html+=`<div class="empty-list">Nenhum produto identificado nas vendas deste cliente no período selecionado.</div>`;
  else {
    html+=`<div class="rel-cidade-produtos-wrap"><table class="rel-cidade-produtos-tabela"><thead><tr><th>Produto</th>`;
    if(modo==='anual') _relCidadeNomesMeses.forEach(n=>{ html+=`<th>${n}</th>`; }); else html+=`<th>Qtd</th><th>Valor</th>`;
    if(modo==='anual') html+=`<th>TOTAL QTD.</th><th>VALOR TOTAL</th>`; else html+=`<th>TOTAL QTD.</th><th>VALOR TOTAL</th>`;
    html+=`</tr></thead><tbody>`;
    cliente.produtosLista.forEach((produto)=>{
      html+=`<tr class="${produto.ajuste?'rel-cidade-linha-ajuste':''}"><td class="rel-cidade-produto-nome">${esc(produto.nome)}${produto.ajuste?' <span title="Diferença explícita entre venda.total e subtotais dos itens">⚠</span>':''}</td>`;
      if(modo==='anual') _relCidadeMeses.forEach((_,i)=>{ html+=`<td>${_relCidadeQtdBR(produto.qtd[i])}</td>`; });
      else html+=`<td>${_relCidadeQtdBR(produto.qtd[mesIdx])}</td><td>${moneyBR(produto.valor[mesIdx])}</td>`;
      const qtdTotal=produto.qtd.reduce((s,q)=>s+q,0); const valorTotal=produto.valor.reduce((s,v)=>s+v,0);
      html+=`<td class="rel-cidade-numero-total">${_relCidadeQtdBR(qtdTotal)}</td>`;
      if(modo==='anual') html+=`<td class="rel-cidade-numero-total">${moneyBR(valorTotal)}</td>`;
      else html+=`<td class="rel-cidade-numero-total">${moneyBR(valorTotal)}</td>`;
      html+=`</tr>`;
    });
    html+=`<tr class="rel-cidade-total"><td>TOTAL DO CLIENTE</td>`;
    if(modo==='anual') _relCidadeMeses.forEach((_,i)=>{ html+=`<td>${_relCidadeQtdBR(cliente.produtosLista.reduce((s,p)=>s+p.qtd[i],0))}</td>`; });
    else html+=`<td>${_relCidadeQtdBR(cliente.produtosLista.reduce((s,p)=>s+p.qtd[mesIdx],0))}</td><td>${moneyBR(cliente.meses[mesIdx].total)}</td>`;
    html+=`<td>${_relCidadeQtdBR(cliente.produtosLista.reduce((s,p)=>s+p.qtd.reduce((a,q)=>a+q,0),0))}</td>`;
    if(modo==='anual') html+=`<td>${moneyBR(cliente.total)}</td>`;
    else html+=`<td>${moneyBR(cliente.meses[mesIdx].total)}</td>`;
    html+=`</tr></tbody></table></div>`;
  }
  const fechamento=!cliente.temAjuste&&Math.abs(cliente.totalProdutosItens-cliente.total)<0.005;
  const totalProdutosConferencia=cliente.temAjuste?cliente.totalProdutosItens:cliente.totalProdutos;
  html+=`<div class="rel-cidade-conferencia ${fechamento?'rel-cidade-conferencia-ok':'rel-cidade-conferencia-alerta'}"><strong>${fechamento?'✓ Fechamento confirmado':'⚠ Diferença de conferência detectada'}</strong><span>${cliente.temAjuste?'Itens identificados':'Produtos'}: ${moneyBR(totalProdutosConferencia)} · Cliente: ${moneyBR(cliente.total)}</span>${cliente.temAjuste?`<small>Foi exibida uma linha neutra para tornar explícita a diferença histórica entre o total da venda e os subtotais dos itens. Diferença não detalhada: ${moneyBR(cliente.total-cliente.totalProdutosItens)}.</small>`:''}</div>`;
  const el=_relCidadeMostrarDetalhamento(html); if(!el) return;
  el.querySelector('.js-rel-cidade-voltar-clientes')?.addEventListener('click',()=>renderRelatorioCidadeClientes(cidade,modo,periodo));
  el.querySelector('.js-rel-cidade-voltar-raiz')?.addEventListener('click',()=>_relCidadeVoltarRaiz(modo));
}
function imprimirRelatorioCidades(){ window.print(); }

/* ========== BACKUP v3.5 — usa BackupManager (varredura dinâmica) ========== */

/**
 * exportarTodosDados — v3.5
 * Usa BackupManager.exportarBackupCompleto() para garantir que TODAS
 * as stores do IndexedDB sejam incluídas, sem lista manual.
 */
async function exportarTodosDados(){
  try{
    if(typeof BackupManager === 'undefined') throw new Error('BackupManager não carregado.');
    const resumo = await BackupManager.exportarBackupCompleto(db);
    localStorage.setItem('ultimoBackup', new Date().toISOString());
    const linhas = resumo.storeNames.map(s => '  • ' + s).join('\n');
    alert(
      'Backup exportado com sucesso!\n\n' +
      'Stores incluídas (' + resumo.storeNames.length + '):\n' + linhas + '\n\n' +
      'Total de registros: ' + resumo.totalRegistros
    );
  } catch(e){
    alert('Erro ao exportar backup: ' + e.message);
    console.error('[Backup] Erro na exportação:', e);
  }
}

/**
 * importarTodosDados — v3.5
 * Usa BackupManager.restaurarBackupCompleto() para restaurar TODAS
 * as stores presentes no JSON, sem lista manual.
 * Suporta formato novo (metadata+dados) e formato legado.
 */
async function importarTodosDados(arquivo){
  if(!arquivo) return alert('Selecione um arquivo JSON.');
  const reader = new FileReader();
  reader.onload = async (e) => {
    try{
      const backupObj = JSON.parse(e.target.result);
      if(!confirm('Isso apagará TODOS os dados atuais e restaurará o backup.\nDeseja continuar?')) return;
      if(typeof BackupManager === 'undefined') throw new Error('BackupManager não carregado.');
      const resultado = await BackupManager.restaurarBackupCompleto(db, backupObj);
      localStorage.setItem('ultimoBackup', new Date().toISOString());
      let msg = 'Backup restaurado com sucesso!\n\n';
      msg += 'Stores restauradas (' + resultado.restauradas.length + '):\n';
      msg += resultado.restauradas.map(s => '  ✅ ' + s).join('\n');
      if(resultado.ignoradas.length){
        msg += '\n\nStores não encontradas no banco atual (' + resultado.ignoradas.length + '):\n';
        msg += resultado.ignoradas.map(s => '  ⚠️ ' + s).join('\n');
      }
      alert(msg);
      location.reload();
    } catch(e){
      alert('Erro ao restaurar backup: ' + e.message);
      console.error('[Backup] Erro na restauração:', e);
    }
  };
  reader.readAsText(arquivo);
}
function verificarLembreteBackup(){
  const agora=new Date(); const hora=agora.getHours(); const minuto=agora.getMinutes();
  const ultimoBackup=localStorage.getItem('ultimoBackup');
  const tempoDesdeBackup=ultimoBackup?Math.floor((new Date()-new Date(ultimoBackup))/3600000):999;
  if((hora===10&&minuto>=45&&minuto<=59||hora===15&&minuto>=45&&minuto<=59)&&tempoDesdeBackup>4){
    alert(hora===10?'Lembrete: Faça o backup do sistema antes das 11h!':'Lembrete: Faça o backup do sistema antes das 16h!');
  }
}


/* ========== EXTRATO DIÁRIO LOCAL v3.6 ========== */
async function registrarEventoAuditoria(tipo, titulo, detalhes){
  try{
    const agora = new Date();
    const evento = {
      id: idGen(),
      data: agora.toISOString().slice(0,10),
      hora: agora.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),
      tipo: tipo,
      titulo: titulo,
      detalhes: detalhes || '',
      criadoEm: agora.toISOString()
    };
    const tx = db.transaction('extrato_eventos','readwrite');
    tx.objectStore('extrato_eventos').put(evento);
    await txToPromise(tx);
  }catch(e){ console.error('[Extrato] Erro ao registrar evento:', e); }
}

async function gerarExtratoDiarioTXT(dataRef){
  const hoje = dataRef || new Date().toISOString().slice(0,10);
  const todos = await reqToPromise(getStore('extrato_eventos').getAll());
  const doDia = todos.filter(e => e.data === hoje).sort((a,b) => a.criadoEm.localeCompare(b.criadoEm));
  if(!doDia.length) return `EXTRATO DIÁRIO - IndAguaLirios v3.6\nData: ${formatDateBR(hoje)}\n\nNenhum evento registrado neste dia.\n`;
  let txt = `EXTRATO DIÁRIO - IndAguaLirios v3.6\nData: ${formatDateBR(hoje)}\nTotal de eventos: ${doDia.length}\n${'='.repeat(40)}\n\n`;
  doDia.forEach(ev => {
    txt += `[${ev.hora}]\n`;
    txt += `${ev.tipo}\n`;
    if(ev.detalhes){
      ev.detalhes.split('\n').forEach(linha => { txt += `${linha}\n`; });
    }
    txt += `---\n\n`;
  });
  return txt;
}

async function enviarExtratoDiarioTelegram(token, chatId1, chatId2){
  try{
    if(!token) return;
    if(!chatId1 && !chatId2) return;
    const hoje = new Date().toISOString().slice(0,10);
    const txtContent = await gerarExtratoDiarioTXT(hoje);
    const blob = new Blob([txtContent], {type:'text/plain;charset=utf-8'});
    const filename = `extrato_indagua_${hoje}.txt`;
    const caption = `📋 Extrato Diário — ${formatDateBR(hoje)} — IndAguaLirios v3.6`;
    const envios = [];
    if(chatId1){
      const fd = new FormData();
      fd.append('chat_id', chatId1);
      fd.append('document', blob, filename);
      fd.append('caption', caption);
      envios.push(fetch(`https://api.telegram.org/bot${token}/sendDocument`,{method:'POST',body:fd}));
    }
    if(chatId2){
      const fd = new FormData();
      fd.append('chat_id', chatId2);
      fd.append('document', blob, filename);
      fd.append('caption', caption);
      envios.push(fetch(`https://api.telegram.org/bot${token}/sendDocument`,{method:'POST',body:fd}));
    }
    await Promise.allSettled(envios);
    console.log('[Extrato] Extrato diário enviado via Telegram.');
  }catch(e){ console.error('[Extrato] Erro ao enviar extrato:', e); }
}

/* ========== TELEGRAM — FILA OFFLINE ========== */
async function enviarNotificacaoTelegram(texto){
  const mensagem={id:idGen(),texto,criadoEm:new Date().toISOString(),enviado:false,tentativas:0};
  const tx=db.transaction('telegram_queue','readwrite');
  tx.objectStore('telegram_queue').put(mensagem);
  await txToPromise(tx);
  if(navigator.onLine) await processarFilaTelegram();
}
async function processarFilaTelegram(){
  if(!navigator.onLine) return;
  if(!_telegramToken) await carregarCredenciaisTelegram();
  const token = String(_telegramToken||'').trim();
  if(!token){ console.log('[Telegram] Token nao configurado. Envio cancelado.'); return; }
  const chatId1 = String(_telegramChatId1||'').trim();
  const chatId2 = String(_telegramChatId2||'').trim();
  if(!chatId1 && !chatId2){ console.log('[Telegram] Nenhum ChatID configurado. Envio cancelado.'); return; }
  const fila=await reqToPromise(getStore('telegram_queue').getAll());
  const pendentes=fila.filter(m=>!m.enviado);
  const tokenPreview = token.length > 10 ? token.substring(0,8)+'...[oculto]' : '[token curto]';
  for(const mensagem of pendentes){
    let enviouPeloMenos1 = false;
    if(chatId1){
      const url = `https://api.telegram.org/bot${tokenPreview}/sendMessage`;
      console.log('[Telegram] Tentando enviar para ID 1:', chatId1, '| URL:', url);
      try{
        const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({chat_id:chatId1, text:mensagem.texto, parse_mode:'HTML'})
        });
        if(resp.ok){ enviouPeloMenos1 = true; console.log('[Telegram] ID 1 enviado com sucesso.'); }
        else { const errBody = await resp.text().catch(()=>''); console.warn('[Telegram] ID 1 erro HTTP', resp.status, errBody); }
      }catch(e){ console.error('[Telegram] ID 1 excecao:', e.message); }
    }
    if(chatId2){
      const url = `https://api.telegram.org/bot${tokenPreview}/sendMessage`;
      console.log('[Telegram] Tentando enviar para ID 2:', chatId2, '| URL:', url);
      try{
        const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({chat_id:chatId2, text:mensagem.texto, parse_mode:'HTML'})
        });
        if(resp.ok){ enviouPeloMenos1 = true; console.log('[Telegram] ID 2 enviado com sucesso.'); }
        else { const errBody = await resp.text().catch(()=>''); console.warn('[Telegram] ID 2 erro HTTP', resp.status, errBody); }
      }catch(e){ console.error('[Telegram] ID 2 excecao:', e.message); }
    }
    if(enviouPeloMenos1){
      const tx2=db.transaction('telegram_queue','readwrite');
      tx2.objectStore('telegram_queue').put({...mensagem,enviado:true,enviadoEm:new Date().toISOString()});
      await txToPromise(tx2);
    }
  }
}

/* ========== STUBS E EXPORTS ========== */
async function exportarClientes(){ const items=await fetchAllSorted('clientes'); if(!items.length) return alert('Nenhum cliente.'); let csv='Nome,Documento,Telefone,Cidade,LimiteCredito\n'; items.forEach((c)=>{ csv+=`"${c.nome||''}","${c.documento||''}","${c.telefone||''}","${c.cidade||''}",${c.limiteCredito||0}\n`; }); downloadCSV(csv,'clientes.csv'); }
async function exportarProdutos(){ const items=await fetchAllSorted('produtos'); if(!items.length) return alert('Nenhum produto.'); let csv='Nome,Estoque,PrecoVenda\n'; items.forEach((p)=>{ csv+=`"${p.nome||''}",${currentStock(p)},${p.precoVenda||0}\n`; }); downloadCSV(csv,'produtos.csv'); }
async function exportarFuncionarios(){ const items=await fetchAllSorted('funcionarios'); if(!items.length) return alert('Nenhum funcionário.'); let csv='Nome,CPF,Telefone,Funcao,SalarioBase\n'; items.forEach((f)=>{ csv+=`"${f.nome||''}","${f.cpf||''}","${f.telefone||''}","${f.funcao||''}",${f.salarioBase||0}\n`; }); downloadCSV(csv,'funcionarios.csv'); }
function downloadCSV(csv,filename){ const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=filename; link.click(); URL.revokeObjectURL(url); }
async function renderDashboardHoje(){}
async function carregarCredenciaisTelegram(){
  try{
    const reg = await reqToPromise(getStore('configuracoes_telegram').get(1));
    if(reg){
      _telegramToken = reg.token || '';
      _telegramChatId1 = reg.chatId1 || reg.chatId || '';
      _telegramChatId2 = reg.chatId2 || '';
    }
  }catch(e){ /* silencioso */ }
}
async function carregarConfiguracoesTelegram(){
  await carregarCredenciaisTelegram();
  const elToken = document.getElementById('telegram-token');
  const elChat1 = document.getElementById('telegram-chat-id');
  const elChat2 = document.getElementById('telegram-chat-id-2');
  const elAtivo = document.getElementById('telegram-ativar');
  if(elToken) elToken.value = _telegramToken;
  if(elChat1) elChat1.value = _telegramChatId1;
  if(elChat2) elChat2.value = _telegramChatId2;
  try{
    const reg = await reqToPromise(getStore('configuracoes_telegram').get(1));
    if(elAtivo && reg) elAtivo.checked = !!reg.ativo;
  }catch(e){}
}
async function salvarConfiguracoesTelegram(e){
  if(e) e.preventDefault();
  const token = (document.getElementById('telegram-token')?.value||'').trim();
  const chatId1 = (document.getElementById('telegram-chat-id')?.value||'').trim();
  const chatId2 = (document.getElementById('telegram-chat-id-2')?.value||'').trim();
  const ativo = document.getElementById('telegram-ativar')?.checked || false;
  const tx = db.transaction('configuracoes_telegram','readwrite');
  tx.objectStore('configuracoes_telegram').put({id:1, token, chatId:chatId1, chatId1, chatId2, ativo, updatedAt:new Date().toISOString()});
  await txToPromise(tx);
  _telegramToken = token;
  _telegramChatId1 = chatId1;
  _telegramChatId2 = chatId2;
  const statusEl = document.getElementById('telegram-status');
  if(statusEl){ statusEl.textContent = '✅ Configurações salvas com sucesso!'; statusEl.style.color='#16a34a'; setTimeout(()=>{ statusEl.textContent=''; },3000); }
}
async function testarConexaoTelegram(){ await enviarNotificacaoTelegram('🔔 Teste de Conexão IndAgua v3.6 - Sucesso! \nSe você recebeu esta mensagem, o Telegram está configurado corretamente.'); alert('Mensagem de teste enviada! Verifique o Telegram.'); }


/* ========== META DE VENDAS MENSAL ========== */
function carregarMetaVendas(){
  const meta=localStorage.getItem('indagualirios_meta_vendas')||'0';
  const el=document.getElementById('meta-vendas-valor');
  if(el) el.value=meta;
  atualizarProgressoMeta();
}
function salvarMetaVendas(){
  const valor=document.getElementById('meta-vendas-valor')?document.getElementById('meta-vendas-valor').value:'0';
  localStorage.setItem('indagualirios_meta_vendas', valor);
  alert('Meta de vendas salva: '+moneyBR(Number(valor)));
  atualizarProgressoMeta();
}
async function atualizarProgressoMeta(){
  const meta=Number(localStorage.getItem('indagualirios_meta_vendas')||0);
  const el=document.getElementById('meta-vendas-progresso');
  if(!el) return;
  if(meta<=0){ el.innerHTML='<p style="color:#6b7280;">Defina uma meta para acompanhar o progresso.</p>'; return; }
  try{
    const vendas=await reqToPromise(getStore('vendas').getAll());
    const agora=new Date();
    const mesAtual=String(agora.getMonth()+1).padStart(2,'0');
    const anoAtual=String(agora.getFullYear());
    const vendasMes=vendas.filter(v=>{
      if(!v.data) return false;
      const partes=v.data.split('-');
      return partes[0]===anoAtual && partes[1]===mesAtual;
    });
    const totalVendido=vendasMes.reduce((s,v)=>s+Number(v.total||0),0);
    const pct=Math.min(100, (totalVendido/meta)*100);
    const cor=pct>=100?'#16a34a':pct>=50?'#f59e0b':'#ef4444';
    el.innerHTML=`<p><strong>Meta:</strong> ${moneyBR(meta)} | <strong>Vendido:</strong> ${moneyBR(totalVendido)} | <strong>${pct.toFixed(1)}%</strong></p><div style="background:#e5e7eb;border-radius:8px;height:20px;overflow:hidden;margin-top:6px;"><div style="background:${cor};height:100%;width:${pct}%;border-radius:8px;transition:width 0.3s;"></div></div>`;
  }catch(e){ el.innerHTML='<p style="color:#6b7280;">Erro ao calcular progresso.</p>'; }
}
/* ========== GERAÇÃO DE IMAGEM DE FECHAMENTO ========== */
/* _relatorioFechamentoTexto: guarda o texto montado para o botao de compartilhar */
let _relatorioFechamentoTexto = '';

async function preencherRelatorioFechamento(lancamentosHoje, saldoEsperado, valorContado, gavetas={}){
  const agora=new Date();
  const dataBR=formatDateBR(agora.toISOString().split('T')[0]);

  /* --- FINANCEIRO: usar gaveta (campo real) em vez de conta --- */
  const getGaveta=l=>l.gaveta||l.formaPagamento||'Dinheiro';

  const entradasPix=lancamentosHoje.filter(l=>l.tipo==='entrada' && getGaveta(l)==='Pix').reduce((s,l)=>s+Number(l.valor||0),0);
  const entradasDinheiro=lancamentosHoje.filter(l=>l.tipo==='entrada' && getGaveta(l)==='Dinheiro').reduce((s,l)=>s+Number(l.valor||0),0);
  const entradasVale=lancamentosHoje.filter(l=>l.tipo==='entrada' && (getGaveta(l)==='Prazo'||getGaveta(l)==='Vale')).reduce((s,l)=>s+Number(l.valor||0),0);

  /* Saidas normais (excluindo transferencias internas) */
  const saidasPix=lancamentosHoje.filter(l=>l.tipo==='saida' && getGaveta(l)==='Pix' && l.origem!=='transferencia').reduce((s,l)=>s+Number(l.valor||0),0);
  const saidasDinheiro=lancamentosHoje.filter(l=>l.tipo==='saida' && getGaveta(l)==='Dinheiro' && l.origem!=='transferencia').reduce((s,l)=>s+Number(l.valor||0),0);

  /* Sangrias = transferencias de saida para Tesouraria */
  const sangriasLista=lancamentosHoje.filter(l=>l.tipo==='saida' && l.origem==='transferencia');
  const totalSangrias=sangriasLista.reduce((s,l)=>s+Number(l.valor||0),0);

  /* Saldos por gaveta (acumulado historico) */
  const todosLanc=await fetchAllSorted('financeiro_lancamentos');
  let saldoDinheiro=0, saldoPix=0, saldoTesoureiro=0;
  todosLanc.forEach(l=>{
    const v=Number(l.valor||0);
    const g=l.gaveta||l.formaPagamento||'Dinheiro';
    if(l.tipo==='entrada'){
      if(g==='Dinheiro') saldoDinheiro+=v;
      else if(g==='Pix') saldoPix+=v;
      else if(g==='Tesoureiro') saldoTesoureiro+=v;
    } else {
      if(g==='Dinheiro') saldoDinheiro-=v;
      else if(g==='Pix') saldoPix-=v;
      else if(g==='Tesoureiro') saldoTesoureiro-=v;
    }
  });

  /* --- ESTOQUE --- */
  const produtos=await fetchAllSorted('produtos');
  const insumos=await fetchAllSorted('insumos');
  const produtosComEstoque=produtos.filter(p=>currentStock(p)>0);
  const insumosComEstoque=insumos.filter(i=>currentStock(i)>0);

  /* --- VENDAS DO DIA --- */
  const hoje=agora.toISOString().split('T')[0];
  const vendas=await fetchAllSorted('vendas');
  const vendasHoje=vendas.filter(v=>v.data===hoje);
  const movimentacao={};
  vendasHoje.forEach(v=>{
    if(v.itens && Array.isArray(v.itens)){
      v.itens.forEach(item=>{
        if(!movimentacao[item.produtoId]) movimentacao[item.produtoId]={nome:'',qtd:0,total:0};
        movimentacao[item.produtoId].qtd+=Number(item.quantidade||0);
        movimentacao[item.produtoId].total+=Number(item.valor||0);
      });
    }
  });
  produtos.forEach(p=>{ if(movimentacao[p.id]) movimentacao[p.id].nome=p.nome; });
  const vendasTexto=Object.values(movimentacao).filter(m=>m.qtd>0)
    .map(m=>`• ${m.nome} (${m.qtd}x): ${moneyBR(m.total)}`).join('\n')||'• Nenhuma venda hoje';

  /* --- MONTAR TEXTO DO RELATORIO --- */
  let linhasSangrias='• Nenhuma sangria';
  if(sangriasLista.length>0){
    linhasSangrias=sangriasLista.map(l=>`• ${l.descricao||'Sangria'}: ${moneyBR(Number(l.valor||0))}`).join('\n');
  }

  let linhasProdutos=produtosComEstoque.map(p=>`• ${p.nome}: ${currentStock(p)}`).join('\n')||'• Sem produtos em estoque';
  let linhasInsumos=insumosComEstoque.map(i=>`• ${i.nome}: ${currentStock(i)}`).join('\n')||'• Sem insumos em estoque';

  const dinheiroContado = gavetas.dinheiroContado || 0;
  const pixContado = gavetas.pixContado || 0;
  const saldoDinheiroEsp = gavetas.saldoDinheiro || saldoDinheiro;
  const saldoPixEsp = gavetas.saldoPix || saldoPix;
  const difDin = dinheiroContado - saldoDinheiroEsp;
  const difPix = pixContado - saldoPixEsp;
  const totalContado = dinheiroContado + pixContado + saldoTesoureiro;
  const totalEsperado = saldoDinheiroEsp + saldoPixEsp + saldoTesoureiro;
  const difTotal = totalContado - totalEsperado;
  const statusTxt = difTotal===0 ? '✅ Conferido' : difTotal>0 ? `➕ Sobra ${moneyBR(Math.abs(difTotal))}` : `➖ Falta ${moneyBR(Math.abs(difTotal))}`;
  const fmtDif = (v) => (v>=0?'✅ ':'⚠️ ') + (v>=0?'+':'') + moneyBR(v);

  _relatorioFechamentoTexto =
`📌 *FECHAMENTO DE CAIXA - ${dataBR}*

🛒 *VENDAS DO DIA:*
${vendasTexto}

💰 *ENTRADAS:*
• Pix: ${moneyBR(entradasPix)}
• Dinheiro: ${moneyBR(entradasDinheiro)}
• Vale/Prazo: ${moneyBR(entradasVale)}

💸 *SAÍDAS:*
• Pix: ${moneyBR(saidasPix)}
• Dinheiro: ${moneyBR(saidasDinheiro)}

📉 *SANGRIAS (TESOURARIA):*
${linhasSangrias}

🏦 *CONFERÊNCIA POR GAVETA:*
• 💵 Dinheiro — Esperado: ${moneyBR(saldoDinheiroEsp)} | Contado: ${moneyBR(dinheiroContado)} | ${fmtDif(difDin)}
• 📲 Pix — Esperado: ${moneyBR(saldoPixEsp)} | Contado: ${moneyBR(pixContado)} | ${fmtDif(difPix)}
• 🏛️ Tesoureiro — ${moneyBR(saldoTesoureiro)} (somente leitura)
• ${statusTxt}

📦 *PRODUTOS PARA VENDA:*
${linhasProdutos}

🛠️ *INSUMOS DE PRODUÇÃO:*
${linhasInsumos}

_IndAguaLirios v2.9_`;
}
/* ========== RELATÓRIOS DO FECHAMENTO PARA TELEGRAM v3.9 ========== */
const TELEGRAM_FECHAMENTO_LIMITE = 3900;

function _tgTextoSeguro(v){ return esc(v ?? ''); }
function _tgDataKey(v){ return v ? String(v).slice(0,10) : ''; }
function _tgMoney(v){ return moneyBR(Number(v || 0)); }
function _tgQtd(v){
  const n=Number(v||0);
  return n.toLocaleString('pt-BR',{maximumFractionDigits:2});
}
function _tgDataHora(data, updatedAt, hora){
  const dataKey=_tgDataKey(data)||_tgDataKey(updatedAt);
  const dataBR=dataKey?formatDateBR(dataKey):'Data não informada';
  if(hora) return `${dataBR} ${String(hora).slice(0,8)}`;
  const ts=String(updatedAt||'');
  if(dataKey&&ts.startsWith(dataKey+'T')) return `${dataBR} ${ts.slice(11,16)}`;
  return dataBR;
}
function _tgHora(data, updatedAt, hora){
  const dataKey=_tgDataKey(data);
  const ts=String(updatedAt||'');
  if(hora) return String(hora).slice(0,8);
  if(dataKey&&ts.startsWith(dataKey+'T')) return ts.slice(11,16);
  return '';
}
function _tgOrdenacao(item, dataRef, hora){
  const dataKey=_tgDataKey(item?.data||dataRef)||'9999-99-99';
  const ts=String(item?.updatedAt||item?.criadoEm||'');
  if(hora) return `${dataKey}T${String(hora).slice(0,8)}`;
  if(ts.startsWith(dataKey+'T')) return ts;
  return `${dataKey}T00:00:00`;
}
function _tgBloco(titulo, linhas){ return [titulo,...linhas.filter(Boolean)].join('\n'); }
function _tgValorItem(item){
  if(item&&item.subtotal!==undefined&&item.subtotal!==null&&item.subtotal!=='') return Number(item.subtotal||0);
  if(item&&item.quantidade!==undefined&&item.precoUnitario!==undefined) return Number(item.quantidade||0)*Number(item.precoUnitario||0);
  return 0;
}
function _tgChavePessoa(v){
  if(v?.clienteId!==undefined&&v?.clienteId!==null&&v.clienteId!=='') return `id:${v.clienteId}`;
  return `nome:${String(v?.clienteNome||'Cliente não identificado').toLowerCase()}`;
}
function _tgChaveProduto(v){
  if(v?.produtoId!==undefined&&v?.produtoId!==null&&v.produtoId!=='') return `id:${v.produtoId}`;
  return `nome:${String(v?.produtoNome||'Produto não identificado').toLowerCase()}`;
}
function _tgDividirBloco(texto, limite){
  const bruto=String(texto||'');
  if(bruto.length<=limite) return [bruto];
  const linhas=bruto.split('\n');
  const partes=[];
  let atual='';
  const adicionar=(valor)=>{
    if(!valor) return;
    if(!atual){ atual=valor; return; }
    if((atual+'\n'+valor).length<=limite){ atual+='\n'+valor; return; }
    partes.push(atual); atual=valor;
  };
  linhas.forEach((linha)=>{
    if(linha.length<=limite){ adicionar(linha); return; }
    if(atual){ partes.push(atual); atual=''; }
    let restante=linha;
    while(restante.length>limite){
      partes.push(restante.slice(0,limite-24)+'\n↳ Continuação');
      restante='↳ '+restante.slice(limite-24);
    }
    adicionar(restante);
  });
  if(atual) partes.push(atual);
  return partes.length?partes:['Sem conteúdo.'];
}
function _tgPaginar(titulo, referencia, blocos){
  const reservaCabecalho=`${titulo}\n${referencia}\nPágina 9999 de 9999\n\n`.length+4;
  const limiteCorpo=Math.max(500,TELEGRAM_FECHAMENTO_LIMITE-reservaCabecalho);
  const unidades=[];
  (blocos.length?blocos:['Nenhum registro disponível no período.']).forEach((bloco)=>{
    _tgDividirBloco(bloco,limiteCorpo).forEach((parte)=>unidades.push(parte));
  });
  const corpos=[];
  let atual='';
  unidades.forEach((parte)=>{
    if(!atual){ atual=parte; return; }
    if((atual+'\n\n'+parte).length<=limiteCorpo) atual+='\n\n'+parte;
    else { corpos.push(atual); atual=parte; }
  });
  if(atual) corpos.push(atual);
  const total=corpos.length||1;
  return (corpos.length?corpos:['Nenhum registro disponível no período.']).map((corpo,idx)=>`${titulo}\n${referencia}\nPágina ${idx+1} de ${total}\n\n${corpo}`);
}
async function _tgEnfileirarPaginas(paginas){
  const textos=(paginas||[]).filter(Boolean);
  if(!textos.length) return;
  /* IDs numéricos únicos e seguros para o contrato já existente da telegram_queue. */
  const base=Date.now()*1000+Math.floor(Math.random()*100);
  const tx=db.transaction('telegram_queue','readwrite');
  textos.forEach((texto,idx)=>{
    tx.objectStore('telegram_queue').put({
      id:base+idx,
      texto,
      criadoEm:new Date().toISOString(),
      enviado:false,
      tentativas:0
    });
  });
  await txToPromise(tx);
  if(navigator.onLine) await processarFilaTelegram();
}
async function _tgFechamentoRegistro(dataRef){
  const registros=await reqToPromise(getStore('fechamentos_caixa').getAll());
  return registros.filter(x=>_tgDataKey(x.data)===dataRef).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0]||null;
}
async function _tgDataFechamentoAtual(){
  const registros=await reqToPromise(getStore('fechamentos_caixa').getAll());
  const ultimo=registros.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];
  return _tgDataKey(ultimo?.data)||new Date().toISOString().slice(0,10);
}
function _tgStatusConta(conta, hoje){
  if(conta.status==='Paga') return 'Paga';
  if(!conta.dataVencimento) return 'Sem vencimento';
  return conta.dataVencimento<hoje?'Vencida':'Em aberto';
}
function _tgDiasEntre(dataA,dataB){
  if(!dataA||!dataB) return null;
  return Math.floor((new Date(dataA+'T00:00:00')-new Date(dataB+'T00:00:00'))/(1000*60*60*24));
}
function _tgTransferenciasDoPeriodo(items){
  const grupos=new Map();
  items.filter(l=>l.origem==='transferencia').forEach(l=>{
    const chave=String(l.updatedAt||`${l.data}|${l.valor}|${l.id}`);
    if(!grupos.has(chave)) grupos.set(chave,{saida:null,entrada:null});
    const g=grupos.get(chave);
    if(l.tipo==='saida') g.saida=l; else if(l.tipo==='entrada') g.entrada=l;
  });
  return [...grupos.values()].filter(g=>g.saida||g.entrada).sort((a,b)=>_tgOrdenacao(a.saida||a.entrada,'9999-99-99').localeCompare(_tgOrdenacao(b.saida||b.entrada,'9999-99-99')));
}
function _tgDespesasPagasOficiais(items){
  const tecnicas=new Set(['transferencia','estorno_vale','estorno_folha','estorno_venda']);
  const semVales=items.filter(l=>l.tipo==='saida'&&!tecnicas.has(l.origem||'')&&l.origem!=='vale');
  const brutoSemVales=semVales.reduce((s,l)=>s+Number(l.valor||0),0);
  const vales=items.filter(l=>l.tipo==='saida'&&l.origem==='vale').reduce((s,l)=>s+Number(l.valor||0),0);
  const estornosVales=items.filter(l=>l.tipo==='entrada'&&l.origem==='estorno_vale').reduce((s,l)=>s+Number(l.valor||0),0);
  return brutoSemVales+Math.max(0,vales-estornosVales);
}

async function gerarRelatorioPrestacaoContas(dataRef, hojeItems, gavetas){
  const [fechamento,vendas]=await Promise.all([_tgFechamentoRegistro(dataRef),reqToPromise(getStore('vendas').getAll())]);
  const items=Array.isArray(hojeItems)?hojeItems:[];
  const getGaveta=l=>l.gaveta||l.formaPagamento||'Dinheiro';
  const entradas=items.filter(l=>l.tipo==='entrada');
  const saidas=items.filter(l=>l.tipo==='saida');
  const totalEntradas=Number(fechamento?.totalEntradas??entradas.reduce((s,l)=>s+Number(l.valor||0),0));
  const totalSaidas=Number(fechamento?.totalSaidas??saidas.reduce((s,l)=>s+Number(l.valor||0),0));
  const entDin=entradas.filter(l=>getGaveta(l)==='Dinheiro').reduce((s,l)=>s+Number(l.valor||0),0);
  const entPix=entradas.filter(l=>getGaveta(l)==='Pix').reduce((s,l)=>s+Number(l.valor||0),0);
  const saiDin=saidas.filter(l=>getGaveta(l)==='Dinheiro').reduce((s,l)=>s+Number(l.valor||0),0);
  const saiPix=saidas.filter(l=>getGaveta(l)==='Pix').reduce((s,l)=>s+Number(l.valor||0),0);
  const saldoDinheiro=Number(fechamento?.saldoDinheiro??gavetas?.saldoDinheiro??0);
  const saldoPix=Number(fechamento?.saldoPix??gavetas?.saldoPix??0);
  const saldoTesoureiro=Number(fechamento?.saldoTesoureiro??gavetas?.saldoTesoureiro??0);
  const dinheiroContado=Number(fechamento?.dinheiroContado??gavetas?.dinheiroContado??0);
  const pixContado=Number(fechamento?.pixContado??gavetas?.pixContado??0);
  const diferenca=Number(fechamento?.diferenca??gavetas?.diferenca??0);
  const totalContado=dinheiroContado+pixContado+saldoTesoureiro;
  const vendasPeriodo=vendas.filter(v=>_tgDataKey(v.data)===dataRef);
  const faturamento=vendasPeriodo.reduce((s,v)=>s+Number(v.total||0),0);
  const recebimentos=items.filter(l=>l.tipo==='entrada'&&l.origem==='recebimento').reduce((s,l)=>s+Number(l.valor||0),0);
  const despesasPagas=_tgDespesasPagasOficiais(items);
  const transferencias=_tgTransferenciasDoPeriodo(items);
  const sangrias=saidas.filter(l=>l.origem==='transferencia');
  const movimentosTesoureiro=items.filter(l=>getGaveta(l)==='Tesoureiro');
  const linhasSangrias=sangrias.length?sangrias.map(l=>`${_tgHora(l.data,l.updatedAt)?_tgHora(l.data,l.updatedAt)+' — ':''}${_tgMoney(l.valor)} | ${_tgTextoSeguro(l.descricao||'Sangria')} | Gaveta: ${_tgTextoSeguro(getGaveta(l))}`).join('\n'):'• Nenhuma sangria registrada.';
  const linhasTransferencias=transferencias.length?transferencias.map(g=>{
    const s=g.saida,e=g.entrada;
    const origem=s?getGaveta(s):'não informado';
    const destino=e?getGaveta(e):'não informado';
    return `${_tgHora((s||e).data,(s||e).updatedAt)?_tgHora((s||e).data,(s||e).updatedAt)+' — ':''}${_tgMoney(s?.valor??e?.valor)} | ${_tgTextoSeguro(origem)} → ${_tgTextoSeguro(destino)}`;
  }).join('\n'):'• Nenhuma transferência interna registrada.';
  const linhasTesoureiro=movimentosTesoureiro.length?movimentosTesoureiro.map(l=>`${_tgHora(l.data,l.updatedAt)?_tgHora(l.data,l.updatedAt)+' — ':''}${l.tipo==='entrada'?'Entrada':'Saída'} ${_tgMoney(l.valor)} | ${_tgTextoSeguro(l.descricao||'Movimentação')}`).join('\n'):'• Nenhuma movimentação registrada no Tesoureiro.';
  const horaFechamento=String(fechamento?.updatedAt||'').slice(11,16);
  const status=String(gavetas?.status||(diferenca===0?'✅ Conferido':diferenca>0?'➕ Sobra':'➖ Falta'));
  const blocos=[
    _tgBloco('📅 FECHAMENTO',[`Data: ${formatDateBR(dataRef)}`,`Horário: ${horaFechamento||'não informado'}`,`Período efetivamente fechado: ${formatDateBR(dataRef)}`]),
    _tgBloco('ENTRADAS',[`Total de entradas: ${_tgMoney(totalEntradas)}`,`Dinheiro: ${_tgMoney(entDin)}`,`Pix: ${_tgMoney(entPix)}`]),
    _tgBloco('SAÍDAS',[`Total de saídas: ${_tgMoney(totalSaidas)}`,`Dinheiro: ${_tgMoney(saiDin)}`,`Pix: ${_tgMoney(saiPix)}`]),
    _tgBloco('SANGRIAS',[`Total: ${_tgMoney(sangrias.reduce((s,l)=>s+Number(l.valor||0),0))}`,linhasSangrias]),
    _tgBloco('TRANSFERÊNCIAS ENTRE GAVETAS',[linhasTransferencias]),
    _tgBloco('SALDOS',[`Dinheiro: ${_tgMoney(saldoDinheiro)}`,`Pix: ${_tgMoney(saldoPix)}`,`Tesoureiro: ${_tgMoney(saldoTesoureiro)}`,`Saldo total: ${_tgMoney(saldoDinheiro+saldoPix+saldoTesoureiro)}`]),
    _tgBloco('MOVIMENTAÇÕES DO TESOUREIRO',[linhasTesoureiro]),
    _tgBloco('CONFERÊNCIA',[`Dinheiro contado: ${_tgMoney(dinheiroContado)}`,`Pix contado: ${_tgMoney(pixContado)}`,`Diferença de caixa: ${_tgMoney(diferenca)}`,`Status: ${_tgTextoSeguro(status)}`,`Total contado: ${_tgMoney(totalContado)}`]),
    _tgBloco('RESUMO',[`Vendas faturadas: ${_tgMoney(faturamento)}`,`Recebimentos de clientes: ${_tgMoney(recebimentos)}`,`Despesas efetivamente pagas: ${_tgMoney(despesasPagas)}`])
  ];
  return _tgPaginar('💰 PRESTAÇÃO DE CONTAS',`Referência: ${formatDateBR(dataRef)}`,blocos);
}

async function gerarRelatorioVendasTelegram(dataRef){
  const vendas=(await reqToPromise(getStore('vendas').getAll())).filter(v=>_tgDataKey(v.data)===dataRef).sort((a,b)=>String(a.updatedAt||'').localeCompare(String(b.updatedAt||'')));
  const clientes=new Map();
  const produtos=new Map();
  vendas.forEach(v=>{
    const pessoaKey=_tgChavePessoa(v);
    if(!clientes.has(pessoaKey)) clientes.set(pessoaKey,{nome:v.clienteNome||'Cliente não identificado',vendas:[],total:0});
    const cliente=clientes.get(pessoaKey);
    cliente.vendas.push(v); cliente.total+=Number(v.total||0);
    (Array.isArray(v.itens)?v.itens:[]).forEach(it=>{
      const key=_tgChaveProduto(it);
      if(!produtos.has(key)) produtos.set(key,{nome:it.produtoNome||'Produto não identificado',qtd:0,total:0});
      const p=produtos.get(key); p.qtd+=Number(it.quantidade||0); p.total+=_tgValorItem(it);
    });
  });
  const aVista=vendas.filter(v=>v.formaPagamento!=='Prazo').reduce((s,v)=>s+Number(v.total||0),0);
  const aPrazo=vendas.filter(v=>v.formaPagamento==='Prazo').reduce((s,v)=>s+Number(v.total||0),0);
  const linhasProdutos=[...produtos.values()].sort((a,b)=>a.nome.localeCompare(b.nome)).map(p=>`• ${_tgTextoSeguro(p.nome)}: ${_tgQtd(p.qtd)} un. — ${_tgMoney(p.total)}`).join('\n')||'• Nenhum produto vendido no período.';
  const linhasClientes=[...clientes.values()].sort((a,b)=>a.nome.localeCompare(b.nome)).map(c=>`• ${_tgTextoSeguro(c.nome)}: ${c.vendas.length} venda(s) — ${_tgMoney(c.total)}`).join('\n')||'• Nenhum cliente atendido no período.';
  const blocos=[
    _tgBloco('RESUMO',[`Faturamento total: ${_tgMoney(vendas.reduce((s,v)=>s+Number(v.total||0),0))}`,`Quantidade de vendas: ${vendas.length}`,`Clientes atendidos: ${clientes.size}`,`Total à vista: ${_tgMoney(aVista)}`,`Total a prazo: ${_tgMoney(aPrazo)}`]),
    _tgBloco('POR PRODUTO',[linhasProdutos]),
    _tgBloco('CLIENTES ATENDIDOS',[linhasClientes]),
    ...[...clientes.values()].sort((a,b)=>a.nome.localeCompare(b.nome)).map(c=>{
      const linhas=[`Cliente: ${_tgTextoSeguro(c.nome)}`,`Total vendido ao cliente: ${_tgMoney(c.total)}`];
      c.vendas.forEach(v=>{
        linhas.push(`${_tgDataHora(v.data,v.updatedAt)} | Venda total: ${_tgMoney(v.total)} | Pagamento: ${_tgTextoSeguro(v.formaPagamento||'Não informado')} | Status: ${_tgTextoSeguro(v.statusPagamento||'Não informado')}`);
        (Array.isArray(v.itens)?v.itens:[]).forEach(it=>linhas.push(`  ${_tgQtd(it.quantidade)}× ${_tgTextoSeguro(it.produtoNome||'Produto não identificado')} a ${_tgMoney(it.precoUnitario)} = ${_tgMoney(_tgValorItem(it))}`));
      });
      return _tgBloco('🧾 '+c.nome,linhas);
    })
  ];
  return _tgPaginar('🛒 VENDAS DO DIA',`Referência: ${formatDateBR(dataRef)}`,blocos);
}

async function gerarRelatorioProducaoTelegram(dataRef){
  const [producoes,movimentos]=await Promise.all([reqToPromise(getStore('producoes').getAll()),reqToPromise(getStore('movimentos_estoque').getAll())]);
  const periodo=producoes.filter(p=>_tgDataKey(p.data)===dataRef).sort((a,b)=>String(a.updatedAt||'').localeCompare(String(b.updatedAt||'')));
  const consumo=movimentos.filter(m=>_tgDataKey(m.data)===dataRef&&m.origem==='producao'&&m.itemTipo==='insumo'&&m.tipo==='saida');
  const produtos=new Map(); periodo.forEach(p=>{const k=String(p.produtoId??p.produtoNome??p.id);if(!produtos.has(k)) produtos.set(k,{nome:p.produtoNome||'Produto não identificado',qtd:0});produtos.get(k).qtd+=Number(p.quantidade||0);});
  const insumos=new Map(); consumo.forEach(m=>{const k=String(m.itemId??m.itemNome??m.id);if(!insumos.has(k)) insumos.set(k,{nome:m.itemNome||'Insumo não identificado',qtd:0});insumos.get(k).qtd+=Number(m.quantidade||0);});
  const linhasProdutos=[...produtos.values()].sort((a,b)=>a.nome.localeCompare(b.nome)).map(p=>`• ${_tgTextoSeguro(p.nome)}: ${_tgQtd(p.qtd)}`).join('\n')||'• Nenhum produto fabricado no período.';
  const linhasInsumos=[...insumos.values()].sort((a,b)=>a.nome.localeCompare(b.nome)).map(i=>`• ${_tgTextoSeguro(i.nome)}: ${_tgQtd(i.qtd)}`).join('\n')||'• Nenhum consumo de insumo registrado.';
  const registros=periodo.map(p=>`• ${_tgDataHora(p.data,p.updatedAt)} — ${_tgTextoSeguro(p.produtoNome||'Produto não identificado')}: ${_tgQtd(p.quantidade)}`).join('\n')||'• Nenhum registro de produção.';
  return _tgPaginar('🏭 PRODUÇÃO DO DIA',`Referência: ${formatDateBR(dataRef)}`,[
    _tgBloco('RESUMO',[`Total de registros: ${periodo.length}`]),
    _tgBloco('PRODUTOS FABRICADOS',[linhasProdutos]),
    _tgBloco('INSUMOS CONSUMIDOS',[linhasInsumos]),
    _tgBloco('REGISTROS DO PERÍODO',[registros])
  ]);
}

async function gerarRelatorioEstoqueTelegram(){
  const [produtos,insumos]=await Promise.all([reqToPromise(getStore('produtos').getAll()),reqToPromise(getStore('insumos').getAll())]);
  const unidade=x=>x.unidade||x.unidadeMedida||x.unidadeEstoque||'';
  const linha=x=>`• ${_tgTextoSeguro(x.nome||'Item não identificado')}: ${_tgQtd(currentStock(x))}${unidade(x)?' '+_tgTextoSeguro(unidade(x)):''}`;
  const produtosOrdenados=produtos.sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||'')));
  const insumosOrdenados=insumos.sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||'')));
  const negativosProdutos=produtosOrdenados.filter(p=>currentStock(p)<0).map(linha).join('\n')||'• Nenhum produto negativo.';
  const negativosInsumos=insumosOrdenados.filter(i=>currentStock(i)<0).map(linha).join('\n')||'• Nenhum insumo negativo.';
  const zeradosProdutos=produtosOrdenados.filter(p=>currentStock(p)===0).map(linha).join('\n')||'• Nenhum produto zerado.';
  const zeradosInsumos=insumosOrdenados.filter(i=>currentStock(i)===0).map(linha).join('\n')||'• Nenhum insumo zerado.';
  return _tgPaginar('📦 ESTOQUE DE PRODUTOS E INSUMOS',`Posição: ${_tgDataHora(new Date().toISOString().slice(0,10),new Date().toISOString())}`,[
    _tgBloco('TOTAIS CADASTRAIS',[`Produtos cadastrados: ${produtos.length}`,`Insumos cadastrados: ${insumos.length}`]),
    _tgBloco('PRODUTOS',[produtosOrdenados.map(linha).join('\n')||'• Nenhum produto cadastrado.']),
    _tgBloco('INSUMOS',[insumosOrdenados.map(linha).join('\n')||'• Nenhum insumo cadastrado.']),
    _tgBloco('⚠️ ITENS NEGATIVOS',[`Produtos:\n${negativosProdutos}`,`Insumos:\n${negativosInsumos}`]),
    _tgBloco('ITENS ZERADOS',[`Produtos:\n${zeradosProdutos}`,`Insumos:\n${zeradosInsumos}`])
  ]);
}

async function gerarRelatorioPatrimonioTelegram(){
  const bens=await reqToPromise(getStore('patrimonio_bens').getAll());
  const valorTotal=bens.reduce((s,b)=>s+Number(b.valor||0),0);
  const linhas=bens.sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''))).map(b=>{
    const extras=[];
    if(b.quantidade!==undefined&&b.quantidade!==null&&b.quantidade!=='') extras.push(`Quantidade: ${_tgQtd(b.quantidade)}`);
    if(b.localizacao||b.local) extras.push(`Localização: ${_tgTextoSeguro(b.localizacao||b.local)}`);
    if(b.estadoConservacao||b.conservacao||b.estado) extras.push(`Estado: ${_tgTextoSeguro(b.estadoConservacao||b.conservacao||b.estado)}`);
    if(b.categoria) extras.push(`Categoria: ${_tgTextoSeguro(b.categoria)}`);
    extras.push(`Valor: ${_tgMoney(b.valor)}`);
    if(b.forma) extras.push(`Situação: ${_tgTextoSeguro(b.forma==='quitado'?'Quitado':'Parcelado')}`);
    if(b.parcelas) extras.push(`Parcelas: ${_tgTextoSeguro(b.parcelas)}`);
    if(b.data) extras.push(`Data: ${formatDateBR(b.data)}`);
    if(b.obs) extras.push(`Observação: ${_tgTextoSeguro(b.obs)}`);
    return `• ${_tgTextoSeguro(b.nome||'Bem sem identificação')}\n  ${extras.join(' | ')}`;
  }).join('\n')||'• Nenhum bem cadastrado.';
  return _tgPaginar('🏗️ PATRIMÔNIO DA FÁBRICA',`Posição: ${formatDateBR(new Date().toISOString().slice(0,10))}`,[
    _tgBloco('RESUMO',[`Bens cadastrados: ${bens.length}`,`Valor patrimonial registrado: ${_tgMoney(valorTotal)}`]),
    _tgBloco('BENS CADASTRADOS',[linhas])
  ]);
}

async function gerarRelatorioComodatosTelegram(dataRef){
  const movimentos=await reqToPromise(getStore('comodato_movimentacoes').getAll());
  const periodo=movimentos.filter(m=>_tgDataKey(m.data)===dataRef).sort((a,b)=>_tgOrdenacao(a,dataRef).localeCompare(_tgOrdenacao(b,dataRef)));
  const linhasPeriodo=periodo.map(m=>`${_tgDataHora(m.data,m.updatedAt)} | ${m.acao==='saida'?'EMPRÉSTIMO':'DEVOLUÇÃO'} | ${_tgTextoSeguro(m.clienteNome||'Cliente não informado')} | ${_tgQtd(m.quantidade)} ${_tgTextoSeguro(m.tipo||'')} ${m.observacao?'| '+_tgTextoSeguro(m.observacao):''}`).join('\n')||'• Nenhuma movimentação de comodato no período.';
  const mapa=new Map();
  movimentos.forEach(m=>{
    const k=String(m.clienteId??m.clienteNome??m.id);
    if(!mapa.has(k)) mapa.set(k,{nome:m.clienteNome||'Cliente não informado',novo:0,velho:0});
    const c=mapa.get(k); const delta=m.acao==='saida'?Number(m.quantidade||0):-Number(m.quantidade||0);
    if(m.tipo==='Novo') c.novo+=delta; else c.velho+=delta;
  });
  const clientes=[...mapa.values()].sort((a,b)=>a.nome.localeCompare(b.nome));
  const comSaldo=clientes.filter(c=>c.novo!==0||c.velho!==0);
  const totalNovo=comSaldo.reduce((s,c)=>s+c.novo,0),totalVelho=comSaldo.reduce((s,c)=>s+c.velho,0);
  const linhasPosicao=clientes.map(c=>`• ${_tgTextoSeguro(c.nome)}: Novos ${_tgQtd(c.novo)} | Velhos ${_tgQtd(c.velho)} | Total ${_tgQtd(c.novo+c.velho)}${c.novo<0||c.velho<0?' | ⚠️ saldo negativo/crédito':''}`).join('\n')||'• Nenhum cliente com movimentação de comodato.';
  return _tgPaginar('🏺 COMODATOS',`Referência: ${formatDateBR(dataRef)}`,[
    _tgBloco('MOVIMENTAÇÕES DO PERÍODO',[linhasPeriodo]),
    _tgBloco('POSIÇÃO ATUAL',[`Clientes com saldo: ${comSaldo.length}`,`Total líquido novos: ${_tgQtd(totalNovo)}`,`Total líquido velhos: ${_tgQtd(totalVelho)}`,`Total líquido geral: ${_tgQtd(totalNovo+totalVelho)}`,`Total físico positivo: ${_tgQtd(comSaldo.reduce((s,c)=>s+Math.max(0,c.novo+c.velho),0))}`,linhasPosicao])
  ]);
}

async function gerarRelatorioCustosTelegram(dataRef){
  const [lancamentos,contas,patrimonios]=await Promise.all([reqToPromise(getStore('financeiro_lancamentos').getAll()),reqToPromise(getStore('contas_pagar').getAll()),reqToPromise(getStore('patrimonio_bens').getAll())]);
  const tecnicas=new Set(['transferencia','estorno_vale','estorno_folha','estorno_venda']);
  const pagos=lancamentos.filter(l=>_tgDataKey(l.data)===dataRef&&l.tipo==='saida'&&!tecnicas.has(l.origem||'')&&l.origem!=='vale');
  const vales=lancamentos.filter(l=>_tgDataKey(l.data)===dataRef&&l.tipo==='saida'&&l.origem==='vale');
  const estornosVales=lancamentos.filter(l=>_tgDataKey(l.data)===dataRef&&l.tipo==='entrada'&&l.origem==='estorno_vale');
  const totalPagosBase=pagos.reduce((s,l)=>s+Number(l.valor||0),0);
  const totalVales=Math.max(0,vales.reduce((s,l)=>s+Number(l.valor||0),0)-estornosVales.reduce((s,l)=>s+Number(l.valor||0),0));
  const pagosDetalhe=[...pagos,...vales].sort((a,b)=>_tgOrdenacao(a,dataRef).localeCompare(_tgOrdenacao(b,dataRef)));
  const mapaCategorias=new Map(),mapaFormas=new Map();
  pagosDetalhe.forEach(l=>{const cat=l.tipoCusto||l.origem||'Outros';mapaCategorias.set(cat,(mapaCategorias.get(cat)||0)+Number(l.valor||0));const forma=l.formaPagamento||l.gaveta||'Não informado';mapaFormas.set(forma,(mapaFormas.get(forma)||0)+Number(l.valor||0));});
  const linhasCategorias=[...mapaCategorias.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>`• ${_tgTextoSeguro(k)}: ${_tgMoney(v)}`).join('\n')||'• Nenhuma categoria paga no período.';
  const linhasFormas=[...mapaFormas.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>`• ${_tgTextoSeguro(k)}: ${_tgMoney(v)}`).join('\n')||'• Nenhuma forma de pagamento no período.';
  const linhasPagas=pagosDetalhe.map(l=>`• ${_tgDataHora(l.data,l.updatedAt)} — ${_tgTextoSeguro(l.descricao||'Despesa')} | Categoria: ${_tgTextoSeguro(l.tipoCusto||l.origem||'Outros')} | Valor: ${_tgMoney(l.valor)} | Forma/Gaveta: ${_tgTextoSeguro(l.formaPagamento||l.gaveta||'Não informado')}`).join('\n')||'• Nenhuma despesa efetivamente paga no período.';
  const mapaPatrimonio=new Map(patrimonios.map(p=>[String(p.id),p.data]));
  const prazo=contas.filter(c=>_tgDataKey(c.dataCompra)===dataRef||(c.origem==='patrimonio'&&_tgDataKey(mapaPatrimonio.get(String(c.patrimonioId)))===dataRef));
  const totalPrazo=prazo.reduce((s,c)=>s+Number(c.valor||0),0);
  const linhasPrazo=prazo.sort((a,b)=>String(a.dataVencimento||'9999-99-99').localeCompare(String(b.dataVencimento||'9999-99-99'))).map(c=>`• ${_tgTextoSeguro(c.fornecedorNome||c.descricao||'Conta')} | ${_tgTextoSeguro(c.descricao||'')} | Valor lançado: ${_tgMoney(c.valor)} | Venc.: ${c.dataVencimento?formatDateBR(c.dataVencimento):'sem data'} | Situação: ${_tgTextoSeguro(c.status||'Em Aberto')}`).join('\n')||'• Nenhum custo lançado a prazo no período.';
  return _tgPaginar('💸 CUSTOS E DESPESAS',`Referência: ${formatDateBR(dataRef)}`,[
    _tgBloco('RESUMO',[`Despesas efetivamente pagas: ${_tgMoney(totalPagosBase+totalVales)}`,`Custos lançados a prazo: ${_tgMoney(totalPrazo)}`,`Estornos de vales considerados na neutralização: ${_tgMoney(estornosVales.reduce((s,l)=>s+Number(l.valor||0),0))}`]),
    _tgBloco('POR CATEGORIA',[linhasCategorias]),
    _tgBloco('POR FORMA DE PAGAMENTO',[linhasFormas]),
    _tgBloco('DESPESAS PAGAS',[linhasPagas]),
    _tgBloco('LANÇAMENTOS A PRAZO',[linhasPrazo])
  ]);
}

async function gerarRelatorioDevedoresCreditosTelegram(){
  const [limites,clientes]=await Promise.all([reqToPromise(getStore('limites_credito').getAll()),reqToPromise(getStore('clientes').getAll())]);
  const mapaClientes=new Map(clientes.map(c=>[String(c.id),c.nome]));
  const registros=limites.map(l=>({...l,nome:l.clienteNome||mapaClientes.get(String(l.clienteId??l.id))||`Cliente ${l.clienteId??l.id}`}));
  const devedores=registros.filter(l=>Number(l.saldoDevedor||0)>0.009).sort((a,b)=>a.nome.localeCompare(b.nome));
  const creditos=registros.filter(l=>Number(l.saldoCredito||0)>0.009).sort((a,b)=>a.nome.localeCompare(b.nome));
  const linhasDev=devedores.map(d=>`• ${_tgTextoSeguro(d.nome)}: ${_tgMoney(d.saldoDevedor)}${Number(d.saldoCredito||0)>0?` | Crédito separado: ${_tgMoney(d.saldoCredito)}`:''}`).join('\n')||'• Nenhum cliente devedor.';
  const linhasCred=creditos.map(d=>`• ${_tgTextoSeguro(d.nome)}: ${_tgMoney(d.saldoCredito)}${Number(d.saldoDevedor||0)>0?` | Dívida separada: ${_tgMoney(d.saldoDevedor)}`:''}`).join('\n')||'• Nenhum cliente com crédito.';
  return _tgPaginar('💳 CLIENTES DEVEDORES E CRÉDITOS',`Posição: ${formatDateBR(new Date().toISOString().slice(0,10))}`,[
    _tgBloco('DEVEDORES',[`Clientes: ${devedores.length}`,`Total a receber: ${_tgMoney(devedores.reduce((s,d)=>s+Number(d.saldoDevedor||0),0))}`,linhasDev]),
    _tgBloco('CRÉDITOS',[`Clientes: ${creditos.length}`,`Total de créditos: ${_tgMoney(creditos.reduce((s,d)=>s+Number(d.saldoCredito||0),0))}`,linhasCred])
  ]);
}

async function gerarRelatorioContasPagarTelegram(){
  const contas=await reqToPromise(getStore('contas_pagar').getAll());
  const hoje=new Date().toISOString().slice(0,10);
  const pendentes=contas.filter(c=>c.status!=='Paga');
  const ordenar=(a,b)=>{
    const aSem=!a.dataVencimento,bSem=!b.dataVencimento;
    if(aSem!==bSem) return aSem?1:-1;
    if(aSem&&bSem) return String(a.id).localeCompare(String(b.id));
    return String(a.dataVencimento).localeCompare(String(b.dataVencimento));
  };
  const ordenadas=[...pendentes].sort(ordenar);
  const vencidas=ordenadas.filter(c=>c.dataVencimento&&c.dataVencimento<hoje);
  const proximas=ordenadas.filter(c=>c.dataVencimento&&c.dataVencimento>=hoje&&_tgDiasEntre(c.dataVencimento,hoje)<=30);
  const demais=ordenadas.filter(c=>!vencidas.includes(c)&&!proximas.includes(c)&&c.dataVencimento);
  const semData=ordenadas.filter(c=>!c.dataVencimento);
  const linha=c=>`• ${_tgTextoSeguro(c.fornecedorNome||c.descricao||'Conta')} | ${_tgTextoSeguro(c.descricao||'')} | Valor: ${_tgMoney(c.saldoRestante??c.valor)} | Vencimento: ${c.dataVencimento?formatDateBR(c.dataVencimento):'sem data'} | Situação: ${_tgStatusConta(c,hoje)}`;
  return _tgPaginar('📅 CONTAS A PAGAR',`Posição: ${formatDateBR(hoje)}`,[
    _tgBloco('RESUMO',[`Contas pendentes: ${pendentes.length}`,`Valor total pendente: ${_tgMoney(pendentes.reduce((s,c)=>s+Number(c.saldoRestante??c.valor??0),0))}`,`Vencidas: ${vencidas.length}`,`Próximas do vencimento: ${proximas.length}`]),
    _tgBloco('🔴 VENCIDAS',[vencidas.map(linha).join('\n')||'• Nenhuma conta vencida.']),
    _tgBloco('🟡 PRÓXIMAS DO VENCIMENTO',[proximas.map(linha).join('\n')||'• Nenhuma conta próxima do vencimento.']),
    _tgBloco('DEMAIS CONTAS',[demais.map(linha).join('\n')||'• Nenhuma outra conta com data.']),
    _tgBloco('SEM DATA',[semData.map(linha).join('\n')||'• Nenhuma conta sem data de vencimento.'])
  ]);
}

async function gerarRelatorioDocumentacaoTelegram(){
  const documentos=await reqToPromise(getStore('documentos_escada').getAll());
  const temVencidoNaBase=documentos.some(d=>Number(d.nivel||0)>1&&getDocStatusEscada(d.dataVencimento).tipo==='vencido');
  const ordenados=documentos.map(d=>{
    const base=getDocStatusEscada(d.dataVencimento);
    const risco=Number(d.nivel||0)===1&&base.tipo==='ok'&&temVencidoNaBase;
    return {...d,statusBase:base,statusFinal:risco?{...base,tipo:'risco_cascata',label:'⚠️ BASE COMPROMETIDA'}:base};
  }).sort((a,b)=>{
    const ordem=x=>x.statusBase.tipo==='vencido'?0:x.statusBase.tipo==='alerta'?1:x.statusBase.tipo==='ok'?2:3;
    const oa=ordem(a),ob=ordem(b); if(oa!==ob) return oa-ob;
    if(!a.dataVencimento) return 1; if(!b.dataVencimento) return -1;
    return a.dataVencimento.localeCompare(b.dataVencimento);
  });
  const linha=d=>{
    const s=d.statusFinal;
    const venc=d.dataVencimento?`Vencimento: ${formatDateBR(d.dataVencimento)}`:'Sem vencimento informado';
    const dias=s.diff===undefined?'':(s.diff<0?` | Vencido há ${Math.abs(s.diff)} dia(s)`:` | Faltam ${s.diff} dia(s)`);
    return `• ${_tgTextoSeguro(d.nome||'Documento sem nome')} | Nível: ${_tgTextoSeguro(d.nivel??'não informado')} | ${venc}${dias} | ${_tgTextoSeguro(s.label)}`;
  };
  const vencidos=ordenados.filter(d=>d.statusBase.tipo==='vencido');
  const proximos=ordenados.filter(d=>d.statusBase.tipo==='alerta');
  const validos=ordenados.filter(d=>d.statusBase.tipo==='ok');
  const semData=ordenados.filter(d=>d.statusBase.tipo==='sem_data');
  return _tgPaginar('📑 DOCUMENTAÇÃO E VENCIMENTOS',`Posição: ${formatDateBR(new Date().toISOString().slice(0,10))}`,[
    _tgBloco('RESUMO',[`Documentos cadastrados: ${documentos.length}`,`Vencidos: ${vencidos.length}`,`Próximos do vencimento: ${proximos.length}`,`Válidos: ${validos.length}`,`Sem data: ${semData.length}`]),
    _tgBloco('🔴 VENCIDOS',[vencidos.map(linha).join('\n')||'• Nenhum documento vencido.']),
    _tgBloco('🟡 PRÓXIMOS DO VENCIMENTO',[proximos.map(linha).join('\n')||'• Nenhum documento próximo do vencimento.']),
    _tgBloco('🟢 DEMAIS DOCUMENTOS VÁLIDOS',[validos.map(linha).join('\n')||'• Nenhum outro documento válido.']),
    _tgBloco('⚪ SEM DATA DE VENCIMENTO',[semData.map(linha).join('\n')||'• Nenhum documento sem data.'])
  ]);
}

async function gerarRelatorioOcorrenciasTelegram(dataRef){
  const [auditoria,movimentos]=await Promise.all([reqToPromise(getStore('extrato_eventos').getAll()),reqToPromise(getStore('movimentos_estoque').getAll())]);
  const eventos=[]; let seq=0;
  const adicionar=(data,updatedAt,hora,texto)=>eventos.push({ordem:_tgOrdenacao({data,updatedAt},data,hora),seq:seq++,texto});
  const tiposDetalhados=new Set(['VENDA','COMPRA','PRODUÇÃO','COMODATO','VALE','PAGAMENTO','CUSTO','PATRIMÔNIO','TRANSFERÊNCIA','RECEBIMENTO','DOCUMENTO','FOLHA']);
  auditoria.filter(e=>{
    if(_tgDataKey(e.data)!==dataRef) return false;
    const tipo=String(e.tipo||'EVENTO').toUpperCase();
    if(tipo==='ESTORNO') return true;
    return !tiposDetalhados.has(tipo);
  }).forEach(e=>{
    const tipo=String(e.tipo||'EVENTO').toUpperCase();
    const linhas=[`${_tgDataHora(e.data,e.criadoEm,e.hora)} | ${tipo}`];
    if(e.titulo) linhas.push(`Evento: ${_tgTextoSeguro(e.titulo)}`);
    if(e.detalhes) e.detalhes.split('\n').forEach(l=>linhas.push(_tgTextoSeguro(l)));
    adicionar(e.data,e.criadoEm,e.hora,_tgBloco('📋 EVENTO AUDITÁVEL',linhas));
  });
  movimentos.filter(m=>_tgDataKey(m.data)===dataRef&&(!['venda','compra','producao','estorno_venda'].includes(m.origem||'')||m.origem==='ajuste_manual')).forEach(m=>{
    const origem=m.origem||'movimento';
    const titulo=origem==='ajuste_manual'?'🛠️ AJUSTE DE ESTOQUE':(m.tipo==='entrada'?'📥 ENTRADA DE ESTOQUE':'📤 SAÍDA DE ESTOQUE');
    const linhas=[`${_tgDataHora(m.data,m.updatedAt)} | ${String(origem).toUpperCase()}`,`Item: ${_tgTextoSeguro(m.itemNome||'Item não informado')}`,`Quantidade: ${_tgQtd(m.quantidade)}`,`Tipo: ${_tgTextoSeguro(m.itemTipo||'Não informado')}`];
    adicionar(m.data,m.updatedAt,_tgHora(m.data,m.updatedAt),_tgBloco(titulo,linhas));
  });
  eventos.sort((a,b)=>a.ordem.localeCompare(b.ordem)||a.seq-b.seq);
  return _tgPaginar('🔄 MOVIMENTAÇÕES E OCORRÊNCIAS',`Referência: ${formatDateBR(dataRef)}`,[eventos.length?eventos.map(e=>e.texto).join('\n\n'):'Nenhuma ocorrência adicional registrada no período.']);
}

/* Compatibilidade interna: as implementações históricas permanecem disponíveis, mas o fechamento v3.9 usa exclusivamente os 11 relatórios independentes. */
async function gerarRelatorioExtratoFechamento(dataRef){
  const [vendas, compras, producoes, movimentos, financeiros, comodatos, auditoria] = await Promise.all([
    reqToPromise(getStore('vendas').getAll()),
    reqToPromise(getStore('compras').getAll()),
    reqToPromise(getStore('producoes').getAll()),
    reqToPromise(getStore('movimentos_estoque').getAll()),
    reqToPromise(getStore('financeiro_lancamentos').getAll()),
    reqToPromise(getStore('comodato_movimentacoes').getAll()),
    reqToPromise(getStore('extrato_eventos').getAll())
  ]);
  const eventos=[];
  let seq=0;
  const adicionar=(data,updatedAt,hora,texto)=>eventos.push({ordem:_tgOrdenacao({data,updatedAt},data,hora),seq:seq++,texto});
  const vendasPeriodo=vendas.filter(v=>_tgDataKey(v.data)===dataRef);
  const comprasPeriodo=compras.filter(c=>_tgDataKey(c.data)===dataRef);
  const producoesPeriodo=producoes.filter(p=>_tgDataKey(p.data)===dataRef);
  const comodatosPeriodo=comodatos.filter(m=>_tgDataKey(m.data)===dataRef);
  const estornoMovs=movimentos.filter(m=>_tgDataKey(m.data)===dataRef && m.origem==='estorno_venda');
  const estornoGrupos=new Map();
  estornoMovs.forEach(m=>{
    const chave=String(m.referenciaId||m.id);
    if(!estornoGrupos.has(chave)) estornoGrupos.set(chave,[]);
    estornoGrupos.get(chave).push(m);
  });
  const estornoRefs=new Set([...estornoGrupos.keys()]);

  vendasPeriodo.forEach(v=>{
    const hora=_tgHora(v.data,v.updatedAt);
    const linhas=[`${_tgDataHora(v.data,v.updatedAt)} | VENDA`, `Cliente: ${_tgTextoSeguro(v.clienteNome||'Não informado')}`];
    (v.itens||[]).forEach(it=>linhas.push(`${_tgTextoSeguro(it.quantidade)}× ${_tgTextoSeguro(it.produtoNome||'Produto não informado')} — ${_tgMoney(it.precoUnitario)} un. | Total: ${_tgMoney(it.subtotal)}`));
    linhas.push(`Total: ${_tgMoney(v.total)}`,`Pagamento: ${_tgTextoSeguro(v.formaPagamento||'Não informado')}`);
    adicionar(v.data,v.updatedAt,hora,_tgBloco('🛒 VENDA',linhas));
  });
  comprasPeriodo.forEach(c=>{
    const linhas=[`${_tgDataHora(c.data,c.updatedAt)} | COMPRA`,`Fornecedor: ${_tgTextoSeguro(c.fornecedorNome||'Não informado')}`,`Item: ${_tgTextoSeguro(c.itemNome||'Não informado')}`,`Quantidade: ${_tgTextoSeguro(c.quantidade)}`,`Preço unitário: ${_tgMoney(c.precoUnitario)}`,`Total: ${_tgMoney(c.total)}`,`Pagamento: ${_tgTextoSeguro(c.formaPagamento||'Não informado')}`];
    adicionar(c.data,c.updatedAt,_tgHora(c.data,c.updatedAt),_tgBloco('📥 COMPRA / ENTRADA',linhas));
  });
  producoesPeriodo.forEach(p=>{
    const linhas=[`${_tgDataHora(p.data,p.updatedAt)} | PRODUÇÃO`,`Produto: ${_tgTextoSeguro(p.produtoNome||'Não informado')}`,`Quantidade produzida: ${_tgTextoSeguro(p.quantidade)}`];
    adicionar(p.data,p.updatedAt,_tgHora(p.data,p.updatedAt),_tgBloco('🏭 PRODUÇÃO',linhas));
  });
  comodatosPeriodo.forEach(m=>{
    const retorno=m.acao==='entrada';
    const linhas=[`${_tgDataHora(m.data,m.updatedAt)} | COMODATO`,`Cliente: ${_tgTextoSeguro(m.clienteNome||'Não informado')}`,`${retorno?'Devolvidos':'Emprestados'}: ${_tgTextoSeguro(m.quantidade)} garrafão(ões) ${_tgTextoSeguro(m.tipo||'')}`];
    if(m.observacao) linhas.push(`Observação: ${_tgTextoSeguro(m.observacao)}`);
    adicionar(m.data,m.updatedAt,_tgHora(m.data,m.updatedAt),_tgBloco('🏺 COMODATO',linhas));
  });
  estornoGrupos.forEach((lista,chave)=>{
    const venda=vendas.find(v=>String(v.id)===chave);
    const primeiro=lista[0];
    const linhas=[`${_tgDataHora(primeiro.data,primeiro.updatedAt)} | ESTORNO`];
    if(venda?.clienteNome) linhas.push(`Cliente: ${_tgTextoSeguro(venda.clienteNome)}`);
    lista.forEach(m=>linhas.push(`Produto: ${_tgTextoSeguro(m.itemNome||'Item não informado')} | Quantidade: ${_tgTextoSeguro(m.quantidade)}`));
    const financeiro=financeiros.find(l=>l.origem==='estorno_venda'&&String(l.referenciaId||'')===chave&&_tgDataKey(l.data)===dataRef);
    if(financeiro) linhas.push(`Valor financeiro estornado: ${_tgMoney(financeiro.valor)}`);
    adicionar(primeiro.data,primeiro.updatedAt,_tgHora(primeiro.data,primeiro.updatedAt),_tgBloco('↩️ ESTORNO',linhas));
  });

  const origensFinanceirasDuplicadas=new Set(['venda','compra','estorno_venda']);
  financeiros.filter(l=>_tgDataKey(l.data)===dataRef && !origensFinanceirasDuplicadas.has(l.origem||'')).forEach(l=>{
    const origem=l.origem||'';
    const hora=_tgHora(l.data,l.updatedAt);
    let titulo='💸 MOVIMENTAÇÃO FINANCEIRA';
    if(origem==='recebimento') titulo='💰 RECEBIMENTO';
    else if(origem==='transferencia') titulo='🔄 SANGRIA / TRANSFERÊNCIA';
    else if(origem==='estorno_vale'||origem==='estorno_folha') titulo='↩️ ESTORNO FINANCEIRO';
    else if(l.tipo==='entrada') titulo='💰 ENTRADA FINANCEIRA';
    else if(l.tipo==='saida') titulo='💸 PAGAMENTO / SAÍDA';
    let descricao=l.descricao||'Movimentação sem descrição';
    let cliente='';
    if(origem==='recebimento'){
      cliente=descricao.replace(/^Recebimento \((Dinheiro|Pix)\):\s*/,'').trim();
      descricao='Recebimento de cliente';
    }
    const linhas=[`${_tgDataHora(l.data,l.updatedAt)} | ${origem||l.tipo||'MOVIMENTO'}`];
    if(cliente) linhas.push(`Cliente: ${_tgTextoSeguro(cliente)}`);
    linhas.push(`Descrição: ${_tgTextoSeguro(descricao)}`,`${l.tipo==='entrada'?'Recebido':'Pago'}: ${_tgMoney(l.valor)}`);
    if(l.formaPagamento||l.gaveta) linhas.push(`Forma/Gaveta: ${_tgTextoSeguro(l.formaPagamento||l.gaveta)}`);
    adicionar(l.data,l.updatedAt,hora,_tgBloco(titulo,linhas));
  });

  const movimentosConhecidos=new Set(['venda','compra','producao','estorno_venda']);
  movimentos.filter(m=>_tgDataKey(m.data)===dataRef && !movimentosConhecidos.has(m.origem||'')).forEach(m=>{
    const origem=m.origem||'movimento';
    const titulo=origem==='ajuste_manual'?'🛠️ AJUSTE DE ESTOQUE':(m.tipo==='entrada'?'📥 ENTRADA DE ESTOQUE':'📤 SAÍDA DE ESTOQUE');
    const linhas=[`${_tgDataHora(m.data,m.updatedAt)} | ${origem.toUpperCase()}`,`Item: ${_tgTextoSeguro(m.itemNome||'Não informado')}`,`Quantidade: ${_tgTextoSeguro(m.quantidade)}`,`Tipo: ${_tgTextoSeguro(m.itemTipo||'Não informado')}`];
    adicionar(m.data,m.updatedAt,_tgHora(m.data,m.updatedAt),_tgBloco(titulo,linhas));
  });
  movimentos.filter(m=>_tgDataKey(m.data)===dataRef && m.origem==='producao' && m.itemTipo==='insumo').forEach(m=>{
    const linhas=[`${_tgDataHora(m.data,m.updatedAt)} | CONSUMO DE INSUMO`,`Insumo: ${_tgTextoSeguro(m.itemNome||'Não informado')}`,`Quantidade consumida: ${_tgTextoSeguro(m.quantidade)}`];
    adicionar(m.data,m.updatedAt,_tgHora(m.data,m.updatedAt),_tgBloco('🛠️ CONSUMO NA PRODUÇÃO',linhas));
  });

  const tiposAuditoriaDuplicados=new Set(['VENDA','COMPRA','PRODUÇÃO','COMODATO','VALE','PAGAMENTO','CUSTO','PATRIMÔNIO']);
  auditoria.filter(e=>{
    if(_tgDataKey(e.data)!==dataRef) return false;
    const tipo=String(e.tipo||'').toUpperCase();
    if(tiposAuditoriaDuplicados.has(tipo)){
      const textoOperacao=`${e.titulo||''} ${e.detalhes||''}`.toLowerCase();
      if(tipo==='CUSTO') return textoOperacao.includes('a prazo') || textoOperacao.includes('contas a pagar');
      if(tipo==='PATRIMÔNIO') return textoOperacao.includes('parcelado') || textoOperacao.includes('contas a pagar');
      return false;
    }
    if(tipo==='ESTORNO'){
      const textoEstorno=`${e.titulo||''} ${e.detalhes||''}`.toLowerCase();
      return !textoEstorno.includes('estorno de venda') && !textoEstorno.includes('estoque devolvido');
    }
    return true;
  }).forEach(e=>{
    const tipo=String(e.tipo||'EVENTO').toUpperCase();
    const linhas=[`${_tgDataHora(e.data,e.criadoEm,e.hora)} | ${tipo}`];
    if(e.titulo) linhas.push(`Evento: ${_tgTextoSeguro(e.titulo)}`);
    if(e.detalhes) e.detalhes.split('\n').forEach(l=>linhas.push(_tgTextoSeguro(l)));
    adicionar(e.data,e.criadoEm,e.hora,_tgBloco('📋 EVENTO AUDITÁVEL',linhas));
  });
  eventos.sort((a,b)=>a.ordem.localeCompare(b.ordem)||a.seq-b.seq);
  const blocos=eventos.map(e=>e.texto);
  return _tgPaginar('📋 EXTRATO DE MOVIMENTAÇÕES',`Referência: ${formatDateBR(dataRef)}`,blocos);
}

async function gerarRelatorioFechamentoDiario(dataRef, hojeItems, gavetas){
  const [vendas, producoes, movimentos, comodatos, contas] = await Promise.all([
    reqToPromise(getStore('vendas').getAll()),
    reqToPromise(getStore('producoes').getAll()),
    reqToPromise(getStore('movimentos_estoque').getAll()),
    reqToPromise(getStore('comodato_movimentacoes').getAll()),
    reqToPromise(getStore('contas_pagar').getAll())
  ]);
  const fechamento=await _tgFechamentoRegistro(dataRef);
  const horaFechamento=fechamento?String(fechamento.updatedAt||'').slice(11,16):'';
  const getGaveta=l=>l.gaveta||l.formaPagamento||'Dinheiro';
  const dinheiroContadoOficial=Number(fechamento?.dinheiroContado ?? gavetas.dinheiroContado ?? 0);
  const pixContadoOficial=Number(fechamento?.pixContado ?? gavetas.pixContado ?? 0);
  const saldoTesoureiroOficial=Number(fechamento?.saldoTesoureiro ?? gavetas.saldoTesoureiro ?? 0);
  const entradas=hojeItems.filter(l=>l.tipo==='entrada');
  const saidas=hojeItems.filter(l=>l.tipo==='saida');
  const entDin=entradas.filter(l=>getGaveta(l)==='Dinheiro').reduce((s,l)=>s+Number(l.valor||0),0);
  const entPix=entradas.filter(l=>getGaveta(l)==='Pix').reduce((s,l)=>s+Number(l.valor||0),0);
  const entTes=entradas.filter(l=>getGaveta(l)==='Tesoureiro').reduce((s,l)=>s+Number(l.valor||0),0);
  const saiDin=saidas.filter(l=>getGaveta(l)==='Dinheiro').reduce((s,l)=>s+Number(l.valor||0),0);
  const saiPix=saidas.filter(l=>getGaveta(l)==='Pix').reduce((s,l)=>s+Number(l.valor||0),0);
  const saiTes=saidas.filter(l=>getGaveta(l)==='Tesoureiro').reduce((s,l)=>s+Number(l.valor||0),0);
  const totalEntradas=Number(fechamento?.totalEntradas ?? gavetas.totalEntradas ?? entradas.reduce((s,l)=>s+Number(l.valor||0),0));
  const totalSaidas=Number(fechamento?.totalSaidas ?? gavetas.totalSaidas ?? saidas.reduce((s,l)=>s+Number(l.valor||0),0));
  const saldoEsperado=Number(fechamento?.saldoEsperado ?? gavetas.saldoEsperado ?? (totalEntradas-totalSaidas));
  const diferenca=Number(fechamento?.diferenca ?? gavetas.diferenca ?? 0);
  const totalContado=dinheiroContadoOficial+pixContadoOficial+saldoTesoureiroOficial;
  const status=String(gavetas.status||(diferenca===0?'✅ Conferido':diferenca>0?'➕ Sobra':'➖ Falta'));
  const prodPeriodo=producoes.filter(p=>_tgDataKey(p.data)===dataRef);
  const vendasPeriodo=vendas.filter(v=>_tgDataKey(v.data)===dataRef);
  const movPeriodo=movimentos.filter(m=>_tgDataKey(m.data)===dataRef);
  const comodatoPeriodo=comodatos.filter(m=>_tgDataKey(m.data)===dataRef);
  const linhasProducao=prodPeriodo.length?prodPeriodo.map(p=>`• ${_tgTextoSeguro(p.produtoNome)}: ${_tgTextoSeguro(p.quantidade)}`).join('\n'):'• Nenhuma produção registrada.';
  const vendaMap=new Map();
  vendasPeriodo.forEach(v=>(v.itens||[]).forEach(it=>{const k=String(it.produtoId||it.produtoNome);if(!vendaMap.has(k)) vendaMap.set(k,{nome:it.produtoNome||'Produto',qtd:0,total:0});const x=vendaMap.get(k);x.qtd+=Number(it.quantidade||0);x.total+=Number(it.subtotal||it.valor||0);}));
  const linhasVendas=vendaMap.size?[...vendaMap.values()].map(x=>`• ${_tgTextoSeguro(x.nome)}: ${x.qtd} | ${_tgMoney(x.total)}`).join('\n'):'• Nenhuma venda registrada.';
  const comprasMov=movPeriodo.filter(m=>m.origem==='compra'&&m.tipo==='entrada');
  const linhasEntradas=comprasMov.length?comprasMov.map(m=>`• ${_tgTextoSeguro(m.itemNome)}: ${m.quantidade} (${_tgTextoSeguro(m.itemTipo||'item')})`).join('\n'):'• Nenhuma entrada adicional registrada.';
  const consumo=movPeriodo.filter(m=>m.origem==='producao'&&m.tipo==='saida');
  const linhasConsumo=consumo.length?consumo.map(m=>`• ${_tgTextoSeguro(m.itemNome)}: ${m.quantidade} (${_tgTextoSeguro(m.itemTipo||'item')})`).join('\n'):'• Nenhum consumo de insumo registrado.';
  const outrasSaidas=movPeriodo.filter(m=>m.tipo==='saida'&&!['venda','producao'].includes(m.origem||'')&&m.origem!=='estorno_venda');
  const linhasSaidas=outrasSaidas.length?outrasSaidas.map(m=>`• ${_tgTextoSeguro(m.itemNome)}: ${m.quantidade} — ${_tgTextoSeguro(m.origem||'saída')}`).join('\n'):'• Nenhuma outra saída registrada.';
  const estornos=movPeriodo.filter(m=>m.origem==='estorno_venda');
  const linhasEstornos=estornos.length?estornos.map(m=>`• ${_tgTextoSeguro(m.itemNome)}: ${m.quantidade}`).join('\n'):'• Nenhum estorno de estoque registrado.';
  const ajustes=movPeriodo.filter(m=>m.origem==='ajuste_manual');
  const linhasAjustes=ajustes.length?ajustes.map(m=>`• ${_tgTextoSeguro(m.itemNome)}: ${m.tipo} de ${m.quantidade}`).join('\n'):'• Nenhum ajuste registrado.';
  const emprestimos=comodatoPeriodo.filter(m=>m.acao==='saida');
  const devolucoes=comodatoPeriodo.filter(m=>m.acao==='entrada');
  const linhasEmprestimos=emprestimos.length?emprestimos.map(m=>`• ${_tgTextoSeguro(m.clienteNome)}: ${m.quantidade} ${_tgTextoSeguro(m.tipo||'')}`).join('\n'):'• Nenhum empréstimo no período.';
  const linhasDevolucoes=devolucoes.length?devolucoes.map(m=>`• ${_tgTextoSeguro(m.clienteNome)}: ${m.quantidade} ${_tgTextoSeguro(m.tipo||'')}`).join('\n'):'• Nenhuma devolução no período.';
  const transferencias=hojeItems.filter(l=>l.origem==='transferencia');
  const linhasTransferencias=transferencias.length?transferencias.map(l=>`• ${_tgTextoSeguro(l.descricao||'Transferência')}: ${_tgMoney(l.valor)} | ${_tgTextoSeguro(getGaveta(l))}`).join('\n'):'• Nenhuma sangria ou transferência no período.';
  const contasPendentes=contas.filter(c=>c.status==='Em Aberto');
  const totalPendente=contasPendentes.reduce((s,c)=>s+Number(c.saldoRestante??c.valor??0),0);
  const linhasContas=contasPendentes.length?contasPendentes.map(c=>`• ${_tgTextoSeguro(c.fornecedorNome||c.descricao||'Conta')}: ${_tgMoney(c.saldoRestante??c.valor)} | Venc.: ${c.dataVencimento?formatDateBR(c.dataVencimento):'sem data'}`).join('\n'):'• Nenhuma conta pendente.';
  const blocos=[
    _tgBloco('💵 FINANCEIRO OFICIAL',[`Data do fechamento: ${formatDateBR(dataRef)}${horaFechamento?' | '+horaFechamento:''}`,`Entradas do período: ${_tgMoney(totalEntradas)}`,`Saídas do período: ${_tgMoney(totalSaidas)}`,`Saldo esperado do período: ${_tgMoney(saldoEsperado)}`,`Entradas Dinheiro: ${_tgMoney(entDin)}`,`Entradas Pix: ${_tgMoney(entPix)}`,`Entradas Tesoureiro: ${_tgMoney(entTes)}`,`Saídas Dinheiro: ${_tgMoney(saiDin)}`,`Saídas Pix: ${_tgMoney(saiPix)}`,`Saídas Tesoureiro: ${_tgMoney(saiTes)}`,`Dinheiro contado: ${_tgMoney(dinheiroContadoOficial)}`,`Pix contado: ${_tgMoney(pixContadoOficial)}`,`Tesoureiro: ${_tgMoney(saldoTesoureiroOficial)}`,`Total contado: ${_tgMoney(totalContado)}`,`Diferença oficial: ${_tgMoney(diferenca)}`,`Status: ${_tgTextoSeguro(status)}`]),
    _tgBloco('📦 MOVIMENTAÇÃO DE ESTOQUE',[`Produção do período:\n${linhasProducao}`,`Vendas do período:\n${linhasVendas}`,`Entradas de estoque:\n${linhasEntradas}`,`Consumo de insumos na produção:\n${linhasConsumo}`,`Outras saídas de estoque:\n${linhasSaidas}`,`Estornos:\n${linhasEstornos}`,`Ajustes:\n${linhasAjustes}`]),
    _tgBloco('🏺 COMODATOS DO PERÍODO',[`Empréstimos:\n${linhasEmprestimos}`,`Devoluções:\n${linhasDevolucoes}`]),
    _tgBloco('🔄 MOVIMENTAÇÕES INTERNAS', [linhasTransferencias]),
    _tgBloco('📉 PENDÊNCIAS ATUAIS',[`Contas a pagar: ${contasPendentes.length}`,`Valor total pendente: ${_tgMoney(totalPendente)}`,linhasContas])
  ];
  return _tgPaginar('💰 FECHAMENTO DIÁRIO',`Referência: ${formatDateBR(dataRef)}${horaFechamento?' | '+horaFechamento:''}`,blocos);
}

async function gerarRelatorioRaioXFabrica(dataRef, gavetas){
  const [produtos, insumos, clientes, limites, comodatos, documentos, contas, vales] = await Promise.all([
    reqToPromise(getStore('produtos').getAll()),
    reqToPromise(getStore('insumos').getAll()),
    reqToPromise(getStore('clientes').getAll()),
    reqToPromise(getStore('limites_credito').getAll()),
    reqToPromise(getStore('comodato_movimentacoes').getAll()),
    reqToPromise(getStore('documentos_escada').getAll()),
    reqToPromise(getStore('contas_pagar').getAll()),
    reqToPromise(getStore('vale').getAll())
  ]);
  const hojeBR=formatDateBR(new Date().toISOString().slice(0,10));
  const unidade=x=>x.unidade||x.unidadeMedida||x.unidadeEstoque||'';
  const linhasProdutos=produtos.sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''))).map(p=>`• ${_tgTextoSeguro(p.nome)}: ${currentStock(p)}${unidade(p)?' '+_tgTextoSeguro(unidade(p)):''}`).join('\n')||'• Nenhum produto cadastrado.';
  const linhasInsumos=insumos.sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''))).map(i=>`• ${_tgTextoSeguro(i.nome)}: ${currentStock(i)}${unidade(i)?' '+_tgTextoSeguro(unidade(i)):''}`).join('\n')||'• Nenhum insumo cadastrado.';
  const mapaClientes=new Map(clientes.map(c=>[Number(c.id),c.nome]));
  const saldos=limites.map(l=>{const divida=Number(l.saldoDevedor||0);const credito=Number(l.saldoCredito||0);return {...l,nome: l.clienteNome||mapaClientes.get(Number(l.clienteId||l.id))||`Cliente ${l.clienteId||l.id}`,saldoLiquido:credito-divida};});
  const devedores=saldos.filter(l=>l.saldoLiquido < -0.009).sort((a,b)=>a.nome.localeCompare(b.nome));
  const creditos=saldos.filter(l=>l.saldoLiquido > 0.009).sort((a,b)=>a.nome.localeCompare(b.nome));
  const totalDevedores=devedores.reduce((s,d)=>s+Math.abs(d.saldoLiquido),0);
  const totalCreditos=creditos.reduce((s,d)=>s+d.saldoLiquido,0);
  const linhasDevedores=devedores.map(d=>`• ${_tgTextoSeguro(d.nome)}: ${_tgMoney(Math.abs(d.saldoLiquido))}`).join('\n')||'• Nenhum cliente devedor.';
  const linhasCreditos=creditos.map(d=>`• ${_tgTextoSeguro(d.nome)}: ${_tgMoney(d.saldoLiquido)}`).join('\n')||'• Nenhum crédito de cliente.';
  const mapaComodato={};
  comodatos.forEach(m=>{const k=String(m.clienteId||m.clienteNome||m.id);if(!mapaComodato[k]) mapaComodato[k]={nome:m.clienteNome||'Cliente não informado',novo:0,velho:0};const delta=m.acao==='saida'?Number(m.quantidade||0):-Number(m.quantidade||0);if(m.tipo==='Novo') mapaComodato[k].novo+=delta;else mapaComodato[k].velho+=delta;});
  const comodatoClientes=Object.values(mapaComodato).filter(c=>c.novo!==0||c.velho!==0).sort((a,b)=>a.nome.localeCompare(b.nome));
  const totalNovoLiquido=comodatoClientes.reduce((s,c)=>s+c.novo,0);
  const totalVelhoLiquido=comodatoClientes.reduce((s,c)=>s+c.velho,0);
  const totalNovoFisico=comodatoClientes.reduce((s,c)=>s+Math.max(0,c.novo),0);
  const totalVelhoFisico=comodatoClientes.reduce((s,c)=>s+Math.max(0,c.velho),0);
  const linhasComodato=comodatoClientes.map(c=>`• ${_tgTextoSeguro(c.nome)}: ${c.novo} novos / ${c.velho} velhos${c.novo<0||c.velho<0?' | ⚠️ saldo negativo/crédito':''}`).join('\n')||'• Nenhum cliente com saldo de comodato.';
  const temVencidoNaBase=documentos.some(d=>Number(d.nivel||0)>1&&getDocStatusEscada(d.dataVencimento).tipo==='vencido');
  const docsOrdenados=documentos.map(d=>{const base=getDocStatusEscada(d.dataVencimento);const risco=Number(d.nivel||0)===1&&base.tipo==='ok'&&temVencidoNaBase;return {...d,statusBase:base,statusFinal:risco?{...base,tipo:'risco_cascata',label:'⚠️ BASE COMPROMETIDA'}:base};}).sort((a,b)=>{const ordem=x=>x.statusBase.tipo==='vencido'?0:x.statusBase.tipo==='alerta'?1:x.statusBase.tipo==='ok'?2:3;const oa=ordem(a),ob=ordem(b);if(oa!==ob)return oa-ob;if(!a.dataVencimento)return 1;if(!b.dataVencimento)return -1;return a.dataVencimento.localeCompare(b.dataVencimento);});
  const docsVencidos=documentos.filter(d=>getDocStatusEscada(d.dataVencimento).tipo==='vencido').length;
  const docsAlerta=documentos.filter(d=>getDocStatusEscada(d.dataVencimento).tipo==='alerta').length;
  const docsValidos=documentos.filter(d=>getDocStatusEscada(d.dataVencimento).tipo==='ok').length;
  const docsSemData=documentos.filter(d=>getDocStatusEscada(d.dataVencimento).tipo==='sem_data').length;
  const linhasDocs=docsOrdenados.map(d=>{const s=d.statusFinal;const venc=d.dataVencimento?`Vencimento: ${formatDateBR(d.dataVencimento)}`:'Sem vencimento informado';return `• ${_tgTextoSeguro(d.nome)} | ${venc} | ${_tgTextoSeguro(s.label)}`;}).join('\n')||'• Nenhum documento cadastrado.';
  const contasPendentes=contas.filter(c=>c.status==='Em Aberto').sort((a,b)=>String(a.dataVencimento||'9999-99-99').localeCompare(String(b.dataVencimento||'9999-99-99')));
  const totalContas=contasPendentes.reduce((s,c)=>s+Number(c.saldoRestante??c.valor??0),0);
  const linhasContas=contasPendentes.map(c=>`• ${_tgTextoSeguro(c.fornecedorNome||c.descricao||'Conta')}: ${_tgMoney(c.saldoRestante??c.valor)} | Venc.: ${c.dataVencimento?formatDateBR(c.dataVencimento):'sem data'}`).join('\n')||'• Nenhuma conta a pagar pendente.';
  const valesAbertos=vales.filter(v=>!v.liquidado&&!v.estornado).sort((a,b)=>String(a.data||'').localeCompare(String(b.data||'')));
  const totalVales=valesAbertos.reduce((s,v)=>s+Number(v.valor||0),0);
  const linhasVales=valesAbertos.map(v=>`• ${_tgTextoSeguro(v.funcionarioNome||'Funcionário')}: ${_tgMoney(v.valor)} | Data: ${v.data?formatDateBR(v.data):'sem data'}`).join('\n')||'• Nenhum vale em aberto.';
  const saldoDinheiro=Number(gavetas.saldoDinheiro||0),saldoPix=Number(gavetas.saldoPix||0),saldoTesoureiro=Number(gavetas.saldoTesoureiro||0);
  const blocos=[
    _tgBloco('🏭 SITUAÇÃO ATUAL',[`Raio-X gerado em: ${hojeBR}`,`Clientes cadastrados: ${clientes.length}`,`Produtos cadastrados: ${produtos.length}`,`Insumos cadastrados: ${insumos.length}`,`Documentos cadastrados: ${documentos.length}`]),
    _tgBloco('🏦 SALDOS ATUAIS DAS GAVETAS',[`Dinheiro: ${_tgMoney(saldoDinheiro)}`,`Pix: ${_tgMoney(saldoPix)}`,`Tesoureiro: ${_tgMoney(saldoTesoureiro)}`,`Total: ${_tgMoney(saldoDinheiro+saldoPix+saldoTesoureiro)}`]),
    _tgBloco('📦 ESTOQUE ATUAL',[`Produtos:\n${linhasProdutos}`,`Insumos:\n${linhasInsumos}`]),
    _tgBloco('💳 CLIENTES DEVEDORES',[`Clientes devedores: ${devedores.length}`,`Total a receber: ${_tgMoney(totalDevedores)}`,linhasDevedores]),
    _tgBloco('💰 ADIANTAMENTOS / CRÉDITOS DE CLIENTES',[`Clientes com crédito: ${creditos.length}`,`Total de créditos: ${_tgMoney(totalCreditos)}`,linhasCreditos]),
    _tgBloco('🏺 GARRAFÕES EM COMODATO',[`Clientes com saldo: ${comodatoClientes.length}`,`Total líquido novos: ${totalNovoLiquido}`,`Total líquido velhos: ${totalVelhoLiquido}`,`Total líquido geral: ${totalNovoLiquido+totalVelhoLiquido}`,`Total físico positivo novos: ${totalNovoFisico}`,`Total físico positivo velhos: ${totalVelhoFisico}`,linhasComodato]),
    _tgBloco('📑 DOCUMENTAÇÃO DA FÁBRICA',[`Vencidos: ${docsVencidos}`,`Próximos de vencer: ${docsAlerta}`,`Válidos: ${docsValidos}`,`Sem vencimento informado: ${docsSemData}`,linhasDocs]),
    _tgBloco('📋 CONTAS A PAGAR PENDENTES',[`Contas pendentes: ${contasPendentes.length}`,`Valor total pendente: ${_tgMoney(totalContas)}`,linhasContas]),
    _tgBloco('💸 VALES DE FUNCIONÁRIOS EM ABERTO',[`Quantidade: ${valesAbertos.length}`,`Valor total: ${_tgMoney(totalVales)}`,linhasVales])
  ];
  return _tgPaginar('🏭 RAIO-X DA FÁBRICA',`Posição atual — ${hojeBR}`,blocos);
}

async function enviarSuperResumoTelegram(hojeItems, gavetas){
  try{
    const dataRef=await _tgDataFechamentoAtual();
    const relatorios=[
      ['Prestação de Contas',()=>gerarRelatorioPrestacaoContas(dataRef,hojeItems,gavetas)],
      ['Vendas do Dia',()=>gerarRelatorioVendasTelegram(dataRef)],
      ['Produção do Dia',()=>gerarRelatorioProducaoTelegram(dataRef)],
      ['Estoque',()=>gerarRelatorioEstoqueTelegram()],
      ['Patrimônio',()=>gerarRelatorioPatrimonioTelegram()],
      ['Comodatos',()=>gerarRelatorioComodatosTelegram(dataRef)],
      ['Custos e Despesas',()=>gerarRelatorioCustosTelegram(dataRef)],
      ['Devedores e Créditos',()=>gerarRelatorioDevedoresCreditosTelegram()],
      ['Contas a Pagar',()=>gerarRelatorioContasPagarTelegram()],
      ['Documentação',()=>gerarRelatorioDocumentacaoTelegram()],
      ['Movimentações e Ocorrências',()=>gerarRelatorioOcorrenciasTelegram(dataRef)]
    ];
    for(const [nome,gerar] of relatorios){
      const paginas=await gerar();
      await _tgEnfileirarPaginas(paginas);
      console.log(`[Telegram] Relatório ${nome} enfileirado/enviado em sequência.`);
    }
  }catch(e){ console.error('Erro ao gerar/enfileirar relatórios do fechamento Telegram:',e); }
}

async function enviarFechamentoWhatsApp(){
  const btn=document.getElementById('btn-compartilhar-fechamento');
  if(!_relatorioFechamentoTexto){ alert('Feche o caixa primeiro para gerar o relatório.'); return; }
  const encoded=encodeURIComponent(_relatorioFechamentoTexto);
  const url=`https://wa.me/?text=${encoded}`;
  window.open(url,'_blank');
  if(btn){
    const orig=btn.textContent;
    btn.textContent='✅ WhatsApp aberto!';
    setTimeout(()=>{ btn.textContent=orig; },3000);
  }
}
/* ========== CENTRAL DE RELATÓRIOS / AVISOS ========== */
function _relatoriosCentralResetar(){
  const inicio=document.getElementById('relatorios-central-inicio');
  const detalhe=document.getElementById('relatorios-central-detalhe');
  const painelRel=document.getElementById('painel-relatorios');
  const painelAv=document.getElementById('painel-avisos');
  if(inicio) inicio.classList.remove('hidden');
  if(detalhe){ detalhe.classList.add('hidden'); detalhe.innerHTML=''; }
  if(painelRel) painelRel.classList.add('hidden');
  if(painelAv) painelAv.classList.add('hidden');
}
function abrirCentralRelatorios(){ showScreen('relatorio-vendas-screen'); _relatoriosCentralResetar(); }
function _relatoriosCentralMostrarPainel(panelId){
  showScreen('relatorio-vendas-screen');
  document.getElementById('relatorios-central-inicio')?.classList.add('hidden');
  document.getElementById('relatorios-central-detalhe')?.classList.add('hidden');
  document.getElementById('painel-relatorios')?.classList.add('hidden');
  document.getElementById('painel-avisos')?.classList.add('hidden');
  document.getElementById(panelId)?.classList.remove('hidden');
}
function _relatoriosCentralConfigurarRetorno(screenId){
  const btn=document.querySelector(`#${screenId} .topbar .btn-back`);
  if(!btn) return;
  btn.dataset.back='relatorio-vendas-screen';
  if(btn.dataset.centralReturnBound==='1') return;
  btn.dataset.centralReturnBound='1';
  btn.addEventListener('click',()=>{ if(btn.dataset.back==='relatorio-vendas-screen') abrirCentralRelatorios(); });
}
async function _relatoriosCentralAbrirRelatoriosVendas(renderFn){
  _relatoriosCentralMostrarPainel('painel-relatorios');
  await renderHistoricoVendas();
  if(renderFn) await renderFn();
}
async function _relatoriosCentralAbrirFinanceiro(panelId, preparador){
  _relatoriosCentralConfigurarRetorno('financeiro-screen');
  if(preparador) await preparador();
  showScreen('financeiro-screen');
  showFinancePanel('financeiro-relatorios-panel');
  showRelatorioPanel(panelId);
}
async function _relatoriosCentralAbrirDRE(){
  _relatoriosCentralConfigurarRetorno('dre-screen');
  await renderDREMensal();
  showScreen('dre-screen');
}
async function _relatoriosCentralAbrirCustos(){
  _relatoriosCentralConfigurarRetorno('engenharia-custos-screen');
  await renderEngenhariaCustos();
  showScreen('engenharia-custos-screen');
}
async function _relatoriosCentralAbrirCidade(){
  _relatoriosCentralConfigurarRetorno('relatorio-cidades-screen');
  showScreen('relatorio-cidades-screen');
}
async function _relatoriosCentralAbrirResumoFolha(){
  _relatoriosCentralConfigurarRetorno('folha-screen');
  await carregarFolhaFuncionarios();
  await renderFolhaPagamentos();
  await renderLicencasRecentes();
  showScreen('folha-screen');
  await abrirResumoMes();
}
async function _relatoriosCentralAbrirEstoque(){
  _relatoriosCentralConfigurarRetorno('estoque-screen');
  await renderEstoqueGeral();
  await renderMovimentosEstoque();
  await verificarEstoqueMinimo();
  showScreen('estoque-screen');
}
async function _relatoriosCentralAbrirProducao(){
  _relatoriosCentralConfigurarRetorno('producao-screen');
  await carregarProdutoSelect();
  await renderProducoes();
  await refreshProducaoMetricas();
  showScreen('producao-screen');
}
async function _relatoriosCentralAbrirComodato(){
  _relatoriosCentralConfigurarRetorno('comodato-screen');
  await abrirComodato();
  showScreen('comodato-screen');
}
async function _relatoriosCentralAbrirPatrimonio(){
  _relatoriosCentralConfigurarRetorno('patrimonio-screen');
  await renderPatrimonio();
  showScreen('patrimonio-screen');
}
async function _relatoriosCentralAbrirDocumentos(){
  _relatoriosCentralConfigurarRetorno('documentos-screen');
  await abrirDocumentosEscada();
  showScreen('documentos-screen');
}
async function _relatoriosCentralAbrirContasPagar(){
  _relatoriosCentralConfigurarRetorno('contas-pagar-screen');
  await renderContasAPagar();
  showScreen('contas-pagar-screen');
}
function _relatoriosCentralCategoriaConfig(categoria){
  const configs={
    financeiro:{titulo:'Relatórios Financeiros',descricao:'Consultas financeiras já existentes, com seus filtros e visualizações originais.',itens:[
      ['caixa-dia','💵','Caixa do Dia','Entradas, saídas, saldo e movimentações de hoje'],
      ['dre','📊','DRE','Demonstrativo mensal/anual nos regimes originais'],
      ['engenharia-custos','📈','Engenharia de Custos','Semáforo de rentabilidade e margem']
    ]},
    vendas:{titulo:'Relatórios de Vendas',descricao:'Análises comerciais já existentes no sistema.',itens:[
      ['vendas-hoje','🛒','Vendas de Hoje','Resumo original das vendas do dia'],
      ['vendas-mes','📅','Vendas do Mês','Resumo original das vendas do mês'],
      ['matriz-vendas','📦','Análise Matricial','Produto por período, por quantidade ou faturamento'],
      ['historico-vendas','🧾','Histórico Detalhado','Vendas por data, cliente, produto e estorno'],
      ['venda-mes','📈','Venda do Mês','Comparativo entre mês atual e mês anterior'],
      ['vendas-cidade','📍','Vendas por Cidade','Relatório mensal, anual e drill-down']
    ]},
    funcionarios:{titulo:'Relatórios de Funcionários',descricao:'Consulta autônoma já existente na Folha de Pagamento.',itens:[
      ['resumo-folha','📋','Resumo da Folha','Filtros de mês/ano e detalhamento por funcionário']
    ]},
    clientes:{titulo:'Relatórios de Clientes',descricao:'Históricos e recebimentos usando as consultas originais do Financeiro.',itens:[
      ['cliente-historico','👤','Histórico por Cliente','Pedidos, itens e valores históricos'],
      ['cliente-recebimentos','💵','Recebimentos por Cliente','Cliente, período e recebimentos registrados']
    ]},
    demais:{titulo:'Demais Relatórios',descricao:'Consultas existentes de operação e controle, abertas em seus módulos originais. Nenhuma nova regra ou cálculo é criado aqui.',itens:[
      ['estoque','📦','Estoque e Movimentações','Posição atual e movimentações de produtos e insumos'],
      ['producao','🏭','Produção','Últimas produções e métricas do módulo original'],
      ['comodato','🏺','Comodato','Saldos e histórico de movimentações dos clientes'],
      ['patrimonio','🏗️','Patrimônio','Inventário de ativos da fábrica'],
      ['documentos','📋','Documentos / Alvarás','Escada de prioridades e vencimentos'],
      ['contas-pagar','🧾','Contas a Pagar','Consulta das obrigações registradas']
    ]}
  };
  return configs[categoria]||null;
}
function _relatoriosCentralRenderCategoria(categoria){
  if(categoria==='avisos'){ _relatoriosCentralMostrarPainel('painel-avisos'); return; }
  const config=_relatoriosCentralCategoriaConfig(categoria);
  const detalhe=document.getElementById('relatorios-central-detalhe');
  if(!config||!detalhe) return;
  document.getElementById('relatorios-central-inicio')?.classList.add('hidden');
  detalhe.classList.remove('hidden');
  detalhe.innerHTML=`<section class="card section-card"><div class="relatorios-central-pane-head"><div><h3 class="section-title">${config.titulo}</h3><p class="relatorios-central-help">${config.descricao}</p></div><button class="btn-secondary js-voltar-relatorios-categorias" type="button">← Voltar às categorias</button></div><div class="dashboard-grid relatorios-central-opcoes">${config.itens.map(([id,icone,titulo,texto])=>`<button class="card dashboard-card relatorios-central-opcao" type="button" data-relatorio-acesso="${id}"><span class="card-icon icon-navy">${icone}</span><span class="card-title">${titulo}</span><span class="card-text">${texto}</span></button>`).join('')}</div></section>`;
}
async function _relatoriosCentralExecutar(id){
  switch(id){
    case 'caixa-dia': return _relatoriosCentralAbrirFinanceiro('relatorio-caixa-dia-panel',renderRelatorioCaixaDia);
    case 'dre': return _relatoriosCentralAbrirDRE();
    case 'engenharia-custos': return _relatoriosCentralAbrirCustos();
    case 'vendas-hoje': return _relatoriosCentralAbrirRelatoriosVendas(()=>renderRelatorioVendas('hoje'));
    case 'vendas-mes': return _relatoriosCentralAbrirRelatoriosVendas(()=>renderRelatorioVendas('mes'));
    case 'matriz-vendas': return _relatoriosCentralAbrirRelatoriosVendas(()=>renderMatrizVendas('qtd'));
    case 'historico-vendas': return _relatoriosCentralAbrirRelatoriosVendas();
    case 'venda-mes': return _relatoriosCentralAbrirFinanceiro('relatorio-venda-mes-panel',renderRelatorioVendaMes);
    case 'vendas-cidade': return _relatoriosCentralAbrirCidade();
    case 'resumo-folha': return _relatoriosCentralAbrirResumoFolha();
    case 'cliente-historico': return _relatoriosCentralAbrirFinanceiro('relatorio-cliente-panel',carregarRelatorioClienteSelect);
    case 'cliente-recebimentos': return _relatoriosCentralAbrirFinanceiro('relatorio-recebimentos-cliente-panel',carregarRelRecebClienteSelect);
    case 'estoque': return _relatoriosCentralAbrirEstoque();
    case 'producao': return _relatoriosCentralAbrirProducao();
    case 'comodato': return _relatoriosCentralAbrirComodato();
    case 'patrimonio': return _relatoriosCentralAbrirPatrimonio();
    case 'documentos': return _relatoriosCentralAbrirDocumentos();
    case 'contas-pagar': return _relatoriosCentralAbrirContasPagar();
    case 'avisos': return _relatoriosCentralMostrarPainel('painel-avisos');
  }
}
function setupRelatoriosCentralListeners(){
  const root=document.getElementById('relatorio-vendas-screen');
  if(!root || root.dataset.centralBound==='1') return;
  root.dataset.centralBound='1';
  root.addEventListener('click',async(event)=>{
    const categoria=event.target.closest('[data-relatorios-categoria]')?.dataset.relatoriosCategoria;
    if(categoria){ _relatoriosCentralRenderCategoria(categoria); return; }
    if(event.target.closest('.js-voltar-relatorios-categorias') || event.target.closest('#btn-voltar-central-relatorios') || event.target.closest('#btn-voltar-central-avisos')){ abrirCentralRelatorios(); return; }
    const acesso=event.target.closest('[data-relatorio-acesso]')?.dataset.relatorioAcesso;
    if(acesso){ try{ await _relatoriosCentralExecutar(acesso); }catch(e){ console.error('Erro ao abrir relatório pela central:',e); } }
  });
}

/* ========== NAVIGATION ========== */
function setupNavigation(){
  document.getElementById('btn-vendas').addEventListener('click', async()=>{ await carregarClientesVenda(); await carregarProdutosVenda(); await renderVendas(); resetVendaForm(); await renderPedidosRecentes(); showScreen('vendas-screen'); }); /* v3.1: renderPedidosRecentes */
  /* Hub Compras v2.3 */
  document.getElementById('btn-compras').addEventListener('click', ()=>{ showScreen('hub-compras-screen'); });
  if(document.getElementById('btn-hc-insumos')) document.getElementById('btn-hc-insumos').addEventListener('click', async()=>{ await carregarFornecedoresCompra(); await carregarItensCompra(); await renderCompras(); resetCompraForm(); showScreen('compras-screen'); });
  if(document.getElementById('btn-hc-patrimonio')) document.getElementById('btn-hc-patrimonio').addEventListener('click', async()=>{ await renderPatrimonio(); resetPatrimonioForm(); showScreen('patrimonio-screen'); });
  document.getElementById('btn-producao').addEventListener('click', async()=>{ await carregarProdutoSelect(); await renderProducoes(); await refreshProducaoMetricas(); resetProducaoForm(); showScreen('producao-screen'); });
  document.getElementById('btn-estoque').addEventListener('click', async()=>{ await renderEstoqueGeral(); await renderMovimentosEstoque(); await verificarEstoqueMinimo(); showScreen('estoque-screen'); });
  document.getElementById('btn-financeiro').addEventListener('click', async()=>{ const back=document.querySelector('#financeiro-screen .topbar .btn-back'); if(back) back.dataset.back='dashboard-screen'; await carregarTiposCustosFinanceiro(); await atualizarResumoFinanceiro(); await renderFinanceiro(); await renderClientesDevedores(); resetFinanceiroForm(); showScreen('financeiro-screen'); showFinancePanel('financeiro-extrato-panel'); });
  /* Hub Gestão de Pessoas v2.2 */
  if(document.getElementById('btn-gestao-pessoas')) document.getElementById('btn-gestao-pessoas').addEventListener('click', ()=>{ showScreen('gestao-pessoas-screen'); });
  if(document.getElementById('btn-gp-folha')) document.getElementById('btn-gp-folha').addEventListener('click', async()=>{ const back=document.querySelector('#folha-screen .topbar .btn-back'); if(back) back.dataset.back='gestao-pessoas-screen'; await carregarFolhaFuncionarios(); await renderFolhaPagamentos(); resetFolhaForm(); await renderLicencasRecentes(); showScreen('folha-screen'); });
  if(document.getElementById('btn-gp-vales')) document.getElementById('btn-gp-vales').addEventListener('click', async()=>{ await carregarFuncionariosVales(); await renderVales(); resetValeForm(); await renderUltimosVales(); showScreen('vales-screen'); }); /* v3.3 */
  if(document.getElementById('btn-gp-ferias')) document.getElementById('btn-gp-ferias').addEventListener('click', async()=>{ await carregarFuncionariosFeriasSelect(); await renderFeriasHistorico(); resetFeriasForm(); showScreen('ferias-screen'); });
  if(document.getElementById('btn-gp-faltas')) document.getElementById('btn-gp-faltas').addEventListener('click', async()=>{ await abrirModalFaltas(); });
  if(document.getElementById('btn-gp-avulso')) document.getElementById('btn-gp-avulso').addEventListener('click', async()=>{ await renderAvulsoHistorico(); resetAvulsoForm(); showScreen('avulso-screen'); });

  if(document.getElementById('btn-fechamento-caixa')) document.getElementById('btn-fechamento-caixa').addEventListener('click', async()=>{ await renderTelaFechamentoCaixa(); showScreen('fechamento-caixa-screen'); });
  if(document.getElementById('btn-relatorio-vendas')) document.getElementById('btn-relatorio-vendas').addEventListener('click',abrirCentralRelatorios);
  if(document.getElementById('btn-contas-pagar')) document.getElementById('btn-contas-pagar').addEventListener('click', async()=>{ await renderContasAPagar(); showScreen('contas-pagar-screen'); });
  if(document.getElementById('btn-dre')) document.getElementById('btn-dre').addEventListener('click', async()=>{ await renderDREMensal(); showScreen('dre-screen'); });

  /* Cidades */
  if(document.getElementById('btn-cidades')) document.getElementById('btn-cidades').addEventListener('click', async()=>{ await renderCidades(); showScreen('cidades-screen'); });
  /* Relatório Vendas por Cidade (apenas dentro de Relatórios) */
  if(document.getElementById('btn-relatorio-cidades-samuel')) document.getElementById('btn-relatorio-cidades-samuel').addEventListener('click', ()=>showScreen('relatorio-cidades-screen'));
  if(document.getElementById('btn-rel-cidade-mensal')) document.getElementById('btn-rel-cidade-mensal').addEventListener('click', renderRelatorioCidadesMensal);
  if(document.getElementById('btn-rel-cidade-anual')) document.getElementById('btn-rel-cidade-anual').addEventListener('click', renderRelatorioCidadesAnual);
  if(document.getElementById('btn-rel-cidade-imprimir')) document.getElementById('btn-rel-cidade-imprimir').addEventListener('click', imprimirRelatorioCidades);

  document.getElementById('btn-cadastros').addEventListener('click',()=>showScreen('cadastros-screen'));
  document.getElementById('btn-configuracoes').addEventListener('click',async()=>{ carregarMetaVendas(); carregarTemplatesComunicacao(); await carregarConfiguracoesTelegram(); showScreen('configuracoes-screen'); });
  if(document.getElementById('btn-comodato')) document.getElementById('btn-comodato').addEventListener('click', async()=>{ await abrirComodato(); showScreen('comodato-screen'); });
  if(document.getElementById('btn-documentos')) document.getElementById('btn-documentos').addEventListener('click', async()=>{ await abrirDocumentosEscada(); showScreen('documentos-screen'); });
  if(document.getElementById('btn-engenharia-custos')) document.getElementById('btn-engenharia-custos').addEventListener('click', async()=>{ await renderEngenhariaCustos(); showScreen('engenharia-custos-screen'); });
  document.getElementById('btn-clientes').addEventListener('click', async()=>{ await renderClientes(); showScreen('clientes-screen'); });
  document.getElementById('btn-funcionarios').addEventListener('click', async()=>{ await renderFuncionarios(); showScreen('funcionarios-screen'); });
  document.getElementById('btn-fornecedores').addEventListener('click', async()=>{ await renderFornecedores(); showScreen('fornecedores-screen'); });
  document.getElementById('btn-produtos').addEventListener('click', async()=>{ await renderProdutos(); showScreen('produtos-screen'); });
  document.getElementById('btn-insumos').addEventListener('click', async()=>{ await renderInsumos(); showScreen('insumos-screen'); });
  document.getElementById('btn-tipos-custos').addEventListener('click', async()=>{ await renderTiposCustos(); showScreen('tipos-custos-screen'); });
  document.querySelectorAll('[data-back]').forEach((btn)=>btn.addEventListener('click',()=>showScreen(btn.dataset.back)));
  setupRelatoriosCentralListeners();
  document.getElementById('btn-add-insumo-receita').addEventListener('click',()=>adicionarLinhaFichaTecnica());
  const btnAddItem=document.getElementById('btn-add-item-venda'); if(btnAddItem) btnAddItem.addEventListener('click',async(e)=>{ e.preventDefault(); e.stopPropagation(); try{ await adicionarItemAoPedido(); }catch(err){ console.error('Erro ao adicionar item:',err); alert('Erro ao adicionar item ao pedido'); } });
  document.getElementById('venda-produto-id').addEventListener('change',atualizarPrecoVenda);
  document.getElementById('venda-cliente-id').addEventListener('change',atualizarLimiteDisponivel);
  document.getElementById('venda-forma-pagamento').addEventListener('change',validarLimiteVenda);
  document.getElementById('venda-autorizacao-especial').addEventListener('change',validarLimiteVenda);
  /* Valor pago: mostrar troco/crédito em tempo real */
  const elValorPago = document.getElementById('venda-valor-pago');
  if(elValorPago) elValorPago.addEventListener('input', ()=>{
    const total = Number(document.getElementById('venda-total').value||0);
    const pago = Number(elValorPago.value||0);
    const trocoBox = document.getElementById('venda-troco-box');
    const trocoVal = document.getElementById('venda-troco-valor');
    if(trocoBox && trocoVal){
      if(pago > 0 && pago !== total){
        const diff = pago - total;
        trocoVal.textContent = diff > 0 ? `Crédito gerado: ${moneyBR(diff)}` : `Falta: ${moneyBR(Math.abs(diff))}`;
        trocoBox.style.background = diff > 0 ? '#d1fae5' : '#fee2e2';
        trocoBox.style.borderColor = diff > 0 ? '#10b981' : '#ef4444';
        trocoBox.style.display = 'block';
        trocoBox.classList.remove('hidden');
      } else {
        trocoBox.classList.add('hidden');
      }
    }
  });
  /* Botão Usar Crédito: preenche valor-pago com total - credito */
  const btnUsarCredito = document.getElementById('btn-usar-credito');
  if(btnUsarCredito) btnUsarCredito.addEventListener('click', async ()=>{
    const clienteId = Number(document.getElementById('venda-cliente-id').value);
    if(!clienteId) return;
    const reg = await reqToPromise(getStore('limites_credito').get(clienteId));
    const credito = Number(reg?.saldoCredito||0);
    const total = Number(document.getElementById('venda-total').value||0);
    const valorPagoEl = document.getElementById('venda-valor-pago');
    if(valorPagoEl){
      const valorComCredito = Math.max(0, total - credito);
      valorPagoEl.value = valorComCredito.toFixed(2);
      valorPagoEl.dispatchEvent(new Event('input'));
    }
  });
  document.getElementById('venda-quantidade').addEventListener('input',atualizarSubtotalItemVenda);
  document.getElementById('venda-preco-unitario').addEventListener('input',atualizarSubtotalItemVenda);
  document.getElementById('producao-produto-id').addEventListener('change',atualizarPreviewProducao);
  document.getElementById('producao-quantidade').addEventListener('input',atualizarPreviewProducao);
  document.getElementById('compra-item-tipo').addEventListener('change',carregarItensCompra);
  document.getElementById('compra-quantidade').addEventListener('input',atualizarTotalCompra);
  document.getElementById('compra-preco-unitario').addEventListener('input',atualizarTotalCompra);
  document.getElementById('filtro-movimento-tipo').addEventListener('change',renderMovimentosEstoque);

  /* Forma de pagamento compra: mostrar/ocultar data vencimento */
  const compraForma=document.getElementById('compra-forma-pagamento');
  if(compraForma){
    compraForma.addEventListener('change',()=>{
      const vctoField=document.getElementById('compra-data-vencimento')?.closest('.field');
      if(vctoField) vctoField.style.display=compraForma.value==='Prazo'?'block':'none';
    });
  }

  /* Folha: calcular total ao mudar adicionais/descontos */
  const folhaAd=document.getElementById('folha-adicionais');
  const folhaDesc=document.getElementById('folha-descontos');
  if(folhaAd) folhaAd.addEventListener('input',calcularFolhaTotal);
  if(folhaDesc) folhaDesc.addEventListener('input',calcularFolhaTotal);
  /* v2.8: Recalcular faltas ao mudar mês/ano de referência */
  const folhaMesRef=document.getElementById('folha-mes-referencia');
  const folhaAnoRef=document.getElementById('folha-ano-referencia');
  async function recalcularFaltasFolha(){ const funcId=Number(document.getElementById('folha-funcionario-id').value); if(!funcId) return; const salBase=Number(document.getElementById('folha-salario-base').value||0); const mesRef=document.getElementById('folha-mes-referencia').value; const anoRef=document.getElementById('folha-ano-referencia').value; if(!mesRef||!anoRef) return; const qtdFaltas=await contarFaltasMes(funcId,mesRef,anoRef); const descontoFaltas=calcularDescontoFaltas(salBase,qtdFaltas); const elFQ=document.getElementById('folha-faltas-qtd'); const elFD=document.getElementById('folha-faltas-desconto'); if(elFQ) elFQ.value=qtdFaltas; if(elFD) elFD.value=descontoFaltas.toFixed(2); /* v3.4: recalcular licenca junto */ const diasLic=await contarDiasLicencaMes(funcId,mesRef,anoRef); const descLic=calcularDescontoLicenca(salBase,diasLic); const elLD=document.getElementById('folha-licenca-dias'); const elLDesc=document.getElementById('folha-licenca-desconto'); if(elLD) elLD.value=diasLic; if(elLDesc) elLDesc.value=descLic.toFixed(2); const totalVales=Number(document.getElementById('folha-vales-pendentes').value||0); document.getElementById('folha-descontos').value=(totalVales+descontoFaltas+descLic).toFixed(2); calcularFolhaTotal(); const diasNoMes=new Date(Number(anoRef),Number(mesRef),0).getDate(); const stEl=document.getElementById('folha-licenca-status'); if(stEl){ if(diasLic>=diasNoMes){ stEl.textContent='⚠️ Em licença no mês inteiro — valor a pagar: R$ 0,00'; stEl.style.display='block'; document.getElementById('folha-total').value='0.00'; } else if(diasLic>0){ stEl.textContent=`📅 ${diasLic} dia(s) de licença — desconto: ${moneyBR(descLic)}`; stEl.style.display='block'; } else { stEl.style.display='none'; } } }
  if(folhaMesRef) folhaMesRef.addEventListener('change',recalcularFaltasFolha);
  if(folhaAnoRef) folhaAnoRef.addEventListener('change',recalcularFaltasFolha);

  /* Financeiro tabs */
  document.getElementById('btn-fin-tab-extrato').addEventListener('click', async()=>{ await renderFinanceiro(); showFinancePanel('financeiro-extrato-panel'); });
  document.getElementById('btn-fin-tab-custo').addEventListener('click', async()=>{ await carregarTiposCustosFinanceiro(); resetFinanceiroForm(); showFinancePanel('financeiro-custo-panel'); });
  document.getElementById('btn-fin-tab-devedores').addEventListener('click', async()=>{ await renderClientesDevedores(); showFinancePanel('financeiro-devedores-panel'); });
  if(document.getElementById('btn-fin-tab-relatorios')) document.getElementById('btn-fin-tab-relatorios').addEventListener('click', async()=>{ await carregarRelatorioClienteSelect(); await renderRelatorioVendaMes(); await renderRelatorioCaixaDia(); showFinancePanel('financeiro-relatorios-panel'); showRelatorioPanel('relatorio-caixa-dia-panel'); });
  if(document.getElementById('btn-fin-transferir')) document.getElementById('btn-fin-transferir').addEventListener('click',()=>{ document.getElementById('modal-transferir').style.display='flex'; });
  if(document.getElementById('btn-confirmar-transferir')) document.getElementById('btn-confirmar-transferir').addEventListener('click',async()=>{ const origem=document.getElementById('transfer-origem').value; const destino=document.getElementById('transfer-destino').value; const valor=Number(document.getElementById('transfer-valor').value||0); if(!origem || !destino || valor<=0) return alert('Preenchimento invalido.'); if(origem===destino) return alert('Origem e destino devem ser diferentes.'); await transferirFundos(origem, destino, valor); document.getElementById('transfer-valor').value=''; document.getElementById('transfer-origem').value=''; document.getElementById('transfer-destino').value=''; document.getElementById('modal-transferir').style.display='none'; });
  if(document.getElementById('btn-cancelar-transferir')) document.getElementById('btn-cancelar-transferir').addEventListener('click',()=>{ document.getElementById('modal-transferir').style.display='none'; });
  /* v2.8.1: Modal de Faltas */
  if(document.getElementById('btn-confirmar-falta')) document.getElementById('btn-confirmar-falta').addEventListener('click', async()=>{ await confirmarFaltaModal(); });
  if(document.getElementById('btn-cancelar-falta')) document.getElementById('btn-cancelar-falta').addEventListener('click',()=>{ document.getElementById('modal-faltas').style.display='none'; });
  if(document.getElementById('btn-rel-tab-cliente')) document.getElementById('btn-rel-tab-cliente').addEventListener('click', async()=>{ await carregarRelatorioClienteSelect(); showRelatorioPanel('relatorio-cliente-panel'); });
  if(document.getElementById('btn-rel-tab-venda-mes')) document.getElementById('btn-rel-tab-venda-mes').addEventListener('click', async()=>{ await renderRelatorioVendaMes(); showRelatorioPanel('relatorio-venda-mes-panel'); });
  if(document.getElementById('btn-rel-tab-caixa-dia')) document.getElementById('btn-rel-tab-caixa-dia').addEventListener('click', async()=>{ await renderRelatorioCaixaDia(); showRelatorioPanel('relatorio-caixa-dia-panel'); });
  if(document.getElementById('btn-rel-tab-recebimentos-cliente')) document.getElementById('btn-rel-tab-recebimentos-cliente').addEventListener('click', async()=>{ await carregarRelRecebClienteSelect(); showRelatorioPanel('relatorio-recebimentos-cliente-panel'); });
  if(document.getElementById('btn-gerar-rel-recebimentos')) document.getElementById('btn-gerar-rel-recebimentos').addEventListener('click', gerarRelatorioRecebimentosCliente);

  /* Fechamento */
  if(document.getElementById('btn-fechamento-confirmar')) document.getElementById('btn-fechamento-confirmar').addEventListener('click',fecharCaixa);
  if(document.getElementById('btn-compartilhar-fechamento')) document.getElementById('btn-compartilhar-fechamento').addEventListener('click',enviarFechamentoWhatsApp);
  if(document.getElementById('relatorio-vendas-hoje')) document.getElementById('relatorio-vendas-hoje').addEventListener('click',()=>renderRelatorioVendas('hoje'));
  if(document.getElementById('relatorio-vendas-mes')) document.getElementById('relatorio-vendas-mes').addEventListener('click',()=>renderRelatorioVendas('mes'));

  /* Matriz de vendas v1.2 */
  const matrizAnoEl = document.getElementById('matriz-ano');
  if(matrizAnoEl && !matrizAnoEl.value) matrizAnoEl.value = new Date().getFullYear();
  if(document.getElementById('btn-matriz-qtd')) document.getElementById('btn-matriz-qtd').addEventListener('click', ()=>renderMatrizVendas('qtd'));
  if(document.getElementById('btn-matriz-fat')) document.getElementById('btn-matriz-fat').addEventListener('click', ()=>renderMatrizVendas('fat'));
  if(document.getElementById('matriz-ano')) document.getElementById('matriz-ano').addEventListener('change', ()=>renderMatrizVendas());
  if(document.getElementById('matriz-mes')) document.getElementById('matriz-mes').addEventListener('change', ()=>renderMatrizVendas());
  if(document.getElementById('historico-vendas-data')){
    const dataHistorico=document.getElementById('historico-vendas-data');
    if(!dataHistorico.value) dataHistorico.value=_historicoVendasHojeLocal();
    dataHistorico.addEventListener('change',()=>renderHistoricoVendas());
    document.getElementById('historico-vendas-dia-anterior')?.addEventListener('click',()=>_historicoVendasAlterarData(-1));
    document.getElementById('historico-vendas-proximo-dia')?.addEventListener('click',()=>_historicoVendasAlterarData(1));
    document.getElementById('historico-vendas-pesquisa')?.addEventListener('input',()=>renderHistoricoVendas());
  }

  /* DRE */
  if(document.getElementById('btn-dre-mensal')) document.getElementById('btn-dre-mensal').addEventListener('click',renderDREMensal);
  if(document.getElementById('btn-dre-anual')) document.getElementById('btn-dre-anual').addEventListener('click',renderDREAnual);
  if(document.getElementById('btn-dre-imprimir')) document.getElementById('btn-dre-imprimir').addEventListener('click',imprimirDRE);
  if(document.getElementById('btn-dre-regime-competencia')) document.getElementById('btn-dre-regime-competencia').addEventListener('click',()=>{ setDRERegime('competencia'); renderDREMensal(); });
  if(document.getElementById('btn-dre-regime-caixa')) document.getElementById('btn-dre-regime-caixa').addEventListener('click',()=>{ setDRERegime('caixa'); renderDREMensal(); });
  if(document.getElementById('dre-mes-select')) document.getElementById('dre-mes-select').addEventListener('change',renderDREMensal);
  if(document.getElementById('dre-ano-select')) document.getElementById('dre-ano-select').addEventListener('change',renderDREAnual);
}
function showFinancePanel(panelId){ document.querySelectorAll('.finance-panel').forEach((p)=>p.classList.add('hidden')); const p=document.getElementById(panelId); if(p) p.classList.remove('hidden'); }
function showRelatorioPanel(panelId){ document.querySelectorAll('.relatorio-panel').forEach((p)=>p.classList.add('hidden')); const p=document.getElementById(panelId); if(p) p.classList.remove('hidden'); }
async function registerServiceWorker(){ if('serviceWorker' in navigator) try{ await navigator.serviceWorker.register('sw.js'); }catch(e){ console.log('SW registration failed:',e); } }

/* ========== INIT ========== */
document.addEventListener('DOMContentLoaded', async()=>{
  try{
    await initDB();
    window.addEventListener('online', async()=>{ console.log('Conexão restaurada. Processando fila Telegram...'); await processarFilaTelegram(); });
    setInterval(verificarLembreteBackup,5*60*1000);
    resetClienteForm(); resetFuncionarioForm(); resetFornecedorForm(); resetInsumoForm();
    resetTipoCustoForm(); resetProdutoForm(); resetVendaForm(); resetCompraForm();
    resetProducaoForm(); resetFinanceiroForm(); resetValeForm();
    document.getElementById('cliente-form').addEventListener('submit',salvarCliente);
    document.getElementById('funcionario-form').addEventListener('submit',salvarFuncionario);
    document.getElementById('fornecedor-form').addEventListener('submit',salvarFornecedor);
    document.getElementById('insumo-form').addEventListener('submit',salvarInsumo);
    document.getElementById('tipo-custo-form').addEventListener('submit',salvarTipoCusto);
    document.getElementById('produto-form').addEventListener('submit',salvarProduto);
    document.getElementById('venda-form').addEventListener('submit',salvarVenda);
    document.getElementById('compra-form').addEventListener('submit',salvarCompra);
    document.getElementById('producao-form').addEventListener('submit',registrarProducao);
    document.getElementById('financeiro-form').addEventListener('submit',salvarLancamentoFinanceiro);
    document.getElementById('folha-form').addEventListener('submit',salvarPagamentoFolha);
    document.getElementById('btn-cancelar-cliente').addEventListener('click',resetClienteForm);
    document.getElementById('btn-cancelar-funcionario').addEventListener('click',resetFuncionarioForm);
    document.getElementById('btn-cancelar-fornecedor').addEventListener('click',resetFornecedorForm);
    document.getElementById('btn-cancelar-insumo').addEventListener('click',resetInsumoForm);
    document.getElementById('btn-cancelar-tipo-custo').addEventListener('click',resetTipoCustoForm);
    document.getElementById('btn-cancelar-produto').addEventListener('click',resetProdutoForm);
    document.getElementById('btn-cancelar-venda').addEventListener('click',resetVendaForm);
    document.getElementById('btn-cancelar-compra').addEventListener('click',resetCompraForm);
    document.getElementById('btn-reset-producao').addEventListener('click',resetProducaoForm);
    document.getElementById('btn-cancelar-financeiro').addEventListener('click',resetFinanceiroForm);
    document.getElementById('btn-cancelar-folha').addEventListener('click',resetFolhaForm);
    if(document.getElementById('vale-form')) document.getElementById('vale-form').addEventListener('submit',registrarVale);
    if(document.getElementById('btn-cancelar-vale')) document.getElementById('btn-cancelar-vale').addEventListener('click',resetValeForm);
    if(document.getElementById('ferias-form')) document.getElementById('ferias-form').addEventListener('submit',salvarPagamentoFerias);
    if(document.getElementById('avulso-form')) document.getElementById('avulso-form').addEventListener('submit',salvarPagamentoAvulso);
    if(document.getElementById('patrimonio-form')) document.getElementById('patrimonio-form').addEventListener('submit',salvarPatrimonio);
    if(document.getElementById('btn-exportar-total')) document.getElementById('btn-exportar-total').addEventListener('click',exportarTodosDados);
    if(document.getElementById('btn-importar-total')) document.getElementById('btn-importar-total').addEventListener('click',()=>document.getElementById('file-importar-total').click());
    if(document.getElementById('file-importar-total')) document.getElementById('file-importar-total').addEventListener('change',(e)=>importarTodosDados(e.target.files[0]));
    if(document.getElementById('btn-exportar-clientes')) document.getElementById('btn-exportar-clientes').addEventListener('click',exportarClientes);
    if(document.getElementById('btn-exportar-produtos')) document.getElementById('btn-exportar-produtos').addEventListener('click',exportarProdutos);
    if(document.getElementById('btn-exportar-funcionarios')) document.getElementById('btn-exportar-funcionarios').addEventListener('click',exportarFuncionarios);
    if(document.getElementById('telegram-form')) document.getElementById('telegram-form').addEventListener('submit', async(e)=>{ await salvarConfiguracoesTelegram(e); });
    if(document.getElementById('btn-testar-telegram')) document.getElementById('btn-testar-telegram').addEventListener('click',testarConexaoTelegram);
    if(document.getElementById('btn-salvar-meta-vendas')) document.getElementById('btn-salvar-meta-vendas').addEventListener('click',salvarMetaVendas);
    if(document.getElementById('btn-salvar-templates')) document.getElementById('btn-salvar-templates').addEventListener('click',salvarTemplatesComunicacao);
    /* Cidade form */
    if(document.getElementById('cidade-form')) document.getElementById('cidade-form').addEventListener('submit',salvarCidade);
    if(document.getElementById('btn-cancelar-cidade')) document.getElementById('btn-cancelar-cidade').addEventListener('click',resetCidadeForm);
    setupNavigation();
    setupAvisosListeners(); /* v3.0 — Avisos aos Clientes */
    setupEstornoListeners(); /* v3.1 — Estorno de Pedidos */
    setupResumoMesListeners(); /* v3.2 — Resumo do Mês */
    setupEstornoValesListeners(); /* v3.3 — Estorno de Vales */
    setupLicencasListeners(); /* v3.4 — Licenças e Afastamentos */
    await renderCidades(); await carregarCidadesSelect();
    await renderClientes(); await renderFuncionarios(); await renderFornecedores();
    await renderInsumos(); await renderTiposCustos(); await renderProdutos();
    await renderVendas(); await renderCompras(); await renderProducoes();
    await renderMovimentosEstoque(); await atualizarResumoFinanceiro();
    await renderFinanceiro(); await renderClientesDevedores();
    await renderFolhaPagamentos(); await renderDashboardHoje();
    await carregarClientesVenda(); await carregarProdutosVenda();
    await carregarFornecedoresCompra(); await carregarItensCompra();
    await carregarProdutoSelect(); await carregarTiposCustosFinanceiro();
    await carregarFolhaFuncionarios(); await carregarConfiguracoesTelegram();
    await renderEstoqueGeral(); await refreshProducaoMetricas();
    await carregarCidadesSelect();
    await registerServiceWorker();
    // v2.0: Alerta automático de documentos ao iniciar removido (silêncio total na abertura)
    showScreen('dashboard-screen');
  }catch(error){
    console.error('Erro ao iniciar o sistema:', error);
  }
});

/* ========== COMODATO DE GARRAFÕES v1.6 ========== */

let comodatoClienteAtual = null;

async function abrirComodato(){
  // Carrega clientes no select
  const clientes = await fetchAllSorted('clientes');
  const sel = document.getElementById('comodato-cliente-select');
  if(!sel) return;
  sel.innerHTML = '<option value="">Selecione um cliente...</option>';
  clientes.forEach((c)=>{
    const o = document.createElement('option');
    o.value = String(c.id);
    o.textContent = c.nome;
    sel.appendChild(o);
  });
  // Esconde ficha
  const ficha = document.getElementById('comodato-ficha-section');
  if(ficha) ficha.style.display = 'none';
  comodatoClienteAtual = null;
  // Renderiza lista geral
  await renderComodatoGeral();
  // Listener de seleção
  sel.onchange = async()=>{
    const clienteId = Number(sel.value);
    if(!clienteId){ if(ficha) ficha.style.display='none'; comodatoClienteAtual=null; return; }
    const cliente = await reqToPromise(getStore('clientes').get(clienteId));
    if(!cliente) return;
    comodatoClienteAtual = cliente;
    await renderComodatoFicha(cliente);
    if(ficha) ficha.style.display='';
  };
  // Formulário
  const form = document.getElementById('comodato-form');
  if(form){
    form.onsubmit = async(e)=>{
      e.preventDefault();
      if(!comodatoClienteAtual) return alert('Selecione um cliente.');
      const data = document.getElementById('comodato-data').value;
      const acao = document.getElementById('comodato-acao').value; // 'saida' ou 'entrada'
      const tipo = document.getElementById('comodato-tipo').value; // 'Novo' ou 'Velho'
      const quantidade = Number(document.getElementById('comodato-quantidade').value||0);
      const observacao = document.getElementById('comodato-observacao').value.trim();
      if(!data || quantidade <= 0) return alert('Preencha todos os campos obrigatórios.');
      // Salva movimentação
      const mov = {
        id: idGen(),
        clienteId: comodatoClienteAtual.id,
        clienteNome: comodatoClienteAtual.nome,
        data, acao, tipo, quantidade, observacao,
        updatedAt: new Date().toISOString()
      };
      const tx = db.transaction('comodato_movimentacoes','readwrite');
      tx.objectStore('comodato_movimentacoes').put(mov);
      await txToPromise(tx);
      // Calcula saldo atual para Telegram
      const saldos = await calcularSaldoComodato(comodatoClienteAtual.id);
      const acaoLabel = acao === 'saida' ? 'Saída (Empréstimo)' : 'Entrada (Retorno)';
      const saldoTotal = saldos.novo + saldos.velho;
      const isCredito = saldoTotal < 0;
      const saldoLabel = isCredito
        ? `${saldoTotal} (Crédito do Cliente)`
        : `${saldoTotal} (Novos: ${saldos.novo} | Velhos: ${saldos.velho})`;
      await registrarEventoAuditoria('COMODATO','Comodato atualizado',`Cliente: ${comodatoClienteAtual.nome}\nAção: ${acaoLabel} de ${quantidade} Garrafão ${tipo}\nSaldo: ${saldoLabel}`);
      form.reset();
      document.getElementById('comodato-data').value = new Date().toISOString().slice(0,10);
      await renderComodatoFicha(comodatoClienteAtual);
      await renderComodatoGeral();
      const alertMsg = isCredito
        ? `✅ Movimentação registrada! Saldo: ${saldoTotal} (Crédito do Cliente).`
        : `✅ Movimentação registrada! Saldo atual: ${saldoTotal} garrafão(ões).`;
      alert(alertMsg);
    };
  }
  // Botão cancelar
  const btnCancelar = document.getElementById('btn-cancelar-comodato');
  if(btnCancelar) btnCancelar.onclick = ()=>{
    const form2 = document.getElementById('comodato-form');
    if(form2){ form2.reset(); document.getElementById('comodato-data').value = new Date().toISOString().slice(0,10); }
  };
  // Preenche data de hoje
  const dataField = document.getElementById('comodato-data');
  if(dataField && !dataField.value) dataField.value = new Date().toISOString().slice(0,10);
  // Botao WhatsApp Atualizar Cliente (v2.9.1)
  const btnWhatsComodato = document.getElementById('btn-whatsapp-comodato');
  if(btnWhatsComodato) btnWhatsComodato.onclick = async()=>{
    if(!comodatoClienteAtual) return alert('Selecione um cliente primeiro.');
    await enviarWhatsAppComodato(comodatoClienteAtual);
  };
}

/* ========== WHATSAPP COMODATO v2.9.1 ========== */

function gerarMensagemComodato(cliente, saldoNovo, saldoVelho){
  let linhas = [];
  if(saldoNovo > 0){
    linhas.push('Voc\u00ea est\u00e1 com ' + saldoNovo + ' garraf\u00f5es novos emprestados da empresa.');
  } else if(saldoNovo < 0){
    linhas.push('A empresa est\u00e1 com ' + Math.abs(saldoNovo) + ' garraf\u00f5es novos seus.');
  }
  if(saldoVelho > 0){
    linhas.push('Voc\u00ea est\u00e1 com ' + saldoVelho + ' garraf\u00f5es velhos emprestados da empresa.');
  } else if(saldoVelho < 0){
    linhas.push('A empresa est\u00e1 com ' + Math.abs(saldoVelho) + ' garraf\u00f5es velhos seus.');
  }
  if(linhas.length === 0){
    return null;
  }
  let msg = 'Ol\u00e1 ' + cliente.nome + ', essa mensagem \u00e9 autom\u00e1tica.\n\n';
  msg += 'Segue sua posi\u00e7\u00e3o de garraf\u00f5es junto \u00e0 empresa neste momento:\n\n';
  msg += linhas.join('\n');
  msg += '\n\nAtenciosamente,\n\u00c1gua L\u00edrios';
  return msg;
}

async function enviarWhatsAppComodato(cliente){
  const telefone = (cliente.telefone || '').replace(/\D/g, '');
  if(!telefone) return alert('Cliente sem telefone cadastrado. Cadastre o telefone primeiro.');
  const saldos = await calcularSaldoComodato(cliente.id);
  const msg = gerarMensagemComodato(cliente, saldos.novo, saldos.velho);
  if(!msg) return alert('Este cliente n\u00e3o possui saldo de garraf\u00f5es (novos ou velhos) para informar.');
  const tel = telefone.startsWith('55') ? telefone : '55' + telefone;
  const url = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg);
  window.open(url, '_blank');
}

async function calcularSaldoComodato(clienteId){
  const all = await reqToPromise(getStore('comodato_movimentacoes').getAll());
  const movs = all.filter(m => m.clienteId === clienteId);
  let novo = 0, velho = 0;
  movs.forEach(m=>{
    const delta = m.acao === 'saida' ? m.quantidade : -m.quantidade;
    if(m.tipo === 'Novo') novo += delta;
    else velho += delta;
  });
  return { novo, velho };
}

async function renderComodatoFicha(cliente){
  const saldos = await calcularSaldoComodato(cliente.id);
  document.getElementById('comodato-cliente-nome-titulo').textContent = `Ficha: ${cliente.nome}`;
  /* Saldo Novos */
  const elNovo = document.getElementById('comodato-saldo-novo');
  if(elNovo){
    elNovo.textContent = saldos.novo < 0 ? `${saldos.novo} (Crédito do Cliente)` : saldos.novo;
    elNovo.style.color = saldos.novo < 0 ? '#7c3aed' : '#1e3a5f';
    elNovo.style.fontWeight = '700';
  }
  /* Saldo Velhos */
  const elVelho = document.getElementById('comodato-saldo-velho');
  if(elVelho){
    elVelho.textContent = saldos.velho < 0 ? `${saldos.velho} (Crédito do Cliente)` : saldos.velho;
    elVelho.style.color = saldos.velho < 0 ? '#7c3aed' : '#1e3a5f';
    elVelho.style.fontWeight = '700';
  }
  // Alerta de baixo movimento (>60 dias sem retorno)
  const all = await reqToPromise(getStore('comodato_movimentacoes').getAll());
  const movs = all.filter(m => m.clienteId === cliente.id).sort((a,b)=>b.data.localeCompare(a.data));
  const ultimoRetorno = movs.find(m => m.acao === 'entrada');
  const alerta = document.getElementById('comodato-alerta-baixo-movimento');
  if(alerta){
    const temSaldo = (saldos.novo + saldos.velho) > 0;
    if(temSaldo){
      if(!ultimoRetorno){
        // Nunca houve retorno — verifica se primeira saída foi há mais de 60 dias
        const primeiraSaida = movs.filter(m=>m.acao==='saida').sort((a,b)=>a.data.localeCompare(b.data))[0];
        if(primeiraSaida){
          const diasSemRetorno = Math.floor((new Date() - new Date(primeiraSaida.data)) / (1000*60*60*24));
          alerta.style.display = diasSemRetorno > 60 ? 'block' : 'none';
        } else { alerta.style.display = 'none'; }
      } else {
        const diasSemRetorno = Math.floor((new Date() - new Date(ultimoRetorno.data)) / (1000*60*60*24));
        alerta.style.display = diasSemRetorno > 60 ? 'block' : 'none';
      }
    } else { alerta.style.display = 'none'; }
  }
  // Histórico
  const lista = document.getElementById('comodato-historico-lista');
  const totalEl = document.getElementById('comodato-historico-total');
  if(totalEl) totalEl.textContent = `${movs.length} registros`;
  if(lista){
    if(!movs.length){ lista.innerHTML = '<div class="empty-list">Nenhuma movimentação registrada.</div>'; return; }
    lista.innerHTML = movs.map(m=>{
      const acaoIcon = m.acao === 'saida' ? '📤' : '📥';
      const acaoLabel = m.acao === 'saida' ? 'Saída' : 'Retorno';
      return `<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${acaoIcon} ${acaoLabel} — ${m.quantidade}x Garrafão ${m.tipo}</h4><p class="entity-meta">${formatDateBR(m.data)}${m.observacao ? ' | ' + esc(m.observacao) : ''}</p></div></div></article>`;
    }).join('');
  }
}

async function renderComodatoGeral(){
  const all = await reqToPromise(getStore('comodato_movimentacoes').getAll());
  // Agrupa por cliente
  const mapa = {};
  all.forEach(m=>{
    if(!mapa[m.clienteId]) mapa[m.clienteId] = { clienteId: m.clienteId, clienteNome: m.clienteNome, novo: 0, velho: 0, movs: [] };
    const delta = m.acao === 'saida' ? m.quantidade : -m.quantidade;
    if(m.tipo === 'Novo') mapa[m.clienteId].novo += delta;
    else mapa[m.clienteId].velho += delta;
    mapa[m.clienteId].movs.push(m);
  });
  const lista = document.getElementById('comodato-geral-lista');
  const totalEl = document.getElementById('comodato-geral-total');
  const clientes = Object.values(mapa).filter(c => c.novo !== 0 || c.velho !== 0);
  if(totalEl) totalEl.textContent = `${clientes.length} clientes`;
  if(!lista) return;
  if(!clientes.length){ lista.innerHTML = '<div class="empty-list">Nenhum cliente com garrafões em comodato.</div>'; return; }
  // Verifica alerta de 60 dias para cada cliente
  const hoje = new Date();
  lista.innerHTML = clientes.sort((a,b)=>a.clienteNome.localeCompare(b.clienteNome)).map(c=>{
    const ultimoRetorno = c.movs.filter(m=>m.acao==='entrada').sort((a,b)=>b.data.localeCompare(a.data))[0];
    let alertaBaixoMov = false;
    const temSaldoPositivo = (c.novo + c.velho) > 0;
    if(temSaldoPositivo){
      if(!ultimoRetorno){
        const primeiraSaida = c.movs.filter(m=>m.acao==='saida').sort((a,b)=>a.data.localeCompare(b.data))[0];
        if(primeiraSaida){ const dias = Math.floor((hoje - new Date(primeiraSaida.data))/(1000*60*60*24)); alertaBaixoMov = dias > 60; }
      } else {
        const dias = Math.floor((hoje - new Date(ultimoRetorno.data))/(1000*60*60*24)); alertaBaixoMov = dias > 60;
      }
    }
    const alertaHtml = alertaBaixoMov ? `<span style="color:#b45309;font-size:0.8rem;font-weight:600;">⚠️ BAIXO MOVIMENTO</span>` : '';
    const fmtSaldo = (val) => val < 0 ? `<span style="color:#7c3aed;font-weight:700;">${val} (Crédito)</span>` : val;
    const totalSaldo = c.novo + c.velho;
    const totalHtml = totalSaldo < 0 ? `<span style="color:#7c3aed;font-weight:700;">${totalSaldo} (Crédito do Cliente)</span>` : totalSaldo;
    return `<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">👤 ${esc(c.clienteNome)} ${alertaHtml}</h4><p class="entity-meta">🏺 Novos: ${fmtSaldo(c.novo)} | Velhos: ${fmtSaldo(c.velho)} | Total: ${totalHtml}</p></div></div></article>`;
  }).join('');
}


/* ========== DOCUMENTOS / ALVARÁS v1.7.1 - ESCADA DE PRIORIDADES ========== */

function resetDocumentoForm(){
  const f = document.getElementById('documento-form');
  if(f) f.reset();
  document.getElementById('documento-id').value = '';
  if(document.getElementById('documento-nivel')) document.getElementById('documento-nivel').value = '1';
  document.getElementById('btn-salvar-documento').textContent = 'Salvar Documento';
}

function getDocStatusEscada(dataVencimento){
  if(!dataVencimento) return { cor: '#94a3b8', label: 'Sem vencimento', tipo: 'sem_data' };
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const venc = new Date(dataVencimento + 'T00:00:00');
  const diff = Math.floor((venc - hoje) / (1000*60*60*24));
  if(diff < 0) return { cor: '#ef4444', label: `VENCIDO há ${Math.abs(diff)} dia(s)`, tipo: 'vencido', diff };
  if(diff <= 30) return { cor: '#f59e0b', label: `Vence em ${diff} dia(s)`, tipo: 'alerta', diff };
  return { cor: '#22c55e', label: `Em dia (${diff}d)`, tipo: 'ok', diff };
}

async function abrirDocumentosEscada(){
  await renderEscadaDocumentos();
  const form = document.getElementById('documento-form');
  if(form){
    form.onsubmit = async(e)=>{
      e.preventDefault();
      const idVal = document.getElementById('documento-id').value.trim();
      const nome = document.getElementById('documento-nome').value.trim();
      const nivel = Number(document.getElementById('documento-nivel').value || 1);
      const dataAtualizacao = document.getElementById('documento-data-atualizacao').value;
      const dataVencimento = document.getElementById('documento-data-vencimento').value;
      const observacao = document.getElementById('documento-observacao').value.trim();
      if(!nome) return alert('Informe o nome do documento.');
      const isNovo = !idVal;
      const obj = {
        id: idVal ? Number(idVal) : idGen(),
        nome, nivel, dataAtualizacao, dataVencimento, observacao,
        updatedAt: new Date().toISOString()
      };
      const tx = db.transaction('documentos_escada','readwrite');
      tx.objectStore('documentos_escada').put(obj);
      await txToPromise(tx);
      const acao = isNovo ? 'NOVO DOCUMENTO CADASTRADO' : 'DOCUMENTO ATUALIZADO';
      const statusInfo = getDocStatusEscada(dataVencimento);
      await registrarEventoAuditoria('DOCUMENTO',acao,`Nome: ${nome}\nNível: ${nivel}${nivel===1?' (Topo - Principal)':''}\nVencimento: ${dataVencimento ? formatDateBR(dataVencimento) : 'Não definido'}\nStatus: ${statusInfo.label}${observacao ? '\nObs: ' + observacao : ''}`);
      await verificarEAlertarDocumento(obj);
      resetDocumentoForm();
      await renderEscadaDocumentos();
    };
  }
  const btnCancelar = document.getElementById('btn-cancelar-documento');
  if(btnCancelar) btnCancelar.onclick = ()=> resetDocumentoForm();
}

async function renderEscadaDocumentos(){
  const todos = await fetchAllSorted('documentos_escada', 'nivel');
  const container = document.getElementById('documentos-escada-container');
  const totalEl = document.getElementById('documentos-total');
  if(totalEl) totalEl.textContent = `${todos.length} documentos`;
  if(!container) return;
  if(!todos.length){
    container.innerHTML = '<div class="empty-list">Nenhum documento cadastrado. Adicione o primeiro acima. Comece pelo Nível 1 (Alvará Principal).</div>';
    return;
  }
  const temVencidoNaBase = todos.some(d => d.nivel > 1 && getDocStatusEscada(d.dataVencimento).tipo === 'vencido');
  let html = '';
  todos.forEach((doc, idx)=>{
    const status = getDocStatusEscada(doc.dataVencimento);
    let statusFinal = status;
    if(doc.nivel === 1 && status.tipo === 'ok' && temVencidoNaBase){
      statusFinal = { cor: '#f59e0b', label: '⚠️ BASE COMPROMETIDA', tipo: 'risco_cascata' };
    }
    const marginLeft = (doc.nivel - 1) * 16;
    html += `
      <div style="margin-bottom:10px;margin-left:${marginLeft}px;">
        <div style="border:2px solid ${statusFinal.cor};border-radius:12px;padding:12px 16px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">
            <div>
              <div style="font-weight:700;font-size:0.95rem;color:#1e293b;">${doc.nivel === 1 ? '🏆 ' : `${doc.nivel}. `}${esc(doc.nome)}</div>
              ${doc.dataAtualizacao ? `<div style="font-size:0.78rem;color:#64748b;">Atualizado: ${formatDateBR(doc.dataAtualizacao)}</div>` : ''}
              ${doc.dataVencimento ? `<div style="font-size:0.78rem;color:#64748b;">Vence: ${formatDateBR(doc.dataVencimento)}</div>` : ''}
              ${doc.observacao ? `<div style="font-size:0.78rem;color:#94a3b8;margin-top:2px;">${esc(doc.observacao)}</div>` : ''}
            </div>
            <div style="text-align:right;">
              <span style="display:inline-block;padding:3px 10px;border-radius:20px;background:${statusFinal.cor};color:#fff;font-size:0.78rem;font-weight:700;">${statusFinal.label}</span>
              <div style="margin-top:6px;display:flex;gap:6px;justify-content:flex-end;">
                <button class="btn-small js-esc-edit" data-id="${doc.id}" type="button" style="font-size:0.75rem;padding:3px 8px;">Editar</button>
                <button class="btn-danger js-esc-delete" data-id="${doc.id}" type="button" style="font-size:0.75rem;padding:3px 8px;">Excluir</button>
              </div>
            </div>
          </div>
        </div>
        ${idx < todos.length - 1 ? '<div style="text-align:center;color:#cbd5e1;font-size:1.2rem;line-height:1;">↓</div>' : ''}
      </div>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.js-esc-edit').forEach(btn=>{
    btn.addEventListener('click', async()=>{
      const id = Number(btn.dataset.id);
      const doc = await reqToPromise(getStore('documentos_escada').get(id));
      if(!doc) return;
      document.getElementById('documento-id').value = doc.id;
      document.getElementById('documento-nome').value = doc.nome || '';
      document.getElementById('documento-nivel').value = doc.nivel || 1;
      document.getElementById('documento-data-atualizacao').value = doc.dataAtualizacao || '';
      document.getElementById('documento-data-vencimento').value = doc.dataVencimento || '';
      document.getElementById('documento-observacao').value = doc.observacao || '';
      document.getElementById('btn-salvar-documento').textContent = 'Atualizar Documento';
      document.getElementById('documento-nome').focus();
    });
  });
  container.querySelectorAll('.js-esc-delete').forEach(btn=>{
    btn.addEventListener('click', async()=>{
      const id = Number(btn.dataset.id);
      const doc = await reqToPromise(getStore('documentos_escada').get(id));
      if(!doc) return;
      if(!confirm(`Excluir "${doc.nome}" (Nível ${doc.nivel})?`)) return;
      const tx = db.transaction('documentos_escada','readwrite');
      tx.objectStore('documentos_escada').delete(id);
      await txToPromise(tx);
      await registrarEventoAuditoria('DOCUMENTO','Documento excluído',`Nome: ${doc.nome}\nNível: ${doc.nivel}`);
      await renderEscadaDocumentos();
    });
  });
}

async function verificarEAlertarDocumento(doc){
  const status = getDocStatusEscada(doc.dataVencimento);
  if(status.tipo === 'vencido'){
    await registrarEventoAuditoria('ALERTA','Documento vencido',`Documento: ${doc.nome}\nNível: ${doc.nivel}${doc.nivel===1?' (Topo - Principal)':''}\nVencido em: ${formatDateBR(doc.dataVencimento)}\n${doc.nivel > 1 ? 'Isso coloca o Alvará Principal em risco!' : 'O documento principal está vencido!'}`);
  } else if(status.tipo === 'alerta'){
    await registrarEventoAuditoria('ALERTA','Vencimento próximo',`Documento: ${doc.nome}\nNível: ${doc.nivel}${doc.nivel===1?' (Topo - Principal)':''}\nVence em: ${formatDateBR(doc.dataVencimento)} (${status.label})\nRenove antes do prazo!`);
  }
}

async function verificarEscadaVencimentos(){
  try {
    const todos = await fetchAllSorted('documentos_escada', 'nivel');
    const temVencidoNaBase = todos.some(d => d.nivel > 1 && getDocStatusEscada(d.dataVencimento).tipo === 'vencido');
    for(const doc of todos){
      const status = getDocStatusEscada(doc.dataVencimento);
      if(status.tipo === 'vencido' || status.tipo === 'alerta'){
        const riscoAlvara = temVencidoNaBase ? '\n🚨 O Alvará Principal (Nível 1) está em RISCO!' : '';
        await registrarEventoAuditoria('ALERTA','Alerta diário documento',`Documento: ${doc.nome}\nNível: ${doc.nivel}\n${status.tipo === 'vencido' ? 'Está VENCIDO' : `Vence em ${status.diff} dia(s)`}${riscoAlvara}`);
      }
    }
  } catch(e){ console.error('Erro ao verificar escada de vencimentos:', e); }
}

/* ========== FÉRIAS / 13º / EXTRAS v2.2 ========== */
function resetFeriasForm(){
  const f=document.getElementById('ferias-form');
  if(f) f.reset();
  setTodayIfEmpty('ferias-data');
}

async function carregarFuncionariosFeriasSelect(){
  const sel=document.getElementById('ferias-funcionario-id');
  if(!sel) return;
  const funcs=(await fetchAllSorted('funcionarios')).filter(funcionarioEstaAtivo);
  sel.innerHTML='<option value="">Selecione o funcionário...</option>'+funcs.map(f=>`<option value="${f.id}">${esc(f.nome)}</option>`).join('');
}

async function renderFeriasHistorico(){
  const lista=document.getElementById('ferias-lista');
  if(!lista) return;
  const items=await fetchAllSorted('folha_pagamento','data',true);
  const especiais=items.filter(x=>x.tipoEspecial);
  if(!especiais.length){ lista.innerHTML='<div class="empty-list">Nenhum pagamento especial registrado.</div>'; return; }
  lista.innerHTML=especiais.map(x=>`<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(x.funcionarioNome)}</h4><p class="entity-meta">${esc(x.tipoEspecial)} | Período: ${esc(x.mesReferencia||'-')}<br>Valor: <strong>${moneyBR(x.totalLiquido)}</strong> | Gaveta: ${esc(x.gavetaOrigem)} | Data: ${formatDateBR(x.data)}</p></div></div></article>`).join('');
}

async function salvarPagamentoFerias(event){
  event.preventDefault();
  const funcId=Number(document.getElementById('ferias-funcionario-id').value);
  const tipo=document.getElementById('ferias-tipo').value;
  const periodo=document.getElementById('ferias-periodo').value.trim();
  const valor=Number(document.getElementById('ferias-valor').value||0);
  const gaveta=document.getElementById('ferias-gaveta').value;
  const data=document.getElementById('ferias-data').value;
  if(!funcId||!tipo||!periodo||valor<=0||!data) return alert('Preencha todos os campos.');
  const func=await reqToPromise(getStore('funcionarios').get(funcId));
  if(!func) return alert('Funcionário não encontrado.');
  const pagId=idGen();
  const tx=db.transaction(['folha_pagamento','financeiro_lancamentos'],'readwrite');
  tx.objectStore('folha_pagamento').put({
    id:pagId, funcionarioId:funcId, funcionarioNome:func.nome,
    salarioBase:0, adicionais:valor, descontos:0, totalLiquido:valor,
    data, mesReferencia:periodo, anoReferencia:new Date(data).getFullYear(),
    gavetaOrigem:gaveta, tipoEspecial:tipo, updatedAt:new Date().toISOString()
  });
  tx.objectStore('financeiro_lancamentos').put({
    id:idGen(), data, tipo:'saida', valor,
    descricao:`${tipo}: ${func.nome} (${periodo})`,
    tipoCusto:'Folha de Pagamento', tipoCustoId:0,
    formaPagamento:gaveta, gaveta, origem:'ferias_especial',
    referenciaId:pagId, updatedAt:new Date().toISOString()
  });
  await txToPromise(tx);
  await registrarEventoAuditoria('PAGAMENTO','Pagamento realizado',`Tipo: ${tipo}\nFavorecido: ${func.nome}\nPeríodo: ${periodo}\nValor: ${moneyBR(valor)}\nGaveta: ${gaveta}`);
  await atualizarResumoFinanceiro();
  await renderFeriasHistorico();
  resetFeriasForm();
  alert(`✅ ${tipo} de ${func.nome} registrado com sucesso!`);
}

/* ========== MÃO DE OBRA AVULSA v2.2 ========== */
function resetAvulsoForm(){
  const f=document.getElementById('avulso-form');
  if(f) f.reset();
  setTodayIfEmpty('avulso-data');
}

async function renderAvulsoHistorico(){
  const lista=document.getElementById('avulso-lista');
  if(!lista) return;
  const items=await fetchAllSorted('financeiro_lancamentos','data',true);
  const avulsos=items.filter(x=>x.origem==='avulso');
  if(!avulsos.length){ lista.innerHTML='<div class="empty-list">Nenhum pagamento avulso registrado.</div>'; return; }
  lista.innerHTML=avulsos.map(x=>`<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(x.descricao)}</h4><p class="entity-meta">Valor: <strong>${moneyBR(x.valor)}</strong> | Gaveta: ${esc(x.gaveta)} | Data: ${formatDateBR(x.data)}${x.observacao?`<br>Obs: ${esc(x.observacao)}`:''}</p></div></div></article>`).join('');
}

async function salvarPagamentoAvulso(event){
  event.preventDefault();
  const nome=document.getElementById('avulso-nome').value.trim();
  const valor=Number(document.getElementById('avulso-valor').value||0);
  const gaveta=document.getElementById('avulso-gaveta').value;
  const data=document.getElementById('avulso-data').value;
  const obs=document.getElementById('avulso-obs').value.trim();
  if(!nome||valor<=0||!data) return alert('Preencha todos os campos obrigatórios.');
  const tx=db.transaction('financeiro_lancamentos','readwrite');
  tx.objectStore('financeiro_lancamentos').put({
    id:idGen(), data, tipo:'saida', valor,
    descricao:`Avulso: ${nome}`,
    tipoCusto:'Mão de Obra Avulsa', tipoCustoId:0,
    formaPagamento:gaveta, gaveta, origem:'avulso',
    observacao:obs, updatedAt:new Date().toISOString()
  });
  await txToPromise(tx);
  await registrarEventoAuditoria('PAGAMENTO','Mão de obra avulsa',`Favorecido: ${nome}\nValor: ${moneyBR(valor)}\nGaveta: ${gaveta}${obs?`\nObs: ${obs}`:''}`);
  await atualizarResumoFinanceiro();
  await renderAvulsoHistorico();
  resetAvulsoForm();
  alert(`✅ Pagamento avulso para "${nome}" registrado com sucesso!`);
}

/* ========== BENS E PATRIMÔNIO v2.4 ========== */
function togglePatrimonioForma(){
  const forma=document.getElementById('patrimonio-forma')?.value;
  const parcelasField=document.getElementById('patrimonio-parcelas-field');
  if(parcelasField){ parcelasField.classList.toggle('hidden', forma!=='parcelado'); }
}

function resetPatrimonioForm(){
  const f=document.getElementById('patrimonio-form');
  if(f) f.reset();
  const idField=document.getElementById('patrimonio-id');
  if(idField) idField.value='';
  const parcelasField=document.getElementById('patrimonio-parcelas-field');
  if(parcelasField) parcelasField.classList.add('hidden');
  const btnSalvar=document.getElementById('btn-salvar-patrimonio');
  if(btnSalvar) btnSalvar.textContent='Registrar Bem';
  setTodayIfEmpty('patrimonio-data');
}

async function editarPatrimonio(id){
  const bem=await reqToPromise(getStore('patrimonio_bens').get(Number(id)));
  if(!bem) return;
  const idField=document.getElementById('patrimonio-id');
  if(idField) idField.value=bem.id;
  document.getElementById('patrimonio-nome').value=bem.nome||'';
  document.getElementById('patrimonio-categoria').value=bem.categoria||'Equipamento';
  document.getElementById('patrimonio-valor').value=bem.valor||0;
  document.getElementById('patrimonio-data').value=bem.data||'';
  document.getElementById('patrimonio-forma').value=bem.forma||'quitado';
  togglePatrimonioForma();
  if(bem.parcelas && document.getElementById('patrimonio-parcelas')){
    document.getElementById('patrimonio-parcelas').value=bem.parcelas;
  }
  if(document.getElementById('patrimonio-obs')) document.getElementById('patrimonio-obs').value=bem.obs||'';
  const btnSalvar=document.getElementById('btn-salvar-patrimonio');
  if(btnSalvar) btnSalvar.textContent='Atualizar Bem';
  document.getElementById('patrimonio-nome').focus();
}

async function excluirPatrimonio(id){
  const bem=await reqToPromise(getStore('patrimonio_bens').get(Number(id)));
  if(!bem) return;
  const msg=bem.forma==='parcelado'
    ? `Tem certeza que deseja excluir "${bem.nome}"?\nIsso também removerá todas as parcelas vinculadas no Contas a Pagar.`
    : `Tem certeza que deseja excluir "${bem.nome}"?`;
  if(!confirm(msg)) return;
  // Remove bem e parcelas vinculadas
  const todasContas=await reqToPromise(getStore('contas_pagar').getAll());
  const parcelasVinculadas=todasContas.filter(c=>c.patrimonioId===bem.id);
  const stores=parcelasVinculadas.length>0?['patrimonio_bens','contas_pagar']:['patrimonio_bens'];
  const tx=db.transaction(stores,'readwrite');
  tx.objectStore('patrimonio_bens').delete(bem.id);
  if(parcelasVinculadas.length>0){
    parcelasVinculadas.forEach(p=>tx.objectStore('contas_pagar').delete(p.id));
  }
  await txToPromise(tx);
  await renderPatrimonio();
  if(parcelasVinculadas.length>0){
    alert(`✅ "${bem.nome}" excluído.\n${parcelasVinculadas.length} parcela(s) removida(s) do Contas a Pagar.`);
  }
}

async function renderPatrimonio(){
  const bens=await fetchAllSorted('patrimonio_bens','data',true);
  const lista=document.getElementById('patrimonio-lista');
  const resumo=document.getElementById('patrimonio-inventario-resumo');
  const totalValor=bens.reduce((s,b)=>s+Number(b.valor||0),0);
  const totalQuitados=bens.filter(b=>b.forma==='quitado').length;
  const totalParcelados=bens.filter(b=>b.forma==='parcelado').length;
  if(resumo){
    resumo.innerHTML=`Total de Bens: <strong>${bens.length}</strong> &nbsp;|&nbsp; Valor Total: <strong>${moneyBR(totalValor)}</strong> &nbsp;|&nbsp; Quitados: <strong>${totalQuitados}</strong> &nbsp;|&nbsp; Parcelados: <strong>${totalParcelados}</strong>`;
  }
  if(!lista) return;
  if(!bens.length){ lista.innerHTML='<div class="empty-list">Nenhum bem cadastrado ainda.</div>'; return; }
  lista.innerHTML=bens.map(b=>{
    const statusBadge=b.forma==='quitado'
      ? '<span style="color:#16a34a;font-weight:bold;">✅ Quitado</span>'
      : '<span style="color:#d97706;font-weight:bold;">📋 Parcelado</span>';
    return `<article class="entity-item"><div class="row-head"><div><h4 class="entity-name">${esc(b.nome)}</h4><p class="entity-meta">Categoria: ${esc(b.categoria)} | Valor: <strong>${moneyBR(b.valor)}</strong> | Data: ${formatDateBR(b.data)}<br>Status: ${statusBadge}${b.parcelas?` | ${b.parcelas}x parcelas de ${moneyBR(b.valor/b.parcelas)}`:''}${b.obs?`<br>Obs: ${esc(b.obs)}`:''}</p></div><div class="row-actions"><button class="btn-small js-edit-patrimonio" data-id="${b.id}" type="button">Editar</button><button class="btn-danger js-del-patrimonio" data-id="${b.id}" type="button">Excluir</button></div></div></article>`;
  }).join('');
  lista.querySelectorAll('.js-edit-patrimonio').forEach(btn=>{
    btn.addEventListener('click',()=>editarPatrimonio(Number(btn.dataset.id)));
  });
  lista.querySelectorAll('.js-del-patrimonio').forEach(btn=>{
    btn.addEventListener('click',()=>excluirPatrimonio(Number(btn.dataset.id)));
  });
}

async function salvarPatrimonio(event){
  event.preventDefault();
  const idVal=document.getElementById('patrimonio-id')?.value?.trim();
  const nome=document.getElementById('patrimonio-nome').value.trim();
  const categoria=document.getElementById('patrimonio-categoria').value;
  const valor=Number(document.getElementById('patrimonio-valor').value||0);
  const data=document.getElementById('patrimonio-data').value;
  const forma=document.getElementById('patrimonio-forma').value;
  const parcelas=forma==='parcelado'?Number(document.getElementById('patrimonio-parcelas').value||12):null;
  const obs=document.getElementById('patrimonio-obs').value.trim();
  if(!nome||valor<=0||!data) return alert('Preencha todos os campos obrigatórios.');
  const isEdicao=!!idVal;
  const bemId=isEdicao?Number(idVal):idGen();
  const tx=db.transaction(['patrimonio_bens','contas_pagar'],'readwrite');
  tx.objectStore('patrimonio_bens').put({
    id:bemId, nome, categoria, valor, data, forma, parcelas, obs,
    updatedAt:new Date().toISOString()
  });
  if(!isEdicao && forma==='parcelado' && parcelas>=2){
    const valorParcela=valor/parcelas;
    const dataBase=new Date(data+'T12:00:00');
    for(let i=1;i<=parcelas;i++){
      const venc=new Date(dataBase);
      venc.setMonth(venc.getMonth()+i);
      const vencStr=venc.toISOString().slice(0,10);
      tx.objectStore('contas_pagar').put({
        id:idGen()+i, fornecedorNome:nome, descricao:`${nome} — Parcela ${i}/${parcelas}`,
        tipoCusto:'Patrimônio', valor:valorParcela, dataVencimento:vencStr,
        status:'Em Aberto', saldoRestante:valorParcela, origem:'patrimonio', patrimonioId:bemId,
        updatedAt:new Date().toISOString()
      });
    }
  }
  await txToPromise(tx);
  const statusTxt=forma==='quitado'?'Quitado':`Parcelado (${parcelas}x de ${moneyBR(valor/parcelas)})`;
  if(!isEdicao){
    await registrarEventoAuditoria('PATRIMÔNIO','Patrimônio registrado',`Item: ${nome}\nCategoria: ${categoria}\nValor: ${moneyBR(valor)}\nStatus: ${statusTxt}${obs?`\nObs: ${obs}`:''}`);
  } else {
    await registrarEventoAuditoria('PATRIMÔNIO','Patrimônio atualizado',`Item: ${nome}\nValor: ${moneyBR(valor)}\nStatus: ${statusTxt}`);
  }
  await renderPatrimonio();
  resetPatrimonioForm();
  alert(isEdicao?`✅ "${nome}" atualizado com sucesso!`:`✅ "${nome}" registrado com sucesso!${forma==='parcelado'?`\n${parcelas} parcelas criadas no Contas a Pagar.`:''}`);
}

/* ========== ENGENHARIA DE CUSTOS v2.7 ========== */
async function renderEngenhariaCustos(){
  const lista = document.getElementById('engenharia-custos-lista');
  if(!lista) return;
  lista.innerHTML = '<div class="empty-list">Calculando custos...</div>';

  try {
    const produtos = await fetchAllSorted('produtos');
    const insumos = await fetchAllSorted('insumos');
    const compras = await fetchAllSorted('compras');
    const mapaInsumos = new Map(insumos.map(i => [i.id, i]));

    /* Montar mapa de último preço de compra por insumo */
    const ultimoPrecoInsumo = new Map();
    /* compras já vem ordenada por updatedAt desc, mas vamos ordenar por data para pegar a mais recente */
    const comprasOrdenadas = [...compras].sort((a,b) => (b.data||'').localeCompare(a.data||''));
    comprasOrdenadas.forEach(c => {
      if(c.itemTipo === 'insumo' && !ultimoPrecoInsumo.has(c.itemId)){
        ultimoPrecoInsumo.set(c.itemId, { preco: Number(c.precoUnitario||0), data: c.data, fornecedor: c.fornecedorNome||'' });
      }
    });
    /* Também pegar último preço de compra de produtos (para produtos comprados prontos) */
    const ultimoPrecoProduto = new Map();
    comprasOrdenadas.forEach(c => {
      if(c.itemTipo === 'produto' && !ultimoPrecoProduto.has(c.itemId)){
        ultimoPrecoProduto.set(c.itemId, { preco: Number(c.precoUnitario||0), data: c.data, fornecedor: c.fornecedorNome||'' });
      }
    });

    /* Calcular custo unitário de cada produto */
    const analises = [];
    for(const prod of produtos){
      const precoVenda = Number(prod.precoVenda || 0);
      let custoUnitario = 0;
      let temReceita = false;
      const detalhesInsumos = [];

      if(prod.receita && prod.receita.length > 0){
        temReceita = true;
        for(const r of prod.receita){
          const insumo = mapaInsumos.get(r.insumoId);
          const nomeInsumo = insumo ? insumo.nome : 'Insumo removido';
          const qtdPorUnidade = Number(r.quantidade || 0);
          const compraInfo = ultimoPrecoInsumo.get(r.insumoId);
          const precoInsumo = compraInfo ? compraInfo.preco : 0;
          const custoInsumo = qtdPorUnidade * precoInsumo;
          custoUnitario += custoInsumo;
          detalhesInsumos.push({
            nome: nomeInsumo,
            qtd: qtdPorUnidade,
            precoCompra: precoInsumo,
            custoTotal: custoInsumo,
            fornecedor: compraInfo ? compraInfo.fornecedor : 'N/A',
            dataCompra: compraInfo ? compraInfo.data : 'N/A'
          });
        }
      } else {
        /* Produto sem receita: usar último preço de compra como custo */
        const compraInfo = ultimoPrecoProduto.get(prod.id);
        if(compraInfo){
          custoUnitario = compraInfo.preco;
          detalhesInsumos.push({
            nome: 'Compra direta',
            qtd: 1,
            precoCompra: compraInfo.preco,
            custoTotal: compraInfo.preco,
            fornecedor: compraInfo.fornecedor,
            dataCompra: compraInfo.data
          });
        }
      }

      const margem = precoVenda > 0 ? ((precoVenda - custoUnitario) / precoVenda) * 100 : 0;
      const lucroUnitario = precoVenda - custoUnitario;

      analises.push({
        id: prod.id,
        nome: prod.nome,
        precoVenda,
        custoUnitario,
        lucroUnitario,
        margem,
        temReceita,
        detalhesInsumos,
        estoque: currentStock(prod)
      });
    }

    if(!analises.length){
      lista.innerHTML = '<div class="empty-list">Nenhum produto cadastrado.</div>';
      return;
    }

    /* Identificar maior e menor margem */
    const margens = analises.map(a => a.margem);
    const maiorMargem = Math.max(...margens);
    const menorMargem = Math.min(...margens);

    /* Gerar HTML */
    let html = '';
    for(const a of analises){
      let cor, bgCor, label, icone;
      if(a.margem === maiorMargem && analises.length > 1){
        cor = '#166534'; bgCor = '#dcfce7'; label = '🟢 Produto mais rentável'; icone = '🏆';
      } else if(a.margem === menorMargem && analises.length > 1){
        cor = '#991b1b'; bgCor = '#fee2e2'; label = '🔴 Revisar custos/preço'; icone = '⚠️';
      } else if(a.margem < 20){
        cor = '#854d0e'; bgCor = '#fef9c3'; label = '🟡 Margem baixa (< 20%)'; icone = '⚡';
      } else {
        cor = '#1e3a5f'; bgCor = '#f0f4ff'; label = ''; icone = '📦';
      }

      let insumosHtml = '';
      if(a.detalhesInsumos.length > 0){
        insumosHtml = '<div style="margin-top:8px;padding:8px;background:#f8fafc;border-radius:6px;font-size:0.82rem;">';
        insumosHtml += '<strong>Composição de Custo:</strong><br>';
        a.detalhesInsumos.forEach(d => {
          insumosHtml += `<span style="color:#555;">• ${esc(d.nome)}: ${d.qtd} x ${moneyBR(d.precoCompra)} = <strong>${moneyBR(d.custoTotal)}</strong></span><br>`;
        });
        insumosHtml += '</div>';
      }

      html += `<article class="entity-item" style="border-left:4px solid ${cor};background:${bgCor};margin-bottom:10px;padding:12px;border-radius:8px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
          <div style="flex:1;min-width:200px;">
            <h4 style="margin:0;color:${cor};font-size:1.05rem;">${icone} ${esc(a.nome)}</h4>
            ${label ? `<span style="display:inline-block;margin-top:4px;padding:2px 8px;border-radius:4px;font-size:0.78rem;font-weight:bold;background:${cor};color:white;">${label}</span>` : ''}
          </div>
          <div style="text-align:right;min-width:160px;">
            <div style="font-size:0.85rem;color:#555;">Preço Venda: <strong style="color:#1e3a5f;">${moneyBR(a.precoVenda)}</strong></div>
            <div style="font-size:0.85rem;color:#555;">Custo Unit.: <strong style="color:#991b1b;">${moneyBR(a.custoUnitario)}</strong></div>
            <div style="font-size:0.85rem;color:#555;">Lucro Unit.: <strong style="color:${a.lucroUnitario >= 0 ? '#166534' : '#991b1b'};">${moneyBR(a.lucroUnitario)}</strong></div>
            <div style="font-size:1rem;font-weight:bold;color:${cor};margin-top:4px;">Margem: ${a.margem.toFixed(1)}%</div>
          </div>
        </div>
        ${insumosHtml}
        <div style="margin-top:6px;font-size:0.8rem;color:#888;">Estoque atual: ${a.estoque} | ${a.temReceita ? 'Com ficha técnica' : 'Sem ficha técnica (custo por compra direta)'}</div>
      </article>`;
    }

    lista.innerHTML = html;

  } catch(e){
    console.error('Erro ao renderizar Engenharia de Custos:', e);
    lista.innerHTML = '<div class="empty-list">Erro ao calcular custos. Verifique o console.</div>';
  }
}

/* ========================================================
   AVISOS AOS CLIENTES — v3.0
   Módulo isolado. NÃO altera nenhuma funcionalidade existente.
   ======================================================== */

/* Estado em memória (sem nova store no IndexedDB) */
let _avisoListaEnvio = []; // [{id, nome, telefone, enviado}]

/* --- Alternância de abas no módulo Relatórios/Avisos --- */
function setupAvisosModuleTabs() {
  const btnRelatorios = document.getElementById('btn-tab-relatorios');
  const btnAvisos     = document.getElementById('btn-tab-avisos');
  const painelRel     = document.getElementById('painel-relatorios');
  const painelAv      = document.getElementById('painel-avisos');
  if (!btnRelatorios || !btnAvisos) return;

  btnRelatorios.addEventListener('click', () => {
    painelRel.classList.remove('hidden');
    painelAv.classList.add('hidden');
    btnRelatorios.classList.add('active');
    btnAvisos.classList.remove('active');
  });

  btnAvisos.addEventListener('click', () => {
    painelAv.classList.remove('hidden');
    painelRel.classList.add('hidden');
    btnAvisos.classList.add('active');
    btnRelatorios.classList.remove('active');
  });
}

/* --- Gerar lista de envio --- */
async function gerarListaAvisos() {
  const mensagem = (document.getElementById('aviso-mensagem')?.value || '').trim();
  if (!mensagem) {
    alert('Digite uma mensagem antes de gerar a lista.');
    return;
  }

  // Carrega todos os clientes com telefone válido
  const todos = await reqToPromise(getStore('clientes').getAll());
  const comTelefone = todos.filter(c => c.telefone && c.telefone.trim().length >= 8);

  if (!comTelefone.length) {
    alert('Nenhum cliente com telefone cadastrado encontrado.');
    return;
  }

  // Monta lista preservando status de envio anterior (se mesmo aviso)
  const idSet = new Set(_avisoListaEnvio.map(x => x.id));
  _avisoListaEnvio = comTelefone.map(c => {
    const anterior = _avisoListaEnvio.find(x => x.id === c.id);
    return {
      id: c.id,
      nome: c.nome || '',
      telefone: c.telefone.trim(),
      enviado: anterior ? anterior.enviado : false
    };
  });

  renderListaAvisos();
}

/* --- Renderizar lista de envio --- */
function renderListaAvisos() {
  const container = document.getElementById('avisos-lista-clientes');
  const totalEl   = document.getElementById('avisos-lista-total');
  if (!container) return;

  const total    = _avisoListaEnvio.length;
  const enviados = _avisoListaEnvio.filter(x => x.enviado).length;
  if (totalEl) totalEl.textContent = `${enviados}/${total} enviados`;

  if (!total) {
    container.innerHTML = '<div class="empty-list">Nenhum cliente com telefone encontrado.</div>';
    return;
  }

  container.innerHTML = _avisoListaEnvio.map((item, idx) => `
    <div class="aviso-item${item.enviado ? ' enviado' : ''}" data-idx="${idx}">
      <span class="aviso-item-nome">${esc(item.nome)}</span>
      <span class="aviso-item-tel">📱 ${esc(item.telefone)}</span>
      <div class="aviso-item-actions">
        <button class="btn-enviar-wa js-aviso-enviar" data-idx="${idx}" type="button">📲 Enviar</button>
        <button class="btn-marcar-enviado js-aviso-marcar${item.enviado ? ' marcado' : ''}" data-idx="${idx}" type="button">${item.enviado ? '✔ Enviado' : 'Marcar como Enviado'}</button>
      </div>
    </div>
  `).join('');

  // Bind: botão Enviar WhatsApp
  container.querySelectorAll('.js-aviso-enviar').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx  = Number(btn.dataset.idx);
      const item = _avisoListaEnvio[idx];
      if (!item) return;
      const mensagemBase = document.getElementById('aviso-mensagem')?.value || '';
      const mensagemFinal = mensagemBase.replace(/\{nome_cliente\}/g, item.nome);
      const tel = item.telefone.replace(/\D/g, '');
      const url = `https://wa.me/55${tel}?text=${encodeURIComponent(mensagemFinal)}`;
      window.open(url, '_blank');
      // Marca automaticamente como enviado após abrir o WhatsApp
      _avisoListaEnvio[idx].enviado = true;
      renderListaAvisos();
    });
  });

  // Bind: botão Marcar como Enviado (controle manual)
  container.querySelectorAll('.js-aviso-marcar').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      if (_avisoListaEnvio[idx]) {
        _avisoListaEnvio[idx].enviado = !_avisoListaEnvio[idx].enviado;
        renderListaAvisos();
      }
    });
  });
}

/* --- Finalizar aviso --- */
function finalizarAviso() {
  if (!confirm('Deseja finalizar o aviso atual? Isso irá limpar a mensagem e a lista de envio.')) return;
  const titulo   = document.getElementById('aviso-titulo');
  const mensagem = document.getElementById('aviso-mensagem');
  if (titulo)   titulo.value   = '';
  if (mensagem) mensagem.value = '';
  _avisoListaEnvio = [];
  const container = document.getElementById('avisos-lista-clientes');
  const totalEl   = document.getElementById('avisos-lista-total');
  if (container) container.innerHTML = '<div class="empty-list">Crie uma mensagem e clique em "Gerar Lista de Envio".</div>';
  if (totalEl)   totalEl.textContent  = '0 clientes';
}

/* --- Setup dos event listeners do módulo Avisos --- */
function setupAvisosListeners() {
  setupAvisosModuleTabs();
  const btnGerar     = document.getElementById('btn-gerar-lista-envio');
  const btnFinalizar = document.getElementById('btn-finalizar-aviso');
  if (btnGerar)     btnGerar.addEventListener('click', gerarListaAvisos);
  if (btnFinalizar) btnFinalizar.addEventListener('click', finalizarAviso);
}
/* FIM — AVISOS AOS CLIENTES v3.0 */

/* ========================================================
   ESTORNO DE PEDIDOS RECENTES — v3.1
   Módulo isolado. NÃO altera nenhuma funcionalidade existente.
   Impacta: vendas, produtos (estoque), movimentos_estoque,
            financeiro_lancamentos, limites_credito.
   A DRE se ajusta automaticamente pois lê os dados base.
   ======================================================== */

/* --- Verificar se o caixa do dia já foi fechado --- */
async function caixaFechadoHoje() {
  const hoje = new Date().toISOString().slice(0, 10);
  const fechamentos = await reqToPromise(getStore('fechamentos_caixa').getAll());
  return fechamentos.some(f => f.data === hoje);
}

/* --- Renderizar lista de pedidos recentes do dia --- */
async function renderPedidosRecentes() {
  const container = document.getElementById('pedidos-recentes-lista');
  if (!container) return;

  const hoje = new Date().toISOString().slice(0, 10);
  const fechado = await caixaFechadoHoje();

  // Busca todas as vendas do dia, ordena do mais recente ao mais antigo
  const todasVendas = await reqToPromise(getStore('vendas').getAll());
  const vendas = todasVendas
    .filter(v => v.data === hoje)
    .sort((a, b) => b.id - a.id)
    .slice(0, 10);

  if (!vendas.length) {
    container.innerHTML = '<div class="empty-list">Nenhum pedido registrado hoje.</div>';
    return;
  }

  if (fechado) {
    container.innerHTML = '<div class="empty-list" style="border-color:#fca5a5;background:#fef2f2;color:#991b1b;">⚠️ Caixa fechado. Estorno não permitido após fechamento.</div>';
    return;
  }

  container.innerHTML = vendas.map(v => {
    const isEstornado = v.statusPagamento === 'Estornado';
    const badgeClass = isEstornado ? 'badge-estornado' : (v.statusPagamento === 'Em Aberto' ? 'badge-aberto' : 'badge-recebido');
    const badgeLabel = isEstornado ? '↩ Estornado' : (v.statusPagamento === 'Em Aberto' ? '⏳ Em Aberto' : '✅ Recebido');

    const itensHtml = (v.itens || []).map(it =>
      `• ${esc(it.produtoNome)} × ${it.quantidade} = ${moneyBR(it.subtotal)}`
    ).join('<br>');

    const hora = v.updatedAt ? v.updatedAt.slice(11, 16) : '--:--';

    return `
      <div class="pedido-recente-item${isEstornado ? ' estornado' : ''}" data-id="${v.id}">
        <div class="pedido-recente-head">
          <span class="pedido-recente-nome">${esc(v.clienteNome)}</span>
          <span class="pedido-recente-badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <div class="pedido-recente-meta">
          🕐 ${hora} &nbsp;|&nbsp; 💳 ${esc(v.formaPagamento)} &nbsp;|&nbsp; 💰 ${moneyBR(v.total)}
        </div>
        <div class="pedido-recente-itens">${itensHtml}</div>
        ${!isEstornado ? `<button class="btn-estornar js-btn-estornar" data-id="${v.id}" type="button">↩ Estornar este pedido</button>` : ''}
      </div>
    `;
  }).join('');

  // Bind botões de estorno
  container.querySelectorAll('.js-btn-estornar').forEach(btn => {
    btn.addEventListener('click', async () => {
      const vendaId = Number(btn.dataset.id);
      await executarEstorno(vendaId);
    });
  });
}

/* --- Executar o estorno completo de uma venda --- */
async function executarEstorno(vendaId) {
  // Segurança: verificar se caixa não foi fechado
  if (await caixaFechadoHoje()) {
    alert('⚠️ O caixa já foi fechado hoje. Estorno não permitido.');
    return;
  }

  const venda = await reqToPromise(getStore('vendas').get(vendaId));
  if (!venda) { alert('Pedido não encontrado.'); return; }

  // Segurança: não estornar duas vezes
  if (venda.statusPagamento === 'Estornado') {
    alert('Este pedido já foi estornado.');
    return;
  }

  // Segurança: somente pedidos do dia atual
  const hoje = new Date().toISOString().slice(0, 10);
  if (venda.data !== hoje) {
    alert('⚠️ Somente pedidos do dia atual podem ser estornados.');
    return;
  }

  // Confirmação do operador
  const itensTexto = (venda.itens || []).map(it => `• ${it.produtoNome} × ${it.quantidade}`).join('\n');
  const confirmMsg = `Deseja realmente estornar este pedido?\n\nCliente: ${venda.clienteNome}\nTotal: ${moneyBR(venda.total)}\nPagamento: ${venda.formaPagamento}\n\nItens:\n${itensTexto}\n\nEsta ação não pode ser desfeita.`;
  if (!confirm(confirmMsg)) return;

  try {
    const isPrazo = venda.formaPagamento === 'Prazo';

    // ---- Carregar produtos para devolver estoque ----
    const produtos = [];
    for (const item of (venda.itens || [])) {
      const p = await reqToPromise(getStore('produtos').get(item.produtoId));
      if (p) produtos.push({ prod: p, item });
    }

    // ---- Carregar lançamento financeiro vinculado ----
    const todosLanc = await reqToPromise(getStore('financeiro_lancamentos').getAll());
    const lancVenda = todosLanc.find(l => l.origem === 'venda' && l.referenciaId === vendaId);

    // ---- Carregar movimentos de estoque vinculados ----
    const todosMovs = await reqToPromise(getStore('movimentos_estoque').getAll());
    const movsVenda = todosMovs.filter(m => m.origem === 'venda' && m.referenciaId === vendaId);

    // ---- Carregar saldo atual do cliente ----
    const limiteReg = await reqToPromise(getStore('limites_credito').get(venda.clienteId));
    const saldoDevedorAtual = Number(limiteReg?.saldoDevedor || 0);
    const saldoCreditoAtual = Number(limiteReg?.saldoCredito || 0);
    const limiteAtual = Number(limiteReg?.limite || 0);

    // ---- Montar transação de estorno ----
    const storesList = ['vendas', 'produtos', 'movimentos_estoque', 'financeiro_lancamentos', 'limites_credito'];
    const tx = db.transaction(storesList, 'readwrite');
    const dataEstorno = hoje;

    // (A) ESTOQUE: devolver todos os produtos
    for (const { prod, item } of produtos) {
      const estoqueDevolvido = currentStock(prod) + item.quantidade;
      tx.objectStore('produtos').put({ ...prod, estoqueAtual: estoqueDevolvido, updatedAt: new Date().toISOString() });
      tx.objectStore('movimentos_estoque').put({
        id: idGen(), tipo: 'entrada', itemTipo: 'produto',
        itemId: prod.id, itemNome: prod.nome, quantidade: item.quantidade,
        data: dataEstorno, origem: 'estorno_venda', referenciaId: vendaId,
        updatedAt: new Date().toISOString()
      });
    }

    // (B) FINANCEIRO: remover entrada do caixa (se foi à vista)
    if (!isPrazo && lancVenda) {
      // Registrar saída compensatória (estorno financeiro)
      tx.objectStore('financeiro_lancamentos').put({
        id: idGen(), data: dataEstorno, tipo: 'saida',
        valor: lancVenda.valor,
        descricao: `Estorno Venda: ${venda.clienteNome} (Pedido #${vendaId})`,
        formaPagamento: lancVenda.formaPagamento || venda.formaPagamento,
        gaveta: lancVenda.gaveta || venda.gaveta || venda.formaPagamento,
        origem: 'estorno_venda', referenciaId: vendaId,
        updatedAt: new Date().toISOString()
      });
    }

    // (C) CLIENTE: ajustar saldo devedor/crédito
    let novoSaldoDevedor = saldoDevedorAtual;
    let novoSaldoCredito = saldoCreditoAtual;

    if (isPrazo) {
      // Era a prazo: remover o débito gerado
      novoSaldoDevedor = Math.max(0, saldoDevedorAtual - venda.total);
    }

    // Se havia crédito gerado nesta venda, reverter
    if (Number(venda.creditoGerado || 0) > 0) {
      novoSaldoCredito = Math.max(0, saldoCreditoAtual - venda.creditoGerado);
    }

    // Se havia crédito usado nesta venda, devolver ao saldo
    if (Number(venda.creditoUsado || 0) > 0) {
      novoSaldoCredito = novoSaldoCredito + venda.creditoUsado;
    }

    novoSaldoDevedor = Math.max(0, novoSaldoDevedor);
    novoSaldoCredito = Math.max(0, novoSaldoCredito);

    tx.objectStore('limites_credito').put({
      id: venda.clienteId, clienteId: venda.clienteId, clienteNome: venda.clienteNome,
      limite: limiteAtual,
      saldoDevedor: novoSaldoDevedor,
      saldoCredito: novoSaldoCredito,
      updatedAt: new Date().toISOString()
    });

    // (D) VENDA: marcar como Estornado (DRE se ajusta automaticamente)
    tx.objectStore('vendas').put({
      ...venda,
      statusPagamento: 'Estornado',
      saldoDevedor: 0,
      valorRecebido: 0,
      updatedAt: new Date().toISOString()
    });

    await txToPromise(tx);

    // Notificação Telegram
    await registrarEventoAuditoria('ESTORNO','Estorno de venda',`Cliente: ${venda.clienteNome}\nTotal: ${moneyBR(venda.total)}\nPagamento: ${venda.formaPagamento}\nEstoque devolvido | Financeiro ajustado`);

    // Snapshot silencioso
    if (typeof BackupManager !== 'undefined') {
      BackupManager.salvarSnapshot(db, 'estorno_venda').catch(e => console.error('[Snapshot] Erro após estorno:', e));
    }

    alert(`✅ Estorno realizado com sucesso!\n\nCliente: ${venda.clienteNome}\nTotal estornado: ${moneyBR(venda.total)}\n\nEstoque devolvido, financeiro ajustado.`);

    // Refresh de todas as telas afetadas
    await renderPedidosRecentes();
    await renderVendas();
    await atualizarResumoFinanceiro();
    await renderFinanceiro();
    await renderClientesDevedores();
    await renderEstoqueGeral();
    await renderMovimentosEstoque();

  } catch (e) {
    console.error('Erro ao executar estorno:', e);
    alert('Erro ao executar estorno: ' + e.message);
  }
}

/* --- Setup dos event listeners do módulo Estorno --- */
function setupEstornoListeners() {
  // A lista é renderizada ao entrar na tela de Vendas (via setupNavigation)
  // Não há listeners estáticos adicionais além dos dinâmicos em renderPedidosRecentes
}
/* FIM — ESTORNO DE PEDIDOS RECENTES v3.1 */

/* ========================================================
   RESUMO DO MÊS — FOLHA DE PAGAMENTO v3.2
   Módulo 100% somente leitura.
   NÃO gera lançamentos, NÃO altera dados, NÃO modifica stores.
   Lê: funcionarios, folha_pagamento, vale, rh_faltas.
   ======================================================== */

const _MESES_NOMES = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/* --- Popular selects de mês/ano no modal --- */
function _popularFiltrosResumo() {
  const selMes = document.getElementById('resumo-mes-select');
  const selAno = document.getElementById('resumo-ano-select');
  if (!selMes || !selAno) return;

  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1; // 1-12
  const anoAtual = hoje.getFullYear();

  // Meses
  selMes.innerHTML = _MESES_NOMES.slice(1).map((nome, i) => {
    const val = String(i + 1).padStart(2, '0');
    return `<option value="${val}"${(i + 1) === mesAtual ? ' selected' : ''}>${nome}</option>`;
  }).join('');

  // Anos: 3 anos anteriores + atual + próximo
  selAno.innerHTML = '';
  for (let a = anoAtual - 3; a <= anoAtual + 1; a++) {
    selAno.innerHTML += `<option value="${a}"${a === anoAtual ? ' selected' : ''}>${a}</option>`;
  }
}

/* --- Calcular e renderizar o resumo do mês --- */
async function renderResumoMes() {
  const mes = document.getElementById('resumo-mes-select')?.value || String(new Date().getMonth() + 1).padStart(2, '0');
  const ano = document.getElementById('resumo-ano-select')?.value || String(new Date().getFullYear());

  const elGeral = document.getElementById('resumo-mes-geral');
  const elLista = document.getElementById('resumo-mes-lista');
  if (!elGeral || !elLista) return;

  elGeral.innerHTML = '<div class="empty-list">Calculando...</div>';
  elLista.innerHTML = '';

  // Carregar dados (somente leitura)
  const todosFuncionarios = await fetchAllSorted('funcionarios');
  const todosPagamentos = await reqToPromise(getStore('folha_pagamento').getAll());
  const todosVales = await reqToPromise(getStore('vale').getAll());
  const todasFaltas = await reqToPromise(getStore('rh_faltas').getAll());
  /* v3.4.1: carregar licencas */ const todasLicencas = await reqToPromise(getStore('rh_licencas').getAll());

  const prefix = `${ano}-${mes}`;
  const diasNoMes = new Date(Number(ano), Number(mes), 0).getDate();

  // Pagamentos do mês de referência (por mesReferencia + anoReferencia)
  const pagsMes = todosPagamentos.filter(p =>
    String(p.mesReferencia).padStart(2, '0') === mes && String(p.anoReferencia) === ano
  );
  // Pagamentos especiais pertencem ao histórico e ao financeiro, mas não à folha salarial normal.
  const pagamentosNormaisMes = pagsMes.filter(p => !p.tipoEspecial);

  // Vales do mês (por data) — ignorar estornados
  const valesMes = todosVales.filter(v => v.data && v.data.startsWith(prefix) && !v.estornado);

  // Faltas do mês (por data)
  const faltasMes = todasFaltas.filter(f => f.data && f.data.startsWith(prefix));

  // --- Montar dados por funcionário ---
  let totalFuncionarios = 0;
  let totalComPix = 0;
  let totalSemPix = 0;
  let totalFaltaPagar = 0;

  /* v3.4.1: calcular dias de licença no mês para um funcionário */
  function _diasLicencaMesResumo(funcId) {
    const lics = todasLicencas.filter(l => l.funcionarioId === funcId);
    let diasTotais = 0;
    const inicioMes = new Date(`${ano}-${mes}-01`);
    const fimMes = new Date(Number(ano), Number(mes), 0); // último dia do mês
    for (const lic of lics) {
      if (!lic.dataInicio || !lic.dataFim) continue;
      const ini = new Date(lic.dataInicio);
      const fim = new Date(lic.dataFim);
      const sobreIni = ini > inicioMes ? ini : inicioMes;
      const sobreFim = fim < fimMes ? fim : fimMes;
      if (sobreFim >= sobreIni) {
        const diff = Math.round((sobreFim - sobreIni) / 86400000) + 1;
        diasTotais += diff;
      }
    }
    return Math.min(diasTotais, diasNoMes);
  }

  const idsComHistoricoNoPeriodo = new Set();
  pagsMes.forEach(p => idsComHistoricoNoPeriodo.add(String(p.funcionarioId)));
  valesMes.forEach(v => idsComHistoricoNoPeriodo.add(String(v.funcionarioId)));
  faltasMes.forEach(f => idsComHistoricoNoPeriodo.add(String(f.funcionarioId)));
  todasLicencas.forEach(l => { if (_diasLicencaMesResumo(l.funcionarioId) > 0) idsComHistoricoNoPeriodo.add(String(l.funcionarioId)); });
  const periodoResumo = `${ano}-${mes}`;
  const agoraResumo = new Date();
  const periodoAtual = `${agoraResumo.getFullYear()}-${String(agoraResumo.getMonth() + 1).padStart(2, '0')}`;
  const resumoHistorico = periodoResumo < periodoAtual;
  const funcionarios = todosFuncionarios.filter(func => funcionarioEstaAtivo(func) || (resumoHistorico && idsComHistoricoNoPeriodo.has(String(func.id))));

  const linhas = funcionarios.map(func => {
    totalFuncionarios++;

    const salarioBase = Number(func.salarioBase || 0);
    const chavePix = (func.chavePix || '').trim();
    if (chavePix) totalComPix++; else totalSemPix++;

    // Vales do mês para este funcionário
    const valesFunc = valesMes
      .filter(v => v.funcionarioId === func.id)
      .reduce((s, v) => s + Number(v.valor || 0), 0);

    // Faltas do mês para este funcionário
    const qtdFaltas = faltasMes.filter(f => f.funcionarioId === func.id).length;
    const descontoFaltas = calcularDescontoFaltas(salarioBase, qtdFaltas);

    // v3.4.1: Licença do mês para este funcionário
    const diasLicenca = _diasLicencaMesResumo(func.id);
    const descontoLicenca = calcularDescontoLicenca(salarioBase, diasLicenca);
    const licencaIntegral = diasLicenca >= diasNoMes;

    // Pagamentos já realizados no mês de referência
    const recebido = pagamentosNormaisMes
      .filter(p => p.funcionarioId === func.id)
      .reduce((s, p) => s + Number(p.totalLiquido || 0), 0);

    // Falta pagar = Salário - Vales - Faltas - Licença - Recebido (0 se licença integral)
    const liquidoReal = licencaIntegral ? 0 : Math.max(0, salarioBase - valesFunc - descontoFaltas - descontoLicenca);
    const falta = Math.max(0, liquidoReal - recebido);
    if (!licencaIntegral) totalFaltaPagar += falta;

    return { func, salarioBase, valesFunc, qtdFaltas, descontoFaltas, diasLicenca, descontoLicenca, licencaIntegral, recebido, falta, chavePix };
  });

  // --- Resumo Geral ---
  elGeral.innerHTML = `
    <div class="resumo-mes-stat">
      <span class="resumo-mes-stat-label">Funcionários</span>
      <span class="resumo-mes-stat-value">${totalFuncionarios}</span>
    </div>
    <div class="resumo-mes-stat">
      <span class="resumo-mes-stat-label">Com Pix</span>
      <span class="resumo-mes-stat-value" style="color:#1d4ed8;">${totalComPix}</span>
    </div>
    <div class="resumo-mes-stat">
      <span class="resumo-mes-stat-label">Sem Pix</span>
      <span class="resumo-mes-stat-value" style="color:#6b7280;">${totalSemPix}</span>
    </div>
    <div class="resumo-mes-stat" style="border-color:#fca5a5;background:#fef2f2;">
      <span class="resumo-mes-stat-label">Total a Pagar</span>
      <span class="resumo-mes-stat-value" style="color:#b91c1c;">${moneyBR(totalFaltaPagar)}</span>
    </div>
  `;

  // --- Lista de Funcionários ---
  if (!linhas.length) {
    elLista.innerHTML = '<div class="empty-list">Nenhum funcionário cadastrado.</div>';
    return;
  }

  elLista.innerHTML = linhas.map(({ func, salarioBase, valesFunc, qtdFaltas, descontoFaltas, diasLicenca, descontoLicenca, licencaIntegral, recebido, falta, chavePix }) => {
    /* v3.4.1: status correto considerando licença */
    const isPago = falta === 0;
    const itemClass = licencaIntegral ? 'falta-zero' : (isPago ? 'falta-zero' : 'falta-pendente');
    const faltaClass = licencaIntegral ? 'pago' : (isPago ? 'pago' : 'pendente');
    const faltaLabel = licencaIntegral
      ? `📅 Em licença no mês — R$ 0,00`
      : (isPago ? '✅ Pago' : `❌ Falta: ${moneyBR(falta)}`);
    const pixLabel = chavePix
      ? `<strong>${esc(chavePix)}</strong>`
      : '<span style="color:#9ca3af;">não cadastrado</span>';

    const faltasInfo = qtdFaltas > 0
      ? `<span class="resumo-func-campo">Faltas: <strong>${qtdFaltas}</strong> (−${moneyBR(descontoFaltas)})</span>`
      : '';
    const licencaInfo = diasLicenca > 0
      ? `<span class="resumo-func-campo" style="color:#7e22ce;">Licença: <strong>${diasLicenca}d</strong> (−${moneyBR(descontoLicenca)})</span>`
      : '';

    return `
      <div class="resumo-func-item ${itemClass}">
        <div class="resumo-func-linha">
          <span class="resumo-func-nome">${esc(func.nome)}</span>
          <span class="resumo-func-campo">Salário: <strong>${moneyBR(salarioBase)}</strong></span>
          <span class="resumo-func-campo">Vales: <strong>${moneyBR(valesFunc)}</strong></span>
          ${faltasInfo}
          ${licencaInfo}
          <span class="resumo-func-campo">Recebido: <strong>${moneyBR(recebido)}</strong></span>
          <span class="resumo-func-falta-valor ${faltaClass}">${faltaLabel}</span>
        </div>
        <div class="resumo-func-pix">PIX: ${pixLabel}</div>
      </div>
    `;
  }).join('');
}

/* --- Abrir o modal Resumo do Mês --- */
async function abrirResumoMes() {
  const modal = document.getElementById('modal-resumo-mes');
  if (!modal) return;
  _popularFiltrosResumo();
  modal.classList.remove('hidden');
  await renderResumoMes();
}

/* --- Fechar o modal --- */
function fecharResumoMes() {
  const modal = document.getElementById('modal-resumo-mes');
  if (modal) modal.classList.add('hidden');
}

/* --- Setup dos event listeners do módulo Resumo do Mês --- */
function setupResumoMesListeners() {
  const btnAbrir = document.getElementById('btn-resumo-mes-folha');
  if (btnAbrir) btnAbrir.addEventListener('click', abrirResumoMes);

  const btnFechar = document.getElementById('btn-fechar-resumo-mes');
  if (btnFechar) btnFechar.addEventListener('click', fecharResumoMes);

  const btnFiltrar = document.getElementById('btn-resumo-filtrar');
  if (btnFiltrar) btnFiltrar.addEventListener('click', renderResumoMes);

  // Fechar ao clicar fora do box
  const overlay = document.getElementById('modal-resumo-mes');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) fecharResumoMes();
    });
  }
}
/* FIM — RESUMO DO MÊS v3.2 */

/* ========================================================
   ESTORNO DE VALES — v3.3
   Módulo cirúrgico e isolado.
   NÃO altera lógica existente de vales, folha ou DRE.
   Impacto: vale marcado como estornado + entrada no financeiro.
   ======================================================== */

/* --- Renderizar a lista de Últimos Vales com botão Estornar --- */
async function renderUltimosVales() {
  const lista = document.getElementById('ultimos-vales-lista');
  if (!lista) return;

  // Carregar todos os vales ordenados por data (mais recente primeiro)
  const todosVales = await fetchAllSorted('vale', 'data', true);

  // Exibir apenas os últimos 10
  const ultimos = todosVales.slice(0, 10);

  if (!ultimos.length) {
    lista.innerHTML = '<div class="empty-list">Nenhum vale registrado.</div>';
    return;
  }

  // Carregar lançamentos financeiros para cruzar gaveta de origem
  const todosLancamentos = await reqToPromise(getStore('financeiro_lancamentos').getAll());

  lista.innerHTML = ultimos.map(v => {
    const isEstornado = !!v.estornado;
    const isLiquidado = !!v.liquidado && !isEstornado;

    // Tentar recuperar gaveta do lançamento financeiro correspondente
    // Critério: origem='vale', data igual, valor igual, descricao contém o nome
    const lancamento = todosLancamentos.find(l =>
      l.origem === 'vale' &&
      l.data === v.data &&
      Number(l.valor) === Number(v.valor) &&
      (l.descricao || '').includes(v.funcionarioNome)
    );
    const gaveta = lancamento ? (lancamento.gaveta || lancamento.formaPagamento || '') : '';

    let itemClass = 'vale-pendente';
    let badgeClass = 'badge-vale-pendente';
    let badgeLabel = 'Pendente';
    if (isEstornado) { itemClass = 'vale-estornado'; badgeClass = 'badge-vale-estornado'; badgeLabel = '↩ Estornado'; }
    else if (isLiquidado) { itemClass = 'vale-liquidado'; badgeClass = 'badge-vale-liquidado'; badgeLabel = 'Liquidado'; }

    const gavetaInfo = gaveta ? `<span>Gaveta: <strong>${esc(gaveta)}</strong></span>` : '<span style="color:#ef4444;">Gaveta não identificada</span>';

    // Botão de estorno — condições
    let btnHtml = '';
    if (isEstornado) {
      btnHtml = `<span style="font-size:0.8rem;color:#9ca3af;font-weight:700;">↩ Já estornado</span>`;
    } else if (isLiquidado) {
      btnHtml = `<button class="btn-estornar-vale" disabled style="opacity:0.5;cursor:not-allowed;" title="Vale já liquidado na folha">🔒 Liquidado</button>`;
    } else if (!gaveta) {
      // Sem gaveta identificada: mostrar botão com seletor de gaveta embutido
      btnHtml = `
        <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;">
          <select class="vale-gaveta-manual" data-id="${v.id}" style="border:1px solid #d1d5db;border-radius:10px;padding:6px 10px;font-size:0.83rem;">
            <option value="">Selecione a gaveta</option>
            <option value="Dinheiro">Dinheiro</option>
            <option value="Pix">Pix</option>
            <option value="Tesoureiro">Tesoureiro</option>
          </select>
          <button class="btn-estornar-vale js-estornar-vale" data-id="${v.id}" data-nome="${esc(v.funcionarioNome)}" data-valor="${v.valor}" data-gaveta="" type="button">↩ Estornar</button>
        </div>`;
    } else {
      btnHtml = `<button class="btn-estornar-vale js-estornar-vale" data-id="${v.id}" data-nome="${esc(v.funcionarioNome)}" data-valor="${v.valor}" data-gaveta="${esc(gaveta)}" type="button">↩ Estornar</button>`;
    }

    return `
      <div class="vale-recente-item ${itemClass}" data-id="${v.id}">
        <div class="vale-recente-info">
          <div class="vale-recente-nome">${esc(v.funcionarioNome)}</div>
          <div class="vale-recente-meta">
            <span>Data: <strong>${formatDateBR(v.data)}</strong></span>
            <span>Valor: <strong>${moneyBR(v.valor)}</strong></span>
            ${gavetaInfo}
          </div>
          <span class="vale-recente-badge ${badgeClass}">${badgeLabel}</span>
          ${isEstornado && v.estornadoEm ? `<div style="font-size:0.78rem;color:#9ca3af;margin-top:3px;">Estornado em: ${v.estornadoEm}</div>` : ''}
        </div>
        <div class="vale-recente-acoes">${btnHtml}</div>
      </div>`;
  }).join('');

  // Vincular event listeners nos botões de estorno
  lista.querySelectorAll('.js-estornar-vale').forEach(btn => {
    btn.addEventListener('click', async () => {
      // CORREÇÃO v3.3.1: idGen() retorna Number — converter dataset.id (String) para Number
      const id = Number(btn.dataset.id);
      const nome = btn.dataset.nome;
      const valor = Number(btn.dataset.valor || 0);
      let gaveta = btn.dataset.gaveta;

      // Se gaveta não identificada, ler do seletor manual
      if (!gaveta) {
        const seletor = btn.closest('.vale-recente-item')?.querySelector('.vale-gaveta-manual');
        gaveta = seletor ? seletor.value : '';
        if (!gaveta) {
          alert('⚠️ Selecione a gaveta de origem antes de estornar.');
          return;
        }
      }

      // Confirmar operação
      const ok = confirm(
        `Deseja realmente estornar este vale?\n\n` +
        `Funcionário: ${nome}\n` +
        `Valor: ${moneyBR(valor)}\n` +
        `Gaveta: ${gaveta}\n\n` +
        `O valor será devolvido para a gaveta de origem e deixará de aparecer como desconto na folha.`
      );
      if (!ok) return;

      // Recarregar o vale para verificar estado atual (segurança anti-duplo)
      // id já é Number — compatível com keyPath numérico do IndexedDB
      const valeAtual = await reqToPromise(getStore('vale').get(id));
      if (!valeAtual) { alert('Vale não encontrado.'); return; }
      if (valeAtual.estornado) { alert('Este vale já foi estornado anteriormente.'); await renderUltimosVales(); return; }
      if (valeAtual.liquidado) {
        alert('Este vale já foi liquidado na folha. Para corrigir, será necessário ajustar a folha correspondente.');
        return;
      }

      const agora = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const dataHoje = new Date().toISOString().slice(0, 10);

      // Transação: marcar vale como estornado + gerar entrada no financeiro
      const tx = db.transaction(['vale', 'financeiro_lancamentos'], 'readwrite');
      tx.objectStore('vale').put({
        ...valeAtual,
        estornado: true,
        estornadoEm: agora,
        updatedAt: new Date().toISOString()
      });
      tx.objectStore('financeiro_lancamentos').put({
        id: idGen(),
        data: dataHoje,
        tipo: 'entrada',
        valor,
        descricao: `Estorno Vale: ${nome}`,
        formaPagamento: gaveta,
        gaveta,
        origem: 'estorno_vale',
        updatedAt: new Date().toISOString()
      });
      await txToPromise(tx);

      // Notificação Telegram
      await registrarEventoAuditoria('ESTORNO','Estorno de vale',`Funcionário: ${nome}\nValor: ${moneyBR(valor)}\nGaveta: ${gaveta}\nData: ${agora}`);

      // Atualizar telas afetadas
      await renderUltimosVales();
      await renderVales();
      await atualizarResumoFinanceiro();
      await renderFinanceiro();

      alert(`✅ Vale estornado com sucesso!\n\nFuncionário: ${nome}\nValor devolvido para: ${gaveta}`);
    });
  });
}

/* --- Setup dos event listeners do módulo Estorno de Vales --- */
function setupEstornoValesListeners() {
  // A lista é renderizada ao entrar no módulo de Vales (via btn-gp-vales)
  // Não precisa de listener adicional — renderUltimosVales() é chamada no btn-gp-vales
}
/* FIM — ESTORNO DE VALES v3.3 */

/* ========== RELATÓRIO DE RECEBIMENTOS POR CLIENTE v3.6.2 ========== */
async function carregarRelRecebClienteSelect(){
  const sel=document.getElementById('rel-receb-cliente-select'); if(!sel) return;
  const clientes=await fetchAllSorted('clientes');
  sel.innerHTML='<option value="">Selecione</option>';
  clientes.forEach((c)=>{ const o=document.createElement('option'); o.value=String(c.id); o.textContent=c.nome; sel.appendChild(o); });
}

async function gerarRelatorioRecebimentosCliente(){
  const sel=document.getElementById('rel-receb-cliente-select');
  const dataIni=document.getElementById('rel-receb-data-ini').value;
  const dataFim=document.getElementById('rel-receb-data-fim').value;
  const resultado=document.getElementById('rel-receb-resultado');
  if(!sel||!resultado) return;
  const clienteId=Number(sel.value);
  if(!clienteId){ resultado.innerHTML='<div class="empty-list">Selecione um cliente para gerar o relatório.</div>'; return; }
  const clienteNome=sel.options[sel.selectedIndex].textContent;

  /* Buscar todos os lançamentos financeiros com origem recebimento */
  const lancamentos=await reqToPromise(getStore('financeiro_lancamentos').getAll());
  const recebimentos=lancamentos.filter((l)=>{
    if(l.origem!=='recebimento') return false;
    /* Verificar se pertence ao cliente selecionado */
    const desc=l.descricao||'';
    const nomeNoDesc=desc.replace(/^Recebimento \((Dinheiro|Pix)\):\s*/,'').trim();
    if(nomeNoDesc.toLowerCase()!==clienteNome.toLowerCase()) return false;
    /* Filtro de data */
    const dataLanc=l.data||'';
    if(dataIni && dataLanc<dataIni) return false;
    if(dataFim && dataLanc>dataFim) return false;
    return true;
  });

  if(!recebimentos.length){
    resultado.innerHTML='<div class="empty-list">Nenhum recebimento encontrado para este cliente no período selecionado.</div>';
    return;
  }

  /* Ordenar por data */
  recebimentos.sort((a,b)=>(a.data||'').localeCompare(b.data||''));

  /* Agrupar por data para exibição */
  const porData={};
  recebimentos.forEach((r)=>{
    const d=r.data||'sem-data';
    if(!porData[d]) porData[d]={dinheiro:0,pix:0,itens:[]};
    const forma=(r.formaPagamento||r.gaveta||'').toLowerCase();
    if(forma.includes('pix')){
      porData[d].pix+=Number(r.valor||0);
    } else {
      porData[d].dinheiro+=Number(r.valor||0);
    }
    porData[d].itens.push(r);
  });

  let totalDinheiro=0, totalPix=0;
  let html='<div style="padding:12px 0;">';
  html+=`<h4 style="margin:0 0 12px 0;">Cliente: <strong>${clienteNome}</strong></h4>`;
  html+='<div style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">';
  html+='<table style="width:100%;border-collapse:collapse;font-size:0.9rem;">';
  html+='<thead><tr style="background:#f3f4f6;"><th style="padding:10px 8px;text-align:left;">Data</th><th style="padding:10px 8px;text-align:right;">Dinheiro</th><th style="padding:10px 8px;text-align:right;">Pix</th><th style="padding:10px 8px;text-align:right;">Total</th></tr></thead><tbody>';

  Object.keys(porData).sort().forEach((data)=>{
    const g=porData[data];
    const totalDia=g.dinheiro+g.pix;
    totalDinheiro+=g.dinheiro;
    totalPix+=g.pix;
    html+=`<tr style="border-top:1px solid #e5e7eb;"><td style="padding:8px;">${formatDateBR(data)}</td><td style="padding:8px;text-align:right;">${moneyBR(g.dinheiro)}</td><td style="padding:8px;text-align:right;">${moneyBR(g.pix)}</td><td style="padding:8px;text-align:right;font-weight:bold;">${moneyBR(totalDia)}</td></tr>`;
  });

  const totalGeral=totalDinheiro+totalPix;
  html+='</tbody></table></div>';
  html+=`<div style="margin-top:16px;padding:14px;background:#d1fae5;border-radius:12px;font-size:0.95rem;">`;
  html+=`<strong>Totalizadores:</strong><br>`;
  html+=`💵 Dinheiro: <strong>${moneyBR(totalDinheiro)}</strong><br>`;
  html+=`📱 Pix: <strong>${moneyBR(totalPix)}</strong><br>`;
  html+=`✅ Total recebido no período: <strong style="font-size:1.1em;">${moneyBR(totalGeral)}</strong>`;
  html+=`</div></div>`;

  resultado.innerHTML=html;
}
/* FIM — RELATÓRIO DE RECEBIMENTOS POR CLIENTE v3.6.2 */
