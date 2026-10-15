# JustChat

一个极简的大模型聊天客户端，只有一个 HTML 文件。

无需构建、没有依赖、不需要后端。用浏览器打开 `index.html`，添加 API 地址，就可以开始对话。对话记录和设置只保存在当前浏览器里。

[English](README.md)

## 功能

- **两种 API 格式**：OpenAI 兼容的 Chat Completions（OpenAI、DeepSeek、OpenRouter、Ollama、vLLM、LM Studio 等）和 Anthropic Messages API（包括 Anthropic 兼容接口）。
- **流式输出**，可随时停止。
- **显示推理过程**：支持 `reasoning_content` / `reasoning` 字段、`<think>` 标签以及 Anthropic 的 thinking 块。
- **Markdown 渲染**：表格、任务列表、带语法高亮和复制按钮的代码块。数学公式以 TeX 源码显示。
- **图片输入**：可选择、粘贴或拖入图片（用于视觉模型）。
- **每个对话独立设置**：系统提示词、温度、Top P、最大输出 Token、上下文消息数、推理强度、流式输出。
- 消息可编辑、重新生成、复制、删除；对话可重命名、搜索、删除。
- 浅色 / 深色主题，中英文界面，适配手机（可添加到主屏幕）。
- 数据只存在本地（IndexedDB），支持 JSON 导出和导入。

## 开始使用

1. 获取 `index.html`。可以直接打开（`file://`），也可以放到任意静态托管上（Nginx、GitHub Pages、对象存储等）。
2. 点击 **添加服务商**，填写 Base URL、API Key 和模型 ID（或点 **获取列表** 从服务器拉取）。
3. 在顶栏选择模型，开始输入。

每个浏览器、每台设备各自保存自己的对话和设置，多台设备访问同一个文件也互不干扰。

### Base URL 示例

| 服务 | API 格式 | Base URL |
| --- | --- | --- |
| OpenAI | OpenAI 兼容 | `https://api.openai.com/v1` |
| Anthropic | Anthropic | `https://api.anthropic.com` |
| DeepSeek | OpenAI 兼容 | `https://api.deepseek.com` |
| OpenRouter | OpenAI 兼容 | `https://openrouter.ai/api/v1` |
| Google Gemini | OpenAI 兼容 | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Ollama | OpenAI 兼容 | `http://localhost:11434/v1` |
| vLLM、SGLang、llama.cpp、LM Studio | OpenAI 兼容 | `http://<主机>:<端口>/v1` |

请求地址的拼接规则（服务商对话框里会显示最终地址）：

- **OpenAI 兼容**：`<base>/chat/completions`。如果 Base URL 只有主机部分，会自动补上 `/v1`。
- **Anthropic**：`<base>/v1/messages`。Base URL 已经以 `/v1` 结尾时直接使用。
- 也可以直接填写完整的接口地址；`?api-version=…` 这类查询参数会被保留。

## 设置说明

### 对话设置

点击顶栏的滑块图标打开，作用于当前对话；点 **设为默认** 会同时用于之后的新对话。在顶栏选择的模型也会成为新对话的默认模型。

留空的字段不会发送，即使用服务商自己的默认值。

| 设置 | OpenAI 兼容 | Anthropic |
| --- | --- | --- |
| 系统提示词 | 第一条 `system` 消息 | `system` |
| 温度 / Top P | `temperature` / `top_p` | `temperature` / `top_p` |
| 最大输出 Token | `max_tokens`（api.openai.com 使用 `max_completion_tokens`） | `max_tokens`，留空时为 8192（该 API 要求必填） |
| 推理强度 | `reasoning_effort` | `thinking: {"type": "adaptive", "display": "summarized"}` 加 `output_config.effort` |
| 上下文消息数 | 每次请求附带的最近消息条数；留空则发送整个对话 | 同左 |
| 流式输出 | `stream` | `stream` |

部分较新的模型不接受 `temperature` 等采样参数，使用这些模型时请保持留空。之前的回复会以纯文本发回，不包含推理过程。

### 服务商高级选项

在服务商对话框的 **高级** 中：

- **额外请求头（JSON）**：添加到每个请求中，例如对不使用 `Authorization: Bearer` 的网关填写 `{"api-key": "…"}`。
- **额外请求参数（JSON）**：合并到每个请求体中。例如：
  - `{"top_k": 20, "repetition_penalty": 1.05}`：自部署服务的采样参数
  - `{"chat_template_kwargs": {"enable_thinking": false}}`：在部分 vLLM / SGLang 模型上关闭思考
  - `{"stream_options": {"include_usage": true}}`：让 OpenAI 兼容的流式接口返回 Token 用量
  - `{"thinking": {"type": "enabled", "budget_tokens": 4096}}`：用于使用思考预算的 Anthropic 兼容服务

## 跨域（CORS）与自部署接口

浏览器会直接请求 API，因此 API 必须允许跨域请求（CORS）。如果请求报网络错误，请检查：

- **CORS 响应头。** Ollama 可设置 `OLLAMA_ORIGINS="*"`。通过 Nginx 反向代理的服务可参考：

  ```nginx
  location / {
      if ($request_method = OPTIONS) {
          add_header Access-Control-Allow-Origin "*" always;
          add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
          add_header Access-Control-Allow-Headers $http_access_control_request_headers always;
          add_header Access-Control-Max-Age 86400 always;
          return 204;
      }
      proxy_hide_header Access-Control-Allow-Origin;   # 上游已设置时避免重复
      add_header Access-Control-Allow-Origin "*" always;

      proxy_pass http://127.0.0.1:8000;
      proxy_http_version 1.1;
      proxy_buffering off;        # 流式输出的内容立即转发
      proxy_read_timeout 600s;    # 允许较长的生成时间
  }
  ```

  CORS 并不是访问控制，真正保护接口的是 API Key。从 `file://` 打开的页面发出的请求头是 `Origin: null`。
- **混合内容。** 通过 HTTPS 打开的页面无法请求 `http://` 接口。请让两者都使用 HTTPS，或直接打开本地文件。

## 数据与隐私

- 对话和设置（包括 API Key）保存在浏览器的 IndexedDB 中，按页面来源（origin）隔离。同一来源下的其他页面也能读取这些数据，所以建议把 JustChat 放在单独的域名或子域名下。
- 除了你配置的 API，应用不会发出任何请求。模型回复中的图片（Markdown `![]()`）会从对应地址加载。
- **导出** 会把全部数据写入一个 JSON 文件（包含 API Key）。**导入** 会替换设置并合并对话。
- 浏览器可能会清除长时间未访问网站的数据，Safari 尤其如此。建议定期导出备份；在 iOS 上添加到主屏幕也有帮助。

## 快捷键

| 按键 | 作用 |
| --- | --- |
| Enter | 发送（Shift+Enter 换行）。触屏设备上 Enter 为换行。 |
| Ctrl/⌘ + Enter | 发送。可在设置中改为仅用此组合键发送。 |
| Esc | 停止生成 |
| Ctrl/⌘ + Enter、Esc | 编辑消息时保存或取消 |

## 开发

所有内容都在 `index.html` 里：样式、页面结构，以及按模块划分的一段脚本（工具函数、多语言、存储、Markdown、API、界面）。无需安装或构建，修改后刷新即可。

如需添加界面语言，在 `I18N` 对象中加一项，并在语言下拉框中加一个选项。

## 许可证

[MIT](LICENSE)
