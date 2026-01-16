from user_agents import parse

def parse_user_agent(ua: str | None):
    if not ua:
        return (None, None, None)
    u = parse(ua)
    device = "Mobile" if u.is_mobile else "Tablet" if u.is_tablet else "PC"
    browser = u.browser.family
    os = u.os.family
    return (device, browser, os)
