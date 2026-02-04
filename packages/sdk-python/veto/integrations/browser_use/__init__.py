"""
Veto integration for browser-use — AI browser automation with guardrails.

Provides a single function that returns a browser-use ``Tools`` instance
where every browser action is validated through Veto before execution.

Quick start::

    from veto import Veto, VetoOptions
    from veto.integrations.browser_use import wrap_browser_use
    from browser_use import Agent, BrowserSession
    from langchain_google_genai import ChatGoogleGenerativeAI

    veto = await Veto.init(VetoOptions(api_key="..."))
    tools = await wrap_browser_use(veto)

    agent = Agent(
        task="Search DuckDuckGo for 'best laptops 2025'",
        llm=ChatGoogleGenerativeAI(model="gemini-2.0-flash"),
        tools=tools,
        browser_session=BrowserSession(),
    )
    await agent.run()
"""

from veto.integrations.browser_use.integration import wrap_browser_use

__all__ = ["wrap_browser_use"]
