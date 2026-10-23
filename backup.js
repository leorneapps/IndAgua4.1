/* ================================================================
   backup.js — IndAguaLirios v3.6 — Segurança Total (Nível Industrial)
   Sistema de Snapshots Automáticos (Caixa Preta) + Backup Completo
   + Envio JSON Telegram

   REGRA CENTRAL:
   Toda exportação de dados usa _collectAllData() com varredura
   dinâmica via db.objectStoreNames — NUNCA lista manual.
   ================================================================ */

/**
 * BackupManager — módulo responsável por:
 *  1. Salvar snapshots silenciosos do banco após eventos críticos
 *  2. Rotacionar snapshots mantendo apenas os últimos 10 dias
 *  3. Gerar JSON completo do banco (backup total) para download manual
 *  4. Enviar o JSON completo via Telegram no fechamento de caixa
 *
 *  Ponto de entrada único para exportação: BackupManager.exportarBackupCompleto(db)
 */
const BackupManager = (function () {
  'use strict';

  const SNAPSHOT_STORE  = 'backup_snapshots';
  const VERSAO_SISTEMA  = '3.6';
  const MAX_DAYS        = 10;

  /* ---------- helpers ---------- */

  /** Retorna a data de hoje no formato YYYY-MM-DD */
  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  /** Converte IDBRequest em Promise */
  function _req(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror   = function () { reject(request.error); };
    });
  }

  /** Converte IDBTransaction em Promise */
  function _tx(transaction) {
    return new Promise(function (resolve, reject) {
      transaction.oncomplete = function () { resolve(); };
      transaction.onerror    = function () { reject(transaction.error); };
      transaction.onabort    = function () { reject(transaction.error || new Error('Transação abortada.')); };
    });
  }

  /* ---------- core: coleta dinâmica ---------- */

  /**
   * Coleta TODOS os dados do IndexedDB de forma 100% dinâmica.
   * Percorre db.objectStoreNames — inclui automaticamente qualquer
   * store presente no banco, inclusive stores adicionadas no futuro.
   *
   * @param {IDBDatabase} database
   * @param {Array<string>} [excludeStores] — stores a excluir da coleta
   * @returns {Promise<Object>} — { storeName: [...registros], ... }
   */
  async function _collectAllData(database, excludeStores) {
    var skip = excludeStores || [];
    var allStores = Array.from(database.objectStoreNames);
    var payload = {};
    for (var i = 0; i < allStores.length; i++) {
      var storeName = allStores[i];
      if (skip.indexOf(storeName) !== -1) continue;
      try {
        var tx = database.transaction(storeName, 'readonly');
        var items = await _req(tx.objectStore(storeName).getAll());
        payload[storeName] = items;
      } catch (e) {
        console.warn('[BackupManager] Erro ao ler store "' + storeName + '":', e.message);
        payload[storeName] = [];
      }
    }
    return payload;
  }

  /**
   * Gera o objeto de backup completo com metadata.
   * Esta é a ÚNICA função que monta o payload de exportação.
   * Usada por: download manual, Telegram, snapshots.
   *
   * @param {IDBDatabase} database
   * @param {string} [origem] — 'manual' | 'fechamento_caixa' | 'snapshot'
   * @returns {Promise<Object>} — objeto completo pronto para JSON.stringify
   */
  async function _montarPayloadCompleto(database, origem) {
    /* Excluir backup_snapshots para evitar payload recursivo/enorme */
    var dados = await _collectAllData(database, [SNAPSHOT_STORE]);

    /* Calcular totais para metadata */
    var storeNames = Object.keys(dados);
    var totalRegistros = storeNames.reduce(function (acc, s) {
      return acc + (Array.isArray(dados[s]) ? dados[s].length : 0);
    }, 0);

    var metadata = {
      sistema:        'IndAguaLirios',
      versao:         VERSAO_SISTEMA,
      geradoEm:       new Date().toISOString(),
      origem:         origem || 'manual',
      totalStores:    storeNames.length,
      totalRegistros: totalRegistros
    };

    /* Log de validação no console */
    console.log('[BackupManager] ===== BACKUP COMPLETO =====');
    console.log('[BackupManager] Versão:', VERSAO_SISTEMA, '| Origem:', origem);
    console.log('[BackupManager] Stores exportadas (' + storeNames.length + '):');
    storeNames.forEach(function (s) {
      var qtd = Array.isArray(dados[s]) ? dados[s].length : 0;
      console.log('  ' + s + ': ' + qtd + ' registro(s)');
    });
    console.log('[BackupManager] Total de registros:', totalRegistros);
    console.log('[BackupManager] ===========================');

    return {
      metadata: metadata,
      dados:    dados
    };
  }

  /* ---------- API: snapshot silencioso (caixa preta) ---------- */

  /**
   * Salva um snapshot silencioso.
   * Agrupa por dia — se já existe snapshot do dia, sobrescreve.
   * Aplica rotação: mantém apenas os últimos MAX_DAYS dias.
   *
   * @param {IDBDatabase} database
   * @param {string} evento — descrição do evento que disparou o snapshot
   */
  async function salvarSnapshot(database, evento) {
    try {
      if (!database || !database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        console.warn('[BackupManager] Store backup_snapshots não encontrada. Snapshot ignorado.');
        return;
      }

      var dados = await _collectAllData(database, [SNAPSHOT_STORE]);
      var dia   = todayKey();
      var agora = new Date().toISOString();

      var snapshot = {
        id:       dia,
        data:     dia,
        evento:   evento,
        criadoEm: agora,
        payload:  dados
      };

      var txWrite = database.transaction(SNAPSHOT_STORE, 'readwrite');
      txWrite.objectStore(SNAPSHOT_STORE).put(snapshot);
      await _tx(txWrite);

      await _rotacionar(database);

      console.log('[BackupManager] Snapshot salvo:', dia, '| Evento:', evento);
    } catch (err) {
      console.error('[BackupManager] Erro ao salvar snapshot:', err);
    }
  }

  /**
   * Remove snapshots mais antigos que MAX_DAYS dias.
   */
  async function _rotacionar(database) {
    try {
      var txRead = database.transaction(SNAPSHOT_STORE, 'readonly');
      var todos  = await _req(txRead.objectStore(SNAPSHOT_STORE).getAll());

      if (todos.length <= MAX_DAYS) return;

      todos.sort(function (a, b) { return a.data.localeCompare(b.data); });
      var excedentes = todos.slice(0, todos.length - MAX_DAYS);

      var txDel = database.transaction(SNAPSHOT_STORE, 'readwrite');
      var store = txDel.objectStore(SNAPSHOT_STORE);
      for (var i = 0; i < excedentes.length; i++) {
        store.delete(excedentes[i].id);
      }
      await _tx(txDel);

      console.log('[BackupManager] Rotação: removidos', excedentes.length, 'snapshot(s) antigo(s).');
    } catch (err) {
      console.error('[BackupManager] Erro na rotação:', err);
    }
  }

  /* ---------- API: exportação completa (download manual) ---------- */

  /**
   * Gera o JSON completo e dispara o download no navegador.
   * Chamado pelo botão "Exportar Backup" na interface.
   *
   * @param {IDBDatabase} database
   * @returns {Promise<{storeNames: string[], totalRegistros: number}>}
   *   Retorna resumo para exibição no alerta de confirmação.
   */
  async function exportarBackupCompleto(database) {
    var payload   = await _montarPayloadCompleto(database, 'manual');
    var jsonStr   = JSON.stringify(payload, null, 2);
    var blob      = new Blob([jsonStr], { type: 'application/json' });
    var filename  = _buildFilename();

    var url  = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    return {
      storeNames:     Object.keys(payload.dados),
      totalRegistros: payload.metadata.totalRegistros
    };
  }

  /* ---------- API: restauração completa ---------- */

  /**
   * Restaura um backup JSON no banco atual.
   * Itera sobre TODAS as stores presentes no JSON.
   * Se a store existir no IndexedDB atual: limpa e restaura.
   * Se não existir: avisa no console (não causa erro).
   *
   * @param {IDBDatabase} database
   * @param {Object} backupObj — objeto já parseado do JSON
   * @returns {Promise<{restauradas: string[], ignoradas: string[]}>}
   */
  async function restaurarBackupCompleto(database, backupObj) {
    /* Suporte a formato legado (sem wrapper metadata/dados) */
    var dados = backupObj.dados || backupObj;

    var storesNoJSON     = Object.keys(dados).filter(function (k) { return k !== '_meta'; });
    var storesNoBanco    = Array.from(database.objectStoreNames);
    var restauradas      = [];
    var ignoradas        = [];

    for (var i = 0; i < storesNoJSON.length; i++) {
      var storeName = storesNoJSON[i];

      if (storesNoBanco.indexOf(storeName) === -1) {
        console.warn('[BackupManager] Store "' + storeName + '" não existe no banco atual. Ignorada.');
        ignoradas.push(storeName);
        continue;
      }

      try {
        var registros = Array.isArray(dados[storeName]) ? dados[storeName] : [];
        var tx    = database.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        store.clear();
        for (var j = 0; j < registros.length; j++) {
          store.put(registros[j]);
        }
        await _tx(tx);
        restauradas.push(storeName + ' (' + registros.length + ')');
      } catch (e) {
        console.error('[BackupManager] Erro ao restaurar store "' + storeName + '":', e.message);
        ignoradas.push(storeName + ' [ERRO: ' + e.message + ']');
      }
    }

    console.log('[BackupManager] ===== RESTAURAÇÃO CONCLUÍDA =====');
    console.log('[BackupManager] Stores restauradas:', restauradas.length);
    restauradas.forEach(function (s) { console.log('  ✅ ' + s); });
    if (ignoradas.length) {
      console.warn('[BackupManager] Stores ignoradas/com erro:', ignoradas.length);
      ignoradas.forEach(function (s) { console.warn('  ⚠️ ' + s); });
    }
    console.log('[BackupManager] ===================================');

    return { restauradas: restauradas, ignoradas: ignoradas };
  }

  /* ---------- API: Telegram ---------- */

  /**
   * Gera o Blob JSON completo para envio via Telegram.
   * Usa _montarPayloadCompleto — mesma função do backup manual.
   *
   * @param {IDBDatabase} database
   * @returns {Promise<Blob>}
   */
  async function gerarJSONCompleto(database) {
    var payload = await _montarPayloadCompleto(database, 'fechamento_caixa');
    var jsonStr = JSON.stringify(payload, null, 2);
    return new Blob([jsonStr], { type: 'application/json' });
  }

  /**
   * Envia o arquivo JSON completo como documento via Telegram Bot API.
   * Faz envio duplo independente para chatId1 (Fábrica) e chatId2 (Pessoal).
   *
   * @param {IDBDatabase} database
   * @param {string} token
   * @param {string} chatId1
   * @param {string} chatId2
   */
  async function enviarJSONTelegram(database, token, chatId1, chatId2) {
    try {
      if (!token) {
        console.log('[BackupManager] Token Telegram não configurado. Envio de JSON cancelado.');
        return;
      }
      if (!chatId1 && !chatId2) {
        console.log('[BackupManager] Nenhum ChatID configurado. Envio de JSON cancelado.');
        return;
      }

      var blob     = await gerarJSONCompleto(database);
      var hoje     = todayKey();
      var filename = _buildFilename();
      var caption  = '🔒 Backup completo — Fechamento ' + hoje + ' — IndAguaLirios v' + VERSAO_SISTEMA;

      var envios = [];
      if (chatId1) envios.push(_enviarDocumento(token, chatId1, blob, filename, caption));
      if (chatId2) envios.push(_enviarDocumento(token, chatId2, blob, filename, caption));

      await Promise.allSettled(envios);
      console.log('[BackupManager] Envio de JSON via Telegram concluído.');
    } catch (err) {
      console.error('[BackupManager] Erro ao enviar JSON via Telegram:', err);
    }
  }

  /**
   * Monta o nome do arquivo de backup com carimbo de data e hora local.
   * Formato: backup_agualirios_YYYY-MM-DD_HHhMM.json
   */
  function _buildFilename() {
    var now = new Date();
    var yyyy = now.getFullYear();
    var mm   = String(now.getMonth() + 1).padStart(2, '0');
    var dd   = String(now.getDate()).padStart(2, '0');
    var hh   = String(now.getHours()).padStart(2, '0');
    var min  = String(now.getMinutes()).padStart(2, '0');
    return 'backup_agualirios_' + yyyy + '-' + mm + '-' + dd + '_' + hh + 'h' + min + '.json';
  }

  /**
   * Envia um documento para um chat específico via Telegram Bot API sendDocument.
   */
  async function _enviarDocumento(token, chatId, blob, filename, caption) {
    try {
      var formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('document', blob, filename);
      formData.append('caption', caption);

      var url  = 'https://api.telegram.org/bot' + token + '/sendDocument';
      var resp = await fetch(url, { method: 'POST', body: formData });

      if (resp.ok) {
        console.log('[BackupManager] Documento enviado para chat', chatId);
      } else {
        var errBody = await resp.text().catch(function () { return ''; });
        console.warn('[BackupManager] Erro HTTP ao enviar documento para', chatId, ':', resp.status, errBody);
      }
    } catch (e) {
      console.error('[BackupManager] Exceção ao enviar documento para', chatId, ':', e.message);
    }
  }

  /* ---------- API pública ---------- */
  return {
    /* Exportação completa (download manual) */
    exportarBackupCompleto:  exportarBackupCompleto,
    /* Restauração completa */
    restaurarBackupCompleto: restaurarBackupCompleto,
    /* Snapshot silencioso (caixa preta) */
    salvarSnapshot:          salvarSnapshot,
    /* Telegram */
    gerarJSONCompleto:       gerarJSONCompleto,
    enviarJSONTelegram:      enviarJSONTelegram,
    /* Constante pública */
    SNAPSHOT_STORE:          SNAPSHOT_STORE
  };

})();
