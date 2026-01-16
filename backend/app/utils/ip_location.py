import httpx

async def lookup_location(ip: str | None, provider: str) -> str | None:
    if not ip or provider == "none":
        return None

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            if provider == "ipapi":
                # ipapi.co/<ip>/json
                r = await client.get(f"https://ipapi.co/{ip}/json/")
                data = r.json()
                return data.get("country_name") or data.get("country") or data.get("city")
            if provider == "ip-api":
                # ip-api.com/json/<ip>
                r = await client.get(f"http://ip-api.com/json/{ip}")
                data = r.json()
                return data.get("country") or data.get("city")
    except Exception:
        return None

    return None
