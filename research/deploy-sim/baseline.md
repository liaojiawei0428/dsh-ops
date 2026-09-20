# T3 基线采集 — 开发机（参照机）部署指纹

- 采集时间：2026-09-19 (session T3)
- 采集方式：只读；每条命令原文与输出见下

## 字段表

| 字段 | 值 |
|---|---|
| dsh_version | `"0.1.6-alpha.2"` |
| bundles_count | `15` |
| link_count | `13` |
| patches_count | `24` |
| restore_count | `7` |
| settings_count | `10` |
| settings_sections | ui-onboarding, agent-default-model, agent-presets, permission, ui-theme, llm-pi-ai, ui-conversation, shell, subagent-model-selection, llm-deepseek |
| plugins_on_disk | dsh-bug-log, dsh-computer-use, dsh-deepseek-balance, dsh-github-push, dsh-locale-language, dsh-opencode-session-id, dsh-personal-bar, dsh-personal-hub, dsh-plugin-guide, dsh-restart-resume, dsh-server-ssh, dsh-tool-python |
| plugin_copy_keys | @deepseek-ai/dsh-acp-app, @deepseek-ai/dsh-base, @deepseek-ai/dsh-headless, @deepseek-ai/dsh-sdk-app, @deepseek-ai/dsh-sdk-minimal, @deepseek-ai/dsh-web-app, dsh-bug-log, dsh-computer-use, dsh-deepseek-balance, dsh-github-push, dsh-locale-language, dsh-personal-bar, dsh-personal-hub, dsh-plugin-guide, dsh-restart-resume, dsh-server-ssh, dsh-tool-python |
| official_ref_declared | `"dsh-v0.1.6-alpha.2"` |
| official_checkout | describe=`dsh-v0.1.6-alpha.2` head=`ddefc45fbc` |
| repo_head | `"3664f90d819a4c2c983403c66afc2d6088523d8b"` |
| repo_origin_main | `"3664f90d819a4c2c983403c66afc2d6088523d8b"` |
| node_version | `"v24.16.0"` |
| pnpm_version | `"11.22.0"` |
| gate_validate_plugins | exit=0 末行：validate-plugins: all 11 active linked plugin(s) safe to load |
| gate_check_plugin_copy | exit=0 末行：check-plugin-copy: 全部 bundle 均有中文名 OK |
| gate_test_standard | exit=0 末行：test-standard: all 5 checks hold |
| health_check_last_line | `HEALTH: 全绿` |

## 命令与原始输出

### `node E:\DSH\DSH-ops\Deepseek_DSH\apps\cli\lib\bin.js --version`
```
0.1.6-alpha.2 (exit 0)
```

### `git -C E:\DSH\Deepseek_DSH describe --tags --exact-match`
```
dsh-v0.1.6-alpha.2 (exit 0)
```

### `git -C E:\DSH\Deepseek_DSH rev-parse --short HEAD`
```
ddefc45fbc (exit 0)
```

### `git -C E:\DSH\DSH-ops rev-parse HEAD`
```
3664f90d819a4c2c983403c66afc2d6088523d8b (exit 0)
```

### `git -C E:\DSH\DSH-ops rev-parse origin/main`
```
3664f90d819a4c2c983403c66afc2d6088523d8b (exit 0)
```

### `node -v`
```
v24.16.0
```

### `pnpm -v`
```
11.22.0
```

### 读文件类（python 解析）

- `C:\Users\Administrator\.dsh\profiles\web\package.json` → dsh.profile.bundles（15）、dependencies 中 link: 前缀键（13，原样见 JSON）
- `E:\DSH\DSH-ops\official-patches\apply-patches.mjs` → `\bfile:\s*['"]` 命中 24；`restore` 数组顶层对象 7 个
- `C:\Users\Administrator\.dsh\settings.yaml` → 顶层键 10（见 settings_sections）
- `E:\DSH\DSH-ops\plugins\` 目录名 12（见 plugins_on_disk）
- `E:\DSH\DSH-ops\plugins\dsh-plugin-guide\client.js` → BUNDLE_COPY 键 17（见 plugin_copy_keys）
- `E:\DSH\DSH-ops\official-patches\official-ref.txt` → 首个非注释行 `dsh-v0.1.6-alpha.2`

### 闸门

`node E:\DSH\DSH-ops\validate-plugins.mjs` → exit 0
末行：`validate-plugins: all 11 active linked plugin(s) safe to load`

`node E:\DSH\DSH-ops\check-plugin-copy.mjs` → exit 0
末行：`check-plugin-copy: 全部 bundle 均有中文名 OK`

`node E:\DSH\DSH-ops\test-standard.mjs` → exit 0
末行：`test-standard: all 5 checks hold`
- PASS  T1: scaffold passes pre-flight gate
-       PASS dsh-test-scaffold: loads, apply() registers [(no tools)], schemas valid
- PASS  T2: property-level required is rejected with the violation named
-       FAIL dsh-test-bad-schema: apply() threw during registration: tool "badtool": unsupported JSON schema: schema.properties.kind.required is not supported on type "string"; schema.required must be an array of strings
- PASS  T3: broken client entry is rejected at parse
-       FAIL dsh-test-bad-client: client entry ./client.js fails to parse: C:\Users\ADMINI~1\AppData\Local\Temp\dsh-standard-test-6CuY1d\plugins\dsh-test-bad-client\client.js:3
- PASS  T4: disable removes the bundle entry and reports recovery
- PASS  T5: deploy-chain hygiene (10 .ps1 keep BOM, 3 .cmd/.bat pure ASCII)

### 体检

`& E:\DSH\DSH-ops\health-check.cmd` 末行：`HEALTH: 全绿`
