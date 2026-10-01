<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>dding-sound 说明 / Docs</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
      max-width: 840px;
      margin: 32px auto;
      padding: 0 24px 64px;
      line-height: 1.65;
      color: #1d1d1f;
    }
    h1 { margin-bottom: 4px; }
    h2 { margin-top: 32px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    .switch { margin: 20px 0; display: flex; gap: 10px; }
    .switch a {
      display: inline-block;
      padding: 7px 22px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      border: 1px solid transparent;
      transition: background .15s, color .15s;
    }
    .switch a.active { background: #2563eb; color: #fff; }
    .switch a:not(.active) { background: #eef0f2; color: #444; border-color: #ddd; }
    .switch a:hover { opacity: .85; }
    .panel { display: none; }
    .panel.active { display: block; animation: fade .2s ease; }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre { background: #f5f5f7; padding: 14px 16px; border-radius: 8px; overflow-x: auto; border: 1px solid #eee; }
    pre code { background: none; padding: 0; font-size: 13px; }
    code { background: #f5f5f7; padding: 2px 6px; border-radius: 4px; font-size: 90%; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    th, td { border: 1px solid #ddd; padding: 7px 12px; text-align: left; font-size: 14px; }
    th { background: #fafafa; }
    tr:nth-child(even) td { background: #fcfcfd; }
    img { display: block; margin: 14px 0; }
    ul { padding-left: 20px; }
    li { margin: 4px 0; }
    a { color: #2563eb; }
  </style>
</head>
<body>
  <h1>dding-sound</h1>
  <img src="dding-icon-256.png" width="96" alt="dding">

  <div class="switch">
    <a id="tab-zh" class="active" href="#" data-lang="zh">简体中文</a>
    <a id="tab-en" href="#" data-lang="en">English</a>
  </div>

  <!-- ===================== 中文 ===================== -->
  <div class="panel active" id="panel-zh">
    <p>给 Kilo 一张嘴：你盯着屏幕发呆时，它出声喊你。</p>

    <h2>功能</h2>
    <ul>
      <li>需要你决策（<code>question</code> 弹选项）→ 三声急促双音 ✅ 默认开</li>
      <li>任务完成 → 最终幻想式胜利号角，约 2.45 秒 ✅ 默认开</li>
      <li>出错 → 下行小调 ✅ 默认开</li>
      <li>权限请求 → 两声（默认关，太吵）</li>
      <li>开始干活 → 柔和 blip（默认关）</li>
    </ul>
    <p>声音由插件<strong>实时合成</strong>（纯 Node 写 WAV），无音频素材、无 npm 依赖，改参数即时生效。</p>

    <h2>安装</h2>
    <p>从 GitHub 下载解压后，运行：</p>
    <pre><code>./install.sh</code></pre>
    <p>即可把插件复制到 <code>~/.config/kilo/plugin/dding-sound.js</code>，并生成配置模板
    <code>~/.config/kilo/dding.json</code>。安装后<strong>重启 Kilo</strong>（VSCodium 里 <code>Developer: Reload Window</code>）。</p>
    <p>安装完成后可<strong>安全删除源文件</strong>——插件已独立复制，不再依赖原仓库。</p>

    <h2>开发模式</h2>
    <p>改代码即时生效，不复制：</p>
    <pre><code>./install.sh --link</code></pre>

    <h2>卸载</h2>
    <pre><code>./install.sh --uninstall</code></pre>

    <h2>试听</h2>
    <pre><code>npm run preview          # 依次放完所有音色
node scripts/preview.mjs done --wav --out /tmp/done.wav   # 导出 wav 自己听</code></pre>

    <h2>配置</h2>
    <p>编辑 <code>~/.config/kilo/dding.json</code>（支持注释和尾逗号，改完重启 Kilo）：</p>
    <table>
      <thead><tr><th>键</th><th>默认</th><th>说明</th></tr></thead>
      <tbody>
        <tr><td><code>enabled</code></td><td><code>true</code></td><td>总开关</td></tr>
        <tr><td><code>volume</code></td><td><code>0.55</code></td><td>0.0 ~ 1.0</td></tr>
        <tr><td><code>decision.repeats</code></td><td><code>3</code></td><td>决策提示重复次数</td></tr>
        <tr><td><code>permission.enabled</code></td><td><code>false</code></td><td>授权提示音（默认关）</td></tr>
        <tr><td><code>permissionImportantOnly</code></td><td><code>true</code></td><td>只对高风险操作响</td></tr>
        <tr><td><code>done.cooldownMs</code></td><td><code>20000</code></td><td>同会话最短间隔</td></tr>
        <tr><td><code>done.graceMs</code></td><td><code>2500</code></td><td>收工后要持续空闲这么久才算完成</td></tr>
        <tr><td><code>error.cooldownMs</code></td><td><code>20000</code></td><td>错误提示冷却</td></tr>
        <tr><td><code>start.enabled</code></td><td><code>false</code></td><td>开工提示（默认关）</td></tr>
        <tr><td><code>startupChime</code></td><td><code>true</code></td><td>启动自检</td></tr>
        <tr><td><code>watchdog.enabled</code></td><td><code>true</code></td><td>无 <code>session.status</code> 时兜底判定</td></tr>
        <tr><td><code>currentProjectOnly</code></td><td><code>true</code></td><td>只对本项目会话发声</td></tr>
        <tr><td><code>mainSessionsOnly</code></td><td><code>true</code></td><td>屏蔽子代理 / Agent Manager 会话</td></tr>
        <tr><td><code>player</code></td><td><code>"auto"</code></td><td>强制指定 paplay / pw-play / ffplay / aplay</td></tr>
        <tr><td><code>debug</code></td><td><code>false</code></td><td>日志写 <code>~/.config/kilo/dding.log</code>（512KB 上限）</td></tr>
        <tr><td><code>tts.enabled</code></td><td><code>false</code></td><td>语音朗读，需 <code>sudo apt install espeak-ng</code></td></tr>
      </tbody>
    </table>

    <h2>要求</h2>
    <ul>
      <li>Node ≥ 20（Kilo 实际用 bun，插件本身无依赖）</li>
      <li>音频播放器任选其一：<code>paplay</code> / <code>pw-play</code> / <code>ffplay</code> / <code>aplay</code><br>
          自动判断 PulseAudio / PipeWire，找不到时静默降级，不拖累 Kilo。</li>
    </ul>
  </div>

  <!-- ===================== English ===================== -->
  <div class="panel" id="panel-en">
    <p>Give Kilo a mouth: when you're staring blankly at the screen, it speaks up and nudges you.</p>

    <h2>Features</h2>
    <ul>
      <li>When you need to decide (<code>question</code> pops options) → three quick double beeps ✅ on by default</li>
      <li>Task done → a Final Fantasy-style victory fanfare, ~2.45s ✅ on by default</li>
      <li>An error occurred → descending minor tune ✅ on by default</li>
      <li>A permission is requested → two beeps (off by default, too noisy)</li>
      <li>Work begins → a soft blip (off by default)</li>
    </ul>
    <p>The sounds are <strong>synthesized in real time</strong> by the plugin (plain Node writing WAV), so there are no audio assets and no npm dependencies; changing parameters takes effect immediately.</p>

    <h2>Install</h2>
    <p>After downloading and extracting from GitHub, run:</p>
    <pre><code>./install.sh</code></pre>
    <p>This copies the plugin to <code>~/.config/kilo/plugin/dding-sound.js</code> and generates a config template at
    <code>~/.config/kilo/dding.json</code>. <strong>Restart Kilo</strong> afterward (<code>Developer: Reload Window</code> in VSCodium).</p>
    <p>Once installed, you can <strong>safely delete the source files</strong> — the plugin is copied independently and no longer depends on the original repo.</p>

    <h2>Development mode</h2>
    <p>Edits take effect immediately, no copying:</p>
    <pre><code>./install.sh --link</code></pre>

    <h2>Uninstall</h2>
    <pre><code>./install.sh --uninstall</code></pre>

    <h2>Preview sounds</h2>
    <pre><code>npm run preview          # plays all sound styles in turn
node scripts/preview.mjs done --wav --out /tmp/done.wav   # export a wav to listen to on your own</code></pre>

    <h2>Configuration</h2>
    <p>Edit <code>~/.config/kilo/dding.json</code> (comments and trailing commas supported; restart Kilo after changing):</p>
    <table>
      <thead><tr><th>key</th><th>default</th><th>description</th></tr></thead>
      <tbody>
        <tr><td><code>enabled</code></td><td><code>true</code></td><td>master switch</td></tr>
        <tr><td><code>volume</code></td><td><code>0.55</code></td><td>0.0 ~ 1.0</td></tr>
        <tr><td><code>decision.repeats</code></td><td><code>3</code></td><td>how many times to repeat the decision prompt</td></tr>
        <tr><td><code>permission.enabled</code></td><td><code>false</code></td><td>permission-ask sound (off by default)</td></tr>
        <tr><td><code>permissionImportantOnly</code></td><td><code>true</code></td><td>only trigger for high-risk operations</td></tr>
        <tr><td><code>done.cooldownMs</code></td><td><code>20000</code></td><td>minimum gap within the same session</td></tr>
        <tr><td><code>done.graceMs</code></td><td><code>2500</code></td><td>must stay idle this long after finishing to count as done</td></tr>
        <tr><td><code>error.cooldownMs</code></td><td><code>20000</code></td><td>error-prompt cooldown</td></tr>
        <tr><td><code>start.enabled</code></td><td><code>false</code></td><td>work-begin prompt (off by default)</td></tr>
        <tr><td><code>startupChime</code></td><td><code>true</code></td><td>startup self-check</td></tr>
        <tr><td><code>watchdog.enabled</code></td><td><code>true</code></td><td>fallback judgment when there's no <code>session.status</code></td></tr>
        <tr><td><code>currentProjectOnly</code></td><td><code>true</code></td><td>only speak for this project's sessions</td></tr>
        <tr><td><code>mainSessionsOnly</code></td><td><code>true</code></td><td>suppress subagent / Agent Manager sessions</td></tr>
        <tr><td><code>player</code></td><td><code>"auto"</code></td><td>force a specific paplay / pw-play / ffplay / aplay</td></tr>
        <tr><td><code>debug</code></td><td><code>false</code></td><td>log to <code>~/.config/kilo/dding.log</code> (512KB cap)</td></tr>
        <tr><td><code>tts.enabled</code></td><td><code>false</code></td><td>text-to-speech narration, needs <code>sudo apt install espeak-ng</code></td></tr>
      </tbody>
    </table>

    <h2>Requirements</h2>
    <ul>
      <li>Node ≥ 20 (Kilo actually uses bun; the plugin itself has no dependencies)</li>
      <li>Any one audio player: <code>paplay</code> / <code>pw-play</code> / <code>ffplay</code> / <code>aplay</code><br>
          Auto-detects PulseAudio / PipeWire and silently degrades if none is found, without slowing Kilo down.</li>
    </ul>
  </div>

  <script>
    (function () {
      var tabs = document.querySelectorAll('.switch a');
      var panels = document.querySelectorAll('.panel');
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function (e) {
          e.preventDefault();
          var lang = tab.getAttribute('data-lang');
          tabs.forEach(function (t) { t.classList.remove('active'); });
          panels.forEach(function (p) { p.classList.remove('active'); });
          tab.classList.add('active');
          document.getElementById('panel-' + lang).classList.add('active');
          try { localStorage.setItem('dding-readme-lang', lang); } catch (__) {}
        });
      });
      // Restore previous choice
      try {
        var saved = localStorage.getItem('dding-readme-lang');
        if (saved && saved !== 'zh') {
          document.getElementById('tab-' + saved).click();
        }
      } catch (__) {}
    })();
  </script>
</body>
</html>
