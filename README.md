# Project Milo

Milo is a local AI chat workspace. It streams replies, keeps conversations searchable in your browser, and lets you branch from an earlier message or regenerate a reply in a separate chat.

## Run on Windows

With Node.js 22 or later, run this from the Project Milo folder in PowerShell.

```powershell
npm start
```

Open [Milo](http://127.0.0.1:3000/). The app starts in demo mode with scripted replies when no key is configured. It has no package dependencies.

## Enable model-generated replies

```powershell
Copy-Item .env.example .env
notepad .env
```

Set `OPENAI_API_KEY` in `.env`, save the file, and restart with `npm start`. The default model is `gpt-5.6-terra`. Set `OPENAI_MODEL` to use another Responses API model available to your account. Research requires a model that supports the web search tool. OpenAI API usage is billed to the API account. [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-terra)

## Use the workspace

- **Chat** handles everyday tasks. **Deep think** increases reasoning effort on supported models. **Research** enables web search and adds clickable citations. [OpenAI web search documentation](https://developers.openai.com/api/docs/guides/tools-web-search)
- Attach or drop up to three UTF-8 text files per message, including CSV, Markdown, JSON, and source code. Each file can contain up to 24,000 characters.
- Press **Enter** to send, **Shift+Enter** for a new line, **Alt+N** for a new chat, and **Alt+K** to search saved chats. Use the conversation menu to rename, export to Markdown, or delete a chat.

The server listens only on `127.0.0.1`. The API key stays on the server. Your browser stores transcripts and attachment contents, and the backend sends recent context to OpenAI when the API key is configured. Older turns remain visible in the transcript as they fall out of the model’s context window. Clearing this site's browser storage removes its chat history.
