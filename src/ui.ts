// The homepage UI as a plain template string, not a static file — this way
// `tsc` ships it inside dist/ui.js like any other source module, with no
// separate static-asset copy step for Railway's build to get right.
export const homepageHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AutoMode AI</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0b0d12;
    --panel: #12151c;
    --panel-2: #171b24;
    --border: #262b36;
    --text: #e7e9ee;
    --muted: #8a93a6;
    --accent: #4169e1;
    --accent-text: #f5f8ff;
    --accent-2: #7c9eff;
    --danger: #fb7185;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
    padding: 0 0 4rem;
  }
  header {
    padding: 2.5rem 1.5rem 1.5rem;
    max-width: 880px;
    margin: 0 auto;
  }
  header h1 { margin: 0 0 0.25rem; font-size: 1.6rem; letter-spacing: -0.02em; }
  header p { margin: 0; color: var(--muted); }
  main { max-width: 880px; margin: 0 auto; padding: 0 1.5rem; display: grid; gap: 1.25rem; }
  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem;
  }
  label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 0.35rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
  select, textarea, input[type="password"] {
    width: 100%;
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 8px;
    padding: 0.65rem 0.75rem;
    font: inherit;
  }
  textarea { min-height: 110px; resize: vertical; }
  .field { margin-bottom: 1rem; }
  .field:last-child { margin-bottom: 0; }
  .row { display: flex; align-items: center; gap: 0.5rem; }
  .swarm-desc { color: var(--muted); font-size: 0.85rem; margin-top: 0.35rem; min-height: 1.2em; }
  button {
    background: var(--accent);
    color: var(--accent-text);
    border: none;
    border-radius: 8px;
    padding: 0.7rem 1.2rem;
    font-weight: 700;
    cursor: pointer;
    font-size: 0.95rem;
  }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.secondary {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    font-weight: 500;
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
  }
  .status-line { display: flex; align-items: center; gap: 0.6rem; color: var(--muted); font-size: 0.9rem; }
  .spinner {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid var(--border); border-top-color: var(--accent-2);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .error { color: var(--danger); font-size: 0.9rem; white-space: pre-wrap; }
  .meta { display: flex; flex-wrap: wrap; gap: 1.25rem; font-size: 0.82rem; color: var(--muted); margin-bottom: 0.75rem; }
  .meta strong { color: var(--text); }
  .agents { display: grid; gap: 0.5rem; margin-bottom: 1rem; }
  .agent-row {
    display: flex; justify-content: space-between; gap: 1rem;
    background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px;
    padding: 0.5rem 0.75rem; font-size: 0.82rem; color: var(--muted);
  }
  .agent-row strong { color: var(--text); font-weight: 600; }
  .output-header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
  .output-header .swarm-desc { margin: 0; }
  .output {
    background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px;
    padding: 1rem 1.25rem; overflow-x: auto;
  }
  .output h2 { font-size: 1.05rem; margin: 1.4rem 0 0.5rem; }
  .output h2:first-child { margin-top: 0; }
  .output h3 { font-size: 0.95rem; margin: 1.1rem 0 0.4rem; color: var(--accent-2); }
  .output p { margin: 0.5rem 0; }
  .output ul, .output ol { margin: 0.5rem 0; padding-left: 1.4rem; }
  .output li { margin: 0.2rem 0; }
  .output hr { border: none; border-top: 1px solid var(--border); margin: 1.1rem 0; }
  .output code { background: #0e1117; padding: 0.1em 0.4em; border-radius: 4px; font-size: 0.88em; }
  .output table { border-collapse: collapse; width: 100%; margin: 0.6rem 0; font-size: 0.85rem; }
  .output th, .output td { border: 1px solid var(--border); padding: 0.4rem 0.6rem; text-align: left; }
  .output th { background: var(--panel); }
  .hint { color: var(--muted); font-size: 0.78rem; }
  a { color: var(--accent-2); }
  .copy-key { font-size: 0.78rem; color: var(--muted); cursor: pointer; text-decoration: underline; background: none; border: none; padding: 0; }
</style>
</head>
<body>
<header>
  <h1>AutoMode AI</h1>
  <p>Switch your business to AutoMODE — and let AI handle the rest.</p>
</header>
<main>
  <section class="panel">
    <div class="field">
      <label for="apiKey">Your Anthropic API key</label>
      <input type="password" id="apiKey" placeholder="sk-ant-...">
      <p class="hint">Bring your own key from <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> — it's sent only with your own requests, used only for your own runs, and stored only in this browser (localStorage), never on our servers. <button class="copy-key" id="forgetKey" type="button">Forget key</button></p>
    </div>
    <div class="field">
      <label for="swarmSelect">Swarm</label>
      <select id="swarmSelect"></select>
      <p class="swarm-desc" id="swarmDesc"></p>
    </div>
    <div class="field">
      <label for="promptInput">Prompt</label>
      <textarea id="promptInput" placeholder="Describe what you want this swarm to do..."></textarea>
    </div>
    <div class="row">
      <button id="runButton" type="button">Run swarm</button>
      <span class="status-line" id="statusLine" hidden><span class="spinner"></span><span id="statusText"></span></span>
    </div>
    <p class="error" id="errorText" hidden></p>
  </section>

  <section class="panel" id="resultPanel" hidden>
    <div class="meta" id="resultMeta"></div>
    <div class="agents" id="resultAgents"></div>
    <div class="output-header">
      <p class="swarm-desc">Generated output</p>
      <button class="secondary" id="copyOutputButton" type="button">Copy</button>
    </div>
    <div class="output" id="resultOutput"></div>
  </section>
</main>

<script>
(function () {
  var apiKeyInput = document.getElementById('apiKey');
  var swarmSelect = document.getElementById('swarmSelect');
  var swarmDesc = document.getElementById('swarmDesc');
  var promptInput = document.getElementById('promptInput');
  var runButton = document.getElementById('runButton');
  var statusLine = document.getElementById('statusLine');
  var statusText = document.getElementById('statusText');
  var errorText = document.getElementById('errorText');
  var resultPanel = document.getElementById('resultPanel');
  var resultMeta = document.getElementById('resultMeta');
  var resultAgents = document.getElementById('resultAgents');
  var resultOutput = document.getElementById('resultOutput');
  var forgetKey = document.getElementById('forgetKey');
  var copyOutputButton = document.getElementById('copyOutputButton');

  var swarms = [];
  var pollTimer = null;
  var lastOutputText = '';

  try {
    var savedKey = localStorage.getItem('automode_anthropic_api_key');
    if (savedKey) apiKeyInput.value = savedKey;
  } catch (e) {}

  apiKeyInput.addEventListener('change', function () {
    try { localStorage.setItem('automode_anthropic_api_key', apiKeyInput.value); } catch (e) {}
  });
  forgetKey.addEventListener('click', function () {
    apiKeyInput.value = '';
    try { localStorage.removeItem('automode_anthropic_api_key'); } catch (e) {}
  });

  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Minimal, dependency-free markdown-ish renderer for swarm output —
  // headers, bold/italic, inline code, hr, lists, GFM tables, and
  // paragraphs. Good enough for the structured markdown agents produce;
  // not a full markdown parser.
  function renderMarkdown(markdown) {
    var lines = markdown.split(/\\r?\\n/);
    var html = '';
    var paragraph = [];
    var listItems = [];
    var listTag = null;

    function flushParagraph() {
      if (paragraph.length) {
        html += '<p>' + paragraph.join('<br>') + '</p>';
        paragraph = [];
      }
    }
    function flushList() {
      if (listItems.length) {
        html += '<' + listTag + '>' + listItems.map(function (item) {
          return '<li>' + inline(item) + '</li>';
        }).join('') + '</' + listTag + '>';
        listItems = [];
        listTag = null;
      }
    }
    function flushAll() {
      flushParagraph();
      flushList();
    }
    function inline(text) {
      text = escapeHtml(text);
      text = text.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      text = text.replace(/\`(.+?)\`/g, '<code>$1</code>');
      return text;
    }
    function isTableRow(line) {
      return /^\\s*\\|.*\\|\\s*$/.test(line);
    }
    function isTableSeparator(line) {
      return /^\\s*\\|?\\s*:?-+:?\\s*(\\|\\s*:?-+:?\\s*)+\\|?\\s*$/.test(line);
    }
    function splitTableRow(line) {
      var trimmed = line.trim();
      if (trimmed.charAt(0) === '|') trimmed = trimmed.slice(1);
      if (trimmed.charAt(trimmed.length - 1) === '|') trimmed = trimmed.slice(0, -1);
      return trimmed.split('|').map(function (cell) { return cell.trim(); });
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        flushAll();
        var headerCells = splitTableRow(line);
        var bodyRows = [];
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) {
          bodyRows.push(splitTableRow(lines[i]));
          i++;
        }
        i--;
        html += '<table><thead><tr>' + headerCells.map(function (cell) {
          return '<th>' + inline(cell) + '</th>';
        }).join('') + '</tr></thead><tbody>' + bodyRows.map(function (row) {
          return '<tr>' + row.map(function (cell) { return '<td>' + inline(cell) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table>';
        continue;
      }

      if (/^---+$/.test(line.trim())) { flushAll(); html += '<hr>'; continue; }

      var h3 = line.match(/^###\\s+(.*)/);
      if (h3) { flushAll(); html += '<h3>' + inline(h3[1]) + '</h3>'; continue; }
      var h2 = line.match(/^##\\s+(.*)/);
      if (h2) { flushAll(); html += '<h2>' + inline(h2[1]) + '</h2>'; continue; }
      var h1 = line.match(/^#\\s+(.*)/);
      if (h1) { flushAll(); html += '<h2>' + inline(h1[1]) + '</h2>'; continue; }

      var ulItem = line.match(/^\\s*[-*]\\s+(.*)/);
      var olItem = line.match(/^\\s*\\d+\\.\\s+(.*)/);
      if (ulItem || olItem) {
        var tag = ulItem ? 'ul' : 'ol';
        if (listTag && listTag !== tag) flushList();
        listTag = tag;
        listItems.push((ulItem || olItem)[1]);
        continue;
      }
      flushList();

      if (line.trim() === '') { flushParagraph(); continue; }
      paragraph.push(inline(line));
    }
    flushAll();
    return html;
  }

  function loadSwarms() {
    return fetch('/swarms')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        swarms = data.swarms || [];
        swarmSelect.innerHTML = swarms.map(function (s) {
          return '<option value="' + s.key + '">' + s.name + '</option>';
        }).join('');
        updateSwarmDesc();
      })
      .catch(function () {
        swarmDesc.textContent = 'Could not load the swarm list.';
      });
  }

  function updateSwarmDesc() {
    var selected = swarms.find(function (s) { return s.key === swarmSelect.value; });
    swarmDesc.textContent = selected ? (selected.description + ' (' + selected.agents + ' agents, ' + selected.phases + ' phases)') : '';
  }
  swarmSelect.addEventListener('change', updateSwarmDesc);

  function setRunning(running, label) {
    runButton.disabled = running;
    statusLine.hidden = !running;
    statusText.textContent = label || '';
  }

  function showError(message) {
    errorText.hidden = false;
    errorText.textContent = message;
  }
  function clearError() {
    errorText.hidden = true;
    errorText.textContent = '';
  }

  function renderResult(job) {
    resultPanel.hidden = false;
    var result = job.result;
    var durationS = ((job.finishedAt - job.startedAt) / 1000).toFixed(1);
    resultMeta.innerHTML =
      '<span>Duration: <strong>' + durationS + 's</strong></span>' +
      '<span>Tokens: <strong>' + result.totalTokens.input + ' in / ' + result.totalTokens.output + ' out</strong></span>' +
      '<span>Estimated cost: <strong>$' + result.estimatedCost.total.toFixed(4) + '</strong></span>';

    resultAgents.innerHTML = result.agents.map(function (a) {
      var tokens = a.usage.inputTokens + '+' + a.usage.outputTokens;
      var status = a.error ? ' — failed: ' + escapeHtml(a.error) : '';
      return '<div class="agent-row"><span><strong>' + escapeHtml(a.agentName) + '</strong> · ' + escapeHtml(a.phaseName) + status + '</span><span>' + tokens + ' tok · ' + a.durationMs + 'ms</span></div>';
    }).join('');

    resultOutput.innerHTML = renderMarkdown(result.output || '');
    lastOutputText = result.output || '';
  }

  function copyToClipboard(text) {
    function onCopied() {
      var original = copyOutputButton.textContent;
      copyOutputButton.textContent = 'Copied!';
      setTimeout(function () { copyOutputButton.textContent = original; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onCopied).catch(function () { fallbackCopy(text, onCopied); });
    } else {
      fallbackCopy(text, onCopied);
    }
  }

  function fallbackCopy(text, onCopied) {
    try {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      onCopied();
    } catch (e) {}
  }

  copyOutputButton.addEventListener('click', function () {
    if (lastOutputText) copyToClipboard(lastOutputText);
  });

  function poll(jobId) {
    fetch('/jobs/' + jobId)
      .then(function (r) {
        if (!r.ok) throw new Error('Status check failed (' + r.status + ').');
        return r.json();
      })
      .then(function (job) {
        if (job.status === 'running') {
          var elapsed = ((Date.now() - job.startedAt) / 1000).toFixed(0);
          setRunning(true, 'Running… (' + elapsed + 's elapsed, longer swarms can take several minutes)');
          pollTimer = setTimeout(function () { poll(jobId); }, 3000);
          return;
        }
        setRunning(false);
        if (job.status === 'completed') {
          renderResult(job);
        } else {
          showError(job.error || 'The swarm run failed.');
        }
      })
      .catch(function (err) {
        setRunning(false);
        showError(err.message);
      });
  }

  runButton.addEventListener('click', function () {
    clearError();
    resultPanel.hidden = true;
    var apiKey = apiKeyInput.value.trim();
    var input = promptInput.value.trim();
    if (!apiKey) { showError('Paste your Anthropic API key first — get one at console.anthropic.com.'); return; }
    if (apiKey.indexOf('sk-ant-') !== 0) { showError('That does not look like an Anthropic API key (should start with sk-ant-).'); return; }
    if (!input) { showError('Enter a prompt describing what you want the swarm to do.'); return; }

    setRunning(true, 'Starting…');
    fetch('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ swarm: swarmSelect.value, input: input, anthropicApiKey: apiKey }),
    })
      .then(function (r) {
        return r.json().then(function (body) {
          if (!r.ok) throw new Error(body.error || ('Request failed (' + r.status + ').'));
          return body;
        });
      })
      .then(function (body) {
        poll(body.jobId);
      })
      .catch(function (err) {
        setRunning(false);
        showError(err.message);
      });
  });

  loadSwarms();
})();
</script>
</body>
</html>
`;
