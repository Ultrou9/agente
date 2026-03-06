# Design: Web Search & Weather Integration (Tavily)

Date: 2026-03-06
Status: Approved

## Overview
Give OpenGravity "eyes" on the live web to provide real-time information, including current weather, news, and general knowledge.

## Proposed Design: Unified Search Tool
We will implement a single, versatile tool `search_web` powered by the Tavily API. This tool will handle both general search queries and specific weather requests by leveraging Tavily's ability to extract and summarize real-time data.

### Architecture 🏗️
- **Tool Module:** `src/tools/search.ts`
- **Logic:** `search_web(query: string)`
- **Integration:** Registered in `src/agent/loop.ts`.
- **Config:** `TAVILY_API_KEY` in `.env`.

### Data Flow ⚙️⛓️
1. **Trigger:** LLM identifies a need for real-time data and calls `search_web` with a specific query.
2. **Request:** The tool sends a POST request to `https://api.tavily.com/search` with the query and `search_depth: "smart"`.
3. **Response:** Tavily returns a list of results with titles, snippets, and URLs.
4. **Processing:** The tool formats the top results into a clean string for the LLM.
5. **Final Output:** The LLM interprets the results and provides a natural language answer to the user.

### Error Handling 🛡️
- **Network Issues:** If the API is unreachable, the tool returns a clear error message.
- **API Errors:** Invalid keys or rate limits are caught and logged.
- **No Results:** If Tavily yields nothing, the bot informs the user it couldn't find relevant information.

## Trade-offs
- **Pros:** simple architecture, highly versatile, excellent weather data extraction without needing a separate weather API.
- **Cons:** Dependent on Tavily API availability and credits.

## Verification Plan
1. **Local Test:** Execute `search_web` with a test query (e.g., "clima en Madrid").
2. **Integration Test:** Ask the bot "hola, ¿cómo está el clima hoy en Medellín?" over Telegram.
3. **Cloud Verification:** Monitor Railway logs to ensure the API call succeeds in the production environment.
