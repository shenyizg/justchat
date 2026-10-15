# JustChat

A minimal chat client for large language models, in a single HTML file.

No build step, no dependencies, no backend. Open `index.html` in a browser, add an API endpoint, and chat. Conversations and settings stay in that browser.

[简体中文](README.zh-CN.md)

## Features

- **Two API formats**: OpenAI-compatible Chat Completions (OpenAI, DeepSeek, OpenRouter, Ollama, vLLM, LM Studio, …) and the Anthropic Messages API (including Anthropic-compatible endpoints).
- **Streaming** replies with a stop button.
- **Reasoning display** for `reasoning_content` / `reasoning` fields, `<think>` tags, and Anthropic thinking blocks.
- **Markdown**: tables, task lists, code blocks with syntax highlighting and copy buttons. Math is shown as TeX source.
- **Image input** by picking, pasting, or dropping files (for vision models).
- **Per-chat settings**: system prompt, temperature, top P, max tokens, context length, reasoning effort, streaming.
- Edit, regenerate, copy, or delete messages. Rename, search, and delete chats.
- Light and dark themes, English and Chinese UI, works on phones (Add to Home Screen).
- Local storage only (IndexedDB), with JSON export and import.

## Getting started

1. Get `index.html`. Either open it directly (`file://`) or put it on any static host (Nginx, GitHub Pages, object storage, …).
2. Click **Add provider** and fill in the base URL, API key, and model IDs (or press **Fetch list** to load them from the server).
3. Pick a model in the top bar and start typing.

Every browser and device keeps its own chats and settings, so the same file can be opened from several devices without them interfering.

### Base URLs

| Service | API format | Base URL |
| --- | --- | --- |
| OpenAI | OpenAI compatible | `https://api.openai.com/v1` |
| Anthropic | Anthropic | `https://api.anthropic.com` |
| DeepSeek | OpenAI compatible | `https://api.deepseek.com` |
| OpenRouter | OpenAI compatible | `https://openrouter.ai/api/v1` |
| Google Gemini | OpenAI compatible | `https://generativelanguage.googleapis.com/v1beta/openai` |
| Ollama | OpenAI compatible | `http://localhost:11434/v1` |
| vLLM, SGLang, llama.cpp, LM Studio | OpenAI compatible | `http://<host>:<port>/v1` |

How the request URL is built (the provider dialog shows the result):

- **OpenAI compatible**: `<base>/chat/completions`. If the base URL is only a host, `/v1` is added.
- **Anthropic**: `<base>/v1/messages`. A base URL that already ends in `/v1` is used as is.
- A full endpoint URL also works, and a query string such as `?api-version=…` is kept.

## Settings

### Chat settings

Open them with the sliders icon in the top bar. They apply to the current chat; **Save as default** also uses them for new chats. The model picked in the top bar becomes the default for new chats too.

Blank fields are not sent, so the provider's own default applies.

| Setting | OpenAI compatible | Anthropic |
| --- | --- | --- |
| System prompt | first `system` message | `system` |
| Temperature / Top P | `temperature` / `top_p` | `temperature` / `top_p` |
| Max tokens | `max_tokens` (`max_completion_tokens` for api.openai.com) | `max_tokens`, 8192 when blank (the API requires it) |
| Reasoning effort | `reasoning_effort` | `thinking: {"type": "adaptive", "display": "summarized"}` and `output_config.effort` |
| Context messages | how many recent messages are sent; blank sends the whole chat | same |
| Stream output | `stream` | `stream` |

Some newer models reject sampling parameters such as `temperature`. Leave those fields blank for them. Earlier replies are sent back as plain text, without their reasoning.

### Provider options

Under **Advanced** in the provider dialog:

- **Extra headers (JSON)** are added to every request, for example `{"api-key": "…"}` for gateways that don't use `Authorization: Bearer`.
- **Extra body parameters (JSON)** are merged into every request body. Examples:
  - `{"top_k": 20, "repetition_penalty": 1.05}` for self-hosted servers
  - `{"chat_template_kwargs": {"enable_thinking": false}}` to turn off thinking on some vLLM/SGLang models
  - `{"stream_options": {"include_usage": true}}` to get token counts from OpenAI-compatible streams
  - `{"thinking": {"type": "enabled", "budget_tokens": 4096}}` for Anthropic-compatible servers that use thinking budgets

## CORS and self-hosted APIs

The browser talks to the API directly, so the API must allow cross-origin requests (CORS). If requests fail with a network error, check:

- **CORS headers.** For Ollama, set `OLLAMA_ORIGINS="*"`. For a server behind Nginx, something like:

  ```nginx
  location / {
      if ($request_method = OPTIONS) {
          add_header Access-Control-Allow-Origin "*" always;
          add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
          add_header Access-Control-Allow-Headers $http_access_control_request_headers always;
          add_header Access-Control-Max-Age 86400 always;
          return 204;
      }
      proxy_hide_header Access-Control-Allow-Origin;   # avoid duplicates if the upstream sets it
      add_header Access-Control-Allow-Origin "*" always;

      proxy_pass http://127.0.0.1:8000;
      proxy_http_version 1.1;
      proxy_buffering off;        # pass streamed tokens through right away
      proxy_read_timeout 600s;    # allow long generations
  }
  ```

  CORS is not access control: the API key is what protects the endpoint. A page opened from `file://` sends `Origin: null`.
- **Mixed content.** A page served over HTTPS cannot call an `http://` API. Serve both over HTTPS, or open the file locally.

## Data and privacy

- Chats and settings, including API keys, are stored in the browser's IndexedDB for the page's origin. Other pages on the same origin could read them, so host JustChat on its own domain or subdomain.
- The app makes no requests except to the APIs you configure. Images in model replies (Markdown `![]()`) are loaded from their URLs.
- **Export** writes everything to a JSON file (API keys included). **Import** replaces settings and merges chats.
- Browsers may clear site data for sites that haven't been used for a while, Safari in particular. Export from time to time; on iOS, adding the page to the Home Screen also helps.

## Keyboard

| Key | Action |
| --- | --- |
| Enter | Send (Shift+Enter for a new line). On touch screens Enter adds a new line. |
| Ctrl/⌘ + Enter | Send. Can be made the only send key in Settings. |
| Esc | Stop generating |
| Ctrl/⌘ + Enter, Esc | Save or cancel while editing a message |

## Development

Everything lives in `index.html`: the styles, the markup, and one script split into sections (utilities, i18n, storage, Markdown, API, UI). There is nothing to build or install. Edit the file and reload.

To add a UI language, add an entry to the `I18N` object and an option to the Language select.

## License

[MIT](LICENSE)
